/**
 * منصة أثر التعليمية - إعداد وانضمام المجموعات (Group Setup Controller)
 */

import { auth, db, ref, set, get, update } from "./firebase-config.js";
import { state, currentUser, setCurrentUser, setCurrentGroup, showLoader, removeLoader } from "./state.js";
import { showAtharNotification } from "./utils.js";
import { initPageAuth } from "./router.js";
import { handleLogout } from "./auth.js";

/**
 * تهيئة صفحة إعداد المجموعة
 */
export async function initSetup() {
    showLoader("جاري التحقق من بيانات الحساب...");
    const { user, userData, activeGroupId } = await initPageAuth();
    removeLoader();

    if (activeGroupId) {
        if (userData.role === 'group_supervisor') {
            window.location.href = '/reports';
        } else {
            window.location.href = '/dashboard';
        }
        return;
    }

    // إظهار القسم المناسب حسب الدور
    const createSection = document.getElementById('create-group-section');
    const joinSection = document.getElementById('join-group-section');

    if (userData.role === 'group_supervisor') {
        if (createSection) createSection.style.display = 'block';
        if (joinSection) joinSection.style.display = 'none';
    } else {
        if (createSection) createSection.style.display = 'none';
        if (joinSection) joinSection.style.display = 'block';
    }
}

/**
 * إنشاء مجموعة جديدة
 */
export async function createGroupFlow() {
    const nameElem = document.getElementById('new-group-name');
    const numberElem = document.getElementById('new-group-number');
    const lecturesElem = document.getElementById('new-group-lectures');

    if (!nameElem || !numberElem) return;

    const name = nameElem.value.trim();
    const number = numberElem.value.trim();
    const totalLectures = lecturesElem ? (parseInt(lecturesElem.value) || 12) : 12;

    if (!name || !number) {
        showAtharNotification("برجاء إدخال اسم ورقم المجموعة", "error");
        return;
    }

    const uid = currentUser?.uid || auth.currentUser?.uid;
    if (!uid) {
        showAtharNotification("جلسة المستخدم غير صالحة. يرجى تسجيل الدخول مجدداً.", "error");
        window.location.href = '/login';
        return;
    }

    const cleanName = name.replace(/\s+/g, '-').substring(0, 10);
    const randomCode = Math.random().toString(36).substr(2, 4).toUpperCase();
    const groupId = `${cleanName}-${number}-${randomCode}`;

    try {
        showLoader("جاري إنشاء المجموعة وحفظ الصلاحيات...");

        // 1. إنشاء معلومات المجموعة
        await set(ref(db, `athar_groups/${groupId}/info`), {
            name: name,
            number: number,
            totalLectures: totalLectures,
            adminUid: uid,
            createdAt: Date.now()
        });

        // 2. ضبط إعدادات المحاضرات للمجموعة
        await set(ref(db, `athar_groups/${groupId}/data/settings`), {
            totalPlannedLectures: totalLectures
        });

        // 3. تحديث بيانات المستخدم
        const userRef = ref(db, `users/${uid}`);
        const userSnap = await get(userRef);
        let groups = [];
        if (userSnap.exists() && userSnap.val().groups) {
            groups = userSnap.val().groups;
        }
        if (!groups.includes(groupId)) {
            groups.push(groupId);
        }

        await update(userRef, {
            groupId: groupId,
            activeGroupId: groupId,
            groups: groups,
            role: 'group_supervisor'
        });

        if (state.userInfo) {
            state.userInfo.groupId = groupId;
            state.userInfo.activeGroupId = groupId;
            state.userInfo.groups = groups;
            state.userInfo.role = 'group_supervisor';
        }

        setCurrentGroup({ id: groupId, name: name, number: number, adminUid: uid, totalLectures: totalLectures });

        showAtharNotification(`تم إنشاء المجموعة بنجاح! كود المجموعة هو: ${groupId}`);
        setTimeout(() => {
            window.location.href = '/reports';
        }, 800);
    } catch (error) {
        removeLoader();
        console.error("Create group error:", error);
        showAtharNotification("خطأ في إنشاء المجموعة: " + error.message, "error");
    }
}

/**
 * الانضمام إلى مجموعة موجودة
 */
export async function joinGroupFlow() {
    const groupIdInput = document.getElementById('join-group-id');
    if (!groupIdInput) return;

    const inputCode = groupIdInput.value.trim();
    if (!inputCode) {
        showAtharNotification("يرجى إدخال كود المجموعة", "error");
        return;
    }

    const uid = currentUser?.uid || auth.currentUser?.uid;
    if (!uid) {
        showAtharNotification("جلسة المستخدم غير صالحة. يرجى تسجيل الدخول مجدداً.", "error");
        window.location.href = '/login';
        return;
    }

    try {
        showLoader("جاري التحقق من كود المجموعة...");
        let validGroupId = null;

        // 1. فحص الكود المباشر
        const directSnap = await get(ref(db, `athar_groups/${inputCode}/info`));
        if (directSnap.exists()) {
            validGroupId = inputCode;
        } else {
            // 2. فحص الكود بعد التحويل لأحرف كبيرة
            const upperCode = inputCode.toUpperCase();
            const upperSnap = await get(ref(db, `athar_groups/${upperCode}/info`));
            if (upperSnap.exists()) {
                validGroupId = upperCode;
            } else {
                // 3. فحص كافة المجموعات لتلافي مشاكل الفراغات أو الحروف
                const allGroupsSnap = await get(ref(db, `athar_groups`));
                if (allGroupsSnap.exists()) {
                    const groupsData = allGroupsSnap.val();
                    for (const gid of Object.keys(groupsData)) {
                        if (gid.trim().toLowerCase() === inputCode.toLowerCase()) {
                            validGroupId = gid;
                            break;
                        }
                    }
                }
            }
        }

        if (validGroupId) {
            // تحديث بيانات المستخدم
            const userRef = ref(db, `users/${uid}`);
            const userSnap = await get(userRef);
            let groups = [];
            if (userSnap.exists() && userSnap.val().groups) {
                groups = userSnap.val().groups;
            }
            if (!groups.includes(validGroupId)) {
                groups.push(validGroupId);
            }

            await update(userRef, {
                groupId: validGroupId,
                activeGroupId: validGroupId,
                groups: groups,
                role: 'followup_supervisor'
            });

            // التأكد من تسجيل المشرف في قائمة مشرفي المجموعة
            const supervisorRef = ref(db, `athar_groups/${validGroupId}/students/${uid}`);
            const supSnap = await get(supervisorRef);
            if (!supSnap.exists()) {
                await set(supervisorRef, {
                    name: state.userInfo?.name || auth.currentUser?.displayName || "مشرف متابعة",
                    students: []
                });
            }

            if (state.userInfo) {
                state.userInfo.groupId = validGroupId;
                state.userInfo.activeGroupId = validGroupId;
                state.userInfo.groups = groups;
                state.userInfo.role = 'followup_supervisor';
            }

            showAtharNotification("تم الانضمام للمجموعة بنجاح!");
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 800);
        } else {
            removeLoader();
            showAtharNotification("كود المجموعة غير صحيح، تأكد من نسخه بدقة", "error");
        }
    } catch (error) {
        removeLoader();
        console.error("Join group error:", error);
        showAtharNotification("خطأ في الانضمام: " + error.message, "error");
    }
}

// ربط الدوال العالمية
window.app = {
    createGroup: () => createGroupFlow(),
    joinGroup: () => joinGroupFlow(),
    logout: () => handleLogout()
};

// بدء تشغيل صفحة الإعداد فوراً وبأمان
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSetup);
} else {
    initSetup();
}
