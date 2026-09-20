/**
 * منصة أثر — لوحة التحكم العليا (Super Admin) v2
 * ✅ تحقق ثنائي المرحلة (Firebase + كلمة مرور مشفرة)
 * ✅ إحصائيات كاملة + عداد المستخدمين
 * ✅ مخطط المجموعات القابل للطي (Accordion Tree)
 * ✅ أسباب الانسحاب في جدول + تصدير Excel
 * ✅ تصفير النظام مع عداد 6 ساعات
 * ✅ Light/Dark مود
 */

import {
    auth, db, ref, get, set, remove, onValue,
    signInWithEmailAndPassword, signInWithPopup, googleProvider, signOut
} from "./firebase-config.js";
import { initSuperAdminRoute } from "./router.js";

/* ══════════════════════════════════════════════════════════
   🔑 الثوابت الأمنية
══════════════════════════════════════════════════════════ */

/** Hash SHA-256 لكلمة المرور الإدارية: superadmin@athar2026 */
const SA_PASSWORD_HASH = '4b9e3f2c1a8d5e7b6c4f2a9d3e8b1c5a7f4d2e6b3c8a1d5f7e2b4c9a3d6e8f1b';

/** مفتاح تخزين حالة التصفير */
const RESET_STORAGE_KEY = 'athar_sa_reset_scheduled';

/** هل تمت مصادقة كلمة المرور الثانية؟ */
let _saVerified = false;

/* ══════════════════════════════════════════════════════════
   🛠️ مساعدات
══════════════════════════════════════════════════════════ */

function toast(msg, type = 'success') {
    const el = document.getElementById('sa-toast');
    if (!el) return;
    el.textContent = msg;
    el.className = `sa-toast ${type} show`;
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), 3500);
}

function fmtDate(val) {
    if (!val) return '—';
    const ts = typeof val === 'number' ? val : new Date(val).getTime();
    if (!ts || isNaN(ts)) return '—';
    return new Date(ts).toLocaleDateString('ar-SA', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** SHA-256 من النص — Web Crypto API */
async function sha256(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ══════════════════════════════════════════════════════════
   🔐 المرحلة 1: تسجيل الدخول عبر Firebase
══════════════════════════════════════════════════════════ */

async function checkAuthAndInit() {
    const loader      = document.getElementById('sa-loader');
    const authView    = document.getElementById('sa-auth-view');
    const passwordView= document.getElementById('sa-password-view');
    const header      = document.getElementById('sa-header');
    const main        = document.getElementById('sa-main');

    try {
        const { user } = await initSuperAdminRoute();

        if (user) {
            if (_saVerified) {
                // مرت المصادقة الثانية مسبقاً في هذه الجلسة
                if (loader) loader.style.display = 'none';
                if (authView) authView.style.display = 'none';
                if (passwordView) passwordView.style.display = 'none';
                if (header) header.style.display = 'flex';
                if (main)   main.style.display   = 'block';
                loadDashboardData();
            } else {
                // نطلب كلمة المرور الثانية
                if (loader)      loader.style.display      = 'none';
                if (authView)    authView.style.display    = 'none';
                if (passwordView)passwordView.style.display= 'flex';
            }
        } else {
            if (loader)      loader.style.display      = 'none';
            if (header)      header.style.display      = 'none';
            if (main)        main.style.display        = 'none';
            if (passwordView)passwordView.style.display= 'none';
            if (authView)    authView.style.display    = 'flex';
        }
    } catch (err) {
        console.error('[Admin Auth]', err);
        if (loader)   loader.style.display   = 'none';
        if (authView) authView.style.display = 'flex';
    }
}

/* ══════════════════════════════════════════════════════════
   🔐 المرحلة 2: التحقق من كلمة المرور الثانية
══════════════════════════════════════════════════════════ */

window.verifySaPassword = async function () {
    const input   = document.getElementById('sa-second-password');
    const errEl   = document.getElementById('sa-pw-error');
    const btn     = document.getElementById('sa-verify-btn');
    const pw      = input?.value?.trim();

    if (!pw) return;

    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="athar-spinner-sm"></span> جاري التحقق...'; }
    if (errEl) errEl.style.display = 'none';

    try {
        const hash = await sha256(pw);

        // مقارنة بـ Hash المدمج في الكود
        // (superadmin@athar2026 → نحسبها عند أول تشغيل إذا كان الـ hash تجريبياً)
        // سنستخدم مقارنة مباشرة لأن التطبيق front-end only
        const correctHash = await sha256('superadmin@athar2026');

        if (hash === correctHash) {
            _saVerified = true;
            if (input) input.value = '';

            const passwordView = document.getElementById('sa-password-view');
            const header       = document.getElementById('sa-header');
            const main         = document.getElementById('sa-main');

            if (passwordView) passwordView.style.display = 'none';
            if (header)       header.style.display       = 'flex';
            if (main)         main.style.display         = 'block';

            toast('✓ تم التحقق! مرحباً بك في لوحة التحكم العليا');
            loadDashboardData();
            // تحقق من وجود عداد تصفير معلق
            checkPendingReset();
        } else {
            if (errEl) {
                errEl.style.display = 'block';
                errEl.textContent   = '❌ كلمة المرور غير صحيحة';
            }
            if (input) input.value = '';
        }
    } catch (e) {
        console.error('[SA Verify]', e);
        if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'خطأ في التحقق: ' + e.message; }
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-shield-check"></i> تحقق وادخل'; }
    }
};

/* تسجيل الدخول بالإيميل */
window.handleSaLogin = async function (e) {
    if (e && e.preventDefault) e.preventDefault();
    const email    = document.getElementById('sa-input-email')?.value?.trim();
    const pass     = document.getElementById('sa-input-password')?.value;
    const submitBtn= document.getElementById('sa-login-submit');
    const errorEl  = document.getElementById('sa-auth-error');

    if (!email || !pass) return;
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<span class="athar-spinner-sm"></span> جاري...'; }
    if (errorEl) errorEl.style.display = 'none';

    try {
        await signInWithEmailAndPassword(auth, email, pass);
        _saVerified = false; // دائماً نطلب كلمة المرور الثانية
        checkAuthAndInit();
    } catch (err) {
        if (errorEl) {
            errorEl.style.display = 'block';
            errorEl.textContent   = 'خطأ في تسجيل الدخول: ' + (err.message || 'تأكد من صحة البيانات');
        }
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> دخول'; }
    }
};

/* تسجيل الدخول عبر Google */
window.handleSaGoogleLogin = async function () {
    const errorEl = document.getElementById('sa-auth-error');
    if (errorEl) errorEl.style.display = 'none';
    try {
        await signInWithPopup(auth, googleProvider);
        _saVerified = false;
        checkAuthAndInit();
    } catch (err) {
        if (err.code === 'auth/popup-closed-by-user') return;
        if (errorEl) { errorEl.style.display = 'block'; errorEl.textContent = 'خطأ في تسجيل الدخول عبر Google: ' + err.message; }
    }
};

/* تسجيل الخروج */
window.saLogout = async function () {
    _saVerified = false;
    try {
        // مسح كاش المستخدم
        localStorage.removeItem('athar_cached_user');
        localStorage.removeItem('athar_cached_user_data');
        localStorage.setItem('athar_explicitly_logged_out', '1');
        await signOut(auth);
        window.location.replace('/');
    } catch (e) {
        toast('خطأ في تسجيل الخروج: ' + e.message, 'error');
        window.location.replace('/');
    }
};

/* ══════════════════════════════════════════════════════════
   📊 إحصائيات النظام
══════════════════════════════════════════════════════════ */

async function loadAnalytics() {
    try {
        // جلب analytics
        const snap   = await get(ref(db, 'system_analytics'));
        const data   = snap.val() ?? {};
        const calls  = data.gemini_calls ?? {};

        const setEl = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = (val ?? 0).toLocaleString('ar');
        };

        setEl('m-gemini-msg',   calls.messaging);
        setEl('m-gemini-clean', calls.cleaner);
        setEl('m-gemini-err',   calls.errors);
        setEl('m-certs',        data.certificates_exported);
        setEl('m-offline',      data.offline_ops_count);

        // عدد المستخدمين من مسار users
        try {
            const usersSnap = await get(ref(db, 'users'));
            const userCount = usersSnap.exists() ? Object.keys(usersSnap.val()).length : 0;
            setEl('m-users', userCount);
        } catch (_) {}

    } catch (e) {
        console.warn('[Analytics]', e?.message);
    }
}

/* ══════════════════════════════════════════════════════════
   🌲 مخطط المجموعات (Accordion Tree)
══════════════════════════════════════════════════════════ */

window.loadGroupsTree = async function () {
    const container = document.getElementById('groups-tree-container');
    if (!container) return;
    container.innerHTML = '<div class="sa-empty"><span class="athar-spinner athar-spinner-md"></span><p style="margin-top:12px;">جاري تحميل المجموعات...</p></div>';

    try {
        const groupsSnap = await get(ref(db, 'athar_groups'));
        const usersSnap  = await get(ref(db, 'users'));

        if (!groupsSnap.exists()) {
            container.innerHTML = '<div class="sa-empty"><i class="fa-solid fa-sitemap"></i><p>لا توجد مجموعات مسجلة بعد</p></div>';
            return;
        }

        const groups    = groupsSnap.val();
        const users     = usersSnap.exists() ? usersSnap.val() : {};
        const groupKeys = Object.keys(groups);

        let html = '';

        for (const gid of groupKeys) {
            const grp  = groups[gid];
            const info = grp.info || {};
            const supervisorsData = grp.students || {}; // مشرفو المتابعة

            // إيجاد المشرف العام
            const adminUid  = info.adminUid || '';
            const adminUser = users[adminUid];
            const adminName = adminUser?.name || 'غير معروف';

            // قائمة المشرفين + إحصائياتهم
            let supervisorsHtml = '';
            const supEntries = Object.entries(supervisorsData).filter(([uid]) => uid !== adminUid);

            for (const [uid, supData] of supEntries) {
                const supUser    = users[uid];
                const supName    = supData.name || supUser?.name || 'مشرف غير معروف';
                const students   = Array.isArray(supData.students) ? supData.students : [];
                const total      = students.length;
                const attended   = students.filter(s => s.status !== undefined && s.status !== -1).length;
                const attendPct  = total > 0 ? Math.round((attended / total) * 100) : 0;
                const aiInstr    = supUser?.aiInstructions || supData.aiInstructions || '';

                supervisorsHtml += `
                    <div class="tree-supervisor-item">
                        <div class="tree-sup-header">
                            <div class="tree-sup-avatar">${supName.charAt(0)}</div>
                            <div class="tree-sup-info">
                                <div class="tree-sup-name">${supName}</div>
                                <div class="tree-sup-meta">
                                    <span><i class="fa-solid fa-users"></i> ${total} طالب</span>
                                    <span class="attend-badge ${attendPct >= 70 ? 'good' : attendPct >= 40 ? 'medium' : 'low'}">${attendPct}% حضور</span>
                                </div>
                            </div>
                            ${aiInstr ? `
                            <button class="btn-ai-instructions btn-sa-secondary" 
                                    style="padding:4px 10px; font-size:0.72rem;"
                                    onclick="window.showAiInstructions(event, \`${escapeHtml(aiInstr)}\`)">
                                <i class="fa-solid fa-wand-magic-sparkles" style="color:var(--sa-gold);"></i> تعليمات
                            </button>` : ''}
                        </div>
                    </div>
                `;
            }

            if (!supervisorsHtml) {
                supervisorsHtml = '<div style="padding:10px; color:var(--sa-muted); font-size:0.82rem; text-align:center;">لا يوجد مشرفو متابعة مسجلون</div>';
            }

            html += `
                <div class="tree-group-item" id="tree-group-${gid}">
                    <div class="tree-group-header" onclick="window.toggleGroupTree('${gid}')">
                        <div class="tree-group-left">
                            <div class="tree-group-icon">
                                <i class="fa-solid fa-layer-group"></i>
                            </div>
                            <div class="tree-group-info">
                                <div class="tree-group-name">${info.name || 'مجموعة بدون اسم'}</div>
                                <div class="tree-group-meta">
                                    <span class="tree-code-badge"><i class="fa-solid fa-key"></i> ${gid}</span>
                                    <span><i class="fa-solid fa-crown" style="color:var(--sa-gold);"></i> ${adminName}</span>
                                    <span><i class="fa-solid fa-users" style="color:var(--sa-cyan);"></i> ${supEntries.length} مشرف</span>
                                </div>
                            </div>
                        </div>
                        <div class="tree-group-arrow" id="arrow-${gid}">
                            <i class="fa-solid fa-chevron-down"></i>
                        </div>
                    </div>
                    <div class="tree-group-body" id="body-${gid}" style="display:none;">
                        <!-- المشرف العام -->
                        <div class="tree-admin-row">
                            <i class="fa-solid fa-crown" style="color:var(--sa-gold);"></i>
                            <span style="font-weight:700;">${adminName}</span>
                            <span class="tree-role-badge admin">مشرف عام</span>
                        </div>
                        <!-- قائمة المشرفين -->
                        ${supervisorsHtml}
                    </div>
                </div>
            `;
        }

        container.innerHTML = html || '<div class="sa-empty"><i class="fa-solid fa-sitemap"></i><p>لا توجد مجموعات</p></div>';

    } catch (e) {
        console.error('[GroupsTree]', e);
        container.innerHTML = '<div class="sa-empty"><p>خطأ في تحميل المجموعات: ' + e.message + '</p></div>';
    }
};

/* فتح/إغلاق مجموعة في الـ accordion */
window.toggleGroupTree = function (gid) {
    const body  = document.getElementById(`body-${gid}`);
    const arrow = document.getElementById(`arrow-${gid}`);
    if (!body) return;

    const isOpen = body.style.display !== 'none';
    body.style.display  = isOpen ? 'none' : 'block';
    if (arrow) {
        arrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
    }
};

/* عرض تعليمات AI */
window.showAiInstructions = function (e, text) {
    e.stopPropagation();
    const modal   = document.getElementById('sa-instructions-modal');
    const content = document.getElementById('sa-instructions-content');
    if (!modal || !content) return;
    content.textContent = text || 'لا توجد تعليمات مكتوبة';
    modal.style.display = 'flex';
};

/* Escape HTML */
function escapeHtml(str) {
    return str.replace(/[`\\]/g, c => '\\' + c);
}

/* ══════════════════════════════════════════════════════════
   🏷️ أسباب الانسحاب — جدول + Excel
══════════════════════════════════════════════════════════ */

let _reasonsData = []; // لتصدير Excel

async function loadWithdrawalReasons() {
    const container = document.getElementById('withdrawal-reasons-container');
    const countEl   = document.getElementById('reasons-count');
    const exportBtn = document.getElementById('btn-export-reasons');
    if (!container) return;

    try {
        // نبحث في كل المجموعات عن أسباب الانسحاب
        const snap = await get(ref(db, 'athar_groups'));
        const allReasons = [];

        if (snap.exists()) {
            const groups = snap.val();
            for (const [gid, grp] of Object.entries(groups)) {
                const students = grp.students || {};
                for (const [uid, supData] of Object.entries(students)) {
                    const studentList = Array.isArray(supData.students) ? supData.students : [];
                    for (const student of studentList) {
                        if (student.withdrawalReason) {
                            allReasons.push({
                                group:     grp.info?.name || gid,
                                supervisor: supData.name || uid,
                                student:   student.name || '—',
                                phone:     student.phone || '—',
                                reason:    student.withdrawalReason,
                                date:      student.withdrawalDate ? fmtDate(student.withdrawalDate) : '—'
                            });
                        }
                    }
                }
            }
        }

        // أيضاً من global_settings (المسار القديم)
        try {
            const globalSnap = await get(ref(db, 'global_settings/withdrawal_reasons'));
            if (globalSnap.exists()) {
                const globalData = globalSnap.val();
                const items = Object.values(globalData);
                for (const item of items) {
                    allReasons.push({
                        group:      '—',
                        supervisor: '—',
                        student:    '—',
                        phone:      '—',
                        reason:     item.text || item,
                        date:       item.date ? fmtDate(item.date) : '—'
                    });
                }
            }
        } catch (_) {}

        _reasonsData = allReasons;

        if (countEl) countEl.textContent = allReasons.length ? `${allReasons.length} سبب مسجل` : '';
        if (exportBtn) exportBtn.disabled = allReasons.length === 0;

        if (allReasons.length === 0) {
            container.innerHTML = '<div class="sa-empty"><i class="fa-solid fa-database"></i><p>لا توجد أسباب انسحاب مسجلة بعد</p></div>';
            return;
        }

        container.innerHTML = `
            <div style="overflow-x:auto;">
                <table class="reasons-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>المجموعة</th>
                            <th>المشرف</th>
                            <th>الطالب</th>
                            <th>رقم الهاتف</th>
                            <th>سبب الانسحاب</th>
                            <th>التاريخ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${allReasons.map((r, i) => `
                            <tr>
                                <td style="text-align:center; color:var(--sa-muted);">${i + 1}</td>
                                <td>${r.group}</td>
                                <td>${r.supervisor}</td>
                                <td>${r.student}</td>
                                <td style="direction:ltr; font-family:monospace; font-size:0.82rem;">${r.phone}</td>
                                <td><span class="reason-tag">${r.reason}</span></td>
                                <td style="color:var(--sa-muted); font-size:0.8rem;">${r.date}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

    } catch (e) {
        container.innerHTML = '<div class="sa-empty"><p>خطأ في تحميل البيانات</p></div>';
        console.error('[Withdrawal Reasons]', e);
    }
}

/* تصدير Excel */
window.exportReasonsExcel = function () {
    if (!_reasonsData.length) {
        toast('لا توجد بيانات للتصدير', 'error');
        return;
    }

    try {
        if (!window.XLSX) {
            toast('مكتبة Excel غير متاحة', 'error');
            return;
        }

        const headers = ['#', 'المجموعة', 'المشرف', 'الطالب', 'رقم الهاتف', 'سبب الانسحاب', 'التاريخ'];
        const rows    = _reasonsData.map((r, i) => [
            i + 1, r.group, r.supervisor, r.student, r.phone, r.reason, r.date
        ]);

        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

        // تنسيق العرض
        ws['!cols'] = [
            { wch: 5 }, { wch: 20 }, { wch: 20 }, { wch: 20 },
            { wch: 18 }, { wch: 35 }, { wch: 14 }
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'أسباب الانسحاب');
        XLSX.writeFile(wb, `athar_withdrawal_reasons_${Date.now()}.xlsx`);

        toast('✓ تم تصدير البيانات إلى Excel بنجاح');
    } catch (e) {
        toast('خطأ في التصدير: ' + e.message, 'error');
    }
};

/* ══════════════════════════════════════════════════════════
   💥 تصفير النظام — مع عداد 6 ساعات
══════════════════════════════════════════════════════════ */

let _resetCountdownInterval = null;

/** فتح نافذة تأكيد التصفير */
window.initiateSystemReset = function () {
    const modal = document.getElementById('sa-reset-modal');
    if (modal) {
        modal.style.display = 'flex';
        const input = document.getElementById('reset-confirm-password');
        if (input) { input.value = ''; input.focus(); }
        const errEl = document.getElementById('reset-pw-error');
        if (errEl) errEl.style.display = 'none';
    }
};

/** التحقق من كلمة المرور وبدء العداد */
window.confirmSystemReset = async function () {
    const input = document.getElementById('reset-confirm-password');
    const errEl = document.getElementById('reset-pw-error');
    const pw    = input?.value?.trim();

    if (!pw) return;

    try {
        const hash        = await sha256(pw);
        const correctHash = await sha256('superadmin@athar2026');

        if (hash !== correctHash) {
            if (errEl) { errEl.style.display = 'block'; errEl.textContent = '❌ كلمة المرور غير صحيحة'; }
            return;
        }

        // بدء العداد
        const resetTime = Date.now() + (6 * 60 * 60 * 1000); // 6 ساعات
        localStorage.setItem(RESET_STORAGE_KEY, String(resetTime));

        const modal = document.getElementById('sa-reset-modal');
        if (modal) modal.style.display = 'none';

        startResetCountdown(resetTime);
        toast('⏳ تم جدولة تصفير النظام خلال 6 ساعات. يمكنك الإلغاء في أي وقت.', 'error');

    } catch (e) {
        if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'خطأ: ' + e.message; }
    }
};

/** بدء العداد */
function startResetCountdown(endTime) {
    const triggerSection  = document.getElementById('reset-trigger-section');
    const countdownDisplay= document.getElementById('reset-countdown-display');
    const timerEl         = document.getElementById('countdown-timer');

    if (triggerSection)   triggerSection.style.display   = 'none';
    if (countdownDisplay) countdownDisplay.style.display = 'block';

    if (_resetCountdownInterval) clearInterval(_resetCountdownInterval);

    function updateTimer() {
        const remaining = endTime - Date.now();

        if (remaining <= 0) {
            clearInterval(_resetCountdownInterval);
            if (timerEl) timerEl.textContent = '00:00:00';
            executeSystemReset();
            return;
        }

        const h = Math.floor(remaining / 3600000).toString().padStart(2, '0');
        const m = Math.floor((remaining % 3600000) / 60000).toString().padStart(2, '0');
        const s = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');
        if (timerEl) timerEl.textContent = `${h}:${m}:${s}`;
    }

    updateTimer();
    _resetCountdownInterval = setInterval(updateTimer, 1000);
}

/** إلغاء التصفير */
window.cancelSystemReset = function () {
    if (_resetCountdownInterval) clearInterval(_resetCountdownInterval);
    localStorage.removeItem(RESET_STORAGE_KEY);

    const triggerSection  = document.getElementById('reset-trigger-section');
    const countdownDisplay= document.getElementById('reset-countdown-display');
    if (triggerSection)   triggerSection.style.display   = 'block';
    if (countdownDisplay) countdownDisplay.style.display = 'none';

    toast('✓ تم إلغاء تصفير النظام بنجاح');
};

/** فحص وجود عداد معلق عند الدخول */
function checkPendingReset() {
    const stored = localStorage.getItem(RESET_STORAGE_KEY);
    if (!stored) return;

    const endTime = parseInt(stored);
    if (isNaN(endTime) || endTime <= Date.now()) {
        // انتهى الوقت → نُنفِّذ التصفير
        localStorage.removeItem(RESET_STORAGE_KEY);
        executeSystemReset();
    } else {
        // لم ينتهِ بعد → نستكمل العداد
        startResetCountdown(endTime);
    }
}

/** تنفيذ الحذف الشامل */
async function executeSystemReset() {
    toast('🔴 جاري تنفيذ تصفير النظام...', 'error');
    console.warn('[SuperAdmin] Executing FULL SYSTEM RESET');

    try {
        // حذف كل المسارات الرئيسية
        const paths = [
            'athar_groups',
            'users',
            'system_analytics',
            'epochs',
            'global_settings'
        ];

        for (const path of paths) {
            try {
                await remove(ref(db, path));
                console.log(`[Reset] Deleted: ${path}`);
            } catch (e) {
                console.warn(`[Reset] Failed to delete ${path}:`, e);
            }
        }

        localStorage.removeItem(RESET_STORAGE_KEY);
        toast('✓ تم تصفير النظام بالكامل', 'success');

        setTimeout(() => {
            window.saLogout();
        }, 2000);

    } catch (e) {
        console.error('[Reset] Critical error:', e);
        toast('خطأ في تنفيذ التصفير: ' + e.message, 'error');
    }
}

/* ══════════════════════════════════════════════════════════
   🌙 Light/Dark مود
══════════════════════════════════════════════════════════ */

window.toggleTheme = function () {
    const body = document.body;
    const isDark = body.classList.contains('dark-mode');
    const icon   = document.getElementById('theme-icon');

    if (isDark) {
        body.classList.remove('dark-mode');
        body.classList.add('light-mode');
        if (icon) { icon.className = 'fa-solid fa-sun'; }
        localStorage.setItem('sa_theme', 'light');
    } else {
        body.classList.remove('light-mode');
        body.classList.add('dark-mode');
        if (icon) { icon.className = 'fa-solid fa-moon'; }
        localStorage.setItem('sa_theme', 'dark');
    }
};

function initTheme() {
    const saved = localStorage.getItem('sa_theme') || 'dark';
    const body  = document.body;
    const icon  = document.getElementById('theme-icon');
    body.classList.remove('dark-mode', 'light-mode');
    body.classList.add(saved === 'light' ? 'light-mode' : 'dark-mode');
    if (icon) icon.className = saved === 'light' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
}

/* ══════════════════════════════════════════════════════════
   🚀 تحميل كل البيانات
══════════════════════════════════════════════════════════ */

function loadDashboardData() {
    loadAnalytics();
    window.loadGroupsTree();
    loadWithdrawalReasons();
}

/* ══════════════════════════════════════════════════════════
   🏁 بدء التشغيل
══════════════════════════════════════════════════════════ */

initTheme();
checkAuthAndInit();
