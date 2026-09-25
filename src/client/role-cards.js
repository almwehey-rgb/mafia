const reviewCardViews = new Map();
const kidsCardRoles = new Set(['mafia_boss','mafia','detective','doctor','citizen']);
function roleCardAsset(role,thumbnail=false,kids=false){return `/assets/${kids&&kidsCardRoles.has(role)?'role-cards-kids':'role-cards-v3'}/${role}${thumbnail?'-thumb':''}.webp`;}
function selectRoleView(card,open){
 card=card.closest('.role-reader');
 card.dataset.view=open?'details':'image';
 card.setAttribute('aria-pressed',String(open));
 card.querySelector('.role-image-view').setAttribute('aria-hidden',String(open));
 card.querySelector('.role-details-view').setAttribute('aria-hidden',String(!open));
 if(card.classList.contains('personal-role-card'))personalCardState.open=open;
 if(card.dataset.reviewRole)reviewCardViews.set(card.dataset.reviewRole,open);
}
function cardsUseKidsMode(){
 return game?.phase==='lobby' ? enabledRoles.kids_mode===true : game?.enabledRoles?.kids_mode===true;
}
function interactiveRoleCard(role, {personal=false, compact=false, image='', open=false, review=false, count=0}={}) {
 if(review)open=reviewCardViews.get(role)===true;
 const label=escapeHtml(roleLabel(role));
 const kids=(personal?game?.enabledRoles?.kids_mode===true:cardsUseKidsMode())&&kidsCardRoles.has(role);
 const art=roleCardAsset(role,false,kids);
 image = kids?art:(!image||image.includes('/role-cards-kids/')?art:image);
 const title=kids?({mafia_boss:'قائد الفريق الغامض',mafia:'الفريق الغامض',doctor:'الطبيب',detective:'المحقق',citizen:'المواطن'}[role]):role==='mafia_boss'?'زعيم المافيا':roleLabel(role).split(' / ')[0];
 const teammates=personal&&mafiaRoleClient(role)?(game.me.mafiaTeam||[]).filter(p=>p.id!==game.me.id):[];
 const team=personal&&mafiaRoleClient(role)?`<aside class="role-allies"><h3>زملاؤك في المافيا <small>خاص بفريقك</small></h3><div>${teammates.map(p=>`<span>${escapeHtml(p.name)}</span>`).join('')||'<p>أنت عضو المافيا الوحيد</p>'}</div></aside>`:'';
 const teamName=role==='serial_killer'||role==='jester'?'الفريق المستقل':detailedRoleRules[role]?.[0]||'';
 const teamCapsule=personal?`<span class="personal-team-capsule">${escapeHtml(teamName)}</span>`:'';
 const identity=`<header class="role-identity"><h2>${escapeHtml(title)}</h2><span>${escapeHtml(detailedRoleRules[role]?.[0]||'')}</span>${review?`<span class="review-role-count" data-no-translate aria-label="${discussionText('عدد اللاعبين','Player count')}">× ${count}</span>`:''}</header>`;
 const article=`<article class="role-reader turning-role ${kids?'kids-role-card':''} ${personal?'personal-role-card':''} ${compact?'compact':''}" ${review?`data-review-role="${role}"`:''} data-view="${open?'details':'image'}" style="--role-art:url('${image}')" role="button" tabindex="0" aria-label="${label}، اضغط لقلب الكرت" aria-pressed="${open}" onclick="selectRoleView(this,this.dataset.view!=='details')" onkeydown="if(event.target===this&&(event.key==='Enter'||event.key===' ')){event.preventDefault();selectRoleView(this,this.dataset.view!=='details')}"><div class="role-turn-inner"><div class="role-image-view" aria-hidden="${open}"><img src="${image}" alt="${label}" width="1024" height="1536" loading="lazy" decoding="async">${teamCapsule}${personal?'':'<span class="role-turn-hint">اضغط الكرت لقراءة الدور ↻</span>'}</div><div class="role-details-view" aria-hidden="${!open}">${teamCapsule}<div class="personal-card-properties">${detailedRoleProperties(role,personal)}</div>${personal?'':'<span class="role-turn-hint">مرّر لقراءة المزيد · اضغط للعودة ↻</span>'}</div></div></article>`;
 return `<section class="role-presentation ${review?'review-role-presentation':''}">${personal?article+team:identity+team+article}</section>`;
}
let homeGalleryObserver;
function mountHomeCharacters() {
 homeGalleryObserver?.disconnect();
 const gallery=document.querySelector('.home-role-gallery');
 if(!gallery || gallery.childElementCount)return;
 const populate=()=>{if(gallery.isConnected&&!gallery.childElementCount)gallery.innerHTML=Object.keys(roleNames).map(role=>interactiveRoleCard(role)).join('');};
 if(!('IntersectionObserver' in window)){populate();return;}
 homeGalleryObserver=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){homeGalleryObserver.disconnect();populate();}},{rootMargin:'0px'});
 homeGalleryObserver.observe(gallery);
}
function homeCharacters() {
 return `<section class="cinema-cards" aria-label="الشخصيات الرئيسية">${[['detective','المحقق'],['mafia_boss','زعيم المافيا'],['doctor','الطبيب']].map(([role,title])=>`<button class="cinema-character" onclick="previewHomeRole('${role}')" aria-label="شرح دور ${title}"><img src="/assets/role-cards-v3/${role}-thumb.webp" alt="${title}" width="1024" height="1536" loading="lazy" decoding="async"></button>`).join('')}<p>اكتشف دورك… والعبها بذكاء</p></section>`;
}
function previewHomeRole(role){openSheet('شرح الشخصية',interactiveRoleCard(role,{open:true}));}
function showGuide() {
  setRoomTag('📖');
  const roles = (cardsUseKidsMode()?[...kidsCardRoles]:Object.keys(roleNames)).map(key => interactiveRoleCard(key)).join('');
  $('#app').innerHTML = `<div class="card"><div class="toolbar"><h1>📖 الأدوار والقواعد</h1><button class="btn" onclick="home()">رجوع</button></div><div class="role-gallery">${roles}</div><div class="status">🌙 ليل: القدرات السرية · ☀️ نهار: نقاش وتصويت · 🏆 القرية تفوز بإخراج المافيا، والمافيا تفوز عند مساواة بقية الأحياء.</div></div>`;
}
