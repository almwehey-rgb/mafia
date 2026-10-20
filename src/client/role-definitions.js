const roleNames = {
  mafia_boss: '👑 العرّاب (زعيم المافيا) / Godfather',
  mafia: '🔪 فرد المافيا / Mafioso',
  doctor: '🩺 الطبيب / Doctor',
  detective: '🕵️ المحقق / Detective',
  jailer: '🔐 السجّان / Jailer',
  lawyer: '⚖️ المحامي / Lawyer',
  vigilante: '🎯 القناص / Vigilante',
  witch: '🧪 الساحرة / Witch',
  serial_killer: '🩸 القاتل المتسلسل / Serial Killer',
  jester: '🃏 المهرج / Jester',
  revealer: '📡 الكاشف / Revealer',
  cupid: '💘 كيوبيد / Cupid',
  escort: '🚫 المعطّل / Escort',
  citizen: '🏘️ المواطن / Citizen',
};
const roleDescriptions = {
  mafia_boss: ['فريق المافيا', 'اختر هدف الاغتيال من الأحياء غير نفسك حتى لو كان من المافيا، أو تخطَّ الليلة. قرارك هو النهائي.'],
  mafia: ['فريق المافيا', 'صوّت على هدف الاغتيال من الأحياء غير نفسك حتى لو كان من المافيا، أو تخطَّ الليلة.'],
  doctor: ['فريق القرية', 'تحمي أي لاعب حي، حتى المافيا، كل ليلة من الليلة الثانية حتى نهاية القيم، بدون كشف دوره وبدون حد للاستخدامات. تقدر تحمي نفسك، وتكرار حماية نفس اللاعب يعتمد على إعدادات الغرفة. / Protect any living player, including Mafia or yourself, each night from night two without learning their role. Consecutive protection depends on room settings.'],
  detective: ['فريق القرية', 'افحص لاعبًا واحدًا كل جولة، بعدد جولات يحدده المضيف، واعرف سرًا إن كان مافيا أو بريئًا. / Investigate one player per round for the number of rounds set by the host. Results are private.'],
  jailer: ['فريق القرية', 'اختر سجينًا نهارًا، ثم قرر ليلًا إطلاقه أو إعدامه. لديك 3 إعدامات.'],
  lawyer: ['فريق القرية', 'احمِ أي لاعب من نتيجة التصويت في كل جولة.'],
  vigilante: ['فريق القرية', 'عند خروجك بالتصويت أو اغتيال المافيا، لك طلقة أخيرة على لاعب حي، ثم تتابع فقط. / If voted out or killed by Mafia, take one final shot at a living player, then spectate.'],
  witch: ['فريق القرية', 'لديك جرعة حياة وجرعة سم، وكل جرعة تُستخدم مرة واحدة.'],
  serial_killer: ['دور مستقل', 'اقتل لاعبًا كل ليلة؛ تفوز بعد زوال المافيا عندما تساوي بقية الأحياء أو تتفوق عليهم عددًا.'],
  jester: ['دور مستقل', 'تفوز وحدك إذا صوّت اللاعبون على استبعادك.'],
  revealer: ['فريق القرية', 'تكشف عدد المافيا الأحياء مرة واحدة بالقيم بدون أسماء. اختر الليلة من الليلة الثانية، وتظهر النتيجة بالصباح. / Reveal the surviving Mafia count once per game without names. Choose a night from night two; the result arrives in the morning.'],
  cupid: ['فريق القرية', 'في الليلة الثانية اربط لاعبين؛ موت أحدهما يميت الآخر.'],
  escort: ['فريق القرية', 'عطّل قدرة لاعب واحد خلال هذه الليلة.'],
  citizen: ['فريق القرية', 'راقب وصوّت لكشف المافيا.'],
};
const detailedRoleRules = {
 mafia_boss: ['فريق المافيا','تقود اختيار هدف الاغتيال وتتعاون سرًا مع أعضاء فريقك.','اختر أي لاعب حي غير نفسك، حتى أحد أفراد المافيا، أو تخطَّ الاغتيال. اختيار الزعيم القادر على العمل يتقدم على اختيارات بقية المافيا.','الليلة الأولى للمحقق فقط؛ بدء الاغتيال وتوفره لاحقًا يتبعان إعدادات الغرفة. ظهورك بريئًا للمحقق يعتمد على تفعيل تمويه العرّاب.'],
 mafia: ['فريق المافيا','تعاون مع فريقك سرًا، وناقش نهارًا لإبعاد الشك عنكم.','اختر أي هدف حي غير نفسك، حتى أحد أفراد المافيا أو العرّاب، أو تخطَّ. يُعتمد اختيار الزعيم المتاح؛ وفي غيابه تُستخدم اختيارات الأعضاء لتحديد الهدف.','تستطيع استهداف زميلك لكن لا تستطيع استهداف نفسك. الاغتيال غير متاح في الليلة الأولى، ويتبع بعد ذلك إعدادات الغرفة.'],
 doctor: ['فريق القرية','تحمي أي لاعب حي من هجمات الليل، سواء كان من القرية أو المافيا، بدون كشف دوره.','ابتداءً من الليلة الثانية اختر لاعبًا حيًا كل ليلة. الاستخدامات غير محدودة، ويمكنك اختيار نفسك.','تكرار حماية نفس اللاعب ليلتين متتاليتين يتبع إعدادات الغرفة. الحماية تمنع هجمات المافيا والقاتل والسم، لكنها لا تمنع إعدام السجّان أو الموت بسبب الربط.'],
 detective: ['فريق القرية','تجمع نتائج سرية تساعدك على كشف المافيا أثناء النقاش.','اختر لاعبًا حيًا غير نفسك لفحصه مرة واحدة في الجولة. تبدأ الفحوص من الليلة الأولى، ولعدد الجولات الذي يحدده المضيف. تظهر النتائج بعد حسم الليل.','الفحوص الفائتة لا تتراكم. «بريء» تعني أن الفحص لم يكشف مافيا؛ لا تضمن أن اللاعب من القرية، وقد يظهر العرّاب بريئًا عند تفعيل التمويه.'],
 jailer: ['فريق القرية','تحتجز مشتبهًا به وتقرر إن كان يستحق الإعدام.','اختر نهارًا لاعبًا حيًا غير نفسك ليسجن في الليل التالي. تواصل معه في قناة السجن، ثم اختر العفو أو الإعدام.','لديك 3 إعدامات طوال المباراة. السجين لا ينفذ قدرته الليلية ويحتمي من الهجمات المعتادة؛ إعدامك يتجاوز تلك الحماية.'],
 lawyer: ['فريق القرية','تمنع إقصاء لاعب تختاره بنتيجة تصويت الجولة.','اختر أثناء النهار لاعبًا حيًا لحمايته، ويمكنك اختيار نفسك. تُلغى نتيجة الإقصاء إذا وقعت على اللاعب المحمي.','الحماية خاصة بالتصويت، ولا تحمي من هجمات الليل. اختر من جديد في الجولة التالية؛ الحماية لا تكشف لك دور اللاعب.'],
 vigilante: ['فريق القرية','تملك فرصة أخيرة للتأثير في المباراة عند إقصائك.','إذا أُقصيت بالتصويت أو باغتيال المافيا، تظهر لك طلقة أخيرة لاختيار لاعب حي. ينتظر حسم الفوز انتهاء هذه الفرصة.','لديك طلقة واحدة وليست قدرة ليلية عادية. بعد حسمها تتابع كمشاهد؛ وقد ينهي المضيف فرصة الطلقة بالتخطي.'],
 witch: ['فريق القرية','توازن بين إنقاذ لاعب واستهداف لاعب بجرعة السم.','من الليلة الثانية اختر جرعة حياة لحماية لاعب حي أو جرعة سم لاستهدافه. كل جرعة تُستهلك مرة واحدة عند تنفيذها، وتختار جرعة واحدة في الليلة.','يمكن استخدام الحياة على نفسك، ولا يمكن تسميم نفسك. الحماية قد تنقذ هدف السم. الساحرة محسوبة مع القرية في قواعد هذه النسخة.'],
 serial_killer: ['دور مستقل','تسعى لإخراج منافسيك والفوز بعيدًا عن فريقي القرية والمافيا.','من الليلة الثانية اختر لاعبًا حيًا غير نفسك لاستهدافه كل ليلة. هجومك مستقل عن اختيار المافيا.','الحماية قد تمنع هجومك، والسجن أو التعطيل قد يمنع تنفيذ قدرتك. نتيجة فحصك لدى المحقق تظهر «بريء»، لأنها تفحص انتماء المافيا.'],
 jester: ['دور مستقل','حاول إقناع اللاعبين بإقصائك عن طريق التصويت.','شارك في النقاش والتصويت مثل الآخرين، لكن هدفك أن تكون أنت اللاعب الذي ينتهي التصويت بإقصائه.','لا توجد قدرة ليلية. الموت باغتيال أو قدرة أخرى لا يحقق فوزك؛ يجب تنفيذ إقصائك بالتصويت فعلًا، دون أن تمنعه حماية المحامي.'],
 revealer: ['فريق القرية','تحصل على عدد المافيا الأحياء لتقدير الخطر دون معرفة أسمائهم.','من الليلة الثانية اختر ليلة لاستخدام الكشف، أو تخطَّ لتحتفظ به. تُعرض النتيجة الخاصة بك صباحًا بعد حسم الليل.','الكشف مرة واحدة خلال المباراة. النتيجة تخص الجولة التي استُخدمت فيها ولا تتجدد كل صباح، ولا تكشف أسماء المافيا أو هوياتهم.'],
 cupid: ['فريق القرية','تربط مصير لاعبين معًا، فيصبح موت أحدهما خطرًا على الآخر.','في الليلة الثانية فقط اختر لاعبين مختلفين وأحياء، ولا يمكنك اختيار نفسك. يجب اكتمال الاختيارين لتنفيذ الربط.','إذا مات أحد المرتبطين يموت الآخر تبعًا له. الربط لا يغيّر الأدوار أو يمنح فوزًا مستقلًا، وقد يضر القرية إذا أُسيء اختياره.'],
 escort: ['فريق القرية','تعطّل قدرة لاعب مشتبه به خلال الليل.','ابتداءً من الليلة الثانية اختر لاعبًا حيًا غير نفسك. يمنع التعطيل تنفيذ قدرته الليلية في تلك الليلة.','التعطيل لا يكشف دور الهدف ولا يقصيه. اختيار لاعب من القرية قد يمنع حمايته أو فحصه، لذلك استند إلى النقاش والنتائج المتاحة.'],
 citizen: ['فريق القرية','تعتمد على النقاش والملاحظة والتصويت لاكتشاف أصحاب الأدوار المعادية.','راقب الأقوال والنتائج، وقارن الادعاءات، ثم رشّح وصوّت وفق الأدلة. لا تحتاج إلى اختيار قدرة أثناء الليل.','لا توجد لك قدرة كشف أو حماية سرية. لا تعتبر الاتهام دليلًا قاطعًا، ولا تفترض أن نتيجة «بريء» تكشف الدور الكامل.']
};
function detailedRoleProperties(role, personal=false) {
 if((personal?kidsMode():cardsUseKidsMode())&&kidsRules[role])return kidsRoleProperties(role,personal);
 const rule=detailedRoleRules[role];
 if(!rule)return '';
 const title=role==='mafia_boss'?'زعيم المافيا':roleLabel(role).split(' / ')[0];
 const win=mafiaRoleClient(role)?'يفوز فريق المافيا عندما لا يبقى قاتل متسلسل، ويصبح عدد المافيا مساويًا لبقية الأحياء أو أكبر منهم.':role==='serial_killer'?'تفوز عند عدم بقاء أي مافيا، ووصول عدد القتلة المتسلسلين إلى عدد بقية الأحياء أو تجاوزه.':role==='jester'?'تفوز وحدك بمجرد إقصائك فعليًا بنتيجة التصويت.':'تفوز القرية بعد خروج جميع أفراد المافيا والقتلة المتسلسلين.';
 const sections=[['مهمتك',rule[1]],['استخدام القدرة',rule[2]],['القيود المهمة',rule[3]],['شرط الفوز',win]];
 if(personal&&role==='mafia_boss')sections.push(['إعداد غرفتك',game.enabledRoles?.godfather_innocent?'تمويه العرّاب مفعّل: تظهر بريئًا في فحص المحقق.':'تمويه العرّاب غير مفعّل: يكشفك فحص المحقق كعضو مافيا.']);
 if(personal&&mafiaRoleClient(role))sections.push(['تكرار الاغتيال',game.enabledRoles?.mafia_no_repeat?'ممنوع اختيار هدف الاغتيال نفسه في ليلتين متتاليتين.':'تستطيع المافيا تكرار هدف الاغتيال في ليلتين متتاليتين.']);
 if(personal&&role==='doctor')sections.push(['تكرار الحماية',game.enabledRoles?.doctor_no_repeat?'ممنوع حماية نفس اللاعب في ليلتين متتاليتين.':'تستطيع حماية نفس اللاعب في ليلتين متتاليتين.']);
 if(personal&&role==='detective')sections.push(['إعداد غرفتك',`عدد جولات الفحص المحدد: ${detectiveQuestionCount(game.detectiveQuestions ?? game.detective_questions)}. فحص واحد في كل جولة مؤهلة.`]);
 return `${personal?`<header class="private-role-heading"><small>خصائص دورك</small><h2>${escapeHtml(title)}</h2></header>`:''}<div class="role-rule-sections">${sections.map(([heading,text])=>`<section class="role-rule-item"><h3>${escapeHtml(heading)}</h3><p>${escapeHtml(text)}</p></section>`).join('')}</div>`;
}
function roleLabel(role){
  if(!game?.enabledRoles?.kids_mode)return roleNames[role]||role;
  return kidsNames[role]||roleNames[role]||role;
}
// Kids use the existing authoritative actions, with a fixed, smaller ruleset.
const kidsRoles = ['mafia_boss','detective','doctor','citizen'];
const kidsNames = {mafia_boss:'🍬 الحرامي',mafia:'🍬 الحرامي',detective:'👑 الملك',doctor:'👮 الشرطي',citizen:'🏘️ المواطن'};
const kidsArt = {mafia_boss:'thief',mafia:'thief',detective:'king',doctor:'police',citizen:'citizen'};
const kidsRules = {
  mafia_boss:'أنت أخذت الحلوى! من الليلة الثانية اختر لاعبًا يصير متابعًا، وحاول تخلي هويتك سرًّا.',
  mafia:'أنت أخذت الحلوى! من الليلة الثانية اختر لاعبًا يصير متابعًا، وحاول تخلي هويتك سرًّا.',
  detective:'في الليلة الأولى فقط، اختر لاعبًا واعرف سرًّا إذا هو الحرامي. بعدها ساعد المجموعة بالنقاش والتصويت.',
  doctor:'من الليلة الثانية احمِ لاعبًا كل ليلة من اختيار الحرامي. تقدر تحمي نفسك أو نفس اللاعب مرة ثانية.',
  citizen:'اسمع كلام المجموعة، وقل من تشك فيه وليش. بعدين صوّت على اللي تتوقع أخذ الحلوى.'
};
function kidsMode(){return game?.enabledRoles?.kids_mode===true;}
function kidsDraftSettings(){return {kids_mode:true,doctor:true,detective:true,lawyer:false,jailer:false,vigilante:false,witch:false,serial_killer:false,jester:false,cupid:false,revealer:false,escort:false,reveal_dead_roles:true,allow_no_vote:true,full_trial:false,godfather_innocent:false,mafia_kill_start_round:2,mafia_kill_mode:'after_first',mafia_kill_enabled:true,mafia_no_repeat:false,doctor_no_repeat:false,public_voting:false,discussion_mode:'off',phase_seconds:60,action_deadline:true};}
function kidsDistribution(count){return {mafia:1,doctor:1,detectives:1,lawyer:0,jailer:0,vigilante:0,witch:0,serialKiller:0,jester:0,cupid:0,escort:0,revealer:0,selectedTotal:3,valid:count>=4,citizens:Math.max(0,count-3)};}
function kidsWinText(role){return mafiaRoleClient(role)?'تفوز إذا بقيت أنت ولاعب واحد فقط.':'تفوزون مع بعض إذا طلع الحرامي بالتصويت.';}
function kidsRoleProperties(role,personal){
  return `${personal?`<header class="private-role-heading"><small>دورك السرّي</small><h2>${kidsNames[role]||''}</h2></header>`:''}<div class="role-rule-sections"><section class="role-rule-item"><h3>شنو أسوي؟</h3><p>${kidsRules[role]||''}</p></section><section class="role-rule-item"><h3>شلون أفوز؟</h3><p>${kidsWinText(role)}</p></section></div>`;
}
function kidsHowTo(){return '<p>🍬 اختفت الحلوى! واحد منكم هو الحرامي.</p><ol class="kids-steps"><li>شوف دورك سرًّا واضغط «فهمت دوري».</li><li>بالليل اتبع التعليمات اللي تظهر لك.</li><li>بالنهار كل واحد يقول من يشك فيه وليش.</li><li>صوّتوا: إذا طلع الحرامي فازت المجموعة. غيره يصير متابعًا وتكملون.</li></ol><p>الحرامي يفوز إذا بقي مع لاعب واحد. عند تعادل الأصوات ما يطلع أحد.</p>';}
function kidsSetupPanel(roles){
  const counts={mafia_boss:1,detective:1,doctor:1,citizen:roles.citizens};
  return `<section class="kids-game"><h2>🍬 منو أخذ الحلوى؟</h2><p>قيم أطفال مبسّط · من 4 لاعبين · الأفضل 4–8</p>${kidsHowTo()}<div class="role-gallery kids-gallery">${kidsRoles.map(role=>interactiveRoleCard(role,{review:true,count:counts[role]})).join('')}</div><p>ملك واحد يكشف مرة في البداية، شرطي واحد يحمي من الليلة الثانية، حرامي واحد، والباقي مواطنين. بدون محاكمة أو أدوار إضافية.</p><section class="voting-setting"><h3>منو يدير القيم؟</h3><div class="voting-mode-options"><button class="btn" aria-pressed="${!enabledRoles.automatic_game}" onclick="setAutomaticGame(false)">المضيف</button><button class="btn" aria-pressed="${!!enabledRoles.automatic_game}" onclick="setAutomaticGame(true)">اللعبة تلقائيًا</button></div></section><p>مهلة الاختيارات دقيقة. المضيف يدير النقاش، أو يؤكد الجميع جاهزيتهم في القيم التلقائي.</p>${roles.valid?'':'<p role="status">نحتاج 4 لاعبين على الأقل.</p>'}<button class="btn gold wide" ${roles.valid?'':'disabled'} onclick="startGame()">وزّع الأدوار وابدأ 🍬</button><button class="btn wide" onclick="applyPreset('quick')">الرجوع للمافيا العادية</button><div id="prefsStatus" role="status"></div></section>`;
}
function kidsRoster(final=false){return `<div class="players">${game.players.map(p=>`<div class="player"><span>${p.alive?'🙂':'👀'} ${escapeHtml(p.name)}${final&&p.role?` — ${kidsNames[p.role]||escapeHtml(p.role)}`:''}</span></div>`).join('')}</div>`;}
function kidsResults(){
  const names=(game.lastDeaths||[]).map(id=>escapeHtml(nameOf(id)));
  return `<p>${names.length?'👀 صاروا متابعين: '+names.join('، '):'🌟 الكل كمل معنا!'}</p>`;
}
function kidsInvestigation(){
  if(game.me?.role!=='detective')return '';
  return (game.me.investigationResults||[]).map(r=>`<section class="card kids-clue"><h2>👑 معلومتك السرّية</h2><p>${escapeHtml(r.name)}: <strong>${r.result==='مافيا'?'هو الحرامي 🍬':'مو الحرامي ✅'}</strong></p><small>هذي المعلومة تظهر لك أنت فقط.</small></section>`).join('');
}
function renderKidsNight(){
  const me=game.me, first=game.round===1;
  let title='🌙 انتظر الصباح', body='<p>ما عندك اختيار الحين. خلّ دورك سرًّا.</p>';
  if(me.acted){title='✅ وصل اختيارك';body='<p>انتظر باقي اللاعبين.</p>';}
  else if(first&&me.role==='detective'){
    title='👑 منو تبي تكشف؟';body='<p>اختر واحدًا. نتيجته تظهر لك بالصباح. عندك كشف واحد بالقيم.</p>'+choiceButtons(alivePlayers().filter(p=>p.id!==me.id),'nightAction',{icon:'🔎'});
  }else if(first){body='<p>الملك يختار الحين. باقي الأدوار تبدأ من الليلة الثانية.</p>';}
  else if(mafiaRoleClient(me.role)){
    const team=new Set((me.mafiaTeam||[]).map(p=>p.id));
    title='🍬 منو تختار يصير متابع؟';body=choiceButtons(alivePlayers().filter(p=>p.id!==me.id&&!team.has(p.id)),'nightAction',{icon:'🍬'})+'<button class="pick skip" onclick="nightAction(\'SKIP\')">هالليلة ما أختار أحد</button>';
  }else if(me.role==='doctor'&&me.doctorAvailable){title='👮 منو تحمي الليلة؟';body='<p>الشرطي يمنع الحرامي من إخراج اللاعب اللي تحميه هالليلة.</p>'+choiceButtons(alivePlayers(),'nightAction',{icon:'🛡️'});}
  else if(me.role==='detective'){body='<p>خلص كشفك. استخدم معلومتك وساعد المجموعة بالنقاش.</p>';}
  return `<section class="card kids-game"><h2>${title}</h2>${body}</section>`;
}
function renderKidsPlayer(){
  const me=game.me||{alive:false};
  document.querySelector('.player-tools')?.remove();
  let body='';
  if(game.phase==='finished')body=`<section class="card kids-game"><h1>${winnerTitle()}</h1><p>يعطيكم العافية! نلعب مرة ثانية؟</p>${kidsRoster(true)}</section>`;
  else if(!me.alive)body=`<section class="card kids-game"><h2>👀 الحين أنت متابع</h2><p>تابع أصحابك بدون تلميحات. ترجع تلعب بالقيم الجاي.</p>${kidsRoster()}</section>`;
  else if(game.phase==='paused')body='<section class="card kids-game"><h2>⏸️ استراحة صغيرة</h2><p>انتظر لين يكمل المضيف.</p></section>';
  else if(game.phase==='reveal')body=`<section class="card kids-game"><h2>✅ جاهز!</h2><p>ننتظر الباقي يشوفون أدوارهم.</p><p>${game.roleReadyCount||0} / ${game.players.length}</p></section>`;
  else if(game.phase==='night')body=renderKidsNight();
  else if(game.phase==='day')body=kidsInvestigation()+`<section class="card kids-game"><h2>☀️ منو أخذ الحلوى؟</h2>${kidsResults()}<p>قول من تشك فيه وليش، واسمع كلام أصحابك.</p>${kidsRoster()}</section>`;
  else if(game.phase==='vote')body=`<section class="card kids-game"><h2>🗳️ منو تتوقع الحرامي؟</h2><p>${me.voted?'✅ وصل صوتك! تقدر تغيّره لين تطلع النتيجة.':'اضغط اسم لاعب واحد.'}</p>${choiceButtons(alivePlayers().filter(p=>p.id!==me.id),'castVote',{icon:'🍬'})}<button class="pick skip" onclick="castVote('SKIP')">ما أدري — أتخطى</button></section>`;
  else body='<section class="card kids-game"><h2>انتظر التعليمات من المضيف</h2></section>';
  $('#app').innerHTML=phaseBar()+body;
  if(me.isHost)$('#app').insertAdjacentHTML('beforeend','<button class="btn wide" onclick="toggleDelegatedHost()">إدارة القيم</button>');
}
function renderKidsHost(){
  let title='',body='',action='',label='',disabled=false;
  if(game.phase==='reveal'){title='كل واحد يشوف دوره';body=`<p>الجاهزين: ${game.roleReadyCount||0} / ${game.players.length}</p>`;action='beginNight';label='نبدأ مع الملك 👑';disabled=(game.roleReadyCount||0)<game.players.length;}
  else if(game.phase==='night'){title='🌙 اختيارات سرّية';body=`<p>${game.round===1?'الملك يكشف لاعبًا واحدًا. البقية ينتظرون.':'الحرامي يختار، والشرطي يحمي. البقية ينتظرون.'}</p>`;action='resolveNight';label='نطلع نتيجة الليل ☀️';disabled=!game.nightReady&&!firstNightWithoutDetective()&&!phaseTimeExpired();}
  else if(game.phase==='day'){title='☀️ اسمعوا بعض';body=kidsResults()+'<p>كل واحد يقول من يشك فيه وليش، وبعدها افتح التصويت.</p>';action='startVote';label='نصوّت 🍬';}
  else if(game.phase==='vote'){title='🗳️ منو أخذ الحلوى؟';body=`<p>الأصوات: ${game.voteCount||0} / ${alivePlayers().length}</p>`;action='resolveVote';label='نشوف النتيجة';disabled=(game.voteCount||0)<alivePlayers().length&&!phaseTimeExpired();}
  else if(game.phase==='paused'){title='⏸️ استراحة';action='togglePause';label='نكمل';}
  else if(game.phase==='finished'){title=winnerTitle();body='<p>خلص القيم! نلعب مرة ثانية؟</p><button class="btn gold wide" onclick="startGame()">قيم جديد</button><button class="btn wide" onclick="returnToLobby()">العودة للغرفة</button>';}
  $('#app').innerHTML=`${phaseBar()}<section class="card kids-game"><h1>${title}</h1>${body}${action?`<button class="btn gold wide" ${disabled?'disabled':''} ${['resolveNight','resolveVote'].includes(action)?`data-timeout-action="${action}"`:''} onclick="hostAction('${action}')">${label}</button>`:''}${kidsRoster(game.phase==='finished')}</section>`;
}
