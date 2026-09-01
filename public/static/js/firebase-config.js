/**
 * منصة أثر - إعدادات Firebase
 * ملف مركزي لتهيئة Firebase وتصدير الكائنات المشتركة
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getDatabase, ref, set, get, update, remove, push, child, onValue, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
    getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
    signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
    apiKey: atob("QUl6YVN5QTA3QlBHTm4yMXR6RDJPNXRBY2tKSnVoTHo0alE5UDdF"),
    authDomain: "athar-final1.firebaseapp.com",
    databaseURL: "https://athar-final1-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "athar-final1",
    storageBucket: "athar-final1.firebasestorage.app",
    messagingSenderId: "229512772966",
    appId: "1:229512772966:web:ea760f8300f01089559ca7"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export {
    db, auth, googleProvider,
    ref, set, get, update, remove, push, child, onValue, increment,
    signInWithEmailAndPassword, createUserWithEmailAndPassword,
    signOut, onAuthStateChanged, signInWithPopup
};
