/**
 * fileStorage.ts
 * localforage 기반 파일 영구 저장소
 * - 모든 파일을 Blob 그대로 저장 (base64 변환 없음 → 원본 바이너리 보존)
 * - IndexedDB 우선, 자동 폴백 지원
 * - 메시지 ID → 파일 ID 매핑으로 채팅에서 첨부 파일 복원 가능
 */

import localforage from 'localforage';

// ── 스토어 인스턴스 ────────────────────────────────────────────

/** 파일 바이너리(Blob) 저장 */
const blobStore = localforage.createInstance({
  name: 'aichat-files',
  storeName: 'blobs',
  driver: [localforage.INDEXEDDB],
  description: '파일 바이너리 (원본 보존)',
});

/** 파일 메타데이터 저장 */
const metaStore = localforage.createInstance({
  name: 'aichat-files',
  storeName: 'meta',
  driver: [localforage.INDEXEDDB, localforage.LOCALSTORAGE],
  description: '파일 메타데이터',
});

/** 메시지 ID → 파일 ID 배열 매핑 */
const msgFileStore = localforage.createInstance({
  name: 'aichat-files',
  storeName: 'msg_files',
  driver: [localforage.INDEXEDDB, localforage.LOCALSTORAGE],
  description: '메시지-파일 연결 매핑',
});

// ── 타입 정의 ─────────────────────────────────────────────────

export interface StoredFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  type: 'image' | 'text' | 'other';
  textContent?: string;   // 텍스트 파일의 사전 추출 내용
  conversationId?: string;
  messageId?: string;
  gptId?: string;
  createdAt: string;
}

// ── 파일 타입 감지 ────────────────────────────────────────────

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'csv', 'json', 'log', 'xml', 'yaml', 'yml',
  'ts', 'tsx', 'js', 'jsx', 'py', 'css', 'scss', 'html', 'htm',
  'sh', 'bash', 'zsh', 'env', 'ini', 'toml', 'conf', 'cfg',
  'bat', 'sql', 'graphql', 'gql', 'rs', 'go', 'java', 'kt',
  'swift', 'c', 'cpp', 'h', 'cs', 'php', 'rb', 'vue', 'svelte',
]);

function detectFileType(file: File): 'image' | 'text' | 'other' {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('text/') || file.type === 'application/json') return 'text';
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return TEXT_EXTENSIONS.has(ext) ? 'text' : 'other';
}

// ── 핵심 API ─────────────────────────────────────────────────

/**
 * 파일을 IndexedDB에 Blob 그대로 저장합니다.
 * 이미지/동영상/음성 등 모든 바이너리 파일의 원본이 보존됩니다.
 * 텍스트 파일은 내용을 사전에 추출하여 AI 참조에 사용됩니다.
 */
export async function storeFile(
  file: File,
  ctx: {
    conversationId?: string;
    messageId?: string;
    gptId?: string;
  } = {}
): Promise<StoredFileMetadata> {
  const id = `f-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const type = detectFileType(file);

  // 텍스트 파일: 내용 사전 추출 (AI 전송용)
  let textContent: string | undefined;
  if (type === 'text') {
    try {
      const raw = await file.text();
      textContent =
        raw.length > 50000
          ? `${raw.slice(0, 50000)}\n... (이하 생략 — 총 ${(raw.length / 1024).toFixed(1)}KB)`
          : raw;
    } catch {
      // 읽기 실패 시 무시
    }
  }

  const meta: StoredFileMetadata = {
    id,
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    type,
    textContent,
    createdAt: new Date().toISOString(),
    ...ctx,
  };

  // *** 바이너리를 Blob으로 저장 (base64 팽창 없음) ***
  // file.slice()로 순수 Blob 생성 → 구형 브라우저에서도 안전하게 저장됩니다.
  await blobStore.setItem(id, file.slice(0, file.size, file.type));
  await metaStore.setItem(id, meta);

  console.log(`[fileStorage] 저장 완료: ${file.name} (${id}, ${type})`);
  return meta;
}

/** 저장된 파일의 원본 Blob 반환 */
export async function getFileBlob(id: string): Promise<Blob | null> {
  try {
    return await blobStore.getItem<Blob>(id);
  } catch (e) {
    console.error(`[fileStorage] Blob 로드 실패 (${id}):`, e);
    return null;
  }
}

/** 저장된 파일의 메타데이터 반환 */
export async function getFileMeta(id: string): Promise<StoredFileMetadata | null> {
  try {
    return await metaStore.getItem<StoredFileMetadata>(id);
  } catch {
    return null;
  }
}

/**
 * 저장된 파일을 Object URL로 변환합니다.
 * ⚠️ 사용 후 반드시 URL.revokeObjectURL()을 호출하세요.
 */
export async function createFileObjectUrl(id: string): Promise<string | null> {
  const blob = await getFileBlob(id);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

/** 저장된 이미지 파일을 base64 data URL로 변환 (AI 전송용) */
export async function fileToBase64(id: string): Promise<string | null> {
  const blob = await getFileBlob(id);
  if (!blob) return null;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** 저장된 파일 삭제 (Blob + 메타데이터) */
export async function deleteStoredFile(id: string): Promise<void> {
  await blobStore.removeItem(id);
  await metaStore.removeItem(id);
}

// ── 메시지-파일 매핑 ─────────────────────────────────────────

/** 메시지에 파일 ID 목록을 연결합니다 */
export async function setMessageFiles(messageId: string, fileIds: string[]): Promise<void> {
  if (!messageId || fileIds.length === 0) return;
  await msgFileStore.setItem(messageId, fileIds);
}

/** 메시지에 연결된 파일 ID 목록 반환 */
export async function getMessageFileIds(messageId: string): Promise<string[]> {
  try {
    return (await msgFileStore.getItem<string[]>(messageId)) ?? [];
  } catch {
    return [];
  }
}

/** 메시지에 첨부된 모든 파일의 메타데이터 반환 */
export async function getMessageFiles(messageId: string): Promise<StoredFileMetadata[]> {
  const ids = await getMessageFileIds(messageId);
  if (ids.length === 0) return [];
  const results = await Promise.all(ids.map(getFileMeta));
  return results.filter(Boolean) as StoredFileMetadata[];
}

// ── GPT 파일 관리 ─────────────────────────────────────────────

/** GPT에 파일 연결: 파일 목록을 저장하고 메타데이터 반환 */
export async function storeGPTFiles(
  files: File[],
  gptId: string
): Promise<StoredFileMetadata[]> {
  const stored: StoredFileMetadata[] = [];
  for (const file of files) {
    const meta = await storeFile(file, { gptId });
    stored.push(meta);
  }
  return stored;
}

/** GPT에 연결된 모든 파일 메타데이터 조회 */
export async function getGPTLocalFiles(gptId: string): Promise<StoredFileMetadata[]> {
  const results: StoredFileMetadata[] = [];
  await metaStore.iterate<StoredFileMetadata, void>((meta) => {
    if (meta.gptId === gptId) results.push(meta);
  });
  return results;
}

/** GPT에 연결된 모든 로컬 파일 삭제 */
export async function deleteGPTLocalFiles(gptId: string): Promise<void> {
  const files = await getGPTLocalFiles(gptId);
  await Promise.all(files.map((f) => deleteStoredFile(f.id)));
}

// ── 유틸리티 ─────────────────────────────────────────────────

/** 저장된 모든 파일/메타/매핑 삭제 */
export async function clearAllStoredFiles(): Promise<void> {
  await blobStore.clear();
  await metaStore.clear();
  await msgFileStore.clear();
  console.log('[fileStorage] 모든 파일 데이터 삭제 완료');
}

/** 스토어 통계 반환 */
export async function getStorageStats(): Promise<{
  blobCount: number;
  metaCount: number;
  msgMappingCount: number;
}> {
  return {
    blobCount: await blobStore.length(),
    metaCount: await metaStore.length(),
    msgMappingCount: await msgFileStore.length(),
  };
}
