#!/usr/bin/env node
/**
 * Recupero una tantum di quality/notes sonno persi da denormalizeLogForFirebase.
 *
 * Default: DRY-RUN (nessuna scrittura).
 *
 * Uso:
 *   node scripts/recoverSleepQualityNotes.mjs --dump path/to/tracker_data.json
 *   node scripts/recoverSleepQualityNotes.mjs --dump path/to/localStorage-export.json
 *
 * Dump atteso: oggetto tracker_data (chiavi trackerStorico_YYYY-MM-DD) oppure
 * { days: { trackerStorico_…: node } } (cache recent history) oppure
 * mappa localStorage { "trackerStorico_YYYY-MM-DD": "{log:…}" }.
 *
 * --apply scrive su RTDB solo se FIREBASE_DATABASE_EMULATOR_HOST è impostato
 * OPPURE se passi --i-understand-production e GOOGLE_APPLICATION_CREDENTIALS.
 * Non usare --apply sull'account reale senza conferma esplicita.
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { denormalizeSleepEntry } from '../src/utils/denormalizeSleepEntry.js';

function parseArgs(argv) {
  const out = { dump: null, apply: false, production: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dump') out.dump = argv[++i];
    else if (a === '--apply') out.apply = true;
    else if (a === '--i-understand-production') out.production = true;
  }
  return out;
}

function asArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return Object.values(raw);
  return [];
}

function expandLog(log) {
  const out = [];
  for (const entry of asArray(log)) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.type === 'meal' && Array.isArray(entry.items)) {
      out.push(...entry.items);
      continue;
    }
    out.push(entry);
  }
  return out;
}

function sleepFields(entry) {
  if (!entry || String(entry.type || '').toLowerCase() !== 'sleep') return null;
  const notes = String(entry.notes ?? entry.note ?? entry.details ?? '').trim();
  const q = Number(entry.quality ?? entry.sleepQuality ?? entry.rating);
  const quality = Number.isFinite(q) && q >= 1 && q <= 5 ? Math.round(q) : null;
  if (quality == null && !notes) return null;
  return { quality, notes: notes || null };
}

function loadDump(filePath) {
  const raw = JSON.parse(readFileSync(filePath, 'utf8'));
  const days = {};

  if (raw?.fullHistory && typeof raw.fullHistory === 'object') {
    Object.assign(days, raw.fullHistory);
  } else if (raw?.days && typeof raw.days === 'object') {
    Object.assign(days, raw.days);
  } else if (typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw)) {
      if (!key.startsWith('trackerStorico_')) continue;
      if (typeof value === 'string') {
        try {
          days[key] = JSON.parse(value);
        } catch {
          days[key] = null;
        }
      } else {
        days[key] = value;
      }
    }
  }
  return days;
}

function scan(days) {
  const recoverable = [];
  const alreadyOk = [];
  const sleepWithoutMeta = [];

  for (const [key, node] of Object.entries(days)) {
    if (!key.startsWith('trackerStorico_') || !node || typeof node !== 'object') continue;
    const date = key.slice('trackerStorico_'.length);
    const log = expandLog(node.log || node.dati?.log);
    const sleeps = log.filter((e) => String(e?.type || '').toLowerCase() === 'sleep');
    if (sleeps.length === 0) continue;

    for (const entry of sleeps) {
      const meta = sleepFields(entry);
      if (!meta) {
        sleepWithoutMeta.push({ date, id: entry.id || null });
        continue;
      }
      // Se già ha quality/notes sul nodo “come da RTDB denormalizzato”, conta ok.
      const hasCanonical = entry.quality != null || (entry.notes && String(entry.notes).trim());
      if (hasCanonical && entry.notes != null) {
        alreadyOk.push({ date, ...meta, id: entry.id || null });
      } else {
        recoverable.push({
          date,
          id: entry.id || null,
          quality: meta.quality,
          notes: meta.notes,
          patch: denormalizeSleepEntry({ ...entry, ...meta, notes: meta.notes || entry.notes }),
        });
      }
    }
  }

  return { recoverable, alreadyOk, sleepWithoutMeta };
}

function printBrowserSnippet() {
  console.log(`
--- Snippet browser (DevTools, sulla PWA loggata) ---
(() => {
  const keys = Object.keys(localStorage).filter((k) => k.startsWith('trackerStorico_') || k.includes('recentHistory') || k.includes('tracker'));
  const hits = [];
  for (const k of keys) {
    let v; try { v = JSON.parse(localStorage.getItem(k)); } catch { continue; }
    const nodes = v?.days && typeof v.days === 'object' ? v.days : { [k]: v };
    for (const [nk, node] of Object.entries(nodes || {})) {
      if (!String(nk).includes('trackerStorico_') && !node?.log) continue;
      const log = Array.isArray(node?.log) ? node.log : Object.values(node?.log || {});
      for (const e of log) {
        if (e?.type !== 'sleep') continue;
        const notes = String(e.notes ?? e.note ?? e.details ?? '').trim();
        const q = Number(e.quality ?? e.sleepQuality ?? e.rating);
        if ((Number.isFinite(q) && q >= 1 && q <= 5) || notes) {
          hits.push({ key: nk, quality: Number.isFinite(q) ? q : null, notes: notes || null });
        }
      }
    }
  }
  console.table(hits);
  console.log('notti con quality/notes in cache locale:', hits.length);
  return hits;
})();
--- fine snippet ---
`);
}

async function main() {
  const args = parseArgs(process.argv);
  console.log('recoverSleepQualityNotes — dry-run di default (nessuna scrittura).');
  printBrowserSnippet();

  if (!args.dump) {
    console.log('Passa --dump <file.json> (export tracker_data o localStorage) per un conteggio offline.');
    console.log('Finché il bug era attivo, sync e cache locale scrivevano il log già denormalizzato: il recupero tipico è 0 notti, salvo dump più vecchi o alias note/details ancora presenti.');
    process.exit(0);
  }

  const dumpPath = path.resolve(args.dump);
  if (!existsSync(dumpPath)) {
    console.error('File non trovato:', dumpPath);
    process.exit(1);
  }

  const days = loadDump(dumpPath);
  const { recoverable, alreadyOk, sleepWithoutMeta } = scan(days);

  console.log(JSON.stringify({
    dump: dumpPath,
    daysScanned: Object.keys(days).filter((k) => k.startsWith('trackerStorico_')).length,
    recoverableNights: recoverable.length,
    alreadyOkNights: alreadyOk.length,
    sleepWithoutMeta: sleepWithoutMeta.length,
    sampleRecoverable: recoverable.slice(0, 10),
  }, null, 2));

  if (!args.apply) {
    console.log('\nNessuna scrittura. Per applicare (solo dopo ok esplicito): ripeti con --apply e dump verificato.');
    return;
  }

  const onEmulator = Boolean(process.env.FIREBASE_DATABASE_EMULATOR_HOST);
  if (!onEmulator && !args.production) {
    console.error('Rifiuto --apply: non sei sull’emulator e manca --i-understand-production.');
    process.exit(2);
  }

  console.error('Apply non implementato in questo passaggio: usa il report per patch manuale o chiedi un apply dedicato dopo conferma del conteggio.');
  process.exit(3);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
