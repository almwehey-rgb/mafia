/**
 * Reads .deploy-chunks/mcp-invoke.json and POSTs to Supabase Management API.
 * Token: SUPABASE_ACCESS_TOKEN env, or argv[2], or reads from supabase CLI credentials file if present.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRef = 'unsxzbrpqvppecjnirqx';

function findCliToken() {
  const home = os.homedir();
  const candidates = [
    path.join(home, '.supabase', 'access-token'),
    path.join(home, 'AppData', 'Roaming', 'supabase', 'access-token'),
    path.join(home, 'AppData', 'Local', 'supabase', 'access-token'),
  ];
  for (const p of candidates) {
    try {
      const t = fs.readFileSync(p, 'utf8').trim();
      if (t) return t;
    } catch {
      /* ignore */
    }
  }
  return null;
}

const token =
  process.env.SUPABASE_ACCESS_TOKEN?.trim() ||
  process.argv[2]?.trim() ||
  findCliToken();
if (!token) {
  console.error('No Supabase access token. Run: npx supabase login');
  process.exit(2);
}

const invokePath = path.join(root, '.deploy-chunks', 'mcp-invoke.json');
if (!fs.existsSync(invokePath)) {
  const content = fs.readFileSync(
    path.join(root, 'supabase/functions/mafia-room/index.ts'),
    'utf8',
  );
  const payload = {
    name: 'mafia-room',
    entrypoint_path: 'index.ts',
    verify_jwt: false,
    files: [{ name: 'index.ts', content }],
  };
  fs.mkdirSync(path.dirname(invokePath), { recursive: true });
  fs.writeFileSync(invokePath, JSON.stringify(payload));
}

const body = fs.readFileSync(invokePath, 'utf8');
const parsed = JSON.parse(body);
console.error(
  `Deploying ${parsed.name} (${parsed.files[0].content.length} bytes)...`,
);

const uri = `https://api.supabase.com/v1/projects/${projectRef}/functions/deploy`;
const res = await fetch(uri, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body,
});

const text = await res.text();
if (!res.ok) {
  console.error('Deploy failed', res.status, text.slice(0, 8000));
  process.exit(1);
}
console.log(text);
