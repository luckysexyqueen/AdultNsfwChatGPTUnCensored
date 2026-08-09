// GoldFireDragon AI Local Engine Worker
import { MLCEngineWorkerHandler } from "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.46/dist/index.js";

/**
 * 이 워커는 GPU(WebGPU) 또는 WASM을 사용하여
 * 앱 내부에서 로컬 모델(.gguf 등)을 직접 실행합니다.
 */
const handler = new MLCEngineWorkerHandler();

self.onmessage = (msg) => {
  handler.onmessage(msg);
};
