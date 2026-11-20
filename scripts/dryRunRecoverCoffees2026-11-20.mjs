/**
 * Dry-run: proposta ripristino caffè 2026-11-20 (nessuna scrittura).
 *
 * Fonte: dump RTDB letto in sessione (rev 20 @ 08:23Z) + buildCoffeeStimulantNode.
 * Cache browser locale (localStorage / recent_history) al momento del check:
 * solo 2 sleep, manualNodes assenti — non recuperabile da lì.
 *
 * Uso: node scripts/dryRunRecoverCoffees2026-11-20.mjs
 * Scrittura: solo dopo ok esplicito (non implementata qui).
 */
const {
  buildCoffeeStimulantNode,
  COFFEE_VARIANT,
} = await import('../src/features/stimulants/coffeeLogEngine.js');

const UID = 'hvPTB7P3DUZ5nlAW7PH08AG4Rqt1';
const DATE = '2026-11-20';
const PATH = `users/${UID}/tracker_data/trackerStorico_${DATE}`;

/** Snapshot noto (sola lettura storica) — id/orari/label da RTDB rev 20. */
const KNOWN = [
  { id: '1795153405192', time: 6.75, label: 'Caffè espresso amaro' },
  { id: '1795162983203', time: 9.5, label: 'Caffè espresso amaro' },
];

const proposed = KNOWN.map((row) => {
  const node = buildCoffeeStimulantNode(COFFEE_VARIANT.AMARO, row.time, {
    id: row.id,
    coffeeType: 'espresso',
  });
  return {
    ...node,
    // preserva label storica se diversa dal builder
    label: row.label || node.label,
  };
});

console.log(JSON.stringify({
  dryRun: true,
  willWrite: false,
  path: PATH,
  note: [
    'Browser localStorage trackerStorico_2026-11-20 e kentu_recent_history: solo sleep, niente caffè.',
    'IndexedDB Firebase non ha restituito dump utile dal tab localhost.',
    'Telefono (Capacitor WebView): da controllare a mano — Preferences / Application storage.',
    'Questa proposta ricostruisce i due nodi con id/orari noti da dump rev20.',
    'Dopo il tuo ok: merge manualNodes (union per id) + bump rev via saveDayNodeWithRev — non set cieco.',
  ],
  proposedManualNodes: proposed,
  mergePlan: {
    mode: 'union-by-id into existing manualNodes (currently MISSING)',
    preserveLog: true,
    preserveAutopilot: true,
  },
}, null, 2));
