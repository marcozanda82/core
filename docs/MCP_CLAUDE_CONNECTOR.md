# Connettore MCP Kentu → Claude (fase 1, sola lettura)

## Cosa espone

Endpoint HTTPS Streamable MCP `kentuMcp` (europe-west1) con strumenti:

- `kentu_get_day` — giorno (`today` / `yesterday` / `YYYY-MM-DD`, fuso Europe/Rome): pilastri, pasti dettagliati (orario, grammi, kcal, P/C/F, fibre, sodio), liquidi/alcol, caffeina, notte (letto, sveglia, durata, stelle, note)
- `kentu_get_evenings` — serie sera→notte (`from`/`to` YYYY-MM-DD, max 90 giorni), risposta compatta
- `kentu_get_period` — settimana/mese (`this_week` | `last_week` | `this_month` | `last_month`)
- `kentu_search_food` — ricerca alimenti con `matchQuality`

Autenticazione **obbligatoria** su ogni richiesta (anche `initialize` / `tools/list`):  
`Authorization: Bearer <gettone>`.

Il gettone **non** va in query string, file di repo, log o chat.

## Creare il gettone (solo DEV)

1. Avvia Kentu in build di sviluppo.
2. Menu generale → **MCP Claude (DEV)**.
3. **Crea gettone MCP** — copialo subito (mostrato una sola volta).
4. Per invalidarlo: **Revoca** nella stessa lista.

Il server genera ≥32 byte casuali, salva solo l’hash in RTDB (`users/{uid}/mcp_tokens`, `mcp_token_lookup`).

## Aggiungere il connettore in Claude Pro

1. Deploy Functions (include `kentuMcp`):

   ```bash
   firebase deploy --only functions:kentuMcp,functions:createMcpToken,functions:revokeMcpToken,functions:listMcpTokens,database
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

## Emulator locale

```bash
# Auth + RTDB già su 9099/9000
node functions/scripts/buildMcpBundle.mjs
firebase emulators:start --only functions --project demo-kentu-focus
```

Poi callable/`kentuMcp` su `http://127.0.0.1:5001/demo-kentu-focus/europe-west1/...`.  
Claude cloud non raggiunge localhost: per la prova end-to-end serve il deploy reale.
