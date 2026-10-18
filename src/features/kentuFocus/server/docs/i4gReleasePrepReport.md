# I4-G — Report preparazione rilascio controllato

**Stato:** I4-G completata in repo. Nessun deploy, nessun trigger/cron, nessuna chiamata Gemini live, nessun accesso Firebase reale, nessuna UI Focus.

---

## 1. File creati o modificati

### Nuovi
- `src/features/kentuFocus/server/admin/runFocusAdminEdition.js`
- `scripts/focusAdminGenerateEdition.mjs`
- `scripts/prepareFocusFunctionsPackage.mjs`
- `src/features/kentuFocus/__tests__/focusTargetsWeight.i4g.test.js`
- `src/features/kentuFocus/server/__tests__/focusAdmin.i4g.test.js`
- `src/features/kentuFocus/server/docs/i4gPilotPlan.md`
- `src/features/kentuFocus/server/docs/i4gPilotRulesNote.md`
- `src/features/kentuFocus/server/docs/i4gReleasePrepReport.md` (questo file)

### Modificati (Focus / packaging / regole)
- `src/features/kentuFocus/server/reader/resolveFocusProfileData.js` — policy I4-G target/peso
- `src/features/kentuFocus/server/pipeline/runFocusEditionPipeline.js` — bypass sonno client ignorato
- `database.rules.json` — blocco `kentu_focus` (allineato a `database.rules.focus.local.json`)
- `scripts/syncFocusForFunctions.mjs` — export admin + moduli richiesti
- `functions/smokeFocusPackage.cjs` — assert export admin/targets
- `package.json` — `prepare:focus-functions`, `test:focus:i4g`, `focus:admin-generate`, test offline I4-G
- Test I4-E/F aggiornati al gate/history I4-G
- `functions/_shared/**` — rigenerato da sync (57 js)

### Non toccati (vincolo)
- `SalaComandi.jsx`, `coreEngine.jsx`, Hub/UI, contratto `callGemini`

---

## 2. Regola definitiva target storici

Per ogni `analysisDate`:

1. **Unica sorgente storica ammessa:** voci di `profile_targets.targets.targetHistory` con data verificabile (`effectiveDate` | `date` | `timestamp`→ISO) **≤ analysisDate**.
2. Applicazione cumulativa in ordine temporale; `referenceDate` = ultima effectiveDate applicata.
3. **`targets.kcal` / `targets.prot` correnti** e **`profile.targetCalories` / `profile.proteinTarget`** senza data **non** sono storici → non applicati al giorno analizzato.
4. Se esistono solo override/current non datati → `targets: null`, provenance `missing`, conflitto `only_undated_current_targets_available`.
5. Se storia datata e profilo non datato differiscono (≥50 kcal / ≥10 g prot) → conflitto diagnostico, ma vince la storia.
6. Voci history senza data → skip + conflitto `targetHistory_undated_entries_skipped`.
7. kcal/prot ≤0 o non numerici → trattati come missing.
8. Provenance: `kcalSource`/`proteinSource` = `targets.targetHistory`, `referenceDate`, `conflict[]`.

Costante macchina: `FOCUS_TARGET_WEIGHT_POLICY` in `resolveFocusProfileData.js`.

**Diario Kentu:** comportamento target UI/diario invariato.

---

## 3. Regola definitiva peso

1. Preferire `body_metrics` con data verificabile **≤ analysisDate** e peso > 0.
2. Conservare `bodyMeasuredOn` = data reale della misura.
3. `attribution`: `recorded_on_analysis_date` | `last_available_on_or_before`.
4. Misure future rispetto ad `analysisDate` ignorate (`futureIgnored`).
5. `profile.weight`: **non** attribuito al giorno → `bodyWeightKg: null`, `attribution: profile_weight_not_attributed_to_day`, `profileWeightKg` solo diagnostica.
6. Conflitto se |metrics − profile| ≥ 2 kg.
7. Zero / assente → missing (mai coercizione a 0 come metrica).
8. Nessun trend da singolo peso (nessuna costruzione trend in I4-G).

---

## 4. Esito gate sonno

- Pubblicazione ordinaria richiede notte successiva `selected` attendibile.
- `explicitRegen` **non** bypassa (`explicit_regen_does_not_bypass_sleep`).
- `adminAllowPublishWithoutSleep` / `allowPublishWithoutSleep` **ignorati** sull’entry pipeline (`ignored_client_sleep_bypass_flag`).
- Unico hook interno test: `requireSleep: false` (mai da CLI admin).
- Entry admin forza `requireSleep: true` e non inoltra flag bypass.
- Writer sonno esistenti non modificati.

---

## 5. Entry point amministrativo

| Pezzo | Ruolo |
|--------|--------|
| `runFocusAdminEdition` | API interna server-side |
| `scripts/focusAdminGenerateEdition.mjs` | CLI |
| Auth | `FOCUS_ADMIN_TOKEN` env (non flag client) |
| Runtime | richiede `FIREBASE_DATABASE_EMULATOR_HOST`; `FOCUS_ADMIN_ALLOW_NON_EMULATOR=1` **bloccato in I4-G** |
| Input | UID validato, `publicationDate` ISO, horizon |
| Gate | sonno obbligatorio; no regen silenziosa |
| Output | meta + report tecnico; **no** dossier grezzo / no token |
| Rate limit | ≥2s tra invocazioni (processo), disattivabile in test via `rateLimitState` |
| Wire Functions | **non** collegato a `functions/index.js` |

Testabile solo in emulator (`npm run test:focus:i4g` / CLI con emulator host).

---

## 6. Risultati autorizzazione (emulator)

- Token errato → `admin_unauthorized`
- Token corretto → publish rev 1; client legge `meta` / `rev` corrente; parent `editions/$date` negato
- Replay → `idempotentReplay: true`
- No sleep → `sleep_required` (admin non bypassa)
- Flag bypass pipeline → ignorato + nota
- Suite rules I4-C: owner-only meta/archive/current rev; no jobs/dossiers/memory; no cross-user; no anon; no write client; parent editions non espone prep

---

## 7. Stato regole RTDB

- `database.rules.json` contiene `kentu_focus` (identico a `database.rules.focus.local.json`).
- Rami `users` / `planning` / `weeklyPlanning` invariati.
- **Deploy regole: NON eseguito.**
- Dettaglio: `i4gPilotRulesNote.md`.

---

## 8. Packaging pronto

- `npm run prepare:focus-functions` → sync + parity Gemini HTTP + assert no React/firebase-client/coreEngine import + smoke
- Node **v20.19.5**: `FOCUS_PACKAGE_PREPARE_OK`, 57 js → `functions/_shared`
- `callGemini` intatto; `index.js` non importa Focus
- Nessun predeploy automatico collegato

---

## 9. Test eseguiti e risultati

| Suite | Esito |
|--------|--------|
| `npm test` (193, incl. Focus offline I4-G) | **pass** |
| `test:focus:i4g` (admin emulator) | **3/3 pass** |
| `test:focus:i4c` (publish + rules) | **20 pass** (1 skip no-em) |
| `test:focus:i4e` | **9/9 pass** |
| `test:focus:i4f` | **4/4 pass** |
| `prepare:focus-functions` Node 20 | **OK** |
| `verify:gemini-http-parity` | **OK** |
| `npm run build` | **OK** |
| Focus in `dist/assets/*.js` | **FOCUS_ABSENT_FROM_DIST** |

---

## 10. Impatto bundle

- Focus assente dal dist.
- Chunk principali (hash Vite): `index-DKRRyveg.js` ~1452 kB, `SalaComandi-CJEfRbGM.js` ~1040 kB, `firebase-chunk-C_PPCa_S.js` ~914 kB — nessun ingresso Focus.

---

## 11. Rischi residui

1. Gemini **live** mai verificata in pipeline Focus.
2. Regole in repo ma **non** in produzione finché non si fa deploy database.
3. CLI admin bloccata fuori emulator in I4-G — pilota reale richiede approvazione esplicita + eventuale sblocco runtime.
4. Target history assente su utenti reali → edizioni senza target (prudente, ma editoriale più “thin”).
5. `profile.weight` non usato → giorni senza body_metrics senza peso in dossier.
6. Nessuna UI: verifica pilota solo via RTDB/console/REST.
7. Rate limit solo in-process (non distribuito).

---

## 12. Piano pilota

Vedi `i4gPilotPlan.md` (comandi descritti, **non** eseguiti).

Sintesi ordine (solo dopo approvazione):
1. `firebase deploy --only database` (regole)
2. Packaging già pronto; deploy Functions solo se necessario per altro (non wire Focus pubblico)
3. Emulator o (futuro) allow-non-emulator approvato + `FOCUS_ADMIN_TOKEN`
4. Una sola: `node scripts/focusAdminGenerateEdition.mjs --uid <PILOT> --date <YYYY-MM-DD>`
5. Verifica meta/rev/archive; report reads/timings; no cron

---

## 13. Operazioni che richiedono approvazione esplicita

1. **Deploy** `database.rules.json`
2. **Deploy** Cloud Functions (qualsiasi)
3. Abilitare admin fuori emulator (`FOCUS_ADMIN_ALLOW_NON_EMULATOR` o equivalente prod)
4. Collegare Focus a `functions/index.js` / callable
5. Chiamate **Gemini live** nella pipeline Focus
6. Trigger sonno / cron / scheduler
7. UI Focus / ingresso Hub
8. Accesso database reale per generazione edizione
9. Nuove dipendenze npm
10. Ampliare catalogo editoriale

---

## Stop

I4-G implementata e verificata in locale/emulator. **Attendere approvazione** prima di qualsiasi attivazione.
