/**
 * منصة أثر التعليمية - التوجيه وحماية الصفحات والعمل بدون إنترنت (Route Guards & Offline Auth)
 */

import { auth, db, ref, get, onAuthStateChanged } from "./firebase-config.js";
import {
    state, setCurrentUser, setCurrentGroup, getCachedUser,
    getCachedUserData, setCachedUserData, loadStateFromLocalStorage,
    initOfflineSyncEngine
} from "./state.js";
import { showAtharNotification } from "./utils.js";

let lastBackPressTime = 0;
let isBackGuardActive = false;

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
            // ضغط مرتين سريعاً -> السماح بالخروج
            return;
        }

        // النقر للمرة الأولى -> إعادة دفع الحالة وعرض التنبيه
        lastBackPressTime = now;
        history.pushState({ atharPage: 'app_root' }, '', window.location.href);
        showAtharNotification("اضغط رجوع مرة أخرى للخروج من التطبيق 📱", "info");
    });
}

/**
 * حماية الصفحات: تتأكد من أن المستخدم مسجل ولديه دور ومجموعة مع دعم كامل للعمل بدون إنترنت (Offline-First)
 * تُستخدم في dashboard.html و reports.html و setup.html
 */
export function initPageAuth(requiredRole = null) {
    // تفعيل حماية زر الرجوع المزدوج ومحرك المزامنة فوراً
    setupDoubleBackToExit();

    return new Promise((resolve) => {
        const cachedUser = getCachedUser();
        const cachedUserData = getCachedUserData();

        onAuthStateChanged(auth, async (user) => {
            const activeUser = user || cachedUser;

            if (!activeUser) {
                // ليس مسجل دخول وليس هناك كاش -> توجيه لصفحة الدخول
                window.location.replace('/');
                return;
            }

            setCurrentUser(activeUser);

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

            // استخدام البيانات المخزنة محلياً عند عدم الاتصال أو الفشل
            if (!userData) {
                userData = cachedUserData;
            }

            if (!userData) {
                window.location.replace('/');
                return;
            }

            state.userInfo = userData;
            const activeGroupId = userData.activeGroupId || userData.groupId;

            // إذا كانت الصفحة الحالية ليست setup.html والمستخدم ليس لديه مجموعة
            const currentPath = window.location.pathname;
            if (!activeGroupId && !currentPath.includes('setup')) {
                window.location.replace('/setup');
                return;
            }

            // تحميل بيانات المجموعة محلياً لتسريع العرض
            if (activeGroupId) {
                loadStateFromLocalStorage(activeGroupId);
            }

            // التحقق من الصلاحيات
            if (requiredRole && userData.role !== requiredRole) {
                if (userData.role === 'group_supervisor') {
                    window.location.replace('/reports');
                } else {
                    window.location.replace('/dashboard');
                }
                return;
            }

            // تحديث اسم المستخدم في الهيدر إن وجد
            const displayNameElem = document.getElementById('user-display-name');
            if (displayNameElem && userData.name) {
                displayNameElem.innerText = userData.name;
            }

            resolve({ user: activeUser, userData, activeGroupId });
        });
    });
}

/**
 * حماية صفحة الدخول: إذا كان المستخدم مسجل بالفعل، يتم تحويله للوحة التحكم
 */
export function checkAlreadyLoggedIn() {
    onAuthStateChanged(auth, async (user) => {
        const cachedUser = getCachedUser();
        const cachedUserData = getCachedUserData();
        const activeUser = user || cachedUser;

        if (activeUser) {
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
