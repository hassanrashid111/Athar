/**
 * منصة أثر التعليمية - التوجيه وحماية الصفحات (Route Guards & Back Button Interceptor)
 */

import { auth, db, ref, get, onAuthStateChanged } from "./firebase-config.js";
import { state, setCurrentUser, setCurrentGroup } from "./state.js";
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
    if (isBackGuardActive) return;
    isBackGuardActive = true;

    try {
        history.replaceState({ atharPage: 'app_root' }, '', window.location.href);
        history.pushState({ atharPage: 'app_root' }, '', window.location.href);
    } catch (e) {
        console.warn("History pushState warning:", e);
    }

    window.addEventListener('popstate', (event) => {
        // 1. فحص ما إذا كانت هناك أي نافذة منبثقة مفتوحة لإغلاقها أولاً
        const openModals = document.querySelectorAll('.modal-overlay');
        let modalClosed = false;
        openModals.forEach(modal => {
            if (modal && modal.style.display !== 'none' && modal.style.display !== '') {
                modal.style.display = 'none';
                modalClosed = true;
            }
        });

        // فحص القائمة الجانبية (Mobile Sidebar Menu)
        const mainMenu = document.getElementById('main-menu');
        const menuOverlay = document.getElementById('menu-overlay');
        if (mainMenu && mainMenu.classList.contains('active')) {
            mainMenu.classList.remove('active');
            if (menuOverlay) menuOverlay.classList.remove('active');
            modalClosed = true;
        }

        if (modalClosed) {
            history.pushState({ atharPage: 'app_root' }, '', window.location.href);
            return;
        }

        // 2. فحص النقر المزدوج للخروج
        const now = Date.now();
        if (now - lastBackPressTime < 2000) {
            // نقر مرتين متتاليتين -> نسمح بالخروج
            return;
        }

        // النقر للمرة الأولى -> إعادة دفع الحالة وعرض التنبيه
        lastBackPressTime = now;
        history.pushState({ atharPage: 'app_root' }, '', window.location.href);
        showAtharNotification("اضغط رجوع مرة أخرى للخروج من التطبيق 📱", "info");
    });
}

/**
 * حماية الصفحات: تتأكد من أن المستخدم مسجل ولديه دور ومجموعة
 * تُستخدم في dashboard.html و reports.html و setup.html
 */
export function initPageAuth(requiredRole = null) {
    // تفعيل حماية زر الرجوع المزدوج فوراً
    setupDoubleBackToExit();

    return new Promise((resolve) => {
        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                // ليس مسجل دخول -> توجيه لصفحة الدخول
                window.location.replace('/');
                return;
            }

            setCurrentUser(user);

            // جلب بيانات المستخدم
            try {
                const userSnapshot = await get(ref(db, `users/${user.uid}`));
                if (!userSnapshot.exists()) {
                    window.location.replace('/');
                    return;
                }

                const userData = userSnapshot.val();
                state.userInfo = userData;

                const activeGroupId = userData.activeGroupId || userData.groupId;

                // إذا كانت الصفحة الحالية ليست setup.html والمستخدم ليس لديه مجموعة
                const currentPath = window.location.pathname;
                if (!activeGroupId && !currentPath.includes('setup')) {
                    window.location.replace('/setup');
                    return;
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

                resolve({ user, userData, activeGroupId });
            } catch (err) {
                console.error("Auth Guard Error:", err);
                window.location.replace('/');
            }
        });
    });
}

/**
 * حماية صفحة الدخول: إذا كان المستخدم مسجل بالفعل، يتم تحويله للوحة التحكم
 */
export function checkAlreadyLoggedIn() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const userSnapshot = await get(ref(db, `users/${user.uid}`));
                if (userSnapshot.exists()) {
                    const userData = userSnapshot.val();
                    const activeGroupId = userData.activeGroupId || userData.groupId;
                    if (!activeGroupId) {
                        window.location.replace('/setup');
                    } else if (userData.role === 'group_supervisor') {
                        window.location.replace('/reports');
                    } else {
                        window.location.replace('/dashboard');
                    }
                }
            } catch (e) {
                console.error("Error checking login state:", e);
            }
        }
    });
}
