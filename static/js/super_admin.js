/**
 * منصة أثر — Super Admin Dashboard JS (Phase 5)
 * Blank-Slate Safe: كل قراءة من Firebase تعالج null بأمان
 */

import { auth, db, ref, get, set, update, push, onValue } from "./firebase-config.js";
import { signOut } from "./firebase-config.js";
import { initSuperAdminRoute } from "./router.js";

/* ══════════════════════════════════════════════════════════
   🛠️ Helpers
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

function timeSince(ts) {
    if (!ts) return '';
    const m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1)    return 'الآن';
    if (m < 60)   return `منذ ${m} د`;
    if (m < 1440) return `منذ ${Math.floor(m / 60)} س`;
    return `منذ ${Math.floor(m / 1440)} يوم`;
}

/* ══════════════════════════════════════════════════════════
   🔐 Auth Guard — يُشغَّل فور تحميل الملف (top-level await)
══════════════════════════════════════════════════════════ */

let _currentUser = null;

try {
    const { user } = await initSuperAdminRoute();
    _currentUser = user;
} catch (e) {
    // initSuperAdminRoute handles the redirect, just stop execution
    throw e;
}

// إخفاء اللودر وإظهار الواجهة
document.getElementById('sa-loader').style.display = 'none';
document.getElementById('sa-header').style.display = 'flex';
document.getElementById('sa-main').style.display   = 'block';

/* ══════════════════════════════════════════════════════════
   ⚙️ System Status — Realtime Listener
   Blank-Slate Safe: snap.val() ?? 'paused'
══════════════════════════════════════════════════════════ */

function _updateStatusUI(status) {
    const btn = document.getElementById('system-toggle-btn');
    const lbl = document.getElementById('system-toggle-label');
    if (!btn || !lbl) return;
    const isActive = status === 'active';
    btn.className = `status-toggle-btn ${isActive ? 'active' : 'paused'}`;
    lbl.textContent = isActive ? 'النظام: نشط ✓' : 'النظام: موقوف ✕';
}

onValue(ref(db, 'global_settings/system_status'), (snap) => {
    _updateStatusUI(snap.val() ?? 'paused');
});

/* ══════════════════════════════════════════════════════════
   🔁 Toggle System Status
══════════════════════════════════════════════════════════ */

window.toggleSystemStatus = async function () {
    const btn = document.getElementById('system-toggle-btn');
    const currentStatus = btn?.classList.contains('active') ? 'active' : 'paused';
    const newStatus = currentStatus === 'active' ? 'paused' : 'active';

    const actionLabel = newStatus === 'active' ? 'تشغيل النظام' : 'إيقاف النظام';
    if (!confirm(`⚠️ هل تريد ${actionLabel}؟\n\nعند الإيقاف سيتم طرد جميع المشرفين النشطين فوراً وعرض شاشة الانتظار.`)) return;

    if (btn) btn.disabled = true;
    try {
        await update(ref(db, 'global_settings'), {
            system_status: newStatus,
            last_status_change: Date.now(),
            last_status_changed_by: _currentUser?.email || 'super_admin'
        });
        _updateStatusUI(newStatus);
        toast(`✓ تم ${newStatus === 'active' ? 'تشغيل' : 'إيقاف'} النظام بنجاح`);
    } catch (e) {
        toast('حدث خطأ أثناء تغيير حالة النظام', 'error');
        console.error('[Toggle]', e);
    } finally {
        if (btn) btn.disabled = false;
    }
};

/* ══════════════════════════════════════════════════════════
   📊 System Analytics
   Blank-Slate Safe: all values fallback to 0
══════════════════════════════════════════════════════════ */

async function loadAnalytics() {
    try {
        const snap = await get(ref(db, 'system_analytics'));
        const data  = snap.val() ?? {};
        const calls = data.gemini_calls ?? {};

        document.getElementById('m-gemini-total').textContent = (calls.total               ?? 0).toLocaleString('ar');
        document.getElementById('m-gemini-msg').textContent   = (calls.messaging           ?? 0).toLocaleString('ar');
        document.getElementById('m-gemini-clean').textContent = (calls.cleaner             ?? 0).toLocaleString('ar');
        document.getElementById('m-gemini-err').textContent   = (calls.errors              ?? 0).toLocaleString('ar');
        document.getElementById('m-certs').textContent        = (data.certificates_exported ?? 0).toLocaleString('ar');
        document.getElementById('m-offline').textContent      = (data.offline_ops_count    ?? 0).toLocaleString('ar');
    } catch (e) {
        console.warn('[Analytics]', e?.message);
        // Blank-Slate: remain at 0, no crash
    }
}

loadAnalytics();

/* ══════════════════════════════════════════════════════════
   📬 Demo Requests
   Blank-Slate Safe: snap.val() ?? {} → empty list
══════════════════════════════════════════════════════════ */

window.loadDemoRequests = async function () {
    const list  = document.getElementById('demo-requests-list');
    const badge = document.getElementById('demo-count-badge');
    if (!list) return;

    list.innerHTML = '<div class="sa-empty"><div class="spinner" style="width:24px;height:24px;border-width:2px;margin:0 auto;"></div></div>';

    try {
        const snap  = await get(ref(db, 'demo_requests'));
        const data  = snap.val() ?? {};
        const items = Object.entries(data).sort((a, b) => (b[1].requestedAt || 0) - (a[1].requestedAt || 0));

        if (badge) badge.textContent = items.length ? `${items.length}` : '';

        if (items.length === 0) {
            list.innerHTML = '<div class="sa-empty"><i class="fa-solid fa-inbox"></i><p>لا توجد طلبات بعد</p></div>';
            return;
        }

        list.innerHTML = items.map(([key, d]) => `
            <div class="demo-item" id="demo-${key}">
                <div class="demo-avatar">${(d.name || '؟')[0]}</div>
                <div class="demo-info">
                    <div class="demo-name">${d.name || '—'}</div>
                    <div class="demo-phone">${d.phone || '—'}</div>
                    ${d.group ? `<div class="demo-group"><i class="fa-solid fa-users" style="font-size:0.65rem;"></i> ${d.group}</div>` : ''}
                    <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                        <span class="demo-status-badge ${d.status || 'pending'}">
                            ${d.status === 'approved' ? '✓ مقبول' : d.status === 'rejected' ? '✕ مرفوض' : '⏳ قيد المراجعة'}
                        </span>
                        ${d.status !== 'approved' ? `<button onclick="window.approveDemoRequest('${key}')" style="font-size:0.7rem;padding:2px 8px;border-radius:12px;border:1px solid rgba(74,222,128,0.3);background:rgba(74,222,128,0.08);color:#4ade80;cursor:pointer;font-family:inherit;">قبول</button>` : ''}
                        ${d.status !== 'rejected' ? `<button onclick="window.rejectDemoRequest('${key}')" style="font-size:0.7rem;padding:2px 8px;border-radius:12px;border:1px solid rgba(231,76,60,0.3);background:rgba(231,76,60,0.08);color:#f87171;cursor:pointer;font-family:inherit;">رفض</button>` : ''}
                    </div>
                </div>
                <div class="demo-time">${timeSince(d.requestedAt)}</div>
            </div>
        `).join('');
    } catch (e) {
        list.innerHTML = '<div class="sa-empty"><i class="fa-solid fa-triangle-exclamation"></i><p>خطأ في التحميل</p></div>';
        console.error('[DemoRequests]', e);
    }
};

window.approveDemoRequest = async function (key) {
    try {
        await update(ref(db, `demo_requests/${key}`), { status: 'approved' });
        toast('✓ تم قبول الطلب');
        window.loadDemoRequests();
    } catch (e) { toast('خطأ في التحديث', 'error'); }
};

window.rejectDemoRequest = async function (key) {
    try {
        await update(ref(db, `demo_requests/${key}`), { status: 'rejected' });
        toast('تم رفض الطلب');
        window.loadDemoRequests();
    } catch (e) { toast('خطأ في التحديث', 'error'); }
};

window.loadDemoRequests();

/* ══════════════════════════════════════════════════════════
   📅 Epochs Manager
   Blank-Slate Safe: creates /epochs from scratch if empty
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

        // تسجيل الـ epoch الحالية في global_settings
        await update(ref(db, 'global_settings'), { current_epoch: epochRef.key });

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
            list.innerHTML = '<div class="sa-empty"><i class="fa-solid fa-calendar-xmark"></i><p>لا توجد دورات بعد</p></div>';
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
        console.error('[Epochs]', e);
    }
}

_loadEpochs();

/* ══════════════════════════════════════════════════════════
   🏷️ Withdrawal Reasons
   Blank-Slate Safe: snap.val() ?? {}
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
        console.error('[Reasons]', e);
    }
}

_loadWithdrawalReasons();

/* ══════════════════════════════════════════════════════════
   🚪 Logout
══════════════════════════════════════════════════════════ */

window.saLogout = async function () {
    try {
        await signOut(auth);
        window.location.replace('/');
    } catch (e) {
        toast('خطأ في تسجيل الخروج', 'error');
    }
};
