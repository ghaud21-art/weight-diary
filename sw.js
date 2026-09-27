// 건강일기 서비스 워커 — 앱 화면 파일만 캐시 (기록 데이터·GAS 요청은 캐시하지 않음)
const CACHE = 'health-diary-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js', './js/api.js', './js/auth.js', './js/calorie.js', './js/config.js', './js/cycle.js',
  './js/icons.js', './js/mock.js', './js/pwa.js', './js/store.js', './js/utils.js',
  './js/screens/calendar.js', './js/screens/chat.js', './js/screens/coach.js', './js/screens/common.js',
  './js/screens/journey.js', './js/screens/record.js', './js/screens/settings.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// 같은 출처의 GET만 처리: 네트워크 우선(최신 코드), 오프라인이면 캐시
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))),
  );
});
