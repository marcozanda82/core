# I4-F — Completezza sorgenti dati e preparazione backend

Nessun deploy, callable, trigger, UI o Gemini live.

## 1. File creati / modificati

**Nuovi**
- `server/paths/userDataRtdbPaths.js`
- `server/reader/resolveFocusProfileData.js`
- `server/reader/focusHistoryHorizon.js`
- `server/reader/trackerDateWindow.js`
- `__tests__/focusProfile.i4f.test.js`
- `server/__tests__/focusPipeline.i4f.test.js`
- `server/docs/i4fDataSourcesReport.md`

**Modificati**
- `server/reader/AdminRtdbTrackerReader.js` — profile_targets + body_metrics + `loadFocusUserContext`
- `server/reader/buildDossierInputFromTracker.js` — contesto profilo + horizon
- `server/pipeline/runFocusEditionPipeline.js` — gate sonno, horizon, note conflitti
- `normalize/resolveMainNightSleep.js` — frammenti / overnight corto → ambiguous
- `build/buildFocusDossier.js` — peso ≤ 0 → missing
- `editorial/focusCoachCatalog.js` — anti-ripetizione LOG_CONSISTENCY
- `editorial/extractFocusSignals.js` — peso ≤ 0 escluso
- Test I4-E offline/emulator (gate sonno)
- `package.json`, `scripts/syncFocusForFunctions.mjs`

## 2. Mappa sorgenti effettive

| Dato | Path RTDB | Shape | Writer | Focus v1 |
|------|-----------|-------|--------|----------|
| Diario giorno | `users/{uid}/tracker_data/trackerStorico_YYYY-MM-DD` | `{data,log,manualNodes,…}` | diary sync / SalaComandi | **Sì** |
| Target macro | `users/{uid}/profile_targets` → `targets` (+ `targetHistory`) | `kcal`, `prot`, … | onboarding, TDEE, training block | **Sì** (mappa → `proteinG`) |
| Override kcal/prot | `profile_targets/profile` | `targetCalories`, `proteinTarget` | profile hydrate | **Sì** (prevalgono) |
| Peso storico | `users/{uid}/body_metrics/{id}` | `{date,weight,timestamp,…}` | useBodyMetricsEngine | **Sì** |
| Peso snapshot | `profile_targets/profile.weight` | number | sync da body history | Fallback |
| Sonno | tracker `type:sleep` su publicationDate | — | diario | **Sì** (no `sleep_logs`) |
| Goal cut/bulk | `profile.nutritionGoal`, weekly blocks | — | vari | **No** v1 |
| Micro / physiology | profile / physiology_model | — | — | **No** v1 |

Nessun percorso inventato. Nessun import di React/coreEngine.

## 3. Target e metriche corporee ora disponibili

Pipeline carica automaticamente (salvo override espliciti):

- `{ kcal, proteinG }` da timeline + override profile; **mai** default 2000/150
- `bodyWeightKg` + `bodyMeasuredOn` da `body_metrics` ≤ analysisDate; fallback profile.weight senza measuredOn
- Conflitti annotati in report (`targets_conflict`, `body_conflict`)
- Peso ≤ 0 / target ≤ 0 → missing

## 4. Politica orizzonti storici

| Horizon | Giorni letti | Uso |
|---------|--------------|-----|
| `d7` | **14** | d7 + d7_vs_prev7 |
| `d30` (default) | **60** | d30 + d30_vs_prev30 |
| `d90` | **90** | solo se `needD90` / `horizon:'d90'` |
| `historyDays` esplicito | capped ≤ 90 | override |

Non si scaricano sempre 90 giorni. Cache non introdotta (misure sotto).

## 5. Politica gate sonno (finale)

- Generazione **ordinaria** e **`explicitRegen`**: richiedono notte attendibile.
- `allowPublishWithoutSleep` **non** bypassa più (legacy ignorato + nota).
- Bypass **solo** `adminAllowPublishWithoutSleep` (isolato, mai per callable/trigger future).
- Notte: dedup id; frammenti che sommano ≥3h → ambiguous; corto overnight → ambiguous; turni con ≥3h e candidata unica → selected.

## 6. Test

| Suite | Esito |
|--------|--------|
| `npm test` | **191 pass / 0 fail** |
| `test:focus:i4e` | **9 pass** |
| `test:focus:i4f` | **4 pass** |

## 7. Misure lettura 7/30/90 (emulator, fixture dense)

```
d7:  historyDays=14, reads=17,  ~5.6 KB, readMs≈58,  totalMs≈139
d30: historyDays=60, reads=63, ~20.6 KB, readMs≈205, totalMs≈271
d90: historyDays=90, reads=93, ~30.4 KB, readMs≈293, totalMs≈374
```

(Include +2 get: profile_targets + body_metrics.)

## 8. Anomalie editoriali

- Prefisso date fallback ancora ripetitivo
- FakeGemini = clone seed (non qualità live)
- Confronto storico non attribuito al solo giorno precedente (usa `comparisons.d7_vs_prev7` con gate copertura)
- Coach LOG_CONSISTENCY non riproposto se già in `recentCoach`

## 9. Node 20 / bundle

- Sync: 56 js → `_shared`; `GEMINI_HTTP_PARITY_OK`; `SMOKE_OK` Node **v20.19.5**
- Build OK; `FOCUS_ABSENT_FROM_DIST`

## 10. Blocchi pre-deploy

1. Nessuna callable/trigger Focus
2. ~~Regole Focus solo in local~~ → **I4-G:** merge in `database.rules.json` (non deployato)
3. Gemini live non verificata
4. Targets/peso ora letti, ma nessun cron produzione
5. `adminAllowPublishWithoutSleep` non deve finire in API pubbliche

## 11. Piano minimo attivazione produzione (non eseguito)

1. Approvazione merge regole `kentu_focus` in `database.rules.json`
2. Packaging `_shared` già pronto → wire **interna** Functions (nessuna callable pubblica finché non approvata)
3. Job/admin **manuale** o callable autenticata admin-only (separata da `callGemini`)
4. Secret Gemini dedicato o riuso env esistente (senza cambiare contratto `callGemini`)
5. Smoke emulator + 1 utente pilota (no cron)
6. Solo dopo: scheduler giornaliero + UI lettura edizioni
7. Mai esporre `adminAllowPublishWithoutSleep` a client

## Stop

I4-F completa. Attendere approvazione.
