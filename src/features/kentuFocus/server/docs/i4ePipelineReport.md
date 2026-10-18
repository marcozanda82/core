# I4-E — Pipeline end-to-end su Firebase Emulator

Chiusura implementazione. Nessun deploy, nessuna callable/trigger, nessun DB reale, nessuna UI.

## 1. File creati / modificati

**Nuovi**
- `server/paths/trackerRtdbPaths.js`
- `server/reader/AdminRtdbTrackerReader.js` (+ `MemoryTrackerReader`)
- `server/reader/buildDossierInputFromTracker.js`
- `server/pipeline/runFocusEditionPipeline.js`
- `server/pipeline/focusPipelineDiag.js`
- `normalize/resolveMainNightSleep.js`
- `server/__tests__/fixtures/i4eTrackerFixtures.js`
- `server/__tests__/focusPipeline.i4e.test.js`
- `__tests__/focusMainNight.i4e.test.js`
- `__tests__/focusPipeline.offline.i4e.test.js`
- `server/docs/i4eMainNightCriterion.md`
- `server/docs/i4ePipelineReport.md`

**Modificati**
- `normalize/normalizeSleepNight.js` — usa resolve + flag ambiguità
- `build/buildFocusDossier.js` — flags sleepAmbiguous / mainNightStatus
- `scripts/syncFocusForFunctions.mjs` — export pipeline/reader
- `functions/smokeFocusPackage.cjs` — verifica export I4-E
- `package.json` — `test:focus:i4e` + test offline I4-E

## 2. Architettura pipeline

```
AdminRtdbTrackerReader (chiavi trackerStorico_* only)
  → buildDossierInputFromTracker (history briefs, sleep gate)
  → gate sonno (requireSleep)
  → publishFocusEdition
       dossier → selectFocusEditorial(+memory)
       → generateFocusWrittenEdition (FakeGemini | fallback)
       → validate → rev immutabile → publish meta/archive
       → editorial_memory
  → FocusPipelineReport (no UID/PII)
```

Client autenticato: legge solo `meta` + `rev/{currentRevision}` + `archive_index` (regole locali).

## 3. Criterio notte principale

Vedi `i4eMainNightCriterion.md`: dedup id, min 3h, timeline/gap, altrimenti `ambiguous` → blocco publish.

## 4. Test

| Suite | Esito |
|--------|--------|
| `npm test` (offline, include I4-E offline) | **184 pass / 0 fail** |
| `npm run test:focus:i4e` (emulator) | **9 pass / 0 fail** |

## 5. Letture RTDB (es. giornata completa, history 20)

Da report emulator I4-E.1:
- `dailyRecords`: 21
- `approxBytes`: ~7363
- `presentDays`: 21 / `missingDays`: 0
- Nessuna scansione di `users/{uid}` intero

## 6. Concorrenza / crash

- Due worker → una sola pubblicazione OK
- Job `interrupted` + steal → recovery OK
- Publish ripetuto → idempotent replay OK

## 7. Regole sicurezza (I4-E.7)

- Client: meta + rev corrente OK
- Rev preparatoria / jobs / dossiers / memory → denied
- Write edizioni → denied
- Archive index leggibile, senza body articoli

## 8. Tre edizioni pubblicate (emulator, fixture)

| Label | Prosa | Note |
|--------|--------|------|
| positiva | **fallback** | Lead proteine; good sonno/workout; feature peso/doc |
| scarsa | **fallback** | 0 articoli; Coach “registra un pasto…” |
| gemini_sim | **validated_ai** | FakeGemini — **non** Gemini live |

Dettaglio stampato in log test `I4E_THREE_EDITIONS`.

## 9. Problemi editoriali

- Prefisso date ripetitivo nel fallback
- Coach assente nelle giornate ricche; presente solo in scarsa (ok policy)
- Prosa FakeGemini = clone del fallback (simulazione schema, non qualità giornalistica Gemini)
- Confronto storico “non inventa” giorni mancanti → edizioni thin legittimamente vuote di trend

## 10. Node 20 / bundle

- Sync: 52 js → `_shared`; `GEMINI_HTTP_PARITY_OK`; `SMOKE_OK` Node **v20.19.5**
- Build: OK; `FOCUS_ABSENT_FROM_DIST`
- `callGemini` invariata (`exports.callGemini` + `europe-west1`)

## 11. Rischi residui pre-live

1. Gemini live non verificata
2. Nessuna callable/trigger — wiring Functions richiede approvazione
3. Twin HTTP Gemini ancora duplicato (parity OK)
4. Gate sonno può bloccare utenti senza notte chiara (by design)
5. Targets/body weight non letti da profilo RTDB (passati come input pipeline)
6. Regole Focus ancora solo in `database.rules.focus.local.json`

## 12. Operazioni che richiedono approvazione per deploy

1. Merge regole Focus in `database.rules.json` produzione
2. Creazione callable/admin job o scheduler (se previsti)
3. Trigger su sonno / tracker (se previsti) — **non** in I4-E
4. Deploy Cloud Functions con pacchetto `_shared`
5. Config secret `GEMINI_API_KEY` per Focus (oltre a callGemini)
6. Qualsiasi UI / Hub / SalaComandi
7. Accesso DB reale / backfill storici utenti
8. Attivazione pubblicazione automatica quotidiana

## Stop

I4-E completa. Attendere approvazione.
