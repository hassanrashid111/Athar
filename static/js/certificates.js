/**
 * منصة أثر التعليمية - توليد الشهادات وتصدير PDF والمحرر التفاعلي بالسحب والإفلات
 * (Interactive Certificate Visual Drag-and-Drop Editor & PDF Generator)
 */

import { state, saveData } from "./state.js";
import { showAtharNotification, showAtharConfirm } from "./utils.js";
import { db, ref, update, increment } from "./firebase-config.js";

let certNaturalWidth = 2000;
let certNaturalHeight = 1414;
let activeDragElement = null;
let dragOffset = { x: 0, y: 0 };

/**
 * تحميل شهادة تقدير فردية للطالب كصورة PNG
 */
export function downloadCertificate(studentName, lectureCount) {
    const certSettings = state.settings.certificate || {};

    if (!certSettings.template) {
        showAtharNotification("⚠️ يرجى رفع وتحديد قالب الشهادة أولاً من إعدادات الشهادة 📜", "warning");
        openCertSettings();
        return;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.src = certSettings.template;

    img.onload = function () {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const nameConfig = certSettings.name || { x: Math.round(img.width * 0.5), y: Math.round(img.height * 0.46), show: true };
        const dateConfig = certSettings.date || { x: Math.round(img.width * 0.27), y: Math.round(img.height * 0.79), show: true };
        const lecConfig = certSettings.lecture || { x: Math.round(img.width * 0.54), y: Math.round(img.height * 0.72), show: false };

        // 1. اسم الطالب
        if (nameConfig.show !== false) {
            const nameFontSize = Math.floor(canvas.width * 0.032);
            ctx.font = `bold ${nameFontSize}px Cairo, sans-serif`;
            ctx.fillStyle = '#000000';
            ctx.textAlign = 'center';
            ctx.fillText(studentName, nameConfig.x, nameConfig.y);
        }

        // 2. التاريخ
        if (dateConfig.show !== false) {
            const infoFontSize = Math.floor(canvas.width * 0.024);
            ctx.font = `bold ${infoFontSize}px Cairo, sans-serif`;
            ctx.fillStyle = '#000000';
            ctx.textAlign = 'center';
            const dateString = new Date().toLocaleDateString('ar-EG');
            ctx.fillText(dateString, dateConfig.x, dateConfig.y);
        }

        // 3. عدد المحاضرات
        if (lecConfig && lecConfig.show) {
            const infoFontSize = Math.floor(canvas.width * 0.024);
            ctx.font = `bold ${infoFontSize}px Cairo, sans-serif`;
            ctx.fillStyle = '#000000';
            ctx.textAlign = 'center';
            ctx.fillText(`${lectureCount}`, lecConfig.x, lecConfig.y);
        }

        const link = document.createElement('a');
        link.download = `شهادة_تقدير_${studentName}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();

        // تتبع تصدير الشهادة الفردية (بدون تعطيل العملية)
        if (navigator.onLine) {
            update(ref(db), { 'system_analytics/certificates_exported': increment(1) }).catch(() => {});
        }
    };

    img.onerror = function () {
        showAtharNotification("فشل تحميل قالب الشهادة. يرجى إعادة رفع القالب من الإعدادات.", "error");
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

    const certSettings = state.settings.certificate || {};

    if (!certSettings.template) {
        showAtharNotification("⚠️ يرجى رفع وتحديد قالب الشهادة أولاً من إعدادات الشهادة 📜", "warning");
        openCertSettings();
        return;
    }

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

        const nameConfig = certSettings.name || { x: Math.round(img.width * 0.5), y: Math.round(img.height * 0.46), show: true };
        const dateConfig = certSettings.date || { x: Math.round(img.width * 0.27), y: Math.round(img.height * 0.79), show: true };
        const lecConfig = certSettings.lecture || { x: Math.round(img.width * 0.54), y: Math.round(img.height * 0.72), show: false };

        attendees.forEach((student, index) => {
            if (index > 0) doc.addPage([img.width, img.height], 'landscape');

            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');

            ctx.drawImage(img, 0, 0);

            if (nameConfig.show !== false) {
                const nameFontSize = Math.floor(canvas.width * 0.032);
                ctx.font = `bold ${nameFontSize}px Cairo, sans-serif`;
                ctx.fillStyle = '#000000';
                ctx.textAlign = 'center';
                ctx.fillText(student.name || 'بدون اسم', nameConfig.x, nameConfig.y);
            }

            if (dateConfig.show !== false) {
                const infoFontSize = Math.floor(canvas.width * 0.024);
                ctx.font = `bold ${infoFontSize}px Cairo, sans-serif`;
                ctx.fillStyle = '#000000';
                ctx.textAlign = 'center';
                ctx.fillText(dateString, dateConfig.x, dateConfig.y);
            }

            if (lecConfig && lecConfig.show) {
                const infoFontSize = Math.floor(canvas.width * 0.024);
                ctx.font = `bold ${infoFontSize}px Cairo, sans-serif`;
                ctx.fillStyle = '#000000';
                ctx.textAlign = 'center';
                ctx.fillText(lecTitle, lecConfig.x, lecConfig.y);
            }

            const dataURL = canvas.toDataURL('image/jpeg', 0.85);
            doc.addImage(dataURL, 'JPEG', 0, 0, img.width, img.height);
        });

        doc.save(`شهادات_حضور_${lecTitle}.pdf`);
        showAtharNotification("تم إنشاء ملف PDF بنجاح ✓", "success");

        // تتبع تصدير شهادات الدفعة (attendees.length شهادة دفعة واحدة)
        if (navigator.onLine) {
            update(ref(db), { 'system_analytics/certificates_exported': increment(attendees.length) }).catch(() => {});
        }
    };

    img.onerror = function () {
        showAtharNotification("فشل تحميل قالب الشهادة لإنشاء PDF.", "error");
    };
}

/* ==========================================================================
   ✨ المعاينة التفاعلية ومحرر الشهادات بالسحب والإفلات (Visual Drag & Drop)
   ========================================================================== */

export function openCertSettings() {
    const cert = state.settings.certificate || {};

    const nameX = document.getElementById('cert-name-x');
    const nameY = document.getElementById('cert-name-y');
    const nameShow = document.getElementById('cert-name-show');

    const dateX = document.getElementById('cert-date-x');
    const dateY = document.getElementById('cert-date-y');
    const dateShow = document.getElementById('cert-date-show');

    const lecX = document.getElementById('cert-lec-x');
    const lecY = document.getElementById('cert-lec-y');
    const lecShow = document.getElementById('cert-lec-show');

    if (nameX) nameX.value = cert.name?.x ?? 1000;
    if (nameY) nameY.value = cert.name?.y ?? 650;
    if (nameShow) nameShow.checked = cert.name?.show !== false;

    if (dateX) dateX.value = cert.date?.x ?? 540;
    if (dateY) dateY.value = cert.date?.y ?? 1120;
    if (dateShow) dateShow.checked = cert.date?.show !== false;

    if (lecX) lecX.value = cert.lecture?.x ?? 1080;
    if (lecY) lecY.value = cert.lecture?.y ?? 1020;
    if (lecShow) lecShow.checked = cert.lecture?.show ?? false;

    const modal = document.getElementById('cert-settings-modal');
    if (modal) modal.style.display = 'flex';

    // تحميل وتحديث المعاينة التفاعلية
    initVisualCertPreview(cert.template);
}

export function closeCertSettings() {
    const modal = document.getElementById('cert-settings-modal');
    if (modal) modal.style.display = 'none';
}

/**
 * تهيئة المعاينة التفاعلية للشهادة
 */
export function initVisualCertPreview(templateSrc) {
    const previewImg = document.getElementById('cert-preview-img');
    const placeholder = document.getElementById('cert-no-template-msg');
    const markersContainer = document.getElementById('cert-markers-layer');

    if (!templateSrc) {
        if (previewImg) previewImg.style.display = 'none';
        if (placeholder) placeholder.style.display = 'flex';
        if (markersContainer) markersContainer.style.display = 'none';
        return;
    }

    if (placeholder) placeholder.style.display = 'none';
    if (previewImg) {
        previewImg.style.display = 'block';
        previewImg.src = templateSrc;
        previewImg.onload = function () {
            certNaturalWidth = previewImg.naturalWidth || 2000;
            certNaturalHeight = previewImg.naturalHeight || 1414;
            if (markersContainer) markersContainer.style.display = 'block';
            updateVisualMarkersPositions();
            attachDragListeners();
        };
    }
}

/**
 * تحديث مواضع العناصر القابلة للسحب على المعاينة
 */
export function updateVisualMarkersPositions() {
    const container = document.getElementById('cert-preview-container');
    if (!container) return;

    const nameX = parseInt(document.getElementById('cert-name-x')?.value) || 1000;
    const nameY = parseInt(document.getElementById('cert-name-y')?.value) || 650;
    const nameShow = document.getElementById('cert-name-show')?.checked !== false;

    const dateX = parseInt(document.getElementById('cert-date-x')?.value) || 540;
    const dateY = parseInt(document.getElementById('cert-date-y')?.value) || 1120;
    const dateShow = document.getElementById('cert-date-show')?.checked !== false;

    const lecX = parseInt(document.getElementById('cert-lec-x')?.value) || 1080;
    const lecY = parseInt(document.getElementById('cert-lec-y')?.value) || 1020;
    const lecShow = document.getElementById('cert-lec-show')?.checked === true;

    setMarkerPosition('marker-name', nameX, nameY, nameShow);
    setMarkerPosition('marker-date', dateX, dateY, dateShow);
    setMarkerPosition('marker-lecture', lecX, lecY, lecShow);
}

function setMarkerPosition(markerId, x, y, isVisible) {
    const el = document.getElementById(markerId);
    if (!el) return;

    if (!isVisible) {
        el.style.display = 'none';
        return;
    }

    el.style.display = 'flex';
    const percentX = (x / certNaturalWidth) * 100;
    const percentY = (y / certNaturalHeight) * 100;

    el.style.left = `${percentX}%`;
    el.style.top = `${percentY}%`;
}

/**
 * ربط أحداث السحب والإفلات (Mouse & Touch Drag)
 */
function attachDragListeners() {
    const markers = document.querySelectorAll('.cert-drag-marker');
    const container = document.getElementById('cert-preview-container');
    if (!container) return;

    markers.forEach(marker => {
        // إزالة المستمعات السابقة لمنع التكرار
        const clone = marker.cloneNode(true);
        marker.parentNode.replaceChild(clone, marker);

        // Mouse Events
        clone.addEventListener('mousedown', (e) => startDrag(e, clone, container));
        // Touch Events
        clone.addEventListener('touchstart', (e) => startDrag(e, clone, container), { passive: false });
    });
}

function startDrag(e, element, container) {
    e.preventDefault();
    e.stopPropagation();

    activeDragElement = element;
    const isTouch = e.type.startsWith('touch');
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;

    const rect = element.getBoundingClientRect();
    dragOffset.x = clientX - (rect.left + rect.width / 2);
    dragOffset.y = clientY - (rect.top + rect.height / 2);

    function onMove(moveEvent) {
        if (!activeDragElement) return;
        const curX = moveEvent.type.startsWith('touch') ? moveEvent.touches[0].clientX : moveEvent.clientX;
        const curY = moveEvent.type.startsWith('touch') ? moveEvent.touches[0].clientY : moveEvent.clientY;

        const containerRect = container.getBoundingClientRect();

        let posX = curX - containerRect.left - dragOffset.x;
        let posY = curY - containerRect.top - dragOffset.y;

        posX = Math.max(0, Math.min(containerRect.width, posX));
        posY = Math.max(0, Math.min(containerRect.height, posY));

        const percentX = (posX / containerRect.width) * 100;
        const percentY = (posY / containerRect.height) * 100;

        activeDragElement.style.left = `${percentX}%`;
        activeDragElement.style.top = `${percentY}%`;

        // تحويل النسبة لإحداثيات الصورة الأصلية
        const calcX = Math.round((posX / containerRect.width) * certNaturalWidth);
        const calcY = Math.round((posY / containerRect.height) * certNaturalHeight);

        const type = activeDragElement.getAttribute('data-type');
        if (type === 'name') {
            const ix = document.getElementById('cert-name-x');
            const iy = document.getElementById('cert-name-y');
            if (ix) ix.value = calcX;
            if (iy) iy.value = calcY;
        } else if (type === 'date') {
            const ix = document.getElementById('cert-date-x');
            const iy = document.getElementById('cert-date-y');
            if (ix) ix.value = calcX;
            if (iy) iy.value = calcY;
        } else if (type === 'lecture') {
            const ix = document.getElementById('cert-lec-x');
            const iy = document.getElementById('cert-lec-y');
            if (ix) ix.value = calcX;
            if (iy) iy.value = calcY;
        }
    }

    function onEnd() {
        activeDragElement = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onEnd);
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('touchend', onEnd);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
}

/**
 * رفع قالب شهادة جديد
 */
export function handleCertTemplateUpload(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        if (!state.settings.certificate) state.settings.certificate = {};
        state.settings.certificate.template = e.target.result;
        initVisualCertPreview(e.target.result);
        showAtharNotification("✅ تم تحميل قالب الشهادة! يمكنك الآن سحب العناصر لتحديد مواضعها.");
    };
    reader.readAsDataURL(file);
}

/**
 * حفظ إعدادات الشهادة
 */
export async function saveCertSettings() {
    if (!state.settings.certificate) state.settings.certificate = {};

    state.settings.certificate.name = {
        x: parseInt(document.getElementById('cert-name-x')?.value) || 1000,
        y: parseInt(document.getElementById('cert-name-y')?.value) || 650,
        show: document.getElementById('cert-name-show')?.checked !== false
    };
    state.settings.certificate.date = {
        x: parseInt(document.getElementById('cert-date-x')?.value) || 540,
        y: parseInt(document.getElementById('cert-date-y')?.value) || 1120,
        show: document.getElementById('cert-date-show')?.checked !== false
    };
    state.settings.certificate.lecture = {
        x: parseInt(document.getElementById('cert-lec-x')?.value) || 1080,
        y: parseInt(document.getElementById('cert-lec-y')?.value) || 1020,
        show: document.getElementById('cert-lec-show')?.checked === true
    };

    await saveData();
    closeCertSettings();
    showAtharNotification("✅ تم حفظ قالب وإعدادات ومواقع نصوص الشهادة بنجاح!");
}
