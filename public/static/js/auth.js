/**
 * منصة أثر التعليمية - المصادقة وإدارة الحساب (Authentication & User Profile)
 */

import {
    auth, db, googleProvider,
    signInWithEmailAndPassword, createUserWithEmailAndPassword,
    signOut, onAuthStateChanged, signInWithPopup,
    signInWithRedirect, getRedirectResult,
    ref, set, get, update
} from "./firebase-config.js";
import { showAtharNotification } from "./utils.js";
import { state, currentUser, setCurrentUser } from "./state.js";

/** مفاتيح التخزين المحلي */
const CACHE_USER_KEY        = 'athar_cached_user';
const CACHE_USER_DATA_KEY   = 'athar_cached_user_data';
const EXPLICIT_LOGOUT_KEY   = 'athar_explicitly_logged_out';

/** مسح كاش المستخدم بالكامل عند تسجيل الخروج */
function clearAuthCache() {
    try {
        localStorage.removeItem(CACHE_USER_KEY);
        localStorage.removeItem(CACHE_USER_DATA_KEY);
        localStorage.setItem(EXPLICIT_LOGOUT_KEY, '1');
        // مسح كل مفاتيح الحالة المحلية
        Object.keys(localStorage).forEach(k => {
            if (k.startsWith('athar_offline_state_') || k.startsWith('athar_offline_queue')) {
                localStorage.removeItem(k);
            }
        });
    } catch (e) {
        console.warn('[Auth] Failed to clear cache:', e);
    }
}

/** mutex لمنع تعدد استدعاءات Google Login */
let _googleLoginInProgress = false;

/**
 * تسجيل الدخول بالبريد وكلمة المرور
 */
export async function handleLogin(e) {
    if (e && e.preventDefault) e.preventDefault();

    const emailElem = document.getElementById('username');
    const passElem = document.getElementById('password');
    if (!emailElem || !passElem) return;

    const email = emailElem.value.trim();
    const pass = passElem.value;

    if (!email || !pass) {
        showAtharNotification("برجاء إدخال البريد الإلكتروني وكلمة المرور", 'error');
        return;
    }

    const submitBtn = document.querySelector('#login-form button[type="submit"]');
    const originalHTML = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add('btn-loading');
        submitBtn.innerHTML = '<span class="athar-spinner-sm"></span> جاري تسجيل الدخول...';
    }

    try {
        // مسح علامة الخروج عند تسجيل دخول جديد
        try { localStorage.removeItem(EXPLICIT_LOGOUT_KEY); } catch (_) {}

        const userCredential = await signInWithEmailAndPassword(auth, email, pass);
        const user = userCredential.user;
        setCurrentUser(user);

        showAtharNotification("تم تسجيل الدخول بنجاح!");
        await redirectAfterAuth(user.uid);
    } catch (error) {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('btn-loading');
            submitBtn.innerHTML = originalHTML;
        }
        let msg = "خطأ في تسجيل الدخول: " + error.message;
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            msg = "البريد الإلكتروني أو كلمة المرور غير صحيحة";
        } else if (error.code === 'auth/operation-not-allowed') {
            msg = "تسجيل الدخول بالبريد الإلكتروني غير مفعل في إعدادات فيربيز";
        } else if (error.code === 'auth/invalid-email') {
            msg = "صيغة البريد الإلكتروني غير صحيحة";
        }
        showAtharNotification(msg, 'error');
    }
}

/**
 * إنشاء حساب جديد
 */
export async function handleRegister(e) {
    if (e && e.preventDefault) e.preventDefault();

    const nameElem = document.getElementById('reg-name');
    const emailElem = document.getElementById('reg-email');
    const passElem = document.getElementById('reg-password');

    if (!nameElem || !emailElem || !passElem) return;

    const name = nameElem.value.trim();
    const email = emailElem.value.trim();
    const pass = passElem.value;
    const role = 'followup_supervisor';

    if (!name || !email || !pass) {
        showAtharNotification("برجاء ملء جميع البيانات الأساسية", 'error');
        return;
    }

    const submitBtn = document.querySelector('#register-form button[type="submit"]');
    const originalHTML = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add('btn-loading');
        submitBtn.innerHTML = '<span class="athar-spinner-sm"></span> جاري إنشاء الحساب...';
    }

    try {
        // مسح علامة الخروج عند إنشاء حساب جديد
        try { localStorage.removeItem(EXPLICIT_LOGOUT_KEY); } catch (_) {}

        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const user = userCredential.user;
        setCurrentUser(user);

        // حفظ بيانات المستخدم في قاعدة البيانات
        await set(ref(db, `users/${user.uid}`), {
            name: name,
            email: email,
            role: role,
            createdAt: Date.now()
        });

        showAtharNotification("تم إنشاء الحساب بنجاح!");
        window.location.replace('/setup');
    } catch (error) {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('btn-loading');
            submitBtn.innerHTML = originalHTML;
        }
        let msg = "خطأ في إنشاء الحساب: " + error.message;
        if (error.code === 'auth/email-already-in-use') {
            msg = "هذا البريد الإلكتروني مسجل بالفعل. يرجى تسجيل الدخول بدلاً من ذلك.";
        } else if (error.code === 'auth/weak-password') {
            msg = "كلمة المرور ضعيفة جداً (يجب أن تكون 6 أحرف على الأقل)";
        }
        showAtharNotification(msg, 'error');
    }
}

/**
 * تسجيل الدخول / إنشاء حساب عبر جوجل — باستخدام signInWithRedirect لضمان التوافق التام مع PWA والموبايل
 */
export async function handleGoogleLogin(isRegistration = false) {
    if (_googleLoginInProgress) {
        showAtharNotification("جاري معالجة الطلب، يرجى الانتظار...", 'info');
        return;
    }
    _googleLoginInProgress = true;

    // تعطيل أزرار جوجل وإظهار مؤشر أثر
    const googleBtns = document.querySelectorAll('.btn-google');
    const originalStates = [];
    googleBtns.forEach(btn => {
        originalStates.push({ btn, html: btn.innerHTML });
        btn.disabled = true;
        btn.classList.add('btn-loading');
        btn.innerHTML = '<span class="athar-spinner-sm"></span> جاري التوجيه إلى Google...';
    });

    try {
        // مسح علامة الخروج الصريح قبل الدخول الجديد
        try { localStorage.removeItem(EXPLICIT_LOGOUT_KEY); } catch (_) {}

        if (isRegistration) {
            sessionStorage.setItem('athar_is_google_registration', '1');
        } else {
            sessionStorage.removeItem('athar_is_google_registration');
        }

        // وسم حالة انتظار التوجيه عبر Google
        sessionStorage.setItem('athar_awaiting_google_redirect', '1');

        // التوجيه الكامل لصفحة جوجل لاختيار الحساب (PWA / Mobile Friendly)
        await signInWithRedirect(auth, googleProvider);
    } catch (error) {
        _googleLoginInProgress = false;
        sessionStorage.removeItem('athar_awaiting_google_redirect');
        originalStates.forEach(({ btn, html }) => {
            btn.disabled = false;
            btn.classList.remove('btn-loading');
            btn.innerHTML = html;
        });
        showAtharNotification("خطأ في التوجيه إلى Google: " + error.message, 'error');
    }
}

/**
 * معالجة نتيجة العودة من التوجيه عبر Google (getRedirectResult)
 * تدعم القراءة المباشرة من getRedirectResult مع fallback فوري لـ onAuthStateChanged
 */
export async function handleRedirectAuthResult() {
    const isAwaiting = sessionStorage.getItem('athar_awaiting_google_redirect') === '1';

    try {
        let user = null;

        // 1. محاولة قراءة نتيجة التوجيه من getRedirectResult
        try {
            const result = await getRedirectResult(auth);
            if (result && result.user) {
                user = result.user;
            }
        } catch (e) {
            console.warn("[Auth] getRedirectResult notice:", e?.message);
        }

        // 2. إذا كانت النتيجة null ولكن المتصفح عائد من توجيه Google، ننتظر onAuthStateChanged
        if (!user && (isAwaiting || auth.currentUser)) {
            user = auth.currentUser;
            if (!user) {
                user = await new Promise((resolve) => {
                    const unsubscribe = onAuthStateChanged(auth, (u) => {
                        unsubscribe();
                        resolve(u);
                    });
                    setTimeout(() => resolve(null), 3000);
                });
            }
        }

        // 3. عند العثور على المستخدم العائد من Google:
        if (user) {
            sessionStorage.removeItem('athar_awaiting_google_redirect');
            try { localStorage.removeItem(EXPLICIT_LOGOUT_KEY); } catch (_) {}
            setCurrentUser(user);

            const { showLoader } = await import("./state.js");
            showLoader("جاري استكمال تسجيل الدخول عبر Google...");

            const isReg = sessionStorage.getItem('athar_is_google_registration') === '1';
            sessionStorage.removeItem('athar_is_google_registration');

            const userRef = ref(db, `users/${user.uid}`);
            const snapshot = await get(userRef);

            if (!snapshot.exists()) {
                let role = 'followup_supervisor';

                const newUserData = {
                    email: user.email || '',
                    name: user.displayName || "مشرف جديد",
                    role: role,
                    createdAt: Date.now()
                };

                await set(userRef, newUserData);
                const { setCachedUserData } = await import("./state.js");
                setCachedUserData(newUserData);

                showAtharNotification(`أهلاً بك يا ${user.displayName || "المشرف"}! تم إنشاء حسابك بنجاح.`);
                window.location.replace('/setup');
            } else {
                const userData = snapshot.val() || {};
                await update(userRef, {
                    name: user.displayName || userData.name || "مشرف أثر",
                    lastLoginAt: Date.now()
                }).catch(() => {});

                const { setCachedUserData } = await import("./state.js");
                setCachedUserData(userData);

                showAtharNotification("تم تسجيل الدخول بنجاح!");
                await redirectAfterAuth(user.uid);
            }
            return true;
        } else if (isAwaiting) {
            sessionStorage.removeItem('athar_awaiting_google_redirect');
        }
    } catch (error) {
        sessionStorage.removeItem('athar_awaiting_google_redirect');
        console.error("[Auth] Redirect result error:", error);
        if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
            showAtharNotification("خطأ في تسجيل الدخول عبر Google: " + error.message, 'error');
        }
    }
    return false;
}

/**
 * تسجيل الخروج — مع مسح كامل للكاش لمنع إعادة الدخول التلقائي
 */
export async function handleLogout() {
    try {
        clearAuthCache(); // مسح الكاش أولاً قبل signOut
        await signOut(auth);
        window.location.replace('/');
    } catch (error) {
        // حتى لو فشل signOut، نمسح الكاش ونوجّه للصفحة الرئيسية
        clearAuthCache();
        showAtharNotification("خطأ في تسجيل الخروج", "error");
        setTimeout(() => { window.location.replace('/'); }, 1000);
    }
}

/**
 * التوجيه بعد تسجيل الدخول حسب دور المستخدم ومجموعته
 */
export async function redirectAfterAuth(uid) {
    const userRef = ref(db, `users/${uid}`);
    const snapshot = await get(userRef);
    const userData = snapshot.val();

    if (!userData) {
        window.location.replace('/setup');
        return;
    }

    state.userInfo = userData;

    // تسجيل وقت آخر تسجيل دخول
    update(ref(db, `users/${uid}`), { lastLoginAt: Date.now() }).catch(() => {});

    const activeGroupId = userData.activeGroupId || userData.groupId;

    if (!activeGroupId) {
        window.location.replace('/setup');
    } else if (userData.role === 'group_supervisor') {
        window.location.replace('/reports');
    } else {
        window.location.replace('/dashboard');
    }
}

/**
 * التبديل بين بطاقتي الدخول وإنشاء الحساب في صفحة login.html
 */
export function toggleAuthCards(showRegister = true) {
    const loginCard = document.getElementById('login-card');
    const registerCard = document.getElementById('register-card');

    if (loginCard && registerCard) {
        if (showRegister) {
            loginCard.style.display = 'none';
            registerCard.style.display = 'block';
        } else {
            loginCard.style.display = 'block';
            registerCard.style.display = 'none';
        }
    }
}

/**
 * فتح نافذة الملف الشخصي
 */
export function openProfileModal() {
    const modal = document.getElementById('profile-modal');
    if (!modal || !currentUser) return;

    const nameInput = document.getElementById('profile-name');
    const emailInput = document.getElementById('profile-email');
    const phoneInput = document.getElementById('profile-phone');

    if (nameInput) nameInput.value = state.userInfo?.name || "";
    if (emailInput) emailInput.value = currentUser.email || "";
    if (phoneInput) {
        phoneInput.value = state.userInfo?.phone || "";
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

    modal.style.display = 'flex';
}

/**
 * حفظ تعديلات الملف الشخصي
 */
export async function saveProfileChanges() {
    const nameInput = document.getElementById('profile-name');
    const phoneInput = document.getElementById('profile-phone');
    if (!nameInput) return;

    const name = nameInput.value.trim();
    const newPhoneRaw = phoneInput ? phoneInput.value.trim() : "";
    const phone = (phoneInput && phoneInput.iti) ? (phoneInput.iti.getNumber() || newPhoneRaw) : newPhoneRaw;

    if (!name) {
        showAtharNotification("يرجى إدخال الاسم", "error");
        return;
    }

    try {
        showAtharNotification("جاري حفظ التغييرات...", "info");
        await update(ref(db, `users/${currentUser.uid}`), {
            name: name,
            phone: phone
        });

        if (state.userInfo) {
            state.userInfo.name = name;
            state.userInfo.phone = phone;
        }

        const displayNameElem = document.getElementById('user-display-name');
        if (displayNameElem) displayNameElem.innerText = name;

        const modal = document.getElementById('profile-modal');
        if (modal) modal.style.display = 'none';

        showAtharNotification("تم حفظ التغييرات بنجاح!", "success");
    } catch (error) {
        showAtharNotification("خطأ أثناء الحفظ: " + error.message, "error");
    }
}
