# مافيا — التشغيل المحلي

من هذا المجلد، مع Node.js 24 أو أحدث:

```powershell
npm ci
npm test
npm run test:performance
npm run dev
```

إذا كان Node غير موجود في PATH على جهاز Codex الحالي، استخدم:

```powershell
.\scripts\local-server.ps1
```

افتح http://127.0.0.1:4173/game. رمز دخول المضيف المحلي: `12345678`.
جلسات لاعبين مستقلة متاحة على المنافذ 4174–4177؛ أدخل كود غرفة المضيف فيها.
كل هذه الصفحات تتصل بقاعدة محلية واحدة عبر `/test-api`. يستبدل الخادم عنوان
الإنتاج عند تقديم الملفات فقط؛ لا يغيّر عنوان النشر داخل ملفات التوزيع.

يعيد `npm run dev` و`./scripts/local-server.ps1` بناء الواجهة قبل التشغيل، حتى
تظهر آخر تعديلات القالب والتنسيق. بعد تعديلها أثناء التشغيل، شغّل `npm run build`
ثم حدّث المتصفح. لا يوجد تحديث تلقائي للملفات أثناء التشغيل.

الخادم ينشئ قاعدة PostgreSQL WASM في الذاكرة من bootstrap وجميع migrations.
تُحذف غرف التجربة عند إيقافه، وتحتاج إنشاء غرفة جديدة بعد إعادة التشغيل.
الاتصال محصور بالجهاز الحالي (127.0.0.1)، وليس رابطًا عامًا أو رابط شبكة للجوالات.
لمنفذ آخر، اضبط `PORT`؛ القيمة 0 تختار منافذ متاحة تلقائيًا.

## تأسيس قاعدة Supabase جديدة

ملف `supabase/bootstrap.sql` يوفّر الجداول الأساسية التي تسبق سجل migrations
الموجود. يطبَّق مرة واحدة على قاعدة جديدة فقط، وليس على مشروع منشور له جداول.

ترتيب الإعداد باستخدام psql واتصال القاعدة الجديدة المحدد في `PG*`:

```powershell
psql -v ON_ERROR_STOP=1 -f supabase/bootstrap.sql
if ($LASTEXITCODE -ne 0) { throw 'Bootstrap failed' }
Get-ChildItem supabase/migrations/*.sql | Sort-Object Name | ForEach-Object {
  psql -v ON_ERROR_STOP=1 -f $_.FullName
  if ($LASTEXITCODE -ne 0) { throw "Migration failed: $($_.Name)" }
}
psql -v ON_ERROR_STOP=1 -f supabase/service-access.sql
if ($LASTEXITCODE -ne 0) { throw 'Service access setup failed' }
```

Supabase يوفّر أدوار anon وauthenticated وservice_role. في PostgreSQL مستقل،
يجب على مسؤول القاعدة توفير الأدوار قبل الإعداد. لا تُنسخ أدوار fixture الاختبارات
إلى الإنتاج. يحظر الإعداد القراءة والكتابة المباشرة للمتصفح، ويفعّل RLS؛ وصول
التطبيق يتم من معالج Edge بعد التحقق من الجلسة.

للنشر الجديد يلزم إعداد `SUPABASE_URL` و`SUPABASE_SERVICE_ROLE_KEY` لمعالج Edge،
وضبط عنوان API الأمامي ورمز المضيف الخاص بك في `mafia_host_auth` كـSHA-256.
رمز الاختبار أعلاه يُنشأ داخل الخادم المحلي فقط، وليس ضمن SQL التهيئة.
هذه الخطوات مخصصة للتأسيس اليدوي؛ لا تشغّل migrations وحدها على قاعدة فارغة.

## تحقق الإصلاحات

- `npm test` يشمل اختبارات التزامن والأدوار ودورة المباراة وفحص إصلاحات المراجعة.
- `tests/review-probes.mjs` يبني قاعدة فارغة ويثبت الإصلاحات وصلاحيات الجداول.
- `tests/role-cards-browser.mjs` يفحص البطاقات بـPlaywright على ثلاثة مقاسات شاشة.
  يحتاج تثبيت Playwright أو تحديد `PLAYWRIGHT_MODULE` لمساره المتاح محليًا.
- `scripts/optimize-role-cards.mjs` يعيد إنتاج صور WebP باستخدام sharp؛ يمكن تحديد
  `SHARP_MODULE` لمسار المكتبة. ملفات PNG الأصلية محفوظة، والواجهة تستخدم WebP.

تفاصيل مراجعة ما قبل الإصلاح في `docs/local-review-2026-09-13.md`، ونتائج
الإصلاح في `docs/local-fixes-2026-09-13.md`.

## بناء الواجهة

شغّل `npm run build` بعد تعديل التنسيق أو القالب. قالب الصفحة في `scripts/game-template.html`، وملفا `dist/game.html` و`dist/index.html` وملف التنسيق المجمّع نواتج مولّدة. تجهيز النشر يعيد البناء تلقائيًا.

مصادر منطق الواجهة في `src/client`، ومصادر الخادم في `src/server`. يولّد البناء
`dist/game.js` و`supabase/functions/mafia-room/index.ts`؛ عدّل المصادر بدل النواتج.
تُحدّث بصمات الملفات ونسخة الكاش تلقائيًا عند البناء.

تشغيل الفحوص الشاملة: `npm run preflight`. تجربة التحديث والرجوع:
`npm run test:operations` و`node tests/deployment-browser.mjs` (يتطلب Playwright).
القياسات: `npm run benchmark:runtime` و`npm run benchmark:browser`؛ التفاصيل
والقيود في `docs/operations-runbook.md`، وخريطة الكود في `docs/architecture.md`.
