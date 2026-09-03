/**
 * منصة أثر التعليمية - المصادقة وإدارة الحساب (Authentication & User Profile)
 */

import {
    auth, db, googleProvider,
    signInWithEmailAndPassword, createUserWithEmailAndPassword,
    signOut, onAuthStateChanged, signInWithPopup,
    ref, set, get, update
} from "./firebase-config.js";
import { showAtharNotification } from "./utils.js";
import { state, currentUser, setCurrentUser } from "./state.js";

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

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, pass);
        const user = userCredential.user;
        setCurrentUser(user);

        if (email.toLowerCase() === 'hrhalsharif@gmail.com') {
            showAtharNotification("مرحباً بك في لوحة الإدارة العليا!");
            window.location.replace('/super-admin');
            return;
        }

        showAtharNotification("تم تسجيل الدخول بنجاح!");
        await redirectAfterAuth(user.uid);
    } catch (error) {
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
 * إنشاء حساب جديد / طلب ديمو
 */
export async function handleRegister(e) {
    if (e && e.preventDefault) e.preventDefault();

    const nameElem = document.getElementById('reg-name') || document.getElementById('demo-name');
    const emailElem = document.getElementById('reg-email') || document.getElementById('demo-email');
    const passElem = document.getElementById('reg-password') || document.getElementById('demo-password');
    const phoneElem = document.getElementById('reg-phone') || document.getElementById('demo-phone');
    const groupElem = document.getElementById('reg-group') || document.getElementById('demo-group');
    const roleElem = document.getElementById('selected-role');

    if (!nameElem || !emailElem || !passElem) return;

    const name = nameElem.value.trim();
    const email = emailElem.value.trim();
    const pass = passElem.value;
    const phone = phoneElem ? phoneElem.value.trim() : '';
    const group = groupElem ? groupElem.value.trim() : '';
    const role = roleElem ? roleElem.value : 'followup_supervisor';

    if (!name || !email || !pass) {
        showAtharNotification("برجاء ملء جميع البيانات الأساسية", 'error');
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const user = userCredential.user;
        setCurrentUser(user);

        const isSuper = email.toLowerCase() === 'hrhalsharif@gmail.com';

        // حفظ بيانات المستخدم في قاعدة البيانات
        await set(ref(db, `users/${user.uid}`), {
            name: name,
            email: email,
            phone: phone,
            groupTarget: group,
            role: role,
            status: isSuper ? 'active' : 'pending',
            createdAt: Date.now(),
            accessExpiresAt: null
        });

        // نسخة في demo_requests للإحصائيات
        if (!isSuper) {
            push(ref(db, 'demo_requests'), {
                uid: user.uid,
                name: name,
                email: email,
                phone: phone,
                group: group,
                requestedAt: Date.now(),
                status: 'pending'
            }).catch(() => {});
        }

        if (isSuper) {
            showAtharNotification("مرحباً بك في لوحة الإدارة العليا!");
            window.location.replace('/super-admin');
        } else {
            showAtharNotification("تم تسجيل حسابك بنجاح وهو قيد اعتماد الإدارة العليا.", "info");
            window.location.replace('/?status=pending');
        }
    } catch (error) {
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
 * تسجيل الدخول / إنشاء حساب عبر جوجل
 */
export async function handleGoogleLogin(isRegistration = false) {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        setCurrentUser(user);

        const isSuper = (user.email || '').toLowerCase() === 'hrhalsharif@gmail.com';

        if (isSuper) {
            showAtharNotification("مرحباً بك يا مدير المنظومة!");
            window.location.replace('/super-admin');
            return;
        }

        const userRef = ref(db, `users/${user.uid}`);
        const snapshot = await get(userRef);

        if (!snapshot.exists()) {
            // مستخدم جديد يسجل عبر جوجل لأول مرة -> يدخل في قائمة الانتظار
            await set(userRef, {
                email: user.email,
                name: user.displayName || "مشرف جديد",
                phone: "",
                role: 'followup_supervisor',
                status: 'pending',
                createdAt: Date.now(),
                accessExpiresAt: null
            });

            push(ref(db, 'demo_requests'), {
                uid: user.uid,
                name: user.displayName || "مشرف جديد",
                email: user.email,
                phone: "",
                group: "",
                requestedAt: Date.now(),
                status: 'pending'
            }).catch(() => {});

            showAtharNotification(`أهلاً بك يا ${user.displayName || "المشرف"}! حسابك قيد اعتماد الإدارة العليا.`, "info");
            window.location.replace('/?status=pending');
        } else {
            // مستخدم موجود -> فحص الصلاحيات
            await update(userRef, { name: user.displayName || "مشرف أثر" });
            await redirectAfterAuth(user.uid);
        }
    } catch (error) {
        showAtharNotification("خطأ في العملية عبر جوجل: " + error.message, 'error');
    }
}

/**
 * تسجيل الخروج
 */
export async function handleLogout() {
    try {
        await signOut(auth);
        window.location.href = '/';
    } catch (error) {
        showAtharNotification("خطأ في تسجيل الخروج", "error");
    }
}

/**
 * التوجيه بعد تسجيل الدخول حسب دور المستخدم ومجموعته وحالة تفعيله
 */
export async function redirectAfterAuth(uid) {
    const userEmail = (auth.currentUser?.email || '').toLowerCase();
    if (userEmail === 'hrhalsharif@gmail.com') {
        window.location.replace('/super-admin');
        return;
    }

    const userRef = ref(db, `users/${uid}`);
    const snapshot = await get(userRef);
    const userData = snapshot.val();

    if (!userData) {
        window.location.replace('/?status=pending');
        return;
    }

    // ── فحص حالة تفعيل الحساب من الإدارة العليا ──
    if (userData.status === 'pending') {
        showAtharNotification('⏳ حسابك قيد المراجعة والاعتماد من الإدارة العليا.', 'info');
        window.location.replace('/?status=pending');
        return;
    }

    if (userData.status === 'suspended') {
        showAtharNotification('🚫 تم إيقاف هذا الحساب من قِبل الإدارة العليا.', 'error');
        window.location.replace('/?status=suspended');
        return;
    }

    if (userData.accessExpiresAt && Date.now() > userData.accessExpiresAt) {
        showAtharNotification('⌛ انتهت مدة الصلاحية المصرح بها لحسابك.', 'warning');
        window.location.replace('/?status=expired');
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
                separateDialCode: true,
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
