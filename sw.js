const CACHE_NAME = 'ai-chat-v1';
const STATIC_CACHE = 'static-v1';
const DYNAMIC_CACHE = 'dynamic-v1';

// 캐시할 정적 파일 목록
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/icon.png',
  '/manifest.json'
];

// Service Worker 설치
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker...');
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Service Worker 활성화
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch 이벤트 - 네트워크 우선, 실패 시 캐시
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // API 요청은 캐싱하지 않음
  if (request.url.includes('/functions/v1/') || request.url.includes('/rest/v1/')) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        // 성공적인 응답을 동적 캐시에 저장
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // 네트워크 실패 시 캐시에서 가져오기
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          
          // 캐시에도 없으면 오프라인 페이지 또는 기본 응답
          if (request.destination === 'document') {
            return caches.match('/index.html');
          }
          
          return new Response('오프라인 상태입니다.', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'text/plain'
            })
          });
        });
      })
  );
});

// 백그라운드 동기화 (선택사항)
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages());
  }
});

async function syncMessages() {
  // 오프라인 중 저장된 메시지 동기화 로직
  console.log('[SW] Syncing offline messages...');
}
