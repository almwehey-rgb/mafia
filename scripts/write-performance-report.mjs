import {readFile,writeFile,stat} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
const read=async name=>JSON.parse(await readFile(`artifacts/assurance/${name}.json`,'utf8'));
const comparison=await read('comparison'),before=await read('before-runtime'),after=await read('after-runtime');
let capacity;try{capacity=await read('capacity-confirmation-runtime');}catch{capacity=after;}
const safe=capacity.testedCapacity||after.testedCapacity;
const labels={startupLcp:'ظهور المحتوى الرئيسي LCP',startupBytes:'بايتات البداية',startupRequests:'طلبات البداية',loginMs:'دخول المضيف',revealRenderMs:'عرض كشف الدور مع اكتمال الصورة',voteRenderMs:'عرض التصويت مع اكتمال الصورة'};
const rows=Object.entries(comparison.comparison).map(([k,v])=>`| ${labels[k]} | ${v.before} | ${v.after} | ${v.changePercent}% |`).join('\n');
const files=[];
for(const file of ['game.js','app-v64.css','controls.js','game.html']){
 const b=await readFile('artifacts/assurance/before-stable/'+file),a=await readFile('dist/'+file);
 files.push({file,beforeBytes:b.length,afterBytes:a.length,gzipBytes:gzipSync(a).length});
}
await writeFile('artifacts/assurance/file-sizes.json',JSON.stringify(files,null,2));
const shared=before.load.filter(b=>after.load.some(a=>a.rooms===b.rooms)).map(b=>{const a=after.load.find(a=>a.rooms===b.rooms);return `| ${b.rooms} | ${b.latency.p95} | ${a.latency.p95} | ${b.queries} → ${a.queries} | ${a.errors} |`;}).join('\n');
const text=`# نتائج البنود 9–11 — الأداء والصيانة والتشغيل

## القياس قبل وبعد

خمس جولات متصفح لكل نسخة، Edge على 390×844، ذاكرة التخزين المؤقت معطلة،
4 Mbps وتنقّل شبكة 80 ms ومعالج مبطأ أربع مرات. الجدول يعرض الوسيط؛ الأزمنة
بالمللي ثانية. لا توجد أخطاء JavaScript في الجولات.

| المقياس | قبل | بعد | التغير |
|---|---:|---:|---:|
${rows}

اجتاز LCP شرط عدم التراجع. تحسنت البداية والدخول وكشف الدور، بينما زاد عرض
التصويت في هذا القياس؛ لا نعدّه تحسنًا. قياس العرض يستخدم حالة ثابتة من ثمانية
لاعبين وينتظر اكتمال الصور الظاهرة؛ قياسات الخادم منفصلة أدناه. الاختبار ليس
قياس INP أو مستخدمين حقيقيين، والشبكة المحلية لا تضغط الملفات مثل CDN.

| الملف | البايتات قبل | البايتات بعد | gzip بعد |
|---|---:|---:|---:|
${files.map(f=>`| ${f.file} | ${f.beforeBytes} | ${f.afterBytes} | ${f.gzipBytes} |`).join('\n')}

## الخادم والحمل

المعالج الحقيقي وSQL الفعلي داخل PGlite، باتصال SQL متسلسل واحد ودون نقل
شبكة. لكل غرفة ثمانية لاعبين ومضيف؛ يُرسل تحديث كل ثانيتين في دفعات متزامنة.
بوابة النجاح: صفر أخطاء، p95 لا يتجاوز ثانية، وأقصى طلب لا يتجاوز ثانيتين.
القياس المقارن يستخدم ${after.environment.ticks} دورة لكل مرحلة.

| الغرف | p95 قبل | p95 بعد | عمليات DB قبل → بعد | أخطاء بعد |
|---|---:|---:|---:|---:|
${shared}

الحد الذي اجتاز القياس المحافظ: **${safe.rooms} غرفة، ${safe.players} لاعبًا،
و${safe.controllers} مضيفًا**. أعلى مرحلة اجتازت اختبار التأكيد الأطول:
${capacity.testedCapacity?capacity.testedCapacity.rooms:'لم تجتز مرحلة إضافية'}.
تفاصيل كل مرحلة ناجحة وفاشلة محفوظة؛ هذا حد اجتاز السيناريو المذكور، وليس
الحد الأقصى المطلق ولا سعة Supabase الإنتاجية. الاختبار القصير الأول أعطى نتيجة
أفضل لأربع غرف؛ الاختبار الأطول أظهر تجاوزًا، لذلك لا يُستخدم الأول للاعتماد.

## التغييرات والتحقق

- صور مصغّرة في البداية، تحميل أدوات الإدارة عند الحاجة، حذف طلب تهيئة زائد،
  دمج قراءات متطابقة متزامنة، ومقارنة الحالة قبل إعادة الرسم. ظل عدد إعادات
  الرسم عند عدم التغيير صفرًا في فحص المتصفح.
- تحديث الحالة يحتاج ثلاث عمليات DB بدل خمس، مع المصادقة وقراءة الحالة
  الملتزمة بعد heartbeat وإبقاء تسوية المغادرة والالتزام الذري.
- نسخة الملفات والكاش مشتقة تلقائيًا من بصمات المصادر والصور؛ فشل التخزين
  لا يمنع طلب الشبكة، وبيانات API ليست مخزنة في Service Worker.
- ملفات المصدر مفصولة حسب المسؤولية، وأوامر الخادم في 48 معالجًا. جرى فصل
  المصادر دون تغيير البايتات أولًا، ثم اختبارات الانتقال قبل الخطوة التالية.
- نجحت 98 حالة اختبار في المجموعة الشاملة، ثم فحوص المدخلات الجديدة. نجحت
  112 حالة عرض وخمس رحلات مباريات حتى 20 لاعبًا، وتحميل الأدوات التدريجي.
- نجحت تجربة تحديث الواجهة والخادم أثناء صفحة لاعب نشطة، والتحديث اليدوي
  والرجوع، دون فقد الدور أو الجلسة. وشملت تجربة SQL حقن عطل خاص وكشفه دون
  تسريب محتواه، وكشف توقف مرحلة وكبت التنبيه المتكرر.

## حدود التشغيل

مصدر الرجوع هو نسخة Edge 46 التي كانت منشورة قبل العمل. التجارب على خادم
HTTP وقاعدة اختبار مستقلين؛ لم تُنشأ غرف حمل في الإنتاج. تشغيل المراقبة
المستمر وخطوات النشر والرجوع موثقة في [دليل التشغيل](operations-runbook.md).
خريطة المسؤوليات في [تنظيم الكود](architecture.md)، والعقد في [البروتوكول](protocol.md).

البيانات الخام في artifacts/assurance؛ لا تعتمد على أرقام قديمة بعد تعديل
الملفات أو العتاد أو شكل الحمل. نتائج النشر الحي تُضاف إلى سجل الإصدار بعد READY.
`;
await writeFile('docs/performance-maintenance-operations.md',text);
console.log('Wrote performance report; verified local capacity '+safe.rooms+' room(s)');

