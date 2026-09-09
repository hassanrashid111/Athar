/**
 * منصة أثر التعليمية - إعداد وانضمام المجموعات (Group Setup — Stepper Flow)
 */

import { auth, db, ref, set, get, update } from "./firebase-config.js";
import { state, currentUser, setCurrentUser, setCurrentGroup, showLoader, removeLoader } from "./state.js";
import { showAtharNotification } from "./utils.js";
import { initPageAuth } from "./router.js";
import { handleLogout } from "./auth.js";

/* ─── حالة الـ Stepper ─────────────────────────────── */
let _currentStep = 1;
let _selectedChoice = null; // 'create' | 'join'

/* ─── تهيئة الصفحة ─────────────────────────────────── */
export async function initSetup() {
    showLoader("جاري التحقق من بيانات الحساب...");
    const { user, userData, activeGroupId } = await initPageAuth();
    removeLoader();

    if (activeGroupId) {
        if (userData.role === 'group_supervisor') {
            window.location.replace('/reports');
        } else {
            window.location.replace('/dashboard');
        }
        return;
    }

    // إذا كان المستخدم مشرف مجموعة، اختر له مسبقاً خيار الإنشاء
    if (userData.role === 'group_supervisor') {
        _autoSelectChoice('create');
    }
    // إذا كان مشرف متابعة، اختر له الانضمام
    else if (userData.role === 'followup_supervisor') {
        _autoSelectChoice('join');
    }

    goStep(1);
}

/* ─── اختيار تلقائي حسب الدور ──────────────────────── */
function _autoSelectChoice(choice) {
    _selectedChoice = choice;
    const btn = document.getElementById(choice === 'create' ? 'choice-create' : 'choice-join');
    if (btn) {
        document.querySelectorAll('.role-choice-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
    }
    const nextBtn = document.getElementById('step1-next');
    if (nextBtn) nextBtn.disabled = false;
}

/* ─── التنقل بين الخطوات ────────────────────────────── */
export function goStep(stepNum) {
    // إخفاء الخطوة الحالية وإظهار الجديدة
    for (let i = 1; i <= 3; i++) {
        const el = document.getElementById(`setup-step-${i}`);
        if (el) el.style.display = (i === stepNum) ? 'block' : 'none';
    }

    // تحديث شريط التقدم
    for (let i = 1; i <= 3; i++) {
        const ind = document.getElementById(`step-indicator-${i}`);
        if (!ind) continue;
        ind.classList.remove('active', 'done');
        if (i < stepNum) ind.classList.add('done');
        else if (i === stepNum) ind.classList.add('active');
    }

    // تحديث خطوط التقدم
    document.querySelectorAll('.step-line').forEach((line, idx) => {
        line.classList.toggle('done', idx + 1 < stepNum);
    });

    // منطق إضافي حسب الخطوة
    if (stepNum === 2) {
        _renderStep2();
    } else if (stepNum === 3) {
        _renderStep3();
    }

    _currentStep = stepNum;
}

/* ─── رسم الخطوة 2 (نماذج البيانات) ────────────────── */
function _renderStep2() {
    const createSection = document.getElementById('create-group-section');
    const joinSection   = document.getElementById('join-group-section');
    const title         = document.getElementById('step2-title');
    const subtitle      = document.getElementById('step2-subtitle');

    if (_selectedChoice === 'create') {
        if (createSection) createSection.style.display = 'block';
        if (joinSection)   joinSection.style.display   = 'none';
        if (title)    title.textContent    = 'إنشاء مجموعة جديدة';
        if (subtitle) subtitle.textContent = 'أدخل بيانات المجموعة التي ستديرها';
    } else {
        if (createSection) createSection.style.display = 'none';
        if (joinSection)   joinSection.style.display   = 'block';
        if (title)    title.textContent    = 'الانضمام لمجموعة';
        if (subtitle) subtitle.textContent = 'أدخل كود المجموعة المُرسَل إليك';
    }
}

/* ─── رسم الخطوة 3 (ملخص التأكيد) ──────────────────── */
function _renderStep3() {
    const summaryEl = document.getElementById('step3-summary');
    const titleEl   = document.getElementById('step3-title');
    const subEl     = document.getElementById('step3-subtitle');
    if (!summaryEl) return;

    if (_selectedChoice === 'create') {
        const name     = document.getElementById('new-group-name')?.value?.trim() || '—';
        const number   = document.getElementById('new-group-number')?.value?.trim() || '—';
        const lectures = document.getElementById('new-group-lectures')?.value || '12';

        if (titleEl)  titleEl.textContent  = 'تأكيد إنشاء المجموعة';
        if (subEl)    subEl.textContent    = 'راجع البيانات وأكد الإنشاء';

        summaryEl.innerHTML = `
            <div class="summary-row">
                <i class="fa-solid fa-layer-group"></i>
                <span class="summary-label">اسم المجموعة</span>
                <span class="summary-value">${name}</span>
            </div>
            <div class="summary-row">
                <i class="fa-solid fa-hashtag"></i>
                <span class="summary-label">رقم المجموعة</span>
                <span class="summary-value">${number}</span>
            </div>
            <div class="summary-row">
                <i class="fa-solid fa-list-ol"></i>
                <span class="summary-label">المحاضرات</span>
                <span class="summary-value">${lectures} محاضرة</span>
            </div>
        `;
    } else {
        const code = document.getElementById('join-group-id')?.value?.trim() || '—';

        if (titleEl) titleEl.textContent = 'تأكيد الانضمام للمجموعة';
        if (subEl)   subEl.textContent   = 'سيتم التحقق من الكود والانضمام';

        summaryEl.innerHTML = `
            <div class="summary-row">
                <i class="fa-solid fa-key"></i>
                <span class="summary-label">كود المجموعة</span>
                <span class="summary-value" style="direction:ltr; font-family:monospace;">${code}</span>
            </div>
        `;
    }
}

/* ─── اختيار نوع العملية (خطوة 1) ──────────────────── */
export function selectChoice(choice) {
    _selectedChoice = choice;

    // تحديث حالة الأزرار
    document.querySelectorAll('.role-choice-btn').forEach(btn => {
        btn.classList.remove('selected');
    });

    const selected = document.getElementById(choice === 'create' ? 'choice-create' : 'choice-join');
    if (selected) selected.classList.add('selected');

    // تفعيل زر التالي
    const nextBtn = document.getElementById('step1-next');
    if (nextBtn) nextBtn.disabled = false;
}

/* ─── التحقق من بيانات الخطوة 2 ────────────────────── */
export function submitStep2() {
    if (_selectedChoice === 'create') {
        const name   = document.getElementById('new-group-name')?.value?.trim();
        const number = document.getElementById('new-group-number')?.value?.trim();

        if (!name) {
            showAtharNotification("يرجى إدخال اسم المجموعة", "error");
            document.getElementById('new-group-name')?.focus();
            return;
        }
        if (!number) {
            showAtharNotification("يرجى إدخال رقم المجموعة", "error");
            document.getElementById('new-group-number')?.focus();
            return;
        }
    } else {
        const code = document.getElementById('join-group-id')?.value?.trim();
        if (!code) {
            showAtharNotification("يرجى إدخال كود المجموعة", "error");
            document.getElementById('join-group-id')?.focus();
            return;
        }
    }

    goStep(3);
}

/* ─── التنفيذ النهائي ────────────────────────────────── */
export async function finalSubmit() {
    if (_selectedChoice === 'create') {
        await createGroupFlow();
    } else {
        await joinGroupFlow();
    }
}

/* ─── إنشاء مجموعة جديدة ────────────────────────────── */
export async function createGroupFlow() {
    const nameElem     = document.getElementById('new-group-name');
    const numberElem   = document.getElementById('new-group-number');
    const lecturesElem = document.getElementById('new-group-lectures');

    if (!nameElem || !numberElem) return;

    const name          = nameElem.value.trim();
    const number        = numberElem.value.trim();
    const totalLectures = lecturesElem ? (parseInt(lecturesElem.value) || 12) : 12;

    if (!name || !number) {
        showAtharNotification("برجاء إدخال اسم ورقم المجموعة", "error");
        goStep(2);
        return;
    }

    const uid = currentUser?.uid || auth.currentUser?.uid;
    if (!uid) {
        showAtharNotification("جلسة المستخدم غير صالحة. يرجى تسجيل الدخول مجدداً.", "error");
        window.location.replace('/');
        return;
    }

    // توليد كود مجموعة: 5 أرقام + رمز + حرف
    const SYMBOLS = ['#', '-', '@', '!', '.'];
    const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const digits  = String(Math.floor(10000 + Math.random() * 90000));
    const symbol  = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    const letter  = LETTERS[Math.floor(Math.random() * LETTERS.length)];
    const groupId = `${digits}${symbol}${letter}`;

    const submitBtn = document.getElementById('btn-final-submit');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الإنشاء...'; }

    try {
        showLoader("جاري إنشاء المجموعة وحفظ الصلاحيات...");

        await set(ref(db, `athar_groups/${groupId}/info`), {
            name, number, totalLectures,
            adminUid: uid,
            createdAt: Date.now()
        });

        await set(ref(db, `athar_groups/${groupId}/data/settings`), {
            totalPlannedLectures: totalLectures
        });

        const userRef  = ref(db, `users/${uid}`);
        const userSnap = await get(userRef);
        let groups     = [];
        if (userSnap.exists() && userSnap.val().groups) {
            groups = userSnap.val().groups;
        }
        if (!groups.includes(groupId)) groups.push(groupId);

        await update(userRef, {
            groupId, activeGroupId: groupId, groups, role: 'group_supervisor'
        });

        if (state.userInfo) {
            state.userInfo.groupId = groupId;
            state.userInfo.activeGroupId = groupId;
            state.userInfo.groups = groups;
            state.userInfo.role   = 'group_supervisor';
        }

        setCurrentGroup({ id: groupId, name, number, adminUid: uid, totalLectures });

        showAtharNotification(`✅ تم إنشاء المجموعة بنجاح! الكود: ${groupId}`);
        setTimeout(() => { window.location.replace('/reports'); }, 800);

    } catch (error) {
        removeLoader();
        console.error("Create group error:", error);
        showAtharNotification("خطأ في إنشاء المجموعة: " + error.message, "error");
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> تأكيد وبدء'; }
    }
}

/* ─── الانضمام لمجموعة موجودة ───────────────────────── */
export async function joinGroupFlow() {
    const groupIdInput = document.getElementById('join-group-id');
    if (!groupIdInput) return;

    const inputCode = groupIdInput.value.trim();
    if (!inputCode) {
        showAtharNotification("يرجى إدخال كود المجموعة", "error");
        goStep(2);
        return;
    }

    const uid = currentUser?.uid || auth.currentUser?.uid;
    if (!uid) {
        showAtharNotification("جلسة المستخدم غير صالحة. يرجى تسجيل الدخول مجدداً.", "error");
        window.location.replace('/');
        return;
    }

    const submitBtn = document.getElementById('btn-final-submit');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التحقق...'; }

    try {
        showLoader("جاري التحقق من كود المجموعة...");
        let validGroupId = null;

        // فحص مباشر
        const directSnap = await get(ref(db, `athar_groups/${inputCode}/info`));
        if (directSnap.exists()) {
            validGroupId = inputCode;
        } else {
            const upperCode  = inputCode.toUpperCase();
            const upperSnap  = await get(ref(db, `athar_groups/${upperCode}/info`));
            if (upperSnap.exists()) {
                validGroupId = upperCode;
            } else {
                // فحص شامل
                const allSnap = await get(ref(db, `athar_groups`));
                if (allSnap.exists()) {
                    for (const gid of Object.keys(allSnap.val())) {
                        if (gid.trim().toLowerCase() === inputCode.toLowerCase()) {
                            validGroupId = gid;
                            break;
                        }
                    }
                }
            }
        }

        if (validGroupId) {
            const userRef  = ref(db, `users/${uid}`);
            const userSnap = await get(userRef);
            let groups     = [];
            if (userSnap.exists() && userSnap.val().groups) groups = userSnap.val().groups;
            if (!groups.includes(validGroupId)) groups.push(validGroupId);

            await update(userRef, {
                groupId: validGroupId, activeGroupId: validGroupId,
                groups, role: 'followup_supervisor'
            });

            const supervisorRef = ref(db, `athar_groups/${validGroupId}/students/${uid}`);
            const supSnap       = await get(supervisorRef);
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
                state.userInfo.role   = 'followup_supervisor';
            }

            showAtharNotification("✅ تم الانضمام للمجموعة بنجاح!");
            setTimeout(() => { window.location.replace('/dashboard'); }, 800);
        } else {
            removeLoader();
            showAtharNotification("❌ كود المجموعة غير صحيح، تأكد من نسخه بدقة", "error");
            if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> تأكيد وبدء'; }
        }

    } catch (error) {
        removeLoader();
        console.error("Join group error:", error);
        showAtharNotification("خطأ في الانضمام: " + error.message, "error");
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> تأكيد وبدء'; }
    }
}

/* ─── الربط العالمي ─────────────────────────────────── */
window.app = {
    selectChoice:  (c) => selectChoice(c),
    goStep:        (n) => goStep(n),
    submitStep2:   () => submitStep2(),
    finalSubmit:   () => finalSubmit(),
    createGroup:   () => createGroupFlow(),
    joinGroup:     () => joinGroupFlow(),
    logout:        () => handleLogout()
};

/* ─── بدء التشغيل ───────────────────────────────────── */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSetup);
} else {
    initSetup();
}
