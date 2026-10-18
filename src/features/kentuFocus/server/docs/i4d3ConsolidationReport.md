# I4-D3 — Consolidamento Gemini e preparazione verifica reale

Chiusura revisione tecnica offline. Nessun deploy, nessuna callable/trigger Focus, nessun DB reale.

## 1. Duplicazioni Gemini

| Modulo | Ruolo |
|--------|--------|
| `functions/lib/geminiHttp.js` (CJS) | **Canonico** per `callGemini` |
| `src/.../server/gemini/geminiHttpCore.js` (ESM) | Twin per adapter Focus locale / `_shared` |

**Esito:** duplicazione intenzionale CJS/ESM (stessa logica HTTP: sanitize model, normalizeGenerationConfig, extract text, post generateContent).

**Intervento applicato (minimo, non rischioso):**
- Allineato ESM a CJS (`stopSequences`, struttura `postGeminiGenerateContent`).
- Aggiunto `scripts/verifyGeminiHttpParity.mjs` (ora in `smoke:focus-functions`).
- Commenti: CJS = sorgente di comportamento per la callable.

**Non applicato (refactor rischioso — stop su questo punto):**
- Unificazione via `createRequire` da `src/` → `functions/lib` (path diversi src vs `_shared`, rischio import accidentale in Vite).
- Generazione automatica del twin da un solo file (richiede packaging dedicato).

Contratto pubblico `callGemini` invariato (export, regione `europe-west1`, helper CJS).

## 2. Correzioni implementate

1. **Materialize rafforzato** (`materializeAuthorizedProse.js`): risultato strutturato `{ text, ok, unresolved, errors }`; rifiuta unknown / missing / invalid numeric / unit incompatibile / lookalike; duplicati OK; edizione finale senza `{{...}}`.
2. **Pipeline** (`generateFocusWrittenEdition.js`): materialize fallito → scarta AI → fallback deterministico (`diag: materialize_failed`).
3. **Validazione**: medical overclaim (subset), confronti storici se `d7_comparison_unavailable`, placeholder ⊆ `metricsCited`, lookalike.
4. **Parity check** Gemini HTTP + smoke.
5. Test `focusWriting.i4d3.test.js`.

## 3. Esiti test placeholder

| Caso | Esito |
|------|--------|
| Placeholder autorizzato | OK → cifra+unità |
| Duplicato | OK (2 risoluzioni) |
| Sconosciuto | errore `unknown_placeholder` |
| Irrisolto / missing value | errore → fallback pipeline |
| Numerico non valido | `invalid_numeric_placeholder` |
| Unità incompatibile (non stringa/number) | `incompatible_unit` |
| Estimated come “misurato” | blocco validazione |
| Title/body | materializzati |
| Coach con placeholder | rifiuto (no metrics) |
| Lookalike `{{sleep hours}}` | rifiuto |
| Edizione finale | nessun `{{` residuo |

## 4. Limiti semantici residui

**Bloccati automaticamente (deterministici):**
- Numeri non in allowlist; evidence/role/coach non autorizzati; cautele omesse; hypothesis+causal keywords; missing/estimated come misurato; medical overclaim tipici; confronti D7 se nota editoriale; placeholder/lookalike; injection pattern.

**Non risolvibili solo con regex/controlli strutturali:**
- Causalità implicite senza keyword
- Overclaim medici mascherati
- Numeri a parole
- Fatti attribuiti alla giornata sbagliata senza date letterali errate
- Unità semanticamente sbagliate se `unit` resta una stringa
- Omissioni di contesto fuori `requiredCautions`

In dubbio → **fallback** (policy I4-D3).

## 5. Tre edizioni (fixture sintetiche, prosa **fallback** — non Gemini)

### A — Giornata positiva (`buildFullDayFixture` + history)
- **Teaser:** Proteine vicine al target  
- **Lead:** Proteine vicine al target — ~135 g su 150 g  
- **Good:** Notte ~7.2 h; Allenamento 2 sessioni (~440 kcal)  
- **Feature:** Peso 78.4 kg; Giornata ben documentata  
- **Coach:** assente  
- **Provenienza:** `fallback` (deterministico)  
- **Valutazione:** varietà domini ok; tono giornalistico essenziale ma ripetitivo sul prefisso date; fedele alle evidenze; cautele presenti.

### B — Giornata scarsa (`buildMissingValuesFixture`)
- **Teaser:** Edizione essenziale… poche evidenze…  
- **Articoli:** nessuno  
- **Coach:** assente  
- **Provenienza:** `fallback`  
- **Valutazione:** corretto non inventare pezzi; leggibilità = masthead solo; ripetitività N/A.

### C — Osservazione prudente (`buildNoMealsFixture` + history breve)
- **Lead:** Notte con ore di sonno adeguate  
- **Good:** Allenamento 1 sessione  
- **Feature:** Peso; abitudine emergente (da history) con cautele frequenza≠giudizio  
- **Coach:** assente  
- **Provenienza:** `fallback`  
- **Valutazione:** tono cauto via cautele; meno “positiva piena”; ancora template ripetitivo sulle date.

## 6. Prova live

```
KEY_PRESENT=no
LIVE_SMOKE_SKIP reason=no_api_key
```

0 chiamate rete. Script: `npm run test:focus:gemini-live`.

## 7. Test superati

**178 pass / 0 fail** (`npm test`, include I4-D3).

## 8. Node 20 / packaging

- Sync: 46 file → `functions/_shared`
- `GEMINI_HTTP_PARITY_OK`
- Smoke: `SMOKE_OK` (eseguito anche con Node del PATH; portable Node 20 se presente)

## 9. Bundle

- `npm run build` OK  
- `FOCUS_ABSENT_FROM_DIST`

## 10. Blocchi concreti prima dell’attivazione backend

1. Nessuna callable/trigger Focus ancora — solo packaging `_shared` + adapter locale.
2. Live Gemini non verificata in questa macchina (manca `GEMINI_API_KEY` in env).
3. Twin HTTP non unificato: mantenere parity check in CI/smoke.
4. Validazione semantica incompleta (vedi §4) → in produzione restare su fallback aggressivo.
5. Prosa fallback ripetitiva (prefisso date) — miglioramento editoriale = I4-D+ / UI, fuori scope.
6. RTDB publish + rules + auth già I4-C, ma **nessuna** pubblicazione automatica / cron / sleep trigger.
7. Focus non deve entrare nel bundle client (oggi OK).
8. Approvazione esplicita richiesta prima di I4-D4 / wire Functions / deploy.

## Stop

I4-D3 completa. Attendere approvazione prima di pubblicazione automatica, trigger, callable o UI.
