import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRef = 'unsxzbrpqvppecjnirqx';
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN not set. Run: npx supabase login');
  process.exit(1);
}
const content = fs.readFileSync(
  path.join(root, 'supabase/functions/mafia-room/index.ts'),
  'utf8',
);
const body = JSON.stringify({
  name: 'mafia-room',
  entrypoint_path: 'index.ts',
  verify_jwt: false,
  files: [{ name: 'index.ts', content }],
});
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
  console.error('Deploy failed', res.status, text.slice(0, 2000));
  process.exit(1);
}
console.log(text);
