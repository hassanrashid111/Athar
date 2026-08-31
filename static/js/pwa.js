/**
 * منصة أثر التعليمية - إدارة تطبيق الويب التقدمي والإشعارات الفورية
 * (PWA & Native System Push Notifications Manager)
 */

import { showAtharNotification, cleanPhone } from "./utils.js";

let deferredPrompt = null;

/**
 * تسجيل Service Worker والتجهيز للتثبيت والإشعارات
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

    // 4. فحص حالة إذن الإشعارات وعرض طلب الإذن إذا لم يسبق طلبه
    setTimeout(() => {
        checkAndPromptNotificationPermission();
    }, 4000);
}

/**
 * تشغيل موجه التثبيت عند طلب المشرف
 */
export async function promptPWAInstall() {
    if (!deferredPrompt) {
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

/* ==========================================================================
   🔔 نظام الإشعارات الفورية لشاشة القفل وسطح المكتب (System Push Notifications)
   ========================================================================== */

/**
 * طلب إذن إرسال الإشعارات من المشرف
 */
export async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        showAtharNotification("المتصفح الحالي لا يدعم الإشعارات الفورية.", "warning");
        return false;
    }

    if (Notification.permission === 'granted') {
        showAtharNotification("الإشعارات الفورية مفعلة بالفعل على جهازك! 🔔", "success");
        return true;
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            showAtharNotification("تم تفعيل الإشعارات الفورية بنجاح! ستصلك تنبيهات المحاضرات واستلام الطلاب 🔔", "success");
            // إرسال إشعار ترحيبي للتأكيد
            sendNativeNotification("منصة أثر التعليمية 🌿", {
                body: "تم تفعيل التنبيهات الفورية بنجاح! ستصلك إشعارات استلام الطلاب والمحاضرات الجديدة هنا.",
                tag: "welcome-notification"
            });
            return true;
        } else {
            showAtharNotification("تم رفض إذن الإشعارات. يمكنك تفعيله يدوياً من إعدادات المتصفح.", "warning");
            return false;
        }
    } catch (e) {
        console.error("Notification permission error:", e);
        return false;
    }
}

/**
 * فحص وعرض بانر تفعيل التنبيهات الفورية بشكل لطيف
 */
function checkAndPromptNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'default') return;
    if (localStorage.getItem('athar_notif_banner_dismissed')) return;

    if (document.getElementById('athar-notif-permission-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'athar-notif-permission-banner';
    banner.style.cssText = `
        position: fixed;
        top: 20px;
        left: 20px;
        right: 20px;
        max-width: 450px;
        margin: 0 auto;
        background: linear-gradient(135deg, #1A5D3A 0%, #15452c 100%);
        color: #ffffff;
        border: 1px solid var(--accent-gold);
        border-radius: 12px;
        padding: 14px 18px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.35);
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        animation: slideDownNotif 0.4s ease;
    `;

    banner.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
            <div style="font-size: 1.8rem;">🔔</div>
            <div>
                <h4 style="margin: 0; font-size: 0.95rem; font-weight: bold; color: #fffb91;">تفعيل التنبيهات الفورية</h4>
                <p style="margin: 3px 0 0 0; font-size: 0.8rem; color: #e0e0e0;">تلقى إشعارات فورية على هاتفك عند إضافة محاضرات جديدة أو تسليم طلاب</p>
            </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
            <button id="athar-notif-enable-btn" style="background: var(--accent-gold); color: #1a1a1a; font-weight: bold; border: none; padding: 7px 14px; border-radius: 6px; cursor: pointer; font-size: 0.85rem;">
                تفعيل 🔔
            </button>
            <button id="athar-notif-close-btn" style="background: transparent; color: #aaa; border: none; font-size: 1.1rem; cursor: pointer; padding: 4px;">
                ✕
            </button>
        </div>
    `;

    document.body.appendChild(banner);

    document.getElementById('athar-notif-enable-btn')?.addEventListener('click', async () => {
        banner.remove();
        await requestNotificationPermission();
    });

    document.getElementById('athar-notif-close-btn')?.addEventListener('click', () => {
        banner.remove();
        localStorage.setItem('athar_notif_banner_dismissed', 'true');
    });
}

/**
 * إرسال إشعار نظام حقيقي على شاشة القفل وسطح المكتب
 */
export async function sendNativeNotification(title, options = {}) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const defaultOptions = {
        icon: '/static/assets/icon-192.png',
        badge: '/static/assets/favicon.png',
        vibrate: [200, 100, 200],
        dir: 'rtl',
        lang: 'ar',
        renotify: true,
        data: { url: '/dashboard.html' }
    };

    const finalOptions = { ...defaultOptions, ...options };

    try {
        if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.ready;
            await reg.showNotification(title, finalOptions);
        } else {
            new Notification(title, finalOptions);
        }
    } catch (e) {
        console.warn('[PWA Notification Error]', e);
        try {
            new Notification(title, finalOptions);
        } catch (err) {
            console.error('[Fallback Notification Error]', err);
        }
    }
}

/**
 * 1. فحص وإرسال تنبيهات استلام وتسليم الطلاب الفورية
 */
export function checkTransferNotifications(transfers, myPhone) {
    if (!transfers || !myPhone) return;

    const cleanMyPhone = cleanPhone(myPhone);
    if (!cleanMyPhone) return;

    for (const tid in transfers) {
        const transfer = transfers[tid];
        if (transfer.status === 'pending') {
            const recipientClean = cleanPhone(transfer.recipientPhone || '');
            const isMatch = recipientClean && (
                recipientClean === cleanMyPhone ||
                recipientClean.endsWith(cleanMyPhone.slice(-9)) ||
                cleanMyPhone.endsWith(recipientClean.slice(-9))
            );

            if (isMatch) {
                const storageKey = `notified_transfer_${tid}`;
                if (!localStorage.getItem(storageKey)) {
                    localStorage.setItem(storageKey, 'true');
                    const studentCount = (transfer.students && transfer.students.length) ? transfer.students.length : 0;
                    sendNativeNotification("📥 طلب استلام طلاب جديد", {
                        body: `المشرف (${transfer.senderName || 'مشرف زميل'}) يود تسليمك (${studentCount}) طالباً. اضغط هنا للمراجعة والقبول.`,
                        tag: `transfer-${tid}`,
                        data: { url: '/dashboard.html', action: 'transfer', tid: tid }
                    });
                }
            }
        }
    }
}

/**
 * 2. فحص وإرسال تنبيهات إضافة المحاضرات الجديدة
 */
export function checkNewLectureNotifications(groupId, lectures, userRole) {
    if (!groupId || !lectures || !Array.isArray(lectures) || lectures.length === 0) return;
    if (userRole !== 'followup_supervisor') return;

    const storageKey = `athar_known_lectures_${groupId}`;
    const rawKnown = localStorage.getItem(storageKey);

    const currentLecIds = lectures.map(l => l.id);

    if (!rawKnown) {
        // أول مرة يتم فيها تحميل محاضرات المجموعة - نحفظ القائمة كمعروفة
        localStorage.setItem(storageKey, JSON.stringify(currentLecIds));
        return;
    }

    try {
        const knownLecIds = JSON.parse(rawKnown);
        const newLectures = lectures.filter(l => !knownLecIds.includes(l.id));

        if (newLectures.length > 0) {
            newLectures.forEach(newLec => {
                sendNativeNotification(`📚 محاضرة جديدة: ${newLec.title}`, {
                    body: `تمت إضافة المحاضرة الجديدة للمجموعة. يرجى متابعة حضور واختبارات طلابك الآن.`,
                    tag: `new-lecture-${newLec.id}`,
                    data: { url: '/dashboard.html', action: 'lecture', lecId: newLec.id }
                });
            });

            // تحديث القائمة المعروفة
            localStorage.setItem(storageKey, JSON.stringify(currentLecIds));
        }
    } catch (e) {
        console.error("Lecture notification error:", e);
        localStorage.setItem(storageKey, JSON.stringify(currentLecIds));
    }
}

/**
 * 3. فحص وإرسال تذكير بالطلاب المعلقين (رد ولم يختبر منذ 24 ساعة)
 */
export function checkPendingRepliedReminder(students, lectures, userRole) {
    if (userRole !== 'followup_supervisor') return;
    if (!students || !Array.isArray(students) || students.length === 0) return;
    if (!lectures || !Array.isArray(lectures) || lectures.length === 0) return;

    const latestLec = lectures[lectures.length - 1];
    if (!latestLec) return;

    // العثور على الطلاب الذين حالتهم 'replied' في المحاضرة الحالية
    const repliedStudents = students.filter(s =>
        !s.deleted && s.progress && s.progress[latestLec.id] === 'replied'
    );

    if (repliedStudents.length === 0) return;

    const reminderCooldownKey = `athar_replied_reminder_${latestLec.id}`;
    const lastReminder = localStorage.getItem(reminderCooldownKey);
    const now = Date.now();

    // إرسال التذكير مرة واحدة كل 24 ساعة كحد أقصى لتفادي الإزعاج
    if (lastReminder && (now - parseInt(lastReminder, 10)) < (24 * 60 * 60 * 1000)) {
        return;
    }

    sendNativeNotification("⏳ تذكير بالمهام المعلقة", {
        body: `لديك (${repliedStudents.length}) طلاب مسجلين كـ 'رد ولم يختبر' في (${latestLec.title}). بادر بتشجيعهم الآن للبدء في الاختبار!`,
        tag: `replied-reminder-${latestLec.id}`,
        data: { url: '/dashboard.html', action: 'replied' }
    });

    localStorage.setItem(reminderCooldownKey, now.toString());
}

// تشغيل الـ PWA تلقائياً عند تحميل الصفحة
initPWA();

window.app = window.app || {};
window.app.promptPWAInstall = promptPWAInstall;
window.app.requestNotificationPermission = requestNotificationPermission;
