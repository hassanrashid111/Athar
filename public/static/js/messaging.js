/**
 * منصة أثر التعليمية - المراسلة الجماعية الذكية عبر واتساب والذكاء الاصطناعي (WhatsApp & AI Messaging System)
 */

import { state, currentUser, saveData } from "./state.js";
import {
    showAtharNotification, showAtharChoice, showAtharPrompt, showAtharConfirm,
    cleanPhone, getInitials, isMobileDevice, getStudentTotalScore
} from "./utils.js";
import { db, ref, update } from "./firebase-config.js";

const GEMINI_API_KEY = atob("QVEuQWI4Uk42SmlicmNqMlpyLWxkdVRQdFZfTE4xMmREaU5EdzN0bUg2WXYtY08xclBseFE=");

let mobileQueueState = {
    targets: [],
    messageText: '',
    customTopic: '',
    includeName: false,
    currentIndex: 0,
    lecIndex: null,
    sentCount: 0,
    filterChoice: null,
    isAIMode: false
};

/**
 * توليد رسالة واتساب مخصصة بالذكاء الاصطناعي بناءً على موضوع الرسالة وحالة الطالب وعمره
 */
export async function generateAIMessageForStudent(student, lectures, customTopic = '') {
    const rawName = (student.name || "أخي الكريم").trim();
    const firstName = rawName.split(' ')[0] || "أخي الكريم";
    const totalLec = lectures.length || 0;
    const latestLec = totalLec > 0 ? lectures[totalLec - 1] : null;

    let attendedCount = 0;
    let lastLecAttended = false;
    let lastLecReplied = false;

    if (totalLec > 0 && latestLec) {
        if (student.progress) {
            for (const lec of lectures) {
                const p = student.progress[lec.id];
                if (p && p !== 'replied') attendedCount++;
            }
            const lastP = student.progress[latestLec.id];
            if (lastP && lastP !== 'replied') lastLecAttended = true;
            else if (lastP === 'replied') lastLecReplied = true;
        }
    }

    // تجهيز الروابط الحقيقية فقط للمحاضرة الأخيرة (إذا لم يكن الطالب قد اختبرها بعد)
    let linksInstruction = "";
    let videoUrl = (latestLec && latestLec.videoLink) ? latestLec.videoLink.trim() : "";
    let testUrl = (latestLec && latestLec.formLink) ? latestLec.formLink.trim() : "";

    if (!lastLecAttended && latestLec) {
        let linksList = [];
        if (videoUrl) linksList.push(`• رابط الاستماع: ${videoUrl}`);
        if (testUrl) linksList.push(`• رابط الاختبار: ${testUrl}`);

        if (linksList.length > 0) {
            linksInstruction = `الروابط المطلوب إرفاقها في نهاية الرسالة:\n${linksList.join('\n')}`;
        } else {
            linksInstruction = `تنبيه: لا توجد روابط لهذه المحاضرة، لا تبتكر روابط وهمية.`;
        }
    } else {
        linksInstruction = `تنبيه: الطالب أتم الاختبار، لا تضع روابط واكتفِ بثناء قصير ودعاء.`;
    }

    // تشخيص الأداء التربوي
    let studentStatusDesc = "";
    if (lastLecAttended && attendedCount === totalLec) {
        studentStatusDesc = "طالب متميز جداً ومواظب على جميع المحاضرات والاختبارات.";
    } else if (lastLecReplied) {
        studentStatusDesc = "طالب تواصل معنا سابقاً لكنه لم يؤدِ اختبار المحاضرة الأخيرة.";
    } else if (lastLecAttended) {
        studentStatusDesc = "طالب أتم المحاضرة الأخيرة بنجاح.";
    } else if (attendedCount > 0 && !lastLecAttended) {
        studentStatusDesc = `طالب غائب عن (${latestLec?.title || 'المحاضرة الأخيرة'}).`;
    } else {
        studentStatusDesc = "طالب مسجل في الدورة ولم يبدأ بعد.";
    }

    // تحليل الفئة العمرية داخلياً لضبط أسلوب الخطاب بدون ذكر رقم السن
    let ageToneGuidance = "خاطبه كصديق وأخ شاب، بنبرة ودية محفزة.";
    const age = parseInt(student.age);
    if (!isNaN(age) && age > 0) {
        if (age < 13) {
            ageToneGuidance = "الطالب طفل: خاطبه كبطل شاطر بأسلوب مرح ومشجع وبسيط.";
        } else if (age >= 13 && age <= 17) {
            ageToneGuidance = "الطالب فتى مراهق: خاطبه كصديق أكبر بأسلوب حماسي وطموح.";
        } else if (age >= 18 && age <= 35) {
            ageToneGuidance = "الطالب شاب: خاطبه كصديق مقرب ورفيق درب في الإنجاز.";
        } else {
            ageToneGuidance = "الطالب رجل ناضج/كبير سن: خاطبه بتقدير ومودة وأخوة صادقة.";
        }
    }

    // تضمين تعليمات المشرف العامة الخاصة
    const supervisorCustomInstructions = state.userInfo?.aiInstructions || "";
    let customInstructionsBlock = "";
    if (supervisorCustomInstructions.trim()) {
        customInstructionsBlock = `\n- توجيهات إضافية عامة من المشرف: "${supervisorCustomInstructions.trim()}"\n`;
    }

    // تجهيز موضوع الرسالة المحدد من المشرف لهذه الحملة
    let topicSection = "";
    if (customTopic && customTopic.trim()) {
        topicSection = `\nموضوع وفكرة الرسالة المطلوب منك التركيز عليها وصياغتها لكل طالب:\n"${customTopic.trim()}"\n`;
    }

    const prompt = `أنت صديق مقرب وأخ ودود جداً للطالب (${firstName}) في الدورة العلمية، تكتب له رسالة واتساب مشجعة من قلبك.
${topicSection}
معلومات الطالب:
- اسم الطالب: ${rawName}
- الحالة: ${studentStatusDesc}
- توجيه النبرة حسب العمر: ${ageToneGuidance}
${student.notes ? `- ملاحظات المشرف السابقة: ${student.notes}` : ''}
${linksInstruction}
${customInstructionsBlock}

القواعد الأساسية:
1. صُغ رسالة شخصية ومميزة ${customTopic ? 'حول الموضوع والفكرة المحددة أعلاه ' : ''}بأسلوب الأخ والصديق المحب، واذكر اسمه في البداية (مثل: هلا يا ${firstName} أو السلام عليكم يا ${firstName}).
2. الطول: سطرين إلى 3 أسطر مناسبة للواتساب + الروابط (إن وُجدت في المعطيات).
3. رسالة واحدة مباشرة فقط لا غير (ممنوع كتابة أي خيارات أو عناوين أو مقدمات).
4. ممنوع ذكر أنك ذكاء اصطناعي أو ذكر اسم المنصة أو نسب الحضور.
5. ممنوع استخدام علامات ماركداون (لا تضع ** أو #)، واستخدم إيموجي لطيف ومناسب.
6. إذا وُجدت روابط أعلاه، ضعها كما هي في نهاية الرسالة.`;

    // قائمة نماذج Gemini الموثوقة والسريعة
    const modelsToTry = [
        'gemini-3.5-flash',
        'gemini-3.5-flash-lite',
        'gemini-3-flash-preview',
        'gemini-3.1-flash-lite'
    ];

    for (const modelName of modelsToTry) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.7
                    }
                })
            });

            if (response.ok) {
                const data = await response.json();
                let generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
                generatedText = generatedText.replace(/\*\*/g, '').replace(/###/g, '').replace(/---/g, '').trim();

                if (generatedText) {
                    return generatedText;
                }
            }
        } catch (e) {
            console.warn(`Error generating with model ${modelName}:`, e);
        }
    }

    // صياغة احتياطية سريعة وموجزة في حال انقطاع الشبكة
    let fallbackLinks = "";
    if (!lastLecAttended && (videoUrl || testUrl)) {
        fallbackLinks = "\n";
        if (videoUrl) fallbackLinks += `\n🎧 رابط المحاضرة: ${videoUrl}`;
        if (testUrl) fallbackLinks += `\n📝 رابط الاختبار: ${testUrl}`;
    }

    if (customTopic && customTopic.trim()) {
        return `هلا يا ${firstName} 👋 ${customTopic.trim()} ✨ وأتمنى لك دوام التوفيق والبركة! 🌟${fallbackLinks}`;
    } else if (lastLecAttended && attendedCount === totalLec) {
        return `هلا يا ${firstName} 👋 عاش يا بطل، فخور جداً بهمّتك وتميزك المستمر في الدورة! استمر يا غالي 🌟`;
    } else if (lastLecReplied) {
        return `هلا يا ${firstName} 👋 تسلم على تواصلك، حبيت أذكرك على السريع باختبار ${latestLec?.title || 'المحاضرة'} ✨${fallbackLinks}`;
    } else if (!lastLecAttended && attendedCount > 0) {
        return `هلا يا ${firstName} 👋 مكانك كان فاضي في ${latestLec?.title || 'الدرس الأخير'}، يلا ننتظرك يا بطل بهمتك المعتادة 🌿${fallbackLinks}`;
    } else {
        return `هلا يا ${firstName} 👋 حابب أشجعك تبدأ معنا وتستفيد من دروس الدورة المباركة، وربنا يوفقك دائماً 🌸${fallbackLinks}`;
    }
}

/**
 * فتح نافذة تعليمات الذكاء الاصطناعي للمشرف
 */
export function openAIInstructionsModal() {
    document.querySelectorAll('.dropdown-content').forEach(d => {
        d.classList.remove('show');
        d.style.display = 'none';
    });

    const modal = document.getElementById('ai-instructions-modal');
    const textarea = document.getElementById('supervisor-ai-instructions');
    
    if (!modal) {
        console.error("ai-instructions-modal not found!");
        return;
    }

    if (textarea) {
        textarea.value = state.userInfo?.aiInstructions || "";
    }

    modal.style.display = 'flex';
}

/**
 * حفظ تعليمات الذكاء الاصطناعي الخاصة بالمشرف
 */
export async function saveAIInstructions() {
    const textarea = document.getElementById('supervisor-ai-instructions');
    if (!textarea) return;

    const instructions = textarea.value.trim();
    const uid = currentUser?.uid;

    if (!uid) {
        showAtharNotification("يرجى تسجيل الدخول أولاً", "error");
        return;
    }

    try {
        await update(ref(db, `users/${uid}`), {
            aiInstructions: instructions
        });

        if (state.userInfo) {
            state.userInfo.aiInstructions = instructions;
        }

        const modal = document.getElementById('ai-instructions-modal');
        if (modal) modal.style.display = 'none';

        showAtharNotification("تم حفظ تعليمات الذكاء الاصطناعي بنجاح ✓", "success");
    } catch (error) {
        console.error("Save AI Instructions error:", error);
        showAtharNotification("حدث خطأ أثناء الحفظ: " + error.message, "error");
    }
}

// إتاحة الدوال على كائن window مباشرة
window.openAIInstructionsModal = openAIInstructionsModal;
window.saveAIInstructions = saveAIInstructions;

/**
 * بدء عملية إرسال الرسائل
 */
export async function startMessagingFlow() {
    const msgTextElem = document.getElementById('message-text');
    const msgText = msgTextElem ? msgTextElem.value.trim() : '';

    if (state.lectures.length === 0) {
        showAtharNotification('لا توجد محاضرات في النظام بعد.', 'error');
        return;
    }

    // تفعيل وضع الذكاء الاصطناعي إذا ترك المشرف المربع فارغاً
    const isAIMode = (msgText === '');
    let customTopic = '';

    if (isAIMode) {
        // خطوة إدخال موضوع الرسالة قبل اختيار الفئة
        const topicInput = await showAtharPrompt(
            "موضوع الرسالة (الذكاء الاصطناعي)",
            "أدخل موضوع أو فكرة الرسالة التي تريد من الذكاء الاصطناعي صياغة رسائل الطلاب حولها:\n\n(مثال: تشجيع على مراجعة ما فات، تهنئة بالتميز، سؤال عن سبب التأخر... أو اتركه فارغاً للصياغة التلقائية)",
            ""
        );

        if (topicInput === null) return; // تم الضغط على إلغاء
        customTopic = topicInput.trim();
    }

    const latestLecIndex = state.lectures.length - 1;
    const latestLec = state.lectures[latestLecIndex];

    let filterChoice;
    let targetsRaw = [];

    if (state.userInfo && state.userInfo.role === 'group_supervisor') {
        // فئات مشرف المجموعة
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

        let supCounter = 0;
        for (const uid in state.allSupervisorsData) {
            const supData = state.allSupervisorsData[uid];
            if (!supData) continue;
            supCounter++;

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

            if (matches && supData.phone) {
                targetsRaw.push({
                    id: uid,
                    primarySerial: supCounter,
                    name: supData.name || "مشرف",
                    phone: cleanPhone(supData.phone),
                    isSupervisor: true
                });
            }
        }
    } else {
        // فئات مشرف المتابعة (للطلاب)
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

        state.students.forEach((s, idx) => {
            if (s.deleted === true) return;
            const p = s.progress ? s.progress[latestLec.id] : null;
            const hasName = s.name && s.name.trim().length > 0;
            const isReplied = (p === 'replied');
            const isTested = (p && p !== 'replied');

            let matches = false;
            switch (filterChoice) {
                case '1': matches = (!p && hasName); break;
                case '2': matches = isReplied; break;
                case '3': matches = (!isTested && !hasName); break;
                case '4': matches = !isTested; break;
                case '5': matches = isTested; break;
                case '6': matches = true; break;
                default: matches = false;
            }

            if (matches) {
                targetsRaw.push({
                    id: s.id,
                    primarySerial: idx + 1,
                    name: s.name,
                    phone: cleanPhone(s.phone),
                    progress: s.progress || {},
                    notes: s.notes || '',
                    age: s.age || ''
                });
            }
        });
    }

    if (targetsRaw.length === 0) {
        const entityName = state.userInfo?.role === 'group_supervisor' ? 'مشرفين' : 'طلاب';
        showAtharNotification(`لا يوجد ${entityName} في هذه الفئة!`, 'info');
        return;
    }

    // نقطة البداية
    const firstSerial = targetsRaw[0].primarySerial;
    const lastSerial = targetsRaw[targetsRaw.length - 1].primarySerial;
    const isSup = state.userInfo?.role === 'group_supervisor';

    let modeDescription = "";
    if (isAIMode && customTopic) {
        modeDescription = `✨ صياغة ذكية بالذكاء الاصطناعي حول موضوع: "${customTopic}"`;
    } else if (isAIMode) {
        modeDescription = `✨ صياغة تلقائية بالذكاء الاصطناعي (AI)`;
    } else {
        modeDescription = `📝 نص القالب الثابت`;
    }

    const startSerialInput = await showAtharPrompt(
        "تحديد نقطة البداية",
        `تحتوي الفئة المحددة على (${targetsRaw.length}) ${isSup ? 'مشرف' : 'طالب'}.\n\nالنمط: ${modeDescription}\n\nأدخل رقم ${isSup ? 'المشرف' : 'الطالب'} الأساسي (# في الجدول) الذي تريد البدء من عنده:\n(الأرقام المتاحة تبدأ من #${firstSerial} حتى #${lastSerial})`,
        firstSerial.toString()
    );
    if (startSerialInput === null) return;

    let enteredSerial = parseInt(startSerialInput.trim());
    let startIdx = 0;

    if (!isNaN(enteredSerial)) {
        const matchIndex = targetsRaw.findIndex(t => t.primarySerial >= enteredSerial);
        if (matchIndex !== -1) {
            startIdx = matchIndex;
        } else {
            startIdx = targetsRaw.length - 1;
        }
    }

    const targetObject = targetsRaw[startIdx];
    const remainingCount = targetsRaw.length - startIdx;

    const startConfirm = await showAtharConfirm(
        "تأكيد بدء الإرسال",
        `✅ تم ضبط نقطة الانطلاق:\n\n• البدء من: ${targetObject.name}\n• رقم ${isSup ? 'المشرف' : 'الطالب'} الأساسي: #${targetObject.primarySerial.toString().padStart(3, '0')}\n• نمط المراسلة: ${modeDescription}\n• إجمالي المستهدفين: (${remainingCount}) ${isSup ? 'مشرف' : 'طالب'}\n\nهل تود المتابعة؟`
    );
    if (!startConfirm) return;

    let finalTargets = targetsRaw.slice(startIdx);

    const btn = document.querySelector('.btn-whatsapp');
    const originalBtnText = btn ? btn.innerHTML : '';
    const includeName = false;

    // الموبايل أو نمط الذكاء الاصطناعي يعتمد على الطابور التفاعلي
    if (isMobileDevice() || isAIMode) {
        initMobileQueue(finalTargets, msgText, customTopic, includeName, latestLecIndex, filterChoice, isAIMode);
        return;
    }

    // في حال الحاسوب مع نص ثابت (Selenium Automation)
    const BATCH_SIZE = 200;
    const totalBatches = Math.ceil(finalTargets.length / BATCH_SIZE);

    try {
        let totalSentStudents = 0;
        let campaignCounted = false;

        for (let i = 0; i < totalBatches; i++) {
            const start = i * BATCH_SIZE;
            const end = start + BATCH_SIZE;
            const currentBatch = finalTargets.slice(start, end);

            if (btn) {
                btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري إرسال الدفعة ${i + 1} من ${totalBatches}...`;
                btn.disabled = true;
            }

            const response = await fetch('/api/send_whatsapp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targets: currentBatch,
                    message: msgText,
                    include_name: includeName
                })
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || `فشل إرسال الدفعة ${i + 1}`);
            }

            totalSentStudents += currentBatch.length;

            if (state.userInfo && state.userInfo.role === 'followup_supervisor') {
                if (!state.userInfo.msgCount) state.userInfo.msgCount = 0;
                if (!state.userInfo.msgTypesCount) state.userInfo.msgTypesCount = {};

                if (!campaignCounted) {
                    state.userInfo.msgCount++;
                    campaignCounted = true;
                }

                if (!state.userInfo.msgTypesCount[latestLecIndex]) {
                    state.userInfo.msgTypesCount[latestLecIndex] = {};
                }

                const catMap = {
                    '1': 'real_absent',
                    '2': 'replied_not_tested',
                    '3': 'unregistered',
                    '4': 'all_absent',
                    '5': 'tested_only',
                    '6': 'everyone'
                };
                const catKey = catMap[filterChoice] || 'other';

                state.userInfo.msgTypesCount[latestLecIndex][catKey] =
                    (state.userInfo.msgTypesCount[latestLecIndex][catKey] || 0) + currentBatch.length;

                await saveData();
            }

            showAtharNotification(`✅ تم إرسال الدفعة ${i + 1} بنجاح (${currentBatch.length} مستلم)`, 'success');
        }

        showAtharNotification(`🎉 اكتمل الإرسال بنجاح! إجمالي المستلمين: ${totalSentStudents}`, 'success');
    } catch (err) {
        console.error("Selenium Error:", err);
        showAtharNotification(`خطأ في الإرسال: ${err.message}`, 'error');
    } finally {
        if (btn) {
            btn.innerHTML = originalBtnText;
            btn.disabled = false;
        }
    }
}

/**
 * تهيئة طابور الإرسال التفاعلي للأجهزة الذكية والذكاء الاصطناعي
 */
export function initMobileQueue(targets, msg, topic, incName, lIdx, fChoice, isAIMode = false) {
    mobileQueueState = {
        targets: targets,
        messageText: msg,
        customTopic: topic || '',
        includeName: incName,
        currentIndex: 0,
        lecIndex: lIdx,
        sentCount: 0,
        filterChoice: fChoice,
        isAIMode: isAIMode
    };

    const statusRow = document.getElementById('mobile-send-status');
    const totalCountElem = document.getElementById('mobile-total-count');
    const sentCountElem = document.getElementById('mobile-sent-count');

    if (statusRow) statusRow.style.display = 'block';
    if (totalCountElem) totalCountElem.innerText = targets.length;
    if (sentCountElem) sentCountElem.innerText = "0";

    const modal = document.getElementById('messaging-queue-modal');
    if (modal) modal.style.display = 'flex';

    renderQueueStep();
}

/**
 * رسم الخطوة الحالية في طابور الإرسال ودعم التوليد بالذكاء الاصطناعي
 */
export async function renderQueueStep() {
    const student = mobileQueueState.targets[mobileQueueState.currentIndex];
    if (!student) {
        finishQueue();
        return;
    }

    const nameElem = document.getElementById('queue-student-name');
    const phoneElem = document.getElementById('queue-student-phone');
    const avatarElem = document.getElementById('queue-avatar');
    const progressText = document.getElementById('queue-progress-text');
    const progressBar = document.getElementById('queue-progress-bar');
    const statusBadge = document.getElementById('queue-status-badge');
    const messageInput = document.getElementById('queue-message-input');
    const aiBadge = document.getElementById('queue-ai-badge');
    const sendBtn = document.getElementById('queue-send-btn');
    const nextBtn = document.getElementById('queue-next-btn');

    if (nameElem) nameElem.innerText = student.name;
    if (phoneElem) phoneElem.innerText = student.phone;
    if (avatarElem) avatarElem.innerText = getInitials(student.name);

    const progress = mobileQueueState.currentIndex + 1;
    const total = mobileQueueState.targets.length;

    if (progressText) progressText.innerText = `${progress} / ${total}`;
    if (progressBar) progressBar.style.width = `${(progress / total) * 100}%`;

    if (statusBadge) {
        const serialStr = student.primarySerial ? `#${student.primarySerial.toString().padStart(3, '0')}` : `#${progress}`;
        statusBadge.innerText = `طالب رقم ${serialStr} (${progress} من ${total})`;
    }

    if (aiBadge) {
        if (mobileQueueState.isAIMode) {
            aiBadge.style.display = 'inline-flex';
            if (mobileQueueState.customTopic) {
                aiBadge.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> AI: ${mobileQueueState.customTopic.substring(0, 22)}...`;
            } else {
                aiBadge.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> AI صياغة مخصصة`;
            }
        } else {
            aiBadge.style.display = 'none';
        }
    }

    // إعداد نص الرسالة (سواء بالذكاء الاصطناعي أو بالقالب الثابت)
    if (mobileQueueState.isAIMode) {
        if (messageInput) {
            messageInput.value = "جاري الصياغة بالذكاء الاصطناعي... ⏳";
            messageInput.disabled = true;
        }
        if (sendBtn) sendBtn.disabled = true;

        // استدعاء Gemini API مع موضوع الرسالة المخصص
        const generatedMsg = await generateAIMessageForStudent(student, state.lectures, mobileQueueState.customTopic);

        if (messageInput) {
            messageInput.value = generatedMsg;
            messageInput.disabled = false;
        }
        if (sendBtn) sendBtn.disabled = false;
    } else {
        if (messageInput) {
            const rawName = student.name.trim();
            const firstName = rawName.split(' ')[0] || "الطالب";

            let finalMsg = mobileQueueState.messageText;
            if (finalMsg.includes('{الاسم}')) {
                finalMsg = finalMsg.replace(/{الاسم}/g, firstName);
            } else if (mobileQueueState.includeName) {
                finalMsg = `${firstName}،\n${finalMsg}`;
            }

            messageInput.value = finalMsg;
            messageInput.disabled = false;
        }
        if (sendBtn) sendBtn.disabled = false;
    }

    if (sendBtn) {
        sendBtn.onclick = () => {
            const finalContent = messageInput ? messageInput.value.trim() : "";
            if (!finalContent) {
                showAtharNotification("الرجاء كتابة نص الرسالة", "warning");
                return;
            }

            const waLink = `https://wa.me/${student.phone}?text=${encodeURIComponent(finalContent)}`;
            window.open(waLink, '_blank');

            updateFirebaseCounters();

            mobileQueueState.sentCount++;
            const sentCountElem = document.getElementById('mobile-sent-count');
            if (sentCountElem) sentCountElem.innerText = mobileQueueState.sentCount;
            mobileQueueState.currentIndex++;

            renderQueueStep();
        };
    }

    if (nextBtn) {
        nextBtn.onclick = () => {
            mobileQueueState.currentIndex++;
            renderQueueStep();
        };
    }
}

/**
 * تحديث عدادات الرسائل في Firebase
 */
export async function updateFirebaseCounters() {
    const lIdx = mobileQueueState.lecIndex;
    if (lIdx === null || !state.lectures[lIdx]) return;

    if (state.userInfo && state.userInfo.role === 'followup_supervisor') {
        if (!state.userInfo.msgCount) state.userInfo.msgCount = 0;
        if (!state.userInfo.msgTypesCount) state.userInfo.msgTypesCount = {};

        if (mobileQueueState.sentCount === 0) {
            state.userInfo.msgCount++;
        }

        if (!state.userInfo.msgTypesCount[lIdx]) {
            state.userInfo.msgTypesCount[lIdx] = {};
        }

        const catMap = {
            '1': 'real_absent',
            '2': 'replied_not_tested',
            '3': 'unregistered',
            '4': 'all_absent',
            '5': 'tested_only',
            '6': 'everyone'
        };
        const catKey = catMap[mobileQueueState.filterChoice] || 'other';

        state.userInfo.msgTypesCount[lIdx][catKey] =
            (state.userInfo.msgTypesCount[lIdx][catKey] || 0) + 1;

        await saveData();
    }
}

/**
 * إنهاء الطابور
 */
export function finishQueue() {
    closeMessagingQueue();
    showAtharNotification(`🎉 تم الانتهاء من إرسال ${mobileQueueState.sentCount} رسالة!`, 'success');
}

/**
 * إغلاق نافذة الطابور
 */
export function closeMessagingQueue() {
    const modal = document.getElementById('messaging-queue-modal');
    if (modal) modal.style.display = 'none';
}

/**
 * إدراج المتغير أو موضوع مقترح في نص الرسالة
 */
export function insertVariable(variableText) {
    const textarea = document.getElementById('message-text');
    if (!textarea) return;

    if (variableText === '{الاسم}') {
        const startPos = textarea.selectionStart;
        const endPos = textarea.selectionEnd;
        const text = textarea.value;
        textarea.value = text.substring(0, startPos) + variableText + text.substring(endPos, text.length);
        textarea.focus();
        textarea.selectionStart = startPos + variableText.length;
        textarea.selectionEnd = startPos + variableText.length;
    } else {
        // إدراج موضوع مقترح
        textarea.value = variableText;
        textarea.focus();
    }

    const event = new Event('input', { bubbles: true });
    textarea.dispatchEvent(event);
}

/**
 * تصفير عداد الرسائل
 */
export async function resetMessageCounts() {
    const confirm = await showAtharConfirm("تصفير العدادات", "هل أنت متأكد من تصفير جميع عدادات الرسائل؟");
    if (!confirm) return;

    if (state.userInfo) {
        state.userInfo.msgCount = 0;
        state.userInfo.msgTypesCount = {};
    }

    await saveData();
    showAtharNotification("تم تصفير عداد الرسائل بنجاح ✓", "success");
}

/**
 * بدء طابور المراسلة الفورية لطلاب رادار المتابعة والتسرب بالذكاء الاصطناعي
 */
export async function startRadarAIMessagingFlow(filterType = 'all') {
    const radarModal = document.getElementById('at-risk-radar-modal');
    if (radarModal) radarModal.style.display = 'none';

    const { detectAtRiskStudents } = await import("./pwa.js");
    let atRiskList = detectAtRiskStudents();

    if (filterType === 'high') {
        atRiskList = atRiskList.filter(item => item.riskLevel === 'high');
    }

    if (atRiskList.length === 0) {
        showAtharNotification("لا يوجد طلاب مطابقون في رادار المتابعة لإرسال الرسائل إليهم!", "info");
        return;
    }

    const targetStudents = atRiskList.map(item => item.student);
    const latestLecIndex = state.lectures.length > 0 ? state.lectures.length - 1 : 0;
    const radarTopic = "رسالة تفقد واطمئنان ومتابعة وتشجيع لطالب كان متميزاً وملتزماً وانقطع مؤخراً، مع تحفيزه وتذكيره بأجره وتزويده برابط الاختبار والمحاضرة للعودة.";

    showAtharNotification(`🚀 جاري فتح طابور المراسلة لـ (${targetStudents.length}) طالب مع الصياغة الذكية...`, "info");
    initMobileQueue(targetStudents, "", radarTopic, true, latestLecIndex, 'radar', true);
}

/**
 * مراسلة طالب فردي من رادار المتابعة بالذكاء الاصطناعي
 */
export async function startSingleRadarAIMessage(studentId) {
    const radarModal = document.getElementById('at-risk-radar-modal');
    if (radarModal) radarModal.style.display = 'none';

    const student = (state.students || []).find(s => s.id === studentId);
    if (!student) return;

    const latestLecIndex = state.lectures.length > 0 ? state.lectures.length - 1 : 0;
    const radarTopic = "رسالة تفقد واطمئنان وتشجيع مخصصة من المشرف، مع تذكيره بتميزه وحثه على إكمال المسير وتزويده برابط المحاضرة.";

    initMobileQueue([student], "", radarTopic, true, latestLecIndex, 'radar', true);
}
