// VisualViewport follows mobile keyboards that do not resize the layout viewport.
function syncVisibleViewport(){
 const viewport=window.visualViewport;
 document.documentElement.style.setProperty('--visible-height',`${viewport?.height||innerHeight}px`);
 document.documentElement.style.setProperty('--visible-top',`${viewport?.offsetTop||0}px`);
 const focused=document.activeElement;
 if(focused?.matches('input,textarea,select')&&focused.closest('.game-sheet'))requestAnimationFrame(()=>focused.scrollIntoView({block:'nearest'}));
}
window.visualViewport?.addEventListener('resize',syncVisibleViewport);
window.visualViewport?.addEventListener('scroll',syncVisibleViewport);
window.addEventListener('resize',syncVisibleViewport);
syncVisibleViewport();
function mountPlayerTools(){
  if(!game?.me?.alive||['lobby','reveal','finished'].includes(game.phase)||document.querySelector('.player-tools'))return;
  const canChat=game.phase==='night'&&(game.me.jailed||game.me.role==='jailer'||game.me.role==='mafia'||game.me.role==='mafia_boss');
  const tools=document.createElement('div');tools.className='player-tools';tools.innerHTML=`${game.me.isHost?'<button type="button" onclick="toggleDelegatedHost()">👑 التحكم / Host controls</button>':''}<button type="button" onclick="openWill()">📜 وصيتي / My will</button>${canChat?`<button type="button" data-chat-button onclick="openChat()">💬 محادثة / Chat ${chatHasUnread()?' 🔴':''}</button>`:''}<button type="button" onclick="openReport()">🚩 إبلاغ المضيف / Report to host</button>`;document.querySelector('#app').appendChild(tools);
}
function toggleDelegatedHost(){delegatedHostMode=!delegatedHostMode;document.querySelector('.player-tools')?.remove();delegatedHostMode?renderHost():renderPlayer()}
let sheetReturnFocus=null;
function closeSheet(){stopChatPolling();const sheet=document.querySelector('.game-sheet');if(!sheet)return;sheet.remove();document.querySelector('.shell')?.removeAttribute('inert');document.querySelector('.utility-bar')?.removeAttribute('inert');if(sheetReturnFocus?.isConnected)sheetReturnFocus.focus();sheetReturnFocus=null;}
function openSheet(title,body){closeSheet();sheetReturnFocus=document.activeElement;const sheet=document.createElement('div');sheet.className='game-sheet';sheet.innerHTML=`<div class="sheet-card" role="dialog" aria-modal="true" aria-labelledby="sheetTitle"><div class="toolbar"><h2 id="sheetTitle">${title}</h2><button aria-label="إغلاق / Close" class="close-sheet" onclick="closeSheet()">×</button></div>${body}</div>`;document.body.appendChild(sheet);document.querySelector('.shell')?.setAttribute('inert','');document.querySelector('.utility-bar')?.setAttribute('inert','');sheet.querySelector('.close-sheet').focus();
 sheet.addEventListener('focusin',event=>requestAnimationFrame(()=>event.target?.scrollIntoView?.({block:'nearest'})));
 sheet.addEventListener('keydown',event=>{
 if(event.key==='Escape'){event.preventDefault();closeSheet();return;}
 if(event.key!=='Tab')return;
 const items=[...sheet.querySelectorAll('button,input,textarea,select,a[href],[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);
 const first=items[0],last=items.at(-1);
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 });}
function openWill(){openSheet('📜 وصيتي',`<p class="muted">اكتب ملاحظاتك. تظهر وصيتك بعد موتك إذا كان كشف الأدوار مفعّلًا.</p><label for="willText">${discussionText('وصيتك','Your will')}</label><textarea class="input will-input" id="willText" maxlength="500">${escapeHtml(game.me.willText||'')}</textarea><button class="btn red wide" onclick="saveWill()">حفظ الوصية</button>`)}
async function saveWill(){try{game=await api({action:'saveWill',code:game.code,id:playerId,playerToken,text:$('#willText').value});closeSheet();renderPlayer()}catch{alert('تعذر حفظ الوصية')}}
