# I4-G — Piano pilota (DESCRITTIVO — non eseguire)

Generare **una sola** edizione Focus su un UID autorizzato, senza trigger/cron/UI.

## Prerequisiti (approvazione esplicita richiesta per ogni deploy)

1. Merge regole già in `database.rules.json` (locale) → **deploy database** solo dopo OK.
2. Packaging Functions: `npm run prepare:focus-functions` (Node 20).
3. **Non** collegare `runFocusAdminEdition` a callable pubbliche in I4-G.
4. Secret `GEMINI_API_KEY` già usato da `callGemini` (non stampare). Focus admin CLI non chiama Gemini live in I4-G (fallback deterministico).

## Ordine comandi (quando approvato)

```text
# A) Deploy regole (SOLO dopo approvazione)
firebase deploy --only database

# B) Deploy Functions — SOLO callGemini / packaging, NON nuovi trigger
#    Se si espone in futuro un job admin, deve restare non-pubblico.
firebase deploy --only functions:callGemini

# C) Emulator pilota locale (consigliato prima del reale)
firebase emulators:start --only auth,database
# in altro shell, con emulator host:
set FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000
set FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
set FOCUS_ADMIN_TOKEN=<token-forte-non-committato>
node scripts/focusAdminGenerateEdition.mjs --uid <PILOT_UID> --date <YYYY-MM-DD> --horizon d30
```

## Limitare a un solo UID

- Eseguire il comando **una volta** con `--uid` esplicito.
- Non avviare scheduler.
- Non abilitare `FOCUS_ADMIN_ALLOW_NON_EMULATOR`.
- Rate limit processo: ≥2s tra invocazioni admin.

## Verifiche post-generazione

1. Client autenticato come PILOT_UID: leggere `kentu_focus/{uid}/editions/{date}/meta` + `rev/{n}`.
2. Controllare headline/teaser/articoli/coach; `proseSource` (fallback vs validated_ai).
3. Report admin: reads, timings, sleep status, horizon — senza PII.
4. Target: provenance `targets.targetHistory` + `referenceDate`.
5. Peso: `bodyMeasuredOn` + attribution sameDay/lastAvailable.
6. Sonno: status selected; se blocked → non pubblicare.

## Interrompere nuove generazioni

- Non rieseguire il comando.
- Non deployare cron/trigger.
- Revocare `FOCUS_ADMIN_TOKEN` / ruotare secret.

## Rollback senza toccare edizioni pubblicate

- Lasciare revisioni già pubblicate immutate (immutable rev).
- Non cancellare `kentu_focus/{uid}/editions/...` in produzione senza piano dati.
- Rollback codice Functions: ridistribuire revisione precedente **senza** nuovi entry Focus.
- Rollback regole: rimuovere blocco `kentu_focus` solo se necessario e approvato (rompe lettura client).

## Costi / Gemini

- Pilota I4-G: **0** chiamate Gemini live (CLI senza provider).
- Se in seguito si abilita Gemini server-side: max 1 call, budget provider, timeout, no log prompt.
