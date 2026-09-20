// Shared outline icons. Localized labels retain their original source separately.
(()=>{
 const paths={
 card:'<rect x="5" y="2" width="14" height="20" rx="2"/><path d="m12 7 4 5-4 5-4-5 4-5Z"/>',
 flask:'<path d="M9 2h6m-5 0v7L3 20q0 2 3 2h12q3 0 3-2L14 9V2M7 14h10"/>',
 antenna:'<circle cx="12" cy="12" r="2"/><path d="M8 8a6 6 0 0 0 0 8m8-8a6 6 0 0 1 0 8M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14m-7-5v8"/>',
 drop:'<path d="M12 2C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-13Z"/>',
 ban:'<circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/>',
 shield:'<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Z"/>',
 search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 7 7"/>',
 mic:'<rect x="8" y="2" width="8" height="13" rx="4"/><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8"/>',
 skull:'<path d="M7 18c-7-4-4-16 5-16s12 12 5 16v4H7v-4Zm3 1v3m4-3v3"/><circle cx="8" cy="11" r="2"/><circle cx="16" cy="11" r="2"/>',
 book:'<path d="M12 5C8 2 4 2 2 3v17c4-1 7 0 10 2 3-2 6-3 10-2V3c-2-1-6-1-10 2v17"/>',
 hand:'<path d="M8 12V5a2 2 0 0 1 4 0v7-9a2 2 0 0 1 4 0v9-6a2 2 0 0 1 4 0v10c0 4-3 6-7 6-3 0-5-1-7-4l-4-5a2 2 0 0 1 3-2l3 3"/>',
 warning:'<path d="m12 2 11 20H1L12 2Zm0 6v6m0 3v1"/>',
 stop:'<rect x="4" y="4" width="16" height="16" rx="2"/>',
 skip:'<path d="m4 4 12 8-12 8V4Zm15 0v16"/>',
 dot:'<circle cx="12" cy="12" r="5" fill="currentColor" stroke="none"/>',
 dice:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 7h.1M17 7h.1M12 12h.1M7 17h.1M17 17h.1"/>',
 hat:'<path d="M3 16h18M6 16 8 4h8l2 12M7 12h10"/>',
 smile:'<circle cx="12" cy="12" r="9"/><path d="M8 9h.1M16 9h.1M7 14q5 7 10 0"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
 moon:'<path d="M20 14A9 9 0 0 1 10 3a9 9 0 1 0 10 11Z"/>',
 expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
 trophy:'<path d="M7 3h10v6a5 5 0 0 1-10 0V3Zm10 2h4v3a4 4 0 0 1-4 4M7 5H3v3a4 4 0 0 0 4 4m5 2v7m-4 0h8"/>',
 crown:'<path d="m3 6 4 4 5-7 5 7 4-4-2 13H5L3 6Zm3 9h12"/>',
 flag:'<path d="M5 21V3m0 1c5-4 9 4 15 0v10c-6 4-10-4-15 0"/>',
 scroll:'<path d="M6 3h12v15a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-2h12v2a3 3 0 0 0 3 3M6 3v13m3-9h6m-6 4h6"/>',
 chat:'<path d="M4 3h16v14H9l-5 4V3Z"/><path d="M8 8h8m-8 4h5"/>',
 user:'<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
 key:'<circle cx="8" cy="8" r="5"/><path d="m12 12 9 9m-4-4 3-3m-6 0 3-3"/>',
 refresh:'<path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5m-4 8a8 8 0 0 0 14 3l3-3m0 5v-5h-5"/>',
 play:'<path d="m7 3 14 9L7 21V3Z"/>',
 pause:'<path d="M7 4v16M17 4v16"/>',
 eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
 phone:'<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/>',
 leave:'<path d="M9 3H3v18h6m1-9h11m-4-4 4 4-4 4"/>',
 check:'<path d="m4 12 5 5L20 6"/>',
 scales:'<path d="M12 3v18m-5 0h10M3 6h18M6 6l-4 9h8L6 6Zm12 0-4 9h8l-4-9Z"/>',
 target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
 heart:'<path d="M12 21 3 12C-2 5 7 0 12 7c5-7 14-2 9 5l-9 9Z"/>',
 bolt:'<path d="m13 2-9 12h7l-1 8 10-13h-8l1-7Z"/>',
 flame:'<path d="M13 2c1 7 7 7 7 13a8 8 0 0 1-16 0c0-4 3-7 5-9v6c4-2 4-6 4-10Z"/>',
 home:'<path d="m2 10 10-8 10 8M5 8v13h14V8m-10 13v-8h6v8"/>',
 knife:'<path d="m3 3 13 10-3 3L3 3Zm10 13 7 6 2-2-6-7"/>',
 sound:'<path d="m3 9 5 0 5-5v16l-5-5H3V9Zm13-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
 medical:'<path d="M4 3v5a5 5 0 0 0 10 0V3M2 3h4m6 0h4M9 13v3a5 5 0 0 0 10 0v-3"/><circle cx="19" cy="10" r="3"/>',
 star:'<path d="m12 2 3 7 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1 3-7Z"/>'
 };
 const groups={sun:'☀🌞',moon:'🌙🌛',expand:'⛶',trophy:'🏆🏅🥇',crown:'👑',flag:'🚩🏳',scroll:'📜📋📝',chat:'💬',user:'👤🤖👶',lock:'🔒🔓',key:'🔑',refresh:'🔄🔁',play:'▶🎬',pause:'⏸⏯',eye:'👁',phone:'📱',leave:'🚪',check:'✅✔',scales:'⚖🔨',target:'🎯',heart:'❤️💘',bolt:'⚡',flame:'🔥',home:'🏘🏠🏚',knife:'🔪🗡',sound:'🔊🔇🔈',clock:'⏱⏰',medical:'🩺💉💊',star:'🎩🕵🧙🃏🎭🎲🚫🔴🗳🧪🪄'};
 Object.assign(groups,{card:'🎴🃏🗳',flask:'🧪🧙🪄',antenna:'📡',drop:'🩸',ban:'🚫⛔',shield:'🛡',search:'🔎🕵',mic:'🎙🗣',skull:'☠💀',book:'📖',hand:'☝✋',warning:'⚠',stop:'⏹',skip:'⏭',dot:'🔴🟢⚪',dice:'🎲',hat:'🎩',smile:'🙂🎭',lock:'🔒🔓🔐',user:'👤🤖👶🧒👥',heart:'❤💘💚💔🤝🕊',star:''});
 const names=new Map();for(const [name,chars] of Object.entries(groups))for(const c of chars)if(c!=='\uFE0F')names.set(c,name);
 const pattern=new RegExp('['+[...names.keys()].join('')+']\\uFE0F?','gu');
 const sources=new WeakMap();
 function svg(name){return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.star}</svg>`}
 function paint(el,text){pattern.lastIndex=0;el.replaceChildren();let at=0;for(const m of text.matchAll(pattern)){el.append(document.createTextNode(text.slice(at,m.index)));const icon=document.createElement('span');icon.className='ui-symbol';icon.innerHTML=svg(names.get([...m[0]][0]));el.append(icon);at=m.index+m[0].length;}el.append(document.createTextNode(text.slice(at)));}
 function withIcon(value,source){pattern.lastIndex=0;if(pattern.test(value))return value;pattern.lastIndex=0;const original=pattern.exec(source);return original?original[0]+' '+value:value;}
 window.mafiaIcons={svg,decorateStatic(root){if(root.nodeType===3)root=root.parentElement;if(!root||root.closest(".ui-label,script,style,textarea,option,input,.chat-message"))return;const nodes=[];const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);while(walker.nextNode()){const n=walker.currentNode;if(!n.parentElement.closest(".ui-label,script,style,textarea,option,input,.chat-message"))nodes.push(n);}for(const n of nodes){pattern.lastIndex=0;if(!pattern.test(n.nodeValue))continue;const label=document.createElement("span");label.className="ui-label";label.setAttribute("data-no-translate","");paint(label,n.nodeValue);n.replaceWith(label);}},decorate(node,value,source){value=withIcon(value,source);pattern.lastIndex=0;if(!pattern.test(value)||node.parentElement?.closest('textarea,option,input,.chat-message,.ui-label'))return;const label=document.createElement('span');label.className='ui-label';label.setAttribute('data-no-translate','');sources.set(label,source);paint(label,value);node.replaceWith(label);},refresh(lang,localize){document.querySelectorAll('.ui-label').forEach(el=>{const source=sources.get(el);if(source!==undefined)paint(el,withIcon(localize(source,lang),source));});}};
})();
