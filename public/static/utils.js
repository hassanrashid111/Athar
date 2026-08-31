/**
 * أدوات مساعدة (Utility Functions)
 * هذا الملف يحتوي على الدوال التي يتم استخدامها بشكل متكرر في البرنامج
 */

/**
 * عرض تنبيه "أثر" المخصص
 */
export function showAtharNotification(message, type = 'success') {
    const oldNotify = document.querySelector('.athar-notification');
    if (oldNotify) oldNotify.remove();

    const notify = document.createElement('div');
    notify.className = `athar-notification ${type}`;

    const icon = type === 'success' ? 'fa-check-circle' : (type === 'error' ? 'fa-circle-exclamation' : 'fa-bell');

    notify.innerHTML = `
        <i class="fa-solid ${icon}"></i>
        <span>${message}</span>
    `;

    document.body.appendChild(notify);

    setTimeout(() => notify.classList.add('show'), 100);

    setTimeout(() => {
        notify.classList.remove('show');
        setTimeout(() => notify.remove(), 400);
    }, 4000);
}

/**
 * تنظيف رقم الهاتف من المسافات والرموز
 */
export function cleanPhone(p) {
    return p ? p.replace(/[\s\-\+\(\)]/g, '') : '';
}

/**
 * الحصول على الحروف الأولى من الاسم (لـ Avatar)
 */
export function getInitials(name) {
    return name ? name.charAt(0) : '?';
}

/**
 * حساب درجة المحاضرة بناءً على تاريخ التحضير
 * (السبت 100، الأحد 90، ... إلخ)
 */
export function calculateScore(lectureTimestamp, checkTimestamp) {
    if (!checkTimestamp) return 0;
    if (checkTimestamp === 'replied') return 0;
    if (checkTimestamp === true) return 100;

    const lecDate = new Date(lectureTimestamp || Date.now());
    lecDate.setHours(0, 0, 0, 0);

    const checkDate = new Date(checkTimestamp);
    checkDate.setHours(0, 0, 0, 0);

    const diffTime = checkDate - lecDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return 100;
    if (diffDays === 1) return 90;
    if (diffDays === 2) return 80;
    if (diffDays === 3) return 70;
    if (diffDays === 4) return 60;
    if (diffDays === 5) return 50;
    if (diffDays === 6) return 40;
    if (diffDays <= 13) return 30;
    if (diffDays <= 20) return 20;
    return 10;
}

/**
 * حساب النسبة المئوية الإجمالية للطالب في جميع المحاضرات
 */
export function getStudentTotalScore(student, lectures) {
    if (!lectures || lectures.length === 0) return 0;

    let totalScore = 0;
    lectures.forEach(lec => {
        const ts = lec.timestamp || Date.now();
        const score = calculateScore(ts, student.progress ? student.progress[lec.id] : null);
        totalScore += score;
    });

    const maxScore = lectures.length * 100;
    return Math.round((totalScore / maxScore) * 100);
}

/**
 * عرض التاريخ الهجري بشكل منسق
 */
export function formatHijriDate(date = new Date()) {
    try {
        const options = {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            calendar: 'islamic-umalqura'
        };
        return new Intl.DateTimeFormat('ar-SA-u-ca-islamic', options).format(date);
    } catch (e) {
        return date.toLocaleDateString('ar-EG');
    }
}

/**
 * عرض نافذة إدخال مخصصة (برومبت)
 */
export function showAtharPrompt(title, message, defaultValue = "", inputType = "text") {
    return new Promise((resolve) => {
        const modal = document.getElementById('athar-prompt-modal');
        const titleElem = document.getElementById('prompt-title');
        const msgElem = document.getElementById('prompt-message');
        const input = document.getElementById('prompt-input');
        const inputWrapper = document.getElementById('prompt-input-wrapper');
        const choiceWrapper = document.getElementById('prompt-choice-wrapper');
        const confirmBtn = document.getElementById('prompt-confirm-btn');
        const cancelBtn = document.getElementById('prompt-cancel-btn');
        const closeBtn = document.getElementById('close-prompt-btn');

        titleElem.innerText = title;
        msgElem.innerText = message;
        input.value = defaultValue;
        input.type = inputType;
        
        let iti = null;
        if (inputType === "tel" && window.intlTelInput) {
            iti = window.intlTelInput(input, {
                initialCountry: "eg",
                preferredCountries: ["eg", "sa", "ae", "kw", "qa"],
                separateDialCode: true,
                utilsScript: "https://cdn.jsdelivr.net/npm/intl-tel-input@23.0.11/build/js/utils.js"
            });
        }

        inputWrapper.style.display = 'block';
        choiceWrapper.style.display = 'none';

        modal.style.display = 'flex';
        input.focus();

        const handleConfirm = () => {
            let result = input.value;
            if (iti) {
                result = iti.getNumber() || input.value;
            }
            cleanup();
            resolve(result);
        };

        const handleCancel = () => {
            cleanup();
            resolve(null);
        };

        const cleanup = () => {
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
            closeBtn.removeEventListener('click', handleCancel);
            if (iti) {
                iti.destroy();
            }
            input.type = "text"; // reset input type
            modal.style.display = 'none';
        };

        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
        closeBtn.addEventListener('click', handleCancel);
    });
}

/**
 * عرض نافذة اختيار من متعدد مخصصة
 */
export function showAtharChoice(title, message, choices) {
    return new Promise((resolve) => {
        const modal = document.getElementById('athar-prompt-modal');
        const titleElem = document.getElementById('prompt-title');
        const msgElem = document.getElementById('prompt-message');
        const inputWrapper = document.getElementById('prompt-input-wrapper');
        const choiceWrapper = document.getElementById('prompt-choice-wrapper');
        const confirmBtn = document.getElementById('prompt-confirm-btn');
        const cancelBtn = document.getElementById('prompt-cancel-btn');
        const closeBtn = document.getElementById('close-prompt-btn');

        titleElem.innerText = title;
        msgElem.innerText = message;

        inputWrapper.style.display = 'none';
        choiceWrapper.style.display = 'flex';
        confirmBtn.style.display = 'none'; // سكتفي بالضغط على الخصيار مباشرة أو الإلغاء

        choiceWrapper.innerHTML = '';
        choices.forEach(choice => {
            const btn = document.createElement('button');
            btn.className = 'btn-action';
            btn.style.width = '100%';
            btn.style.textAlign = 'right';
            btn.style.padding = '12px';
            btn.style.justifyContent = 'flex-start';
            btn.innerHTML = `<span>${choice.id}- ${choice.text}</span>`;
            btn.onclick = () => {
                cleanup();
                resolve(choice.id);
            };
            choiceWrapper.appendChild(btn);
        });

        modal.style.display = 'flex';

        const handleCancel = () => {
            cleanup();
            resolve(null);
        };

        const cleanup = () => {
            cancelBtn.removeEventListener('click', handleCancel);
            closeBtn.removeEventListener('click', handleCancel);
            modal.style.display = 'none';
            confirmBtn.style.display = 'block'; // إعادة الحالة الأصلية
        };

        cancelBtn.addEventListener('click', handleCancel);
        closeBtn.addEventListener('click', handleCancel);
    });
}

/**
 * عرض نافذة تأكيد مخصصة (نعم/لا)
 */
export function showAtharConfirm(title, message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('athar-prompt-modal');
        const titleElem = document.getElementById('prompt-title');
        const msgElem = document.getElementById('prompt-message');
        const inputWrapper = document.getElementById('prompt-input-wrapper');
        const choiceWrapper = document.getElementById('prompt-choice-wrapper');
        const confirmBtn = document.getElementById('prompt-confirm-btn');
        const cancelBtn = document.getElementById('prompt-cancel-btn');
        const closeBtn = document.getElementById('close-prompt-btn');

        titleElem.innerText = title;
        msgElem.innerText = message;

        inputWrapper.style.display = 'none';
        choiceWrapper.style.display = 'none';
        confirmBtn.innerText = 'نعم، متأكد';
        cancelBtn.innerText = 'إلغاء';

        modal.style.display = 'flex';

        const handleConfirm = () => {
            cleanup();
            resolve(true);
        };

        const handleCancel = () => {
            cleanup();
            resolve(false);
        };

        const cleanup = () => {
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
            closeBtn.removeEventListener('click', handleCancel);
            modal.style.display = 'none';
            confirmBtn.innerText = 'تأكيد'; // استعادة النص الأصلي
        };

        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
        closeBtn.addEventListener('click', handleCancel);
    });
}

/**
 * حماية النصوص من هجمات XSS
 */
export function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        }[tag] || tag)
    );
}

export function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
}
