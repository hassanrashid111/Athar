/**
 * منصة أثر التعليمية - التوجيه وحماية الصفحات (Route Guards & Loader)
 */

import { auth, db, ref, get, onAuthStateChanged } from "./firebase-config.js";
import { state, setCurrentUser, setCurrentGroup } from "./state.js";

/**
 * حماية الصفحات: تتأكد من أن المستخدم مسجل ولديه دور ومجموعة
 * تُستخدم في dashboard.html و reports.html و setup.html
 */
export function initPageAuth(requiredRole = null) {
    return new Promise((resolve) => {
        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                // ليس مسجل دخول -> توجيه لصفحة الدخول
                window.location.href = '/';
                return;
            }

            setCurrentUser(user);

            // جلب بيانات المستخدم
            try {
                const userSnapshot = await get(ref(db, `users/${user.uid}`));
                if (!userSnapshot.exists()) {
                    window.location.href = '/';
                    return;
                }

                const userData = userSnapshot.val();
                state.userInfo = userData;

                const activeGroupId = userData.activeGroupId || userData.groupId;

                // إذا كانت الصفحة الحالية ليست setup.html والمستخدم ليس لديه مجموعة
                const currentPath = window.location.pathname;
                if (!activeGroupId && !currentPath.includes('setup')) {
                    window.location.href = '/setup';
                    return;
                }

                // التحقق من الصلاحيات
                if (requiredRole && userData.role !== requiredRole) {
                    if (userData.role === 'group_supervisor') {
                        window.location.href = '/reports';
                    } else {
                        window.location.href = '/dashboard';
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
                window.location.href = '/';
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
                        window.location.href = '/setup';
                    } else if (userData.role === 'group_supervisor') {
                        window.location.href = '/reports';
                    } else {
                        window.location.href = '/dashboard';
                    }
                }
            } catch (e) {
                console.error("Error checking login state:", e);
            }
        }
    });
}
