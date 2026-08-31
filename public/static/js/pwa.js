/**
 * منصة أثر التعليمية - إدارة تطبيق الويب التقدمي (PWA Manager)
 */

import { showAtharNotification } from "./utils.js";

let deferredPrompt = null;

/**
 * تسجيل Service Worker والتجهيز للتثبيت
 */
export function initPWA() {
    // 1. تسجيل الـ Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js', { scope: '/' })
                .then((reg) => {
                    console.log('[PWA] Service Worker registered with scope:', reg.scope);
                })
                .catch((err) => {
                    console.warn('[PWA] Service Worker registration failed:', err);
                });
        });
    }

    // 2. التقاط حدث التثبيت وتجهيز زر التثبيت
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;

        // إظهار زر التثبيت في القائمة إذا وجد
        const installBtn = document.getElementById('pwa-install-btn');
        if (installBtn) {
            installBtn.style.display = 'flex';
        }

        // إظهار بانر تثبيت لطيف وغير مزعج مرة واحدة إذا لم يكن مثبتاً
        if (!localStorage.getItem('pwa_prompt_dismissed')) {
            showPWAInstallBanner();
        }
    });

    // 3. تأكيد اكتمال التثبيت
    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        const installBtn = document.getElementById('pwa-install-btn');
        if (installBtn) installBtn.style.display = 'none';

        const banner = document.getElementById('pwa-install-banner');
        if (banner) banner.remove();

        showAtharNotification("🎉 تم تثبيت منصة أثر كتطبيق على جهازك بنجاح!", "success");
    });
}

/**
 * تشغيل موجه التثبيت عند طلب المشرف
 */
export async function promptPWAInstall() {
    if (!deferredPrompt) {
        // إذا كان التطبيق مثبتاً بالفعل أو المتصفح لا يدعم الموجه التلقائي
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
        if (isStandalone) {
            showAtharNotification("أنت تستخدم التطبيق بالفعل بنجاح! 📱", "info");
        } else {
            showAtharNotification("لتثبيت التطبيق: اضغط على خيارات المتصفح (⋮) ثم اختر 'إضافة إلى الشاشة الرئيسية' أو 'Install App' 📲", "info");
        }
        return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`[PWA] User response to install prompt: ${outcome}`);

    if (outcome === 'accepted') {
        const banner = document.getElementById('pwa-install-banner');
        if (banner) banner.remove();
    }
    deferredPrompt = null;
}

/**
 * عرض بانر التثبيت الذكي
 */
function showPWAInstallBanner() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isStandalone) return;

    if (document.getElementById('pwa-install-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        right: 20px;
        max-width: 420px;
        margin: 0 auto;
        background: linear-gradient(135deg, #1A5D3A 0%, #0d3822 100%);
        color: #ffffff;
        border: 1px solid var(--accent-gold);
        border-radius: 12px;
        padding: 14px 18px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.35);
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        animation: slideUpPWA 0.4s ease;
    `;

    banner.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
            <img src="/static/assets/icon-192.png" alt="أثر" style="width: 44px; height: 44px; border-radius: 10px; border: 1px solid var(--accent-gold); background: #fff; padding: 2px;">
            <div>
                <h4 style="margin: 0; font-size: 0.95rem; font-weight: bold; color: #fffb91;">تثبيت منصة أثر</h4>
                <p style="margin: 3px 0 0 0; font-size: 0.8rem; color: #e0e0e0;">ثبّت المنصة كتطبيق على جهازك لسرعة وسهولة الوصول</p>
            </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
            <button id="pwa-banner-install-btn" style="background: var(--accent-gold); color: #1a1a1a; font-weight: bold; border: none; padding: 7px 14px; border-radius: 6px; cursor: pointer; font-size: 0.85rem;">
                تثبيت 📲
            </button>
            <button id="pwa-banner-close-btn" style="background: transparent; color: #aaa; border: none; font-size: 1.1rem; cursor: pointer; padding: 4px;">
                ✕
            </button>
        </div>
    `;

    document.body.appendChild(banner);

    document.getElementById('pwa-banner-install-btn')?.addEventListener('click', () => {
        promptPWAInstall();
    });

    document.getElementById('pwa-banner-close-btn')?.addEventListener('click', () => {
        banner.remove();
        localStorage.setItem('pwa_prompt_dismissed', 'true');
    });
}

// تشغيل الـ PWA تلقائياً عند تحميل الصفحة
initPWA();

window.app = window.app || {};
window.app.promptPWAInstall = promptPWAInstall;
