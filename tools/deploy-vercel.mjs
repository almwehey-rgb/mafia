import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const teamId = 'team_6ZX5qOWZet2Qx44MTAIWMXRO';
const textFiles = [
  'index.html', 'game.html', 'candidate.html', 'admin-view.html',
  'preview-kids-setup.html', 'preview-lobby.html',
  'admin-qr.js', 'admin.js', 'admin-view.js', 'candidate.js', 'controls.js',
  'discussion.js', 'feature-loader.js', 'game.js', 'qrcode.js', 'screen-fit.js',
  'ui-icons.js', 'sw.js', 'app-v64.css', 'candidate.css', 'manifest.webmanifest',
  'vercel.json',
];

const authPath = path.join(os.homedir(), 'AppData', 'Roaming', 'com.vercel.cli', 'Data', 'auth.json');
const token = JSON.parse(fs.readFileSync(authPath, 'utf8')).token;
if (!token) {
  console.error('Missing Vercel token');
  process.exit(1);
}

function collectFiles() {
  const files = [];
  for (const file of textFiles) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) throw new Error(`Missing file: ${file}`);
    files.push({ file, full });
  }
  const walk = (dir, rel) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const nextFull = path.join(dir, entry.name);
      const nextRel = `${rel}/${entry.name}`.replaceAll('\\', '/');
      if (entry.isDirectory()) walk(nextFull, nextRel);
      else files.push({ file: nextRel, full: nextFull });
    }
  };
  walk(path.join(root, 'assets'), 'assets');
  return files;
}

async function uploadFile({ file, full }) {
  const data = fs.readFileSync(full);
  const sha = crypto.createHash('sha1').update(data).digest('hex');
  const res = await fetch(`https://api.vercel.com/v2/files?teamId=${teamId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'x-vercel-digest': sha,
      'Content-Length': String(data.length),
    },
    body: data,
  });
  if (!res.ok && res.status !== 409) {
    const text = await res.text();
    throw new Error(`Upload failed ${file} ${res.status} ${text.slice(0, 400)}`);
  }
  return { file, sha, size: data.length };
}

async function mapPool(items, limit, worker) {
  const out = new Array(items.length);
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      out[current] = await worker(items[current], current);
    }
  });
  await Promise.all(runners);
  return out;
}

const localFiles = collectFiles();
console.error(`Uploading ${localFiles.length} files`);
const files = await mapPool(localFiles, 4, uploadFile);
console.error('Creating deployment');

const res = await fetch(`https://api.vercel.com/v13/deployments?teamId=${teamId}`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    name: 'mafia-night',
    project: 'mafia-night',
    target: 'production',
    files,
    projectSettings: {
      framework: null,
      buildCommand: null,
      installCommand: null,
      outputDirectory: null,
    },
  }),
});
const text = await res.text();
if (!res.ok) {
  console.error('Deploy failed', res.status, text.slice(0, 4000));
  process.exit(1);
}
const json = JSON.parse(text);
console.log(JSON.stringify({
  id: json.id,
  url: json.url,
  readyState: json.readyState,
  alias: json.alias,
}, null, 2));
