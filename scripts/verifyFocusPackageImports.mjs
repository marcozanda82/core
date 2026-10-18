import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('functions/_shared');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'MANIFEST.json'), 'utf8'));
console.log('manifest.fileCount', manifest.fileCount);

const bad = [];
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(p);
      continue;
    }
    if (!/\.(js|mjs|cjs)$/.test(ent.name)) continue;
    const t = fs.readFileSync(p, 'utf8');
    const rel = path.relative(root, p);
    if (t.includes("from '../../../../") || t.includes('from "../../../../')) {
      bad.push(`${rel}: outbound`);
    }
    if (/from ['"]react(?:\/|['"])/.test(t)) bad.push(`${rel}: react`);
    if (/from ['"]firebase\//.test(t) || /from ['"]firebase['"]/.test(t)) {
      bad.push(`${rel}: firebase-client`);
    }
    if (/from ['"][^'"]*coreEngine/.test(t) || /from ['"][^'"]*SalaComandi/.test(t)) {
      bad.push(`${rel}: ui/engine`);
    }
  }
}
walk(root);
console.log(bad.length ? `BAD ${bad.join(' | ')}` : 'PACKAGE_IMPORTS_OK');

const idx = fs.readFileSync('functions/index.js', 'utf8');
console.log('callGemini', /callGemini/.test(idx));
console.log('indexFocusImport', /_shared|publishFocusEdition|kentuFocus/.test(idx));
if (bad.length || !/callGemini/.test(idx) || /_shared|publishFocusEdition|kentuFocus/.test(idx)) {
  process.exit(2);
}
