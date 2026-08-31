/**
 * منصة أثر التعليمية - إدارة الحالة (State Management & Firebase Sync)
 * الكائن المركزي للحالة والمزامنة مع قاعدة البيانات مع مؤشر التحديث الفوري
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
}

export function setCurrentGroup(group) {
    currentGroup = group;
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

// دالة حفظ البيانات في Firebase مع مؤشر المزامنة
export async function saveData(silent = false) {
    if (!currentUser || !currentGroup) return;

    if (!silent) {
        showSyncIndicator("جاري حفظ التعديلات...");
    }

    const groupId = currentGroup.id;
    const updates = {};

    // 1. حفظ الطلاب بناءً على الدور
    if (state.userInfo && state.userInfo.role === 'followup_supervisor') {
        updates[`athar_groups/${groupId}/students/${currentUser.uid}`] = {
            name: state.userInfo?.name || "مشرف متابعة",
            phone: state.userInfo?.phone || "",
            students: state.students,
            lastUpdate: Date.now(),
            msgCount: state.userInfo.msgCount || 0,
            msgTypesCount: state.userInfo.msgTypesCount || {}
        };
        updates[`users/${currentUser.uid}/msgCount`] = state.userInfo.msgCount || 0;
        updates[`users/${currentUser.uid}/msgTypesCount`] = state.userInfo.msgTypesCount || {};
        updates[`users/${currentUser.uid}/phone`] = state.userInfo.phone || "";
    } else {
        if (state.students && state.students.length > 0) {
            updates[`athar_groups/${groupId}/data/students`] = state.students;
        }
    }

    // 2. تحديث المحاضرات والإعدادات
    updates[`athar_groups/${groupId}/data/lectures`] = state.lectures;
    updates[`athar_groups/${groupId}/data/settings`] = state.settings;

    try {
        await update(ref(db), updates);
        if (!silent) {
            hideSyncIndicator("تم الحفظ بنجاح ✓");
        }
    } catch (error) {
        console.error("Sync Error:", error);
        if (!silent) {
            hideSyncIndicator("فشل الحفظ ❌", true);
        }
        showAtharNotification("⚠️ خطأ في الاتصال بالإنترنت، تعذر الحفظ: " + error.message, "error");
        throw error;
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
