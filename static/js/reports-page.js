/**
 * منصة أثر التعليمية - وحدة التحكم بصفحة التقارير لمشرف المجموعة (Reports Page Controller)
 */

import { db, ref, onValue, get, set, update, remove, child } from "./firebase-config.js";
import { state, currentUser, currentGroup, setCurrentGroup, saveData, showLoader, removeLoader } from "./state.js";
import { showAtharNotification, formatHijriDate, showAtharPrompt, showAtharConfirm, showAtharChoice } from "./utils.js";
import { hadithList } from "./hadith.js";
import { initPageAuth } from "./router.js";
import { handleLogout, openProfileModal, saveProfileChanges } from "./auth.js";
import {
    renderReports, showSupervisorFullReport, showSupervisorMsgTypes,
    getReportFile, backupData
} from "./reports.js";
import {
    addLectureFlow, deleteLectureFlow, openLectureSettings,
    saveLectureSettings, copyLectureId, copyLectureScript,
    deleteLectureFromSettings
} from "./lectures.js";
import {
    startMessagingFlow, resetMessageCounts, insertVariable,
    openAIInstructionsModal, saveAIInstructions
} from "./messaging.js";
import {
    openCertSettings, closeCertSettings, saveCertSettings,
    handleCertTemplateUpload, updateVisualMarkersPositions
} from "./certificates.js";
import {
    requestNotificationPermission, toggleNotificationCenter,
    openNotificationCenter, closeNotificationCenter, dismissNotification,
    clearAllNotifications, toggleNotificationsSetting, updateNotificationBadgeUI
} from "./pwa.js";

/**
 * تهيئة صفحة التقارير
 */
export async function initReportsPage() {
    loadTheme();
    renderDate();
    renderHadith();
    setupDropdownListeners();

    showLoader("جاري الاتصال وتحميل بيانات المجموعة...");
    const { user, userData, activeGroupId } = await initPageAuth('group_supervisor');

    if (activeGroupId) {
        listenToGroupReports(activeGroupId, user.uid);
    }

    setupMessageButtonListener();
}

/**
 * فتح وإغلاق قائمة الأدوات المنسدلة
 */
export function toggleToolsDropdown(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    const content = document.getElementById('tools-dropdown-content');
    if (content) {
        const isShown = content.classList.contains('show');
        document.querySelectorAll('.dropdown-content').forEach(d => {
            d.classList.remove('show');
            d.style.display = 'none';
        });
        if (!isShown) {
            content.classList.add('show');
            content.style.display = 'block';
        }
    }
}

/**
 * إعداد النقر على القوائم المنسدلة وإغلاق القائمة الجانبية عند النقر
 */
function setupDropdownListeners() {
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.dropdown')) {
            document.querySelectorAll('.dropdown-content').forEach(d => {
                d.classList.remove('show');
                d.style.display = 'none';
            });
        }
    });

    const menu = document.getElementById('main-menu');
    if (menu) {
        menu.querySelectorAll('button:not(.dropbtn), a').forEach(btn => {
            btn.addEventListener('click', () => {
                const overlay = document.getElementById('menu-overlay');
                if (menu.classList.contains('active')) {
                    menu.classList.remove('active');
                }
                if (overlay && overlay.classList.contains('active')) {
                    overlay.classList.remove('active');
                }
            });
        });
    }
}

/**
 * ضبط نص زر الإرسال بناءً على حالة مربع النص
 */
function setupMessageButtonListener() {
    const msgInput = document.getElementById('message-text');
    if (!msgInput) return;

    const updateBtn = () => {
        const sendBtn = document.querySelector('.messaging-card .btn-whatsapp');
        if (!sendBtn) return;

        if (!msgInput.value.trim()) {
            sendBtn.innerHTML = `
                <i class="fa-solid fa-wand-magic-sparkles" style="color: #fffb91;"></i>
                ✨ صياغة مخصصة بالذكاء الاصطناعي (AI)
                <i class="fa-brands fa-whatsapp"></i>
            `;
            sendBtn.style.background = "linear-gradient(135deg, #1A5D3A 0%, #25D366 100%)";
        } else {
            sendBtn.innerHTML = `
                إرسال للمشرفين عبر واتساب
                <i class="fa-solid fa-paper-plane"></i>
            `;
            sendBtn.style.background = "#25D366";
        }
    };

    msgInput.addEventListener('input', updateBtn);
    updateBtn();
}

/**
 * الاستماع لبيانات المجموعة والتقارير في الوقت الفعلي
 */
function listenToGroupReports(groupId, uid) {
    const groupRef = ref(db, `athar_groups/${groupId}`);

    onValue(groupRef, (snapshot) => {
        const groupData = snapshot.val();
        if (groupData) {
            setCurrentGroup({ id: groupId, ...groupData.info });
            state.groupInfo = groupData.info;

            state.lectures = groupData.data?.lectures || [];
            state.settings = groupData.data?.settings || { totalPlannedLectures: 12 };
            state.allSupervisorsData = groupData.students || {};

            if (!state.settings.certificate) {
                state.settings.certificate = {
                    template: '/static/assets/certificate_template.jpg',
                    name: { x: 530, y: 660, show: true },
                    date: { x: 536, y: 1126, show: true },
                    lecture: { x: 1072, y: 1019, show: false }
                };
            }

            renderReports(state.allSupervisorsData);
            renderGroupStats();
            removeLoader();
        }
    });
}

/**
 * تحديث بطاقات إحصائيات المجموعة لمشرف المجموعة
 */
export function renderGroupStats() {
    let totalStudents = 0;
    let absence = 0;
    const latestLecId = state.lectures.length > 0 ? state.lectures[state.lectures.length - 1].id : null;

    for (const uid in state.allSupervisorsData) {
        const supData = state.allSupervisorsData[uid];
        const students = Array.isArray(supData) ? supData : (supData.students || []);
        const activeStudents = students.filter(s => s && !s.deleted);

        totalStudents += activeStudents.length;

        if (latestLecId) {
            absence += activeStudents.filter(s =>
                !s.progress || !s.progress[latestLecId]
            ).length;
        }
    }

    const totalPlanned = state.settings.totalPlannedLectures || 12;
    const remaining = totalPlanned - state.lectures.length;

    const totalElem = document.getElementById('stat-total');
    const absenceElem = document.getElementById('stat-absence');
    const remainingElem = document.getElementById('stat-remaining');

    if (totalElem) totalElem.innerText = totalStudents;
    if (absenceElem) absenceElem.innerText = absence;
    if (remainingElem) remainingElem.innerText = remaining > 0 ? remaining : 0;
}

/**
 * إنشاء مجموعة جديدة إضافية
 */
export async function createNewGroup() {
    const name = await showAtharPrompt("إضافة مجموعة جديدة", "أدخل اسم المجموعة الجديدة:");
    if (!name) return;

    const number = await showAtharPrompt("إضافة مجموعة جديدة", "أدخل رقم المجموعة:");
    if (!number) return;

    const totalLectures = await showAtharPrompt("إضافة مجموعة جديدة", "عدد محاضرات الدورة:", "12");

    const cleanName = name.trim().replace(/\s+/g, '-').substring(0, 10);
    const newGroupId = `${cleanName}-${number}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

    try {
        showLoader("جاري إنشاء المجموعة...");

        const newGroupRef = ref(db, `athar_groups/${newGroupId}`);
        await set(child(newGroupRef, 'info'), {
            name: name,
            number: number,
            totalLectures: parseInt(totalLectures) || 12,
            adminUid: currentUser.uid,
            createdAt: Date.now()
        });

        await set(child(newGroupRef, 'data/settings'), {
            ...state.settings,
            totalPlannedLectures: parseInt(totalLectures) || 12
        });

        const userRef = ref(db, `users/${currentUser.uid}`);
        const userSnap = await get(userRef);
        const userData = userSnap.val();

        let groups = userData.groups || [];
        if (userData.groupId && !groups.includes(userData.groupId)) groups.push(userData.groupId);
        if (!groups.includes(newGroupId)) groups.push(newGroupId);

        await update(userRef, {
            groups: groups,
            activeGroupId: newGroupId,
            groupId: userData.groupId || newGroupId
        });

        showAtharNotification(`تم إنشاء المجموعة بنجاح! كود المجموعة: ${newGroupId}`);
        setTimeout(() => location.reload(), 1000);
    } catch (error) {
        removeLoader();
        showAtharNotification("خطأ في إنشاء المجموعة: " + error.message, "error");
    }
}

/**
 * تبديل المجموعة النشطة
 */
export async function switchGroup() {
    const userRef = ref(db, `users/${currentUser.uid}`);
    const snapshot = await get(userRef);
    const userData = snapshot.val();

    let groups = userData.groups || [];
    if (userData.groupId && !groups.includes(userData.groupId)) {
        groups.push(userData.groupId);
    }

    if (groups.length <= 1) {
        showAtharNotification("ليس لديك مجموعات أخرى للتبديل إليها", "info");
        return;
    }

    const groupChoices = [];
    for (const gid of groups) {
        const gInfo = await get(ref(db, `athar_groups/${gid}/info`));
        if (gInfo.exists()) {
            const data = gInfo.val();
            groupChoices.push({ id: gid, text: `${data.name} (${data.number})` });
        } else {
            groupChoices.push({ id: gid, text: gid });
        }
    }

    const selectedGroupId = await showAtharChoice("تبديل المجموعة", "اختر المجموعة التي تريد الانتقال إليها:", groupChoices);
    if (!selectedGroupId) return;

    try {
        await update(userRef, { activeGroupId: selectedGroupId });
        showAtharNotification("جاري التبديل...");
        setTimeout(() => location.reload(), 800);
    } catch (error) {
        showAtharNotification("خطأ في التبديل: " + error.message, "error");
    }
}

/**
 * حذف المجموعة الحالية نهائياً
 */
export async function deleteCurrentGroupFlow() {
    if (!currentUser || !currentGroup) return;

    const groupId = currentGroup.id;
    const groupName = state.groupInfo?.name || groupId;

    const confirm1 = await showAtharConfirm(
        "حذف المجموعة نهائياً",
        `⚠️ تحذير: أنت على وشك حذف المجموعة (${groupName}) بشكل نهائي!\n\nسيتم مسح كافة البيانات المرتبطة بها.\nهل أنت متأكد؟`
    );
    if (!confirm1) return;

    const confirm2 = await showAtharPrompt(
        "تأكيد أخير",
        `لحذف المجموعة، يرجى كتابة اسم المجموعة (${groupName}) في الخانة:`,
        ""
    );

    if (!confirm2 || confirm2.trim() !== groupName.trim()) {
        showAtharNotification("الاسم غير مطابق، تم إلغاء الحذف", "warning");
        return;
    }

    try {
        showLoader("جاري حذف المجموعة...");

        const userRef = ref(db, `users/${currentUser.uid}`);
        const userSnap = await get(userRef);
        if (userSnap.exists()) {
            const userData = userSnap.val();
            let groups = (userData.groups || []).filter(gid => gid !== groupId);

            const updates = { groups: groups };
            if (userData.activeGroupId === groupId) {
                updates.activeGroupId = groups.length > 0 ? groups[0] : "";
            }
            await update(userRef, updates);
        }

        await remove(ref(db, `athar_groups/${groupId}`));
        showAtharNotification("تم حذف المجموعة بنجاح");

        setTimeout(() => {
            window.location.href = '/setup';
        }, 1500);
    } catch (error) {
        removeLoader();
        showAtharNotification("خطأ أثناء حذف المجموعة: " + error.message, "error");
    }
}

/**
 * حفظ إعدادات المجموعة (الاسم، الرقم، عدد المحاضرات)
 */
export async function saveGroupSettings() {
    const nameElem = document.getElementById('edit-group-name');
    const numberElem = document.getElementById('edit-group-number');
    const totalElem = document.getElementById('edit-group-total');

    if (!nameElem || !numberElem) return;

    const newName = nameElem.value.trim();
    const newNumber = numberElem.value.trim();
    const newTotal = totalElem ? (parseInt(totalElem.value) || 12) : 12;

    if (!newName || !newNumber) {
        showAtharNotification("يجب إدخال اسم ورقم المجموعة", "error");
        return;
    }

    try {
        const groupId = currentGroup.id;
        const updates = {};
        updates[`athar_groups/${groupId}/info/name`] = newName;
        updates[`athar_groups/${groupId}/info/number`] = newNumber;
        updates[`athar_groups/${groupId}/info/totalLectures`] = newTotal;
        updates[`athar_groups/${groupId}/data/settings/totalPlannedLectures`] = newTotal;

        await update(ref(db), updates);

        if (state.groupInfo) {
            state.groupInfo.name = newName;
            state.groupInfo.number = newNumber;
            state.groupInfo.totalLectures = newTotal;
        }
        if (state.settings) state.settings.totalPlannedLectures = newTotal;

        const modal = document.getElementById('group-info-modal');
        if (modal) modal.style.display = 'none';

        renderGroupStats();
        showAtharNotification("تم حفظ بيانات المجموعة بنجاح", "success");
    } catch (error) {
        showAtharNotification("حدث خطأ أثناء حفظ التغييرات: " + error.message, "error");
    }
}

/**
 * نسخ كود المجموعة
 */
export function copyGroupCode(code) {
    const textToCopy = code || currentGroup?.id;
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy).then(() => {
        showAtharNotification("تم نسخ كود المجموعة بنجاح ✓", "success");
    }).catch(() => {
        const dummy = document.createElement("textarea");
        dummy.value = textToCopy;
        document.body.appendChild(dummy);
        dummy.select();
        document.execCommand("copy");
        document.body.removeChild(dummy);
        showAtharNotification("تم نسخ كود المجموعة بنجاح ✓", "success");
    });
}

/**
 * فتح نافذة معلومات المجموعة
 */
export async function openGroupInfoModal() {
    const modal = document.getElementById('group-info-modal');
    const content = document.getElementById('group-info-content');
    const saveBtn = document.getElementById('save-group-info-btn');
    if (!modal || !content || !currentGroup) return;

    content.innerHTML = `
        <div class="input-group" style="margin-bottom: 12px; text-align: right;">
            <label style="display:block; margin-bottom: 5px;"><strong>اسم المجموعة:</strong></label>
            <input type="text" id="edit-group-name" value="${state.groupInfo?.name || ''}" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 5px;" />
        </div>
        <div class="input-group" style="margin-bottom: 12px; text-align: right;">
            <label style="display:block; margin-bottom: 5px;"><strong>رقم المجموعة:</strong></label>
            <input type="text" id="edit-group-number" value="${state.groupInfo?.number || ''}" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 5px;" />
        </div>
        <div class="group-code-row">
            <strong>كود المجموعة (ID):</strong>
            <div class="group-code-badge">
                <code id="display-group-code">${currentGroup.id}</code>
                <button type="button" class="btn-copy-code" onclick="window.app.copyGroupCode('${currentGroup.id}')" title="نسخ كود المجموعة">
                    <i class="fa-regular fa-copy"></i> نسخ
                </button>
            </div>
        </div>
        <div class="input-group" style="margin-bottom: 12px; text-align: right;">
            <label style="display:block; margin-bottom: 5px;"><strong>إجمالي المحاضرات المخططة:</strong></label>
            <input type="number" id="edit-group-total" value="${state.groupInfo?.totalLectures || state.settings?.totalPlannedLectures || 12}" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 5px;" />
        </div>
    `;
    if (saveBtn) saveBtn.style.display = 'block';
    modal.style.display = 'flex';
}

function renderDate() {
    const dateElement = document.querySelector('.date-display');
    if (dateElement) dateElement.innerText = formatHijriDate();
}

function renderHadith() {
    const textElem = document.getElementById('hadith-text') || document.querySelector('.quote-box p');
    const sourceElem = document.getElementById('hadith-source');
    if (textElem && hadithList && hadithList.length > 0) {
        const rand = Math.floor(Math.random() * hadithList.length);
        const item = hadithList[rand];
        if (typeof item === 'string') {
            const parts = item.split('\n');
            textElem.innerText = parts[0] ? `"${parts[0].trim()}"` : `"${item}"`;
            if (sourceElem) {
                sourceElem.innerText = parts[1] ? parts[1].trim() : '';
            }
        } else if (item && typeof item === 'object') {
            textElem.innerText = `"${item.text || ''}"`;
            if (sourceElem) sourceElem.innerText = item.source ? `[${item.source}]` : '';
        }
    }
}

function toggleTheme() {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeIcon(isDark);
}

function loadTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        updateThemeIcon(true);
    }
}

function updateThemeIcon(isDark) {
    const icon = document.querySelector('.btn-action i.fa-moon, .btn-action i.fa-sun');
    if (icon) {
        icon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    }
}

function toggleMenuFlow() {
    const menu = document.getElementById('main-menu');
    const overlay = document.getElementById('menu-overlay');
    if (menu && overlay) {
        menu.classList.toggle('active');
        overlay.classList.toggle('active');
    }
}

// تصدير دوال window.app لصفحة التقارير
window.app = {
    logout: () => handleLogout(),
    createNewGroup: () => createNewGroup(),
    switchGroup: () => switchGroup(),
    deleteCurrentGroup: () => deleteCurrentGroupFlow(),
    openGroupInfoModal: () => openGroupInfoModal(),
    copyGroupCode: (code) => copyGroupCode(code),
    saveGroupSettings: () => saveGroupSettings(),

    addLecture: () => addLectureFlow(() => renderReports(state.allSupervisorsData)),
    deleteLecture: (id) => deleteLectureFlow(id, () => renderReports(state.allSupervisorsData)),
    openLectureSettings: (e, lId) => openLectureSettings(e, lId),
    saveLectureSettings: () => saveLectureSettings(() => renderReports(state.allSupervisorsData)),
    copyLectureId: () => copyLectureId(),
    copyLectureScript: () => copyLectureScript(),
    deleteLectureFromSettings: () => deleteLectureFromSettings(() => renderReports(state.allSupervisorsData)),

    showSupervisorFullReport: (e, uid) => showSupervisorFullReport(e, uid),
    showSupervisorMsgTypes: (e, uid) => showSupervisorMsgTypes(e, uid),

    sendMessages: () => startMessagingFlow(),
    resetMessages: () => resetMessageCounts(),
    insertVariable: (text) => insertVariable(text),

    getReport: () => getReportFile(),
    backupData: () => backupData(),

    openCertSettings: () => openCertSettings(),
    closeCertSettings: () => closeCertSettings(),
    saveCertSettings: () => saveCertSettings(),
    handleCertTemplateUpload: (input) => handleCertTemplateUpload(input),
    updateVisualMarkersPositions: () => updateVisualMarkersPositions(),

    toggleNotificationCenter: () => toggleNotificationCenter(),
    openNotificationCenter: () => openNotificationCenter(),
    closeNotificationCenter: () => closeNotificationCenter(),
    dismissNotification: (id) => dismissNotification(id),
    clearAllNotifications: () => clearAllNotifications(),
    toggleNotificationsSetting: (el) => toggleNotificationsSetting(el),

    openProfileModal: () => openProfileModal(),
    saveProfileChanges: () => saveProfileChanges(),
    openAIInstructionsModal: () => openAIInstructionsModal(),
    saveAIInstructions: () => saveAIInstructions(),
    requestNotificationPermission: () => requestNotificationPermission(),
    toggleToolsDropdown: (e) => toggleToolsDropdown(e),
    toggleTheme: () => toggleTheme(),
    toggleMenu: () => toggleMenuFlow()
};

// بدء تشغيل صفحة التقارير فوراً وبأمان
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReportsPage);
} else {
    initReportsPage();
}
