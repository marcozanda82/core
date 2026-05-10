# Specifica tecnica — Modello Bussola / Mappa metabolica (Kentu)

Documento di riferimento per patch future. **Non è implementazione runtime.** Non sostituisce il codice esistente finché non viene deliberatamente allineato.

---

## 0. Scopo e principi

Kentu deve leggere il metabolismo come **stato accumulato**, **direzione comportamentale** e **traiettoria nel tempo**, non come giudizio giornaliero.

Obiettivi della specifica:

- Separare **semanticamente** mappa, bussola e traiettoria.
- Eliminare incoerenze percettive tra ago, marker e testi.
- Definire regole future per severità, label e calibrazione (pesate).

Vincolo culturale di prodotto (coerente con `docs/KENTU_ROADMAP.md`):

> Il corpo segue le traiettorie, non i singoli giorni.

---

## 1. Mappa metabolica = stato corporeo accumulato

### 1.1 Ruolo

La **mappa** posiziona l’utente nello spazio del modello come **stato strutturale e cumulativo**, non come fotografia nervosa dell’ultimo pasto o dell’ultimo allenamento.

Rappresenta concettualmente:

- **Composizione corporea** (massa grassa, massa magra / muscolo, dove disponibili).
- **Trend di peso** nel medio periodo.
- **Storico comportamentale** aggregato (abitudini nutrizionali e di movimento che si sommano nel tempo).

### 1.2 Requisiti comportamentali del modello

La posizione sulla mappa deve essere:

| Proprietà | Significato operativo |
|-----------|------------------------|
| **Lenta** | Aggiornamenti dominati da finestre temporali e filtri, non da singoli eventi. |
| **Inerziale** | Lo stato “ricorda” il recente; cambi repentini richiedono evidenza ripetuta o calibrazione esterna. |
| **Strutturale** | Influenzata da ciò che definisce il corpo (composizione, peso, trend), non solo dal bilancio odierno. |
| **Non reattiva al singolo giorno** | Eccezioni dovrebbero muovere poco o nulla senza persistenza (salvo policy esplicithe di sicurezza clinica, fuori scope qui). |

### 1.3 Centro della mappa

Il **centro** non è un ideale estetico universale ma:

- **Equilibrio funzionale personale** (compatibile con età, contesto, capacità).
- **Sostenibilità** delle abitudini nel tempo.
- **Massima coerenza** tra stato misurato/stimato, routine realistica e capacità individuale.

Il centro può essere **person-specific** (derivato da target, storico, o calibrazioni), da definire in fasi successive della roadmap tecnica.

---

## 2. Bussola metabolica = direzione metabolica corrente

### 2.1 Ruolo

La **bussola** indica **verso dove tende il comportamento recente** se mantenuto: direzione nel piano metabolico, non la posizione assoluta sul corpo.

### 2.2 Ingressi concettuali ammessi

Il motore direzionale può combinare (pesi da definire in progettazione numerica):

- Bilancio energetico **recente** (non solo ieri; finestra configurabile).
- **Apporto proteico** e qualità della distribuzione.
- **Stimolo allenante** (volume / intensità / passi — come già modellato o migliorato).
- **Recupero / sonno** (ore, variabilità, debito).
- **Coerenza macro** rispetto a obiettivi o pattern stabile.
- **Persistenza del pattern** (stessa direzione su più giorni aumenta confidenza nella lettura).

### 2.3 Requisiti anti-rumore

La bussola deve implementare (a livello di progetto, non qui nel codice):

| Meccanismo | Obiettivo |
|------------|-----------|
| **Dead-band energetica** | Piccoli scostamenti (es. ordine decine di kcal su TDEE elevato) non cambiano settore né narrativa severa. |
| **Tolleranza al rumore** | Variazioni giornaliere within-band → direzione stabile o “neutra”. |
| **Smoothing temporale** | Direzione mostrata = funzione filtrata dello stato recente, non raw giornaliero. |
| **Label attenuate per segnali deboli** | Copy cortese e non catastrofico quando \(\|\text{segnale}\|\) è basso o confidenza bassa. |
| **Nessuna etichetta estrema per micro-scarti** | Vietato associare outcome estremi a perturbazioni minime. |

### 2.4 Caso obbligatorio di validazione

**Requisito non negoziabile per l’accettazione del modello:**

> Un surplus dell’ordine di **+32 kcal su ~2500 kcal** (~1,3%) **non** deve produrre copy o settore equivalente a **«Accumulo Grasso»** né narrativa iperbolica equivalente.

Questo impose una **dead-band percentuale o assoluta** riferita al fabbisogno / TDEE di contesto, non solo alla scala normalizzata interna legacy.

---

## 3. Traiettoria = integrazione nel tempo

### 3.1 Definizione

La **traiettoria** risponde a:

> *«Dove andrò sulla mappa se continuo con questa direzione?»*

È il legame esplicito tra:

- **Direzione** (bussola),
- **Persistenza** nel tempo,
- **Spostamento della posizione** sulla mappa (inerziale).

### 3.2 Regole concettuali

1. La **posizione sulla mappa** si aggiorna in modo significativo solo se la **direzione metabolica** è **persistentemente** compatibile con uno spostamento nel campo di stato.
2. Se la bussola **oscilla** spesso (direzioni incoerenti giorno su giorno):
   - la posizione resta **quasi stabile**;
   - il sistema comunica **instabilità di direzione** o **assenza di trend chiaro** (copy dedicata, non errore morale dell’utente).
3. Il messaggio chiave resta:

> **Il corpo segue le traiettorie, non i singoli giorni.**

### 3.3 Separazione dalla geometria pura

La traiettoria **non** deve essere confusa con:

- la sola **derivata geometrica** degli ultimi punti in coordinate UI,
- o la **proiezione SVG** del marker.

La traiettoria è una **quantità di modello** (dove si va nello **spazio di stato**), eventualmente **proiettata** in UI dopo mapping coerente.

---

## 4. Pesate = calibrazione

### 4.1 Ruolo

Le **pesate** (e, quando disponibili, misure di composizione) non sono:

- giudizi moralizzanti,
- verità assolute che invalidano tutto il modello,
- eventi che devono “teletrasportare” il marker senza continuità.

Sono **osservazioni di calibrazione** tra:

- **Stima interna** del modello (posizione / trend),
- **Misura esterna** (bilancia / impedenziometria / altro).

### 4.2 Confronti richiesti (concettuali)

Ad ogni pesata significativa il sistema dovrebbe valutare:

| Confronto | Domanda |
|-----------|---------|
| Posizione **stimata** vs misura | Il modello era sistematicamente alto/basso? |
| Traiettoria **prevista** vs delta osservato | Il passo temporale è coerente con la direzione dichiarata? |
| **Scostamento del modello** | Aggiornare parametri di inerzia, baseline o confidenza, non “punire” l’utente. |

### 4.3 Visione futura

Kentu deve tendere a **stimare la posizione sulla mappa prima della pesata**, usando trend comportamentali e stato precedente; la pesata **aggiorna e affina** la stima.

---

## 5. Severità e label (regole future)

### 5.1 Etichette forti

Le label **forti** (es. riferimenti a categorie estreme di rischio o outcome corporei gravi) sono ammesse solo se:

- il **segnale** è forte **secondo metriche dedicate** (non solo magnitudine di un vettore legacy),
- la condizione è **persistente** su una finestra definita (es. più giorni / più settimane),
- oppure è supportata da **calibrazione** (pesata/composizione) che conferma lo spostamento di stato.

### 5.2 Zona neutra

Intorno agli **assi** e al **centro concettuale**:

- definire una **banda neutra** dove non si attribuiscono quadranti “drammatici”;
- il sistema comunica **equilibrio approssimativo**, **dati insufficienti**, o **varianza normale**.

### 5.3 Piccole oscillazioni

Nessun linguaggio di fallimento per oscillazioni **within dead-band** o within zona neutra.

### 5.4 Distinzioni obbligatorie in copy e logica

| Concetto | Significato |
|----------|-------------|
| **Segnale debole** | Rumore o dati scarsi; UI sobria, non cambio narrativo forte. |
| **Direzione reale** | Trend filtrato e persistente; può aggiornare bussola e traiettoria con confidenza dichiarabile. |

---

## 6. Incoerenze attuali da risolvere (stato codice legacy)

Riepilogo tecnico allineato all’analisi esistente del codebase (senza prescrivere patch qui):

1. **Scale e ingressi diversi**  
   - La bussola grande usa prevalmente **`kcalBalance` + `trainingLoad`** normalizzati (`metabolicDirectionEngine`).  
   - La mappa periodo usa **media energetica + training + sonno + baseline corporea + termine “glicemic instability”** (`metabolicMapPeriodInputs` + `metabolicMapEngine`).  
   → Due mondi affiancati senza mapping univoco verso un unico spazio di stato.

2. **Mini-ago sulla mappa**  
   Derivato da **geometria** (traiettoria / punta inerziale in SVG), non dall’angolo della bussola motore → **non garantisce** la stessa “storia” dell’ago principale.

3. **Quadranti e label forti**  
   Quadranti basati su **segni** di assi con copy pesante (es. categorie metaboliche estreme) anche per piccoli spostamenti numerici.

4. **Baseline composizione**  
   Sposta il punto sulla **mappa** ma **non** entra nel vettore **bussola** → stato strutturale e direzione comportamentale restano disaccoppiati.

5. **Sonno**  
   Può incrementare rapidamente coordinate sulla mappa tramite termini dedicati → contrasto con obiettivo di **lentezza** della posizione di stato.

6. **Inerzia biologica**  
   Nel flusso attuale la **posizione mappa** aggregata ha moltiplicatori di timeframe, ma non esiste ancora un **modello di stato inerziale** esplicito (dinamica posizione ↔ direzione persistente) come richiesto dalla roadmap prodotto.

7. **Presentazione accoppiata**  
   La severità di alcuni testi mappa può dipendere da soglie legate al **segnale bussola**, miscelando due dimensioni concettuali diverse.

---

## 7. Roadmap tecnica futura (fasi)

Ordine indicativo; ogni fase dovrebbe essere patch piccola, reversibile, con test manuali e confronto UX.

| Fase | Contenuto |
|------|-----------|
| **A** | **Dead-band** energetica e macro; **label meno severe**; zona neutra vicino assi; divieto esplicito di outcome estremi per micro-scarti (incluso caso +32 kcal / 2500). |
| **B** | **Allineamento semantico** tra ago principale, marker e copy (stesso significato fisico o copy che spiega esplicitamente due modalità di lettura). |
| **C** | **Separazione stato / direzione / traiettoria** a livello di moduli e contratti dati (anche prima di rifattorizzare l’UI). |
| **D** | **Modello inerziale** della **posizione mappa**: dinamica lenta guidata da direzione persistente + decadimento rumore. |
| **E** | **Calibrazione pesate**: aggiornamento stato, errore modello, confidenza; niente linguaggio giudicante. |
| **F** | **Previsione posizione** alla prossima pesata (range / confidence interval narrativo), come obiettivo scientifico-prodotto. |

---

## 8. Rapporto con altri documenti

- `docs/KENTU_ROADMAP.md` — visione prodotto e sezione *Metabolic Compass & Body Map Model*.  
- Codice attuale — implementazione legacy da migrare solo dopo decisioni numeriche tratte da questa specifica.

---

## 9. Cosa questo documento non fa

- Non definisce coefficienti numerici finali (servono sessioni di tuning + dati reali).  
- Non impone stack tecnologico o librerie.  
- Non modifica runtime, build o UI finché una patch esplicita non lo richiede.

**Fine specifica.**
