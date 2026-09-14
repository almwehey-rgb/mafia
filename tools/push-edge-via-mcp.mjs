import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = JSON.parse(fs.readFileSync(path.join(root, '.mcp-deploy-args.json'), 'utf8'));
// Emit deploy args for MCP (stdout) — used by agent tooling
process.stdout.write(JSON.stringify(args));
