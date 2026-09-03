/**
 * منصة أثر — Super Admin Dashboard JS (SaaS & ML Pipeline & User Management)
 * Blank-Slate Safe: كل قراءة من Firebase تعالج null بأمان
 * Anti-Loop Protection: يدعم تسجيل الدخول المباشر بدون أي حلقات إعادة توجيه
 */

import {
    auth, db, ref, get, set, update, push, remove, onValue,
    signInWithEmailAndPassword, signInWithPopup, googleProvider, signOut
} from "./firebase-config.js";
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

function formatRemainingTime(expiresAt) {
    if (!expiresAt) return '<span class="badge-time" style="color:#4ade80;background:rgba(74,222,128,0.1);border-color:rgba(74,222,128,0.25);">♾️ غير محدود (دائم)</span>';
    const diff = expiresAt - Date.now();
    if (diff <= 0) {
        return '<span class="badge-time" style="color:#f87171;background:rgba(239,68,68,0.1);border-color:rgba(239,68,68,0.25);">⌛ انتهت الصلاحية</span>';
    }
    const totalMinutes = Math.floor(diff / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const days = Math.floor(hours / 24);

    if (days > 0) {
        const remainingHours = hours % 24;
        return `<span class="badge-time">متبقي ${days} يوم و ${remainingHours} س</span>`;
    }
    return `<span class="badge-time">متبقي ${hours} س و ${minutes} د</span>`;
}

/* ══════════════════════════════════════════════════════════
   🔐 Auth Verification & In-Page Login (No Loops)
══════════════════════════════════════════════════════════ */

let _currentUser = null;

async function checkAuthAndInit() {
    const loader = document.getElementById('sa-loader');
    const authView = document.getElementById('sa-auth-view');
    const header = document.getElementById('sa-header');
    const main = document.getElementById('sa-main');
    const errorEl = document.getElementById('sa-auth-error');

    try {
        const authStatus = await initSuperAdminRoute();

        if (authStatus.isSuperAdmin) {
            _currentUser = authStatus.user;
            if (loader) loader.style.display = 'none';
            if (authView) authView.style.display = 'none';
            if (header) header.style.display = 'flex';
            if (main) main.style.display = 'block';

            // تشغيل كافة الخدمات
            initLiveSystemListeners();
            loadDashboardData();
        } else {
            // غير مسجل أو مسجل بحساب آخر -> إظهار كارت الدخول المباشر
            if (loader) loader.style.display = 'none';
            if (header) header.style.display = 'none';
            if (main) main.style.display = 'none';
            if (authView) authView.style.display = 'flex';

            if (authStatus.user && !authStatus.isSuperAdmin && errorEl) {
                errorEl.style.display = 'block';
                errorEl.innerHTML = `⚠️ أنت مسجل حالياً بحساب: <b>${authStatus.user.email}</b> وهو ليس حساب الإدارة العليا.<br/><button onclick="window.saLogout()" style="margin-top:6px;background:#7f1d1d;color:white;border:none;padding:4px 10px;border-radius:6px;cursor:pointer;">تسجيل الخروج والدخول بحساب الإدارة</button>`;
            }
        }
    } catch (err) {
        console.error('[SuperAdmin Auth]', err);
        if (loader) loader.style.display = 'none';
        if (authView) authView.style.display = 'flex';
    }
}

// ── الدخول المباشر بكلمة المرور ──
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
        const cred = await signInWithEmailAndPassword(auth, email, pass);
        if ((cred.user.email || '').toLowerCase() === 'hrhalsharif@gmail.com') {
            toast('✓ مرحباً بك يا مدير المنظومة!');
            checkAuthAndInit();
        } else {
            if (errorEl) {
                errorEl.style.display = 'block';
                errorEl.textContent = '⛔ هذا الحساب ليس حساب Super Admin المصرح له (hrhalsharif@gmail.com).';
            }
        }
    } catch (err) {
        if (errorEl) {
            errorEl.style.display = 'block';
            errorEl.textContent = 'خطأ في تسجيل الدخول: ' + (err.message || 'تأكد من صحة البريد وكلمة المرور');
        }
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> دخول لوحة الإدارة العليا'; }
    }
};

// ── الدخول المباشر بحساب Google ──
window.handleSaGoogleLogin = async function () {
    const errorEl = document.getElementById('sa-auth-error');
    if (errorEl) errorEl.style.display = 'none';

    try {
        const res = await signInWithPopup(auth, googleProvider);
        if ((res.user.email || '').toLowerCase() === 'hrhalsharif@gmail.com') {
            toast('✓ تم الدخول بحساب Google بنجاح!');
            checkAuthAndInit();
        } else {
            if (errorEl) {
                errorEl.style.display = 'block';
                errorEl.textContent = '⛔ حساب Google هذا (' + res.user.email + ') ليس حساب Super Admin المصرح له.';
            }
        }
    } catch (err) {
        if (errorEl) {
            errorEl.style.display = 'block';
            errorEl.textContent = 'خطأ في تسجيل الدخول عبر Google: ' + err.message;
        }
    }
};

/* ══════════════════════════════════════════════════════════
   ⚙️ System Status — Live Listener & Toggle
══════════════════════════════════════════════════════════ */

function initLiveSystemListeners() {
    onValue(ref(db, 'global_settings/system_status'), (snap) => {
        const status = snap.val() ?? 'paused';
        const btn = document.getElementById('system-toggle-btn');
        const lbl = document.getElementById('system-toggle-label');
        if (!btn || !lbl) return;
        const isActive = status === 'active';
        btn.className = `status-toggle-btn ${isActive ? 'active' : 'paused'}`;
        lbl.textContent = isActive ? 'النظام: نشط ✓' : 'النظام: موقوف ✕';
    });
}

window.toggleSystemStatus = async function () {
    const btn = document.getElementById('system-toggle-btn');
    const currentStatus = btn?.classList.contains('active') ? 'active' : 'paused';
    const newStatus = currentStatus === 'active' ? 'paused' : 'active';

    const actionLabel = newStatus === 'active' ? 'تشغيل النظام' : 'إيقاف النظام';
    if (!confirm(`⚠️ هل تريد ${actionLabel}؟\n\nعند الإيقاف سيتم إخراج جميع المشرفين مؤقتاً وعرض شاشة الاستراحة.`)) return;

    if (btn) btn.disabled = true;
    try {
        await update(ref(db, 'global_settings'), {
            system_status: newStatus,
            last_status_change: Date.now(),
            last_status_changed_by: _currentUser?.email || 'hrhalsharif@gmail.com'
        });
        toast(`✓ تم ${newStatus === 'active' ? 'تشغيل' : 'إيقاف'} النظام بنجاح`);
    } catch (e) {
        toast('حدث خطأ أثناء تغيير حالة النظام: ' + e.message, 'error');
        console.error('[Toggle]', e);
    } finally {
        if (btn) btn.disabled = false;
    }
};

/* ══════════════════════════════════════════════════════════
   👥 Users Management & Demo Permissions
══════════════════════════════════════════════════════════ */

let _allUsersCache = [];
let _currentFilter = 'all';

window.loadUsersList = async function () {
    const container = document.getElementById('users-management-list');
    const badge = document.getElementById('users-count-badge');
    if (!container) return;

    container.innerHTML = '<div class="sa-empty"><div class="spinner" style="width:24px;height:24px;border-width:2px;margin:0 auto;"></div><p style="margin-top:8px;">جاري تحميل قائمة المستخدمين...</p></div>';

    try {
        const snap = await get(ref(db, 'users'));
        const data = snap.val() ?? {};

        _allUsersCache = Object.entries(data).map(([uid, u]) => ({
            uid,
            ...u
        })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        if (badge) badge.textContent = _allUsersCache.length;

        window.renderUsersList();
    } catch (err) {
        console.error('[Users Management]', err);
        container.innerHTML = `<div class="sa-empty"><i class="fa-solid fa-triangle-exclamation"></i><p>خطأ في جلب المستخدمين: ${err.message}</p></div>`;
    }
};

window.filterUsers = function (val) {
    _currentFilter = val;
    window.renderUsersList();
};

window.renderUsersList = function () {
    const container = document.getElementById('users-management-list');
    if (!container) return;

    let list = [..._allUsersCache];

    if (_currentFilter === 'pending') {
        list = list.filter(u => u.status === 'pending');
    } else if (_currentFilter === 'active') {
        list = list.filter(u => u.status === 'active');
    } else if (_currentFilter === 'suspended') {
        list = list.filter(u => u.status === 'suspended');
    }

    if (list.length === 0) {
        container.innerHTML = '<div class="sa-empty"><i class="fa-solid fa-users-slash"></i><p>لا يوجد مستخدمون في هذه الفئة</p></div>';
        return;
    }

    container.innerHTML = list.map(u => {
        const isPending = u.status === 'pending';
        const isSuspended = u.status === 'suspended';
        const isExpired = u.status === 'active' && u.accessExpiresAt && Date.now() > u.accessExpiresAt;
        const isActive = u.status === 'active' && !isExpired;

        let statusClass = 'pending';
        let statusText = '⏳ قيد المراجعة';
        if (isSuspended) { statusClass = 'suspended'; statusText = '🔴 موقوف'; }
        else if (isExpired) { statusClass = 'expired'; statusText = '⌛ منتهي'; }
        else if (isActive) { statusClass = 'active'; statusText = '🟢 مفعّل نشط'; }

        const initial = (u.name || u.email || '؟')[0].toUpperCase();

        return `
            <div class="user-item" id="user-row-${u.uid}">
                <div class="user-avatar">${initial}</div>
                
                <div class="user-details">
                    <div class="user-title-row">
                        <span class="user-name">${u.name || 'بدون اسم'}</span>
                        <span class="badge-status ${statusClass}">${statusText}</span>
                        ${isActive ? formatRemainingTime(u.accessExpiresAt) : ''}
                        ${u.role === 'group_supervisor' ? '<span style="font-size:0.68rem;background:rgba(212,175,55,0.15);color:var(--sa-gold);padding:2px 6px;border-radius:4px;">مشرف عام</span>' : ''}
                    </div>

                    <div class="user-meta-row">
                        <span><i class="fa-solid fa-envelope"></i> ${u.email || '—'}</span>
                        ${u.phone ? `<span><i class="fa-brands fa-whatsapp"></i> <span dir="ltr">${u.phone}</span></span>` : ''}
                        ${u.groupTarget ? `<span><i class="fa-solid fa-users"></i> ${u.groupTarget}</span>` : ''}
                        <span><i class="fa-solid fa-clock"></i> ${timeSince(u.createdAt)}</span>
                    </div>
                </div>

                <div class="user-actions-row">
                    <!-- تفعيل مع تحديد الساعات -->
                    <button class="btn-activate-duration" onclick="window.activateUserPrompt('${u.uid}', '${(u.name || '').replace(/'/g, "\\'")}')" title="تفعيل وصلاحية">
                        <i class="fa-solid fa-bolt"></i> تفعيل
                    </button>

                    ${!isSuspended ? `
                        <button class="btn-suspend-user" onclick="window.suspendUser('${u.uid}')" title="تعطيل الحساب">
                            <i class="fa-solid fa-ban"></i> قفل
                        </button>
                    ` : ''}

                    <button class="btn-delete-user" onclick="window.deleteUserRecord('${u.uid}')" title="حذف السجل">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
};

// ── تفعيل المستخدم مع اختيار المدة بالساعات ──
window.activateUserPrompt = async function (uid, userName) {
    const choice = prompt(
        `⚡ تفعيل حساب: ${userName || uid}\n\nأدخل عدد ساعات التفعيل المطلوبة:\n- اكتب 24 (لتفعيل يوم كامل)\n- اكتب 48 (لتفعيل يومين)\n- اكتب 168 (لتفعيل أسبوع كامل)\n- اكتب 720 (لتفعيل شهر كامل)\n- اكتب 0 (لتفعيل دائم ومفتوح بدون انتهاء)`,
        '24'
    );

    if (choice === null) return; // تم الإلغاء

    const hours = parseInt(choice);
    if (isNaN(hours) || hours < 0) {
        alert('يرجى إدخال رقم ساعات صحيح.');
        return;
    }

    try {
        const expiresAt = hours === 0 ? null : (Date.now() + (hours * 3600 * 1000));
        await update(ref(db, `users/${uid}`), {
            status: 'active',
            activatedAt: Date.now(),
            accessExpiresAt: expiresAt,
            accessHoursGranted: hours === 0 ? 'permanent' : hours,
            activatedBy: _currentUser?.email || 'hrhalsharif@gmail.com'
        });

        toast(`✓ تم تفعيل حساب ${userName || ''} بنجاح (${hours === 0 ? 'صلاحية دائمة' : hours + ' ساعة'})`);
        window.loadUsersList();
    } catch (err) {
        toast('خطأ في التفعيل: ' + err.message, 'error');
    }
};

// ── إيقاف حساب المستخدم ──
window.suspendUser = async function (uid) {
    if (!confirm('⚠️ هل أنت متأكد من قفل وتعطيل هذا الحساب؟ لن يتمكن من الوصول للمنصة.')) return;

    try {
        await update(ref(db, `users/${uid}`), {
            status: 'suspended',
            suspendedAt: Date.now(),
            suspendedBy: _currentUser?.email || 'hrhalsharif@gmail.com'
        });
        toast('✓ تم إيقاف الحساب');
        window.loadUsersList();
    } catch (err) {
        toast('خطأ في الإيقاف: ' + err.message, 'error');
    }
};

// ── حذف سجل المستخدم ──
window.deleteUserRecord = async function (uid) {
    if (!confirm('🗑️ هل أنت متأكد من حذف هذا المستخدم نهائياً؟')) return;

    try {
        await remove(ref(db, `users/${uid}`));
        toast('تم حذف المستخدم');
        window.loadUsersList();
    } catch (err) {
        toast('خطأ في الحذف: ' + err.message, 'error');
    }
};

/* ══════════════════════════════════════════════════════════
   📊 System Analytics
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
    }
}

/* ══════════════════════════════════════════════════════════
   📬 Demo Requests Panel
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
                    <div class="demo-phone">${d.phone || d.email || '—'}</div>
                    ${d.group ? `<div class="demo-group"><i class="fa-solid fa-users" style="font-size:0.65rem;"></i> ${d.group}</div>` : ''}
                    <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                        <span class="demo-status-badge ${d.status || 'pending'}">
                            ${d.status === 'approved' ? '✓ مقبول' : d.status === 'rejected' ? '✕ مرفوض' : '⏳ قيد المراجعة'}
                        </span>
                        ${d.status !== 'approved' ? `<button onclick="window.approveDemoRequest('${key}', '${d.uid || ''}')" style="font-size:0.7rem;padding:2px 8px;border-radius:12px;border:1px solid rgba(74,222,128,0.3);background:rgba(74,222,128,0.08);color:#4ade80;cursor:pointer;font-family:inherit;">قبول وتفعيل</button>` : ''}
                        ${d.status !== 'rejected' ? `<button onclick="window.rejectDemoRequest('${key}', '${d.uid || ''}')" style="font-size:0.7rem;padding:2px 8px;border-radius:12px;border:1px solid rgba(231,76,60,0.3);background:rgba(231,76,60,0.08);color:#f87171;cursor:pointer;font-family:inherit;">رفض</button>` : ''}
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

window.approveDemoRequest = async function (key, uid) {
    try {
        await update(ref(db, `demo_requests/${key}`), { status: 'approved' });
        if (uid) {
            // تفعيل 48 ساعة افتراضياً عند القبول
            await update(ref(db, `users/${uid}`), {
                status: 'active',
                activatedAt: Date.now(),
                accessExpiresAt: Date.now() + (48 * 3600 * 1000),
                accessHoursGranted: 48
            });
        }
        toast('✓ تم قبول الطلب وتفعيل الصلاحية');
        window.loadDemoRequests();
        window.loadUsersList();
    } catch (e) { toast('خطأ في التحديث: ' + e.message, 'error'); }
};

window.rejectDemoRequest = async function (key, uid) {
    try {
        await update(ref(db, `demo_requests/${key}`), { status: 'rejected' });
        if (uid) {
            await update(ref(db, `users/${uid}`), { status: 'suspended' });
        }
        toast('تم رفض الطلب');
        window.loadDemoRequests();
        window.loadUsersList();
    } catch (e) { toast('خطأ في التحديث: ' + e.message, 'error'); }
};

/* ══════════════════════════════════════════════════════════
   📅 Epochs Manager
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
    }
}

/* ══════════════════════════════════════════════════════════
   🏷️ Withdrawal Reasons
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
   🚀 Initial Dashboard Loader
══════════════════════════════════════════════════════════ */

function loadDashboardData() {
    loadAnalytics();
    window.loadUsersList();
    window.loadDemoRequests();
    _loadEpochs();
    _loadWithdrawalReasons();
}

/* ══════════════════════════════════════════════════════════
   🚪 Logout
══════════════════════════════════════════════════════════ */

window.saLogout = async function () {
    try {
        await signOut(auth);
        window.location.replace('/');
    } catch (e) {
        toast('خطأ في تسجيل الخروج: ' + e.message, 'error');
    }
};

// ── تشغيل التحقق فوراً ──
checkAuthAndInit();
