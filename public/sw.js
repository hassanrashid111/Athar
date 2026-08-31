const CACHE_NAME = 'athar-pwa-v1.0.1';
const STATIC_ASSETS = [
    '/',
    '/login.html',
    '/dashboard.html',
    '/reports.html',
    '/setup.html',
    '/static/css/base.css',
    '/static/css/components.css',
    '/static/css/dashboard.css',
    '/static/css/login.css',
    '/static/css/reports.css',
    '/static/css/setup.css',
    '/static/js/auth.js',
    '/static/js/certificates.js',
    '/static/js/dashboard.js',
    '/static/js/firebase-config.js',
    '/static/js/hadith.js',
    '/static/js/lectures.js',
    '/static/js/messaging.js',
    '/static/js/reports-page.js',
    '/static/js/reports.js',
    '/static/js/router.js',
    '/static/js/setup.js',
    '/static/js/state.js',
    '/static/js/students.js',
    '/static/js/utils.js',
    '/static/manifest.json',
    '/static/assets/icon-192.png',
    '/static/assets/icon-512.png',
    '/static/assets/icon-maskable-192.png',
    '/static/assets/icon-maskable-512.png',
    '/static/assets/apple-touch-icon.png',
    '/static/assets/favicon.png'
];

// تثبيت الـ Service Worker وحفظ الأصول الأساسية في الكاش
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS).catch((err) => {
                console.warn('[SW] Cache addAll warning:', err);
            });
        }).then(() => self.skipWaiting())
    );
});

// تفعيل وحذف الكاش القديم عند التحديث
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

// التعامل مع طلبات الشبكة
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // استثناء طلبات Firebase و APIs الخارجية (Gemini, Google Fonts CDN)
    if (
        request.method !== 'GET' ||
        url.hostname.includes('firebaseio.com') ||
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('generativelanguage') ||
        url.hostname.includes('identitytoolkit')
    ) {
        return;
    }

    // لطلبات صفحات التنقل (HTML) - Network first ثم Cache
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(() => {
                return caches.match(request).then((res) => {
                    return res || caches.match('/dashboard.html') || caches.match('/login.html');
                });
            })
        );
        return;
    }

    // لملفات الـ CSS و JS و الصور الثابتة - Stale-While-Revalidate
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const fetchPromise = fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
                }
                return networkResponse;
            }).catch(() => cachedResponse);

            return cachedResponse || fetchPromise;
        })
    );
});
