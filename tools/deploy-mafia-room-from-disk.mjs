/**
 * Deploy mafia-room by reading index.ts from disk.
 * Requires SUPABASE_ACCESS_TOKEN (npx supabase login) OR pass token as argv[2].
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRef = 'unsxzbrpqvppecjnirqx';
const token = process.env.SUPABASE_ACCESS_TOKEN || process.argv[2];
if (!token) {
  console.error('Usage: node tools/deploy-mafia-room-from-disk.mjs [SUPABASE_ACCESS_TOKEN]');
  console.error('Or set SUPABASE_ACCESS_TOKEN after: npx supabase login');
  process.exit(1);
}
const content = fs.readFileSync(
  path.join(root, 'supabase/functions/mafia-room/index.ts'),
  'utf8',
);
console.error(`Deploying mafia-room (${content.length} bytes, MAFIA=${content.includes('"MAFIA"')})...`);
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
  console.error('Deploy failed', res.status, text.slice(0, 4000));
  process.exit(1);
}
console.log(text);
