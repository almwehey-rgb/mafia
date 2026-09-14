// One request per optional script; a failed download can be retried.
const featureScripts = new Map();
function loadFeatureScript(src) {
 src=window.MAFIA_ASSETS?.[src]||src;
 if(!featureScripts.has(src))featureScripts.set(src,new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src=src;
  script.onload=resolve;script.onerror=()=>{featureScripts.delete(src);script.remove();reject(Error('Unable to load '+src));};
  document.head.append(script);
 }));
 return featureScripts.get(src);
}
for(const [name,files] of Object.entries({openAdminView:['/admin.js'],showAdminQR:['/qrcode.js','/admin-qr.js']})) {
 const loader=async(...args)=>{
  try {
   for(const file of files)await loadFeatureScript(file);
   if(typeof window[name]!=='function'||window[name]===loader){
    for(const file of files)featureScripts.delete(window.MAFIA_ASSETS?.[file]||file);
    throw Error('Feature did not initialize: '+name);
   }
   return await window[name](...args);
  }
  catch {
   const msg = (localStorage.getItem('mafia-lang') || 'ar') === 'en'
    ? 'Unable to load. Please retry.'
    : 'تعذر تحميل الأداة، حاول مرة ثانية.';
   if (typeof window.notice === 'function') window.notice(msg);
   else alert(msg);
  }
 };
 window[name]=loader;
}
