/**
 * Apply na+sale leaf patches. Quotes paths for keys with spaces.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const UID = 'hvPTB7P3DUZ5nlAW7PH08AG4Rqt1';
const PROJECT = 'mio-tracker';
const patches = JSON.parse(readFileSync('./tmp-sodium-patches.json', 'utf8'));

function setLeaf(path, value) {
  const data = JSON.stringify(value);
  // PowerShell-safe: firebase database:set PATH -d DATA -f
  const cmd = `firebase database:set "${path}" -d ${data} --project ${PROJECT} -f`;
  const r = spawnSync(cmd, { encoding: 'utf8', shell: true });
  if (r.status !== 0) {
    console.error('FAIL', path, r.stdout, r.stderr);
    throw new Error(`set failed ${path}: ${r.status}`);
  }
  console.log('ok', path, '=', data);
}

const results = [];
for (const [key, patch] of Object.entries(patches)) {
  const base = `/users/${UID}/tracker_data/trackerFoodDatabase/${key}`;
  setLeaf(`${base}/na`, patch.na);
  setLeaf(`${base}/sale`, patch.sale);
  results.push({ key, ...patch });
}

writeFileSync('./tmp-fooddb-write-result.json', JSON.stringify(results, null, 2));
console.log('DONE', results.length);
