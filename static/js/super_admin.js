/**
 * منصة أثر — لوحة إحصائيات النظام ومقاييس الأداء (Super Admin)
 * لمتابعة استهلاك Gemini، الرسائل الذكية، الشهادات، الأوفلاين، والدورات
 */

import {
    auth, db, ref, get, set, push, onValue,
    signInWithEmailAndPassword, signInWithPopup, googleProvider, signOut
} from "./firebase-config.js";
import { initSuperAdminRoute } from "./router.js";

/* ══════════════════════════════════════════════════════════
   🛠️ Helpers & Notifications
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

/* ══════════════════════════════════════════════════════════
   🔐 التحقق وتسجيل الدخول المباشر
══════════════════════════════════════════════════════════ */

async function checkAuthAndInit() {
    const loader = document.getElementById('sa-loader');
    const authView = document.getElementById('sa-auth-view');
    const header = document.getElementById('sa-header');
    const main = document.getElementById('sa-main');

    try {
        const { user } = await initSuperAdminRoute();

        if (user) {
            if (loader) loader.style.display = 'none';
            if (authView) authView.style.display = 'none';
            if (header) header.style.display = 'flex';
            if (main) main.style.display = 'block';

            loadDashboardData();
        } else {
            if (loader) loader.style.display = 'none';
            if (header) header.style.display = 'none';
            if (main) main.style.display = 'none';
            if (authView) authView.style.display = 'flex';
        }
    } catch (err) {
        console.error('[Admin Auth]', err);
        if (loader) loader.style.display = 'none';
        if (authView) authView.style.display = 'flex';
    }
}

// ── تسجيل الدخول بكلمة المرور ──
window.handleSaLogin = async function (e) {
    if (e && e.preventDefault) e.preventDefault();
    const email = document.getElementById('sa-input-email')?.value?.trim();
    const pass = document.getElementById('sa-input-password')?.value;
    const submitBtn = document.getElementById('sa-login-submit');
    const errorEl = document.getElementById('sa-auth-error');

    if (!email || !pass) return;
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التحقق...'; }
    if (errorEl) errorEl.style.display = 'none';

    try {
        await signInWithEmailAndPassword(auth, email, pass);
        toast('✓ تم تسجيل الدخول بنجاح');
        checkAuthAndInit();
    } catch (err) {
        if (errorEl) {
            errorEl.style.display = 'block';
            errorEl.textContent = 'خطأ في تسجيل الدخول: ' + (err.message || 'تأكد من صحة البريد وكلمة المرور');
        }
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> دخول لوحة الإحصائيات'; }
    }
};

// ── الدخول المباشر عبر Google ──
window.handleSaGoogleLogin = async function () {
    const errorEl = document.getElementById('sa-auth-error');
    if (errorEl) errorEl.style.display = 'none';

    try {
        await signInWithPopup(auth, googleProvider);
        toast('✓ تم الدخول عبر Google بنجاح');
        checkAuthAndInit();
    } catch (err) {
        if (errorEl) {
            errorEl.style.display = 'block';
            errorEl.textContent = 'خطأ في تسجيل الدخول عبر Google: ' + err.message;
        }
    }
};

/* ══════════════════════════════════════════════════════════
   📊 مقاييس النظام وإحصائيات الاستهلاك
══════════════════════════════════════════════════════════ */

async function loadAnalytics() {
    try {
        const snap = await get(ref(db, 'system_analytics'));
        const data  = snap.val() ?? {};
        const calls = data.gemini_calls ?? {};

        const mTotal = document.getElementById('m-gemini-total');
        const mMsg   = document.getElementById('m-gemini-msg');
        const mClean = document.getElementById('m-gemini-clean');
        const mErr   = document.getElementById('m-gemini-err');
        const mCerts = document.getElementById('m-certs');
        const mOff   = document.getElementById('m-offline');

        if (mTotal) mTotal.textContent = (calls.total               ?? 0).toLocaleString('ar');
        if (mMsg)   mMsg.textContent   = (calls.messaging           ?? 0).toLocaleString('ar');
        if (mClean) mClean.textContent = (calls.cleaner             ?? 0).toLocaleString('ar');
        if (mErr)   mErr.textContent   = (calls.errors              ?? 0).toLocaleString('ar');
        if (mCerts) mCerts.textContent = (data.certificates_exported ?? 0).toLocaleString('ar');
        if (mOff)   mOff.textContent   = (data.offline_ops_count    ?? 0).toLocaleString('ar');
    } catch (e) {
        console.warn('[Analytics]', e?.message);
    }
}

/* ══════════════════════════════════════════════════════════
   📅 إدارة الدورات (Epochs)
══════════════════════════════════════════════════════════ */

window.createEpoch = async function () {
    const name  = document.getElementById('epoch-name-input')?.value?.trim();
    const start = document.getElementById('epoch-start-input')?.value;
    const end   = document.getElementById('epoch-end-input')?.value;

    if (!name) { toast('يرجى إدخال اسم الدورة', 'error'); return; }

    const btn = document.getElementById('btn-create-epoch');
    if (btn) btn.disabled = true;

    try {
        const epochRef = push(ref(db, 'epochs'));
        await set(epochRef, {
            name,
            startDate: start || null,
            endDate:   end   || null,
            createdAt: Date.now(),
            status:    'active'
        });

        if (document.getElementById('epoch-name-input'))  document.getElementById('epoch-name-input').value  = '';
        if (document.getElementById('epoch-start-input')) document.getElementById('epoch-start-input').value = '';
        if (document.getElementById('epoch-end-input'))   document.getElementById('epoch-end-input').value   = '';

        toast(`✓ تم إنشاء دورة "${name}" بنجاح`);
        _loadEpochs();
    } catch (e) {
        toast('خطأ في إنشاء الدورة: ' + (e.message || ''), 'error');
        console.error('[Epoch]', e);
    } finally {
        if (btn) btn.disabled = false;
    }
};

async function _loadEpochs() {
    const list = document.getElementById('epochs-list');
    if (!list) return;

    try {
        const snap  = await get(ref(db, 'epochs'));
        const data  = snap.val() ?? {};
        const items = Object.entries(data).sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

        if (items.length === 0) {
            list.innerHTML = '<div class="sa-empty"><i class="fa-solid fa-calendar-xmark"></i><p>لا توجد دورات مسجلة بعد</p></div>';
            return;
        }

        list.innerHTML = items.map(([, e], i) => `
            <div class="epoch-item">
                <div>
                    <div class="epoch-name">${e.name || 'دورة بدون اسم'}</div>
                    <div class="epoch-dates">${fmtDate(e.startDate)} — ${fmtDate(e.endDate)}</div>
                </div>
                <span class="epoch-badge ${i === 0 ? 'current' : 'ended'}">${i === 0 ? '● الحالية' : 'منتهية'}</span>
            </div>
        `).join('');
    } catch (e) {
        list.innerHTML = '<div class="sa-empty"><p>خطأ في التحميل</p></div>';
    }
}

/* ══════════════════════════════════════════════════════════
   🏷️ بيانات ML — أسباب الانسحاب
══════════════════════════════════════════════════════════ */

async function _loadWithdrawalReasons() {
    const container = document.getElementById('withdrawal-reasons-list');
    const countEl   = document.getElementById('reasons-count');
    if (!container) return;

    try {
        const snap  = await get(ref(db, 'global_settings/withdrawal_reasons'));
        const data  = snap.val() ?? {};
        const items = Object.values(data).map(r => r.text || r).filter(Boolean);

        if (countEl) countEl.textContent = items.length ? `${items.length} سبب مسجل` : '';

        if (items.length === 0) {
            container.innerHTML = '<div class="sa-empty"><i class="fa-solid fa-database"></i><p>لا توجد أسباب مسجلة بعد</p></div>';
            return;
        }

        container.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:6px;padding:4px;">
            ${items.map(r => `<span class="reason-tag"><i class="fa-solid fa-tag" style="font-size:0.65rem;color:var(--sa-muted);"></i> ${r}</span>`).join('')}
        </div>`;
    } catch (e) {
        container.innerHTML = '<div class="sa-empty"><p>خطأ في التحميل</p></div>';
    }
}

/* ══════════════════════════════════════════════════════════
   🚀 تحميل كافة الإحصائيات
══════════════════════════════════════════════════════════ */

function loadDashboardData() {
    loadAnalytics();
    _loadEpochs();
    _loadWithdrawalReasons();
}

/* ══════════════════════════════════════════════════════════
   🚪 تسجيل الخروج
══════════════════════════════════════════════════════════ */

window.saLogout = async function () {
    try {
        await signOut(auth);
        window.location.replace('/');
    } catch (e) {
        toast('خطأ في تسجيل الخروج: ' + e.message, 'error');
    }
};

// تشغيل التحقق فوراً
checkAuthAndInit();
