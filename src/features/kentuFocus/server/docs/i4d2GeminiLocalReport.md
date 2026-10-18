# I4-D2 — Gemini redattore controllato (locale)

Report di chiusura. Nessun deploy, nessuna callable nuova, nessun accesso DB reale.

## 1. Obiettivo

Collegare Gemini al motore editoriale Focus in ambiente locale: brief → adapter → validazione → edizione, con fallback deterministico se l’output AI non è attendibile.

## 2. Vincoli rispettati

| Vincolo | Stato |
|--------|--------|
| No `SalaComandi.jsx` / `coreEngine.jsx` / Hub / UI | OK |
| No cambio comportamento `callGemini` | OK (helper CJS estratto; export callable invariato) |
| No nuove callable / trigger sonno / deploy / DB reale | OK |
| No nuove dipendenze | OK |
| Focus assente dal bundle frontend | OK (`FOCUS_ABSENT_FROM_DIST`) |
| No log prompt/PII; no API key in repo | OK |
| Live solo con env + fixture sintetiche ≤3 call | Skip senza chiave |

## 3. Fase 1 — Fallback senza lead

`buildFallbackWrittenEdition` conserva `good` / `feature` / `concern` anche con `lead: null`. `articles: []` solo se la selection non ha pezzi.

Test in `focusGemini.i4d2.test.js`: no-lead+good, no-lead+concern, multi secondari, selection vuota, nessuna sezione inventata.

## 4. Fase 2 — Validazione rafforzata

Implementata in `validateFocusWrittenEdition.js` + limiti in `FOCUS_SEMANTIC_VALIDATION_LIMITS`:

**Controlli effettivi**

- Schema / version / date / count / id / ruolo / selectionIndex
- `evidenceIds` ⊆ refs/path autorizzati; `metricsCited` byte-identici
- Numeri in title/body ⊆ allowlist (metriche + date + seed); placeholder `{{path}}` esclusi
- Cautele obbligatorie (`doNotClaim` + `limitations`) in `cautions[]`
- Hypothesis: rifiuto pattern causali tipici
- Provenance `missing`/`estimated` + linguaggio “misurato” → errore
- Coach gated; injection pattern in prosa
- Materializzazione deterministica cifre via `materializeAuthorizedProse.js`

**Limiti residui** (non equivalenza semantica)

- Causalità implicite senza keyword tipiche
- Numeri a parole; tono/diagnosi mascherate; omissioni di contesto fuori cautele

## 5. Fase 3 — Sicurezza brief

`sanitizeBriefText.js` + `buildFocusAiBrief.js`:

- Truncate / strip control chars / neutralize fence e “ignore instructions”
- Seed, limitations, doNotClaim, coach textSeed sanitizzati
- Nessun nome alimento grezzo / note utente libere oltre i seed editoriali già ridotti
- Prompt: fence DATI_UTENTE; system prevale; strategia primaria = input ridotto

Test: note/nomi malevoli → stringhe sanitizzate; injection in output AI → `injection_pattern` / fallback.

## 6. Fase 4 — Adapter Gemini

| File | Ruolo |
|------|--------|
| `functions/lib/geminiHttp.js` | Helper CJS condiviso usato da `callGemini` |
| `server/gemini/geminiHttpCore.js` | Twin ESM allineato (no HTTP verso callable) |
| `server/gemini/focusGeminiAdapter.js` | `FakeGeminiProvider` + `LiveGeminiProvider` |

Live: modello configurabile, timeout, maxOutputTokens, JSON text, retry solo 429/5xx/network (maxRetries finito), `maxCalls` budget, diag non sensibili, no log del prompt.

## 7. Fase 5 — Pipeline

`generateFocusWrittenEdition`: selection → AiBrief → prompt → Gemini (opz.) → `resolveWrittenEdition` (validate o fallback) → materialize.

`publishFocusEdition` può passare `geminiProvider`; senza provider o su fallimento → fallback. Selezione deterministica unica fonte di notizie/Coach. Nessuna pubblicazione di testo AI parzialmente validato.

## 8. Fase 6 — Test offline

`npm test` include `focusGemini.i4d2.test.js` (FakeGemini):

valido · JSON troncato · timeout · 429 · 5xx · evidence inventata · numero inventato · ruolo alterato · coach non autorizzato · causalità · injection · fallback post-validazione · missing_api_key senza rete.

**Risultato:** 173 test pass / 0 fail.

## 9. Fase 7 — Live locale

- Config server: `GEMINI_API_KEY` (env) già usata da Functions; non letta/stampata nel report.
- Esecuzione: `npm run test:focus:gemini-live`
- Questa sessione: `KEY_PRESENT=no` → `LIVE_SMOKE_SKIP reason=no_api_key` (0 chiamate rete).

Per ripetere con chiave (max 3, sequenziale, fixture sintetiche):

```bash
# PowerShell
$env:GEMINI_API_KEY="…"; npm run test:focus:gemini-live
```

## 10. Packaging / bundle

- Sync: 46 file → `functions/_shared`
- Smoke Node 20.19.5: `SMOKE_OK`
- `npm run build`: OK; Focus assente da `dist/assets/*.js`

## File principali aggiunti/modificati (I4-D2)

- `editorial/writing/sanitizeBriefText.js`, `materializeAuthorizedProse.js`, `generateFocusWrittenEdition.js`
- `editorial/writing/validateFocusWrittenEdition.js`, `buildFocusEditorialPrompt.js`, `buildFallbackWrittenEdition.js`
- `editorial/buildFocusAiBrief.js`
- `server/gemini/geminiHttpCore.js`, `focusGeminiAdapter.js`
- `server/publish/publishFocusEdition.js`
- `functions/lib/geminiHttp.js` + uso in `functions/index.js` (contratto callable invariato)
- `__tests__/focusGemini.i4d2.test.js`, `scripts/focusGeminiLiveSmoke.mjs`

## Fuori scope (stop)

I4-D3, deploy, attivazione produzione, trigger sonno, UI Focus.
