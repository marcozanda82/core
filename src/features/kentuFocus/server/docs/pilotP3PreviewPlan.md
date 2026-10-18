# P3 — Piano anteprima locale (nessuna scrittura)

**Stato:** preparazione. Nessuna lettura/scrittura reale eseguita in questa fase.

## 1. Realizzabile?

**Sì**, riutilizzando i moduli esistenti **senza** `publishFocusEdition` / job / RTDB Focus.

Percorso minimo (in-memory):

1. Letture client puntuali → mappa giorni + `profile_targets` + `body_metrics`
2. `MemoryTrackerReader`
3. `buildDossierInputFromTracker`
4. `buildFocusDossier`
5. `selectFocusEditorial` + `createEmptyEditorialMemory()` (memoria **vuota locale**, non RTDB)
6. `generateFocusWrittenEdition({ geminiProvider: null })` → fallback deterministico
7. `buildEssentialEditionFromSelection` + `applyWrittenEditionToRevision`
8. `validateFocusEditionRevision`

**Non usare** `runFocusEditionPipeline` per l’anteprima: chiama sempre `publishFocusEdition` (anche con `MemoryFocusPersistence` simulerebbe job/publish in memoria — sconsigliato rispetto al vincolo “non simulare pubblicazione”).

## 2. Separazione anteprima / pubblicazione

| Rischio | Mitigazione |
|---------|-------------|
| Scrittura RTDB Focus | Nessun `AdminRtdbFocusPersistence` / nessun `set`/`update` |
| Job/lock/archive/memory | Non chiamare `publishFocusEdition` |
| Gemini | `geminiProvider: null`, nessun `rawAiOutput` |
| Cloud Functions | Nessun `httpsCallable` |
| Side-effect app | Solo `get` RTDB client + DOM temporaneo in Console |

### Blocco / correzione minima (non implementata)

Oggi manca un entry point dedicato tipo `previewFocusEditionInMemory(...)`.  
Per P3 il comando DevTools **compone** i moduli (ok).  
Correzione futura opzionale (richiede approvazione codice): un unico export puro che wrappa i passi 3–8 senza persistence.

## 3. Percorsi Firebase e budget letture

Date fisse pilota: `analysisDate=2026-10-17`, `publicationDate=2026-10-18`.

Orizzonte consigliato anteprima: **`d30`** → `historyDays = 60`.

| Path | N. letture |
|------|------------|
| `users/{uid}/tracker_data/trackerStorico_YYYY-MM-DD` | **61** (60 giorni fino ad analysisDate + publicationDate) |
| `users/{uid}/profile_targets` | **1** |
| `users/{uid}/body_metrics` | **1** |
| **Totale max** | **63** `get` |

- Nessuna scansione di `users/{uid}` intero.
- Nessun `sleep_logs` legacy.
- Volume stimato: tipicamente decine–centinaia di KB (dipende dalla densità del diario); non si scaricano rami Focus.

Orizzonte `d7` (opzionale, più leggero): 14+1+2 = **17** letture.

## 4. Come mostrare

- **Editoriale:** overlay DOM effimero in pagina (titolo, date, lead, secondari, evidenze, coach se presente, avvisi missing) — chiudibile; non file, non RTDB.
- **Tecnico in chat:** JSON minimale (esito, reads, finestra, coverage, candidati, fallback, validazione) — senza UID/token/diario.

## 5. Verifiche locali già fatte (fixture, no Firebase reale)

Dry-run offline con date pilota e mappa fixture: pipeline anteprima ok, sonno selected, `proseSource=fallback`, validazione ok, nessuna chiamata publish.

## 6. P3.1 correzioni comando

- DOM solo `createElement` / `textContent` / `appendChild` (no `innerHTML` editoriale).
- Validazione bloccante prima del render.
- Budget: `listRequiredTrackerDates` → **61** date; +2 profilo = **63**; abort se `> 63` prima dei get.
- Import browser: nessun `MemoryTrackerReader` (usa `Buffer`); reader inline; moduli Focus puri ok.
- Test offline: `focusPreview.p31.test.js`.

## 7. STOP

Comando DevTools: chat operatore P3.1.  
**Non eseguire** finché non arriva approvazione esplicita alle letture reali.
