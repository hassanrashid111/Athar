/**
 * منصة أثر التعليمية - التقارير والتصدير والنسخ الاحتياطي (Reports, Export & Backup)
 */

import { db, ref, get } from "./firebase-config.js";
import { state, saveData } from "./state.js";
import { showAtharNotification, showAtharConfirm } from "./utils.js";

/**
 * رسم جدول تقارير المشرفين لمشرف المجموعة
 */
export function renderReports(allStudentsData) {
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

    const supervisorUids = Object.keys(allStudentsData || {});
    if (supervisorUids.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="${6 + lectures.length}" style="text-align:center; padding: 20px;">لا يوجد مشرفين منضمين لهذه المجموعة حتى الآن.</td></tr>`;
        return;
    }

    tableBody.innerHTML = `<tr><td colspan="${6 + lectures.length}">جاري جلب بيانات المشرفين...</td></tr>`;

    const supervisorPromises = supervisorUids.map(async (uid, idx) => {
        try {
            const supData = allStudentsData[uid];
            if (!supData) return '';

            let supervisorName = supData.name;
            const students = Array.isArray(supData) ? supData : (supData.students || []);

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
            activeStudents.forEach(s => {
                let c = 0;
                lectures.forEach(l => {
                    const p = s.progress ? s.progress[l.id] : null;
                    if (p && p !== 'replied') c++;
                });
                const studentPct = lectures.length > 0 ? (c / lectures.length) * 100 : 0;
                totalStudentPercentages += studentPct;
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
                        onclick="window.app.showSupervisorFullReport(event, '${uid}')" 
                        style="color: var(--primary-green); font-weight: bold; cursor: pointer;"
                        title="انقر لعرض تقرير المشرف المفصل"
                    >
                        ${supervisorName}
                    </td>
                    <td>${activeStudents.length} طالب</td>
                    <td 
                        onclick="window.app.showSupervisorMsgTypes(event, '${uid}')" 
                        style="cursor: pointer; font-weight: bold; color: var(--accent-gold);"
                        title="انقر لعرض تفاصيل أنواع الرسائل"
                    >
                        ${msgCount} رسالة
                    </td>
                    ${lecturePercentagesHtml}
                    <td><strong>${avgScore}%</strong></td>
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
        tableBody.innerHTML = `<tr><td colspan="${colspan}" style="color:red; text-align:center;">حدث خطأ أثناء تجميع التقارير.</td></tr>`;
    });
}

/**
 * فتح تقرير المشرف الكامل في نافذة منبثقة
 */
export async function showSupervisorFullReport(e, uid) {
    if (e && e.preventDefault) e.preventDefault();

    const supData = state.allSupervisorsData ? state.allSupervisorsData[uid] : null;
    if (!supData) return;

    let supervisorName = supData.name;
    const students = Array.isArray(supData) ? supData : (supData.students || []);

    if (!supervisorName || supervisorName.trim() === "") {
        try {
            const userSnapshot = await get(ref(db, `users/${uid}`));
            supervisorName = userSnapshot.exists() ? userSnapshot.val().name : `مشرف (${uid.substr(0, 5)}...)`;
        } catch (err) {
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

    const titleElem = document.getElementById('sup-report-title');
    const textElem = document.getElementById('sup-report-text');
    const downloadBtn = document.getElementById('download-sup-report-btn');

    if (titleElem) titleElem.innerText = `تقرير المشرف: ${supervisorName}`;
    if (textElem) textElem.value = reportText;

    if (downloadBtn) {
        downloadBtn.onclick = () => {
            const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Report_${supervisorName}_${new Date().toISOString().slice(0, 10)}.txt`;
            link.click();
        };
    }

    const modal = document.getElementById('supervisor-report-modal');
    if (modal) modal.style.display = 'flex';
}

/**
 * فتح تفاصيل أنواع الرسائل المرسلة للمشرف
 */
export function showSupervisorMsgTypes(e, uid) {
    if (e && e.preventDefault) e.preventDefault();

    const supData = state.allSupervisorsData ? state.allSupervisorsData[uid] : null;
    if (!supData) return;

    const supervisorName = supData.name || "المشرف";
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
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb; margin-bottom: 8px;">
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

    const titleElem = document.getElementById('msg-details-title');
    const container = document.getElementById('msg-details-container');

    if (titleElem) titleElem.innerText = `إحصائيات رسائل: ${supervisorName}`;
    if (container) container.innerHTML = html;

    const modal = document.getElementById('msg-details-modal');
    if (modal) modal.style.display = 'flex';
}

/**
 * تصدير البيانات إلى ملف Excel
 */
export function exportToExcel() {
    if (typeof XLSX === 'undefined') {
        showAtharNotification('مكتبة Excel غير محملة', 'error');
        return;
    }

    const activeStudents = state.students.filter(s => !s.deleted);
    if (activeStudents.length === 0) {
        showAtharNotification('لا يوجد طلاب لتصديرهم', 'error');
        return;
    }

    const data = [];
    const header = ['#', 'اسم الطالب', 'رقم الهاتف'];
    state.lectures.forEach(l => header.push(l.title));
    header.push('النسبة');
    data.push(header);

    activeStudents.forEach((s, i) => {
        const row = [i + 1, s.name, s.phone];
        let c = 0;

        state.lectures.forEach(l => {
            const p = s.progress ? s.progress[l.id] : null;
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

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "سجل المتابعة");
    XLSX.writeFile(wb, `Athar_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showAtharNotification("تم تصدير ملف الإكسيل بنجاح");
}

/**
 * استخراج تقرير نصي شامل
 */
export function getReportFile() {
    const activeStudents = state.students.filter(s => !s.deleted);
    const totalActive = activeStudents.length;
    const noWelcomeReplyCount = activeStudents.filter(s => s.name.trim().length === 0).length;

    const supervisorName = state.userInfo?.name || "غير معروف";
    const groupName = state.groupInfo?.name || "غير محدد";
    const groupNumber = state.groupInfo?.number || "غير محدد";

    let reportText = `=== تقرير منصة أثر التعليمية ===\n\n`;
    reportText += `اسم المجموعة: ${groupName} (${groupNumber})\n`;
    reportText += `إجمالي الرسائل المرسلة: ${state.userInfo?.msgCount || 0}\n`;
    reportText += `اسم المشرف: ${supervisorName}\n`;
    reportText += `تاريخ الاستخراج: ${new Date().toLocaleDateString('ar-EG')}\n\n`;
    reportText += `عدد الطلاب النشطين (العدد الفعلي): ${totalActive}\n\n`;
    reportText += `⚠️ طلبة لم ترد على رسالة الترحيب (بدون اسم): ${noWelcomeReplyCount}\n\n`;
    reportText += `----------------------------------------\n`;
    reportText += `📊 تفاصيل المحاضرات:\n----------------------------------------\n`;

    state.lectures.forEach((lec, index) => {
        const presentCount = activeStudents.filter(s => s.progress && s.progress[lec.id] && s.progress[lec.id] !== 'replied').length;
        const repliedCount = activeStudents.filter(s => s.progress && s.progress[lec.id] === 'replied').length;
        const realAbsentCount = activeStudents.filter(s => (!s.progress || !s.progress[lec.id]) && s.name && s.name.trim().length > 0).length;
        const attendancePct = totalActive > 0 ? Math.round((presentCount / totalActive) * 100) : 0;

        reportText += `\n${index + 1}. محاضرة: ${lec.title}\n`;
        reportText += `   ✅ المختبرون: ${presentCount}\n`;
        reportText += `   💬 رد ولم يختبر: ${repliedCount}\n`;
        reportText += `   ❌ غياب (لم يرد ولم يختبر): ${realAbsentCount}\n`;
        reportText += `   📊 نسبة الحضور الفعلي: ${attendancePct}%\n`;
        reportText += `----------------------------------------`;
    });

    reportText += `\n\n📈 ملخص عام:\n----------------------------------------\n• إجمالي المحاضرات: ${state.lectures.length}\n\nتم استخراج هذا التقرير آلياً.`;

    const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Athar_Report_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * تنزيل نسخة احتياطية من البيانات
 */
export function backupData() {
    const backup = {
        students: state.students,
        lectures: state.lectures,
        settings: state.settings,
        date: new Date().toISOString()
    };

    const dataStr = JSON.stringify(backup, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `Athar_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * استعادة نسخة احتياطية
 */
export async function restoreData(input, onSuccess) {
    const file = input.files[0];
    if (!file) return;

    const isConfirmed = await showAtharConfirm("استرجاع البيانات", "تحذير: استرجاع النسخة سيحذف البيانات الحالية ويستبدلها بالنسخة. هل أنت متأكد؟");
    if (!isConfirmed) {
        input.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data.students && data.lectures) {
                state.students = data.students;
                state.lectures = data.lectures;
                if (data.settings) state.settings = data.settings;

                await saveData();
                showAtharNotification("✅ تم استرجاع البيانات بنجاح!");
                if (onSuccess) onSuccess();
            } else {
                showAtharNotification("❌ ملف غير صالح.", 'error');
            }
        } catch (err) {
            showAtharNotification("❌ حدث خطأ أثناء قراءة الملف: " + err, 'error');
        }
    };
    reader.readAsText(file);
}
