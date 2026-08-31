/**
 * منصة أثر التعليمية - توليد الشهادات وتصدير PDF (Certificates Generator)
 */

import { state, saveData } from "./state.js";
import { showAtharNotification, showAtharConfirm } from "./utils.js";

/**
 * تحميل شهادة تقدير فردية للطالب كصورة PNG
 */
export function downloadCertificate(studentName, lectureCount) {
    const certSettings = state.settings.certificate || {
        template: '/static/assets/certificate_template.jpg',
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
            ctx.font = `bold ${nameFontSize}px Cairo, sans-serif`;
            ctx.fillStyle = '#000000';
            ctx.textAlign = 'center';
            ctx.fillText(studentName, certSettings.name.x, certSettings.name.y);
        }

        // 2. التاريخ
        if (certSettings.date.show) {
            const infoFontSize = Math.floor(canvas.width * 0.025);
            ctx.font = `bold ${infoFontSize}px Cairo, sans-serif`;
            ctx.fillStyle = '#000000';
            ctx.textAlign = 'center';
            const dateString = new Date().toLocaleDateString('ar-EG');
            ctx.fillText(dateString, certSettings.date.x, certSettings.date.y);
        }

        // 3. عدد المحاضرات
        if (certSettings.lecture && certSettings.lecture.show) {
            const infoFontSize = Math.floor(canvas.width * 0.025);
            ctx.font = `bold ${infoFontSize}px Cairo, sans-serif`;
            ctx.fillStyle = '#000000';
            ctx.textAlign = 'center';
            ctx.fillText(`${lectureCount}`, certSettings.lecture.x, certSettings.lecture.y);
        }

        const link = document.createElement('a');
        link.download = `شهادة_تقدير_${studentName}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    };

    img.onerror = function () {
        showAtharNotification("فشل تحميل قالب الشهادة. يرجى التأكد من مسار الصورة في الإعدادات.", "error");
    };
}

/**
 * تصدير حزمة شهادات المحاضرة كملف PDF
 */
export async function downloadLecturePDF(lecId, lecTitle) {
    if (!window.jspdf) {
        showAtharNotification("مكتبة PDF غير محملة!", "error");
        return;
    }

    const certSettings = state.settings.certificate || {
        template: '/static/assets/certificate_template.jpg',
        name: { x: 530, y: 660, show: true },
        date: { x: 536, y: 1126, show: true },
        lecture: { x: 1072, y: 1019, show: false }
    };

    const attendees = state.students.filter(s => s.progress && s.progress[lecId] && s.progress[lecId] !== 'replied');

    if (attendees.length === 0) {
        showAtharNotification("لا يوجد حضور مسجل لهذه المحاضرة.", "warning");
        return;
    }

    const isConfirmed = await showAtharConfirm("تصدير الشهادات", `سيتم استخراج ملف PDF لـ ${attendees.length} طالب.\nهل تريد الاستمرار؟`);
    if (!isConfirmed) return;

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

            if (certSettings.name.show) {
                const nameFontSize = Math.floor(canvas.width * 0.030);
                ctx.font = `bold ${nameFontSize}px Cairo, sans-serif`;
                ctx.fillStyle = '#000000';
                ctx.textAlign = 'center';
                ctx.fillText(student.name, certSettings.name.x, certSettings.name.y);
            }

            if (certSettings.date.show) {
                const infoFontSize = Math.floor(canvas.width * 0.025);
                ctx.font = `bold ${infoFontSize}px Cairo, sans-serif`;
                ctx.fillStyle = '#000000';
                ctx.textAlign = 'center';
                ctx.fillText(dateString, certSettings.date.x, certSettings.date.y);
            }

            if (certSettings.lecture && certSettings.lecture.show) {
                const infoFontSize = Math.floor(canvas.width * 0.025);
                ctx.font = `bold ${infoFontSize}px Cairo, sans-serif`;
                ctx.fillStyle = '#000000';
                ctx.textAlign = 'center';
                ctx.fillText(lecTitle, certSettings.lecture.x, certSettings.lecture.y);
            }

            const dataURL = canvas.toDataURL('image/jpeg', 0.8);
            doc.addImage(dataURL, 'JPEG', 0, 0, img.width, img.height);
        });

        doc.save(`شهادات_حضور_${lecTitle}.pdf`);
        showAtharNotification("تم إنشاء ملف PDF بنجاح");
    };

    img.onerror = function () {
        showAtharNotification("فشل تحميل قالب الشهادة لإنشاء PDF.", "error");
    };
}

/**
 * فتح نافذة إعدادات مواضع نصوص الشهادة
 */
export function openCertSettings() {
    const cert = state.settings.certificate || {
        name: { x: 530, y: 660, show: true },
        date: { x: 536, y: 1126, show: true },
        lecture: { x: 1072, y: 1019, show: false }
    };

    const nameX = document.getElementById('cert-name-x');
    const nameY = document.getElementById('cert-name-y');
    const nameShow = document.getElementById('cert-name-show');

    const dateX = document.getElementById('cert-date-x');
    const dateY = document.getElementById('cert-date-y');
    const dateShow = document.getElementById('cert-date-show');

    const lecX = document.getElementById('cert-lec-x');
    const lecY = document.getElementById('cert-lec-y');
    const lecShow = document.getElementById('cert-lec-show');

    if (nameX) nameX.value = cert.name.x;
    if (nameY) nameY.value = cert.name.y;
    if (nameShow) nameShow.checked = cert.name.show;

    if (dateX) dateX.value = cert.date.x;
    if (dateY) dateY.value = cert.date.y;
    if (dateShow) dateShow.checked = cert.date.show;

    if (lecX) lecX.value = cert.lecture ? cert.lecture.x : 1072;
    if (lecY) lecY.value = cert.lecture ? cert.lecture.y : 1019;
    if (lecShow) lecShow.checked = cert.lecture ? cert.lecture.show : false;

    const modal = document.getElementById('cert-settings-modal');
    if (modal) modal.style.display = 'flex';
}

export function closeCertSettings() {
    const modal = document.getElementById('cert-settings-modal');
    if (modal) modal.style.display = 'none';
}

export function handleCertTemplateUpload(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        if (!state.settings.certificate) state.settings.certificate = {};
        state.settings.certificate.template = e.target.result;
        showAtharNotification("✅ تم تحميل قالب الشهادة الجديد!");
    };
    reader.readAsDataURL(file);
}

export async function saveCertSettings() {
    if (!state.settings.certificate) state.settings.certificate = {};

    state.settings.certificate.name = {
        x: parseInt(document.getElementById('cert-name-x').value) || 530,
        y: parseInt(document.getElementById('cert-name-y').value) || 660,
        show: document.getElementById('cert-name-show').checked
    };
    state.settings.certificate.date = {
        x: parseInt(document.getElementById('cert-date-x').value) || 536,
        y: parseInt(document.getElementById('cert-date-y').value) || 1126,
        show: document.getElementById('cert-date-show').checked
    };
    state.settings.certificate.lecture = {
        x: parseInt(document.getElementById('cert-lec-x').value) || 1072,
        y: parseInt(document.getElementById('cert-lec-y').value) || 1019,
        show: document.getElementById('cert-lec-show').checked
    };

    await saveData();
    closeCertSettings();
    showAtharNotification("✅ تم حفظ إعدادات الشهادة بنجاح!");
}
