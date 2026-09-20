/* Easy Live – Service Worker بسيط
 * - يخزّن هيكل التطبيق (الصفحة، الأيقونات، المانيفست) ليفتح بسرعة وبدون إنترنت.
 * - يخزّن مكتبة hls.js من الـ CDN.
 * - لا يلمس أي طلب بث (m3u8 / مقاطع الفيديو / Range) إطلاقًا.
 * غيّر رقم الإصدار عند تعديل ملفات التطبيق ليتحدّث الكاش.
 */
const VERSION = 'v1';
const CACHE = `easylive-${VERSION}`;
const HLS_CDN = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];
const MEDIA_RE = /\.(m3u8|ts|m4s|mp4|aac|mp3|key)(\?|$)/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await cache.addAll(SHELL);
      try { await cache.add(HLS_CDN); } catch (e) { /* يُحمَّل لاحقًا عند أول استخدام */ }
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('easylive-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.headers.has('range')) return;          // بث/ملفات وسائط جزئية
  if (MEDIA_RE.test(req.url)) return;            // لا نتدخل في البث أبدًا

  const url = new URL(req.url);

  // مكتبة hls.js: من الكاش أولًا
  if (req.url === HLS_CDN) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }))
    );
    return;
  }

  // أي طلب خارجي آخر (بث، خطوط، إلخ): نتركه للمتصفح
  if (url.origin !== self.location.origin) return;

  // التنقّل بين الصفحات: الشبكة أولًا ثم الكاش عند انقطاع الإنترنت
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // ملفات التطبيق الثابتة: من الكاش مع تحديث في الخلفية
  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || network;
    })
  );
});
