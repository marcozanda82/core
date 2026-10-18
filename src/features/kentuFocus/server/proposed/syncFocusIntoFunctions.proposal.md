# Packaging Focus → functions/ — IMPLEMENTATO in I4-C (senza deploy)

## Soluzione attiva

```bash
node scripts/syncFocusForFunctions.mjs   # o npm run sync:focus-functions
npm run smoke:focus-functions            # sync + smoke CJS→ESM
```

- Sorgente unica: `src/features/kentuFocus` + `src/utils/{computeTotaliCore,mealDraftStatus,draftParser}.js`
- Output generato (gitignored): `functions/_shared/`
- Bridge CJS: `functions/_shared/focusBridge.cjs` → `import('./focusEntry.mjs')`
- Verifica automatica: moduli richiesti presenti, nessun import React/firebase-client/outbound
- `functions/_shared/package.json` con `"type":"module"` (non altera `functions/package.json`)

## NON ancora collegato

- Nessun `predeploy` in `firebase.json`
- Nessuna callable / trigger Focus
- `functions/index.js` / `callGemini` invariati

## Prossimo passo (approvazione)

1. JDK ≥ 11 + `npm run test:focus:i4c`
2. Node 20 smoke sul pacchetto
3. Solo dopo OK: hook predeploy + merge rules produzione
