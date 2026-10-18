# I4-H — Preflight pilota reale (nessun deploy)

## 1. Esito controllo sicurezza Admin

| Controllo | Esito |
|-----------|--------|
| Live per errore | **OK** — senza `FIREBASE_DATABASE_EMULATOR_HOST` → abort; `FOCUS_ADMIN_ALLOW_NON_EMULATOR=1` → ancora bloccato (`non_emulator_admin_blocked_in_i4h`) |
| Bypass sonno | **OK** — admin forza `requireSleep: true`; flag client non inoltrati |
| UID + date espliciti | **OK** — obbligatori; UID regex + allowlist |
| Regen silenziosa | **OK** — `explicitRegen` richiede anche `FOCUS_ADMIN_ALLOW_REGEN=1` |
| Identità progetto | **OK** — `FOCUS_ADMIN_EXPECTED_PROJECT` deve matchare `projectId` |
| Token non unico | **OK** — token **e** allowlist UID **e** project identity |
| Output sicuro | **OK** — CLI usa `sanitizeFocusAdminCliResult` (UID mascherato, niente headline/dossier/token) |
| Doppia invocazione / retry | **OK** — idempotenza job; rate limit processo; seconda run → `idempotentReplay` |

**Correzioni minime applicate in I4-H** (vedi §4).

---

## 2. Diff regole Focus

### Confronto

- `database.rules.json` ↔ `database.rules.focus.local.json`: blocco `kentu_focus` **identico**.
- Rami preesistenti `users` / `planning` / `weeklyPlanning`: **invariati** rispetto a HEAD git (senza Focus).
- HEAD non aveva `kentu_focus`; il working tree lo aggiunge.

### Diff leggibile (solo Focus — aggiunto)

```json
"kentu_focus": {
  "$uid": {
    ".read": false,
    ".write": false,
    "editions": {
      "$publicationDate": {
        ".read": false,
        ".write": false,
        "meta": {
          ".read": "$uid === auth.uid",
          ".write": false
        },
        "rev": {
          "$revision": {
            ".read": "$uid === auth.uid && root.child('kentu_focus').child($uid).child('editions').child($publicationDate).child('meta').child('currentRevision').val() + '' === $revision",
            ".write": false
          }
        }
      }
    },
    "archive_index": {
      ".read": "$uid === auth.uid",
      ".write": false
    },
    "jobs": { ".read": false, ".write": false },
    "dossiers": { ".read": false, ".write": false },
    "editorial_memory": { ".read": false, ".write": false }
  }
}
```

### Garanzie

| Requisito | Stato |
|-----------|--------|
| Write client Focus negata | Sì (root + figli) |
| Rev non pubblicate non leggibili | Sì (`currentRevision` match) |
| Jobs / dossiers / memory backend-only | Sì |
| Archivio owner-only | Sì |
| Paginazione archivio enforced da rules | **Parziale** — RTDB consente lettura dell’intero `archive_index` dell’owner; il backend supporta `listArchiveIndex({limit})`. Per il pilota (1 UID, poche date) accettabile. Client futuro deve paginare lato app. |

**Deploy regole: NON eseguito.**

---

## 3. Stato packaging / Functions

### Già implementato

- Sync `src/features/kentuFocus` → `functions/_shared` (moduli puri + admin + pipeline)
- Entry: `focusEntry.mjs` / `focusBridge.cjs` (nessuna callable HTTPS)
- Adapter Gemini ESM + twin HTTP; parity script
- `engines.node: "20"` in `functions/package.json`
- Smoke Node 20 + `prepare:focus-functions`
- `callGemini` unica export callable in `functions/index.js`
- **Nessun** import Focus in `index.js`; nessun trigger/cron Focus

### Manca per un deploy pilota reale (richiede approvazione)

1. Deploy `database` (regole)
2. Sblocco runtime admin produzione (oggi intenzionalmente assente)
3. Wire opzionale Admin SDK + credenziali minime (non CLI-emulator)
4. (Opzionale) path Gemini live Focus — **separato**, nuova approvazione
5. **Non** richiesto: deploy nuovo codice Functions se si genera solo da macchina operatore con Admin SDK locale — ma oggi il path prod è bloccato

### Entry point effettivi

| Entry | Stato |
|--------|--------|
| `exports.callGemini` | Esistente, invariato |
| `runFocusAdminEdition` | Packaged in `_shared`, non esportato da `index.js` |
| CLI `focusAdminGenerateEdition.mjs` | Solo emulator |
| Trigger / scheduler Focus | Assenti |

---

## 4. Modifiche minime effettuate (I4-H)

1. `runFocusAdminEdition.js` — allowlist UID, project identity, regen gate, token min length, sanitize/mask helpers, blocco non-emulator rinforzato (`i4h`)
2. `focusAdminGenerateEdition.mjs` — richiede env multipli; output sanitizzato; no Gemini; abort project mismatch
3. `focusAdmin.i4h.test.js` — test offline gate sicurezza
4. Aggiornamento test emulator I4-G per i nuovi gate
5. Export sync + script `test:focus:i4h`
6. Docs: `i4hPilotSequence.md`, questo report

---

## 5. Test e risultati

Eseguiti in I4-H (locale; nessun accesso produzione):

| Comando | Esito |
|---------|--------|
| `npm run test:focus:i4h` | **5/5 pass** (gate admin + target/weight) |
| `prepare:focus-functions` Node v20.19.5 | **FOCUS_PACKAGE_PREPARE_OK** (57 js, parity OK, smoke OK) |
| `npm run test:focus:i4g` | **3/3 pass** (allowlist/project deny, regen deny, idempotenza, no sleep bypass) |
| Frontend / UI | non modificati in I4-H; Focus resta fuori dal bundle (vincolo invariato) |

---

## 6. Sequenza esatta pilota

Vedi `i4hPilotSequence.md`.  
UID e data: **forniti da te**, non scelti qui.

---

## 7. Operazioni reversibili vs non reversibili

| Operazione | Classe |
|------------|--------|
| Deploy regole Focus | **Non facilmente reversibile** (richiede nuovo deploy regole; client che leggono Focus smettono di funzionare se rimosse) |
| Scrivere edizione `kentu_focus/{uid}/editions/...` | **Non reversibile senza delete manuale** — le rev pubblicate sono immutabili by design |
| Rotazione `FOCUS_ADMIN_TOKEN` / allowlist | Reversibile |
| Non rieseguire CLI | Reversibile (noop) |
| Deploy Functions / trigger | Non fatto; se fatto in futuro = rischio alto |
| Gemini live | Non fatto |

---

## 8. Procedura di rollback

1. **Stop generazioni:** non rieseguire CLI; svuotare `FOCUS_ADMIN_ALLOWED_UIDS`; ruotare token.
2. **Edizioni già pubblicate:** lasciarle (immutabili). Delete solo se esplicitamente richiesto e con backup.
3. **Regole:** ridistribuire `database.rules.json` precedente (senza `kentu_focus`) **solo** se si accetta di rompere letture Focus client.
4. **Functions:** nessun cambio Focus in `index.js` → rollback Functions non necessario per I4-H.
5. **Nessun cron** da disattivare (non attivato).

---

## 9. Dati / autorizzazioni che DEVI fornire

1. `PILOT_UID` (uno solo)
2. `PUBLICATION_DATE` (una sola)
3. Project ID produzione (per future expected-project checks)
4. Service account / credenziale Admin a privilegio minimo (quando sblocco prod approvato)
5. `FOCUS_ADMIN_TOKEN` forte non committato
6. Conferma presenza sonno notte successiva + preferibilmente `targetHistory` / `body_metrics`
7. Approvazione esplicita per: deploy regole → poi (separata) sblocco runtime prod → poi (separata) Gemini live

---

## 10. Comandi pronti — NON ESEGUITI

```bash
# A) Deploy regole (approvazione #1)
firebase deploy --only database

# B) Packaging locale (già ripetibile, no deploy)
# usare Node 20:
node scripts/prepareFocusFunctionsPackage.mjs

# C) Emulator dry-run (sicuro)
firebase emulators:start --only auth,database
set FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000
set FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
set FOCUS_ADMIN_TOKEN=<secret>
set FOCUS_ADMIN_ALLOWED_UIDS=<PILOT_UID>
set FOCUS_ADMIN_EXPECTED_PROJECT=demo-kentu-focus
node scripts/focusAdminGenerateEdition.mjs --uid <PILOT_UID> --date <PUBLICATION_DATE> --horizon d30

# D) Replay idempotenza
node scripts/focusAdminGenerateEdition.mjs --uid <PILOT_UID> --date <PUBLICATION_DATE> --horizon d30

# E) NON fare in I4-H
# firebase deploy --only functions
# FOCUS_ADMIN_ALLOW_NON_EMULATOR=1
# --regen / Gemini live / cron
```

---

## Stop

Preflight I4-H completo. **Nessun deploy. Nessuno sblocco produzione. Attendere approvazione.**
