# 🌿 منصة أثر التعليمية | Athar Educational Platform

<div align="center">

![منصة أثر](/static/assets/logo.png)

### المنصة الذكية لإدارة ومتابعة طلاب الدورات والبرامج العلمية عبر واتساب بالذكاء الاصطناعي
**A Modern, AI-Powered Student Tracking & WhatsApp Engagement Platform**

[![Firebase Hosting](https://img.shields.io/badge/Hosting-Firebase-orange?logo=firebase)](https://athar-final1.web.app)
[![PWA](https://img.shields.io/badge/PWA-Ready-success?logo=pwa)](https://athar-final1.web.app)
[![AI Engine](https://img.shields.io/badge/AI-Google%20Gemini%203.5-blue?logo=google)](https://ai.google.dev/)
[![Realtime DB](https://img.shields.io/badge/Database-Firebase%20RTDB-yellow?logo=firebase)](https://firebase.google.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

🌐 **الرابط المباشر للمنصة:** [https://athar-final1.web.app](https://athar-final1.web.app)

</div>

---

## 📖 نظرة عامة (Overview)

**منصة أثر التعليمية** هي نظام ويب متكامل وتطبيق ويب تقدمي (PWA) صُمم خصيصاً لتيسير إدارة ومتابعة الحلقات والدورات العلمية والتربوية المكثفة. توفر المنصة للمشرفين أدوات متقدمة لرصد درجات وحضور الطلاب لحظياً، مع دمج قدرات نماذج **Google Gemini 3.5** لصياغة رسائل واتساب شخصية ومحفزة لكل طالب بأسلوب الصديق والأخ الودود، بالإضافة إلى منظف ذكي للبيانات ونظام متكامل للتقارير والشهادات.

---

## ✨ المميزات الرئيسية (Key Features)

### 1. 🤖 المراسلة الجماعية الذكية عبر واتساب (AI WhatsApp Messaging)
- **صياغة شخصية لكل طالب:** يستفيد النظام من نموذج `Gemini 3.5 Flash` لكتابة رسائل تشجيعية دافئة وموجزة (2-3 أسطر) تذكر اسم الطالب وتراعي مرحلته العمرية بدقة (طفل، فتى مراهق، شاب، ناضج).
- **التحكم في موضوع وفكرة الرسالة (Topic-Driven Mode):** إمكانية إدخال موضوع مخصص للحملة (مثل: *تشجيع على الاستدراك قبل الاختبار*، *تهنئة بالتميز*، أو *تذكير بفضل العلم*) ليتولى الذكاء الاصطناعي تكييف الرسائل حوله.
- **إرفاق الروابط الحقيقية فقط:** تضمين روابط الاستماع والاختبار للمحاضرات التي لم يؤدها الطالب مع منع الروابط الوهمية تماماً.
- **طابور الإرسال التفاعلي (Interactive Queue):** واجهة مخصصة للهواتف الذكية تتيح مراجعة وتعديل الرسالة قبل الانتقال التلقائي لمحادثة الواتساب.

### 2. 🧹 المنظف الذكي لقوائم الاستيراد (AI Messy Data Parser)
- استخراج الأسماء وأرقام الهواتف من أي نص عشوائي أو منسوخ من محادثات الواتساب مهما كان غير مرتب (تعداد، أقواس، نصوص زائدة).
- توحيد صيغ الأرقام الدولية والمحلية وتجهيزها للاستيراد المباشر بضغطة زر واحدة أو نسخها للحافظة.

### 3. 📊 لوحة المتابعة والرصد اللحظي (Real-Time Attendance Grid)
- **مزامنة فورية (Firebase Realtime Database):** حفظ التعديلات لحظياً لجميع المشرفين.
- **حفظ موضعي ذكي (In-Place Check):** التفاعل مع خانات الحضور والتاريخ دون إعادة رسم الجدول ودون قفز أو اهتزاز موضع الشاشة.
- **تمرير انسيابي ثنائي الأبعاد (Smooth 2D Scroll):** تصفح المحاضرات والطلاب بسلاسة ووضوح تام.
- **بطاقات الإحصائيات الحية:** عرض إجمالي الطلاب، أعداد الحضور والغياب الحقيقي، ونسب الإنجاز التراكمية.

### 4. 👥 نظام المجموعات والمشرفين (Multi-Tier Supervisory System)
- **مشرف المجموعة (Group Supervisor):** إدارة المحاضرات، إعدادات المجموعة، متابعة أداء المشرفين عبر الرسوم البيانية وتوزيع الطلاب.
- **مشرف المتابعة (Follow-up Supervisor):** متابعة طلابه المخصصين، رصد الحضور، تسجيل الملاحظات التربوية، وإرسال الرسائل.
- **نظام تحويل واستلام الطلاب (Student Transfers):** تسليم دفعات الطلاب بين المشرفين مع نظام قبول/رفض فوري وموثق.

### 5. 📜 نظام الشهادات التلقائي (Automated Certificate Generator)
- تصميم وإصدار شهادات التقدير التلقائية للطلاب المتفوقين بصيغة PDF عالية الجودة.
- تخصيص كامل لمواقع ومحاذاة اسم الطالب، التاريخ، والمحاضرة على قالب الشهادة.

### 6. 📱 تطبيق ويب تقدمي متكامل (Progressive Web App - PWA)
- تثبيت مباشر على جميع الأجهزة (Android, iOS Safari, Windows Desktop, macOS).
- دعم التخزين المؤقت والعمل دون اتصال بالإنترنت عبر **Service Worker (`sw.js`)**.
- أيقونات تكيفية عالية الدقة وبانر تثبيت ذكي وسريع.

---

## 🛠️ البنية التقنية (Tech Stack)

| المكون | التقنية المستخدمة | الوصف |
| :--- | :--- | :--- |
| **الواجهة الأمامية** | Vanilla HTML5 / CSS3 / ES Modules | بنية نظيفة فائقة السرعة بدون أطر عمل ثقيلة |
| **قاعدة البيانات & المصادقة** | Google Firebase (RTDB & Auth) | مزامنة لحظية في الوقت الفعلي مع أمان عالي |
| **محرك الذكاء الاصطناعي** | Google Gemini API (v1beta) | نماذج `gemini-3.5-flash` و `gemini-3.5-flash-lite` |
| **إدارة PWA** | Web App Manifest & Service Worker | دعم التثبيت المباشر وإدارة الكاش |
| **الاستضافة والنشر** | Firebase Hosting | خوادم CDN عالمية سريعة مع شهادة SSL تلقائية |

---

## 📂 هيكل المشروع (Project Structure)

```text
guide-whatsapp/
├── templates/                 # قوالب صفحات المنصة (Jinja2 / Static HTML)
│   ├── base.html              # القالب الأساسي ووسوم PWA
│   ├── login.html             # صفحة تسجيل الدخول وإنشاء الحساب
│   ├── dashboard.html         # لوحة التحكم ومتابعة الطلاب
│   ├── reports.html           # صفحة التقارير وإحصائيات المشرفين
│   └── components/
│       └── modals.html        # النوافذ المنبثقة (الاستيراد، المنظف الذكي، الشهادات...)
├── static/                    # الملفات الثابتة والأصول البرمجية
│   ├── assets/                # الأيقونات، الشعار، وقوالب الشهادات
│   ├── css/                   # التنسيقات (base, components, dashboard, reports...)
│   ├── js/                    # وحدات JavaScript (ES Modules)
│   │   ├── auth.js            # إدارة الجلسات والمصادقة
│   │   ├── dashboard.js       # منطق اللوحة الرئيسية وجدول الطلاب
│   │   ├── firebase-config.js # تهيئة Firebase Client
│   │   ├── messaging.js       # محرك المراسلة والذكاء الاصطناعي (Gemini)
│   │   ├── students.js        # إدارة الطلاب والمنظف الذكي (AI Cleaner)
│   │   ├── lectures.js        # إدارة المحاضرات والاختبارات
│   │   ├── reports-page.js    # منطق صفحة تقارير المشرفين
│   │   ├── pwa.js             # تسجيل Service Worker وإدارة التثبيت
│   │   └── utils.js           # الدوال المساعدة والتنبيهات
│   ├── manifest.json          # بيان تطبيق الويب التقدمي (PWA Manifest)
│   └── sw.js                  # مشغل الـ Service Worker وإدارة الكاش
├── public/                    # مجلد الإخراج الجاهز للنشر المباشر
├── build_static.py            # سكريبت بناء وتجهيز الصفحات للنشر
├── firebase.json              # إعدادات النشر وقواعد التوجيه لـ Firebase
├── database.rules.json        # قواعد أمان قاعدة البيانات
└── README.md                  # توثيق المشروع الشامل
```

---

## 🚀 التثبيت والتشغيل المحلي (Getting Started)

### 1. استنساخ المستودع (Clone Repository)
```bash
git clone https://github.com/hassanrashid111/guide-whatsapp.git
cd guide-whatsapp
```

### 2. تثبيت المتطلبات وبناء الصفحات
```bash
# تثبيت المتطلبات الأساسية
pip install -r requirements.txt

# بناء الملفات الثابتة ونسخ الأصول
python build_static.py
```

### 3. النشر على Firebase Hosting
```bash
firebase deploy --only hosting
```

---

## 👨‍💻 المطور والتواصل (Developer & Contact)

تم تصميم وتطوير هذه المنصة بواسطة:

### **م. حسن راشد (Eng. Hassan Rashed)**
*Software Engineer & Full-Stack Developer*

- 📱 **هاتف / واتساب:** `+201092640962`
- 💬 **مراسلة مباشرة عبر واتساب:** [https://wa.me/201092640962](https://wa.me/201092640962)
- 🐙 **GitHub:** [@hassanrashid111](https://github.com/hassanrashid111)
- 📧 **البريد الإلكتروني:** `hrhalsharif@gmail.com`

---

<div align="center">

**وَقُل رَّبِّ زِدْنِي عِلْمًا**
<br>
© 2026 منصة أثر التعليمية. جميع الحقوق محفوظة.

</div>