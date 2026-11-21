/**
 * Elimina duplicato Pane integrale food_1775944514061_… (tiene food_1775914367324_…).
 * Backup locale prima; abort se compare nel diario.
 *
 * Uso: node scripts/deletePaneIntegraleDuplicate.mjs --apply
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const UID = 'hvPTB7P3DUZ5nlAW7PH08AG4Rqt1';
const PROJECT = 'mio-tracker';
const KEEP = 'food_1775914367324_Pane_integrale';
const DROP = 'food_1775944514061_Pane_integrale';
const APPLY = process.argv.includes('--apply');

delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
delete process.env.FIREBASE_AUTH_EMULATOR_HOST;

function quotePath(path) {
  return `"${String(path).replace(/"/g, '')}"`;
}

function firebaseGet(path) {
  const r = spawnSync(
    'firebase',
    ['database:get', quotePath(path), '--project', PROJECT],
    {
      encoding: 'utf8',
      maxBuffer: 80 * 1024 * 1024,
      shell: true,
      env: { ...process.env, FIREBASE_DATABASE_EMULATOR_HOST: '', FIREBASE_AUTH_EMULATOR_HOST: '' },
    },
  );
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  const t = String(r.stdout || '').replace(/^\uFEFF/, '').trim();
  return !t || t === 'null' ? null : JSON.parse(t);
}

function firebaseRemove(path) {
  const r = spawnSync(
    'firebase',
    ['database:remove', quotePath(path), '--project', PROJECT, '--force'],
    {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      shell: true,
      env: { ...process.env, FIREBASE_DATABASE_EMULATOR_HOST: '', FIREBASE_AUTH_EMULATOR_HOST: '' },
    },
  );
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return String(r.stdout || '').trim();
}

const dbPath = `/users/${UID}/tracker_data/trackerFoodDatabase`;
const keepRow = firebaseGet(`${dbPath}/${KEEP}`);
const dropRow = firebaseGet(`${dbPath}/${DROP}`);

if (!keepRow) {
  console.error('KEEP mancante:', KEEP);
  process.exit(1);
}
if (!dropRow) {
  console.error('DROP già assente:', DROP);
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = join('backups', `pane-integrale-dupe-${stamp}`);
mkdirSync(backupDir, { recursive: true });
const backup = {
  at: new Date().toISOString(),
  keepKey: KEEP,
  dropKey: DROP,
  keepRow,
  dropRow,
};
writeFileSync(join(backupDir, 'backup.json'), JSON.stringify(backup, null, 2));
console.log('Backup:', join(backupDir, 'backup.json'));

// Scan diario: nessuna voce con foodDbKey / matchedKey = DROP
const tracker = firebaseGet(`/users/${UID}/tracker_data`) || {};
const diaryHits = [];
for (const [dayKey, day] of Object.entries(tracker)) {
  if (!String(dayKey).startsWith('trackerStorico_')) continue;
  const log = Array.isArray(day?.log) ? day.log : Object.values(day?.log || {});
  for (const meal of log) {
    const items = Array.isArray(meal?.items)
      ? meal.items
      : (meal?.type === 'food' || meal?.type === 'recipe' ? [meal] : []);
    for (const item of items) {
      const key = String(item?.foodDbKey || item?.matchedKey || '').trim();
      if (key === DROP) {
        diaryHits.push({
          date: String(dayKey).slice('trackerStorico_'.length),
          name: item?.name || item?.desc || null,
          id: item?.id || null,
        });
      }
    }
  }
}

if (diaryHits.length > 0) {
  console.error('ABORT: DROP ancora referenziato nel diario:', diaryHits);
  process.exit(1);
}
console.log('Diario: 0 riferimenti a', DROP);

if (!APPLY) {
  console.log('Dry-run ok. Riesegui con --apply per eliminare.');
  process.exit(0);
}

firebaseRemove(`${dbPath}/${DROP}`);
const after = firebaseGet(`${dbPath}/${DROP}`);
const keepStill = firebaseGet(`${dbPath}/${KEEP}`);
console.log(JSON.stringify({
  deleted: DROP,
  dropGone: after == null,
  keepPresent: keepStill != null,
  keepName: keepStill?.name || keepStill?.desc || null,
}, null, 2));

if (after != null || keepStill == null) {
  console.error('Verifica post-delete fallita');
  process.exit(1);
}
console.log('OK: duplicato eliminato, keep intatto.');
