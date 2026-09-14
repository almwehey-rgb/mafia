async function showAdminQR(){
 if(!hostToken||!game)return;
 try{
  const result=await api({action:'createAdminInvite',code:game.code,hostToken});
  const link=new URL('/admin-view.html',location.origin);link.hash=new URLSearchParams({code:game.code,invite:result.inviteToken});
  document.getElementById('adminQR')?.remove();
  const dialog=document.createElement('dialog');dialog.id='adminQR';dialog.style.cssText='background:#141720;color:white;border-radius:20px;max-width:95vw;text-align:center;padding:24px';
  dialog.innerHTML='<h2>🛡️ دخول الأدمن</h2><p>يمسحه الأدمن فقط؛ يكشف أسرار القيم.<br>صالح دقيقتين ولمرة واحدة.</p><div id="adminQRImage"></div><p id="adminQRStatus"></p><button class="btn" id="hideAdminQR">إخفاء الباركود</button> <button class="btn" id="revokeAdminQR">إلغاء دخول الأدمن</button>';
  document.body.append(dialog);dialog.showModal();
  const qr=qrcode(0,'M');qr.addData(link.href);qr.make();dialog.querySelector('#adminQRImage').innerHTML=qr.createSvgTag({cellSize:5,margin:20,scalable:true});
  dialog.querySelector('svg').style.cssText='width:300px;max-width:75vw;background:white';
  const timer=setTimeout(()=>{if(dialog.isConnected){dialog.querySelector('#adminQRImage').innerHTML='';dialog.querySelector('#adminQRStatus').textContent='انتهت صلاحية الباركود. افتح زر الأدمن لتوليد باركود جديد.';}},Math.max(0,result.expiresAt-Date.now()));
  const close=()=>{clearTimeout(timer);dialog.remove();};dialog.querySelector('#hideAdminQR').onclick=close;dialog.addEventListener('cancel',close);
  dialog.querySelector('#revokeAdminQR').onclick=async()=>{try{await api({action:'revokeAdminAccess',code:game.code,hostToken});close();}catch{alert('تعذر إلغاء الدخول');}};
 }catch{alert('تعذر إنشاء باركود الأدمن');}
}
