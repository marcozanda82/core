# Analisi: inserimento alimenti classico vs smart (GhostApp / Kentu)

Documento di supporto alle decisioni architetturali. Allineato al codice a maggio 2026.

## 1. Quali database usa oggi

### Inserimento classico (MealBuilder / PastoDrawer via `useFoodInputEngine`)

| Percorso | Database | Note |
|----------|----------|------|
| Autocomplete (campo nome mentre si digita) | `foodDb` passato al hook | Di solito **unione catalogo + alimenti utente** (dipende dal parent). |
| Dropdown ricerca CREA (`triggerCreaSearch`) | **`csvFoodDb` solamente** | Catalogo CREA locale (CSV), **senza** merge degli alimenti utente in questo passaggio. |
| Dopo fusione async | CREA normalizzato + USDA | `getCreaFusionPayload` → `fuseUsdaIntoCrea`: priorità e `SOURCE_BOOST` (CREA vs USDA) in `foodSourceFusion.js`. |

### Inserimento smart (comando testuale)

| Percorso | Database | Note |
|----------|----------|------|
| `parseFoodCommandIntent` → `collectFoodCandidates` | **`foodDb` unico** passato dal chiamante | Tipicamente stesso oggetto “unito” usato altrove; il motore **non** distingue CREA vs utente se non per euristica sulla chiave. |
| Risoluzione nutrizionale in review | `foodLookupEngine.lookupFoodCandidate` | Può ricevere **`creaDb`**, **`userFoodDb`** e **`usdaDb`** separati (`FoodCommandReview`). |

## 2. Dove entrano alimenti utente, abitudini, recent foods, frequenza

### Classico

- **Autocomplete:** `searchFoods` / `searchFoodsDetailed` su **`foodDb`** con `includeUserHistory: true` → somma **text match** + **recency** + **frequency** da `localStorage` (`recent_foods`, vedi `foodSearch.js`).
- **CREA dropdown (`triggerCreaSearch`):** `getCreaFusionPayload(csvFoodDb, q, { includeUserHistory: false })` → **nessun boost** da recent/frequency in quel passo; pool = **solo righe nel CSV CREA** (più USDA dopo merge). Da qui la sensazione “semplicemente CREA”.
- **flatLog / pasto:** non usati direttamente nella lista CREA; la **frequenza** autocomplete usa storage dedicato, non il log pasti Firebase.

### Smart (`foodCommandEngine`)

- **Pool candidati:** tutte le chiavi di `foodDb` con match a copertura > 0 (o etichetta praticamente uguale). Se l’**unione** utente+CREA è nel medesimo oggetto, **gli alimenti utente competono** nello stesso ranking.
- **Abitudini:** `findRecentFoodHabit(query, foodDb, flatLog)` in `foodUtils.js` → influisce su **quantità suggerita** (`habit` / `default_qty`) **solo se** `habit.dbKey ===` chiave del match scelto; **non** sul punteggio di ranking dei candidati.
- **Recent foods (localStorage):** **non** integrati nel motore smart; restano nel percorso `foodSearch`.

### `foodLookupEngine` (review / stima)

- Con `userFoodDb` separato: merge deterministico **CREA + utente** (preferenza globale su empate, logiche diverse query a parola singola vs multi).
- Sorgente candidato esposta come `CREA` | `USER` | `USDA`.

## 3. Differenze ranking classico vs smart

| Aspetto | Classico (autocomplete) | Classico (dropdown CREA+USDA) | Smart (`foodCommandEngine`) |
|---------|-------------------------|------------------------------|------------------------------|
| Algoritmo | Token match + prefix, pesi storia | `finalScore` = text×100 + recency×100 + frequency×100 + `SOURCE_BOOST` | Coverage bidirezionale + penalità lunghezza + bonus singolo concetto + tie-break |
| Storia uso | Sì (autocomplete) | No (`includeUserHistory: false` su CREA) | No (ranking); sì solo per qty via `flatLog` |
| USDA | No in autocomplete | Sì dopo `fuseUsdaIntoCrea` | No nel motore (solo DB passato) |
| Boost CREA/USDA | N/A | Sì (`SOURCE_BOOST`) | No (`sourceBoost` nel log DEV è `null`) |

## 4. Funzione riutilizzabile per candidate collection

- **Non esiste un unico “provider” condiviso.** Pezzi riutilizzabili:
  - **`searchFoodsDetailed`** (`foodSearch.js`): scoring testuale + storia locale su **qualsiasi** mappa `{ id → row }`.
  - **`getCreaFusionPayload` / `fuseUsdaIntoCrea`** (`foodSourceFusion.js`): pool CREA (+ USDA) con boost sorgente.
  - **`collectFoodCandidates`** (`foodCommandEngine.js`): ranking intent “comando” su un dizionario unico.
  - **`lookupFoodCandidate`** (`foodLookupEngine.js`): pipeline CREA+user+USDA per **una** query con confidence e alternative.

Unificazione futura: wrappare questi in un modulo “candidate provider” senza fondere logica nei componenti.

## 5. Dove introdurre (prossimi passi, non implementati qui)

| Obiettivo | Punto migliore | Nota |
|-----------|----------------|------|
| **User food boost (smart)** | Dentro `collectFoodCandidates` o subito dopo `compositeRankScore`, se si passa `userKeySet` opzionale | Evita false positive dell’euristica `food_` / `local_`. |
| **Habit boost (smart)** | Stesso punto: bonus piccolo se `key === habit.dbKey` **oppure** se `flatLog` indica uso recente della chiave | Attenzione: non rompere `ready/ambiguous` basati su `bm.score`. |
| **Unified candidate provider** | Nuovo modulo (es. `foodCandidatePool.js`) che orchestra `searchFoodsDetailed` + merge chiavi utente + opzionale USDA; **non** dentro SalaComandi | `triggerCreaSearch` resterebbe come ora; solo sostituzione interna della fonte dati quando deciso. |

## 6. Patch minima concettuale (senza stravolgimenti)

**Far entrare user foods nello “smart” visivo del dropdown classico**

- Oggi: `triggerCreaSearch` usa solo `csvFoodDb`. Minimo cambiamento futuro: costruire un **overlay** di hit utente (es. `searchFoodsDetailed(foodDbUtente, q, { limit, includeUserHistory: true })`) e **prepend** o merge con `creaNormalized` **senza** sostituire `triggerCreaSearch` come API pubblica.

**Far entrare habit / ranking nello smart testuale**

- Oggi: habit solo su quantità. Minimo: dopo `collectFoodCandidates`, ordinare stabilmente con **tie-break** `habit.dbKey` uguale chiave, o piccolo `+ε` sul **solo** `compositeRankScore` **senza** modificare `bm` usato per gates.

**Rischi regressione**

- Cambiare `includeUserHistory` su `getCreaFusionPayload` senza ridurre duplicati utente/CREA può gonfiare o duplicare righe.
- Qualsiasi boost che somma al `score` mostrato in UI senza aggiornare i gate può far divergere ordine vs `ready/ambiguous` (oggi i gate usano ancora `bm.score`).
- Unire DB senza dedup per `id` può duplicare candidati.

## 7. File toccati per questa analisi / logging

- Modificati (solo log DEV): `foodCommandEngine.js`, `useFoodInputEngine.js`.
- **Non toccati:** `SalaComandi.jsx`, `PastoDrawer.jsx`, `FoodCommandSection.jsx`, `FoodCommandReview.jsx`, `triggerCreaSearch` firma/comportamento esterno.

## 8. Prefissi log DEV

- `[foodSmart:DEV]` — `foodCommandEngine` (segmento, habit riassunto, candidati con `candidateSource` euristico, `habitScore` 0/1, `compositeRank`, `sortKey`).
- `[classicFoodSearch:DEV]` — `useFoodInputEngine`: autocomplete vs `creaDropdown` vs `creaUsdaMerged`.
