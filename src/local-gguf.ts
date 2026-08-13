import { Wllama } from '@wllama/wllama';
import wasmUrl from '@wllama/wllama/esm/wasm/wllama.wasm?url';

export interface LocalGGUFStatus {
  ready: boolean;
  loading: boolean;
  generating: boolean;
  webGpuAvailable: boolean;
  modelName?: string;
  modelSize?: number;
  modelFiles: number;
  contextLength?: number;
}

export interface LocalGGUFLoadOptions {
  contextLength?: number;
  useGpu?: boolean;
  onProgress?: (message: string) => void;
}

export interface LocalGGUFGenerateOptions {
  maxTokens?: number;
  temperature?: number;
  onToken?: (token: string) => void;
}

export interface LocalGGUFMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LocalGGUFBridge {
  getStatus(): LocalGGUFStatus;
  load(files: File[], options?: LocalGGUFLoadOptions): Promise<LocalGGUFStatus>;
  generate(messages: LocalGGUFMessage[], options?: LocalGGUFGenerateOptions): Promise<string>;
  unload(): Promise<void>;
}

declare global {
  interface Window {
    LocalGGUF: LocalGGUFBridge;
  }
}

const MAX_SINGLE_FILE_BYTES = 2 * 1024 * 1024 * 1024;
const DEFAULT_CONTEXT_LENGTH = 2048;
const DEFAULT_MAX_TOKENS = 512;

type BrowserPerformanceMemory = Performance & {
  memory?: { jsHeapSizeLimit: number };
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function isGgufName(name: string): boolean {
  return /\.gguf(?:\.part\d+)?$/i.test(name) || /-\d{5}-of-\d{5}$/i.test(name);
}

async function hasGgufMagic(file: File): Promise<boolean> {
  const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return header.length === 4 && header[0] === 0x47 && header[1] === 0x47 && header[2] === 0x55 && header[3] === 0x46;
}

function sortFiles(files: File[]): File[] {
  return [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

function assertMemoryBudget(totalBytes: number, contextLength: number) {
  const memory = (performance as BrowserPerformanceMemory).memory;
  if (!memory?.jsHeapSizeLimit) return;

  // 모델 버퍼, KV 캐시, WASM 런타임 오버헤드를 보수적으로 추정합니다.
  const estimatedBytes = totalBytes * 1.35 + Math.max(192 * 1024 * 1024, contextLength * 128 * 1024);
  if (estimatedBytes > memory.jsHeapSizeLimit * 0.8) {
    throw new Error(
      `선택한 모델(${formatBytes(totalBytes)})은 현재 브라우저 메모리 한도에서 안전하게 실행하기 어렵습니다. 더 작은 양자화 모델 또는 더 짧은 컨텍스트를 사용하세요.`
    );
  }
}

class BrowserGGUFEngine implements LocalGGUFBridge {
  private runtime: Wllama | null = null;
  private status: LocalGGUFStatus = {
    ready: false,
    loading: false,
    generating: false,
    webGpuAvailable: typeof navigator !== 'undefined' && 'gpu' in navigator,
    modelFiles: 0,
  };

  getStatus(): LocalGGUFStatus {
    return { ...this.status };
  }

  async load(files: File[], options: LocalGGUFLoadOptions = {}): Promise<LocalGGUFStatus> {
    if (this.status.loading || this.status.generating) {
      throw new Error('현재 로컬 모델 작업이 진행 중입니다. 완료 후 다시 시도하세요.');
    }
    if (files.length === 0) throw new Error('GGUF 모델 파일을 선택하세요.');

    const sortedFiles = sortFiles(files);
    if (sortedFiles.some((file) => !isGgufName(file.name))) {
      throw new Error('GGUF 파일과 분할 GGUF 조각만 선택할 수 있습니다.');
    }
    if (sortedFiles.some((file) => file.size === 0)) {
      throw new Error('빈 모델 파일은 불러올 수 없습니다.');
    }
    if (sortedFiles.some((file) => file.size > MAX_SINGLE_FILE_BYTES)) {
      throw new Error('브라우저 환경에서는 개별 GGUF 파일이 2GB를 초과하면 불러올 수 없습니다. 모델을 분할하거나 더 작은 양자화 모델을 사용하세요.');
    }
    if (!(await hasGgufMagic(sortedFiles[0]))) {
      throw new Error('선택한 첫 파일이 유효한 GGUF 헤더를 포함하지 않습니다.');
    }

    const totalBytes = sortedFiles.reduce((sum, file) => sum + file.size, 0);
    const contextLength = Math.max(512, Math.min(options.contextLength ?? DEFAULT_CONTEXT_LENGTH, 8192));
    assertMemoryBudget(totalBytes, contextLength);

    this.status = { ...this.status, ready: false, loading: true, modelFiles: sortedFiles.length };
    options.onProgress?.('로컬 GGUF 런타임을 준비하는 중입니다…');

    try {
      await this.unloadRuntime();
      const runtime = new Wllama(
        { default: wasmUrl },
        { suppressNativeLog: true, allowOffline: true }
      );
      const webGpuAvailable = runtime.isSupportWebGPU();
      const params = {
        n_ctx: contextLength,
        jinja: true,
        n_threads: Math.max(1, Math.min(navigator.hardwareConcurrency || 2, 4)),
        ...(options.useGpu === false ? { n_gpu_layers: 0 } : {}),
      };

      options.onProgress?.(
        `${sortedFiles.length}개 파일(${formatBytes(totalBytes)})을 기기 메모리에 불러오는 중입니다…`
      );
      await runtime.loadModel(sortedFiles, params);
      this.runtime = runtime;
      this.status = {
        ready: true,
        loading: false,
        generating: false,
        webGpuAvailable,
        modelName: sortedFiles[0].name,
        modelSize: totalBytes,
        modelFiles: sortedFiles.length,
        contextLength,
      };
      options.onProgress?.(webGpuAvailable ? '로컬 모델이 준비되었습니다. WebGPU 가속을 사용할 수 있습니다.' : '로컬 모델이 준비되었습니다. CPU/WASM 모드로 실행됩니다.');
      return this.getStatus();
    } catch (error) {
      await this.unloadRuntime();
      this.status = {
        ready: false,
        loading: false,
        generating: false,
        webGpuAvailable: typeof navigator !== 'undefined' && 'gpu' in navigator,
        modelFiles: 0,
      };
      throw new Error(`GGUF 모델을 불러오지 못했습니다: ${errorMessage(error)}`);
    }
  }

  async generate(messages: LocalGGUFMessage[], options: LocalGGUFGenerateOptions = {}): Promise<string> {
    if (!this.runtime || !this.status.ready) throw new Error('먼저 로컬 GGUF 모델을 불러오세요.');
    if (this.status.generating) throw new Error('이미 로컬 응답을 생성하고 있습니다.');
    if (messages.length === 0) throw new Error('생성할 메시지가 없습니다.');

    this.status = { ...this.status, generating: true };
    let response = '';

    try {
      const stream = await this.runtime.createChatCompletion({
        messages,
        stream: true,
        max_tokens: Math.max(1, Math.min(options.maxTokens ?? DEFAULT_MAX_TOKENS, 2048)),
        temperature: Math.max(0, Math.min(options.temperature ?? 0.7, 2)),
      });
      for await (const chunk of stream) {
        const token = chunk.choices[0]?.delta?.content ?? '';
        if (!token) continue;
        response += token;
        options.onToken?.(token);
      }
      if (!response.trim()) throw new Error('모델이 빈 응답을 반환했습니다.');
      return response;
    } catch (error) {
      throw new Error(`로컬 모델 생성에 실패했습니다: ${errorMessage(error)}`);
    } finally {
      this.status = { ...this.status, generating: false };
    }
  }

  async unload(): Promise<void> {
    if (this.status.loading || this.status.generating) {
      throw new Error('진행 중인 로컬 작업이 끝난 후 모델을 해제하세요.');
    }
    await this.unloadRuntime();
    this.status = {
      ready: false,
      loading: false,
      generating: false,
      webGpuAvailable: typeof navigator !== 'undefined' && 'gpu' in navigator,
      modelFiles: 0,
    };
  }

  private async unloadRuntime(): Promise<void> {
    if (!this.runtime) return;
    try {
      await this.runtime.exit();
    } catch (error) {
      console.warn('로컬 GGUF 런타임을 해제하지 못했습니다:', error);
    } finally {
      this.runtime = null;
    }
  }
}

window.LocalGGUF = new BrowserGGUFEngine();
