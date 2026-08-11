#!/usr/bin/env node
/**
 * generate-env-config.js
 * ------------------------------------------------------------------
 * .env 파일의 VITE_SUPABASE_ANON_KEY 값을 읽어, index.html이 부팅 시
 * 자동으로 로드하는 env-config.js 파일을 생성합니다.
 *
 * 우선순위 체계 (index.html에 이미 구현됨):
 *   ① env-config.js (이 스크립트가 생성, .env 값 반영)
 *   ② localStorage (이 기기에 이전에 저장된 값)
 *   ③ 최초 실행 시 입력폼 (제출하면 localStorage에 저장 → 다음부턴 자동)
 *
 * .env를 못 찾거나 값이 비어있으면, 이 스크립트는 그냥 아무 파일도
 * 만들지 않고 조용히 종료합니다 → 앱은 자동으로 ②/③ 단계로 넘어갑니다.
 *
 * 사용법:
 *   node generate-env-config.js
 *
 * package.json에 등록해서 빌드 전에 자동 실행하려면 예시:
 *   "scripts": {
 *     "prebuild": "node generate-env-config.js",
 *     "build": "npm run prebuild && <기존 빌드 명령>"
 *   }
 *
 * ⚠️ 주의: OUTPUT_PATH를 실제 index.html이 위치한 폴더에 맞게 확인/수정하세요.
 *    (예: Capacitor 프로젝트라면 보통 "www" 또는 "public" 폴더)
 * ------------------------------------------------------------------
 */
const fs = require("fs");
const path = require("path");

// ⚠️ 프로젝트 구조에 맞게 필요 시 수정하세요.
const ENV_PATH = path.join(__dirname, ".env");
const OUTPUT_PATH = path.join(__dirname, "env-config.js"); // index.html과 같은 폴더 기준
const ENV_VAR_NAME = "VITE_SUPABASE_ANON_KEY";

function parseEnvFile(content) {
  const result = {};
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) return;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  });
  return result;
}

function main() {
  if (!fs.existsSync(ENV_PATH)) {
    console.warn(`[generate-env-config] .env 파일을 찾을 수 없습니다: ${ENV_PATH}`);
    console.warn("[generate-env-config] env-config.js를 생성하지 않습니다. 앱 실행 시 입력폼이 표시됩니다.");
    return;
  }

  const env = parseEnvFile(fs.readFileSync(ENV_PATH, "utf8"));
  const anonKey = env[ENV_VAR_NAME];

  if (!anonKey) {
    console.warn(`[generate-env-config] .env에 ${ENV_VAR_NAME} 값이 없습니다.`);
    console.warn("[generate-env-config] env-config.js를 생성하지 않습니다. 앱 실행 시 입력폼이 표시됩니다.");
    return;
  }

  const output = `// 이 파일은 generate-env-config.js가 자동 생성합니다. 직접 수정하지 마세요.
// 원본 값: .env의 ${ENV_VAR_NAME}
window.__ENV__ = {
  SUPABASE_ANON_KEY: ${JSON.stringify(anonKey)}
};
`;

  fs.writeFileSync(OUTPUT_PATH, output, "utf8");
  console.log(`[generate-env-config] 생성 완료 → ${OUTPUT_PATH}`);
  console.log(`[generate-env-config] (.env의 ${ENV_VAR_NAME} 값을 사용)`);
}

main();
