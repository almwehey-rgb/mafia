let roomScanner=null;
function cameraJoinButton(){return '<button class="btn camera-join" type="button" onclick="openRoomScanner()" aria-label="مسح باركود الغرفة بالكاميرا" title="مسح باركود الغرفة بالكاميرا"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 7h4l2-3h6l2 3h4v13H3Z"/><circle cx="12" cy="13" r="4"/></svg></button>';}
function scannedRoomCode(value){
 const text=String(value||'').trim();if(/^\d{4}$/.test(text))return text;
 try{const url=new URL(text);return url.origin===location.origin&&['/','/game','/game.html'].includes(url.pathname)&&/^\d{4}$/.test(url.searchParams.get('room')||'')?url.searchParams.get('room'):null;}catch{return null;}
}
function stopRoomScanner(){
 const scanner=roomScanner;roomScanner=null;if(!scanner)return;
 clearTimeout(scanner.timer);scanner.stream?.getTracks().forEach(track=>track.stop());
 if(scanner.video)scanner.video.srcObject=null;
}
async function openRoomScanner(){
 openSheet('مسح باركود الغرفة',`<div class="room-scanner"><video id="roomScanVideo" autoplay muted playsinline aria-label="معاينة الكاميرا"></video><p id="roomScanStatus" role="status">جاري فتح الكاميرا…</p><p class="muted">وجّه الكاميرا نحو باركود الغرفة. الصور تُقرأ على جهازك ولا تُرفع.</p><button class="btn wide" onclick="closeSheet();joinForm()">إدخال رقم الغرفة يدويًا</button></div>`);
 const scanner={video:document.getElementById('roomScanVideo'),stream:null,timer:null};roomScanner=scanner;
 const status=document.getElementById('roomScanStatus');
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw Error('CAMERA_UNAVAILABLE');
  const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
  if(roomScanner!==scanner){stream.getTracks().forEach(track=>track.stop());return;}
  scanner.stream=stream;scanner.video.srcObject=stream;await scanner.video.play();
  let detector=null;
  if(window.BarcodeDetector){try{detector=new window.BarcodeDetector({formats:['qr_code']});}catch{}}
  if(!detector){await loadFeatureScript('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js');if(typeof window.jsQR!=='function')throw Error('DECODER_UNAVAILABLE');}
  if(roomScanner!==scanner)return;
  status.textContent='ضع الباركود داخل إطار الكاميرا';
  const canvas=document.createElement('canvas'),context=canvas.getContext('2d',{willReadFrequently:true});
  async function scan(){
   if(roomScanner!==scanner)return;
   try{
    let value='';
    if(scanner.video.readyState>=2){
     if(detector)value=(await detector.detect(scanner.video))[0]?.rawValue||'';
     else{const scale=Math.min(1,640/scanner.video.videoWidth);canvas.width=Math.round(scanner.video.videoWidth*scale);canvas.height=Math.round(scanner.video.videoHeight*scale);context.drawImage(scanner.video,0,0,canvas.width,canvas.height);const pixels=context.getImageData(0,0,canvas.width,canvas.height);value=window.jsQR(pixels.data,canvas.width,canvas.height)?.data||'';}
    }
    if(roomScanner!==scanner)return;
    const code=scannedRoomCode(value);
    if(code){closeSheet();joinForm(code);return;}
    if(value)status.textContent='هذا ليس باركود غرفة من موقع اللعبة';
   }catch{if(roomScanner===scanner)status.textContent='تعذرت قراءة الباركود، قرّب الكاميرا وحاول مجددًا';}
   if(roomScanner===scanner)scanner.timer=setTimeout(scan,180);
  }
  scan();
 }catch(error){
  if(roomScanner!==scanner)return;stopRoomScanner();
  status.textContent=error.name==='NotAllowedError'?'اسمح باستخدام الكاميرا من إعدادات المتصفح، أو أدخل رقم الغرفة يدويًا.':'تعذر تشغيل الماسح. تأكد من الكاميرا والاتصال أو أدخل رقم الغرفة يدويًا.';
 }
}
window.addEventListener('pagehide',stopRoomScanner);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&roomScanner)closeSheet();});
