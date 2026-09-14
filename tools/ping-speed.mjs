const urls = [
  ['API (Singapore)', 'https://unsxzbrpqvppecjnirqx.supabase.co/functions/v1/mafia-room?forceFunctionRegion=ap-southeast-1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"action":"state","code":"0000"}' }],
  ['API (no region pin)', 'https://unsxzbrpqvppecjnirqx.supabase.co/functions/v1/mafia-room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"action":"state","code":"0000"}' }],
  ['game.js iota', 'https://mafia-night-iota.vercel.app/game.js?v=e14ux6', { method: 'GET' }],
  ['index iota', 'https://mafia-night-iota.vercel.app/', { method: 'GET' }],
];

async function ping(label, url, opts) {
  const times = [];
  let size = 0;
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    try {
      const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(20000) });
      const buf = await r.arrayBuffer();
      size = buf.byteLength;
      times.push(performance.now() - t0);
    } catch {
      times.push(-1);
    }
  }
  const ok = times.filter((t) => t >= 0);
  const avg = ok.length ? Math.round(ok.reduce((a, b) => a + b, 0) / ok.length) : null;
  console.log(`${label}: avg ${avg}ms | ${ok.length}/5 ok | ~${Math.round(size / 1024)}KB`);
}

for (const [label, url, opts] of urls) {
  await ping(label, url, opts);
}
