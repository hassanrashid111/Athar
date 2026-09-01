/**
 * منصة أثر التعليمية - التوجيه وحماية الصفحات والعمل بدون إنترنت (Route Guards & Offline Auth)
 * Phase 4: إضافة نظام حارس حالة النظام (System Status Gate)
 */

import { auth, db, ref, get, onValue, onAuthStateChanged } from "./firebase-config.js";
import {
    state, setCurrentUser, setCurrentGroup, getCachedUser,
    getCachedUserData, setCachedUserData, loadStateFromLocalStorage,
    initOfflineSyncEngine
} from "./state.js";
import { showAtharNotification } from "./utils.js";

/* ==========================================================================
   ⚙️ ثوابت النظام
   ========================================================================== */

/** البريد الإلكتروني للـ Super Admin — المصدر الوحيد للحقيقة */
const SUPER_ADMIN_EMAIL = 'hrhalsharif@gmail.com';

/** مسار حالة النظام في Firebase */
const SYSTEM_STATUS_REF = 'global_settings/system_status';

let lastBackPressTime = 0;
let isBackGuardActive = false;
let _systemStatusUnsubscribe = null; // reference to unsubscribe function

/* ==========================================================================
   🔒 System Status Gate — حارس حالة النظام
   ========================================================================== */

/**
 * قراءة حالة النظام مرة واحدة من Firebase
 * ✅ Blank-Slate Safe: إذا لم يكن المسار موجوداً (قاعدة بيانات فارغة) → 'paused'
 * @returns {Promise<'active'|'paused'>}
 */
export async function checkSystemStatus() {
    try {
        const snap = await get(ref(db, SYSTEM_STATUS_REF));
        // null (مسار غير موجود في قاعدة بيانات فارغة) → 'paused' دائماً
        return snap.val() ?? 'paused';
    } catch (e) {
        console.warn('[SystemStatus] Could not read status, defaulting to paused:', e?.message);
        return 'paused';
    }
}

/**
 * الاستماع الفوري لأي تغيير في حالة النظام (Realtime Listener)
 * إذا تغيرت الحالة إلى 'paused' أثناء جلسة مستخدم نشط → توجيه فوري للصفحة الرئيسية
 * @param {string} currentUserEmail - بريد المستخدم الحالي لاستثناء Super Admin
 */
export function subscribeSystemStatus(currentUserEmail = '') {
    // Super Admin لا يُطرد أبداً حتى لو أوقف النظام
    if (currentUserEmail === SUPER_ADMIN_EMAIL) return;

    // إلغاء الاشتراك السابق إن وجد
    if (_systemStatusUnsubscribe) {
        _systemStatusUnsubscribe();
        _systemStatusUnsubscribe = null;
    }

    _systemStatusUnsubscribe = onValue(
        ref(db, SYSTEM_STATUS_REF),
        (snap) => {
            // null (قاعدة فارغة) أو 'paused' → طرد المستخدم
            const status = snap.val() ?? 'paused';
            if (status === 'paused') {
                showAtharNotification('⏸️ تم إيقاف النظام مؤقتاً من قِبل الإدارة. شكراً لصبركم.', 'warning');
                setTimeout(() => {
                    window.location.replace('/');
                }, 2500);
            }
        },
        (error) => {
            console.warn('[SystemStatus] Realtime listener error:', error?.message);
        }
    );
}

/* ==========================================================================
   🔙 Double-Back-To-Exit Guard
   ========================================================================== */

/**
 * منع الخروج العرضي والرجوع لتسجيل الدخول:
 * 1. الضغط على زر الرجوع يغلق النوافذ المنبثقة أولاً إن وجدت.
 * 2. الضغط على زر الرجوع يظهر تنبيه "اضغط رجوع مرة أخرى للخروج من التطبيق".
 * 3. لا يتم تسجيل خروج المستخدم نهائياً إلا إذا ضغط على زر تسجيل الخروج عمداً.
 */
export function setupDoubleBackToExit() {
    // تفعيل محرك مزامنة الأوفلاين
    initOfflineSyncEngine();

    if (isBackGuardActive) return;
    isBackGuardActive = true;

    try {
        if (history.state?.atharPage !== 'app_root') {
            history.replaceState({ atharPage: 'app_root' }, '', window.location.href);
            history.pushState({ atharPage: 'app_root' }, '', window.location.href);
        }
    } catch (e) {
        console.warn("History pushState warning:", e);
    }

    window.addEventListener('popstate', (e) => {
        // 1. إذا كانت هناك نافذة منبثقة مفتوحة، نقوم بإغلاقها أولاً ومنع الخروج
        const openModal = document.querySelector('.modal-overlay[style*="display: flex"], .modal-overlay[style*="display: block"]');
        if (openModal) {
            openModal.style.display = 'none';
            history.pushState({ atharPage: 'app_root' }, '', window.location.href);
            return;
        }

        // 2. إذا كانت القائمة الجانبية أو المنظف مفتوحاً
        const openMenu = document.querySelector('#main-menu.active, #menu-overlay.active');
        if (openMenu) {
            document.querySelectorAll('#main-menu, #menu-overlay').forEach(el => el.classList.remove('active'));
            history.pushState({ atharPage: 'app_root' }, '', window.location.href);
            return;
        }

        // 3. التحقق من الضغط المزدوج على زر الرجوع (خلال ثانيتين)
        const now = Date.now();
        if (now - lastBackPressTime < 2000) {
            return; // السماح بالخروج
        }

        lastBackPressTime = now;
        history.pushState({ atharPage: 'app_root' }, '', window.location.href);
        showAtharNotification("اضغط رجوع مرة أخرى للخروج من التطبيق 📱", "info");
    });
}

/* ==========================================================================
   🛡️ Page Auth Guards
   ========================================================================== */

/**
 * حماية الصفحات: تتأكد من أن المستخدم مسجل ولديه دور ومجموعة مع دعم كامل للعمل بدون إنترنت (Offline-First)
 * تُستخدم في dashboard.html و reports.html و setup.html
 *
 * Phase 4 Update: تتحقق أيضاً من حالة النظام قبل السماح بالوصول.
 * Blank-Slate Safe: null status → 'paused' → توجيه لصفحة الانتظار
 */
export function initPageAuth(requiredRole = null) {
    setupDoubleBackToExit();

    return new Promise((resolve) => {
        const cachedUser = getCachedUser();
        const cachedUserData = getCachedUserData();

        onAuthStateChanged(auth, async (user) => {
            const activeUser = user || cachedUser;

            if (!activeUser) {
                window.location.replace('/');
                return;
            }

            setCurrentUser(activeUser);

            // ── التحقق من حالة النظام أولاً (Phase 4) ──────────────────────────
            // Super Admin يتجاوز هذا الفحص دائماً
            const userEmail = user?.email || cachedUserData?.email || '';
            if (userEmail !== SUPER_ADMIN_EMAIL && navigator.onLine) {
                const systemStatus = await checkSystemStatus();
                if (systemStatus === 'paused') {
                    // النظام موقوف → الصفحة الرئيسية ستعرض شاشة الانتظار
                    window.location.replace('/');
                    return;
                }
            }

            // 1. محاولة جلب بيانات المستخدم من Firebase أو الكاش
            let userData = null;
            try {
                if (navigator.onLine && user) {
                    const userSnapshot = await get(ref(db, `users/${user.uid}`));
                    if (userSnapshot.exists()) {
                        userData = userSnapshot.val();
                        setCachedUserData(userData);
                    }
                }
            } catch (err) {
                console.warn("Could not fetch user data online, falling back to cache:", err);
            }

            if (!userData) userData = cachedUserData;

            if (!userData) {
                window.location.replace('/');
                return;
            }

            state.userInfo = userData;
            const activeGroupId = userData.activeGroupId || userData.groupId;

            const currentPath = window.location.pathname;
            if (!activeGroupId && !currentPath.includes('setup')) {
                window.location.replace('/setup');
                return;
            }

            if (activeGroupId) {
                loadStateFromLocalStorage(activeGroupId);
            }

            if (requiredRole && userData.role !== requiredRole) {
                if (userData.role === 'group_supervisor') {
                    window.location.replace('/reports');
                } else {
                    window.location.replace('/dashboard');
                }
                return;
            }

            const displayNameElem = document.getElementById('user-display-name');
            if (displayNameElem && userData.name) {
                displayNameElem.innerText = userData.name;
            }

            // ── تفعيل الاستماع الفوري لتغييرات حالة النظام بعد النجاح ──────────
            subscribeSystemStatus(user?.email || '');

            resolve({ user: activeUser, userData, activeGroupId });
        });
    });
}

/**
 * حماية صفحة الدخول: إذا كان المستخدم مسجل بالفعل، يتم تحويله للوحة التحكم
 *
 * Phase 4 Update: إذا كان النظام موقوفاً (paused)، لا يتم تحويل المستخدمين العاديين —
 * يبقون في صفحة الانتظار. فقط Super Admin يُحوَّل.
 * Blank-Slate Safe: null status → 'paused' → المستخدم يرى شاشة الانتظار
 */
export function checkAlreadyLoggedIn() {
    onAuthStateChanged(auth, async (user) => {
        const cachedUser = getCachedUser();
        const cachedUserData = getCachedUserData();
        const activeUser = user || cachedUser;

        if (activeUser) {
            const isSuperAdmin = (activeUser?.email || cachedUserData?.email || '').toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();

            // Super Admin → دائماً يُحوَّل للوحة التحكم العليا فورياً
            if (isSuperAdmin) {
                window.location.replace('/super-admin');
                return;
            }

            let userData = null;
            try {
                if (navigator.onLine && user) {
                    const userSnapshot = await get(ref(db, `users/${user.uid}`));
                    if (userSnapshot.exists()) {
                        userData = userSnapshot.val();
                        setCachedUserData(userData);
                    }
                }
            } catch (e) {
                console.warn("Offline fallback on login check:", e);
            }

            if (!userData) userData = cachedUserData;

            if (userData) {
                // المستخدمون العاديون → فحص حالة النظام أولاً
                if (navigator.onLine) {
                    const systemStatus = await checkSystemStatus();
                    if (systemStatus === 'paused') {
                        // النظام موقوف → لا توجيه، يبقى في صفحة الانتظار
                        return;
                    }
                }

                const activeGroupId = userData.activeGroupId || userData.groupId;
                if (!activeGroupId) {
                    window.location.replace('/setup');
                } else if (userData.role === 'group_supervisor') {
                    window.location.replace('/reports');
                } else {
                    window.location.replace('/dashboard');
                }
            }
        }
    });
}

/* ==========================================================================
   👑 Super Admin Route Guard
   ========================================================================== */

/**
 * حارس صفحة /super-admin
 * يسمح فقط لـ hrhalsharif@gmail.com بالوصول
 * يُستخدم في super_admin.html
 * @returns {Promise<{user, email}>}
 */
export function initSuperAdminRoute() {
    return new Promise((resolve, reject) => {
        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                // غير مسجل → صفحة تسجيل الدخول
                window.location.replace('/');
                reject(new Error('Not authenticated'));
                return;
            }

            if ((user.email || '').toLowerCase() !== SUPER_ADMIN_EMAIL.toLowerCase()) {
                // مسجل لكن ليس Super Admin → لوحة التحكم العادية
                showAtharNotification('⛔ هذه الصفحة للإدارة العليا فقط.', 'error');
                setTimeout(() => {
                    window.location.replace('/dashboard');
                }, 1500);
                reject(new Error('Unauthorized'));
                return;
            }

            // Super Admin ✓ → السماح
            resolve({ user, email: user.email });
        });
    });
}
