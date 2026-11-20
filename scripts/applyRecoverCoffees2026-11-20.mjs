/**
 * Ripristina i due caffè del 2026-11-20 via merge-by-id (admin, bypass rules).
 *
 * Uso:
 *   node scripts/applyRecoverCoffees2026-11-20.mjs           # dry-run
 *   node scripts/applyRecoverCoffees2026-11-20.mjs --apply   # scrive
 */
import { createRequire } from 'node:module';
import {
  buildCoffeeStimulantNode,
  COFFEE_VARIANT,
} from '../src/features/stimulants/coffeeLogEngine.js';
import { mergeEntryListsById, DAY_WRITE_PROTOCOL } from '../src/utils/dayNodeWrite.js';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin/lib/index.js');

const UID = 'hvPTB7P3DUZ5nlAW7PH08AG4Rqt1';
const DATE = '2026-11-20';
const PATH = `users/${UID}/tracker_data/trackerStorico_${DATE}`;
const apply = process.argv.includes('--apply');

const KNOWN = [
  { id: '1795153405192', time: 6.75, label: 'Caffè espresso amaro' },
  { id: '1795162983203', time: 9.5, label: 'Caffè espresso amaro' },
];

const proposed = KNOWN.map((row) => {
  const node = buildCoffeeStimulantNode(COFFEE_VARIANT.AMARO, row.time, {
    id: row.id,
    coffeeType: 'espresso',
  });
  return { ...node, label: row.label || node.label };
});

if (!admin.apps.length) {
  admin.initializeApp({
    databaseURL: process.env.FIREBASE_DATABASE_URL
      || 'https://mio-tracker-default-rtdb.europe-west1.firebasedatabase.app',
  });
}

const db = admin.database();
const snap = await db.ref(PATH).get();
const current = snap.exists() ? snap.val() : null;
if (!current) {
  console.error('Nodo giorno assente:', PATH);
  process.exit(1);
}

const nextManual = mergeEntryListsById(current.manualNodes, proposed, null);
const unchanged = JSON.stringify(nextManual) === JSON.stringify(
  Array.isArray(current.manualNodes) ? current.manualNodes : [],
);

const next = {
  ...current,
  manualNodes: nextManual,
  rev: Number(current.rev || 0) + (unchanged ? 0 : 1),
  revBy: UID,
  revAt: Date.now(),
  writeProtocol: DAY_WRITE_PROTOCOL,
};

console.log(JSON.stringify({
  apply,
  path: PATH,
  beforeRev: current.rev,
  afterRev: next.rev,
  unchanged,
  beforeManual: current.manualNodes ?? 'MISSING',
  afterManual: nextManual.map((n) => ({ id: n.id, time: n.time, label: n.label })),
  logTypes: (current.log || []).map((x) => x.type + ':' + (x.id || x.mealId)),
}, null, 2));

if (!apply) {
  console.log('Dry-run: nessuna scrittura. Ripeti con --apply per scrivere.');
  process.exit(0);
}

if (unchanged) {
  console.log('Già presenti: nessuna scrittura.');
  process.exit(0);
}

await db.ref(PATH).set(next);
const verify = (await db.ref(PATH).get()).val();
console.log(JSON.stringify({
  written: true,
  rev: verify.rev,
  manualNodes: (verify.manualNodes || []).map((n) => ({ id: n.id, time: n.time, label: n.label })),
  logLen: (verify.log || []).length,
}, null, 2));
process.exit(0);
