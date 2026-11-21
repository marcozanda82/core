/**
 * Probe: habits/search "pane" + duplicati DB personale "Pane integrale".
 * Uso: node scripts/probePaneHabitsAndDupes.mjs
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { toolGetHabits, rankSearchResultsByRecentUsage, loadRecentFoodUsageScores } from '../functions/mcp/habits.js';
import { searchFoodsDetailed } from '../src/foodSearch.js';
import { annotateCandidatesMatchQuality } from '../src/features/mealBuilder/utils/foodMatchQuality.js';

const UID = 'hvPTB7P3DUZ5nlAW7PH08AG4Rqt1';
const PROJECT = 'mio-tracker';

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

function normalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Minimal db shim for habits (reads tracker_data tree). */
function makeDbFromTracker(tracker) {
  return {
    ref(path) {
      const parts = String(path).split('/').filter(Boolean);
      return {
        async get() {
          if (parts[0] === 'users' && parts[2] === 'tracker_data') {
            return { exists: () => true, val: () => tracker };
          }
          return { exists: () => false, val: () => null };
        },
      };
    },
  };
}

const tracker = firebaseGet(`/users/${UID}/tracker_data`) || {};
const personalDb = tracker.trackerFoodDatabase || firebaseGet(`/users/${UID}/tracker_data/trackerFoodDatabase`) || {};

const db = makeDbFromTracker(tracker);
const habits = await toolGetHabits(db, UID, { limit: 40 });
const paneHabits = (habits.habits || []).filter((h) => /pane/i.test(h.name) || /pane/i.test(h.foodDbKey));

const foodDb = { ...personalDb };
const hits = searchFoodsDetailed(foodDb, 'pane integrale', { limit: 16 });
const annotated = annotateCandidatesMatchQuality('pane integrale', hits);
const recent = await loadRecentFoodUsageScores(db, UID);
const ranked = rankSearchResultsByRecentUsage(annotated, recent).slice(0, 12).map((hit) => {
  const usageCount = Number(hit.usageCount) || 0;
  const id = hit.id || hit.key || hit.foodDbKey || null;
  return {
    name: hit.name || hit.desc || null,
    id,
    matchQuality: hit.matchQuality || null,
    usageCount,
    usedTimesLabel: usageCount > 0
      ? `usato ${usageCount} volte negli ultimi 60 giorni`
      : null,
  };
});

// Duplicati per nome normalizzato
const byName = new Map();
for (const [key, row] of Object.entries(personalDb)) {
  if (!row || typeof row !== 'object') continue;
  const name = String(row.name || row.desc || key).trim();
  const norm = normalizeName(name);
  if (!norm) continue;
  const list = byName.get(norm) || [];
  list.push({ key, name, row });
  byName.set(norm, list);
}

const dupes = [];
for (const [norm, list] of byName) {
  if (list.length < 2) continue;
  if (!norm.includes('pane')) continue;
  const entries = list.map(({ key, name, row }) => {
    const habit = (habits.habits || []).find((h) => h.foodDbKey === key);
    return {
      key,
      name,
      usageCount: habit?.usageCount || 0,
      lastUsed: habit?.lastUsed || null,
      kcal: row.kcal ?? row.cal ?? null,
      prot: row.prot ?? null,
      carb: row.carb ?? null,
      fat: row.fatTotal ?? row.fat ?? null,
      fibre: row.fibre ?? row.fibreTotali ?? null,
      na: row.na ?? null,
      sale: row.sale ?? null,
      source: row.source || row.dbSource || null,
      updatedAt: row.updatedAt || row.lastUpdated || null,
    };
  });
  entries.sort((a, b) => b.usageCount - a.usageCount || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  dupes.push({
    normalizedName: norm,
    count: entries.length,
    proposeKeep: entries[0]?.key || null,
    proposeKeepReason: entries[0]?.usageCount > 0
      ? `più usato (${entries[0].usageCount} volte / 60g)`
      : 'primo per aggiornamento/valori (nessun uso recente)',
    entries,
  });
}

const report = {
  paneHabits,
  searchPaneIntegrale: ranked,
  paneNameDuplicates: dupes,
};

writeFileSync('./tmp-pane-habits-dupes.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
