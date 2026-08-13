# GitHub 업로드 파일 안내

이 프로젝트는 **소스 전체를 GitHub 저장소 루트에 업로드**하고, GitHub Actions가 `dist/`를 빌드한 뒤 GitHub Pages의 사이트 루트에 배포하는 구조입니다. 따라서 사용자는 `dist/` 폴더만 따로 GitHub에 올릴 필요가 없습니다. 이번에 전달한 압축 파일을 풀어 나온 `AdultNsfwChatGptFullUnCensoredGoldFireDragonBrowser-main/` 폴더의 내용을 저장소 루트에 업로드하면 됩니다.

> GitHub Pages에서는 `dist/` 폴더가 URL에 노출되지 않습니다. 자동 배포가 끝나면 `dist/index.html`과 `dist/assets/`의 **내부 파일이 사이트 루트**(`/index.html`, `/assets/...`)에 배포됩니다.

## 반드시 업로드할 파일

| 파일 또는 폴더 | 업로드 여부 | 이번 수정 내용 및 역할 |
|---|---:|---|
| `index.html` | 필수 | 실제 앱 진입점입니다. 무인증 기기 프로필, 대화·첨부 로컬 저장, GPT 빌더 LocalForage 저장, GGUF 영구 저장·복원·삭제, 오프라인 복구, 선택 계정 동기화, 상대 자산 경로를 포함합니다. |
| `src/local-gguf.ts` | 필수 | 브라우저 WebAssembly 기반 GGUF 실행 모듈입니다. GGUF 헤더·크기·메모리 검사를 수행하고 WebGPU 또는 CPU/WASM으로 로컬 추론합니다. |
| `package.json` | 필수 | `typecheck`, `lint`, `build`, `test`와 정적 배포용 스크립트 및 필요한 의존성을 정의합니다. |
| `package-lock.json` | 필수 | 재현 가능한 GitHub Actions 의존성 설치를 위해 반드시 함께 업로드합니다. |
| `vite.config.ts` | 필수 | GitHub Pages의 루트·하위 경로에서 모두 자산을 찾도록 상대 경로 기반 정적 빌드를 설정합니다. |
| `public/env-config.js` | 필수 | 서버 없이 열어도 404 없이 무인증 로컬 모드로 시작하는 기본 환경 설정 파일입니다. |
| `public/.nojekyll` | 필수 | GitHub Pages가 정적 자산을 Jekyll 처리 없이 제공하게 합니다. |
| `.github/workflows/main.yml` | 필수 | `npm ci` → `npm run build` → `dist/` 아티팩트 업로드 → GitHub Pages 루트 배포를 수행합니다. |
| `eslint.config.js` | 권장 | 실행 대상이 아닌 보조 템플릿 때문에 검사·배포가 중단되는 문제를 피하도록 검사 범위를 조정합니다. |
| `src/` | 필수 | React 보조 화면의 버튼 변형, 인증 안정화, 메시지·첨부·오프라인 큐 경합 수정이 포함됩니다. |
| `supabase/` | 선택 | 선택 계정 연결 및 원격 스트리밍 기능을 사용할 경우에만 함께 업로드·배포합니다. 무인증 로컬 사용만 한다면 유지해도 실행에는 지장이 없습니다. |
| `PATCH_NOTES.md` | 권장 | 기능·제약 사항·선택 Google 로그인 설정·Pages 배포 방법을 설명합니다. |
| `GITHUB_UPLOAD_GUIDE.md` | 권장 | 현재 문서입니다. |

## 수정한 핵심 파일별 내용

| 파일 | 핵심 수정 |
|---|---|
| `index.html` | 실제 정적 앱의 인증 없는 시작, LocalForage 기반 프로필·대화·메시지·첨부 저장, 오프라인 큐, 파일 업로드, GPT 빌더, GGUF 저장·복원·삭제, 정적 자산 경로와 예외 처리를 보강했습니다. |
| `src/local-gguf.ts` | `.gguf` 파일 검증, 2GB 개별 파일 제한, 모델·컨텍스트 메모리 검사, WebGPU 가능 여부 안내, 모델 로드·생성·해제 예외 처리를 추가했습니다. |
| `src/hooks/useMessages.ts` | 비동기 로드가 새 메시지 상태를 덮어쓰는 경쟁 상태를 완화했습니다. |
| `src/hooks/useAuth.ts` | 인증 서비스 오류나 손상된 로컬 데이터 때문에 초기 화면이 멈추지 않도록 복구 경로를 추가했습니다. |
| `src/lib/offline-queue.ts` | 오프라인 큐의 새로고침 후 복구, 실패 작업 보존, 중복 처리 방지를 보강했습니다. |
| `src/components/chat/ChatInput.tsx` | 중복 전송, 실패 시 입력 유실, 과도한 첨부로 인한 불안정을 방지했습니다. |
| `src/components/chat/ChatMessage.tsx` | 저장 후 메시지 ID가 바뀌어도 첨부 파일이 사라지지 않도록 보완했습니다. |
| `src/components/chat/GPTBuilderModal.tsx` | 파일 초기화 훅의 불필요한 반복 실행을 줄였습니다. |
| `src/components/ui/button.tsx` | 누락된 버튼 변형 함수를 복구해 다이얼로그·달력·페이지네이션의 렌더·타입 오류를 해결했습니다. |
| `src/lib/utils.ts` | 조건부 클래스 결합 타입을 표준 인자 타입으로 보강했습니다. |
| `package-lock.json` | 설치를 막던 손상된 잠금 파일을 의존성 선언과 일치하도록 재생성했습니다. |

## GitHub에 올리지 말아야 할 항목

| 경로 | 이유 |
|---|---|
| `node_modules/` | GitHub Actions가 `npm ci`로 다시 설치합니다. 용량이 매우 크고 업로드하면 안 됩니다. |
| `.vite/`, `dist/.vite/` | 로컬 개발·번들 캐시입니다. |
| 임시 테스트 파일 | `invalid-test.gguf`, `profile-upload-test.txt`, 브라우저 진단 파일 등은 테스트용입니다. |
| 개인 키·서비스 역할 키 | 절대 업로드하지 마십시오. 선택 Supabase 연결에는 공개 Anon Key만 앱 설정 화면에서 사용합니다. |

## 업로드 및 Pages 배포 절차

1. 새 GitHub 저장소를 만들고, 압축을 푼 프로젝트 폴더 **안의 모든 파일과 폴더**를 저장소 루트에 업로드합니다. `node_modules/`는 제외합니다.
2. GitHub에서 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 변경합니다.
3. `main` 브랜치에 푸시합니다. `.github/workflows/main.yml`이 자동으로 `dist/`를 만들고 사이트 루트에 배포합니다.
4. Actions 작업이 성공하면 Settings → Pages에 표시되는 사이트 주소에서 `/index.html` 또는 기본 루트를 열어 확인합니다.

## 로컬 확인 명령

```bash
npm ci
npm test
```

`npm test`는 타입 검사, 정적 검사, 프로덕션 빌드를 순서대로 수행합니다. 이번 수정본은 이 전체 검사를 통과했습니다.
