const CACHE_NAME = 'athar-pwa-v1.0.3';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/login.html',
    '/dashboard.html',
    '/reports.html',
    '/setup.html',
    '/dashboard',
    '/reports',
    '/setup',
    '/login',
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
    '/static/js/pwa.js',
    '/static/js/reports-page.js',
    '/static/js/reports.js',
    '/static/js/router.js',
    '/static/js/setup.js',
    '/static/js/state.js',
    '/static/js/students.js',
    '/static/js/utils.js',
    '/static/manifest.json',
    '/static/assets/logo_transparent.png',
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

    // استثناء طلبات قواعد بيانات Firebase التفاعلية والـ Gemini API
    if (
        request.method !== 'GET' ||
        url.hostname.includes('firebaseio.com') ||
        url.hostname.includes('generativelanguage.googleapis.com') ||
        url.hostname.includes('identitytoolkit')
    ) {
        return;
    }

    // لطلبات صفحات التنقل (HTML) - Cache First with Network Fallback
    if (request.mode === 'navigate' || request.destination === 'document') {
        event.respondWith(
            caches.match(request).then((cachedResponse) => {
                if (cachedResponse) {
                    // جلب النسخة الأحدث في الخلفية إن أمكن
                    fetch(request).then((networkResponse) => {
                        if (networkResponse && networkResponse.status === 200) {
                            caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
                        }
                    }).catch(() => {});
                    return cachedResponse;
                }
                return fetch(request).catch(() => {
                    const pathname = url.pathname;
                    if (pathname.includes('reports')) return caches.match('/reports.html');
                    if (pathname.includes('setup')) return caches.match('/setup.html');
                    if (pathname.includes('dashboard')) return caches.match('/dashboard.html');
                    return caches.match('/login.html') || caches.match('/');
                });
            })
        );
        return;
    }

    // لملفات الـ CSS و JS والمكتبات الثابتة والصور - Stale-While-Revalidate
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const fetchPromise = fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
                }
                return networkResponse;
            }).catch(() => cachedResponse);

            return cachedResponse || fetchPromise;
        })
    );
});

// التعامل مع النقر على إشعارات النظام في شاشة القفل وسطح المكتب
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/dashboard.html';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // إذا كانت النافذة مفتوحة بالفعل، يتم التركيز عليها وتوجيهها
            for (let client of windowClients) {
                if (client.url.includes('dashboard.html') && 'focus' in client) {
                    return client.focus();
                }
            }
            // إذا لم تكن مفتوحة، يتم فتح نافذة جديدة
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});

// استقبال إشعارات Push المباشرة إن وُجدت
self.addEventListener('push', (event) => {
    let payload = {
        title: 'منصة أثر التعليمية 🌿',
        body: 'لديك تحديث جديد في المنصة.',
        icon: '/static/assets/icon-192.png',
        badge: '/static/assets/favicon.png',
        data: { url: '/dashboard.html' }
    };

    if (event.data) {
        try {
            payload = event.data.json();
        } catch (e) {
            payload.body = event.data.text();
        }
    }

    event.waitUntil(
        self.registration.showNotification(payload.title, {
            body: payload.body,
            icon: payload.icon || '/static/assets/icon-192.png',
            badge: payload.badge || '/static/assets/favicon.png',
            vibrate: [200, 100, 200],
            dir: 'rtl',
            lang: 'ar',
            data: payload.data || { url: '/dashboard.html' }
        })
    );
});
