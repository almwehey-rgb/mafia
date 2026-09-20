const pendingReads=new Map();
function requestError(code,status=0) {const error=new Error(code);error.code=code;error.status=status;return error;}
async function api(payload) {
  const reading=['state','spectatorState','adminState','messages','moderationLog','listSnapshots','systemStatus'];
  const reconnecting=document.getElementById('reconnect')?.classList.contains('show');
  if(payload.code && game?.code===payload.code && !reading.includes(payload.action) && (navigator.onLine===false || reconnecting)) {
    const error=new Error('انتظر استعادة الاتصال قبل إرسال اختيارك / Wait for reconnection');error.code='RECONNECTING';throw error;
  }
  if (payload.code && game?.code === payload.code && payload.lifecycleVersion === undefined) {
    payload = {...payload,lifecycleVersion:game.lifecycleVersion};
  }
  const key=reading.includes(payload.action)?JSON.stringify(payload):null;
  if(key&&pendingReads.has(key))return structuredClone(await pendingReads.get(key));
  const task=(async()=>{
  let response;
  try {response = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });}catch(error){throw requestError(error.name==='TimeoutError'?'REQUEST_TIMEOUT':'NETWORK_ERROR');}
  let data;
  try {data=await response.json();}catch{throw requestError('INVALID_RESPONSE',response.status);}
  if (Number.isFinite(data.serverTime)) {
    discussionClockOffset = data.serverTime - Date.now();
    delete data.serverTime;
  }
  if (!response.ok) {
    throw requestError(data.error || 'REQUEST_FAILED',response.status);
  }
  return data;
  })();
  if(key)pendingReads.set(key,task);
  try{return await task;}finally{if(key)pendingReads.delete(key);}
}
