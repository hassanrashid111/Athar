/**
 * منصة أثر التعليمية - إدارة المحاضرات والتحضير (Lectures Management)
 */

import { state, currentGroup, saveData } from "./state.js";
import { showAtharNotification, showAtharPrompt, showAtharConfirm } from "./utils.js";
import { db } from "./firebase-config.js";

/**
 * إضافة محاضرة جديدة (لمشرف المجموعة)
 */
export async function addLectureFlow(onSuccess) {
    if (state.userInfo && state.userInfo.role !== 'group_supervisor') {
        showAtharNotification("إضافة المحاضرات متاحة فقط لمشرف المجموعة.", 'error');
        return;
    }

    const title = await showAtharPrompt('إضافة محاضرة أو اختبار', 'أدخل عنوان المحاضرة أو الاختبار (مثال: المحاضرة 1 أو الاختبار النهائي):', `المحاضرة ${state.lectures.length + 1}`);
    if (!title || !title.trim()) return;

    const formLink = await showAtharPrompt('رابط الاختبار (إجباري)', 'أدخل رابط نموذج الاختبار / Google Form:', '');
    if (!formLink || !formLink.trim()) {
        showAtharNotification("رابط الاختبار إجباري لربط وتوثيق نتائج الطلاب.", 'warning');
        return;
    }

    const videoLink = await showAtharPrompt('رابط المحاضرة (اختياري)', '(اختياري) أدخل رابط المحاضرة على يوتيوب:\n(اتركه فارغاً إذا كان اختباراً بينياً أو نهائياً فقط)', '');

    state.lectures.push({
        id: `lec_${Date.now()}`,
        title: title.trim(),
        formLink: formLink.trim(),
        videoLink: videoLink ? videoLink.trim() : '',
        timestamp: Date.now()
    });

    await saveData();
    showAtharNotification('تمت إضافة المحاضرة/الاختبار بنجاح ✓', 'success');
    if (onSuccess) onSuccess();
}

/**
 * حذف محاضرة
 */
export async function deleteLectureFlow(id, onSuccess) {
    const isConfirmed = await showAtharConfirm("حذف محاضرة", "هل أنت متأكد من حذف المحاضرة وجميع سجلات الحضور المرتبطة بها؟");
    if (!isConfirmed) return;

    state.lectures = state.lectures.filter(l => l.id !== id);
    state.students.forEach(s => {
        if (s.progress) delete s.progress[id];
    });

    await saveData();
    showAtharNotification("تم حذف المحاضرة بنجاح");
    if (onSuccess) onSuccess();
}

/**
 * تبديل حالة تحضير الطالب
 */
export async function toggleStudentCheck(sId, lId, onSuccess) {
    const student = state.students.find(s => s.id === sId);
    if (student) {
        if (!student.progress) student.progress = {};

        if (student.progress[lId]) {
            delete student.progress[lId];
        } else {
            student.progress[lId] = Date.now();
        }

        try {
            await saveData();
            if (onSuccess) onSuccess();
        } catch (e) {
            console.error("Attendance toggle error:", e);
        }
    }
}

/**
 * فتح نافذة إعدادات المحاضرة وربط Google Forms
 */
export function openLectureSettings(e, lId) {
    if (e && e.preventDefault) {
        e.preventDefault();
        e.stopPropagation();
    }

    const lecture = state.lectures.find(l => l.id === lId);
    if (!lecture) return;

    const idHidden = document.getElementById('edit-lec-id-hidden');
    const nameInput = document.getElementById('edit-lec-name');
    const linkInput = document.getElementById('edit-lec-link');
    const videoInput = document.getElementById('edit-lec-video');
    const idDisplay = document.getElementById('edit-lec-id-display');
    const scriptField = document.getElementById('edit-lec-script');

    if (idHidden) idHidden.value = lecture.id;
    if (nameInput) nameInput.value = lecture.title || '';
    if (linkInput) linkInput.value = lecture.formLink || '';
    if (videoInput) videoInput.value = lecture.videoLink || '';
    if (idDisplay) idDisplay.value = lecture.id;

    const groupId = currentGroup ? currentGroup.id : 'YOUR_GROUP_ID';
    const dbHost = (db && db._repo && db._repo.repoInfo_ && db._repo.repoInfo_.host)
        ? "https://" + db._repo.repoInfo_.host
        : "https://athar-final1-default-rtdb.europe-west1.firebasedatabase.app";

    const scriptTemplate = `function onFormSubmit(e) {
  var GROUP_ID = "${groupId}";
  var LECTURE_ID = "${lecture.id}";

  // العمود الثاني (1) هو رقم الهاتف (A=0, B=1)
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

    if (scriptField) scriptField.value = scriptTemplate;

    const modal = document.getElementById('lecture-settings-modal');
    if (modal) modal.style.display = 'flex';
}

/**
 * حفظ إعدادات المحاضرة
 */
export async function saveLectureSettings(onSuccess) {
    const idHidden = document.getElementById('edit-lec-id-hidden');
    const nameInput = document.getElementById('edit-lec-name');
    const linkInput = document.getElementById('edit-lec-link');
    const videoInput = document.getElementById('edit-lec-video');

    if (!idHidden || !nameInput) return;

    const lId = idHidden.value;
    const newName = nameInput.value.trim();
    const newLink = linkInput ? linkInput.value.trim() : '';
    const newVideo = videoInput ? videoInput.value.trim() : '';

    if (!newName) {
        showAtharNotification("برجاء إدخال عنوان المحاضرة.", "error");
        return;
    }

    if (!newLink) {
        showAtharNotification("رابط الاختبار / Google Form إجباري.", "warning");
        return;
    }

    const lectureIndex = state.lectures.findIndex(l => l.id === lId);
    if (lectureIndex !== -1) {
        state.lectures[lectureIndex].title = newName;
        state.lectures[lectureIndex].formLink = newLink;
        state.lectures[lectureIndex].videoLink = newVideo;
        await saveData();

        const modal = document.getElementById('lecture-settings-modal');
        if (modal) modal.style.display = 'none';

        showAtharNotification("تم حفظ إعدادات المحاضرة بنجاح ✓", "success");
        if (onSuccess) onSuccess();
    }
}

/**
 * نسخ معرف المحاضرة
 */
export function copyLectureId() {
    const idDisplay = document.getElementById('edit-lec-id-display');
    if (idDisplay && idDisplay.value) {
        navigator.clipboard.writeText(idDisplay.value);
        showAtharNotification("تم نسخ كود المحاضرة بنجاح");
    }
}

/**
 * نسخ اسكريبت الربط لجوجل فورمز
 */
export function copyLectureScript() {
    const scriptField = document.getElementById('edit-lec-script');
    if (scriptField && scriptField.value) {
        navigator.clipboard.writeText(scriptField.value);
        showAtharNotification("تم نسخ اسكريبت الربط بنجاح");
    }
}

/**
 * حذف محاضرة من داخل نافذة الإعدادات
 */
export async function deleteLectureFromSettings(onSuccess) {
    const idHidden = document.getElementById('edit-lec-id-hidden');
    if (!idHidden || !idHidden.value) return;

    const modal = document.getElementById('lecture-settings-modal');
    if (modal) modal.style.display = 'none';

    await deleteLectureFlow(idHidden.value, onSuccess);
}
