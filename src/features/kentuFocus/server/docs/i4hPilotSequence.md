# I4-H — Sequenza esatta del primo pilota reale

**Stato:** solo preflight. Nessun comando di questa sequenza è stato eseguito sul progetto produzione.

**Non scegliere autonomamente UID o data** — li fornisce l’operatore prima del go-live.

---

## Prerequisiti che DEVI fornire

| # | Dato | Note |
|---|------|------|
| A | `PILOT_UID` | Un solo account autorizzato esplicitamente |
| B | `PUBLICATION_DATE` | ISO `YYYY-MM-DD` coerente con una notte successiva registrata |
| C | Project ID Firebase produzione | Per `FOCUS_ADMIN_EXPECTED_PROJECT` (solo dopo sblocco approvato) |
| D | Credenziale Admin SDK a privilegi minimi | Service account con accesso RTDB; **non** chiave Gemini in chiaro nei log |
| E | Token admin forte (≥16 char) | `FOCUS_ADMIN_TOKEN` — rotabile, non committato |
| F | Conferma che `targetHistory` / `body_metrics` / sleep night esistono per quella data | Altrimenti il pilota fallisce in modo prudente |

---

## Fase 0 — Preflight locale (già fatto in I4-H)

```text
npm run test:focus:i4h
npm run prepare:focus-functions   # Node 20
npm run test:focus:i4g            # emulator admin
npm run test:focus:i4c            # rules + idempotenza
```

---

## Fase 1 — Attivare le regole Focus (IRREVERSIBILE senza nuovo deploy)

```bash
# SOLO dopo approvazione esplicita
firebase deploy --only database
```

Verifica post-deploy (account `PILOT_UID` autenticato, REST o SDK client):

- GET `kentu_focus/{PILOT_UID}/archive_index` → permesso
- GET `kentu_focus/{PILOT_UID}/jobs/...` → negato
- GET `kentu_focus/{PILOT_UID}/editions/{DATE}` (nodo padre) → negato
- GET `kentu_focus/{altro_uid}/...` → negato
- anon → negato

---

## Fase 2 — Accesso amministrativo (privilegi minimi)

In I4-H il runtime **blocca** ancora ogni esecuzione non-emulator.

Per un pilota reale futuro servirà **nuova approvazione** che sblocchi esplicitamente un percorso produzione (non presente oggi).  
Fino ad allora: ripetere la generazione **solo in emulator** con dati seed, oppure attendere sblocco controllato.

Env minimi (emulator oggi):

```bash
set FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000
set FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
set FOCUS_ADMIN_TOKEN=<secret-forte>
set FOCUS_ADMIN_ALLOWED_UIDS=<PILOT_UID>
set FOCUS_ADMIN_EXPECTED_PROJECT=demo-kentu-focus
```

---

## Fase 3 — Una sola generazione deterministica (senza Gemini)

```bash
# Emulator già avviato; dati tracker seedati per PILOT_UID
node scripts/focusAdminGenerateEdition.mjs --uid <PILOT_UID> --date <PUBLICATION_DATE> --horizon d30
```

- CLI passa `geminiProvider: null` → prosa fallback deterministica.
- Nessun `--regen` (e senza `FOCUS_ADMIN_ALLOW_REGEN=1` viene rifiutato).

---

## Fase 4 — Controlli post-generazione

Checklist successo (§5 prompt):

1. `publicationDate` / `analysisDate` corrette nel report CLI.
2. `sleep.status === selected`, `available: true`.
3. Nessuna metrica inventata (report `prose.source === fallback` o validato; evidenze con provenance).
4. Target: provenance storica; peso: `bodyMeasuredOn` + attribution.
5. Seconda stessa invocazione → `idempotentReplay: true`, stessa revision.
6. Client: legge solo `meta` + `rev/{current}` + `archive_index`.
7. Report: `reads.*`, `timingsMs.*` misurabili.
8. Funzioni Kentu esistenti: nessun deploy Functions richiesto per questo passo.

Verifica contenuti (Admin SDK / console RTDB, non client):

- `kentu_focus/{uid}/editions/{date}/meta`
- `kentu_focus/{uid}/editions/{date}/rev/{n}`
- `kentu_focus/{uid}/editorial_memory` (backend only)
- **Non** esporre dossiers al client

---

## Fase 5 — Gemini (separata, nuova approvazione)

Solo dopo OK esplicito:

- Non usare la CLI attuale (non passa provider live).
- Piano separato: adapter server + secret `GEMINI_API_KEY` già usato da `callGemini`, max 1 call, timeout, no log prompt.

---

## Fase 6 — Interruzione e ripristino

Vedi sezione rollback nel report I4-H.

- Non rieseguire CLI.
- Revocare / ruotare `FOCUS_ADMIN_TOKEN`.
- Rimuovere UID da `FOCUS_ADMIN_ALLOWED_UIDS`.
- Non attivare cron/trigger.
