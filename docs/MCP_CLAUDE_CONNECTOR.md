# Connettore MCP Kentu → Claude (lettura + bozze pasti)

## Cosa espone

Endpoint HTTPS Streamable MCP `kentuMcp` (europe-west1) con strumenti.

Sola lettura (annotati `readOnlyHint`):

- `kentu_get_day` — giorno (`today` / `yesterday` / `YYYY-MM-DD`, fuso Europe/Rome): pilastri, pasti dettagliati (orario, grammi, kcal, P/C/F, fibre, sodio), liquidi/alcol, caffeina, notte (letto, sveglia, durata, stelle, note)
- `kentu_get_evenings` — serie sera→notte (`from`/`to` YYYY-MM-DD, max 90 giorni), risposta compatta
- `kentu_get_period` — settimana/mese (`this_week` | `last_week` | `this_month` | `last_month`)
- `kentu_search_food` — ricerca alimenti con `matchQuality`
- `kentu_list_drafts` — bozze pasto create da Claude (filtri `status`, `date`)

Bozze pasti (richiedono il permesso `drafts:write` sul gettone):

- `kentu_create_meal_draft` — crea una **bozza** (mai una voce di diario): `date`, `slot`, `time`, `items[{name, grams|null, note}]`, `originalText`, `idempotencyKey`
- `kentu_delete_draft` — elimina una bozza Claude ancora in attesa

Autenticazione **obbligatoria** su ogni richiesta (anche `initialize` / `tools/list`):  
`Authorization: Bearer <gettone>`.

Il gettone **non** va in query string, file di repo, log o chat.

## Bozze pasti da Claude

- Nodo: `users/{uid}/external_drafts/meals/{draftId}`, scritto **solo** dal server (Admin SDK). Mai `tracker_data`, mai `focus_day_scores`.
- Il client può solo leggere e chiudere una bozza in attesa: `status` → `consumed` (convalidata) o `deleted`, con `consumedAt` / `deletedAt`. Qualsiasi altra scrittura è rifiutata dalle regole.
- Kentu le mostra nell’Inbox del giorno indicato (etichetta «da Claude», «Avevi scritto: «…»», note delle voci). La convalida passa dallo smistamento esistente e dalla lavagna di riconoscimento; olio e sale stimati si applicano come nel commit canonico.
- Le bozze di altri giorni compaiono in quel giorno; l’Inbox mostra un richiamo con il conteggio per giorno e il badge PASTI conta tutte le bozze in attesa.
- Finestra date: ±7 giorni da oggi (Europe/Rome). Fino a 20 voci, grammi interi 1–3000 o `null` se non noti.
- Anti-doppione: stessa `idempotencyKey` → stessa bozza (transazione su `mcp_draft_idem/{uid}`).
- Limiti di scrittura: 10/ora e 30/giorno per utente (`mcp_write_quota/{uid}`, non leggibile né scrivibile dal client).
- Registro: ogni creazione, doppione, eliminazione e rifiuto in `users/{uid}/mcp_audit` (solo server).

## Permessi del gettone

- Ogni gettone nuovo nasce con `scopes: ['read']`. I gettoni esistenti senza `scopes` restano in sola lettura.
- Per abilitare le bozze: pannello **MCP Claude (DEV)** → interruttore **Bozze pasti** sul gettone (callable `setMcpTokenScopes`). Togliendo la spunta si torna a sola lettura; **Revoca** disattiva il gettone.
- Senza permesso, gli strumenti di scrittura rispondono con errore `missing_scope` e non scrivono nulla.

## Creare il gettone (solo DEV)

1. Avvia Kentu in build di sviluppo.
2. Menu generale → **MCP Claude (DEV)**.
3. **Crea gettone MCP** — copialo subito (mostrato una sola volta).
4. Per invalidarlo: **Revoca** nella stessa lista.

Il server genera ≥32 byte casuali, salva solo l’hash in RTDB (`users/{uid}/mcp_tokens`, `mcp_token_lookup`).

## Aggiungere il connettore in Claude Pro

1. Deploy regole, poi Functions (include `kentuMcp`):

   ```bash
   firebase deploy --only database
   firebase deploy --only functions:default:kentuMcp,functions:default:createMcpToken,functions:default:revokeMcpToken,functions:default:listMcpTokens,functions:default:setMcpTokenScopes
   ```

2. URL tipico:

   `https://europe-west1-<PROJECT_ID>.cloudfunctions.net/kentuMcp`

3. In Claude → Impostazioni → Connectors / custom MCP:
   - URL = endpoint sopra
   - Header: `Authorization` = `Bearer <gettone>`

4. Verifica chiedendo un giorno noto del tuo diario.

## Build bundle

Il predeploy esegue:

```bash
node functions/scripts/buildMcpBundle.mjs
node functions/scripts/checkMcpBundle.mjs
```

Il check fallisce se le sorgenti MCP sono cambiate senza rebuild.

## Test

```bash
npm run test:mcp:drafts          # unit + emulatore (scope, anti-doppione, limiti, registro, nessuna scrittura nel diario)
npm run test:rtdb:client-writes  # catalogo regole: il client non può scrivere bozze esterne
npm run test:drafts:external     # Inbox client, origine, note, condimenti
```

## Emulator locale

```bash
# Auth + RTDB già su 9099/9000
node functions/scripts/buildMcpBundle.mjs
firebase emulators:start --only functions --project demo-kentu-focus
```

Poi callable/`kentuMcp` su `http://127.0.0.1:5001/demo-kentu-focus/europe-west1/...`.  
Claude cloud non raggiunge localhost: per la prova end-to-end serve il deploy reale.
