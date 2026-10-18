# Kentu Focus — Checklist esecutiva primo pilota

**Stato:** preparazione. Nessuna operazione di produzione eseguita.

Sostituisci solo i placeholder che **tu** fornisci:
- `<PROJECT_ID>`
- `<DATABASE_URL>` (es. `https://<PROJECT_ID>-default-rtdb.europe-west1.firebasedatabase.app`)
- `<PILOT_UID>`
- `<PUBLICATION_DATE>` (`YYYY-MM-DD`)
- `<ADMIN_TOKEN>` (≥16 char, non in repo)

---

## Verifiche già vere nel codice (nessuna azione)

| # | Controllo | Stato |
|---|-----------|--------|
| V1 | Solo UID in `FOCUS_ADMIN_ALLOWED_UIDS` | OK |
| V2 | `publicationDate` ISO obbligatoria | OK |
| V3 | Gate sonno non bypassabile da admin/CLI | OK |
| V4 | Regen richiede `FOCUS_ADMIN_ALLOW_REGEN=1` | OK |
| V5 | CLI passa `geminiProvider: null` → fallback deterministico | OK |
| V6 | Nessuna callable/trigger Focus in `functions/index.js` | OK |
| V7 | Runtime non-emulator **ancora bloccato** (`emulator_required` / `non_emulator_admin_blocked_in_i4h`) | OK (sicurezza) / **blocco pilota reale** |

### Abilitazione temporanea a un solo UID (senza admin generico)

Non esiste un ruolo admin RTDB generico. Il pilota si limita così:

1. `FOCUS_ADMIN_ALLOWED_UIDS=<PILOT_UID>` — **un solo** valore
2. `FOCUS_ADMIN_EXPECTED_PROJECT=<PROJECT_ID>`
3. `FOCUS_ADMIN_TOKEN` rotabile (sessione operatore)
4. Nessun `--regen`, nessun provider Gemini
5. Fine pilota: cancellare env / ruotare token / svuotare allowlist

---

## BLOCCANTE codice (prima di qualsiasi generazione reale)

La CLI attuale usa solo `createEmulatorAdminApp` e `assertFocusAdminRuntime` rifiuta la produzione.

**Serve una modifica codice approvata** (non fatta in questo turno), circoscritta, che:

- aggiunga un path CLI “pilot” con Admin SDK reale + verifica `projectId` **e** `databaseURL` == attesi;
- sblocchi non-emulator solo con combo esplicita (es. `FOCUS_PILOT_ENABLE=1` + token + allowlist 1 UID + expected project + expected DB URL);
- resti `geminiProvider: null`;
- non crei callable pubbliche né trigger.

**STOP — non implementare / non deployare finché non approvi esplicitamente questa modifica.**

---

## Sequenza operativa

### 0) Preflight locale (sicuro — già fattibile)

```bash
npm run test:focus:i4h
npm run test:focus:i4g
# Node 20:
node scripts/prepareFocusFunctionsPackage.mjs
```

**STOP** — non procedere a produzione senza i tuoi `<PROJECT_ID>`, `<PILOT_UID>`, `<PUBLICATION_DATE>`.

---

### 1) Deploy sole regole Focus

```bash
firebase use <PROJECT_ID>
firebase deploy --only database
```

**STOP** — attendi conferma deploy OK prima del passo 2.

---

### 2) Verifica permessi (client autenticato come `<PILOT_UID>`)

Controlli attesi (REST/SDK client, **lettura**):

| Path | Atteso |
|------|--------|
| `kentu_focus/<PILOT_UID>/archive_index` | permesso |
| `kentu_focus/<PILOT_UID>/editions/<PUBLICATION_DATE>/meta` | permesso (anche se vuoto) |
| `kentu_focus/<PILOT_UID>/editions/<PUBLICATION_DATE>` (padre) | **negato** |
| `kentu_focus/<PILOT_UID>/jobs/...` | **negato** |
| `kentu_focus/<PILOT_UID>/dossiers/...` | **negato** |
| `kentu_focus/<PILOT_UID>/editorial_memory` | **negato** |
| `kentu_focus/<ALTRO_UID>/...` | **negato** |
| anonimo | **negato** |

**STOP** — se un deny fallisce, non generare; valuta rollback regole.

---

### 3) Env pilota (sessione operatore — non in repo)

```bash
# Dopo sblocco codice approvato — oggi questi soli NON bastano:
set FOCUS_ADMIN_TOKEN=<ADMIN_TOKEN>
set FOCUS_ADMIN_ALLOWED_UIDS=<PILOT_UID>
set FOCUS_ADMIN_EXPECTED_PROJECT=<PROJECT_ID>
# + expected DATABASE_URL (da richiedere nel path pilot)
# NON settare FOCUS_ADMIN_ALLOW_REGEN
# NON settare FIREBASE_DATABASE_EMULATOR_HOST in produzione
# Credenziale: GOOGLE_APPLICATION_CREDENTIALS=<path-locale-SA> (fuori repo)
```

Verifica coerenza (manuale / futuro script pilot):

- `admin.app().options.projectId === <PROJECT_ID>`
- `admin.app().options.databaseURL === <DATABASE_URL>`

**STOP** — mismatch → abort, nessuna scrittura.

---

### 4) Prima generazione (UNA, senza Gemini)

```bash
# Comando target post-sblocco (placeholder — CLI prod non esiste ancora):
node scripts/focusAdminGenerateEdition.mjs --uid <PILOT_UID> --date <PUBLICATION_DATE> --horizon d30
```

Atteso report sanitizzato:

- `ok: true`, `prose.source: "fallback"` (o equivalente in `report.prose`)
- `sleep.available: true`, non ambiguous
- `idempotentReplay: false`, `revision: 1`
- nessun token/UID completo/headline nel JSON CLI

**STOP** — non ripetere; non Gemini; non `--regen`.

---

### 5) Verifica edizione (Admin SDK / console — non esporre al client)

Checklist:

- [ ] Date: `publicationDate` / `analysisDate` (= date−1)
- [ ] Sonno: notte successiva `selected`
- [ ] Target: provenance `targetHistory` + `referenceDate` (o missing prudente)
- [ ] Peso: `bodyMeasuredOn` + attribution (no `profile.weight` come giorno)
- [ ] Notizie/evidenze: path/provenance presenti; niente valori inventati
- [ ] `editions/<DATE>/meta.currentRevision` e `rev/<n>` allineati
- [ ] `archive_index/<DATE>` presente
- [ ] `editorial_memory` aggiornata (solo backend)
- [ ] Client legge solo meta + rev corrente + archive

**STOP** — anomalie → procedura arresto (§6), non seconda generazione “correttiva” con regen.

---

### 6) Arresto immediato + ripristino

**Arresto (subito):**

1. Non rieseguire la CLI  
2. `set FOCUS_ADMIN_ALLOWED_UIDS=` (svuota)  
3. Ruota/elimina `<ADMIN_TOKEN>`  
4. Revoca temporanea SA se sospetto abuso  

**Ripristino:**

| Cosa | Azione |
|------|--------|
| Edizione già scritta | Lasciare immutabile (default). Delete solo con backup + OK esplicito |
| Regole | `firebase deploy --only database` con rules **pre-Focus** (rompe letture Focus) |
| Functions | Nessun deploy Focus previsto → niente da ripristinare |
| Cron/trigger | Non attivati → niente da spegnere |

---

### 7) Seconda esecuzione idempotente — **NON LANCIARE ora**

Comando pronto (solo dopo OK esplicito sul successo del passo 4–5):

```bash
node scripts/focusAdminGenerateEdition.mjs --uid <PILOT_UID> --date <PUBLICATION_DATE> --horizon d30
```

Atteso: `ok: true`, `idempotentReplay: true`, stessa `revision`, nessuna nuova rev.

**STOP** — non eseguire in questa fase di preparazione.

---

## Riepilogo approvazioni richieste (in ordine)

1. **Codice** — path pilot produzione (projectId + databaseURL + enable flag + SA), senza Gemini  
2. **Deploy** — `firebase deploy --only database`  
3. **Generazione** — una CLI run su `<PILOT_UID>` / `<PUBLICATION_DATE>`  
4. **Idempotenza** — seconda run (opzionale)  
5. **Gemini** — solo in un turno successivo, mai in questo pilota  

---

## STOP globale

Non eseguire il pilota. Non deployare. Non sbloccare produzione. Non chiamare Gemini.  
Attendere approvazione esplicita per **ogni** operazione di produzione, a partire dalla modifica codice del path pilot.
