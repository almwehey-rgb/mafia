import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const content = fs.readFileSync(path.join(root, 'supabase/functions/mafia-room/index.ts'), 'utf8');
const payload = {
  name: 'mafia-room',
  entrypoint_path: 'index.ts',
  verify_jwt: false,
  files: [{ name: 'index.ts', content }],
};
const out = path.join(root, '.mcp-deploy-args.json');
fs.writeFileSync(out, JSON.stringify(payload));
console.log('written', out, 'MAFIA', content.includes('MAFIA'), 'bytes', content.length);
