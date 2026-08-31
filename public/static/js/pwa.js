/**
 * منصة أثر التعليمية - إدارة تطبيق الويب التقدمي ومركز الإشعارات ورادار المتابعة
 * (PWA, Notification Center & At-Risk Students Radar)
 */

import { showAtharNotification, cleanPhone, escapeHTML } from "./utils.js";
import { state } from "./state.js";

let deferredPrompt = null;

/**
 * فحص ما إذا كانت الإشعارات مفعلة بواسطة المشرف
 */
export function areNotificationsEnabled() {
    return localStorage.getItem('athar_notifications_enabled') !== 'false';
}

export function setNotificationsEnabled(enabled) {
    localStorage.setItem('athar_notifications_enabled', enabled ? 'true' : 'false');
    const toggleSwitch = document.getElementById('notif-toggle-switch');
    if (toggleSwitch) toggleSwitch.checked = enabled;
}

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

        const installBtn = document.getElementById('pwa-install-btn');
        if (installBtn) installBtn.style.display = 'flex';

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

    // 4. تحديث شارة الإشعارات عند التحميل
    setTimeout(() => {
        updateNotificationBadgeUI();
        checkAndPromptNotificationPermission();
    }, 2000);
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
        max-width: 450px;
        margin: 0 auto;
        background: linear-gradient(135deg, #1A5D3A 0%, #114027 100%);
        color: #ffffff;
        border: 1px solid rgba(212, 175, 55, 0.4);
        border-radius: 16px;
        padding: 16px 20px;
        box-shadow: 0 12px 36px rgba(0,0,0,0.35);
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        animation: slideUpPWA 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    banner.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
            <img src="/static/assets/icon-192.png" alt="أثر" style="width: 44px; height: 44px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">
            <div>
                <h4 style="margin: 0; font-size: 0.95rem; font-weight: 700; color: #fff;">تثبيت منصة أثر كتطبيق</h4>
                <p style="margin: 3px 0 0 0; font-size: 0.8rem; color: #d1fae5;">سرعة أعلى، تنبيهات فورية، وتجربة سلسة بدون متصفح</p>
            </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
            <button id="pwa-banner-install-btn" style="background: var(--accent-gold); color: #1a1a1a; font-weight: bold; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 0.85rem;">
                تثبيت 📲
            </button>
            <button id="pwa-banner-close-btn" style="background: transparent; color: #9ca3af; border: none; font-size: 1.2rem; cursor: pointer; padding: 4px;">
                ✕
            </button>
        </div>
    `;

    document.body.appendChild(banner);

    document.getElementById('pwa-banner-install-btn')?.addEventListener('click', () => promptPWAInstall());
    document.getElementById('pwa-banner-close-btn')?.addEventListener('click', () => {
        banner.remove();
        localStorage.setItem('pwa_prompt_dismissed', 'true');
    });
}

/* ==========================================================================
   🔔 نظام الإشعارات الفورية والتاريخ ومركز التنبيهات (Notification Center)
   ========================================================================== */

export async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        showAtharNotification("المتصفح الحالي لا يدعم الإشعارات الفورية.", "warning");
        return false;
    }

    if (Notification.permission === 'granted') {
        showAtharNotification("الإشعارات الفورية مفعلة بالفعل على جهازك! 🔔", "success");
        setNotificationsEnabled(true);
        return true;
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            setNotificationsEnabled(true);
            showAtharNotification("تم تفعيل الإشعارات الفورية بنجاح! ستصلك تنبيهات المحاضرات واستلام الطلاب 🔔", "success");
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
 * حفظ الإشعار في سجل التنبيهات المحلي
 */
export function saveNotificationToHistory(title, body, type = 'general', data = {}) {
    try {
        const rawHistory = localStorage.getItem('athar_notifications_history') || '[]';
        const history = JSON.parse(rawHistory);

        const newNotif = {
            id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            title,
            body,
            type,
            data,
            timestamp: Date.now(),
            read: false
        };

        // وضع الإشعار في المقدمة، والاحتفاظ بآخر 50 إشعاراً فقط
        history.unshift(newNotif);
        if (history.length > 50) history.pop();

        localStorage.setItem('athar_notifications_history', JSON.stringify(history));

        // زيادة عداد غير المقروء
        let unread = parseInt(localStorage.getItem('athar_notifications_unread_count') || '0', 10);
        unread++;
        localStorage.setItem('athar_notifications_unread_count', unread.toString());

        updateNotificationBadgeUI();
    } catch (e) {
        console.error("Save notif error:", e);
    }
}

/**
 * إرسال إشعار نظام حقيقي على شاشة القفل وسطح المكتب
 */
export async function sendNativeNotification(title, options = {}, saveHistory = true) {
    // 1. فحص توجل الإشعارات
    if (!areNotificationsEnabled()) return;

    if (saveHistory) {
        saveNotificationToHistory(title, options.body || '', options.data?.type || 'general', options.data || {});
    }

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
 * تحديث شارة عداد الإشعارات على أيقونة الجرس
 */
export function updateNotificationBadgeUI() {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;

    const unread = parseInt(localStorage.getItem('athar_notifications_unread_count') || '0', 10);
    if (unread > 0) {
        badge.innerText = unread > 99 ? '99+' : unread;
        badge.style.display = 'inline-flex';
    } else {
        badge.style.display = 'none';
    }
}

/**
 * فتح / إغلاق مركز التنبيهات
 */
export function toggleNotificationCenter() {
    const modal = document.getElementById('notification-center-modal');
    if (!modal) return;

    if (modal.style.display === 'flex') {
        closeNotificationCenter();
    } else {
        openNotificationCenter();
    }
}

export function openNotificationCenter() {
    const modal = document.getElementById('notification-center-modal');
    if (!modal) return;

    // تصفير عداد غير المقروء بمجرد فتح المركز
    localStorage.setItem('athar_notifications_unread_count', '0');
    updateNotificationBadgeUI();

    // تحديث حالة مفتاح التبديل
    const toggleSwitch = document.getElementById('notif-toggle-switch');
    if (toggleSwitch) toggleSwitch.checked = areNotificationsEnabled();

    renderNotificationCenterList();
    modal.style.display = 'flex';
}

export function closeNotificationCenter() {
    const modal = document.getElementById('notification-center-modal');
    if (modal) modal.style.display = 'none';
}

/**
 * رسم قائمة الإشعارات في مركز التنبيهات
 */
export function renderNotificationCenterList() {
    const listContainer = document.getElementById('notif-center-list');
    if (!listContainer) return;

    const rawHistory = localStorage.getItem('athar_notifications_history') || '[]';
    let history = [];
    try {
        history = JSON.parse(rawHistory);
    } catch (e) {
        history = [];
    }

    if (history.length === 0) {
        listContainer.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: var(--text-light);">
                <i class="fa-solid fa-bell-slash" style="font-size: 2.5rem; color: #cbd5e1; margin-bottom: 12px;"></i>
                <h4 style="margin: 0; color: var(--text-dark);">لا توجد إشعارات حالياً</h4>
                <p style="font-size: 0.82rem; margin: 4px 0 0 0;">ستظهر التنبيهات الجديدة واستلام الطلاب هنا</p>
            </div>
        `;
        return;
    }

    let html = '';
    history.forEach(item => {
        const timeAgo = formatTimeAgo(item.timestamp);
        let iconHtml = '<i class="fa-solid fa-bell" style="color: var(--accent-gold);"></i>';
        let bgStyle = 'background: var(--bg-light);';

        if (item.type === 'transfer') {
            iconHtml = '<i class="fa-solid fa-handshake" style="color: #27ae60;"></i>';
            bgStyle = 'background: rgba(39, 174, 96, 0.08);';
        } else if (item.type === 'lecture') {
            iconHtml = '<i class="fa-solid fa-book-open" style="color: #2980b9;"></i>';
            bgStyle = 'background: rgba(41, 128, 185, 0.08);';
        } else if (item.type === 'radar' || item.type === 'at_risk') {
            iconHtml = '<i class="fa-solid fa-crosshairs" style="color: #e74c3c;"></i>';
            bgStyle = 'background: rgba(231, 76, 60, 0.08);';
        } else if (item.type === 'replied') {
            iconHtml = '<i class="fa-solid fa-hourglass-half" style="color: #f39c12;"></i>';
            bgStyle = 'background: rgba(243, 156, 18, 0.08);';
        }

        html += `
            <div style="${bgStyle} border: 1px solid var(--border-color); border-radius: 10px; padding: 12px; margin-bottom: 8px; display: flex; gap: 12px; align-items: flex-start; transition: transform 0.15s ease;">
                <div style="font-size: 1.25rem; margin-top: 2px;">
                    ${iconHtml}
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px;">
                        <h4 style="margin: 0; font-size: 0.9rem; font-weight: 700; color: var(--text-dark);">${escapeHTML(item.title)}</h4>
                        <span style="font-size: 0.75rem; color: var(--text-light); white-space: nowrap;">${timeAgo}</span>
                    </div>
                    <p style="margin: 4px 0 0 0; font-size: 0.82rem; color: var(--text-dark); line-height: 1.4; word-break: break-word;">${escapeHTML(item.body)}</p>
                </div>
                <button onclick="window.app.dismissNotification('${item.id}')" title="مسح الإشعار" style="background: transparent; border: none; color: #94a3b8; cursor: pointer; padding: 2px 4px; font-size: 0.85rem;">
                    ✕
                </button>
            </div>
        `;
    });

    listContainer.innerHTML = html;
}

/**
 * حذف إشعار فردي
 */
export function dismissNotification(notifId) {
    try {
        const rawHistory = localStorage.getItem('athar_notifications_history') || '[]';
        let history = JSON.parse(rawHistory);
        history = history.filter(item => item.id !== notifId);
        localStorage.setItem('athar_notifications_history', JSON.stringify(history));
        renderNotificationCenterList();
    } catch (e) {
        console.error("Dismiss notif error:", e);
    }
}

/**
 * مسح جميع الإشعارات
 */
export function clearAllNotifications() {
    localStorage.setItem('athar_notifications_history', '[]');
    localStorage.setItem('athar_notifications_unread_count', '0');
    updateNotificationBadgeUI();
    renderNotificationCenterList();
    showAtharNotification("تم مسح جميع الإشعارات بنجاح ✓");
}

/**
 * توجل إعداد تفعيل/إيقاف التنبيهات
 */
export function toggleNotificationsSetting(checkbox) {
    const isEnabled = checkbox.checked;
    setNotificationsEnabled(isEnabled);

    if (isEnabled) {
        requestNotificationPermission();
        showAtharNotification("تم تفعيل استقبال التنبيهات الفورية 🔔", "success");
    } else {
        showAtharNotification("تم إيقاف التنبيهات الفورية مؤقتاً 🔕", "info");
    }
}

function formatTimeAgo(timestamp) {
    if (!timestamp) return '';
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 60) return 'الآن';
    if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
    if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
    return `منذ ${Math.floor(diff / 86400)} يوم`;
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
                        data: { url: '/dashboard.html', action: 'transfer', tid: tid, type: 'transfer' }
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
                    data: { url: '/dashboard.html', action: 'lecture', lecId: newLec.id, type: 'lecture' }
                });
            });

            localStorage.setItem(storageKey, JSON.stringify(currentLecIds));

            // تشغيل رادار المتابعة التلقائي عند إضافة المحاضرة 3 فما فوق
            if (lectures.length >= 3) {
                triggerAtRiskRadarCheck(lectures.length);
            }
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

    const repliedStudents = students.filter(s =>
        !s.deleted && s.progress && s.progress[latestLec.id] === 'replied'
    );

    if (repliedStudents.length === 0) return;

    const reminderCooldownKey = `athar_replied_reminder_${latestLec.id}`;
    const lastReminder = localStorage.getItem(reminderCooldownKey);
    const now = Date.now();

    if (lastReminder && (now - parseInt(lastReminder, 10)) < (24 * 60 * 60 * 1000)) {
        return;
    }

    sendNativeNotification("⏳ تذكير بالمهام المعلقة", {
        body: `لديك (${repliedStudents.length}) طلاب مسجلين كـ 'رد ولم يختبر' في (${latestLec.title}). بادر بتشجيعهم الآن للبدء في الاختبار!`,
        tag: `replied-reminder-${latestLec.id}`,
        data: { url: '/dashboard.html', action: 'replied', type: 'replied' }
    });

    localStorage.setItem(reminderCooldownKey, now.toString());
}

/* ==========================================================================
   🎯 رادار التسرب والمتابعة المبكرة (At-Risk Students Radar)
   ========================================================================== */

/**
 * خوارزمية رصد الطلاب المعرضين للتسرب بعد تميز سابق
 */
export function detectAtRiskStudents() {
    const activeStudents = (state.students || []).filter(s => !s.deleted);
    const lectures = state.lectures || [];
    const totalLec = lectures.length;

    if (totalLec < 3 || activeStudents.length === 0) {
        return [];
    }

    const atRiskList = [];
    const recentCount = Math.min(3, Math.max(2, Math.floor(totalLec / 2)));
    const pastLectures = lectures.slice(0, totalLec - recentCount);
    const recentLectures = lectures.slice(totalLec - recentCount);

    activeStudents.forEach(student => {
        if (!student.name || !student.name.trim()) return;

        let pastAttended = 0;
        let recentAttended = 0;
        let recentReplied = 0;

        if (student.progress) {
            pastLectures.forEach(lec => {
                const p = student.progress[lec.id];
                if (p && p !== 'replied') pastAttended++;
            });

            recentLectures.forEach(lec => {
                const p = student.progress[lec.id];
                if (p && p !== 'replied') recentAttended++;
                else if (p === 'replied') recentReplied++;
            });
        }

        const pastRate = pastLectures.length > 0 ? (pastAttended / pastLectures.length) : 0;
        const recentRate = recentLectures.length > 0 ? (recentAttended / recentLectures.length) : 0;

        // شرط التراجع: كان أداؤه ممتازاً/جيداً (>= 50%) وتراجع في المحاضرات الأخيرة (<= 34% حضور)
        if (pastRate >= 0.5 && recentRate <= 0.34) {
            let riskLevel = 'moderate';
            let riskTitle = 'تراجع يستوجب المتابعة ⚠️';
            let riskColor = '#f39c12';

            if (pastRate >= 0.75 && recentAttended === 0) {
                riskLevel = 'high';
                riskTitle = 'خطر انقطاع مرتفع 🔴';
                riskColor = '#e74c3c';
            }

            atRiskList.push({
                student,
                pastAttended,
                pastTotal: pastLectures.length,
                pastPercent: Math.round(pastRate * 100),
                recentAttended,
                recentTotal: recentLectures.length,
                recentPercent: Math.round(recentRate * 100),
                recentReplied,
                riskLevel,
                riskTitle,
                riskColor
            });
        }
    });

    // ترتيب الحالات حسب شدة التراجع
    atRiskList.sort((a, b) => (b.pastPercent - b.recentPercent) - (a.pastPercent - a.recentPercent));

    return atRiskList;
}

/**
 * تشغيل فحص وإشعار الرادار عند إضافة محاضرة جديدة
 */
export function triggerAtRiskRadarCheck(lectureCount) {
    const atRiskList = detectAtRiskStudents();
    if (atRiskList.length === 0) return;

    const cooldownKey = `athar_at_risk_notif_lec_${lectureCount}`;
    if (localStorage.getItem(cooldownKey)) return;
    localStorage.setItem(cooldownKey, 'true');

    sendNativeNotification("🎯 رادار المتابعة والتسرب", {
        body: `تم رصد (${atRiskList.length}) طلاب بدأ أداؤهم في التراجع بعد تميز سابق في المحاضرات الأخيرة. اضغط للاطلاع وتداركهم!`,
        tag: `at-risk-radar-${lectureCount}`,
        data: { url: '/dashboard.html', action: 'at_risk', type: 'at_risk' }
    });
}

/**
 * فتح نافذة رادار المتابعة
 */
export function openAtRiskRadar() {
    const modal = document.getElementById('at-risk-radar-modal');
    const content = document.getElementById('at-risk-radar-content');
    const totalSpan = document.getElementById('at-risk-total-count');
    if (!modal || !content) return;

    const atRiskList = detectAtRiskStudents();

    if (totalSpan) totalSpan.innerText = `إجمالي الحالات المرصودة: ${atRiskList.length} طالب`;

    if (state.lectures.length < 3) {
        content.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: var(--text-light);">
                <i class="fa-solid fa-chart-line" style="font-size: 2.5rem; color: #cbd5e1; margin-bottom: 12px;"></i>
                <h4 style="margin: 0; color: var(--text-dark);">الرادار يتطلب 3 محاضرات على الأقل</h4>
                <p style="font-size: 0.85rem; margin: 6px 0 0 0;">يقوم الرادار بمقارنة التميز في المحاضرات الأولى مع المحاضرات الأخيرة لكشف الانحدار.</p>
            </div>
        `;
    } else if (atRiskList.length === 0) {
        content.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: var(--text-light);">
                <i class="fa-solid fa-circle-check" style="font-size: 2.5rem; color: #27ae60; margin-bottom: 12px;"></i>
                <h4 style="margin: 0; color: #27ae60;">أداء طلابك ممتاز ومستقر! 🎉</h4>
                <p style="font-size: 0.85rem; margin: 6px 0 0 0;">لم يتم رصد أي تراجع أو انقطاع مفاجئ لدى الطلاب المتميزين.</p>
            </div>
        `;
    } else {
        const highRiskCount = atRiskList.filter(item => item.riskLevel === 'high').length;

        let cardsHtml = `
            <div style="background: linear-gradient(135deg, rgba(26, 93, 58, 0.08) 0%, rgba(212, 175, 55, 0.12) 100%); border: 1.5px solid var(--accent-gold); border-radius: 12px; padding: 14px 16px; margin-bottom: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <h4 style="margin: 0; font-size: 0.95rem; color: var(--primary-green); font-weight: bold;">
                            <i class="fa-solid fa-wand-magic-sparkles" style="color: var(--accent-gold);"></i> المتابعة الذكية بالذكاء الاصطناعي
                        </h4>
                        <p style="margin: 3px 0 0 0; font-size: 0.8rem; color: var(--text-dark);">
                            يقوم النظام بتوليد رسائل تشجيع مخصصة لكل طالب تشيد بتميزه السابق وتحثه على إكمال المسير وتزويده برابط المحاضرة فورياً.
                        </p>
                    </div>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        ${highRiskCount > 0 ? `
                            <button onclick="window.app.startRadarAIMessagingFlow('high')" class="btn-save-notes" style="width: auto; margin: 0; padding: 8px 14px; font-size: 0.85rem; background: #e74c3c;">
                                <i class="fa-solid fa-bolt"></i> مراسلة الحالات الحرجة 🔴 (${highRiskCount})
                            </button>
                        ` : ''}
                        <button onclick="window.app.startRadarAIMessagingFlow('all')" class="btn-save-notes" style="width: auto; margin: 0; padding: 8px 14px; font-size: 0.85rem; background: var(--primary-green);">
                            <i class="fa-solid fa-paper-plane"></i> بدء طابور الإرسال للجميع (${atRiskList.length}) 🚀
                        </button>
                    </div>
                </div>
            </div>
        `;

        atRiskList.forEach(item => {
            const s = item.student;
            const safeName = escapeHTML(s.name || 'بدون اسم');
            const safePhone = escapeHTML(s.phone || '');
            const cleanP = cleanPhone(s.phone);

            cardsHtml += `
                <div style="background: var(--bg-light); border: 1px solid var(--border-color); border-right: 5px solid ${item.riskColor}; border-radius: 10px; padding: 14px; margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <strong style="font-size: 1rem; color: var(--text-dark);">${safeName}</strong>
                            <span style="font-size: 0.75rem; background: ${item.riskColor}; color: white; padding: 2px 8px; border-radius: 10px; font-weight: bold;">
                                ${item.riskTitle}
                            </span>
                        </div>
                        <div style="direction: ltr; font-family: monospace; font-size: 0.85rem; color: var(--text-light);">
                            ${safePhone}
                        </div>
                    </div>

                    <div style="display: flex; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; font-size: 0.85rem;">
                        <div style="background: rgba(39, 174, 96, 0.1); color: #27ae60; padding: 4px 10px; border-radius: 6px; font-weight: bold;">
                            <i class="fa-solid fa-arrow-trend-up"></i> الأداء السابق: ${item.pastAttended}/${item.pastTotal} (${item.pastPercent}%)
                        </div>
                        <div style="background: rgba(231, 76, 60, 0.1); color: #e74c3c; padding: 4px 10px; border-radius: 6px; font-weight: bold;">
                            <i class="fa-solid fa-arrow-trend-down"></i> الأداء الأخير: ${item.recentAttended}/${item.recentTotal} (${item.recentPercent}%)
                        </div>
                    </div>

                    <div style="display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap;">
                        <button onclick="window.app.startSingleRadarAIMessage(${s.id})" class="btn-action" style="background: linear-gradient(135deg, #1A5D3A 0%, #114027 100%); color: white; border: 1px solid var(--accent-gold); padding: 5px 12px; font-size: 0.8rem; border-radius: 6px; display: inline-flex; align-items: center; gap: 5px;">
                            <i class="fa-solid fa-wand-magic-sparkles" style="color: var(--accent-gold);"></i> مراسلة ذكية بالـ AI
                        </button>
                        ${cleanP ? `
                            <a href="https://wa.me/${cleanP}" target="_blank" class="btn-action" style="background: #25D366; color: white; border: none; padding: 5px 12px; font-size: 0.8rem; text-decoration: none; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px;">
                                <i class="fa-brands fa-whatsapp"></i> فتح المحادثة
                            </a>
                        ` : ''}
                    </div>
                </div>
            `;
        });

        content.innerHTML = cardsHtml;
    }

    modal.style.display = 'flex';
}

export function closeAtRiskRadar() {
    const modal = document.getElementById('at-risk-radar-modal');
    if (modal) modal.style.display = 'none';
}

/**
 * تحديث شارة رادار المتابعة في لوحة التحكم
 */
export function updateAtRiskRadarBadge() {
    const badge = document.getElementById('at-risk-badge');
    if (!badge) return;

    const atRiskList = detectAtRiskStudents();
    if (atRiskList.length > 0) {
        badge.innerText = atRiskList.length;
        badge.style.display = 'inline-block';
    } else {
        badge.style.display = 'none';
    }
}

// تشغيل الـ PWA تلقائياً
initPWA();
