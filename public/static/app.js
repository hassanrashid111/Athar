/**
 * Athar Educational Platform
 * Core Application Logic (Firebase Connected)
 */

// 1. استيراد مكتبات فيربيز
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, get, child, push, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// استيراد البيانات والأدوات المساعدة (Clean Code)
import { hadithList } from "./hadith.js";
import {
    showAtharNotification,
    cleanPhone,
    getInitials,
    calculateScore,
    getStudentTotalScore,
    formatHijriDate,
    showAtharPrompt,
    showAtharChoice,
    showAtharConfirm,
    isMobileDevice,
    escapeHTML
} from "./utils.js";

// Import the functions you need from the SDKs you need
// import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// ============================================================
// 1. الإعدادات وحالة التطبيق (STATE & CONFIG)
// ============================================================

const firebaseConfig = {
    apiKey: "AIzaSyA07BPGNn21tzD2O5tAckJJuhLz4jQ9P7E",
    authDomain: "athar-final1.firebaseapp.com",
    databaseURL: "https://athar-final1-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "athar-final1",
    storageBucket: "athar-final1.firebasestorage.app",
    messagingSenderId: "229512772966",
    appId: "1:229512772966:web:ea760f8300f01089559ca7"
};

const appFirebase = initializeApp(firebaseConfig);
const db = getDatabase(appFirebase);
const auth = getAuth(appFirebase);
const googleProvider = new GoogleAuthProvider();

let currentUser = null;
let currentGroup = null;

const APP_KEY = 'Athar_data_v0';
const SESSION_KEY = 'Athar_session';

// الكائن المسؤول عن حالة التطبيق بالكامل
let state = {
    students: [],
    lectures: [],
    settings: {
        totalPlannedLectures: 8,
        certificate: {
            template: 'static/certificate_template.jpg',
            name: { x: 530, y: 660, show: true },
            date: { x: 536, y: 1126, show: true },
            lecture: { x: 1072, y: 1019, show: false }
        }
    },
    messageBatchCount: 0,
    userInfo: null,
    groupInfo: null,
    allSupervisorsData: {} // For group supervisor view
};

let performanceChart = null;

// ============================================================
// 2. خدمات فيربيز والهوية (FIREBASE & AUTH SERVICES)
// ============================================================

// دالة الحفظ الجديدة (بتبعت لفيربيز في المسار الجديد)
function saveData() {
    if (!currentUser || !currentGroup) return;

    const updates = {};
    const groupId = currentGroup.id;

    // 1. حفظ الطلاب بناءً على الدور
    if (state.userInfo && state.userInfo.role === 'followup_supervisor') {
        // مشرف المتابعة يحفظ طلابه في مساره الخاص
        updates[`athar_groups/${groupId}/students/${currentUser.uid}`] = {
            name: state.userInfo?.name || "مشرف متابعة",
            phone: state.userInfo?.phone || "", // حفظ رقم الهاتف
            students: state.students,
            lastUpdate: Date.now(),
            msgCount: state.userInfo.msgCount || 0, // حفظ عدد الرسائل للمشرف
            msgTypesCount: state.userInfo.msgTypesCount || {} // حفظ أنواع الرسائل
        };
        // تحديث بيانات المشرف نفسه أيضاً
        updates[`users/${currentUser.uid}/msgCount`] = state.userInfo.msgCount || 0;
        updates[`users/${currentUser.uid}/msgTypesCount`] = state.userInfo.msgTypesCount || {};
        updates[`users/${currentUser.uid}/phone`] = state.userInfo.phone || "";
    } else {
        // مشرف المجموعة (أو أدوار أخرى) يحفظ في المسار العام
        if (state.students && state.students.length > 0) {
            updates[`athar_groups/${groupId}/data/students`] = state.students;
        }
    }

    // 2. تحديث المحاضرات والإعدادات
    updates[`athar_groups/${groupId}/data/lectures`] = state.lectures;
    updates[`athar_groups/${groupId}/data/settings`] = state.settings;

    const IS_DRY_RUN = localStorage.getItem('ATHAR_DRY_RUN') === 'true';
    if (IS_DRY_RUN) {
        console.warn("DRY RUN ACTIVE: Data synchronization skipped.");
        showAtharNotification("تم حفظ التعديلات محلياً فقط بطوق النجاة (Dry Run)", "warning");
        renderDashboard();
        return;
    }

    update(ref(db), updates)
        .then(() => {
            renderDashboard();
        })
        .catch((error) => {
            console.error("Sync Error:", error.code);
        });
}

// دالة التحميل والبدء (تعتمد على Auth)
function init() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            loadUserData(user.uid);
        } else {
            currentUser = null;
            showLogin();
        }
    });

    renderDate();
    renderHadith();
    loadTheme();
}

async function loadUserData(uid) {
    const userRef = ref(db, `users/${uid}`);
    const snapshot = await get(userRef);
    const userData = snapshot.val();

    if (userData) {
        state.userInfo = userData;

        // التحقق من المجموعة النشطة (دعم المجموعات المتعددة)
        const activeGroupId = userData.activeGroupId || userData.groupId;

        if (activeGroupId) {
            loadGroupData(activeGroupId, uid); // Pass UID explicitly
        } else {
            showGroupSetup();
        }
    } else {
        // مستخدم جديد بدون بيانات - ربما Auth موجود لكن DB لا
        showLogin();
    }
}

function loadGroupData(groupId, forcedUid = null) {
    const groupRef = ref(db, `athar_groups/${groupId}`);
    const activeUid = forcedUid || currentUser?.uid || auth.currentUser?.uid;

    if (!activeUid) {
        return;
    }

    const loadingMsg = document.createElement('div');
    loadingMsg.id = 'firebase-loader';
    loadingMsg.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,0.9);z-index:9999;display:flex;justify-content:center;align-items:center;font-size:20px;font-weight:bold;color:#1A5D3A;";
    loadingMsg.innerHTML = '<i class="fa-solid fa-cloud-arrow-up fa-bounce"></i>&nbsp; جاري تحميل بيانات المجموعة...';
    document.body.appendChild(loadingMsg);

    onValue(groupRef, (snapshot) => {
        const groupData = snapshot.val();
        if (groupData) {
            currentGroup = { id: groupId, ...groupData.info };
            state.groupInfo = groupData.info;

            // تحميل المحاضرات والإعدادات العامة للمجموعة
            state.lectures = groupData.data?.lectures || [];
            state.settings = groupData.data?.settings || { totalPlannedLectures: 8 };

            // التأكد من وجود إعدادات الشهادة
            if (!state.settings.certificate) {
                state.settings.certificate = {
                    template: 'static/certificate_template.jpg',
                    name: { x: 530, y: 660, show: true },
                    date: { x: 536, y: 1126, show: true },
                    lecture: { x: 1072, y: 1019, show: false }
                };
            }

            // تحميل البيانات المخصصة حسب الصلاحية
            if (state.userInfo.role === 'followup_supervisor') {
                // مشرف المتابعة بيشوف طلابه بس
                const supervisorData = groupData.students?.[activeUid] || {};
                state.students = Array.isArray(supervisorData) ? supervisorData : (supervisorData.students || []);

                // تحديث صامت لاسم المشرف في بيانات المجموعة (لضمان ظهوره لمشرف المجموعة)
                if (state.userInfo.name && supervisorData.name !== state.userInfo.name) {
                    update(ref(db, `athar_groups/${groupId}/students/${activeUid}`), {
                        name: state.userInfo.name
                    });
                }

                // تحميل عداد الرسائل الخاص به
                if (groupData.students?.[activeUid]?.msgCount) {
                    state.userInfo.msgCount = groupData.students[activeUid].msgCount;
                }
                if (groupData.students?.[activeUid]?.msgTypesCount) {
                    state.userInfo.msgTypesCount = groupData.students[activeUid].msgTypesCount;
                }
                // إصلاح البيانات المفقودة
                if (state.students) {
                    state.students.forEach(s => { if (!s.progress) s.progress = {}; });
                }
                renderDashboard();
            } else if (state.userInfo.role === 'group_supervisor') {
                // مشرف المجموعة بيشوف تقارير
                state.students = [];
                state.allSupervisorsData = groupData.students || {};
                renderReports(groupData.students || {});
            }

            // تحديث اسم المشرف في الهيدر
            const headerName = document.getElementById('user-display-name');
            if (headerName && state.userInfo.name) {
                headerName.innerText = state.userInfo.name;
            }

            removeLoader();
            showDashboard();

            // فحص وجود طلبات تسليم طلاب (للمشرفين فقط)
            if (state.userInfo.role === 'followup_supervisor') {
                checkPendingTransfers();
            }
        }
    });
}

function renderReports(allStudentsData) {
    // كود أولي لعرض التقارير لمشرف المجموعة
    const tableHeader = document.getElementById('table-header-row');
    const tableBody = document.getElementById('students-body');

    if (!tableHeader || !tableBody) return;

    const lectures = state.lectures || [];
    let lecturesHeaders = '';
    lectures.forEach(l => {
        lecturesHeaders += `<th>${l.title}</th>`;
    });

    tableHeader.innerHTML = `
        <th>#</th>
        <th>اسم المشرف</th>
        <th>عدد الطلاب</th>
        <th>إجمالي الرسائل</th>
        ${lecturesHeaders}
        <th>نسبة الإنجاز الكلية</th>
        <th>آخر تحديث</th>
    `;

    tableBody.innerHTML = `<tr><td colspan="${6 + lectures.length}">جاري جلب أسماء المشرفين...</td></tr>`;

    const supervisorUids = Object.keys(allStudentsData);
    const supervisorPromises = supervisorUids.map(async (uid, idx) => {
        try {
            const supData = allStudentsData[uid];
            if (!supData) return ''; // تخطي البيانات الفارغة

            // التعامل مع البيانات القديمة (إذا كان supData عبارة عن مصفوفة طلاب مباشرة)
            let supervisorName = supData.name;
            const students = Array.isArray(supData) ? supData : (supData.students || []);

            // إذا لم يكن الاسم مخزناً محلياً، نحاول جلبه من قاعدة البيانات (مع معالجة الأخطاء)
            if (!supervisorName || supervisorName.trim() === "") {
                try {
                    const userSnapshot = await get(ref(db, `users/${uid}`));
                    supervisorName = userSnapshot.exists() ? userSnapshot.val().name : `مشرف (${uid.substr(0, 5)}...)`;
                } catch (err) {
                    supervisorName = `مشرف (${uid.substr(0, 5)}...)`;
                }
            }

            const activeStudents = students.filter(s => s && !s.deleted);

            let totalStudentPercentages = 0;
            const lectures = state.lectures || [];
            activeStudents.forEach(s => {
                try {
                    let c = 0;
                    lectures.forEach(l => {
                        const p = s.progress ? s.progress[l.id] : null;
                        if (p && p !== 'replied') c++;
                    });
                    const studentPct = lectures.length > 0 ? (c / lectures.length) * 100 : 0;
                    totalStudentPercentages += studentPct;
                } catch (e) {
                }
            });
            const avgScore = activeStudents.length > 0 ? Math.round(totalStudentPercentages / activeStudents.length) : 0;

            const msgCount = supData.msgCount || 0;

            let lecturePercentagesHtml = '';
            lectures.forEach(l => {
                let completedCount = 0;
                activeStudents.forEach(s => {
                    const p = s.progress ? s.progress[l.id] : null;
                    if (p && p !== 'replied') completedCount++;
                });
                const lecPct = activeStudents.length > 0 ? Math.round((completedCount / activeStudents.length) * 100) : 0;
                lecturePercentagesHtml += `<td>${lecPct}%</td>`;
            });

            return `
                <tr>
                    <td>${idx + 1}</td>
                    <td 
                        oncontextmenu="window.app.showSupervisorFullReport(event, '${uid}')" 
                        ontouchstart="window.app.handleLongPressFull(event, '${uid}')"
                        ontouchend="window.app.clearLongPress()"
                        style="color: var(--primary-green); font-weight: bold; cursor: context-menu;"
                    >
                        ${supervisorName}
                    </td>
                    <td>${activeStudents.length} طالب</td>
                    <td 
                        oncontextmenu="window.app.showSupervisorMsgTypes(event, '${uid}')" 
                        ontouchstart="window.app.handleLongPressMsg(event, '${uid}')"
                        ontouchend="window.app.clearLongPress()"
                        style="cursor: context-menu; font-weight: bold; color: var(--accent-gold);"
                    >
                        ${msgCount} رسالة
                    </td>
                    ${lecturePercentagesHtml}
                    <td>${avgScore}%</td>
                    <td>${supData.lastUpdate ? new Date(supData.lastUpdate).toLocaleString('ar-EG') : 'غير متوفر'}</td>
                </tr>
            `;
        } catch (fatalError) {
            const colspan = 6 + (state.lectures ? state.lectures.length : 0);
            return `<tr><td>${idx + 1}</td><td colspan="${colspan - 1}" style="color:red">خطأ في تحميل بيانات هذا المشرف</td></tr>`;
        }
    });

    Promise.all(supervisorPromises).then(rows => {
        tableBody.innerHTML = rows.filter(r => r !== '').join('');
    }).catch(err => {
        const colspan = 6 + (state.lectures ? state.lectures.length : 0);
        tableBody.innerHTML = `<tr><td colspan="${colspan}" style="color:red; text-align:center;">حدث خطأ أثناء تجميع التقارير. يرجى تحديث الصفحة.</td></tr>`;
    });
}

function removeLoader() {
    const l = document.getElementById('firebase-loader');
    if (l) l.remove();
}

// دالة وضع بيانات أولية (لو مفيش أي حاجة خالص)
function seedData() {
    state = {
        students: [],
        lectures: [{ id: 'lec_1', title: 'محاضرة 1', timestamp: Date.now() }],
        settings: { totalPlannedLectures: 8 },
        messageBatchCount: 0
    };
    saveData();
}

// ================= GLOBAL EXPORTS =================
// لازم نربط الدوال دي بالـ window عشان زرار الـ onclick في الـ HTML يشوفها
// لأننا بقينا نستخدم modules، الدوال مش بتبقى متشافة بره الملف
window.app = {
    showContext: (e, sId, lId) => showContextMenu(e, sId, lId),
    init: () => init(),
    login: (e) => handleLogin(e),
    register: (e) => handleRegister(e),
    logout: () => handleLogout(),
    createGroup: () => createGroupFlow(),
    joinGroup: () => joinGroupFlow(),
    addStudent: () => addStudentFlow(),
    addLecture: () => addLectureFlow(),
    toggleCheck: (sId, lId) => toggleStudentCheck(sId, lId),
    exportData: () => exportToExcel(),
    sendMessages: () => startMessagingFlow(),
    deleteStudent: (id) => deleteStudentFlow(id),
    deleteLecture: (id) => deleteLectureFlow(id),
    search: () => handleSearch(),
    sort: (criteria, id) => sortStudents(criteria, id),
    toggleTheme: () => toggleTheme(),
    openNotes: (id) => openNotesModal(id),
    closeNotes: () => closeNotesModal(),
    saveNotes: () => saveStudentNotes(),
    getReport: () => getReportFile(),
    backupData: () => backupData(),
    restoreData: (e) => restoreData(e),
    manualStatus: (days) => manualStatus(days),
    openImport: () => document.getElementById('import-modal').style.display = 'flex',
    closeImport: () => document.getElementById('import-modal').style.display = 'none',
    saveImport: () => processBulkImport(),
    editStudent: (id) => openEditStudentModal(id),
    saveEditStudent: () => saveStudentDataEdit(),
    clearAllData: () => wipeAllData(),
    resetMessages: () => resetMessageCounts(),
    downloadCert: (name, count) => downloadCertificate(name, count),
    downloadLecturePDF: (id, title) => downloadLecturePDF(id, title),
    loginWithGoogle: () => handleGoogleLogin(),
    registerWithGoogle: () => handleGoogleLogin(true),
    openGroupInfoModal: () => openGroupInfoModal(),
    openProfileModal: () => openProfileModal(),
    saveProfileChanges: () => saveProfileChanges(),
    saveCertSettings: () => window.app.saveCertSettings(),
    showSupervisorFullReport: (e, uid) => showSupervisorFullReport(e, uid),
    showSupervisorMsgTypes: (e, uid) => showSupervisorMsgTypes(e, uid),
    handleLongPressFull: (e, uid) => window.app.handleLongPressFull(e, uid),
    handleLongPressMsg: (e, uid) => window.app.handleLongPressMsg(e, uid),
    clearLongPress: () => window.app.clearLongPress(),
    createNewGroup: () => createNewGroup(),
    switchGroup: () => switchGroup(),
    deleteCurrentGroup: () => deleteCurrentGroupFlow(),
    toggleMenu: () => toggleMenuFlow(),
    initiateStudentTransfer: () => initiateStudentTransfer(),
    openLectureSettings: (e, lId) => openLectureSettings(e, lId),
    saveLectureSettings: () => saveLectureSettings(),
    copyLectureId: () => copyLectureId(),
    saveGroupSettings: () => saveGroupSettings(),
    copyLectureScript: () => copyLectureScript(),
    deleteLectureFromSettings: () => deleteLectureFromSettings()
};

// ... (هنا بيكمل باقي الكود بتاعك القديم زي handleLogin وغيره) ...
function checkSession() {
    const isLoggedIn = localStorage.getItem(SESSION_KEY) === 'true';
    if (isLoggedIn) showDashboard();
    else showLogin();
}

// ================= AUTHENTICATION =================
async function handleLogin(e) {
    if (e) e.preventDefault();
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
        currentUser = userCredential.user; // Set immediately
        window.history.replaceState({}, document.title, window.location.pathname);
        showAtharNotification("تم تسجيل الدخول بنجاح");
        loadUserData(currentUser.uid);
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

async function handleRegister(e) {
    if (e) e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const pass = document.getElementById('reg-password').value;
    const role = document.getElementById('selected-role').value;

    if (!name || !email || !pass) {
        showAtharNotification("برجاء ملء جميع البيانات", 'error');
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        currentUser = userCredential.user; // Set immediately

        // حفظ بيانات المستخدم الأولية
        await set(ref(db, `users/${currentUser.uid}`), {
            name: name,
            email: email,
            role: role,
            createdAt: Date.now()
        });

        window.history.replaceState({}, document.title, window.location.pathname);
        showAtharNotification("تم إنشاء الحساب بنجاح!");
        loadUserData(currentUser.uid);
    } catch (error) {
        console.error("Register Error:", error.message);
        let msg = "خطأ في إنشاء الحساب: " + error.message;

        if (error.code === 'auth/email-already-in-use') {
            msg = "هذا البريد الإلكتروني مسجل بالفعل";
        } else if (error.code === 'auth/weak-password') {
            msg = "كلمة المرور ضعيفة جداً (يجب أن تكون 6 أحرف على الأقل)";
        } else if (error.code === 'auth/operation-not-allowed') {
            msg = "إنشاء الحسابات غير مفعل في إعدادات فيربيز";
        }

        showAtharNotification(msg, 'error');
    }
}

async function handleGoogleLogin(isRegistration = false) {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        currentUser = result.user; // Set immediately
        const user = currentUser;

        // التحقق من وجود المستخدم في القاعدة
        const userRef = ref(db, `users / ${user.uid} `);
        const snapshot = await get(userRef);

        if (!snapshot.exists()) {
            // مستخدم جديد
            let role = 'followup_supervisor'; // افتراضي

            // لو جاي من زرار "إنشاء حساب" ناخد الدور المختار
            if (isRegistration) {
                const roleElem = document.getElementById('selected-role');
                role = roleElem ? roleElem.value : 'followup_supervisor';
            } else {
                // لو داخل لأول مرة من "تسجيل دخول" وما عندوش حساب أصلاً
                showAtharNotification("لا يوجد حساب مسجل بهذا البريد. سيتم إنشاء حساب جديد كمشرف متابعة. يمكنك تغييره لاحقاً.", 'info');
            }

            await set(userRef, {
                email: user.email,
                name: user.displayName || "مشرف جديد",
                role: role,
                createdAt: Date.now()
            });
            showAtharNotification(`أهلاً بك يا ${user.displayName || "المشرف"} !تم إنشاء حسابك بنجاح.`);
        } else {
            // لو مستخدم موجود أصلاً - بنحدث بياناته بس
            await update(userRef, { name: user.displayName || "مشرف أثر" });
            if (isRegistration) {
                showAtharNotification("لديك حساب بالفعل! تم تسجيل دخولك.");
            }
        }
        loadUserData(user.uid);
        window.history.replaceState({}, document.title, window.location.pathname);
    } catch (error) {
        showAtharNotification("خطأ في العملية عبر جوجل: " + error.message, 'error');
    }
}

async function handleLogout() {
    try {
        await signOut(auth);
        location.reload();
    } catch (error) {
        showAtharNotification("خطأ في تسجيل الخروج", "error");
    }
}

async function openGroupInfoModal() {
    const modal = document.getElementById('group-info-modal');
    const content = document.getElementById('group-info-content');
    const saveBtn = document.getElementById('save-group-info-btn');
    if (!modal || !content || !currentGroup) return;

    try {
        let adminName = "جاري التحميل...";
        const isGroupSup = state.userInfo && state.userInfo.role === 'group_supervisor';

        if (isGroupSup) {
            content.innerHTML = `
                <div class="input-group" style="margin-bottom: 10px; text-align: right;">
                    <label style="display:block; margin-bottom: 5px;"><strong>اسم المجموعة:</strong></label>
                    <input type="text" id="edit-group-name" value="${state.groupInfo?.name || ''}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 5px;" />
                </div>
                <div class="input-group" style="margin-bottom: 10px; text-align: right;">
                    <label style="display:block; margin-bottom: 5px;"><strong>رقم المجموعة:</strong></label>
                    <input type="text" id="edit-group-number" value="${state.groupInfo?.number || ''}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 5px;" />
                </div>
                <div style="margin-bottom: 15px; text-align: right;"><strong>كود المجموعة (ID):</strong> <code style="background:#eee; padding:2px 5px; border-radius:4px;">${currentGroup.id}</code></div>
                <div style="margin-bottom: 15px; text-align: right;"><strong>المشرف المسؤول:</strong> <span id="group-admin-name">${adminName}</span></div>
                <div class="input-group" style="margin-bottom: 10px; text-align: right;">
                    <label style="display:block; margin-bottom: 5px;"><strong>إجمالي المحاضرات المخططة:</strong></label>
                    <input type="number" id="edit-group-total" value="${state.groupInfo?.totalLectures || state.settings?.totalPlannedLectures || 0}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 5px;" />
                </div>
            `;
            if (saveBtn) saveBtn.style.display = 'block';
        } else {
            content.innerHTML = `
                <div><strong>اسم المجموعة:</strong> ${state.groupInfo?.name || "غير محدد"}</div>
                <div><strong>رقم المجموعة:</strong> ${state.groupInfo?.number || "غير محدد"}</div>
                <div><strong>كود المجموعة (ID):</strong> <code style="background:#eee; padding:2px 5px; border-radius:4px;">${currentGroup.id}</code></div>
                <div><strong>المشرف المسؤول:</strong> <span id="group-admin-name">${adminName}</span></div>
                <div><strong>إجمالي المحاضرات المخططة:</strong> ${state.groupInfo?.totalLectures || state.settings?.totalPlannedLectures || 0}</div>
            `;
            if (saveBtn) saveBtn.style.display = 'none';
        }
        modal.style.display = 'flex';

        if (state.groupInfo?.adminUid) {
            const adminSnapshot = await get(ref(db, `users/${state.groupInfo.adminUid}`));
            if (adminSnapshot.exists()) {
                adminName = adminSnapshot.val().name || "مشرف مجهول";
                const adminElem = document.getElementById('group-admin-name');
                if (adminElem) adminElem.innerText = adminName;
            }
        }
    } catch (error) {
        console.error("Error opening group info:", error);
    }
}

async function saveGroupSettings() {
    if (!currentGroup || !state.userInfo || state.userInfo.role !== 'group_supervisor') return;

    const newName = document.getElementById('edit-group-name').value.trim();
    const newNumber = document.getElementById('edit-group-number').value.trim();
    const newTotal = parseInt(document.getElementById('edit-group-total').value) || 0;

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
        if (state.settings) {
            state.settings.totalPlannedLectures = newTotal;
        }

        document.getElementById('group-info-modal').style.display = 'none';
        
        renderStats();
        
        showAtharNotification("تم حفظ بيانات المجموعة بنجاح", "success");
    } catch (error) {
        console.error("Error saving group settings:", error);
        showAtharNotification("حدث خطأ أثناء حفظ التغييرات", "error");
    }
}

function openProfileModal() {
    const modal = document.getElementById('profile-modal');
    if (!modal || !currentUser) return;

    document.getElementById('profile-name').value = state.userInfo.name || "";
    document.getElementById('profile-email').value = currentUser.email || "";

    const phoneInput = document.getElementById('profile-phone');
    phoneInput.value = state.userInfo.phone || "";

    if (!phoneInput.iti && window.intlTelInput) {
        phoneInput.iti = window.intlTelInput(phoneInput, {
            initialCountry: "eg",
            preferredCountries: ["eg", "sa", "ae", "kw", "qa"],
            separateDialCode: true,
            utilsScript: "https://cdn.jsdelivr.net/npm/intl-tel-input@23.0.11/build/js/utils.js"
        });
    }

    modal.style.display = 'flex';
}

async function saveProfileChanges() {
    const name = document.getElementById('profile-name').value.trim();
    const phoneInput = document.getElementById('profile-phone');
    const newPhoneRaw = phoneInput.value.trim();
    const phone = phoneInput.iti ? (phoneInput.iti.getNumber() || newPhoneRaw) : newPhoneRaw;

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

        state.userInfo.name = name;
        state.userInfo.phone = phone;

        const displayNameElem = document.getElementById('user-display-name');
        if (displayNameElem) displayNameElem.innerText = name;

        document.getElementById('profile-modal').style.display = 'none';
        showAtharNotification("تم حفظ التغييرات بنجاح!", "success");
    } catch (error) {
        console.error("Error saving profile:", error);
        showAtharNotification("خطأ أثناء الحفظ: " + error.message, "error");
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

function showLogin() {
    document.getElementById('login-view').style.display = 'flex';
    document.getElementById('dashboard-view').style.display = 'none';

    // التبديل بين الكروت داخل حاوية الـ login
    const loginCard = document.querySelector('.login-card:not(#group-setup-view)');
    if (loginCard) loginCard.style.display = 'block';
    document.getElementById('group-setup-view').style.display = 'none';
}

function showDashboard() {
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('dashboard-view').style.display = 'flex';

    // إخفاء/إظهار مفاتيح اللوحة حسب الدور
    const role = state.userInfo.role;
    const addStudentBtn = document.querySelector('button[onclick="window.app.addStudent()"]');
    const addLectureBtn = document.querySelector('button[onclick="window.app.addLecture()"]');
    const toolsDropdown = document.querySelector('.dropdown');
    const importBtn = document.querySelector('button[onclick="window.app.openImport()"]');
    const messagingCard = document.querySelector('.messaging-card');

    if (role === 'group_supervisor') {
        if (addStudentBtn) addStudentBtn.style.display = 'none';
        if (importBtn) importBtn.style.display = 'none';
        if (messagingCard) messagingCard.style.display = 'block'; // تفعيل لوحة الرسائل للمشرف

        // تحديث عناوين لوحة الرسائل لتناسب دور مشرف المجموعة
        const msgTitle = document.getElementById('msg-card-title');
        const msgDesc = document.getElementById('msg-card-desc');
        const insertVarBtn = document.querySelector('.insert-var-btn');
        const hintText = document.getElementById('msg-hint-text');

        if (msgTitle) msgTitle.innerText = "رسالة التواصل مع المشرفين";
        if (msgDesc) msgDesc.innerText = "بإمكانك إرسال رسائل لمشرفي المتابعة حسب نسبة الإنجاز";
        if (insertVarBtn) insertVarBtn.innerHTML = '<i class="fa-solid fa-user-tag"></i> إدراج الاسم';
        if (hintText) hintText.innerText = "سيتم استبدال {الاسم} باسم المشرف.";

        // تم التعديل: إخفاء زر إضافة المحاضرة لمشرف المجموعة (بناءً على طلب المستخدم)
        if (addLectureBtn) addLectureBtn.style.display = 'block';

        const resetBtn = document.querySelector('a[onclick="window.app.clearAllData()"]');
        if (resetBtn) resetBtn.style.display = 'none';

        const deleteGroupBtn = document.getElementById('delete-group-btn-menu');
        if (deleteGroupBtn) deleteGroupBtn.style.display = 'block';

        const transferBtn = document.getElementById('transfer-students-btn');
        if (transferBtn) transferBtn.style.display = 'none';
    } else if (role === 'followup_supervisor') {
        const transferBtn = document.getElementById('transfer-students-btn');
        if (transferBtn) transferBtn.style.display = 'block';
    } else {
        if (addStudentBtn) addStudentBtn.style.display = 'block';
        if (importBtn) importBtn.style.display = 'block';
        if (messagingCard) messagingCard.style.display = 'block';
        // تم التعديل: مشرف المتابعة الآن يستطيع إضافة محاضرات
        if (addLectureBtn) addLectureBtn.style.display = 'none';

        // إظهار زر تصفير النظام لمشرف المتابعة
        const resetBtn = document.querySelector('a[onclick="window.app.clearAllData()"]');
        if (resetBtn) resetBtn.style.display = 'block';
    }

    // إظهار/إخفاء أزرار إدارة المجموعات لمشرف المجموعة
    const addGroupBtn = document.getElementById('add-group-btn-menu');
    const switchGroupBtn = document.getElementById('switch-group-btn-menu');
    if (addGroupBtn) addGroupBtn.style.display = role === 'group_supervisor' ? 'block' : 'none';
    if (switchGroupBtn) switchGroupBtn.style.display = role === 'group_supervisor' ? 'block' : 'none';

    const displayNameElem = document.getElementById('user-display-name');
    if (displayNameElem && state.userInfo.name) {
        displayNameElem.innerText = state.userInfo.name;
    }

    renderDashboard();
}

function showGroupSetup() {
    document.getElementById('login-view').style.display = 'flex';
    document.getElementById('dashboard-view').style.display = 'none';

    // التبديل بين الكروت
    const loginCard = document.querySelector('.login-card:not(#group-setup-view)');
    if (loginCard) loginCard.style.display = 'none';
    document.getElementById('group-setup-view').style.display = 'flex';

    // إخفاء/إظهار الخيارات حسب الدور
    const role = state.userInfo.role;
    document.getElementById('create-group-section').style.display = role === 'group_supervisor' ? 'block' : 'none';
    document.getElementById('join-group-section').style.display = role === 'followup_supervisor' ? 'block' : 'none';
}

async function createGroupFlow() {
    const name = document.getElementById('new-group-name').value;
    const number = document.getElementById('new-group-number').value;
    const totalLectures = document.getElementById('new-group-lectures').value || 12;

    if (!name || !number) {
        showAtharNotification("برجاء إدخال اسم ورقم المجموعة", "error");
        return;
    }

    // توليد آي دي سهل الاستذكار (اسم المجموعة + رقمها + كود عشوائي مصغر)
    const cleanName = name.trim().replace(/\s+/g, '-').substring(0, 10);
    const groupId = `${cleanName} -${number} -${Math.random().toString(36).substr(2, 4).toUpperCase()} `;

    try {
        await set(ref(db, `athar_groups / ${groupId}/info`), {
            name: name,
            number: number,
            totalLectures: parseInt(totalLectures),
            adminUid: currentUser.uid,
            createdAt: Date.now()
        });

        // إنشاء الإعدادات الأولية للمجموعة
        await set(ref(db, `athar_groups/${groupId}/data/settings`), {
            totalPlannedLectures: parseInt(totalLectures)
        });

        await update(ref(db, `users/${currentUser.uid}`), {
            groupId: groupId
        });

        showAtharNotification(`تم إنشاء المجموعة بنجاح! كود المجموعة هو: ${groupId}`);
        loadUserData(currentUser.uid);
    } catch (error) {
        showAtharNotification("خطأ في إنشاء المجموعة: " + error.message, "error");
    }
}

async function joinGroupFlow() {
    const groupId = document.getElementById('join-group-id').value.toUpperCase().trim();
    if (!groupId) return;

    try {
        const groupRef = ref(db, `athar_groups/${groupId}/info`);
        const snapshot = await get(groupRef);

        if (snapshot.exists()) {
            await update(ref(db, `users/${currentUser.uid}`), {
                groupId: groupId
            });
            // مزامنة الاسم فور الانضمام
            await update(ref(db, `athar_groups/${groupId}/students/${currentUser.uid}`), {
                name: state.userInfo?.name || "مشرف متابعة"
            });
            showAtharNotification("تم الانضمام للمجموعة بنجاح!");
            loadUserData(currentUser.uid);
        } else {
            showAtharNotification("كود المجموعة غير صحيح", "error");
        }
    } catch (error) {
        showAtharNotification("خطأ في الانضمام: " + error.message, "error");
    }
}

renderDashboard();

// ================= DASHBOARD RENDERING =================
// ================= DASHBOARD RENDERING =================
function renderDashboard() {
    if (state.userInfo && state.userInfo.role === 'group_supervisor') {
        renderReports(state.allSupervisorsData);
    } else {
        handleSearch();
    }
    renderStats();
}

function renderTable(studentsList = null) {
    const dataToRender = studentsList || state.students;
    const thead = document.getElementById('table-header-row');
    const tbody = document.getElementById('students-body');

    // 1. تجهيز الهيدر (Headers)
    let headersHTML = `
        <th>#</th>
        <th class="sortable-header" onclick="window.app.sort('name')" title="اضغط للترتيب" style="cursor:pointer">
            اسم الطالب <i class="fa-solid fa-sort"></i>
        </th>
        <th>رقم الهاتف</th>
    `;

    const isGroupSup = state.userInfo && state.userInfo.role === 'group_supervisor';

    state.lectures.forEach(lec => {
        let eventsAttr = '';
        if (isGroupSup) {
            eventsAttr = `
                oncontextmenu="window.app.openLectureSettings(event, '${lec.id}')"
                ontouchstart="window.app.openLectureSettingsTimer = setTimeout(() => { window.app.openLectureSettings(null, '${lec.id}') }, 600)"
                ontouchend="clearTimeout(window.app.openLectureSettingsTimer)"
                ontouchmove="clearTimeout(window.app.openLectureSettingsTimer)"
            `;
        }

        let linkIconHTML = '';
        if (lec.formLink && lec.formLink.trim().length > 0) {
            linkIconHTML = `<a href="${lec.formLink}" target="_blank" onclick="event.stopPropagation()" style="color:#2980b9; margin-right:5px;" title="رابط المحاضرة"><i class="fa-solid fa-link"></i></a>`;
        }

        let nameOnClick = `window.app.sort('lecture', '${lec.id}')`;
        if (isGroupSup) {
            nameOnClick = `window.app.openLectureSettings(event, '${lec.id}')`;
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
                        <button onclick="window.app.deleteLecture('${lec.id}')" 
                                style="background:none; border:none; color:#E74C3C; cursor:pointer; font-size:0.9rem;" 
                                title="حذف العمود">
                            <i class="fa-solid fa-circle-minus"></i>
                        </button>
                    </div>
                </div>
            </th>`;
    });

    headersHTML += `
        <th class="sortable-header" onclick="window.app.sort('score')" title="ترتيب بالأكثر حضوراً" style="cursor:pointer">
             <i class="fa-solid fa-chart-simple"></i> / <i class="fa-solid fa-trash-can"></i>
        </th>`;

    thead.innerHTML = headersHTML;

    // 2. تجهيز الصفوف (السرعة والـ XSS Security 🚀)
    tbody.innerHTML = '';
    const latestLecId = state.lectures.length > 0 ? state.lectures[state.lectures.length - 1].id : null;
    
    const activeStudents = dataToRender.filter(s => !s.deleted);
    const CHUNK_SIZE = 50;
    let currentIndex = 0;

    function renderNextChunk() {
        if (currentIndex >= activeStudents.length) {
            document.querySelector('.pagination span').innerText = `عرض ${activeStudents.length} نشط من أصل ${state.students.length}`;
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

            // XSS Protection
            const safeName = escapeHTML(student.name);
            const safePhone = escapeHTML(student.phone);

            const tr = document.createElement('tr');
            tr.className = rowClass;

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
                            ${badgeHTML}
                            <div class="progress-track" style="background:#eee; height:5px; width:100%; margin-top:5px; border-radius:3px; overflow:hidden;">
                                <div style="width:${percent}%; background:${progressColor}; height:100%; border-radius:3px;"></div>
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
                    <td class="${cellClass}" oncontextmenu="window.app.showContext(event, ${student.id}, '${lec.id}')">
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
                <td style="font-weight:bold; color:${progressColor}">${percent}%</td>
                <td>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <button class="btn-action" 
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
        }
    }

    requestAnimationFrame(renderNextChunk);
}
function renderStats() {
    let total = 0;
    let absence = 0;
    const latestLecId = state.lectures.length > 0 ? state.lectures[state.lectures.length - 1].id : null;

    if (state.userInfo && state.userInfo.role === 'group_supervisor' && state.allSupervisorsData) {
        // تجميع الإحصائيات من كل المشرفين
        for (const uid in state.allSupervisorsData) {
            const students = state.allSupervisorsData[uid].students || [];
            const activeStudents = students.filter(s => !s.deleted);
            total += activeStudents.length;
            if (latestLecId) {
                absence += activeStudents.filter(s =>
                    !s.progress || !s.progress[latestLecId]
                ).length;
            }
        }
    } else {
        total = state.students.length;
        if (latestLecId) {
            absence = state.students.filter(s =>
                s.progress && !s.progress[latestLecId] && s.name.trim().length > 0
            ).length;
        }
    }

    const remaining = state.settings.totalPlannedLectures - state.lectures.length;

    document.getElementById('stat-total').innerText = total;
    document.getElementById('stat-absence').innerText = absence;
    document.getElementById('stat-remaining').innerText = remaining > 0 ? remaining : 0;
}
// ================= DATE RENDERING =================
function renderDate() {
    const dateElement = document.querySelector('.date-display');
    if (dateElement) {
        dateElement.innerText = formatHijriDate();
    }
}
// ================= HADITH =================

function renderHadith() {
    const quoteElement = document.querySelector('.quote-box p');
    if (!quoteElement) return;

    // اختيار حديث عشوائي من القائمة المستوردة
    const randomHadith = hadithList[Math.floor(Math.random() * hadithList.length)];

    // عرض الحديث وتنسيقه
    quoteElement.innerText = randomHadith;
    quoteElement.style.lineHeight = "1.8";
    quoteElement.style.whiteSpace = "pre-line";
}



// ================= ACTIONS =================
async function addStudentFlow() {
    const name = await showAtharPrompt('إضافة طالب', 'أدخل اسم الطالب:');
    if (!name) return;

    let phone = await showAtharPrompt('إضافة طالب', 'أدخل رقم الهاتف:', '', 'tel');
    if (!phone) return;

    phone = cleanPhone(phone); // تنظيف الرقم الأول

    // --- التحقق من التكرار ---
    const exists = state.students.some(s => s.phone === phone);
    if (exists) {
        showAtharNotification('⚠️ تنبيه: هذا الرقم مسجل بالفعل لطالب آخر!', 'error');
        return; // إلغاء العملية
    }
    // -----------------------

    state.students.push({
        id: Date.now(),
        name: name,
        phone: phone,
        progress: {},
        notes: ''
    });
    saveData();
    showAtharNotification('تمت إضافة الطالب بنجاح');
}

async function addLectureFlow() {
    if (state.userInfo && state.userInfo.role !== 'group_supervisor') {
        showAtharNotification("إضافة المحاضرات متاحة فقط لمشرف المجموعة.", 'error');
        return;
    }

    const title = await showAtharPrompt('إضافة محاضرة', 'أدخل عنوان المحاضرة الجديدة:', `محاضرة ${state.lectures.length + 1}`);
    if (!title) return;

    const linkPrompt = await showAtharPrompt('إضافة محاضرة', '(اختياري) أدخل رابط نموذج جوجل فورم لتسجيل الحضور:', '');

    state.lectures.push({
        id: `lec_${Date.now()}`,
        title: title,
        formLink: linkPrompt || '',
        timestamp: Date.now()
    });

    saveData();
    showAtharNotification('تمت إضافة المحاضرة بنجاح');
}

async function deleteStudentFlow(id) {
    const choice = await showAtharChoice(
        "حذف طالب",
        "حدد طريقة الحذف لهذا الطالب:",
        [
            { id: 'soft', text: "🗑️ حذف مؤقت (إخفاء فقط)" },
            { id: 'hard', text: "❌ حذف نهائي (مسح البيانات للأبد)" }
        ]
    );

    if (!choice) return;

    const studentIndex = state.students.findIndex(s => s.id === id);
    if (studentIndex !== -1) {
        if (choice === 'soft') {
            state.students[studentIndex].deleted = true;
            showAtharNotification("تم إخفاء الطالب بنجاح");
        } else if (choice === 'hard') {
            // Hard delete: wipe personal data but keep the array slot to preserve indices
            state.students[studentIndex] = {
                id: id,
                isHardDeleted: true,
                deleted: true,
                name: "محذوف",
                phone: "",
                progress: {}
            };
            showAtharNotification("تم حذف بيانات الطالب نهائياً");
        }

        saveData();
        renderTable();
    }
}

async function deleteLectureFlow(id) {
    const isConfirmed = await showAtharConfirm("حذف محاضرة", "هل أنت متأكد من حذف المحاضرة وجميع سجلات الحضور المرتبطة بها؟");
    if (!isConfirmed) return;

    state.lectures = state.lectures.filter(l => l.id !== id);
    state.students.forEach(s => { if (s.progress) delete s.progress[id]; });
    saveData();
    showAtharNotification("تم حذف المحاضرة بنجاح");
    renderTable();
}

function toggleStudentCheck(sId, lId) {
    const student = state.students.find(s => s.id === sId);
    if (student) {
        // إذا كان الطالب محضر مسبقاً، نلغي التحضير
        if (student.progress[lId]) {
            delete student.progress[lId];
        } else {
            // إذا لم يكن محضر، نسجل "تاريخ اللحظة الحالية" بدلاً من true
            student.progress[lId] = Date.now();
        }
        saveData();
        // إعادة رسم الجدول لتحديث الألوان إذا كنت تستخدم ألوان تعتمد على الحالة
        // لكن بما أن الـ Checkbox يعتمد على وجود قيمة، فالنظام سيعمل طبيعي
    }
}

// ملاحظة: تم نقل دوال calculateScore و getStudentTotalScore و cleanPhone و getInitials إلى utils.js لتبسيط الكود.
// ================= MESSAGING WITH BATCHES (FINAL UPDATED) =================
async function startMessagingFlow() {
    const msgText = document.getElementById('message-text').value;
    if (!msgText.trim()) { alert('الرجاء كتابة نص الرسالة.'); return; }
    if (state.lectures.length === 0) { alert('لا توجد محاضرات.'); return; }

    const latestLecIndex = state.lectures.length - 1;
    const latestLec = state.lectures[latestLecIndex];

    let filterChoice;
    let targetsRaw = [];

    if (state.userInfo.role === 'group_supervisor') {
        // --- 1. اختيار فئة المشرفين لمشرف المجموعة ---
        filterChoice = await showAtharChoice(
            "تحديد فئة المشرفين",
            "اختر فئة المشرفين حسب نسبة الإنجاز:",
            [
                { id: '1', text: "⭐ أعلى من 80%" },
                { id: '2', text: "📉 بين 60% و 80%" },
                { id: '3', text: "⚠ بين 40% و 60%" },
                { id: '4', text: "❗ بين 20% و 40%" },
                { id: '5', text: "❌ أقل من 20%" },
                { id: '6', text: "👥 إرسال للجميع" }
            ]
        );
        if (!filterChoice) return;

        // تجهيز قائمة المشرفين المفلترة
        for (const uid in state.allSupervisorsData) {
            const supData = state.allSupervisorsData[uid];
            if (!supData) continue;

            const students = Array.isArray(supData) ? supData : (supData.students || []);
            const activeStudents = students.filter(s => s && !s.deleted);

            let totalScore = 0;
            const lectures = state.lectures || [];
            activeStudents.forEach(s => {
                totalScore += getStudentTotalScore(s, lectures);
            });
            const avgScore = activeStudents.length > 0 ? Math.round(totalScore / activeStudents.length) : 0;

            let matches = false;
            switch (filterChoice) {
                case '1': matches = avgScore > 80; break;
                case '2': matches = avgScore <= 80 && avgScore > 60; break;
                case '3': matches = avgScore <= 60 && avgScore > 40; break;
                case '4': matches = avgScore <= 40 && avgScore > 20; break;
                case '5': matches = avgScore <= 20; break;
                case '6': matches = true; break;
            }

            if (matches) {
                if (supData.phone) {
                    targetsRaw.push({
                        id: uid,
                        name: supData.name || "مشرف",
                        phone: cleanPhone(supData.phone),
                        isSupervisor: true
                    });
                } else {
                    console.warn(`Supervisor ${uid} has no phone number`);
                }
            }
        }
    } else {
        // --- 1. اختيار الفئة للطلاب (مشرف المتابعة) ---
        filterChoice = await showAtharChoice(
            "تحديد الفئة",
            "حدد الفئة المستهدفة للإرسال:",
            [
                { id: '1', text: "🔴 الغياب الحقيقي (أسماء موجودة)" },
                { id: '2', text: "💬 رد ولم يختبر (الأصفر)" },
                { id: '3', text: "⚪ غير مسجل (الخانات الفارغة)" },
                { id: '4', text: "⚫ كل المتغيبين (1 و 2 و 3)" },
                { id: '5', text: "🟢 المختبرون فقط" },
                { id: '6', text: "🌐 الجميع (كل القائمة)" }
            ]
        );
        if (!filterChoice) return;

        // --- 2. تجهيز القائمة المفلترة للطلاب ---
        targetsRaw = state.students.filter(s => {
            if (s.deleted === true) return false;
            const p = s.progress[latestLec.id];
            const hasName = s.name && s.name.trim().length > 0;
            const isReplied = (p === 'replied');
            const isTested = (p && p !== 'replied');
            switch (filterChoice) {
                case '1': return !p && hasName;
                case '2': return isReplied;
                case '3': return !isTested && !hasName;
                case '4': return !isTested;
                case '5': return isTested;
                case '6': return true;
                default: return false;
            }
        });
    }

    if (targetsRaw.length === 0) {
        const entityName = state.userInfo.role === 'group_supervisor' ? 'مشرفين' : 'طلاب';
        showAtharNotification(`لا يوجد ${entityName} في هذه الفئة!`, 'info');
        return;
    }

    // --- 3. البحث بنقطة البداية ---
    const startSerialInput = await showAtharPrompt(
        "نقطة البداية",
        `القائمة المحددة تحتوي على (${targetsRaw.length}) مستلم.\nأدخل الترتيب الذي تريد البدء منه:`,
        "1"
    );

    if (startSerialInput === null) return;

    let startIdx = parseInt(startSerialInput) - 1;
    if (isNaN(startIdx) || startIdx < 0) startIdx = 0;
    if (startIdx >= targetsRaw.length) startIdx = 0;

    const targetObject = targetsRaw[startIdx];

    // تأكيد البدء
    const startConfirm = await showAtharConfirm(
        "بدء عملية الإرسال",
        `✅ تم تحديد نقطة البداية!\nالاسم: ${targetObject.name}\nالترتيب: #${startIdx + 1}\n\nهل تود البدء الآن؟`
    );
    if (!startConfirm) return;

    // --- 4. تجهيز القائمة النهائية والبدء ---
    let finalTargets = targetsRaw.slice(startIdx).map(t => ({
        name: t.name,
        phone: cleanPhone(t.phone)
    }));

    const BATCH_SIZE = 200;
    const totalBatches = Math.ceil(finalTargets.length / BATCH_SIZE);

    const btn = document.querySelector('.btn-whatsapp');
    const originalBtnText = btn.innerHTML;
    const includeName = false;

    // --- اكتشاف الجهاز ونوع الإرسال ---
    if (isMobileDevice()) {
        initMobileQueue(finalTargets, msgText, includeName, latestLecIndex, filterChoice);
        return;
    }

    try {
        let totalSentStudents = 0;
        let campaignCounted = false;

        for (let i = 0; i < totalBatches; i++) {
            const start = i * BATCH_SIZE;
            const end = start + BATCH_SIZE;
            const currentBatch = finalTargets.slice(start, end);

            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري إرسال دفعة ${i + 1} من ${totalBatches}...`;
            btn.disabled = true;

            const payload = {
                students: currentBatch,
                message: msgText,
                include_name: includeName
            };

            const response = await fetch('/api/send_whatsapp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (result.status === 'success') {
                totalSentStudents += result.count;

                if (typeof state.lectures[latestLecIndex].campaigns === 'undefined') {
                    state.lectures[latestLecIndex].campaigns = 0;
                }

                if (!campaignCounted && result.count > 0) {
                    state.lectures[latestLecIndex].campaigns += 1;
                    campaignCounted = true;
                    if (!state.lectures[latestLecIndex].msgCount) state.lectures[latestLecIndex].msgCount = 0;
                    state.lectures[latestLecIndex].msgCount += result.count;

                    // تحديث عداد المشرف
                    if (!state.userInfo.msgCount) state.userInfo.msgCount = 0;
                    state.userInfo.msgCount += result.count;

                    // تحديث عداد الأنواع (Detailed Tracking)
                    if (!state.userInfo.msgTypesCount) state.userInfo.msgTypesCount = {};
                    if (!state.userInfo.msgTypesCount[filterChoice]) state.userInfo.msgTypesCount[filterChoice] = 0;
                    state.userInfo.msgTypesCount[filterChoice] += result.count;

                    saveData();
                }

                if (i < totalBatches - 1) {
                    btn.innerHTML = originalBtnText;
                    btn.disabled = false;
                    const remaining = finalTargets.length - (end);
                    const continueBatch = await showAtharChoice(
                        "استكمال الإرسال",
                        `✅ تمت الدفعة ${i + 1}.\nتم إرسال ${result.count} رسالة.\nمتبقي ${remaining} طالب.`,
                        [
                            { id: 'yes', text: "استمر في الإرسال" },
                            { id: 'no', text: "توقف الآن" }
                        ]
                    );
                    if (continueBatch !== 'yes') break;
                }

            } else {
                showAtharNotification(`❌ خطأ: ` + result.message, 'error');
                break;
            }
        }

        if (totalSentStudents > 0) {
            showAtharNotification(`✅ انتهت العملية. تم الإرسال بنجاح إلى ${totalSentStudents} طالب نشط.`);
        } else {
            showAtharNotification(`⚠️ تنبيه: لم يتم إرسال أي رسائل. تأكد من فتح واتساب ويب ومسح الرمز المربع.`, 'warning');
        }

    } catch (error) {
        showAtharNotification('فشل الاتصال بالخادم.', 'error');
        console.error("Messaging Flow Error:", error);
    } finally {
        btn.innerHTML = originalBtnText;
        btn.disabled = false;
    }
}

// ================= MOBILE QUEUE LOGIC =================
let mobileQueueState = {
    sentCount: 0,
    filterChoice: null
};

function initMobileQueue(targets, msg, incName, lIdx, fChoice) {
    mobileQueueState = {
        targets: targets,
        messageText: msg,
        includeName: incName,
        currentIndex: 0,
        lecIndex: lIdx,
        sentCount: 0,
        filterChoice: fChoice
    };

    // إظهار البار العلوي في الواجهة
    const statusRow = document.getElementById('mobile-send-status');
    const totalCountElem = document.getElementById('mobile-total-count');
    const sentCountElem = document.getElementById('mobile-sent-count');

    if (statusRow) statusRow.style.display = 'block';
    if (totalCountElem) totalCountElem.innerText = targets.length;
    if (sentCountElem) sentCountElem.innerText = "0";

    renderQueueStep();
    document.getElementById('messaging-queue-modal').style.display = 'flex';
}

function renderQueueStep() {
    const student = mobileQueueState.targets[mobileQueueState.currentIndex];
    if (!student) {
        finishQueue();
        return;
    }

    // تحديث المودال
    document.getElementById('queue-student-name').innerText = student.name;
    document.getElementById('queue-student-phone').innerText = student.phone;
    document.getElementById('queue-avatar').innerText = getInitials(student.name);

    const progress = mobileQueueState.currentIndex + 1;
    const total = mobileQueueState.targets.length;
    document.getElementById('queue-progress-text').innerText = `${progress} / ${total}`;
    document.getElementById('queue-progress-bar').style.width = `${(progress / total) * 100}%`;
    document.getElementById('queue-status-badge').innerText = `طالب رقم ${progress}`;

    // إعداد زر الإرسال
    const sendBtn = document.getElementById('queue-send-btn');
    const nextBtn = document.getElementById('queue-next-btn');

    sendBtn.onclick = () => {
        const rawName = student.name.trim();
        const firstName = rawName.split(' ')[0] || "الطالب";

        let finalMsg = mobileQueueState.messageText;
        if (finalMsg.includes('{الاسم}')) {
            finalMsg = finalMsg.replace(/{الاسم}/g, firstName);
        } else if (mobileQueueState.includeName) {
            finalMsg = `${firstName}،\n${finalMsg}`;
        }

        const waLink = `https://wa.me/${student.phone}?text=${encodeURIComponent(finalMsg)}`;
        window.open(waLink, '_blank');

        // تحديث العدادات في فايربيز (للمحاكاة الذكية)
        updateFirebaseCounters();

        // الانتقال للتالي
        mobileQueueState.sentCount++;
        document.getElementById('mobile-sent-count').innerText = mobileQueueState.sentCount;
        mobileQueueState.currentIndex++;

        // إذا كان الإرسال التلقائي مفعلاً، سيتم استدعاء renderQueueStep تلقائياً عند العودة للنافذة
        // ولكن للتأكد من تحديث الواجهة فوراً:
        renderQueueStep();
    };

    nextBtn.onclick = () => {
        mobileQueueState.currentIndex++;
        renderQueueStep();
    };
}

// إضافة مستمع لتغيير حالة الصفحة (للإرسال التلقائي في الموبايل)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' &&
        mobileQueueState &&
        mobileQueueState.targets &&
        mobileQueueState.currentIndex < mobileQueueState.targets.length) {

        const autoSendCheckbox = document.getElementById('queue-auto-send');
        const modal = document.getElementById('messaging-queue-modal');

        if (autoSendCheckbox && autoSendCheckbox.checked && modal && modal.style.display === 'flex') {
            // انتظار ثانية واحدة ثم الضغط على زر الإرسال
            setTimeout(() => {
                const sendBtn = document.getElementById('queue-send-btn');
                if (sendBtn) {
                    sendBtn.click();
                }
            }, 1500);
        }
    }
});

function updateFirebaseCounters() {
    const lIdx = mobileQueueState.lecIndex;
    if (lIdx === null || !state.lectures[lIdx]) return;

    if (typeof state.lectures[lIdx].campaigns === 'undefined') state.lectures[lIdx].campaigns = 0;
    if (!state.lectures[lIdx].msgCount) state.lectures[lIdx].msgCount = 0;

    // زيادة العداد (واحد لكل ضغطة إرسال)
    state.lectures[lIdx].msgCount += 1;

    // زيادة عداد المشرف
    if (!state.userInfo.msgCount) state.userInfo.msgCount = 0;
    state.userInfo.msgCount += 1;

    // زيادة عداد الأنواع للموبايل
    const fChoice = mobileQueueState.filterChoice;
    if (fChoice) {
        if (!state.userInfo.msgTypesCount) state.userInfo.msgTypesCount = {};
        if (!state.userInfo.msgTypesCount[fChoice]) state.userInfo.msgTypesCount[fChoice] = 0;
        state.userInfo.msgTypesCount[fChoice] += 1;
    }

    // أول ضغطة في المجموعة تزيد عدد الحملات
    if (mobileQueueState.sentCount === 0) {
        state.lectures[lIdx].campaigns += 1;
    }

    saveData();
}

function finishQueue() {
    document.getElementById('messaging-queue-modal').style.display = 'none';
    showAtharNotification(`✅ انتهى الإرسال اليدوي. تم إرسال ${mobileQueueState.sentCount} رسالة.`);

    // إخفاء بار الحالة بعد فترة
    setTimeout(() => {
        const statusRow = document.getElementById('mobile-send-status');
        if (statusRow) statusRow.style.display = 'none';
    }, 5000);
}

function closeMessagingQueue() {
    showAtharConfirm("إغلاق الطابور", "هل أنت متأكد من إيقاف عملية الإرسال؟").then(res => {
        if (res) document.getElementById('messaging-queue-modal').style.display = 'none';
    });
}
// ================= SEARCH & SORT =================
function handleSearch() {
    const query = document.getElementById('searchInput').value.toLowerCase().trim();

    // الفلترة الأساسية: استبعاد المحذوفين
    let activeStudents = state.students.filter(s => !s.deleted);

    if (!query) {
        renderTable(activeStudents);
        return;
    }

    const filtered = activeStudents.filter(s =>
        s.name.toLowerCase().includes(query) || s.phone.includes(query)
    );
    renderTable(filtered);
}

let sortDirection = 1;
function sortStudents(criteria, lecId = null) {
    let listSort = [...state.students];

    if (criteria === 'name') {
        // === التعديل هنا ===
        // الترتيب بناءً على النسبة المئوية (Total Score)
        listSort.sort((a, b) => {
            const scoreA = getStudentTotalScore(a);
            const scoreB = getStudentTotalScore(b);

            // لو الدرجات متساوية، رتبهم أبجدياً عشان الشكل يكون منظم
            if (scoreA === scoreB) {
                return a.name.localeCompare(b.name, 'ar');
            }

            // الترتيب من الأعلى للأقل (تنازلي) مضروب في اتجاه الترتيب (عشان لو ضغط تاني يعكس)
            return (scoreB - scoreA) * sortDirection;
        });

    } else if (criteria === 'score') {
        // ترتيب "عدد" مرات الحضور (ده الزرار القديم اللي عليه علامة الرسم البياني)
        listSort.sort((a, b) => {
            const countA = Object.values(a.progress || {}).filter(v => v).length;
            const countB = Object.values(b.progress || {}).filter(v => v).length;
            return (countB - countA) * sortDirection;
        });

    } else if (criteria === 'lecture' && lecId) {
        // الترتيب حسب درجة محاضرة معينة
        const lecture = state.lectures.find(l => l.id === lecId);
        const ts = lecture ? lecture.timestamp : Date.now();

        listSort.sort((a, b) => {
            const scoreA = calculateScore(ts, a.progress[lecId]);
            const scoreB = calculateScore(ts, b.progress[lecId]);
            return (scoreB - scoreA) * sortDirection;
        });
    }

    sortDirection *= -1; // عكس الاتجاه للمرة القادمة (تصاعدي/تنازلي)
    renderTable(listSort);
}

// ================= EXCEL (STYLED) - FIXED =================
// ================= EXCEL (STYLED) - UPDATED =================
function exportToExcel() {
    if (typeof XLSX === 'undefined') { alert('المكتبة غير محملة'); return; }

    // 1. تصفية الطلاب: استبعاد المحذوفين
    const activeStudents = state.students.filter(s => !s.deleted);

    if (activeStudents.length === 0) { alert('لا يوجد طلاب لتصديرهم'); return; }

    const data = [];
    const header = ['#', 'اسم الطالب', 'رقم الهاتف'];
    state.lectures.forEach(l => header.push(l.title));
    header.push('النسبة');
    data.push(header);

    // 2. استخدام القائمة المفلترة (activeStudents) بدلاً من state.students
    activeStudents.forEach((s, i) => {
        const row = [i + 1, s.name, s.phone];
        let c = 0; // عداد الحضور الفعلي

        state.lectures.forEach(l => {
            const p = s.progress[l.id];

            if (p === 'replied') {
                row.push('💬');
            } else {
                row.push(p ? '✔' : '✖');
                if (p) c++;
            }
        });

        const pct = state.lectures.length > 0 ? Math.round((c / state.lectures.length) * 100) + '%' : '0%';
        row.push(pct);
        data.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wscols = [{ wch: 5 }, { wch: 30 }, { wch: 15 }];
    state.lectures.forEach(() => wscols.push({ wch: 12 }));
    wscols.push({ wch: 10 });
    ws['!cols'] = wscols;

    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const addr = XLSX.utils.encode_cell({ r: R, c: C });
            if (!ws[addr]) continue;

            ws[addr].s = {
                font: { name: "Arial", sz: 11 },
                alignment: { vertical: "center", horizontal: "center" },
                border: {
                    top: { style: "thin", color: { rgb: "CCCCCC" } },
                    bottom: { style: "thin", color: { rgb: "CCCCCC" } },
                    left: { style: "thin", color: { rgb: "CCCCCC" } },
                    right: { style: "thin", color: { rgb: "CCCCCC" } }
                }
            };

            if (R === 0) {
                ws[addr].s.fill = { fgColor: { rgb: "1A5D3A" } };
                ws[addr].s.font = { name: "Arial", sz: 12, bold: true, color: { rgb: "FFFFFF" } };
            } else {
                if (ws[addr].v === '✔') ws[addr].s.font.color = { rgb: "008000" };
                if (ws[addr].v === '✖') ws[addr].s.font.color = { rgb: "FF0000" };

                if (ws[addr].v === '💬') {
                    ws[addr].s.fill = { fgColor: { rgb: "FFF3CD" } };
                    ws[addr].s.font.color = { rgb: "F39C12" };
                }
            }
        }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "سجل المتابعة");
    XLSX.writeFile(wb, `Athar_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
// ================= THEME & NOTES =================
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

let currentEditingStudentId = null;
function openNotesModal(studentId) {
    const student = state.students.find(s => s.id === studentId);
    if (!student) return;

    currentEditingStudentId = studentId;

    // تعبئة البيانات الأساسية
    document.getElementById('modal-student-name').innerText = student.name;
    document.getElementById('modal-student-phone').innerText = student.phone;
    document.getElementById('modal-avatar').innerText = getInitials(student.name);
    document.getElementById('student-notes').value = student.notes || '';

    const historyContainer = document.getElementById('attendance-history');
    historyContainer.innerHTML = '';

    let chartLabels = [];
    let chartData = [];

    // التكرار على المحاضرات
    state.lectures.forEach((lec) => {
        const progressValue = student.progress[lec.id];
        const score = calculateScore(lec.timestamp, progressValue);

        let statusText = 'غائب';
        let statusClass = 'absent';
        let icon = '<i class="fa-solid fa-xmark"></i>';

        // تحديد النص في القائمة الجانبية
        if (progressValue) {
            statusClass = 'present';
            icon = '<i class="fa-solid fa-check"></i>';

            // نصوص الحالة بناءً على الدرجة
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

            // تلوين القائمة الجانبية بالأحمر للتأخيرات الطويلة
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

    // إعداد الرسم البياني
    const ctx = document.getElementById('performanceChart').getContext('2d');

    if (performanceChart) {
        performanceChart.destroy();
    }

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
                    if (val >= 90) return '#27ae60'; // أخضر (ممتاز)
                    if (val >= 40) return '#f39c12'; // برتقالي (خلال الأسبوع)
                    return '#e74c3c'; // أحمر (تأخير أسابيع)
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
            layout: {
                padding: { top: 20, right: 10, left: 10, bottom: 0 }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    min: 0,
                    grid: {
                        color: '#f0f0f0',
                        drawBorder: false
                    },
                    ticks: {
                        stepSize: 10,
                        font: { family: 'Cairo', size: 10, weight: 'bold' }, // تصغير الخط قليلاً ليسع الكلام
                        color: '#555',
                        // هنا تحويل الأرقام للنصوص الجديدة
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
                x: {
                    grid: { display: false },
                    ticks: { font: { family: 'Cairo' } }
                }
            },
            plugins: {
                tooltip: {
                    backgroundColor: '#1A5D3A',
                    titleFont: { family: 'Cairo' },
                    bodyFont: { family: 'Cairo' },
                    callbacks: {
                        label: function (context) {
                            const val = context.raw;
                            let status = '';
                            if (val === 100) status = 'تسليم يوم السبت (ممتاز)';
                            else if (val === 90) status = 'تسليم يوم الأحد';
                            else if (val >= 40) status = 'تسليم خلال الأسبوع';
                            else if (val === 30) status = 'تأخر أسبوعاً كاملاً';
                            else if (val === 20) status = 'تأخر أسبوعين';
                            else if (val === 10) status = 'تأخر أكثر من أسبوعين';
                            else status = 'لم يسلم (غائب)';
                            return `الحالة: ${status}`;
                        }
                    }
                },
                legend: { display: false }
            }
        }
    });

    document.getElementById('notes-modal').style.display = 'flex';
}
function closeNotesModal() {
    document.getElementById('notes-modal').style.display = 'none';
    currentEditingStudentId = null;
}

function saveStudentNotes() {
    if (!currentEditingStudentId) return;
    const idx = state.students.findIndex(s => s.id === currentEditingStudentId);
    if (idx !== -1) {
        state.students[idx].notes = document.getElementById('student-notes').value;
        saveData();
        closeNotesModal();
    }
}

window.onclick = function (e) {
    if (e.target == document.getElementById('notes-modal')) closeNotesModal();
}

function getReportFile() {
    // 1. تصفية الطلاب: استبعاد المحذوفين نهائياً من الحسابات
    const activeStudents = state.students.filter(s => !s.deleted);
    const totalActive = activeStudents.length;

    // 2. حساب من لم يرد على الترحيب (الطلاب الذين ليس لديهم اسم مسجل - خانات فارغة)
    // نعتبر أن الطالب الذي بدون اسم هو الذي لم يرد على الترحيب بعد
    const noWelcomeReplyCount = activeStudents.filter(s => s.name.trim().length === 0).length;

    const supervisorName = state.userInfo.name || "غير معروف";
    const groupName = state.groupInfo?.name || "غير محدد";
    const groupNumber = state.groupInfo?.number || "غير محدد";

    let reportText = `=== تقرير منصة أثر التعليمية ===

اسم المجموعة: ${groupName} (${groupNumber})
إجمالي الرسائل المرسلة: ${state.userInfo.msgCount || 0}
اسم المشرف: ${supervisorName}
تاريخ الاستخراج: ${new Date().toLocaleDateString('ar-EG')}

عدد الطلاب النشطين (العدد الفعلي): ${totalActive}

⚠️ طلبة لم ترد علي رسالة الترحيب (بدون اسم): ${noWelcomeReplyCount}

----------------------------------------\n`;

    reportText += `📊 تفاصيل المحاضرات:
----------------------------------------\n`;

    state.lectures.forEach((lec, index) => {
        // جميع الحسابات هنا تتم على activeStudents فقط

        // 1. ✅ المختبرون (حضور)
        const presentCount = activeStudents.filter(s => s.progress[lec.id] && s.progress[lec.id] !== 'replied').length;

        // 2. 💬 رد ولم يختبر
        const repliedCount = activeStudents.filter(s => s.progress[lec.id] === 'replied').length;

        // 3. ❌ لم يرد ولم يختبر (غياب حقيقي - أسماء موجودة)
        // الشرط: ليس لديه بروجرس + لديه اسم
        const realAbsentCount = activeStudents.filter(s =>
            !s.progress[lec.id] && s.name.trim().length > 0
        ).length;

        // حساب النسبة المئوية بناءً على العدد النشط
        const attendancePct = totalActive > 0 ? Math.round((presentCount / totalActive) * 100) : 0;

        reportText += `
${index + 1}. محاضرة: ${lec.title}

   ✅ المختبرون: ${presentCount}
   💬 رد ولم يختبر: ${repliedCount}
   ❌ غياب (لم يرد ولم يختبر): ${realAbsentCount}

   📊 نسبة الحضور الفعلي: ${attendancePct}%

----------------------------------------`
    });

    reportText += `\n
📈 ملخص عام:
----------------------------------------
• إجمالي المحاضرات: ${state.lectures.length}

تم استخراج هذا التقرير آلياً.`;

    const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Athar_Report_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ================= BACKUP & RESTORE =================
function backupData() {
    // نجمع كل البيانات المهمة
    const backup = {
        students: state.students,
        lectures: state.lectures,
        settings: state.settings,
        habits: JSON.parse(localStorage.getItem('Athar_habits_data') || '[]'), // لو عايز تحفظ العادات كمان
        date: new Date().toISOString()
    };

    const dataStr = JSON.stringify(backup, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    // إنشاء رابط تحميل وهمي والضغط عليه
    const a = document.createElement('a');
    a.href = url;
    a.download = `Athar_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function restoreData(input) {
    const file = input.files[0];
    if (!file) return;

    const isConfirmed = await showAtharConfirm("استرجاع البيانات", "تحذير: استرجاع النسخة سيحذف البيانات الحالية ويستبدلها بالنسخة. هل أنت متأكد؟");
    if (!isConfirmed) {
        input.value = ''; // تفريغ الملف
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);

            // التحقق من صحة الملف
            if (data.students && data.lectures) {
                // استرجاع البيانات الأساسية
                state.students = data.students;
                state.lectures = data.lectures;
                if (data.settings) state.settings = data.settings;

                saveData(); // حفظ في LocalStorage

                // استرجاع بيانات العادات (لو موجودة)
                if (data.habits) {
                    localStorage.setItem('Athar_habits_data', JSON.stringify(data.habits));
                }

                showAtharNotification("✅ تم استرجاع البيانات بنجاح!");
                setTimeout(() => location.reload(), 1500); // إمهال ثانية ليرى المستخدم الإشعار
            } else {
                showAtharNotification("❌ ملف غير صالح.", 'error');
            }
        } catch (err) {
            showAtharNotification("❌ حدث خطأ أثناء قراءة الملف: " + err, 'error');
        }
    };
    reader.readAsText(file);
}

// ================= CONTEXT MENU LOGIC =================
let contextTarget = { sId: null, lId: null };

function showContextMenu(e, sId, lId) {
    e.preventDefault(); // منع قائمة المتصفح الافتراضية
    contextTarget = { sId, lId };

    const menu = document.getElementById('context-menu');

    // حساب موقع الماوس
    let x = e.clientX;
    let y = e.clientY;

    // التأكد من أن القائمة لا تخرج خارج الشاشة
    if (x + 200 > window.innerWidth) x -= 200;

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.display = 'block';
}

function manualStatus(days) {
    const { sId, lId } = contextTarget;
    if (!sId || !lId) return;

    const student = state.students.find(s => s.id === sId);

    if (student) {
        if (days === -1) {
            // حذف (غياب)
            delete student.progress[lId];
        } else if (days === 'replied') {
            // --- التعديل الجديد: حالة رد ولم يختبر ---
            student.progress[lId] = 'replied';
        } else {
            // حساب التاريخ للأيام العادية
            const lecture = state.lectures.find(l => l.id === lId);
            if (lecture) {
                const targetDate = lecture.timestamp + (days * 24 * 60 * 60 * 1000) + (10 * 60 * 1000);
                student.progress[lId] = targetDate;
            }
        }
        saveData();
    }
    hideContextMenu();
}

function hideContextMenu() {
    document.getElementById('context-menu').style.display = 'none';
    contextTarget = { sId: null, lId: null };
}

// إغلاق القائمة عند الضغط في أي مكان
document.addEventListener('click', hideContextMenu);
// إغلاق القائمة عند عمل سكرول
document.addEventListener('scroll', hideContextMenu);

// ملاحظة: الدوال المساعدة getInitials و cleanPhone تم نقلها إلى utils.js.

/**
 * بدء تشغيل التطبيق عند تحميل المستند
 */
document.addEventListener('DOMContentLoaded', init);

// ============================================================
// 6. التصدير والشهادات (EXPORT & CERTIFICATES)
// ============================================================
// ================= CERTIFICATE GENERATION (DYNAMIC SETTINGS) =================
window.app.downloadCert = function (studentName, lectureCount) {
    const certSettings = state.settings.certificate || {
        template: 'static/certificate_template.jpg',
        name: { x: 530, y: 660, show: true },
        date: { x: 536, y: 1126, show: true },
        lecture: { x: 1072, y: 1019, show: false }
    };

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.src = certSettings.template;

    img.onload = function () {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        // 1. اسم الطالب
        if (certSettings.name.show) {
            const nameFontSize = Math.floor(canvas.width * 0.030);
            ctx.font = `bold ${nameFontSize}px Cairo`;
            ctx.fillStyle = '#000000';
            ctx.textAlign = 'center';
            ctx.fillText(studentName, certSettings.name.x, certSettings.name.y);
        }

        // 2. التاريخ
        if (certSettings.date.show) {
            const infoFontSize = Math.floor(canvas.width * 0.025);
            ctx.font = `bold ${infoFontSize}px Cairo`;
            ctx.fillStyle = '#000000';
            const dateString = new Date().toLocaleDateString('ar-EG');
            ctx.fillText(dateString, certSettings.date.x, certSettings.date.y);
        }

        // 3. رقم المحاضرة
        if (certSettings.lecture.show) {
            const infoFontSize = Math.floor(canvas.width * 0.025);
            ctx.font = `bold ${infoFontSize}px Cairo`;
            ctx.fillStyle = '#000000';
            ctx.fillText(`${lectureCount}`, certSettings.lecture.x, certSettings.lecture.y);
        }

        const link = document.createElement('a');
        link.download = `شهادة_تقدير_${studentName}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    };

    img.onerror = function () {
        alert("فشل تحميل قالب الشهادة. يرجى التأكد من الصورة في الإعدادات.");
    };
};

// ================= BATCH PDF GENERATION (DYNAMIC SETTINGS) =================
window.app.downloadLecturePDF = function (lecId, lecTitle) {
    if (!window.jspdf) {
        alert("مكتبة PDF غير محملة!");
        return;
    }

    const certSettings = state.settings.certificate || {
        template: 'static/certificate_template.jpg',
        name: { x: 530, y: 660, show: true },
        date: { x: 536, y: 1126, show: true },
        lecture: { x: 1072, y: 1019, show: false }
    };

    const attendees = state.students.filter(s => s.progress[lecId] && s.progress[lecId] !== 'replied');

    if (attendees.length === 0) {
        alert("لا يوجد حضور مسجل لهذه المحاضرة.");
        return;
    }

    if (!confirm(`سيتم استخراج ملف PDF لـ ${attendees.length} طالب.\nهل تريد الاستمرار؟`)) return;

    const { jsPDF } = window.jspdf;
    const img = new Image();
    img.src = certSettings.template;

    img.onload = function () {
        const dateString = new Date().toLocaleDateString('ar-EG');
        const doc = new jsPDF({
            orientation: 'landscape',
            unit: 'px',
            format: [img.width, img.height]
        });

        attendees.forEach((student, index) => {
            if (index > 0) doc.addPage([img.width, img.height], 'landscape');

            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');

            ctx.drawImage(img, 0, 0);

            // 1. اسم الطالب
            if (certSettings.name.show) {
                const nameFontSize = Math.floor(canvas.width * 0.030);
                ctx.font = `bold ${nameFontSize}px Cairo, sans-serif`;
                ctx.fillStyle = '#000000';
                ctx.textAlign = 'center';
                ctx.fillText(student.name, certSettings.name.x, certSettings.name.y);
            }

            // 2. التاريخ
            if (certSettings.date.show) {
                const infoFontSize = Math.floor(canvas.width * 0.025);
                ctx.font = `bold ${infoFontSize}px Cairo, sans-serif`;
                ctx.fillStyle = '#000000';
                ctx.fillText(dateString, certSettings.date.x, certSettings.date.y);
            }

            // 3. المحاضرة
            if (certSettings.lecture.show) {
                const infoFontSize = Math.floor(canvas.width * 0.025);
                ctx.font = `bold ${infoFontSize}px Cairo, sans-serif`;
                ctx.fillStyle = '#000000';
                ctx.fillText(lecTitle, certSettings.lecture.x, certSettings.lecture.y);
            }

            const dataURL = canvas.toDataURL('image/jpeg', 0.8);
            doc.addImage(dataURL, 'JPEG', 0, 0, img.width, img.height);
        });

        doc.save(`شهادات_حضور_${lecTitle}.pdf`);
    };
};
// ================= BULK IMPORT & EDIT LOGIC =================

// دالة معالجة الاستيراد الذكي (أرقام أو أسماء)
function processBulkImport() {
    const rawText = document.getElementById('import-text').value;
    if (!rawText.trim()) return;

    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l);
    if (lines.length === 0) return;

    if (!confirm(`سيتم استيراد ${lines.length} سجل. هل أنت متأكد؟`)) return;

    let added = 0;
    lines.forEach((line, idx) => {
        // التحقق: هل المدخل رقم هاتف أم اسم؟
        // إذا كان يحتوي على أرقام فقط ويعتبر طويلاً، نعتبره هاتفاً
        const isPhone = /^[0-9+\-\s()]{8,}$/.test(line);

        let newName = '';
        let newPhone = '';

        if (isPhone) {
            newPhone = cleanPhone(line);
            newName = ' '; // اسم مؤقت (مسافة واحدة)
        } else {
            newName = line;
            newPhone = ''; // بدون رقم حالياً
        }

        // منع التكرار (نتحقق بالرقم لو موجود، أو بالاسم لو كان اسماً حقيقياً وليس مسافة)
        const exists = state.students.some(s => {
            if (newPhone && s.phone === newPhone) return true;
            if (newName.trim() !== '' && s.name === newName) return true;
            return false;
        });

        if (!exists) {
            state.students.push({
                id: Date.now() + idx, // ID فريد
                name: newName,
                phone: newPhone,
                progress: {},
                notes: ''
            });
            added++;
        }
    });

    saveData();
    window.app.closeImport();
    document.getElementById('import-text').value = ''; // تنظيف الخانة
    alert(`✅ تم إضافة ${added} طالب جديد.`);
}

// فتح نافذة التعديل
function openEditStudentModal(id) {
    const student = state.students.find(s => s.id === id);
    if (!student) return;

    document.getElementById('edit-id').value = id;
    document.getElementById('edit-name').value = student.name;
    const phoneInput = document.getElementById('edit-phone');
    phoneInput.value = student.phone || "";

    if (!phoneInput.iti && window.intlTelInput) {
        phoneInput.iti = window.intlTelInput(phoneInput, {
            initialCountry: "eg",
            preferredCountries: ["eg", "sa", "ae", "kw", "qa"],
            separateDialCode: true,
            utilsScript: "https://cdn.jsdelivr.net/npm/intl-tel-input@23.0.11/build/js/utils.js"
        });
    }

    document.getElementById('edit-student-modal').style.display = 'flex';
}

// حفظ التعديل
function saveStudentDataEdit() {
    const id = parseFloat(document.getElementById('edit-id').value); // تحويل لرقم
    const newName = document.getElementById('edit-name').value;
    const phoneInput = document.getElementById('edit-phone');
    const newPhoneRaw = phoneInput.value;
    const newPhone = phoneInput.iti ? (phoneInput.iti.getNumber() || newPhoneRaw) : newPhoneRaw;

    if (!newName) { alert('الاسم مطلوب'); return; }

    const idx = state.students.findIndex(s => s.id === id);
    if (idx !== -1) {
        state.students[idx].name = newName;
        state.students[idx].phone = cleanPhone(newPhone);
        saveData();
        document.getElementById('edit-student-modal').style.display = 'none';
    }
}

// دالة الحذف الكامل (في آخر الملف)
function wipeAllData() {
    const role = state.userInfo.role;

    // مشرف المجموعة لا يمكنه التصفير (زيادة أمان)
    if (role === 'group_supervisor') {
        showAtharNotification("عذراً، هذه الخاصية غير متاحة لمشرف المجموعة", "error");
        return;
    }

    const msg = "تحذير: هذا سيحذف جميع الطلاب المسجلين لديك فقط!\\nللتأكيد اكتب: delete";
    const code = prompt(msg);

    if (code === 'delete') {
        state.students = [];
        // لا نحذف المحاضرات لأنها مشتركة مع المجموعة
        saveData();
        renderDashboard();
        showAtharNotification("🚀 تم تصفير قائمة طلابك بنجاح!");
    }
}

// ================= RESET MESSAGES COUNT =================
function resetMessageCounts() {
    // التأكد أولاً
    if (!confirm("هل أنت متأكد من تصفير عداد الرسائل لجميع المحاضرات؟\nلا يمكن التراجع عن هذه الخطوة.")) return;

    // تصفير العداد لكل محاضرة
    state.lectures.forEach(lec => {
        lec.msgCount = 0;
    });

    saveData(); // حفظ التغييرات
    alert("✅ تم تصفير عداد الرسائل بنجاح لجميع المحاضرات.");
}

// دالة مساعدة لإدراج النص مكان المؤشر
function insertVariable(text) {
    const textarea = document.getElementById('message-text');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    // إدراج النص في مكان المؤشر
    const value = textarea.value;
    textarea.value = value.substring(0, start) + text + value.substring(end);

    // إعادة التركيز وتحديث مكان المؤشر
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    textarea.focus();
}

// ================= SIDE MENU TOGGLE =================
function toggleSideMenu() {
    const menu = document.getElementById('main-menu');
    const overlay = document.getElementById('menu-overlay');

    // تبديل الكلاس active
    menu.classList.toggle('active');
    overlay.classList.toggle('active');
}

// ================= MOBILE MENU LOGIC =================
function toggleMobileMenu() {
    const menu = document.getElementById('main-menu');
    const overlay = document.getElementById('menu-overlay');

    // التحقق من وجود الكلاس active
    if (menu.classList.contains('active')) {
        menu.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
    } else {
        menu.classList.add('active');
        if (overlay) overlay.classList.add('active');
    }
}

// إغلاق القائمة عند اختيار أي عنصر منها (لتحسين التجربة) - باستخدام تفويض الأحداث
const mainMenuElement = document.getElementById('main-menu');
if (mainMenuElement) {
    mainMenuElement.addEventListener('click', (e) => {
        if (window.innerWidth <= 768) {
            const clickable = e.target.closest('a, button');
            if (clickable) {
                // لا نغلق القائمة إذا كان الزر هو زر إغلاق القائمة (تم التعامل معه) 
                // أو إذا كان زر فتح القائمة المنسدلة
                if (!clickable.classList.contains('close-menu-btn') && !clickable.classList.contains('dropbtn')) {
                    // نغلق القائمة
                    if (mainMenuElement.classList.contains('active')) {
                        toggleMobileMenu();
                    }
                }
            }
        }
    });
}


// اجعل دالة الإدراج مرئية لزرار الـ HTML
window.insertVariable = insertVariable;

// ================= MOBILE MENU FIX (إصلاح القائمة الجانبية) =================

// ربط الدالة بـ window.app عشان الزرار يشوفها
window.app.toggleMenu = toggleMobileMenu;

// ================= CERTIFICATE SETTINGS HANDLERS =================
window.app.openCertSettings = function () {
    const cert = state.settings.certificate || {
        name: { x: 530, y: 660, show: true },
        date: { x: 536, y: 1126, show: true },
        lecture: { x: 1072, y: 1019, show: false }
    };

    document.getElementById('cert-name-x').value = cert.name.x;
    document.getElementById('cert-name-y').value = cert.name.y;
    document.getElementById('cert-name-show').checked = cert.name.show;

    document.getElementById('cert-date-x').value = cert.date.x;
    document.getElementById('cert-date-y').value = cert.date.y;
    document.getElementById('cert-date-show').checked = cert.date.show;

    document.getElementById('cert-lec-x').value = cert.lecture.x;
    document.getElementById('cert-lec-y').value = cert.lecture.y;
    document.getElementById('cert-lec-show').checked = cert.lecture.show;

    document.getElementById('cert-settings-modal').style.display = 'flex';
};

window.app.closeCertSettings = function () {
    document.getElementById('cert-settings-modal').style.display = 'none';
};

window.app.handleCertTemplateUpload = function (input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        if (!state.settings.certificate) state.settings.certificate = {};
        state.settings.certificate.template = e.target.result;
        showAtharNotification("✅ تم تحميل قالب الشهادة الجديد!");
    };
    reader.readAsDataURL(file);
};

window.app.saveCertSettings = function () {
    state.settings.certificate.name = {
        x: parseInt(document.getElementById('cert-name-x').value),
        y: parseInt(document.getElementById('cert-name-y').value),
        show: document.getElementById('cert-name-show').checked
    };
    state.settings.certificate.date = {
        x: parseInt(document.getElementById('cert-date-x').value),
        y: parseInt(document.getElementById('cert-date-y').value),
        show: document.getElementById('cert-date-show').checked
    };
    state.settings.certificate.lecture = {
        x: parseInt(document.getElementById('cert-lec-x').value),
        y: parseInt(document.getElementById('cert-lec-y').value),
        show: document.getElementById('cert-lec-show').checked
    };

    saveData();
    window.app.closeCertSettings();
    showAtharNotification("✅ تم حفظ إعدادات الشهادة بنجاح!");
};

async function showSupervisorFullReport(e, uid) {
    if (e && e.preventDefault) e.preventDefault();

    const supData = state.allSupervisorsData[uid];
    if (!supData) return;

    let supervisorName = supData.name;
    const students = Array.isArray(supData) ? supData : (supData.students || []);

    if (!supervisorName || supervisorName.trim() === "") {
        try {
            const userRef = ref(db, `users/${uid}`);
            const userSnapshot = await get(userRef);
            supervisorName = userSnapshot.exists() ? userSnapshot.val().name : `مشرف (${uid.substr(0, 5)}...)`;
        } catch (err) {
            console.warn("Permission denied for individual report name fetching", err);
            supervisorName = `مشرف (${uid.substr(0, 5)}...)`;
        }
    }
    const activeStudents = students.filter(s => !s.deleted);
    const totalActive = activeStudents.length;
    const msgCountGlobal = supData.msgCount || 0;

    const groupName = state.groupInfo?.name || "غير محدد";
    const groupNumber = state.groupInfo?.number || "غير محدد";

    let reportText = `=== تقرير مشرف متابعة: ${supervisorName} ===\n`;
    reportText += `المجموعة: ${groupName} (${groupNumber})\n`;
    reportText += `إجمالي الرسائل المرسلة: ${msgCountGlobal}\n`;
    reportText += `تاريخ الاستخراج: ${new Date().toLocaleDateString('ar-EG')}\n`;
    reportText += `عدد الطلاب النشطين: ${totalActive}\n`;
    reportText += `----------------------------------------\n\n`;

    state.lectures.forEach((lec, index) => {
        const presentCount = activeStudents.filter(s => {
            if (!s.progress) s.progress = {};
            return s.progress[lec.id] && s.progress[lec.id] !== 'replied';
        }).length;

        const repliedCount = activeStudents.filter(s => {
            if (!s.progress) s.progress = {};
            return s.progress[lec.id] === 'replied';
        }).length;

        const realAbsentCount = activeStudents.filter(s => {
            if (!s.progress) s.progress = {};
            return !s.progress[lec.id] && s.name && s.name.trim().length > 0;
        }).length;

        const attendancePct = totalActive > 0 ? Math.round((presentCount / totalActive) * 100) : 0;

        reportText += `${index + 1}. محاضرة: ${lec.title}\n`;
        reportText += `   ✅ الحضور (المختبرون): ${presentCount}\n`;
        reportText += `   💬 رد ولم يختبر: ${repliedCount}\n`;
        reportText += `   ❌ غياب: ${realAbsentCount}\n`;
        reportText += `   📊 النسبة: ${attendancePct}%\n`;
        reportText += `----------------------------------------\n`;
    });

    document.getElementById('sup-report-title').innerText = `تقرير المشرف: ${supervisorName}`;
    document.getElementById('sup-report-text').value = reportText;

    const downloadBtn = document.getElementById('download-sup-report-btn');
    downloadBtn.onclick = () => {
        const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `Report_${supervisorName}_${new Date().toISOString().slice(0, 10)}.txt`;
        link.click();
    };

    document.getElementById('supervisor-report-modal').style.display = 'flex';
}

window.app.toggleMenu = function () {
    const menu = document.getElementById('main-menu');
    const overlay = document.getElementById('menu-overlay');
    if (menu) menu.classList.toggle('active');
    if (overlay) overlay.classList.toggle('active');
};

// كود التعامل مع الضغط المطول للموبايل
let longPressTimer;
window.app.handleLongPressFull = function (e, uid) {
    // نمنع اهتزاز الموبايل أو القائمة الافتراضية
    longPressTimer = setTimeout(() => {
        window.app.showSupervisorFullReport(e, uid);
    }, 600); // 600ms للضغطة المطولة
};

window.app.handleLongPressMsg = function (e, uid) {
    longPressTimer = setTimeout(() => {
        window.app.showSupervisorMsgTypes(e, uid);
    }, 600);
};

window.app.clearLongPress = function () {
    clearTimeout(longPressTimer);
};

// إضافة مستمع لحركة اللمس لإلغاء الضغطة المطولة إذا تحرك الإصبع (سكرول)
document.addEventListener('touchmove', () => {
    window.app.clearLongPress();
}, { passive: true });

// ================= NEW FUNCTIONS (MULTI-GROUP & DETAILED REPORTS) =================

async function createNewGroup() {
    if (state.userInfo.role !== 'group_supervisor') return;

    const name = await showAtharPrompt("إضافة مجموعة جديدة", "أدخل اسم المجموعة الجديدة:");
    if (!name) return;

    const number = await showAtharPrompt("إضافة مجموعة جديدة", "أدخل رقم المجموعة:");
    if (!number) return;

    const totalLectures = await showAtharPrompt("إضافة مجموعة جديدة", "عدد محاضرات الدورة:", "12");

    // توليد آي دي جديد
    const cleanName = name.trim().replace(/\s+/g, '-').substring(0, 10);
    const newGroupId = `${cleanName}-${number}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

    try {
        showAtharNotification("جاري إنشاء المجموعة ونسخ الإعدادات...", "info");

        // 1. إنشاء بيانات المجموعة الجديدة (مع نسخ الإعدادات من المجموعة الحالية)
        const newGroupRef = ref(db, `athar_groups/${newGroupId}`);
        await set(child(newGroupRef, 'info'), {
            name: name,
            number: number,
            totalLectures: parseInt(totalLectures),
            adminUid: currentUser.uid,
            createdAt: Date.now()
        });

        await set(child(newGroupRef, 'data/settings'), {
            ...state.settings,
            totalPlannedLectures: parseInt(totalLectures)
        });

        // 2. تحديث قائمة مجموعات المستخدم
        const userRef = ref(db, `users/${currentUser.uid}`);
        const snapshot = await get(userRef);
        const userData = snapshot.val();

        let groups = userData.groups || [];
        // إضافة المجموعة الحالية للقائمة لو لم تكن موجودة
        if (userData.groupId && !groups.includes(userData.groupId)) {
            groups.push(userData.groupId);
        }
        if (!groups.includes(newGroupId)) {
            groups.push(newGroupId);
        }

        await update(userRef, {
            groups: groups,
            activeGroupId: newGroupId, // اجعلها المجموعة النشطة فوراً
            groupId: userData.groupId || newGroupId // للحفاظ على التوافق مع الكود القديم
        });

        showAtharNotification(`تم إنشاء المجموعة بنجاح! كود المجموعة: ${newGroupId}`);
        setTimeout(() => location.reload(), 2000);
    } catch (error) {
        showAtharNotification("خطأ في إنشاء المجموعة: " + error.message, "error");
    }
}

async function deleteCurrentGroupFlow() {
    if (!currentUser || !currentGroup) return;
    if (state.userInfo.role !== 'group_supervisor') {
        showAtharNotification("عذراً، هذا الإجراء مسموح به لمشرفي المجموعة فقط", "error");
        return;
    }

    const groupId = currentGroup.id;
    const groupName = state.groupInfo?.name || groupId;

    const confirm1 = await showAtharConfirm(
        "حذف المجموعة نهائياً",
        `⚠️ تحذير: أنت على وشك حذف المجموعة (${groupName}) بشكل نهائي!\n\nسيتم مسح كافة الطلاب، المحاضرات، والبيانات المرتبطة بها.\nهل أنت متأكد تماماً؟`
    );
    if (!confirm1) return;

    const confirm2 = await showAtharPrompt(
        "تأكيد أخير",
        `لحذف المجموعة، يرجى كتابة اسم المجموعة (${groupName}) في الخانة أدناه:`,
        ""
    );

    if (!confirm2 || confirm2.trim() !== groupName.trim()) {
        showAtharNotification("الاسم غير مطابق، تم إلغاء عملية الحذف", "warning");
        return;
    }

    let loader;
    try {
        loader = document.createElement('div');
        loader.id = 'firebase-loader';
        loader.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,0.9);z-index:9999;display:flex;justify-content:center;align-items:center;font-size:20px;font-weight:bold;color:#1A5D3A;";
        loader.innerHTML = '<i class="fa-solid fa-cloud-arrow-up fa-bounce"></i>&nbsp; جاري حذف المجموعة...';
        document.body.appendChild(loader);

        // 1. مسح المجموعة من قائمة المجموعات الخاصة بالمستخدم (صاحب المجموعة)
        const userRef = ref(db, `users/${currentUser.uid}`);
        const userSnap = await get(userRef);
        if (userSnap.exists()) {
            const userData = userSnap.val();
            let groups = userData.groups || [];
            groups = groups.filter(gid => gid !== groupId);

            const updates = { groups: groups };
            // إذا كانت هي المجموعة النشطة، نغيرها
            if (userData.activeGroupId === groupId) {
                updates.activeGroupId = groups.length > 0 ? groups[0] : "";
            }
            await update(userRef, updates);
        }

        // 2. مسح بيانات المجموعة نفسها من Firebase
        await remove(ref(db, `athar_groups/${groupId}`));

        showAtharNotification("تم حذف المجموعة وكافة بياناتها بنجاح");

        setTimeout(() => {
            if (loader && loader.parentNode) loader.parentNode.removeChild(loader); // Remove loader before reload
            if (state.userInfo.groups && state.userInfo.groups.length > 1) {
                location.reload(); // سيعيد التحميل وتفتح أول مجموعة في القائمة
            } else {
                window.location.href = window.location.origin + window.location.pathname; // يعيد للرئيسية (Join/Create)
            }
        }, 2000);

    } catch (error) {
        if (loader && loader.parentNode) loader.parentNode.removeChild(loader);
        console.error("Delete Group Error:", error);
        showAtharNotification("خطأ أثناء حذف المجموعة: " + error.message, "error");
    }
}

async function switchGroup() {
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

    // جلب أسماء المجموعات لعرضها
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
        setTimeout(() => location.reload(), 1000);
    } catch (error) {
        showAtharNotification("خطأ في التبديل: " + error.message, "error");
    }
}

async function showSupervisorMsgTypes(e, uid) {
    if (e && e.preventDefault) e.preventDefault();

    const supData = state.allSupervisorsData[uid];
    if (!supData) return;

    let supervisorName = supData.name || "المشرف";
    const msgTypesCount = supData.msgTypesCount || {};

    const typeLabels = {
        '1': "🔴 الغياب الحقيقي (أسماء موجودة)",
        '2': "💬 رد ولم يختبر (الأصفر)",
        '3': "⚪ غير مسجل (الخانات الفارغة)",
        '4': "⚫ كل المتغيبين (1 و 2 و 3)",
        '5': "🟢 المختبرون فقط",
        '6': "🌐 الجميع (كل القائمة)"
    };

    let html = '';
    let total = 0;

    for (const [id, label] of Object.entries(typeLabels)) {
        const count = msgTypesCount[id] || 0;
        total += count;
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
                <span style="font-weight: 600; color: #374151;">${label}</span>
                <span style="background: var(--primary-green); color: white; padding: 2px 10px; border-radius: 20px; font-weight: bold;">${count}</span>
            </div>
        `;
    }

    html += `
        <div style="margin-top: 15px; padding-top: 15px; border-top: 2px dashed #e5e7eb; display: flex; justify-content: space-between; font-weight: bold; font-size: 1.1rem; color: var(--primary-green);">
            <span>الإجمالي:</span>
            <span>${total} رسالة</span>
        </div>
    `;

    document.getElementById('msg-details-title').innerText = `إحصائيات رسائل: ${supervisorName}`;
    document.getElementById('msg-details-container').innerHTML = html;
    document.getElementById('msg-details-modal').style.display = 'flex';
}

// انطلاق التطبيق
// ملاحظة: يتم الاستدعاء عبر المستمع DOMContentLoaded المذكور سابقاً

// تم نقل showAtharNotification و editSupervisorName إلى utils.js أو بداخل app.js بتنسيق أفضل وموثق.

/**
 * ميزة تسليم الطلاب لمشرف آخر
 */
async function initiateStudentTransfer() {
    if (!currentUser || !currentGroup) return;
    if (!state.students || state.students.filter(s => !s.deleted).length === 0) {
        showAtharNotification("لا يوجد طلاب نشطين لتسليمهم!", "warning");
        return;
    }

    const recipientPhoneRaw = await showAtharPrompt(
        "تسليم الطلاب",
        "أدخل رقم واتساب المشرف الذي سيتسلم طلابك (يجب أن يكون صحيحاً جداً):",
        ""
    );
    if (!recipientPhoneRaw) return;

    const recipientPhone = cleanPhone(recipientPhoneRaw);
    if (!recipientPhone) {
        showAtharNotification("رقم الهاتف غير صحيح!", "error");
        return;
    }

    const confirm = await showAtharConfirm(
        "تأكيد التسليم",
        `أنت على وشك إرسال طلب تسليم (${state.students.filter(s => !s.deleted).length}) طالب إلى المشرف صاحب الرقم (${recipientPhone}).\n\nلن يتم حذفهم من عندك إلا بعد قيامه بالقبول.\nهل تود الاستمرار؟`
    );
    if (!confirm) return;

    try {
        const transferRef = push(ref(db, `athar_groups/${currentGroup.id}/transfers`));
        await set(transferRef, {
            senderUid: currentUser.uid,
            senderName: state.userInfo.name || "مشرف مجهول",
            recipientPhone: recipientPhone,
            students: state.students.filter(s => !s.deleted),
            status: 'pending',
            timestamp: Date.now()
        });

        showAtharNotification("تم إرسال طلب التسليم بنجاح. بمجرد قبول المشرف الآخر ستختفي القائمة من عندك.");
    } catch (error) {
        console.error("Transfer error:", error);
        showAtharNotification("خطأ أثناء إرسال الطلب: " + error.message, "error");
    }
}

async function checkPendingTransfers() {
    if (!currentUser || !currentGroup) return;

    try {
        const transfersRef = ref(db, `athar_groups/${currentGroup.id}/transfers`);
        const snapshot = await get(transfersRef);
        if (!snapshot.exists()) return;

        const transfers = snapshot.val();
        
        let myPhone = state.userInfo.phone ? cleanPhone(state.userInfo.phone) : null;

        // دالة مساعدة لمقارنة الأرقام بتجاهل كود الدولة (مثلاً 20)
        const isMatch = (phone1, phone2) => {
            if (!phone1 || !phone2) return false;
            let p1 = cleanPhone(phone1);
            let p2 = cleanPhone(phone2);
            // إذا كان أحد الأرقام يبدأ بـ 20 والآخر لا، نحذف الـ 20 لتسهيل المطابقة (مصر كمثال)
            if (p1.startsWith('20') && p1.length > 10) p1 = p1.substring(2);
            if (p2.startsWith('20') && p2.length > 10) p2 = p2.substring(2);
            
            // مقارنة آخر 9 أرقام على الأقل لضمان الدقة
            return p1.slice(-9) === p2.slice(-9);
        };

        // نبحث عما إذا كان هناك أي طلب معلق، وإذا لم يكن لدي رقم هاتف مسجل، قد يكون هذا الطلب لي
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
                state.userInfo.phone = myPhone;
                showAtharNotification("تم حفظ رقم هاتفك بنجاح، جاري فحص الطلبات...", "success");
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
                    await acceptStudentTransfer(tid, transfer);
                } else {
                    await update(ref(db, `athar_groups/${currentGroup.id}/transfers/${tid}`), { status: 'rejected' });
                }
            }
        }
    } catch (error) {
        console.error("Check transfers error:", error);
    }
}

async function acceptStudentTransfer(tid, data) {
    let loader;
    try {
        loader = document.createElement('div');
        loader.id = 'firebase-loader';
        loader.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,0.9);z-index:9999;display:flex;justify-content:center;align-items:center;font-size:20px;font-weight:bold;color:#1A5D3A;";
        loader.innerHTML = '<i class="fa-solid fa-cloud-arrow-up fa-bounce"></i>&nbsp; جاري استلام الطلاب...';
        document.body.appendChild(loader);

        const groupId = currentGroup.id;

        let currentStudents = state.students || [];
        const newStudents = data.students;

        const combinedStudents = [...currentStudents, ...newStudents];

        const updates = {};
        updates[`athar_groups/${groupId}/students/${currentUser.uid}/students`] = combinedStudents;
        updates[`athar_groups/${groupId}/students/${data.senderUid}/students`] = [];
        updates[`athar_groups/${groupId}/transfers/${tid}/status`] = 'completed';
        updates[`athar_groups/${groupId}/transfers/${tid}/acceptedAt`] = Date.now();

        await update(ref(db), updates);

        state.students = combinedStudents;
        renderDashboard();

        if (loader && loader.parentNode) loader.parentNode.removeChild(loader);
        showAtharNotification("تم استلام الطلاب بنجاح!", "success");
    } catch (error) {
        if (loader && loader.parentNode) loader.parentNode.removeChild(loader);
        console.error("Accept transfer error:", error);
        showAtharNotification("خطأ أثناء استلام الطلاب: " + error.message, "error");
    }
}

// ================= LECTURE SETTINGS (MODAL) =================
function openLectureSettings(e, lId) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    const lecture = state.lectures.find(l => l.id === lId);
    if (!lecture) return;

    document.getElementById('edit-lec-id-hidden').value = lecture.id;
    document.getElementById('edit-lec-name').value = lecture.title;
    document.getElementById('edit-lec-link').value = lecture.formLink || '';
    document.getElementById('edit-lec-id-display').value = lecture.id;

    const groupId = currentGroup ? currentGroup.id : 'YOUR_GROUP_ID';
    const dbHost = (typeof db !== 'undefined' && db._repo && db._repo.repoInfo_ && db._repo.repoInfo_.host) 
                   ? "https://" + db._repo.repoInfo_.host 
                   : "https://athar-project-f36bc-default-rtdb.firebaseio.com";

    const scriptTemplate = `function onFormSubmit(e) {
  var GROUP_ID = "${groupId}";
  var LECTURE_ID = "${lecture.id}";

  // افترض أن العمود الثاني (رقم 1) هو رقم الهاتف (A=0, B=1)
  var PHONE_COL = 1; 
  var phone = e.values[PHONE_COL];
  if (!phone) return;
  
  phone = phone.toString().trim().replace(/ /g, '');
  if (phone.startsWith("00")) phone = phone.substring(2);
  
  var dbUrl = "${dbHost}/athar_groups/" + GROUP_ID + "/responses/" + LECTURE_ID + ".json";
  
  var payload = { phone: phone, timestamp: new Date().getTime() };
  var options = { method: "post", contentType: "application/json", payload: JSON.stringify(payload) };
  
  try { UrlFetchApp.fetch(dbUrl, options); } catch(err) { Logger.log(err); }
}`;
    
    document.getElementById('edit-lec-script').value = scriptTemplate;
    document.getElementById('lecture-settings-modal').style.display = 'flex';
}

function saveLectureSettings() {
    const lId = document.getElementById('edit-lec-id-hidden').value;
    const newName = document.getElementById('edit-lec-name').value.trim();
    const newLink = document.getElementById('edit-lec-link').value.trim();

    if (!newName) {
        showAtharNotification("برجاء إدخال اسم المحاضرة.", "error");
        return;
    }

    const lectureIndex = state.lectures.findIndex(l => l.id === lId);
    if (lectureIndex !== -1) {
        state.lectures[lectureIndex].title = newName;
        state.lectures[lectureIndex].formLink = newLink;
        saveData();
        renderTable();
        document.getElementById('lecture-settings-modal').style.display = 'none';
        showAtharNotification("تم حفظ إعدادات المحاضرة بنجاح.");
    }
}

function copyLectureId() {
    const idField = document.getElementById('edit-lec-id-display');
    if (idField) {
        idField.select();
        idField.setSelectionRange(0, 99999);
        if (navigator.clipboard) {
            navigator.clipboard.writeText(idField.value).then(() => {
                showAtharNotification("تم نسخ معرف المحاضرة بنجاح", "success");
            }).catch(err => {
                console.error('Failed to copy', err);
                try {
                    document.execCommand("copy");
                    showAtharNotification("تم نسخ معرف المحاضرة", "success");
                } catch (e) {
                    showAtharNotification("النسخ غير مدعوم في متصفحك", "error");
                }
            });
        } else {
            document.execCommand("copy");
            showAtharNotification("تم نسخ معرف المحاضرة", "success");
        }
    }
}

function copyLectureScript() {
    const scriptField = document.getElementById('edit-lec-script');
    if (scriptField) {
        scriptField.select();
        scriptField.setSelectionRange(0, 99999);
        if (navigator.clipboard) {
            navigator.clipboard.writeText(scriptField.value).then(() => {
                showAtharNotification("تم نسخ اسكريبت الاستجابة بنجاح", "success");
            }).catch(err => {
                console.error('Failed to copy script', err);
            });
        }
    }
}

function deleteLectureFromSettings() {
    const lId = document.getElementById('edit-lec-id-hidden').value;
    document.getElementById('lecture-settings-modal').style.display = 'none';
    deleteLectureFlow(lId);
}
