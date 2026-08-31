/**
 * منصة أثر التعليمية - الأدوات المساعدة (Utility Functions)
 * دوال مشتركة للإشعارات، الحسابات، النوافذ التفاعلية، والتنظيف
 */

/**
 * عرض إشعار مخصص
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

    setTimeout(() => notify.classList.add('show'), 50);

    setTimeout(() => {
        notify.classList.remove('show');
        setTimeout(() => notify.remove(), 400);
    }, 4000);
}

/**
 * تنظيف رقم الهاتف من المسافات والرموز
 */
export function cleanPhone(p) {
    return p ? p.toString().replace(/[\s\-\+\(\)]/g, '') : '';
}

/**
 * الحصول على الحرف الأول من الاسم للـ Avatar
 */
export function getInitials(name) {
    return name && name.trim().length > 0 ? name.trim().charAt(0) : '?';
}

/**
 * حساب درجة المحاضرة بناءً على تاريخ التحضير
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
 * حساب النسبة المئوية الإجمالية للطالب
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
 * تنسيق التاريخ الهجري
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
 * نافذة إدخال مخصصة
 */
export function showAtharPrompt(title, message, defaultValue = "", inputType = "text") {
    return new Promise((resolve) => {
        let modal = document.getElementById('athar-prompt-modal');
        if (!modal) {
            const val = prompt(`${title}\n${message}`, defaultValue);
            return resolve(val);
        }

        const titleElem = document.getElementById('prompt-title');
        const msgElem = document.getElementById('prompt-message');
        const input = document.getElementById('prompt-input');
        const inputWrapper = document.getElementById('prompt-input-wrapper');
        const choiceWrapper = document.getElementById('prompt-choice-wrapper');
        const confirmBtn = document.getElementById('prompt-confirm-btn');
        const cancelBtn = document.getElementById('prompt-cancel-btn');
        const closeBtn = document.getElementById('close-prompt-btn');

        if (titleElem) titleElem.innerText = title;
        if (msgElem) msgElem.innerText = message;
        if (input) {
            input.value = defaultValue;
            input.type = inputType;
        }

        let iti = null;
        if (inputType === "tel" && window.intlTelInput && input) {
            iti = window.intlTelInput(input, {
                initialCountry: "eg",
                preferredCountries: ["eg", "sa", "ae", "kw", "qa"],
                separateDialCode: true,
                utilsScript: "https://cdn.jsdelivr.net/npm/intl-tel-input@23.0.11/build/js/utils.js"
            });
        }

        if (inputWrapper) inputWrapper.style.display = 'block';
        if (choiceWrapper) choiceWrapper.style.display = 'none';

        modal.style.display = 'flex';
        if (input) input.focus();

        const handleConfirm = () => {
            let result = input ? input.value : '';
            if (iti) {
                result = iti.getNumber() || (input ? input.value : '');
            }
            cleanup();
            resolve(result);
        };

        const handleCancel = () => {
            cleanup();
            resolve(null);
        };

        const cleanup = () => {
            if (confirmBtn) confirmBtn.removeEventListener('click', handleConfirm);
            if (cancelBtn) cancelBtn.removeEventListener('click', handleCancel);
            if (closeBtn) closeBtn.removeEventListener('click', handleCancel);
            if (iti) iti.destroy();
            if (input) input.type = "text";
            modal.style.display = 'none';
        };

        if (confirmBtn) confirmBtn.addEventListener('click', handleConfirm);
        if (cancelBtn) cancelBtn.addEventListener('click', handleCancel);
        if (closeBtn) closeBtn.addEventListener('click', handleCancel);
    });
}

/**
 * نافذة اختيار من متعدد مخصصة
 */
export function showAtharChoice(title, message, choices) {
    return new Promise((resolve) => {
        const modal = document.getElementById('athar-prompt-modal');
        if (!modal) {
            const choiceStr = choices.map(c => `${c.id}. ${c.text}`).join('\n');
            const val = prompt(`${title}\n${message}\n${choiceStr}`);
            return resolve(val);
        }

        const titleElem = document.getElementById('prompt-title');
        const msgElem = document.getElementById('prompt-message');
        const inputWrapper = document.getElementById('prompt-input-wrapper');
        const choiceWrapper = document.getElementById('prompt-choice-wrapper');
        const confirmBtn = document.getElementById('prompt-confirm-btn');
        const cancelBtn = document.getElementById('prompt-cancel-btn');
        const closeBtn = document.getElementById('close-prompt-btn');

        if (titleElem) titleElem.innerText = title;
        if (msgElem) msgElem.innerText = message;

        if (inputWrapper) inputWrapper.style.display = 'none';
        if (choiceWrapper) {
            choiceWrapper.style.display = 'flex';
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
        }
        if (confirmBtn) confirmBtn.style.display = 'none';

        modal.style.display = 'flex';

        const handleCancel = () => {
            cleanup();
            resolve(null);
        };

        const cleanup = () => {
            if (cancelBtn) cancelBtn.removeEventListener('click', handleCancel);
            if (closeBtn) closeBtn.removeEventListener('click', handleCancel);
            modal.style.display = 'none';
            if (confirmBtn) confirmBtn.style.display = 'block';
        };

        if (cancelBtn) cancelBtn.addEventListener('click', handleCancel);
        if (closeBtn) closeBtn.addEventListener('click', handleCancel);
    });
}

/**
 * نافذة تأكيد مخصصة (نعم/لا)
 */
export function showAtharConfirm(title, message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('athar-prompt-modal');
        if (!modal) {
            return resolve(confirm(`${title}\n${message}`));
        }

        const titleElem = document.getElementById('prompt-title');
        const msgElem = document.getElementById('prompt-message');
        const inputWrapper = document.getElementById('prompt-input-wrapper');
        const choiceWrapper = document.getElementById('prompt-choice-wrapper');
        const confirmBtn = document.getElementById('prompt-confirm-btn');
        const cancelBtn = document.getElementById('prompt-cancel-btn');
        const closeBtn = document.getElementById('close-prompt-btn');

        if (titleElem) titleElem.innerText = title;
        if (msgElem) msgElem.innerText = message;

        if (inputWrapper) inputWrapper.style.display = 'none';
        if (choiceWrapper) choiceWrapper.style.display = 'none';
        if (confirmBtn) confirmBtn.innerText = 'نعم، متأكد';
        if (cancelBtn) cancelBtn.innerText = 'إلغاء';

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
            if (confirmBtn) {
                confirmBtn.removeEventListener('click', handleConfirm);
                confirmBtn.innerText = 'تأكيد';
            }
            if (cancelBtn) cancelBtn.removeEventListener('click', handleCancel);
            if (closeBtn) closeBtn.removeEventListener('click', handleCancel);
            modal.style.display = 'none';
        };

        if (confirmBtn) confirmBtn.addEventListener('click', handleConfirm);
        if (cancelBtn) cancelBtn.addEventListener('click', handleCancel);
        if (closeBtn) closeBtn.addEventListener('click', handleCancel);
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

/**
 * فحص نوع الجهاز (موبايل أم كمبيوتر)
 */
export function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
}
