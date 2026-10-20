import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('dist/game.js','utf8');
function fn(name){const start=source.indexOf('function '+name+'(');assert.ok(start>=0,name);const end=source.indexOf('\nfunction ',start+1);return source.slice(start,end<0?source.length:end);}
function client(){
 const app={innerHTML:'',insertAdjacentHTML(where,html){this.innerHTML+=html;}};
 const c=vm.createContext({game:{phase:'night',round:2,enabledRoles:{mafia_recruitment:true},players:[{id:'a',name:'Citizen <script>',alive:true},{id:'b',name:'Boss',alive:true}],me:{id:'b',role:'mafia_boss',mafiaTeam:[{id:'b',name:'Boss'}],recruitment:{canOffer:true}}},enabledRoles:{},discussionText:(ar,en)=>ar,escapeHtml:s=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;'),roleNames:{mafia_boss:'زعيم المافيا'},$:()=>app,document:{getElementById:()=>null,querySelectorAll:()=>[]},Date,discussionClockOffset:0,playerActionPending:false,choiceButtons:(targets,action)=>targets.map(p=>'<button onclick="'+action+'">'+p.id+'</button>').join(''),openSheet:(title,body)=>{c.sheet={title,body};},nameOf:id=>id});
 c.alivePlayers=()=>c.game.players.filter(p=>p.alive);
 vm.runInContext(['normalizeEnabledRoles','recruitmentSettings','recruitmentOfferCard','openRecruitmentTargets','confirmRecruitmentTarget','updateRecruitmentClock','recruitmentNotice','renderNight','sensitiveActionCopy'].map(fn).join('\n'),c);
 return {c,app};
}
test('The option defaults off, persists through normalization, and is visibly explained in setup',()=>{
 const {c}=client();assert.equal(c.normalizeEnabledRoles().mafia_recruitment,false);assert.equal(c.normalizeEnabledRoles({mafia_recruitment:true}).mafia_recruitment,true);assert.equal(c.normalizeEnabledRoles({mafia_recruitment:true,kids_mode:true}).mafia_recruitment,false);
 assert.match(c.recruitmentSettings(),/aria-pressed="false"/);c.enabledRoles.mafia_recruitment=true;assert.match(c.recruitmentSettings(),/aria-pressed="true"/);assert.match(c.recruitmentSettings(),/30 ثانية/);
});
test('Boss sees both choices, spent recruitment hides kill controls, and targets exclude teammates',()=>{
 const {c,app}=client();c.renderNight();assert.match(app.innerHTML,/confirmNightTarget/);assert.match(app.innerHTML,/openRecruitmentTargets/);
 c.openRecruitmentTargets();assert.match(c.sheet.body,/>a</);assert.doesNotMatch(c.sheet.body,/>b</);
 c.game.me.recruitment={active:true,targetName:'<script>'};c.renderNight();assert.doesNotMatch(app.innerHTML,/confirmNightTarget|nightAction/);assert.match(app.innerHTML,/&lt;script&gt;/);
});
test('Target gets private accept/refuse controls, confirmation explains faction change, expiry locks choices',()=>{
 const {c,app}=client();c.game.me={id:'a',role:'citizen',recruitmentOffer:{response:'pending',open:true,deadline:Date.now()+30000}};
 c.renderNight();assert.match(app.innerHTML,/ACCEPT/);assert.match(app.innerHTML,/DECLINE/);assert.match(app.innerHTML,/شرط فوزك/);
 assert.match(c.sensitiveActionCopy('joinMafia','ACCEPT')[1],/تصبح مافيا/);
 c.game.me.recruitmentOffer.open=false;c.renderNight();assert.doesNotMatch(app.innerHTML,/onclick=/);assert.match(app.innerHTML,/انتهت مهلة/);
});
test('Rules are announced before play, results are private, and the story is revealed only at match end',()=>{
 const {c}=client();c.game.phase='reveal';assert.match(c.recruitmentNotice(),/قانون الغرفة/);
 c.game.phase='day';c.game.me={role:'citizen'};assert.equal(c.recruitmentNotice(),'');
 c.game.me.recruitment={outcome:'failed',targetName:'Citizen'};assert.match(c.recruitmentNotice(),/لم ينضم/);assert.doesNotMatch(c.recruitmentNotice(),/unavailable|declined/);
 c.game.phase='finished';c.game.recruitmentReveal={round:2,bossName:'<Boss>',targetName:'Citizen',outcome:'joined'};
 assert.match(c.recruitmentNotice(),/&lt;Boss&gt;/);assert.match(c.recruitmentNotice(),/انضم للمافيا/);
});
