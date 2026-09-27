const reviewCardViews = new Map();
const mafiaTeamViews = new Map();
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
 if(open)requestAnimationFrame(()=>syncRoleScrollHint(card));
}
function syncRoleScrollHint(card){
 const content=card.querySelector('.personal-card-properties');if(!content)return;
 let hint=card.querySelector('.role-scroll-hint');
 if(!hint){hint=document.createElement('span');hint.className='role-scroll-hint';hint.textContent='مرّر داخل الكرت لبقية الخصائص ↓';card.querySelector('.role-details-view').append(hint);}
 const update=()=>{hint.hidden=content.scrollHeight<=content.clientHeight+3||content.scrollTop+content.clientHeight>=content.scrollHeight-4;};
 content.onscroll=update;update();
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
 const teamKey=escapeHtml(`mafia-team-${game?.code}-${game?.matchId}-${game?.me?.id}`);
 const team=personal&&mafiaRoleClient(role)?`<details class="role-allies" data-disclosure-key="${teamKey}" ${mafiaTeamViews.get(teamKey)!==false?'open':''} ontoggle="mafiaTeamViews.set(this.dataset.disclosureKey,this.open)"><summary>زملاؤك في المافيا <small>خاص بفريقك · إظهار / إخفاء</small></summary><div>${teammates.map(p=>`<span>${escapeHtml(p.name)}</span>`).join('')||'<p>أنت عضو المافيا الوحيد</p>'}</div></details>`:'';
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
let homeCardIndex=0, homeCardPointer=null, homeCardWheelAt=0;
const homeCardRoles=['mafia_boss','detective','mafia','citizen','jailer','lawyer','vigilante','revealer','witch','cupid','escort','serial_killer','jester','doctor'];
function homeCharacters() {
 return `<section class="home-carousel" aria-label="شخصيات اللعبة — اسحب للتنقل أو استخدم الأسهم" tabindex="0" onkeydown="if(event.key==='ArrowLeft'){event.preventDefault();moveHomeCard(1)}if(event.key==='ArrowRight'){event.preventDefault();moveHomeCard(-1)}"><div class="home-carousel-stage" onpointerdown="startHomeCardDrag(event)" onpointermove="dragHomeCard(event)" onpointerup="endHomeCardDrag(event)" onpointercancel="endHomeCardDrag(event,true)" onlostpointercapture="if(homeCardPointer)endHomeCardDrag(event,true)" onwheel="wheelHomeCard(event)">${homeCardRoles.map((role,i)=>`<figure class="carousel-card" style="${homeCardStyle(i,homeCardIndex)}" aria-hidden="${i!==homeCardIndex}"><img src="${roleCardAsset(role,true)}" alt="${escapeHtml(roleLabel(role))}" width="512" height="768" draggable="false"></figure>`).join('')}</div><span class="home-carousel-announcement" aria-live="polite">${escapeHtml(roleLabel(homeCardRoles[homeCardIndex]))}</span></section>`;
}
function homeCardStyle(index,position){
 const count=homeCardRoles.length, offset=((index-position+count*1.5)%count+count)%count-count/2, distance=Math.abs(offset);
 return `transform:translateX(${ -50+offset*73 }%) translateY(${Math.min(distance,2)*8}%) rotate(${offset*10}deg) scale(${Math.max(.7,1-distance*.12)});opacity:${Math.max(0,Math.min(1,2-distance))};z-index:${Math.round(100-distance*10)}`;
}
function paintHomeCards(position){
 document.querySelectorAll('.home-carousel .carousel-card').forEach((card,i)=>{card.style.cssText=homeCardStyle(i,position);card.setAttribute('aria-hidden',String(i!==homeCardIndex));});
}
function moveHomeCard(step) {
 homeCardIndex=((homeCardIndex+step)%homeCardRoles.length+homeCardRoles.length)%homeCardRoles.length;
 paintHomeCards(homeCardIndex);
 const announcement=document.querySelector('.home-carousel-announcement');if(announcement)announcement.textContent=roleLabel(homeCardRoles[homeCardIndex]);
}
function startHomeCardDrag(event){
 if(!event.isPrimary||event.button!==0)return;
 homeCardPointer={id:event.pointerId,x:event.clientX,y:event.clientY,delta:0,stage:event.currentTarget,active:false};
 event.currentTarget.setPointerCapture(event.pointerId);
}
function dragHomeCard(event){
 const drag=homeCardPointer;if(!drag||drag.id!==event.pointerId)return;
 const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
 if(!drag.active&&Math.abs(dx)<Math.max(6,Math.abs(dy)))return;
 drag.active=true;drag.stage.classList.add('is-dragging');
 drag.delta=-dx/Math.max(65,drag.stage.clientWidth*.25);
 paintHomeCards(homeCardIndex+drag.delta);
}
function endHomeCardDrag(event,cancel=false){
 const drag=homeCardPointer;if(!drag||drag.id!==event.pointerId)return;
 homeCardPointer=null;drag.stage.classList.remove('is-dragging');
 if(drag.stage.hasPointerCapture(event.pointerId))drag.stage.releasePointerCapture(event.pointerId);
 moveHomeCard(cancel?0:Math.round(drag.delta));
}
function wheelHomeCard(event){
 if(event.ctrlKey||homeCardPointer)return;
 const delta=Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY;
 if(Math.abs(delta)<3)return;
 event.preventDefault();
 if(Date.now()-homeCardWheelAt<350)return;
 homeCardWheelAt=Date.now();moveHomeCard(delta>0?1:-1);
}
function previewHomeRole(role){openSheet('شرح الشخصية',interactiveRoleCard(role,{open:true}));}
function showGuide() {
  setRoomTag('📖');
  const roles = (cardsUseKidsMode()?[...kidsCardRoles]:Object.keys(roleNames)).map(key => interactiveRoleCard(key)).join('');
  $('#app').innerHTML = `<div class="card"><div class="toolbar"><h1>📖 الأدوار والقواعد</h1><button class="btn" onclick="home()">رجوع</button></div><div class="role-gallery">${roles}</div><div class="status">🌙 ليل: القدرات السرية · ☀️ نهار: نقاش وتصويت · 🏆 القرية تفوز بإخراج المافيا، والمافيا تفوز عند مساواة بقية الأحياء.</div></div>`;
}
