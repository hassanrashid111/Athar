/**
 * منصة أثر التعليمية - إدارة الطلاب والمتابعة (Student Management)
 */

import { db, ref, set, get, update, push } from "./firebase-config.js";
import { state, currentUser, currentGroup, saveData, trackGeminiCall } from "./state.js";
import {
    showAtharNotification, showAtharPrompt, showAtharChoice, showAtharConfirm,
    cleanPhone, getInitials, calculateScore, escapeHTML
} from "./utils.js";

// متغير داخلي لتخزين الأسباب الديناميكية من Firebase بعد تحميلها
// (null-safe: يبدأ بقائمة فارغة حتى لو كانت قاعدة البيانات فارغة تماماً)
let _cachedWithdrawalReasons = null;

let performanceChart = null;
let currentEditingStudentId = null;

/**
 * إضافة طالب جديد
 */
export async function addStudentFlow(onSuccess) {
    const name = await showAtharPrompt('إضافة طالب', 'أدخل اسم الطالب:');
    if (!name) return;

    let phone = await showAtharPrompt('إضافة طالب', 'أدخل رقم الهاتف:', '', 'tel');
    if (!phone) return;

    phone = cleanPhone(phone);

    // التحقق من عدم التكرار
    const exists = state.students.some(s => s.phone === phone);
    if (exists) {
        showAtharNotification('⚠️ تنبيه: هذا الرقم مسجل بالفعل لطالب آخر!', 'error');
        return;
    }

    state.students.push({
        id: Date.now(),
        name: name,
        phone: phone,
        progress: {},
        notes: ''
    });

    await saveData();
    showAtharNotification('تمت إضافة الطالب بنجاح');
    if (onSuccess) onSuccess();
}

/**
 * حساب نسبة حضور الطالب لحظة الانسحاب (Feature Engineering)
 * @returns {number} النسبة بين 0 و 1
 */
export function calcAttendanceRatio(student) {
    const totalLectures = (state.lectures || []).length;
    if (totalLectures === 0) return 0;
    let attended = 0;
    if (student.progress) {
        for (const lec of state.lectures) {
            const p = student.progress[lec.id];
            if (p && p !== 'replied') attended++;
        }
    }
    return Math.round((attended / totalLectures) * 100) / 100; // e.g. 0.75
}

/* ==========================================================================
   🔍 تحميل أسباب الانسحاب من Firebase (Blank-Slate Safe)
   ========================================================================== */

/**
 * جلب أسباب الانسحاب العالمية من Firebase مع cache محلي
 * إذا كان المسار غير موجود (قاعدة بيانات فارغة)، يُرجع كائن فارغ بدون خطأ
 */
async function loadWithdrawalReasons() {
    if (_cachedWithdrawalReasons !== null) return _cachedWithdrawalReasons;
    try {
        const snap = await get(ref(db, 'global_settings/withdrawal_reasons'));
        _cachedWithdrawalReasons = snap.exists() ? (snap.val() || {}) : {};
    } catch (e) {
        console.warn('[WithdrawalReasons] Could not load from Firebase:', e?.message);
        _cachedWithdrawalReasons = {};
    }
    return _cachedWithdrawalReasons;
}

/**
 * حفظ سبب مخصص جديد في Firebase وتحديث الكاش المحلي
 */
async function saveCustomReason(text) {
    if (!text || !text.trim()) return null;
    try {
        const newReasonRef = push(ref(db, 'global_settings/withdrawal_reasons'));
        const reasonObj = { text: text.trim(), createdAt: Date.now() };
        await set(newReasonRef, reasonObj);
        // تحديث الكاش فوراً
        if (_cachedWithdrawalReasons === null) _cachedWithdrawalReasons = {};
        _cachedWithdrawalReasons[newReasonRef.key] = reasonObj;
        return text.trim();
    } catch (e) {
        console.error('[WithdrawalReasons] Save failed:', e);
        return null;
    }
}

/* ==========================================================================
   🔴 نافذة أسباب الانسحاب الذكية (Withdrawal Reason Modal)
   ========================================================================== */

/**
 * فتح نافذة أسباب الانسحاب وتحميل الأسباب من Firebase
 * @returns {Promise<string|null>} السبب المختار أو null عند الإلغاء
 */
async function showWithdrawalReasonModal() {
    const modal = document.getElementById('withdrawal-reason-modal');
    if (!modal) return null;

    // الأسباب الافتراضية الثابتة
    const staticReasons = [
        'امتحانات / ضغط دراسي',
        'تجنيد عسكري',
        'ظروف عمل وضغط مهني',
        'فتور همة وعدم متابعة',
        'ظروف شخصية / عائلية',
        'تعارض مواعيد',
        'انقطاع اتصال وعدم الرد'
    ];

    // تحميل الأسباب الديناميكية من Firebase (آمنة لقاعدة فارغة)
    const dynamicReasons = await loadWithdrawalReasons();
    const dynamicList = Object.values(dynamicReasons).map(r => r.text || r).filter(Boolean);

    // بناء القائمة المنسدلة
    const select = document.getElementById('withdrawal-reason-select');
    const customGroup = document.getElementById('withdrawal-custom-group');
    const customInput = document.getElementById('withdrawal-custom-input');

    if (!select) return null;

    select.innerHTML = '<option value="">— اختر سبب الانسحاب —</option>';

    staticReasons.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r;
        opt.textContent = r;
        select.appendChild(opt);
    });

    if (dynamicList.length > 0) {
        const sep = document.createElement('option');
        sep.disabled = true;
        sep.textContent = '─── أسباب مضافة من المشرفين ───';
        select.appendChild(sep);
        dynamicList.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r;
            opt.textContent = r;
            select.appendChild(opt);
        });
    }

    const addOpt = document.createElement('option');
    addOpt.value = '__custom__';
    addOpt.textContent = '➕ إضافة سبب جديد...';
    select.appendChild(addOpt);

    if (customGroup) customGroup.style.display = 'none';
    if (customInput) customInput.value = '';

    // إظهار حقل السبب المخصص عند الاختيار
    select.onchange = () => {
        if (customGroup) {
            customGroup.style.display = select.value === '__custom__' ? 'block' : 'none';
        }
    };

    modal.style.display = 'flex';

    return new Promise((resolve) => {
        const confirmBtn = document.getElementById('withdrawal-confirm-btn');
        const cancelBtn = document.getElementById('withdrawal-cancel-btn');
        const closeBtn = document.getElementById('withdrawal-modal-close');

        const cleanup = () => {
            modal.style.display = 'none';
            if (confirmBtn) confirmBtn.replaceWith(confirmBtn.cloneNode(true));
            if (cancelBtn) cancelBtn.replaceWith(cancelBtn.cloneNode(true));
            if (closeBtn) closeBtn.replaceWith(closeBtn.cloneNode(true));
        };

        const handleConfirm = async () => {
            let reason = select.value;
            if (!reason) {
                showAtharNotification('يرجى اختيار سبب الانسحاب أولاً', 'warning');
                return;
            }
            if (reason === '__custom__') {
                const customText = customInput ? customInput.value.trim() : '';
                if (!customText) {
                    showAtharNotification('يرجى كتابة السبب المخصص', 'warning');
                    return;
                }
                reason = await saveCustomReason(customText) || customText;
            }
            cleanup();
            resolve(reason);
        };

        const handleCancel = () => { cleanup(); resolve(null); };

        // إعادة ربط المستمعين لتجنب التكرار (cloneNode trick)
        const newConfirmBtn = document.getElementById('withdrawal-confirm-btn');
        const newCancelBtn = document.getElementById('withdrawal-cancel-btn');
        const newCloseBtn = document.getElementById('withdrawal-modal-close');
        if (newConfirmBtn) newConfirmBtn.addEventListener('click', handleConfirm);
        if (newCancelBtn) newCancelBtn.addEventListener('click', handleCancel);
        if (newCloseBtn) newCloseBtn.addEventListener('click', handleCancel);
    });
}

/**
 * حذف طالب — نظام ذكي ثنائي الخطوات (Smart Soft Delete + ML Labeling)
 * الخطوة 1: نوع الحذف (انسحاب حقيقي أم خطأ بيانات)
 * الخطوة 2: سبب الانسحاب (للتدريب على نماذج ML)
 */
export async function deleteStudentFlow(id, onSuccess) {
    const studentIndex = state.students.findIndex(s => s.id === id);
    if (studentIndex === -1) return;
    const student = state.students[studentIndex];

    // الخطوة 1: اختيار نوع الحذف
    const deleteType = await showAtharChoice(
        'حذف طالب',
        `اختر سبب حذف الطالب (${escapeHTML(student.name || 'بدون اسم')}):`,
        [
            { id: 'withdrawal', text: '🚶 خروج من المجموعة / تسرب' },
            { id: 'data_error', text: '⚠️ خطأ في البيانات / نقل' }
        ]
    );

    if (!deleteType) return;

    // الخيار 2: خطأ في البيانات — حذف عادي بدون تسجيل ML
    if (deleteType === 'data_error') {
        const confirm = await showAtharConfirm(
            'تأكيد الحذف',
            `سيتم حذف بيانات (${escapeHTML(student.name || 'هذا الطالب')}) بسبب خطأ في البيانات. لن يتم تسجيله في بيانات التدريب. هل أنت متأكد؟`
        );
        if (!confirm) return;

        state.students[studentIndex] = {
            id: id,
            isHardDeleted: true,
            deleted: true,
            status: 'data_error',
            name: 'محذوف',
            phone: '',
            progress: {}
        };
        await saveData();
        showAtharNotification('تم حذف بيانات الطالب (خطأ بيانات)');
        if (onSuccess) onSuccess();
        return;
    }

    // الخيار 1: انسحاب حقيقي — الخطوة 2: اختيار السبب
    const reason = await showWithdrawalReasonModal();
    if (!reason) return;

    // حساب الخصائص للتدريب (Feature Engineering)
    const attendanceRatio = calcAttendanceRatio(student);
    const withdrawalTimestamp = Date.now();

    // تحديث عقدة الطالب بالتصنيف الكامل (Soft Delete with ML Features)
    state.students[studentIndex] = {
        ...student,
        deleted: true,
        status: 'withdrawn',
        withdrawal_reason: reason,
        withdrawal_timestamp: withdrawalTimestamp,
        attendance_ratio: attendanceRatio
    };

    await saveData();
    showAtharNotification(`تم تسجيل انسحاب الطالب بسبب: ${reason} ✓`);
    if (onSuccess) onSuccess();
}

/**
 * فتح نافذة تعديل بيانات الطالب
 */
export function openEditStudentModal(id) {
    const student = state.students.find(s => s.id === id);
    if (!student) return;

    const idElem = document.getElementById('edit-id');
    const nameElem = document.getElementById('edit-name');
    const phoneInput = document.getElementById('edit-phone');

    if (idElem) idElem.value = id;
    if (nameElem) nameElem.value = student.name;
    if (phoneInput) {
        phoneInput.value = student.phone || "";
        if (!phoneInput.iti && window.intlTelInput) {
            phoneInput.iti = window.intlTelInput(phoneInput, {
                initialCountry: "eg",
                preferredCountries: ["eg", "sa", "ae", "kw", "qa"],
                countryOrder: ["eg", "sa", "ae", "kw", "qa"],
                separateDialCode: true,
                dropdownContainer: document.body,
                utilsScript: "https://cdn.jsdelivr.net/npm/intl-tel-input@23.0.11/build/js/utils.js"
            });
        }
    }

    const modal = document.getElementById('edit-student-modal');
    if (modal) modal.style.display = 'flex';
}

/**
 * حفظ تعديل بيانات الطالب
 */
export async function saveStudentDataEdit(onSuccess) {
    const id = parseFloat(document.getElementById('edit-id').value);
    const newName = document.getElementById('edit-name').value.trim();
    const phoneInput = document.getElementById('edit-phone');
    const newPhoneRaw = phoneInput.value.trim();
    const newPhone = phoneInput.iti ? (phoneInput.iti.getNumber() || newPhoneRaw) : newPhoneRaw;

    if (!newName) {
        showAtharNotification('الاسم مطلوب', 'error');
        return;
    }

    const idx = state.students.findIndex(s => s.id === id);
    if (idx !== -1) {
        state.students[idx].name = newName;
        state.students[idx].phone = cleanPhone(newPhone);
        await saveData();
        const modal = document.getElementById('edit-student-modal');
        if (modal) modal.style.display = 'none';
        showAtharNotification('تم تعديل بيانات الطالب بنجاح');
        if (onSuccess) onSuccess();
    }
}

/**
 * استيراد كميات من الطلاب (أرقام أو أسماء)
 */
export async function processBulkImport(onSuccess) {
    const rawText = document.getElementById('import-text').value;
    if (!rawText.trim()) return;

    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l);
    if (lines.length === 0) return;

    const confirmImport = await showAtharConfirm("تأكيد الاستيراد", `سيتم استيراد ${lines.length} سجل. هل أنت متأكد؟`);
    if (!confirmImport) return;

    let added = 0;
    lines.forEach((line, idx) => {
        const isPhone = /^[0-9+\-\s()]{8,}$/.test(line);
        let newName = '';
        let newPhone = '';

        if (isPhone) {
            newPhone = cleanPhone(line);
            newName = ' ';
        } else {
            newName = line;
            newPhone = '';
        }

        const exists = state.students.some(s => {
            if (newPhone && s.phone === newPhone) return true;
            if (newName.trim() !== '' && s.name === newName) return true;
            return false;
        });

        if (!exists) {
            state.students.push({
                id: Date.now() + idx,
                name: newName,
                phone: newPhone,
                progress: {},
                notes: ''
            });
            added++;
        }
    });

    await saveData();
    const modal = document.getElementById('import-modal');
    if (modal) modal.style.display = 'none';
    document.getElementById('import-text').value = '';
    showAtharNotification(`✅ تم إضافة ${added} طالب جديد.`);
    if (onSuccess) onSuccess();
}

/**
 * فتح نافذة الملاحظات ومخطط الحضور
 */
export function openNotesModal(studentId) {
    const student = state.students.find(s => s.id === studentId);
    if (!student) return;

    currentEditingStudentId = studentId;

    document.getElementById('modal-student-name').innerText = student.name;
    document.getElementById('modal-student-phone').innerText = student.phone;
    document.getElementById('modal-avatar').innerText = getInitials(student.name);
    document.getElementById('student-notes').value = student.notes || '';
    const ageInput = document.getElementById('student-age');
    if (ageInput) ageInput.value = student.age || '';

    const historyContainer = document.getElementById('attendance-history');
    if (historyContainer) {
        historyContainer.innerHTML = '';
        let chartLabels = [];
        let chartData = [];

        state.lectures.forEach((lec) => {
            const progressValue = student.progress ? student.progress[lec.id] : null;
            const score = calculateScore(lec.timestamp, progressValue);

            let statusText = 'غائب';
            let statusClass = 'absent';
            let icon = '<i class="fa-solid fa-xmark"></i>';

            if (progressValue) {
                statusClass = 'present';
                icon = '<i class="fa-solid fa-check"></i>';

                if (score === 100) statusText = 'تم (السبت)';
                else if (score === 90) statusText = 'تم (الأحد)';
                else if (score === 80) statusText = 'تم (الاثنين)';
                else if (score === 70) statusText = 'تم (الثلاثاء)';
                else if (score === 60) statusText = 'تم (الأربعاء)';
                else if (score === 50) statusText = 'تم (الخميس)';
                else if (score === 40) statusText = 'تم (الجمعة)';
                else if (score === 30) statusText = 'تأخير أسبوع';
                else if (score === 20) statusText = 'تأخير أسبوعين';
                else if (score === 10) statusText = 'تأخير > أسبوعين';

                if (score <= 30) statusClass = 'absent';
            }

            const itemHTML = `
                <div class="history-item ${statusClass}">
                    <div>
                        <div style="font-weight:bold">${lec.title}</div>
                        <div class="date" style="font-size:0.7rem; color:#aaa;">
                             ${progressValue && progressValue !== true ? new Date(progressValue).toLocaleDateString('ar-EG') : ''}
                        </div>
                    </div>
                    <div class="status">${icon} ${statusText}</div>
                </div>
            `;
            historyContainer.insertAdjacentHTML('afterbegin', itemHTML);

            chartLabels.push(lec.title);
            chartData.push(score);
        });

        // رسم المخطط البياني
        const chartCanvas = document.getElementById('performanceChart');
        if (chartCanvas && window.Chart) {
            const ctx = chartCanvas.getContext('2d');
            if (performanceChart) performanceChart.destroy();

            performanceChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: chartLabels,
                    datasets: [{
                        label: 'حالة التسليم',
                        data: chartData,
                        borderColor: '#1A5D3A',
                        backgroundColor: 'rgba(26, 93, 58, 0.05)',
                        borderWidth: 3,
                        pointBackgroundColor: function (context) {
                            var val = context.raw;
                            if (val >= 90) return '#27ae60';
                            if (val >= 40) return '#f39c12';
                            return '#e74c3c';
                        },
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        pointRadius: 6,
                        pointHoverRadius: 8,
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 100,
                            min: 0,
                            ticks: {
                                stepSize: 10,
                                font: { family: 'Cairo', size: 10, weight: 'bold' },
                                color: '#555',
                                callback: function (value) {
                                    if (value === 100) return 'السبت 👑';
                                    if (value === 90) return 'الأحد';
                                    if (value === 80) return 'الاثنين';
                                    if (value === 70) return 'الثلاثاء';
                                    if (value === 60) return 'الأربعاء';
                                    if (value === 50) return 'الخميس';
                                    if (value === 40) return 'الجمعة';
                                    if (value === 30) return 'تأخير أسبوع';
                                    if (value === 20) return 'تأخير أسبوعين';
                                    if (value === 10) return '> أسبوعين';
                                    if (value === 0) return 'غائب';
                                    return '';
                                }
                            }
                        },
                        x: { grid: { display: false } }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }
    }

    const modal = document.getElementById('notes-modal');
    if (modal) modal.style.display = 'flex';
}

export function closeNotesModal() {
    const modal = document.getElementById('notes-modal');
    if (modal) modal.style.display = 'none';
    currentEditingStudentId = null;
}

export async function saveStudentNotes() {
    if (!currentEditingStudentId) return;
    const idx = state.students.findIndex(s => s.id === currentEditingStudentId);
    if (idx !== -1) {
        const ageInput = document.getElementById('student-age');
        if (ageInput) {
            const ageVal = ageInput.value.trim();
            state.students[idx].age = ageVal ? parseInt(ageVal) : '';
        }
        state.students[idx].notes = document.getElementById('student-notes').value;
        await saveData();
        closeNotesModal();
        showAtharNotification("تم حفظ البيانات والملاحظات بنجاح");
    }
}

/**
 * تصفير قائمة الطلاب الخاصة بالمشرف
 */
export async function wipeAllData(onSuccess) {
    if (state.userInfo?.role === 'group_supervisor') {
        showAtharNotification("عذراً، هذه الخاصية غير متاحة لمشرف المجموعة", "error");
        return;
    }

    const code = await showAtharPrompt("تحذير تصفير البيانات", "هذا الإجراء سيحذف جميع طلابك المسجلين لديك!\nللتأكيد اكتب: delete");
    if (code === 'delete') {
        state.students = [];
        await saveData();
        showAtharNotification("🚀 تم تصفير قائمة طلابك بنجاح!");
        if (onSuccess) onSuccess();
    }
}

let customTransferSelectedIds = new Set();
let customTransferCallback = null;

/**
 * تسليم الطلاب لمشرف آخر (مع اختيار الفئات أو التحديد المخصص)
 */
export async function initiateStudentTransfer(onSuccess) {
    if (!currentUser || !currentGroup) return;

    const activeStudents = state.students.filter(s => !s.deleted);
    if (activeStudents.length === 0) {
        showAtharNotification("لا يوجد طلاب نشطين لتسليمهم!", "warning");
        return;
    }

    const latestLec = state.lectures.length > 0 ? state.lectures[state.lectures.length - 1] : null;

    // 1. عرض خيارات الفئات والتحديد المخصص
    const filterChoice = await showAtharChoice(
        "تسليم الطلاب لمشرف آخر",
        "اختر فئة الطلاب التي تود تسليمها للمشرف الآخر:",
        [
            { id: '1', text: "🔴 الغياب الحقيقي (أسماء مسجلة غائبة عن المحاضرة الأخيرة)" },
            { id: '2', text: "💬 رد ولم يختبر (الأصفر)" },
            { id: '3', text: "⚪ غير مسجل (الخانات الفارغة)" },
            { id: '4', text: "⚫ كل المتغيبين (من لم يختبروا المحاضرة الأخيرة)" },
            { id: '5', text: "🟢 المختبرون فقط" },
            { id: '6', text: "🌐 الجميع (كل القائمة)" },
            { id: '7', text: "✨ تحديد مخصص (اختيار يدوي من الجدول)" }
        ]
    );

    if (!filterChoice) return;

    if (filterChoice === '7') {
        // فتح نافذة التحديد المخصص للطلاب
        openCustomTransferModal((selectedList) => {
            proceedWithTransfer(selectedList, onSuccess);
        });
        return;
    }

    // تصفية الطلاب حسب الفئة المختارة
    let selectedStudents = [];
    activeStudents.forEach(s => {
        const p = (latestLec && s.progress) ? s.progress[latestLec.id] : null;
        const hasName = s.name && s.name.trim().length > 0;
        const isReplied = (p === 'replied');
        const isTested = (p && p !== 'replied');

        let matches = false;
        switch (filterChoice) {
            case '1': matches = (!p && hasName); break;
            case '2': matches = isReplied; break;
            case '3': matches = (!isTested && !hasName); break;
            case '4': matches = !isTested; break;
            case '5': matches = isTested; break;
            case '6': matches = true; break;
            default: matches = false;
        }

        if (matches) selectedStudents.push(s);
    });

    if (selectedStudents.length === 0) {
        showAtharNotification("لا يوجد طلاب يطابقون هذه الفئة لتسليمهم!", "info");
        return;
    }

    await proceedWithTransfer(selectedStudents, onSuccess);
}

/**
 * استكمال إرسال طلب التسليم
 */
async function proceedWithTransfer(selectedStudents, onSuccess) {
    if (!selectedStudents || selectedStudents.length === 0) {
        showAtharNotification("لم يتم تحديد أي طالب للتسليم!", "warning");
        return;
    }

    const recipientPhoneRaw = await showAtharPrompt(
        "تسليم الطلاب",
        `عدد الطلاب المحددين للتسليم: (${selectedStudents.length}) طالب.\n\nأدخل رقم واتساب المشرف الذي سيتسلم الطلاب:`,
        ""
    );
    if (!recipientPhoneRaw) return;

    const recipientPhone = cleanPhone(recipientPhoneRaw);
    if (!recipientPhone) {
        showAtharNotification("رقم الهاتف غير صحيح!", "error");
        return;
    }

    const confirm = await showAtharConfirm(
        "تأكيد إرسال طلب التسليم",
        `أنت على وشك إرسال طلب تسليم (${selectedStudents.length}) طالب إلى المشرف صاحب الرقم (${recipientPhone}).\n\n📌 ملاحظة هامة: سيتم حذف هؤلاء الطلاب من عندك ونقلهم للمشرف الآخر بمجرد موافقته على الطلب.\n\nهل تود الاستمرار؟`
    );
    if (!confirm) return;

    try {
        const transferRef = push(ref(db, `athar_groups/${currentGroup.id}/transfers`));
        await set(transferRef, {
            senderUid: currentUser.uid,
            senderName: state.userInfo?.name || "مشرف مجهول",
            senderPhone: state.userInfo?.phone || "",
            recipientPhone: recipientPhone,
            students: selectedStudents,
            status: 'pending',
            timestamp: Date.now()
        });

        showAtharNotification(`تم إرسال طلب تسليم (${selectedStudents.length}) طالب بنجاح ✓ بمجرد قبول المشرف الآخر سيتم نقلهم وحذفهم من عندك.`);
        if (onSuccess) onSuccess();
    } catch (error) {
        showAtharNotification("خطأ أثناء إرسال الطلب: " + error.message, "error");
    }
}

/**
 * فحص وجود طلبات تسليم معلقة
 */
export async function checkPendingTransfers(onSuccess) {
    if (!currentUser || !currentGroup) return;

    try {
        const transfersRef = ref(db, `athar_groups/${currentGroup.id}/transfers`);
        const snapshot = await get(transfersRef);
        if (!snapshot.exists()) return;

        const transfers = snapshot.val();
        let myPhone = state.userInfo?.phone ? cleanPhone(state.userInfo.phone) : null;

        const isMatch = (phone1, phone2) => {
            if (!phone1 || !phone2) return false;
            let p1 = cleanPhone(phone1);
            let p2 = cleanPhone(phone2);
            if (p1.startsWith('20') && p1.length > 10) p1 = p1.substring(2);
            if (p2.startsWith('20') && p2.length > 10) p2 = p2.substring(2);
            return p1.slice(-9) === p2.slice(-9);
        };

        const pendingTransfers = Object.values(transfers).filter(t => t.status === 'pending');
        if (pendingTransfers.length > 0 && !myPhone) {
            const tempPhone = await showAtharPrompt(
                "تنبيه استلام طلاب",
                "هناك مشرف يحاول إرسال طلاب إليك، لكن ملفك الشخصي لا يحتوي على رقم هاتف.\nيرجى إدخال رقم واتساب الخاص بك بدقة لاستلامهم:",
                ""
            );
            if (tempPhone && cleanPhone(tempPhone)) {
                myPhone = cleanPhone(tempPhone);
                await update(ref(db, `users/${currentUser.uid}`), { phone: myPhone });
                if (state.userInfo) state.userInfo.phone = myPhone;
            } else {
                return;
            }
        }

        if (!myPhone) return;

        for (const tid in transfers) {
            const transfer = transfers[tid];
            if (transfer.status === 'pending' && isMatch(transfer.recipientPhone, myPhone)) {
                const accept = await showAtharConfirm(
                    "وصول طلاب جدد!",
                    `المشرف (${transfer.senderName}) يود تسليمك (${transfer.students.length}) طالب.\n\nهل تود قبولهم وإضافتهم لقائمتك الآن؟`
                );

                if (accept) {
                    await acceptStudentTransfer(tid, transfer, onSuccess);
                } else {
                    await update(ref(db, `athar_groups/${currentGroup.id}/transfers/${tid}`), { status: 'rejected' });
                }
            }
        }
    } catch (error) {
        console.error("Check transfers error:", error);
    }
}

/**
 * قبول استلام الطلاب ونقلهم وحذفهم من المشرف المرسل
 */
export async function acceptStudentTransfer(tid, data, onSuccess) {
    try {
        const groupId = currentGroup.id;
        const currentStudents = state.students || [];
        const combinedStudents = [...currentStudents, ...data.students];

        // قراءة قائمة طلاب المشرف المرسل الحالية لحذف الطلاب المنقولين فقط من عنده
        let remainingSenderStudents = [];
        try {
            const senderSnapshot = await get(ref(db, `athar_groups/${groupId}/students/${data.senderUid}/students`));
            if (senderSnapshot.exists()) {
                const senderList = senderSnapshot.val() || [];
                const transferredIds = new Set(data.students.map(s => s.id));
                remainingSenderStudents = senderList.filter(s => !transferredIds.has(s.id));
            }
        } catch (err) {
            console.warn("Could not read sender student list:", err);
        }

        const updates = {};
        updates[`athar_groups/${groupId}/students/${currentUser.uid}/students`] = combinedStudents;
        updates[`athar_groups/${groupId}/students/${data.senderUid}/students`] = remainingSenderStudents;
        updates[`athar_groups/${groupId}/transfers/${tid}/status`] = 'completed';
        updates[`athar_groups/${groupId}/transfers/${tid}/acceptedAt`] = Date.now();

        await update(ref(db), updates);
        state.students = combinedStudents;

        showAtharNotification(`🎉 تم استلام (${data.students.length}) طالب بنجاح وإضافتهم لقائمتك!`, "success");
        if (onSuccess) onSuccess();
    } catch (error) {
        showAtharNotification("خطأ أثناء استلام الطلاب: " + error.message, "error");
    }
}

/* ==========================================================================
   ✨ نافذة التحديد المخصص للطلاب المراد تسليمهم (Custom Transfer Selection)
   ========================================================================== */

export function openCustomTransferModal(onProceed) {
    customTransferCallback = onProceed;
    customTransferSelectedIds = new Set();

    const modal = document.getElementById('custom-transfer-modal');
    if (!modal) return;

    modal.style.display = 'flex';
    renderCustomTransferTable();
}

export function closeCustomTransferModal() {
    const modal = document.getElementById('custom-transfer-modal');
    if (modal) modal.style.display = 'none';
    customTransferCallback = null;
}

export function renderCustomTransferTable(filterText = '') {
    const tbody = document.getElementById('transfer-students-tbody');
    if (!tbody) return;

    const activeStudents = state.students.filter(s => !s.deleted);
    const totalLectures = state.lectures.length;

    let filtered = activeStudents;
    if (filterText) {
        const query = filterText.toLowerCase().trim();
        filtered = activeStudents.filter(s =>
            (s.name || '').toLowerCase().includes(query) ||
            (s.phone || '').toLowerCase().includes(query)
        );
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:#888;">لا يوجد طلاب مطابقون للبحث</td></tr>`;
        updateTransferBadge();
        return;
    }

    let rowsHTML = '';
    filtered.forEach(s => {
        const isChecked = customTransferSelectedIds.has(s.id);
        const safeName = escapeHTML(s.name || 'بدون اسم');
        const safePhone = escapeHTML(s.phone || '-');

        // حساب المحاضرات المختبرة
        let testedCount = 0;
        if (s.progress) {
            for (const lec of state.lectures) {
                const p = s.progress[lec.id];
                if (p && p !== 'replied') testedCount++;
            }
        }
        const percent = totalLectures > 0 ? Math.round((testedCount / totalLectures) * 100) : 0;
        let badgeColor = '#e74c3c';
        if (percent >= 75) badgeColor = '#27ae60';
        else if (percent >= 50) badgeColor = '#f39c12';

        const rowBg = isChecked ? 'rgba(26, 93, 58, 0.12)' : 'var(--bg-card, #ffffff)';

        rowsHTML += `
            <tr style="border-bottom: 1px solid var(--border-color); background: ${rowBg}; transition: background 0.15s;">
                <td style="text-align: center; padding: 10px 8px; width: 48px; min-width: 48px; position: sticky; right: 0; background: ${rowBg}; z-index: 1; box-shadow: -2px 0 4px rgba(0,0,0,0.06);">
                    <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="window.app.toggleTransferStudentSelection(${s.id}, this.checked)" style="cursor: pointer; transform: scale(1.2);">
                </td>
                <td style="padding: 10px 10px; white-space: nowrap; min-width: 150px;">
                    <strong style="color: var(--text-dark);">${safeName}</strong>
                </td>
                <td style="padding: 10px 10px; direction: ltr; font-family: monospace; white-space: nowrap; min-width: 130px; color: var(--text-light);">
                    ${safePhone}
                </td>
                <td style="padding: 10px 10px; text-align: center; white-space: nowrap; min-width: 140px;">
                    <span style="background: ${badgeColor}; color: white; padding: 3px 10px; border-radius: 12px; font-size: 0.78rem; font-weight: bold; display: inline-block;">
                        ${testedCount} / ${totalLectures} (${percent}%)
                    </span>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = rowsHTML;
    updateTransferBadge();
}

export function toggleTransferStudentSelection(sId, checked) {
    if (checked) {
        customTransferSelectedIds.add(sId);
    } else {
        customTransferSelectedIds.delete(sId);
    }
    updateTransferBadge();
}

export function toggleSelectAllTransfer() {
    const activeStudents = state.students.filter(s => !s.deleted);
    const btn = document.getElementById('transfer-select-all-btn');

    if (customTransferSelectedIds.size === activeStudents.length) {
        customTransferSelectedIds.clear();
        if (btn) btn.innerHTML = '<i class="fa-solid fa-check-double"></i> تحديد الكل';
    } else {
        activeStudents.forEach(s => customTransferSelectedIds.add(s.id));
        if (btn) btn.innerHTML = '<i class="fa-solid fa-xmark"></i> إلغاء تحديد الكل';
    }

    const searchInput = document.getElementById('transfer-search-input');
    renderCustomTransferTable(searchInput ? searchInput.value : '');
}

export function filterTransferStudentsList() {
    const searchInput = document.getElementById('transfer-search-input');
    renderCustomTransferTable(searchInput ? searchInput.value : '');
}

function updateTransferBadge() {
    const countBadge = document.getElementById('transfer-selected-count-badge');
    const proceedBtn = document.getElementById('proceed-custom-transfer-btn');
    const count = customTransferSelectedIds.size;

    if (countBadge) countBadge.innerText = `المحدد: ${count} طالب`;
    if (proceedBtn) proceedBtn.innerText = `متابعة التسليم (${count} طالب) ➡️`;
}

export function proceedCustomTransfer() {
    if (customTransferSelectedIds.size === 0) {
        showAtharNotification("يرجى تحديد طالب واحد على الأقل للمتابعة!", "warning");
        return;
    }

    const selectedStudents = state.students.filter(s => customTransferSelectedIds.has(s.id));
    const cb = customTransferCallback;
    closeCustomTransferModal();

    if (cb) cb(selectedStudents);
}

let cleanedStudentsCache = [];

/**
 * فتح نافذة المنظف الذكي للقوائم
 */
export function openAICleaner() {
    const modal = document.getElementById('ai-cleaner-modal');
    if (modal) {
        modal.style.display = 'flex';
        const input = document.getElementById('ai-cleaner-input');
        if (input) input.focus();
    }
}

/**
 * إغلاق نافذة المنظف الذكي
 */
export function closeAICleaner() {
    const modal = document.getElementById('ai-cleaner-modal');
    if (modal) modal.style.display = 'none';
}

/**
 * تشغيل المنظف الذكي بالذكاء الاصطناعي
 */
export async function runAICleaner() {
    const input = document.getElementById('ai-cleaner-input');
    const btn = document.getElementById('btn-run-cleaner');
    const resultsContainer = document.getElementById('ai-cleaner-results');
    const tableBody = document.getElementById('ai-cleaner-table-body');
    const countBadge = document.getElementById('ai-cleaner-count');

    if (!input || !input.value.trim()) {
        showAtharNotification("يرجى لصق النص المراد تنظيفه أولاً", "warning");
        return;
    }

    const rawText = input.value.trim();
    const originalBtnHTML = btn ? btn.innerHTML : '';

    if (btn) {
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري التحليل والتنظيف بالذكاء الاصطناعي...`;
        btn.disabled = true;
    }

    const prompt = `أنت خبير ذكاء اصطناعي متخصص في تنظيف واستخراج بيانات الطلاب من النصوص العشوائية والمنسوخة من الواتساب.

المطلوب: استخرج كل الطلاب من النص التالي بصيغة JSON Array تحتوي حصراً على:
- name: اسم الطالب النظيف (بدون أرقام تسلسلية وبدون كلمات زائدة مثل 'الطالب:' أو 'الأخ' أو أي نصوص فرعية).
- phone: رقم هاتف الطالب فقط (أرقام صحيحة).

أعد فقط كود JSON خالص بدون أي نصوص قبلية أو بعدية وبدون ماركداون:
[
  {"name": "...", "phone": "..."}
]

النص المراد تنظيفه:
${rawText}`;

    const GEMINI_API_KEY = atob("QVEuQWI4Uk42SmlicmNqMlpyLWxkdVRQdFZfTE4xMmREaU5EdzN0bUg2WXYtY08xclBseFE=");
    const modelsToTry = [
        'gemini-3.5-flash-lite',
        'gemini-3.5-flash',
        'gemini-3-flash-preview',
        'gemini-3.1-flash-lite'
    ];

    let parsedList = null;

    for (const modelName of modelsToTry) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.1 }
                })
            });

            if (response.ok) {
                const data = await response.json();
                let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
                text = text.replace(/```json/g, '').replace(/```/g, '').trim();

                const jsonStart = text.indexOf('[');
                const jsonEnd = text.lastIndexOf(']');
                if (jsonStart !== -1 && jsonEnd !== -1) {
                    const jsonStr = text.substring(jsonStart, jsonEnd + 1);
                    const list = JSON.parse(jsonStr);
                    if (Array.isArray(list) && list.length > 0) {
                        parsedList = list;
                        trackGeminiCall('cleaner'); // تتبع نجاح المنظّف الذكي
                        break;
                    }
                }
            }
        } catch (e) {
            console.warn(`AI Cleaner failed on model ${modelName}:`, e);
        }
    }

    if (btn) {
        btn.innerHTML = originalBtnHTML;
        btn.disabled = false;
    }

    if (!parsedList || parsedList.length === 0) {
        trackGeminiCall('cleaner', true); // تتبع فشل جميع النماذج
        showAtharNotification("تعذر استخراج بيانات واضحة من النص المدخل. تأكد من وجود أرقام وأسماء.", "error");
        return;
    }

    cleanedStudentsCache = parsedList.map(item => ({
        name: (item.name || "").trim(),
        phone: cleanPhone(item.phone || "")
    })).filter(s => s.name || s.phone);

    if (countBadge) {
        countBadge.innerText = `تم استخراج (${cleanedStudentsCache.length}) طالب بنجاح ✓`;
    }

    if (tableBody) {
        tableBody.innerHTML = '';
        cleanedStudentsCache.forEach((s, idx) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding: 8px; text-align: center; color: var(--primary-green); font-weight: bold;">${idx + 1}</td>
                <td style="padding: 8px; text-align: right; font-weight: bold;">${s.name || '<span style="color:#aaa;">(بدون اسم)</span>'}</td>
                <td style="padding: 8px; text-align: right; direction: ltr; font-family: monospace;">${s.phone || '<span style="color:#aaa;">(بدون هاتف)</span>'}</td>
            `;
            tableBody.appendChild(tr);
        });
    }

    if (resultsContainer) {
        resultsContainer.style.display = 'block';
    }

    showAtharNotification(`✨ تم استخراج وتجهيز ${cleanedStudentsCache.length} طالب بنجاح!`, "success");
}

/**
 * استيراد الطلاب المنظفين مباشرة إلى قاعدة البيانات
 */
export async function importCleanedStudents(onSuccess) {
    if (!cleanedStudentsCache || cleanedStudentsCache.length === 0) {
        showAtharNotification("لا توجد بيانات منظفة للاستيراد", "warning");
        return;
    }

    const confirm = await showAtharConfirm(
        "تأكيد الاستيراد المباشر",
        `هل تريد إضافة (${cleanedStudentsCache.length}) طالب إلى قائمتك في المنصة الآن؟`
    );
    if (!confirm) return;

    let added = 0;
    cleanedStudentsCache.forEach((item, idx) => {
        const cleanP = cleanPhone(item.phone);
        const name = (item.name || '').trim();

        const exists = state.students.some(s => {
            if (cleanP && s.phone === cleanP) return true;
            if (name !== '' && s.name === name) return true;
            return false;
        });

        if (!exists) {
            state.students.push({
                id: Date.now() + idx,
                name: name,
                phone: cleanP,
                progress: {},
                notes: ''
            });
            added++;
        }
    });

    await saveData();
    closeAICleaner();

    // مسح الحقل بعد الاستيراد
    const input = document.getElementById('ai-cleaner-input');
    if (input) input.value = '';
    const resultsContainer = document.getElementById('ai-cleaner-results');
    if (resultsContainer) resultsContainer.style.display = 'none';

    showAtharNotification(`🎉 تم استيراد ${added} طالب بنجاح إلى جدول المتابعة!`, "success");
    if (onSuccess) onSuccess();
}

/**
 * نسخ القائمة المنظفة للحافظة
 */
export function copyCleanedStudents() {
    if (!cleanedStudentsCache || cleanedStudentsCache.length === 0) {
        showAtharNotification("لا توجد بيانات منظفة لنسخها", "warning");
        return;
    }

    const formattedText = cleanedStudentsCache.map((s, idx) => `${idx + 1}- ${s.name} ${s.phone}`).join('\n');

    navigator.clipboard.writeText(formattedText).then(() => {
        showAtharNotification("📋 تم نسخ القائمة المنظفة إلى الحافظة بنجاح ✓", "success");
    }).catch(() => {
        const dummy = document.createElement("textarea");
        dummy.value = formattedText;
        document.body.appendChild(dummy);
        dummy.select();
        document.execCommand("copy");
        document.body.removeChild(dummy);
        showAtharNotification("📋 تم نسخ القائمة المنظفة إلى الحافظة بنجاح ✓", "success");
    });
}
