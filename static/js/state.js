/**
 * منصة أثر التعليمية - إدارة الحالة والعمل بدون إنترنت (Offline-First State Management & Sync)
 * الكائن المركزي للحالة مع التخزين المحلي والمزامنة التلقائية فور عودة الاتصال مع الحفاظ على التوقيت الدقيق
 */

import { db, ref, update } from "./firebase-config.js";
import { showAtharNotification } from "./utils.js";

// الحالة المركزية للتطبيق
export const state = {
    students: [],
    lectures: [],
    settings: {
        totalPlannedLectures: 12,
        certificate: {
            template: '/static/assets/certificate_template.jpg',
            name: { x: 530, y: 660, show: true },
            date: { x: 536, y: 1126, show: true },
            lecture: { x: 1072, y: 1019, show: false }
        }
    },
    messageBatchCount: 0,
    userInfo: null,
    groupInfo: null,
    allSupervisorsData: {}
};

export let currentUser = null;
export let currentGroup = null;

export function setCurrentUser(user) {
    currentUser = user;
    if (user) {
        try {
            localStorage.setItem('athar_cached_user', JSON.stringify({
                uid: user.uid,
                email: user.email,
                displayName: user.displayName
            }));
        } catch (e) {
            console.warn("Could not cache user:", e);
        }
    }
}

export function setCurrentGroup(group) {
    currentGroup = group;
}

export function getCachedUser() {
    try {
        const str = localStorage.getItem('athar_cached_user');
        return str ? JSON.parse(str) : null;
    } catch (e) {
        return null;
    }
}

export function getCachedUserData() {
    try {
        const str = localStorage.getItem('athar_cached_user_data');
        return str ? JSON.parse(str) : null;
    } catch (e) {
        return null;
    }
}

export function setCachedUserData(userData) {
    try {
        localStorage.setItem('athar_cached_user_data', JSON.stringify(userData));
    } catch (e) {
        console.warn("Could not cache user data:", e);
    }
}

/* ==========================================================================
   💾 التخزين المحلي لحالة المجموعة (Local State Persistence)
   ========================================================================== */

export function saveStateToLocalStorage(groupId = null) {
    const gid = groupId || (currentGroup ? currentGroup.id : null);
    if (!gid) return;

    try {
        const snapshot = {
            students: state.students || [],
            lectures: state.lectures || [],
            settings: state.settings || {},
            userInfo: state.userInfo || {},
            groupInfo: state.groupInfo || {},
            allSupervisorsData: state.allSupervisorsData || {},
            savedAt: Date.now()
        };
        localStorage.setItem(`athar_offline_state_${gid}`, JSON.stringify(snapshot));
    } catch (e) {
        console.warn("Failed to persist state locally:", e);
    }
}

export function loadStateFromLocalStorage(groupId) {
    if (!groupId) return false;
    try {
        const raw = localStorage.getItem(`athar_offline_state_${groupId}`);
        if (!raw) return false;

        const snapshot = JSON.parse(raw);
        if (snapshot.students) state.students = snapshot.students;
        if (snapshot.lectures) state.lectures = snapshot.lectures;
        if (snapshot.settings) state.settings = snapshot.settings;
        if (snapshot.userInfo && !state.userInfo) state.userInfo = snapshot.userInfo;
        if (snapshot.groupInfo && !state.groupInfo) state.groupInfo = snapshot.groupInfo;
        if (snapshot.allSupervisorsData) state.allSupervisorsData = snapshot.allSupervisorsData;
        return true;
    } catch (e) {
        console.warn("Failed to load local state:", e);
        return false;
    }
}

/* ==========================================================================
   ⚡ طابور العمليات غير المتصلة (Offline Sync Queue)
   ========================================================================== */

const OFFLINE_QUEUE_KEY = 'athar_offline_queue';

export function getOfflineQueue() {
    try {
        const str = localStorage.getItem(OFFLINE_QUEUE_KEY);
        return str ? JSON.parse(str) : [];
    } catch (e) {
        return [];
    }
}

export function queueOfflineAction(action) {
    try {
        const queue = getOfflineQueue();
        queue.push({
            id: 'sync_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            ...action,
            queuedAt: Date.now()
        });
        localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
        updateOfflineBannerUI();
    } catch (e) {
        console.warn("Failed to queue offline action:", e);
    }
}

export function clearOfflineQueue() {
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
    updateOfflineBannerUI();
}

let isFlushingQueue = false;

export async function flushOfflineSyncQueue() {
    if (isFlushingQueue) return;
    if (!navigator.onLine) return;

    const queue = getOfflineQueue();
    if (queue.length === 0) return;

    isFlushingQueue = true;
    showSyncIndicator(`جاري مزامنة (${queue.length}) تعديل محفوظ...`);

    try {
        for (const item of queue) {
            if (item.updates) {
                await update(ref(db), item.updates);
            }
        }
        clearOfflineQueue();
        hideSyncIndicator("تمت مزامنة جميع التعديلات بنجاح ✓");
        showAtharNotification("🟢 تم استعادة الاتصال ومزامنة كافة التعديلات المحفوظة بنجاح مع الحفاظ على التوقيت الدقيق!", "success");
    } catch (err) {
        console.error("Error flushing offline queue:", err);
        hideSyncIndicator("تعذر إكمال المزامنة ⚠️", true);
    } finally {
        isFlushingQueue = false;
        updateOfflineBannerUI();
    }
}

/* ==========================================================================
   📴 مؤشر وشريط وضع العمل بدون إنترنت (Offline Status Banner)
   ========================================================================== */

export function updateOfflineBannerUI() {
    let banner = document.getElementById('offline-status-banner');
    const isOffline = !navigator.onLine;
    const queue = getOfflineQueue();

    if (isOffline || queue.length > 0) {
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'offline-status-banner';
            banner.style.cssText = "position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg, #1e293b 0%, #0f172a 100%);color:white;padding:10px 18px;border-radius:30px;box-shadow:0 8px 24px rgba(0,0,0,0.3);z-index:99998;display:flex;align-items:center;gap:10px;font-size:0.85rem;border:1px solid rgba(255,255,255,0.15);transition:all 0.3s ease;";
            document.body.appendChild(banner);
        }

        if (isOffline) {
            banner.innerHTML = `
                <i class="fa-solid fa-wifi-slash" style="color: #e74c3c; font-size: 1rem;"></i>
                <span><strong>أنت تعمل بدون اتصال</strong> | يتم الحفظ محلياً (${queue.length} تعديل معلق)</span>
            `;
            banner.style.display = 'flex';
        } else if (queue.length > 0) {
            banner.innerHTML = `
                <i class="fa-solid fa-rotate fa-spin" style="color: var(--accent-gold); font-size: 1rem;"></i>
                <span>جاري إرسال (${queue.length}) تعديل تم إجراؤه في وضع الأوفلاين...</span>
                <button onclick="window.app.flushOfflineSyncQueue()" style="background:var(--primary-green);color:white;border:none;padding:3px 10px;border-radius:12px;font-size:0.75rem;cursor:pointer;">مزامنة الآن</button>
            `;
            banner.style.display = 'flex';
        }
    } else {
        if (banner) banner.style.display = 'none';
    }
}

export function initOfflineSyncEngine() {
    window.addEventListener('online', () => {
        updateOfflineBannerUI();
        flushOfflineSyncQueue();
    });

    window.addEventListener('offline', () => {
        updateOfflineBannerUI();
        showAtharNotification("📴 انقطع الاتصال بالإنترنت. يمكنك الاستمرار في العمل وسيتم حفظ جميع التعديلات بأوقاتها الفعلية.", "info");
    });

    // مراقبة دورية كل 30 ثانية في حالة وجود عناصر معلقة
    setInterval(() => {
        if (navigator.onLine && getOfflineQueue().length > 0) {
            flushOfflineSyncQueue();
        }
    }, 30000);

    updateOfflineBannerUI();
}

// مؤشر المزامنة العلوي (Live Sync Indicator)
let syncIndicatorTimeout = null;

export function showSyncIndicator(text = "جاري الحفظ والمزامنة...") {
    let indicator = document.getElementById('sync-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'sync-indicator';
        document.body.appendChild(indicator);
    }

    if (syncIndicatorTimeout) clearTimeout(syncIndicatorTimeout);

    indicator.className = 'show';
    indicator.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>${text}</span>`;
}

export function hideSyncIndicator(successText = "تم الحفظ بنجاح ✓", isError = false) {
    const indicator = document.getElementById('sync-indicator');
    if (!indicator) return;

    indicator.className = `show ${isError ? 'error' : 'success'}`;
    indicator.innerHTML = `<i class="fa-solid ${isError ? 'fa-circle-xmark' : 'fa-circle-check'}"></i> <span>${successText}</span>`;

    syncIndicatorTimeout = setTimeout(() => {
        indicator.className = '';
    }, 2200);
}

/* ==========================================================================
   🔄 دالة حفظ البيانات الموحدة (Online & Offline Unified Save)
   ========================================================================== */

export async function saveData(silent = false) {
    const uid = currentUser?.uid || state.userInfo?.uid || getCachedUser()?.uid;
    const groupId = currentGroup?.id || state.userInfo?.activeGroupId || state.userInfo?.groupId;

    if (!groupId) return;

    if (!silent) {
        showSyncIndicator("جاري حفظ التعديلات...");
    }

    // 1. الحفظ الفوري الدائم في التخزين المحلي أولاً
    saveStateToLocalStorage(groupId);

    // 2. إعداد كائن التحديثات مع الاحتفاظ بالتوقيتات الدقيقة
    const actionTimestamp = Date.now();
    const updates = {};

    if (state.userInfo && state.userInfo.role === 'followup_supervisor') {
        if (uid) {
            updates[`athar_groups/${groupId}/students/${uid}`] = {
                name: state.userInfo?.name || "مشرف متابعة",
                phone: state.userInfo?.phone || "",
                students: state.students || [],
                lastUpdate: actionTimestamp,
                msgCount: state.userInfo.msgCount || 0,
                msgTypesCount: state.userInfo.msgTypesCount || {}
            };
            updates[`users/${uid}/msgCount`] = state.userInfo.msgCount || 0;
            updates[`users/${uid}/msgTypesCount`] = state.userInfo.msgTypesCount || {};
            updates[`users/${uid}/phone`] = state.userInfo.phone || "";
        }
    } else {
        if (state.students && state.students.length > 0) {
            updates[`athar_groups/${groupId}/data/students`] = state.students;
        }
    }

    // تحديث المحاضرات والإعدادات
    updates[`athar_groups/${groupId}/data/lectures`] = state.lectures || [];
    updates[`athar_groups/${groupId}/data/settings`] = state.settings || {};

    // 3. التحقق من حالة الشبكة
    if (!navigator.onLine) {
        // وضع عدم الاتصال: إضافة إلى الطابور والحفظ محلياً
        queueOfflineAction({
            groupId,
            uid,
            updates,
            timestamp: actionTimestamp
        });

        if (!silent) {
            hideSyncIndicator("تم الحفظ محلياً (بدون إنترنت) 📴");
        }
        return true;
    }

    // 4. وضع الاتصال: إرسال إلى Firebase
    try {
        await update(ref(db), updates);
        if (!silent) {
            hideSyncIndicator("تم الحفظ بنجاح ✓");
        }
        return true;
    } catch (error) {
        console.warn("Online sync failed, queuing for offline sync:", error);
        
        // عند حدوث خطأ شبكة مفاجئ يتم وضعه في الطابور تلقائياً
        queueOfflineAction({
            groupId,
            uid,
            updates,
            timestamp: actionTimestamp
        });

        if (!silent) {
            hideSyncIndicator("تم الحفظ محلياً (سيتم المزامنة لاحقاً) 📴");
        }
        return true;
    }
}

// إزالة اللودر الكامل
export function removeLoader() {
    const l = document.getElementById('firebase-loader');
    if (l) l.remove();
}

// إظهار اللودر الكامل
export function showLoader(text = "جاري تحميل البيانات...") {
    removeLoader();
    const loadingMsg = document.createElement('div');
    loadingMsg.id = 'firebase-loader';
    loadingMsg.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(14,59,36,0.9);backdrop-filter:blur(5px);z-index:99999;display:flex;justify-content:center;align-items:center;font-size:20px;font-weight:bold;color:#ffffff;";
    loadingMsg.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>&nbsp; ${text}`;
    document.body.appendChild(loadingMsg);
}
