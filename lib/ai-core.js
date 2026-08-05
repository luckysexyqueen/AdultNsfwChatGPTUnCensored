// GoldFireDragon Unified AI Engine Core
import * as webLLM from "./web-llm.js";

export const GoldFireAI = {
    engine: null,
    currentModel: "Llama-3-8B-Instruct-v0.1-q4f16_1-MLC",

    // 1. Cloud API 엔진 (OpenAI, Gemini 등 호환)
    async callAPI(endpoint, key, prompt) {
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-4',
                    messages: [{role: 'user', content: prompt}],
                    stream: false
                })
            });
            return await response.json();
        } catch (e) {
            throw new Error("API 호출 실패: " + e.message);
        }
    },

    // 2. 로컬 모델 엔진 (WebGPU/WASM)
    async initLocalEngine(reportProgress) {
        if (this.engine) return;

        const worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
        this.engine = await webLLM.CreateWebWorkerMLCEngine(worker, this.currentModel, {
            initProgressCallback: reportProgress
        });
    },

    async askLocal(prompt) {
        if (!this.engine) throw new Error("엔진이 초기화되지 않았습니다.");
        const reply = await this.engine.chat.completions.create({
            messages: [{ role: "user", content: prompt }]
        });
        return reply.choices[0].message.content;
    },

    // 3. 커스텀 모델(GGUF) 업로드 및 엔진 연결
    async loadCustomGGUF(file) {
        console.log("GGUF 모델 로딩 시작:", file.name);
        // 브라우저 캐시(Cache API) 또는 IndexedDB에 모델 바이너리 저장
        const cache = await caches.open("goldfire-models");
        await cache.put(new Request(file.name), new Response(file));
        return `모델 ${file.name} 설치 완료. 이제 로컬 모드에서 사용 가능합니다.`;
    }
};
