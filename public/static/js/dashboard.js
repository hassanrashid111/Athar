/**
 * منصة أثر التعليمية - وحدة التحكم الرئيسية للوحة التحكم (Dashboard Controller)
 */

import { db, ref, onValue, get, update } from "./firebase-config.js";
import { state, currentUser, currentGroup, setCurrentGroup, saveData, showLoader, removeLoader } from "./state.js";
import {
    showAtharNotification, formatHijriDate, calculateScore,
    getStudentTotalScore, getInitials, escapeHTML
} from "./utils.js";
import { hadithList } from "./hadith.js";
import { initPageAuth } from "./router.js";
import { handleLogout, openProfileModal, saveProfileChanges } from "./auth.js";
import {
    addStudentFlow, deleteStudentFlow, openEditStudentModal,
    saveStudentDataEdit, processBulkImport, openNotesModal,
    closeNotesModal, saveStudentNotes, wipeAllData,
    initiateStudentTransfer, checkPendingTransfers,
    openAICleaner, closeAICleaner, runAICleaner,
    importCleanedStudents, copyCleanedStudents,
    openCustomTransferModal, closeCustomTransferModal,
    renderCustomTransferTable, toggleTransferStudentSelection,
    toggleSelectAllTransfer, filterTransferStudentsList, proceedCustomTransfer
} from "./students.js";
import {
    addLectureFlow, deleteLectureFlow, toggleStudentCheck,
    openLectureSettings, saveLectureSettings, copyLectureId,
    copyLectureScript, deleteLectureFromSettings
} from "./lectures.js";
import {
    startMessagingFlow, resetMessageCounts, insertVariable,
    closeMessagingQueue, openAIInstructionsModal, saveAIInstructions
} from "./messaging.js";
import {
    downloadCertificate, downloadLecturePDF, openCertSettings,
    closeCertSettings, saveCertSettings, handleCertTemplateUpload
} from "./certificates.js";
import { exportToExcel, getReportFile, backupData, restoreData } from "./reports.js";
import {
    checkTransferNotifications, checkNewLectureNotifications,
    checkPendingRepliedReminder, requestNotificationPermission
} from "./pwa.js";

let sortDirection = 1;
let contextTarget = { sId: null, lId: null };

/**
 * تهيئة لوحة التحكم
 */
export async function initDashboard() {
    loadTheme();
    renderDate();
    renderHadith();
    setupDropdownListeners();

    showLoader("جاري الاتصال والتحقق من الصلاحيات...");
    const { user, userData, activeGroupId } = await initPageAuth();

    if (activeGroupId) {
        listenToGroup(activeGroupId, user.uid);
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
 * ضبط نص زر الإرسال بناءً على حالة مربع النص (يدوي أو بالذكاء الاصطناعي)
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
                إرسال الرسالة عبر واتساب
                <i class="fa-solid fa-paper-plane"></i>
            `;
            sendBtn.style.background = "#25D366";
        }
    };

    msgInput.addEventListener('input', updateBtn);
    updateBtn();
}

let isLocalSaving = false;
let localSavingTimer = null;

/**
 * الاشتراك في تحديثات المجموعة في الوقت الفعلي
 */
function listenToGroup(groupId, uid) {
    const groupRef = ref(db, `athar_groups/${groupId}`);

    onValue(groupRef, (snapshot) => {
        const groupData = snapshot.val();
        if (groupData) {
            setCurrentGroup({ id: groupId, ...groupData.info });
            state.groupInfo = groupData.info;

            state.lectures = groupData.data?.lectures || [];
            state.settings = groupData.data?.settings || { totalPlannedLectures: 12 };

            if (!state.settings.certificate) {
                state.settings.certificate = {
                    template: '/static/assets/certificate_template.jpg',
                    name: { x: 530, y: 660, show: true },
                    date: { x: 536, y: 1126, show: true },
                    lecture: { x: 1072, y: 1019, show: false }
                };
            }

            if (state.userInfo?.role === 'followup_supervisor') {
                const supervisorData = groupData.students?.[uid] || {};
                
                // منع إعادة بناء الجدول عند الحفظ المحلي للحفاظ على موضع التمرير ثابتاً تماماً
                if (isLocalSaving) {
                    if (supervisorData.msgCount) state.userInfo.msgCount = supervisorData.msgCount;
                    if (supervisorData.msgTypesCount) state.userInfo.msgTypesCount = supervisorData.msgTypesCount;
                    removeLoader();
                    return;
                }

                state.students = Array.isArray(supervisorData) ? supervisorData : (supervisorData.students || []);

                if (state.userInfo.name && supervisorData.name !== state.userInfo.name) {
                    update(ref(db, `athar_groups/${groupId}/students/${uid}`), {
                        name: state.userInfo.name
                    });
                }

                if (supervisorData.msgCount) state.userInfo.msgCount = supervisorData.msgCount;
                if (supervisorData.msgTypesCount) state.userInfo.msgTypesCount = supervisorData.msgTypesCount;

                state.students.forEach(s => { if (!s.progress) s.progress = {}; });
            } else if (state.userInfo?.role === 'group_supervisor') {
                state.students = [];
                state.allSupervisorsData = groupData.students || {};
            }

            renderDashboard();
            removeLoader();

            // 1. فحص إشعارات إضافة المحاضرات الجديدة
            checkNewLectureNotifications(groupId, state.lectures, state.userInfo?.role);

            // 2. فحص إشعارات نقل واستلام الطلاب
            if (groupData.transfers && state.userInfo?.phone) {
                checkTransferNotifications(groupData.transfers, state.userInfo.phone);
            }

            // 3. فحص إشعارات التذكير بالطلاب المعلقين (رد ولم يختبر منذ 24 ساعة)
            checkPendingRepliedReminder(state.students, state.lectures, state.userInfo?.role);

            if (state.userInfo?.role === 'followup_supervisor') {
                checkPendingTransfers(() => renderDashboard());
            }
        }
    });
}

/**
 * إعادة رسم عناصر اللوحة
 */
export function renderDashboard() {
    handleSearch();
    renderStats();
}

/**
 * رسم جدول الطلاب مع الحفاظ على موضع التمرير (Preserve Scroll Position)
 */
export function renderTable(studentsList = null) {
    const dataToRender = studentsList || state.students;
    const thead = document.getElementById('table-header-row');
    const tbody = document.getElementById('students-body');

    if (!thead || !tbody) return;

    // حفظ موضع التمرير الحالي
    const savedScrollY = window.scrollY;

    let headersHTML = `
        <th>#</th>
        <th class="sortable-header" onclick="window.app.sort('name')" title="اضغط للترتيب">
            اسم الطالب <i class="fa-solid fa-sort"></i>
        </th>
        <th>رقم الهاتف</th>
    `;

    const isGroupSup = state.userInfo && state.userInfo.role === 'group_supervisor';

    state.lectures.forEach(lec => {
        let eventsAttr = '';
        if (isGroupSup) {
            eventsAttr = `oncontextmenu="window.app.openLectureSettings(event, '${lec.id}')"`;
        }

        let linkIconHTML = '';
        if (lec.formLink && lec.formLink.trim().length > 0) {
            linkIconHTML = `<a href="${lec.formLink}" target="_blank" onclick="event.stopPropagation()" style="color:#2980b9; margin-right:5px;" title="رابط المحاضرة"><i class="fa-solid fa-link"></i></a>`;
        }

        let nameOnClick = `window.app.sort('lecture', '${lec.id}')`;
        if (isGroupSup) {
            nameOnClick = `window.app.openLectureSettings(event, '${lec.id}')`;
        }

        let deleteBtnHTML = '';
        if (isGroupSup) {
            deleteBtnHTML = `
                <button onclick="window.app.deleteLecture('${lec.id}')" 
                        style="background:none; border:none; color:#E74C3C; cursor:pointer; font-size:0.9rem;" 
                        title="حذف العمود">
                    <i class="fa-solid fa-circle-minus"></i>
                </button>
            `;
        }

        headersHTML += `
            <th class="lecture-header" ${eventsAttr}>
                <div style="display: flex; flex-direction: column; align-items: center; gap: 5px;">
                    <span onclick="${nameOnClick}" style="cursor:pointer; user-select:none; font-size:0.9rem;">
                        ${lec.title} ${linkIconHTML} <i class="fa-solid fa-sort" style="opacity:0.3; font-size:0.7rem;" onclick="event.stopPropagation(); window.app.sort('lecture', '${lec.id}')"></i>
                    </span>
                    <div style="display:flex; gap:5px;">
                        <button onclick="window.app.downloadLecturePDF('${lec.id}', '${lec.title}')" 
                                style="background:none; border:none; color:#27AE60; cursor:pointer; font-size:0.9rem;" 
                                title="تحميل شهادات الحضور PDF">
                            <i class="fa-solid fa-file-pdf"></i>
                        </button>
                        ${deleteBtnHTML}
                    </div>
                </div>
            </th>`;
    });

    headersHTML += `
        <th class="sortable-header" onclick="window.app.sort('score')" title="ترتيب بالنسبة الإجمالية">
            النسبة <i class="fa-solid fa-sort"></i>
        </th>
        <th style="min-width: 120px;">
            إجراءات
        </th>`;

    thead.innerHTML = headersHTML;

    // تثبيت الارتفاع لمنع القفز
    if (tbody.offsetHeight > 0) {
        tbody.style.minHeight = `${tbody.offsetHeight}px`;
    }
    tbody.innerHTML = '';

    const latestLecId = state.lectures.length > 0 ? state.lectures[state.lectures.length - 1].id : null;
    const activeStudents = dataToRender.filter(s => !s.deleted);

    const paginationSpan = document.querySelector('.pagination span');
    if (paginationSpan) {
        paginationSpan.innerText = `عرض ${activeStudents.length} نشط من أصل ${state.students.length}`;
    }

    const CHUNK_SIZE = 60;
    let currentIndex = 0;

    function renderNextChunk() {
        if (currentIndex >= activeStudents.length) {
            tbody.style.minHeight = '';
            window.scrollTo({ top: savedScrollY, behavior: 'instant' });
            return;
        }

        const fragment = document.createDocumentFragment();
        const end = Math.min(currentIndex + CHUNK_SIZE, activeStudents.length);

        for (; currentIndex < end; currentIndex++) {
            const student = activeStudents[currentIndex];
            if (!student.progress) student.progress = {};

            const isCompletedLatest = latestLecId ? student.progress[latestLecId] : false;
            const rowClass = (isCompletedLatest && isCompletedLatest !== 'replied') ? 'row-tested' : 'row-active';

            const originalIndex = state.students.findIndex(s => s.id === student.id);
            const serial = (originalIndex + 1).toString().padStart(3, '0');

            const percent = getStudentTotalScore(student, state.lectures);
            let progressColor = '#E74C3C';
            if (percent >= 75) progressColor = '#27AE60';
            else if (percent >= 50) progressColor = '#F39C12';

            const badgeHTML = (isCompletedLatest && isCompletedLatest !== 'replied') ? `<span class="status-badge completed">مكتمل</span>` : '';

            const safeName = escapeHTML(student.name);
            const safePhone = escapeHTML(student.phone);

            const tr = document.createElement('tr');
            tr.className = rowClass;
            tr.id = `student-row-${student.id}`;

            let rowHTML = `
                <td><span style="color:var(--primary-green); font-weight:bold;">${serial}</span></td>
                <td>
                    <div style="display:flex; align-items:center; gap: 10px;">
                        <div class="student-avatar" style="background:#f0f0f0; color:#555;">${getInitials(safeName)}</div>
                        <div style="display:flex; flex-direction:column; width:100%">
                            <span class="clickable-name" onclick="window.app.openNotes(${student.id})" title="ملاحظات" style="cursor:pointer; font-weight:bold;">
                                ${safeName}
                            </span>
                            <a href="https://web.whatsapp.com/send?phone=${encodeURIComponent(safePhone)}" target="_blank" style="margin-right:8px; color:#25D366; font-size:1.1rem; text-decoration:none;" title="مراسلة سريعة">
                                <i class="fa-brands fa-whatsapp"></i>
                            </a>
                            <span class="badge-container">${badgeHTML}</span>
                            <div class="progress-track" style="background:#eee; height:5px; width:100%; margin-top:5px; border-radius:3px; overflow:hidden;">
                                <div class="progress-bar-fill" style="width:${percent}%; background:${progressColor}; height:100%; border-radius:3px;"></div>
                            </div>
                        </div>
                    </div>
                </td>
                <td style="font-family:'Arial'; direction:ltr; text-align:right;">${safePhone}</td>
            `;

            state.lectures.forEach(lec => {
                const progressValue = student.progress[lec.id];
                const isChecked = progressValue && progressValue !== 'replied';
                const cellClass = progressValue === 'replied' ? 'status-replied' : '';

                rowHTML += `
                    <td data-lec-id="${lec.id}" class="${cellClass}" oncontextmenu="window.app.showContext(event, ${student.id}, '${lec.id}')">
                        <div class="check-wrapper" style="justify-content: center;">                        
                            <input type="checkbox" ${isChecked ? 'checked' : ''} 
                            onchange="window.app.toggleCheck(${student.id}, '${lec.id}')"
                            title="انقر يميناً لخيارات التاريخ">
                        </div>
                    </td>
                `;
            });

            const isPerfect = percent === 100;
            const encodedNameForCert = encodeURIComponent(safeName);

            rowHTML += `
                <td class="student-percent-cell" style="font-weight:bold; color:${progressColor}">${percent}%</td>
                <td>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <button class="btn-action btn-cert-action" 
                                style="background:${isPerfect ? '#D4AF37' : '#2980b9'}; color:white; padding:5px 10px; border:none; border-radius:4px; cursor:pointer;" 
                                onclick="window.app.downloadCert(decodeURIComponent('${encodedNameForCert}'), ${state.lectures.length})" 
                                title="تحميل الشهادة">
                            <i class="fa-solid fa-award"></i>
                        </button>
                        <button class="btn-delete-row" style="color:var(--primary-green); margin-left:5px;" onclick="window.app.editStudent(${student.id})" title="تعديل البيانات">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn-delete-row" onclick="window.app.deleteStudent(${student.id})">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            `;

            tr.innerHTML = rowHTML;
            fragment.appendChild(tr);
        }

        tbody.appendChild(fragment);

        if (currentIndex < activeStudents.length) {
            requestAnimationFrame(renderNextChunk);
        } else {
            tbody.style.minHeight = '';
            window.scrollTo({ top: savedScrollY, behavior: 'instant' });
        }
    }

    requestAnimationFrame(renderNextChunk);
}

/**
 * تبديل حالة الحضور بشكل مباشر في واجهة المستخدم مع حفظ وإشعار فوري
 */
export async function handleToggleStudentCheck(sId, lId) {
    const student = state.students.find(s => s.id === sId);
    if (!student) return;

    if (!student.progress) student.progress = {};

    if (student.progress[lId]) {
        delete student.progress[lId];
    } else {
        student.progress[lId] = Date.now();
    }

    // تفعيل قفل الحفظ المحلي لمنع الارتداد أو إعادة رسم الجدول
    isLocalSaving = true;
    if (localSavingTimer) clearTimeout(localSavingTimer);
    localSavingTimer = setTimeout(() => {
        isLocalSaving = false;
    }, 2500);

    // تحديث الصف الحالي في الصفحة مباشرة دون المساس بموضع التمرير
    updateStudentRowInDOM(sId);

    // تحديث الإحصائيات في الأعلى
    renderStats();

    // حفظ في Firebase مع إظهار مؤشر الحفظ
    try {
        await saveData(false);
    } catch (e) {
        console.error("Attendance toggle save error:", e);
    }
}

/**
 * تحديث عناصر صف الطالب في الـ DOM في مكانه دون إعادة تحميل الجدول
 */
export function updateStudentRowInDOM(sId) {
    const student = state.students.find(s => s.id === sId);
    if (!student) return;

    const tr = document.getElementById(`student-row-${sId}`);
    if (!tr) return;

    if (!student.progress) student.progress = {};

    const latestLecId = state.lectures.length > 0 ? state.lectures[state.lectures.length - 1].id : null;
    const isCompletedLatest = latestLecId ? student.progress[latestLecId] : false;
    const isRepliedLatest = (isCompletedLatest === 'replied');

    tr.className = (isCompletedLatest && !isRepliedLatest) ? 'row-tested' : 'row-active';

    const percent = getStudentTotalScore(student, state.lectures);
    let progressColor = '#E74C3C';
    if (percent >= 75) progressColor = '#27AE60';
    else if (percent >= 50) progressColor = '#F39C12';

    // تحديث الشارة
    const badgeContainer = tr.querySelector('.badge-container');
    if (badgeContainer) {
        badgeContainer.innerHTML = (isCompletedLatest && !isRepliedLatest) ? `<span class="status-badge completed">مكتمل</span>` : '';
    }

    // تحديث شريط التقدم
    const progressBar = tr.querySelector('.progress-bar-fill');
    if (progressBar) {
        progressBar.style.width = `${percent}%`;
        progressBar.style.background = progressColor;
    }

    // تحديث خلية النسبة
    const percentCell = tr.querySelector('.student-percent-cell');
    if (percentCell) {
        percentCell.innerText = `${percent}%`;
        percentCell.style.color = progressColor;
    }

    // تحديث لون زر الشهادة
    const certBtn = tr.querySelector('.btn-cert-action');
    if (certBtn) {
        certBtn.style.background = (percent === 100) ? '#D4AF37' : '#2980b9';
    }

    // تحديث جميع خانات المحاضرات وخلاياها
    state.lectures.forEach(lec => {
        const td = tr.querySelector(`td[data-lec-id="${lec.id}"]`);
        if (td) {
            const pVal = student.progress[lec.id];
            const isChecked = pVal && pVal !== 'replied';
            td.className = (pVal === 'replied') ? 'status-replied' : '';
            const chk = td.querySelector('input[type="checkbox"]');
            if (chk) chk.checked = isChecked;
        }
    });
}

/**
 * تحديث بطاقة الإحصائيات
 */
export function renderStats() {
    let total = 0;
    let absence = 0;
    const latestLecId = state.lectures.length > 0 ? state.lectures[state.lectures.length - 1].id : null;

    total = state.students.filter(s => !s.deleted).length;
    if (latestLecId) {
        absence = state.students.filter(s =>
            !s.deleted && (!s.progress || !s.progress[latestLecId]) && s.name && s.name.trim().length > 0
        ).length;
    }

    const totalPlanned = state.settings.totalPlannedLectures || 12;
    const remaining = totalPlanned - state.lectures.length;

    const totalElem = document.getElementById('stat-total');
    const absenceElem = document.getElementById('stat-absence');
    const remainingElem = document.getElementById('stat-remaining');

    if (totalElem) totalElem.innerText = total;
    if (absenceElem) absenceElem.innerText = absence;
    if (remainingElem) remainingElem.innerText = remaining > 0 ? remaining : 0;
}

/**
 * البحث في قائمة الطلاب
 */
export function handleSearch() {
    const searchInput = document.getElementById('searchInput');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

    let activeStudents = state.students.filter(s => !s.deleted);

    if (!query) {
        renderTable(activeStudents);
        return;
    }

    const filtered = activeStudents.filter(s => {
        const name = (s.name || '').toLowerCase();
        const phone = (s.phone || '').toLowerCase();
        return name.includes(query) || phone.includes(query);
    });

    renderTable(filtered);
}

/**
 * ترتيب الطلاب
 */
export function sortStudents(criteria, lecId = null) {
    sortDirection = -sortDirection;

    state.students.sort((a, b) => {
        if (criteria === 'name') {
            const nameA = (a.name || '').trim();
            const nameB = (b.name || '').trim();
            return nameA.localeCompare(nameB, 'ar') * sortDirection;
        } else if (criteria === 'score') {
            const scoreA = getStudentTotalScore(a, state.lectures);
            const scoreB = getStudentTotalScore(b, state.lectures);
            return (scoreA - scoreB) * sortDirection;
        } else if (criteria === 'lecture' && lecId) {
            const valA = a.progress ? (a.progress[lecId] || 0) : 0;
            const valB = b.progress ? (b.progress[lecId] || 0) : 0;
            const numA = (valA === 'replied') ? -1 : (typeof valA === 'number' ? valA : (valA ? 1 : 0));
            const numB = (valB === 'replied') ? -1 : (typeof valB === 'number' ? valB : (valB ? 1 : 0));
            return (numA - numB) * sortDirection;
        }
        return 0;
    });

    renderTable();
}

/**
 * عرض التاريخ الهجري والميلادي
 */
export function renderDate() {
    const dateElem = document.getElementById('current-date');
    if (dateElem) {
        dateElem.innerText = formatHijriDate();
    }
}

/**
 * عرض حديث شريف عشوائي
 */
export function renderHadith() {
    const textElem = document.getElementById('hadith-text');
    const sourceElem = document.getElementById('hadith-source');
    if (textElem && hadithList && hadithList.length > 0) {
        const rand = Math.floor(Math.random() * hadithList.length);
        const item = hadithList[rand];
        if (typeof item === 'string') {
            const parts = item.split('\n');
            textElem.innerText = `"${parts[0].trim()}"`;
            if (sourceElem) {
                sourceElem.innerText = parts[1] ? parts[1].trim() : '';
            }
        } else if (item && typeof item === 'object') {
            textElem.innerText = `"${item.text || ''}"`;
            if (sourceElem) sourceElem.innerText = item.source ? `[${item.source}]` : '';
        }
    }
}

/**
 * تبديل المظهر (Dark / Light)
 */
export function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-theme');
    localStorage.setItem('athar_theme', isDark ? 'dark' : 'light');
}

export function loadTheme() {
    const saved = localStorage.getItem('athar_theme');
    if (saved === 'dark') {
        document.body.classList.add('dark-theme');
    }
}

/**
 * قائمة السياق بالزر الأيمن
 */
export function showContextMenu(e, sId, lId) {
    e.preventDefault();
    contextTarget = { sId, lId };

    const menu = document.getElementById('context-menu');
    if (menu) {
        menu.style.display = 'block';
        menu.style.left = `${e.pageX}px`;
        menu.style.top = `${e.pageY}px`;
    }
}

export function manualStatus(days) {
    const { sId, lId } = contextTarget;
    if (!sId || !lId) return;

    const student = state.students.find(s => s.id === sId);
    if (student) {
        if (!student.progress) student.progress = {};

        isLocalSaving = true;
        if (localSavingTimer) clearTimeout(localSavingTimer);
        localSavingTimer = setTimeout(() => {
            isLocalSaving = false;
        }, 2500);

        if (days === -1) {
            delete student.progress[lId];
        } else if (days === 'replied') {
            student.progress[lId] = 'replied';
        } else {
            const lecture = state.lectures.find(l => l.id === lId);
            if (lecture) {
                const targetDate = lecture.timestamp + (days * 24 * 60 * 60 * 1000) + (10 * 60 * 1000);
                student.progress[lId] = targetDate;
            }
        }
        updateStudentRowInDOM(sId);
        renderStats();
        saveData(false);
    }
    hideContextMenu();
}

export function hideContextMenu() {
    const menu = document.getElementById('context-menu');
    if (menu) menu.style.display = 'none';
    contextTarget = { sId: null, lId: null };
}

document.addEventListener('click', hideContextMenu);
document.addEventListener('scroll', hideContextMenu);

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
 * عرض وتعديل معلومات المجموعة
 */
export async function openGroupInfoModal() {
    const modal = document.getElementById('group-info-modal');
    const content = document.getElementById('group-info-content');
    const saveBtn = document.getElementById('save-group-info-btn');
    if (!modal || !content || !currentGroup) return;

    let adminName = "جاري التحميل...";
    content.innerHTML = `
        <div style="margin-bottom: 12px;"><strong>اسم المجموعة:</strong> ${state.groupInfo?.name || "غير محدد"}</div>
        <div style="margin-bottom: 12px;"><strong>رقم المجموعة:</strong> ${state.groupInfo?.number || "غير محدد"}</div>
        <div class="group-code-row">
            <strong>كود المجموعة (ID):</strong>
            <div class="group-code-badge">
                <code id="display-group-code">${currentGroup.id}</code>
                <button type="button" class="btn-copy-code" onclick="window.app.copyGroupCode('${currentGroup.id}')" title="نسخ كود المجموعة">
                    <i class="fa-regular fa-copy"></i> نسخ
                </button>
            </div>
        </div>
        <div style="margin-bottom: 12px;"><strong>المشرف المسؤول:</strong> <span id="group-admin-name">${adminName}</span></div>
        <div style="margin-bottom: 12px;"><strong>إجمالي المحاضرات المخططة:</strong> ${state.groupInfo?.totalLectures || state.settings?.totalPlannedLectures || 0}</div>
    `;
    if (saveBtn) saveBtn.style.display = 'none';
    modal.style.display = 'flex';

    if (state.groupInfo?.adminUid) {
        try {
            const adminSnapshot = await get(ref(db, `users/${state.groupInfo.adminUid}`));
            if (adminSnapshot.exists()) {
                adminName = adminSnapshot.val().name || "مشرف مجهول";
                const adminElem = document.getElementById('group-admin-name');
                if (adminElem) adminElem.innerText = adminName;
            }
        } catch (e) {
            console.error("Error fetching group admin name:", e);
        }
    }
}

/**
 * تبديل ظهور القائمة الجانبية (Sidebar / Mobile Menu)
 */
export function toggleMenuFlow() {
    const menu = document.getElementById('main-menu') || document.querySelector('.header-left');
    const overlay = document.getElementById('menu-overlay');
    if (menu) {
        menu.classList.toggle('active');
    }
    if (overlay) {
        overlay.classList.toggle('active');
    }
}

// تجميع كل دوال التطبيق وإتاحتها للـ UI
window.app = {
    logout: () => handleLogout(),
    openImport: () => {
        const m = document.getElementById('import-modal');
        if (m) m.style.display = 'flex';
    },
    closeImport: () => {
        const m = document.getElementById('import-modal');
        if (m) m.style.display = 'none';
    },
    saveImport: () => processBulkImport(() => renderDashboard()),
    processImport: () => processBulkImport(() => renderDashboard()),
    openAICleaner: () => openAICleaner(),
    closeAICleaner: () => closeAICleaner(),
    runAICleaner: () => runAICleaner(),
    importCleanedStudents: () => importCleanedStudents(() => renderDashboard()),
    copyCleanedStudents: () => copyCleanedStudents(),
    addStudent: () => addStudentFlow(() => renderDashboard()),
    editStudent: (id) => openEditStudentModal(id),
    saveStudentEdit: () => saveStudentDataEdit(() => renderDashboard()),
    saveEditStudent: () => saveStudentDataEdit(() => renderDashboard()),
    deleteStudent: (id) => deleteStudentFlow(id, () => renderDashboard()),
    openNotes: (id) => openNotesModal(id),
    closeNotes: () => closeNotesModal(),
    saveNotes: () => saveStudentNotes(() => renderDashboard()),
    clearAllData: () => wipeAllData(() => renderDashboard()),
    initiateStudentTransfer: () => initiateStudentTransfer(() => renderDashboard()),
    openCustomTransferModal: (cb) => openCustomTransferModal(cb),
    closeCustomTransferModal: () => closeCustomTransferModal(),
    toggleTransferStudentSelection: (sId, checked) => toggleTransferStudentSelection(sId, checked),
    toggleSelectAllTransfer: () => toggleSelectAllTransfer(),
    filterTransferStudentsList: () => filterTransferStudentsList(),
    proceedCustomTransfer: () => proceedCustomTransfer(),

    addLecture: () => addLectureFlow(() => renderDashboard()),
    deleteLecture: (id) => deleteLectureFlow(id, () => renderDashboard()),
    toggleCheck: (sId, lId) => handleToggleStudentCheck(sId, lId),
    openLectureSettings: (e, lId) => openLectureSettings(e, lId),
    saveLectureSettings: () => saveLectureSettings(() => renderDashboard()),
    copyLectureId: () => copyLectureId(),
    copyLectureScript: () => copyLectureScript(),
    deleteLectureFromSettings: () => deleteLectureFromSettings(() => renderDashboard()),

    sendMessages: () => startMessagingFlow(),
    resetMessages: () => resetMessageCounts(() => renderDashboard()),
    closeMessagingQueue: () => closeMessagingQueue(),
    insertVariable: (text) => insertVariable(text),

    showContext: (e, sId, lId) => showContextMenu(e, sId, lId),
    manualStatus: (days) => manualStatus(days),

    search: () => handleSearch(),
    sort: (criteria, id) => sortStudents(criteria, id),
    toggleTheme: () => toggleTheme(),

    exportData: () => exportToExcel(),
    getReport: () => getReportFile(),
    backupData: () => backupData(),
    restoreData: (e) => restoreData(e, () => renderDashboard()),

    downloadCert: (name, count) => downloadCertificate(name, count),
    downloadLecturePDF: (id, title) => downloadLecturePDF(id, title),
    openCertSettings: () => openCertSettings(),
    closeCertSettings: () => closeCertSettings(),
    saveCertSettings: () => saveCertSettings(),
    handleCertTemplateUpload: (input) => handleCertTemplateUpload(input),

    openGroupInfoModal: () => openGroupInfoModal(),
    copyGroupCode: (code) => copyGroupCode(code),
    openProfileModal: () => openProfileModal(),
    saveProfileChanges: () => saveProfileChanges(),
    openAIInstructionsModal: () => openAIInstructionsModal(),
    saveAIInstructions: () => saveAIInstructions(),
    requestNotificationPermission: () => requestNotificationPermission(),
    toggleToolsDropdown: (e) => toggleToolsDropdown(e),
    toggleMenu: () => toggleMenuFlow()
};

// بدء تشغيل اللوحة فوراً وبأمان
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
} else {
    initDashboard();
}
