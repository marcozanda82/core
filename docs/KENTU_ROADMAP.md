# KENTU / GhostApp — Roadmap Prodotto e Architettura

## Visione

Kentu non deve diventare una semplice chat nutrizionale **né un semplice calorie tracker**.

Kentu deve modellare, nel tempo:

- **stato corporeo** (accumulo, composizione, posizione metabolica nel modello);
- **direzione metabolica** (tendenza comportamentale e nutrizionale recente);
- **traiettoria biologica** (“dove si va se si continua così”), non solo il bilancio della giornata.

La filosofia di prodotto è coerente con la linea culturale interna **«A Kent’Annos»**: longevità e vitalità intese come **sostenibilità nel tempo**, cura continua e abitudini ripetibili—con riferimenti impliciti a temi tipo blue zones, senza ridurre il messaggio a slogan pubblicitario.

Deve essere anche un **ambiente operativo nutrizionale**:

- tracking alimentare
- coach conversazionale
- dashboard progressi
- analisi macro/micro
- spiegabilità dei dati
- caricamento pasti (classico e, in futuro, conversazionale dove previsto)

La chat è un layer di orchestrazione, non il centro dell’app.

## Filosofia e manifesto

Le persone tendono naturalmente a prendersi cura di persone, progetti, animali, routine. Spesso, però, la stessa attenzione non viene rivolta al proprio organismo. Kentu esiste per favorire una relazione esplicita e continuativa con il proprio sistema biologico: non come obbligo morale, ma come pratica di cura informata.

In questo senso l’app ha una funzione simbolica vicina a un “tamagotchi di noi stessi”: non perché il corpo sia un gioco, ma perché richiede input costanti e produce risposte graduali e cumulative nel tempo. Le abitudini non trasformano lo stato istantaneamente; si sommano. L’ambizione del prodotto non è la perfezione di un modello ideale, ma il mantenimento di vitalità, funzionalità e un equilibrio realistico rispetto a età, vincoli e capacità individuali. Kentu non impone un unico standard corpo-tempo-contesto: propone strumenti per leggere e orientare, lasciando alla persona il centro delle decisioni.

## Principi guida

- Non aumentare SalaComandi.
- Evitare mega-componenti.
- Preferire moduli separati.
- Motori deterministici dove possibile.
- Nessuna AI/API runtime per funzioni che possono essere locali.
- UI solo quando necessaria.
- Prima discutere approccio, poi implementare.
- Ogni modifica deve essere piccola, testabile e reversibile.

## Direzione architetturale

SalaComandi deve diventare progressivamente più leggera:

- orchestrazione
- routing intenti
- coordinamento moduli

La logica deve vivere in moduli separati:

- foodCommandEngine
- foodLookupEngine
- ChatCoach
- NutrientProgress
- NutrientContribution
- FoodCard
- MealBuilder

## Metabolic Compass & Body Map Model

Il corpo non ricalibra il proprio stato come un LED che si spegne e si riaccende: risponde con **inerzia**. Una mappa metabolica credibile deve rispettare questo ritmo; altrimenti l’utente percepisce incoerenze tra ciò che fa oggi e ciò che lo schermo “dichiara”.

Due livelli restano **distinti** nel modello mentale del prodotto:

- **stato / posizione** (dove si è, con memoria e accumulo nel tempo);
- **direzione / tendenza** (verso dove si sta andando, data dagli input cumulativi e dal comportamento recente).

In termini visivi concettuali: la **posizione sulla mappa** è uno stato **lento** e **inerziale**; la **bussola** è la direzione risultante nel breve periodo. Marker e ago possono divergere per periodi biologicamente plausibili (reazione lenta, recupero, stallo) senza risultare contraddittori, purché la **semantica** sia chiara e stabile.

**Problema da evitare:** un solo indicatore che mescola stato e impulso odierno genera salti poco spiegabili e sfiducia. Zone etichettate, tolleranze, memoria temporale e lettura dei trend cumulativi servono la **chiarezza**, non l’effetto visivo fine a sé.

### Mappa (stato corporeo)

La **mappa** rappresenta:

- stato corporeo **accumulato** nel tempo;
- composizione corporea reale (quando disponibile);
- **posizione metabolica** dell’utente nello spazio del modello.

La posizione **non** deve reagire in modo isterico ai singoli giorni. Deve essere:

- **lenta** nel muoversi;
- **inerziale** (memoria del recente);
- **progressiva**.

Concettualmente la posizione deriva da: trend di peso; composizione corporea; massa magra / grassa (misurate o stimate); storico comportamentale cumulativo.

Il **centro** della mappa rappresenta, per quella persona: massimo **equilibrio funzionale** realistico; **sostenibilità** della routine; **equilibrio metabolico** nel senso operativo del prodotto (non un ideale estetico universale).

### Bussola (direzione metabolica)

La **bussola** rappresenta:

- **direzione metabolica corrente**;
- **tendenza comportamentale recente** (energia, macro, movimento, recupero, coerenza).

La bussola **non** rappresenta: giudizio puntuale sulla giornata; “errore” di un singolo giorno; verità assolute sul singolo pasto.

Requisiti concettuali:

- meno sensibile al **rumore** (piccole variazioni non devono invertire categorie drasticamente);
- **non isterica**: tolleranze e **zone neutre** semanticamente stabili.

Esempio orientativo: uno scostamento tipo **+32 kcal su ~2500 kcal** non deve, da solo, comunicare accumulo adiposo o messaggi iperbolici equivalenti.

La bussola deriva in sintesi da: trend energetico; proteine e distribuzione macro; allenamento / movimento; recupero (e sonno ove nel modello); **coerenza** nel breve periodo.

### Traiettoria

Concetto centrale del modello.

La **traiettoria** risponde a: *«dove andrò se continuo così?»*

- la **posizione sulla mappa** cambia **lentamente** nel tempo;
- tende a muoversi nella direzione della **bussola** se quella direzione viene **mantenuta**;
- se la bussola **cambia continuamente** senza trend stabile, la posizione resta **quasi stabile**.

Principio guida:

> **Il corpo segue le traiettorie, non i singoli giorni.**

### Pesate

Le **pesate** non sono: giudizi morali; verità assolute; eventi traumatici che resettano il rapporto con il modello.

Le pesate sono: **calibrazione** del modello rispetto alla realtà misurata; **verifica** della traiettoria stimata.

Visione di prodotto: nel tempo Kentu dovrebbe tendere a **stimare** correttamente la posizione corporea **prima** della pesata reale; la pesata **affina** la stima.

### Filosofia sintetica (modello metabolico)

A questo livello di astrazione Kentu **non descrive solo il presente istantaneo**: descrive **traiettorie** e **accumulo** degli effetti delle abitudini.

Il sistema deve: favorire la **cura di sé** con continuità; **evitare estremismi** e linguaggi da fallimento giornaliero; incentivare **sostenibilità** e **ripetibilità**; modellare effetti **cumulativi**.

Riferimento culturale interno: **«A Kent’Annos»** (longevità, vitalità nel lungo periodo)—bussola di prodotto, non necessariamente slogan pubblico.

### Aperture progettuali (solo documentazione)

- Definire, quando si passerà al design quantitativo, parametri di **inerzia / smoothing** distinti per mappa vs bussola (evitare regole premature nel codice).
- Integrare progressivamente **composizione corporea** e **peso** nella stima della posizione e della traiettoria (priorità release da pianificare).

## Movimento e vitalità

Il movimento in Kentu non si riduce a fitness da palazzetto o performance da competizione. Il sistema deve valorizzare stimoli compatibili con ogni età e punto di partenza: camminata, mobilità quotidiana, lavoro leggero, come molle per mantenere **capacità funzionale** nel tempo. Il corpo ha bisogno di carico e di recupero; la pianificazione concettuale include attività, recupero, scarico e **sostenibilità** nel lungo periodo. Il coach conversazionale (come modulo) deve favorire continuità ed equilibrio, non un modello estremistico o solo “performance-only”.

## Unified Food Input (motore condiviso, superfici distinte)

**Decisione architetturale definitiva:** il **motore** alimentare e il **parsing smart** restano **condivisibili** tra superfici; le **UI di inserimento** non sono obbligate a essere una sola barra “ibrida” nel Costruttore pasti.

### MealBuilder — input classico

Il **MealBuilder** è la superficie **classica**:

- alimento + **quantità separata**;
- ricerca catalogo / propri alimenti / CREA come da prodotto;
- rapido, preciso, adatto agli utenti abituali al tracking strutturato.

La **smart suggestion** (interpretazione NL multi-food nella stessa barra) **non** risiede nel MealBuilder: evita rumore, regressioni percettive e duplicazione di flussi interpretativi nella modalità “precisione”.

### ChatCoach (futuro) — input conversazionale / smart

Il modulo **ChatCoach** (futuro) è la superficie naturale per:

- linguaggio conversazionale e **multi-food**;
- **parsing smart** e orchestrazione comando (es. orchestratore già previsto a livello motore);
- **review interpretativa** (`FoodCommandReview` e affini) prima di confermare nella bozza pasto.

### Principi che restano validi

- Lo smart input (NL) **non** sostituisce il controllo umano: correzioni, scelta da elenco, rifiuto proposta restano centrali dove previsto dal flusso.
- Il sistema si **adatta al contesto della query** (lunghezza, token, quantità esplicite, ambiguità) senza impostazioni ostiche—**nel canale** che supporta NL (coach / comandi dedicati), non necessariamente nella barra classica.
- **Alimenti utente**, **abitudini** e **recenti** restano centrali nel **ranking** e nelle suggestioni classiche.
- **Un nucleo dati** (CREA/USDA, override, chiavi) e, dove ha senso, **review condivisa** tra i flussi che confermano sulla bozza pasto.

### Architettura desiderata (bersaglio)

- **Un solo “sistema alimentare”** sotto il cofano: stessi vincoli di dati e, dove applicabile, stessa semantica di candidato/review.
- **Più ingressi come adattatori**: barra classica (MealBuilder); coach conversazionale; in futuro voce—nessuno dei quali deve forzare nella barra classica l’interfaccia dell’altro.
- **Ranking** definito nei motori/moduli previsti, senza divergenze gratuite tra canali.
- L’**orchestratore smart** (`foodInputOrchestrator` / affini) resta **disponibile** per ChatCoach e integrazioni future, non come elemento obbligatorio della barra MealBuilder.

Implementazione: per fasi piccole; dettaglio tecnico e storico decisionale in `docs/FOOD_INPUT_CLASSIC_VS_SMART_ANALYSIS.md`.

## Moduli prioritari futuri

### 1. ChatCoach separato

Modulo indipendente dalla SalaComandi.

**Ruolo del coach (cosa non è / cosa è).**

Il coach non è un chatbot generico, un motivatore aggressivo o un generatore casuale di workout. È un **interprete dello stato del sistema** (nutrizione, movimento, recupero dove presenti), un **assistente alla cura personale** nel senso operativo del termine, e un **coordinatore** tra alimentazione, movimento e riposo. Agisce come **interfaccia conversazionale verso l’app**: la chat deve **parlare con il sistema**—leggere stato e regole note, proporre azioni, chiedere conferme—non solo scambiare frasi disconnesse dal resto del prodotto.

Funzioni:

- dialogo con l’utente
- caricamento pasti conversazionale e **input naturale multi-food** (perimetro NL / smart, coerente con *Unified Food Input*)
- uso dell’**orchestratore smart** e del motore comando nel contesto coach (non nella barra classica MealBuilder)
- domande di chiarimento
- conferma alimenti
- apertura azioni nell’app
- comunicazione bidirezionale con il sistema

La chat deve funzionare come un cameriere che prende una comanda:

utente descrive il pasto → sistema interpreta → chiede chiarimenti → propone riepilogo → conferma → aggiunge alla bozza pasto.

### 2. Nutrient Progress Dashboard

Barre macro/micro/rapporti:

- calorie
- proteine
- carboidrati
- grassi
- fibre
- vitamine
- minerali
- Omega 6 : Omega 3
- Sodio : Potassio

Le barre devono poter essere cliccabili in futuro.

### 3. Nutrient Contribution Drilldown

Clic su una barra → mostra alimenti che hanno contribuito a quel valore.

Esempio:

Omega 6 alto →

- olio di semi: 45%
- noci: 25%
- maionese: 15%

Obiettivo:

rendere i dati spiegabili e utili.

### 4. FoodCard avanzata

Scheda alimento modificabile:

- macro
- micro
- grassi dettagliati
- aminoacidi
- origine dati
- override utente
- note

Importante:

i dati base CREA/USDA devono restare immutabili.

Le modifiche utente devono vivere come override separati.

## Roadmap per fasi

### Fase 1 — Stabilizzazione motore alimenti

- parsing comando testuale (motore / coach / sezioni comando)
- ranking alimenti
- sinonimi / concept tokens
- ready / ambiguous / no_match
- review prima della conferma
- no Firebase diretto dal motore
- convergenza incrementale verso **Unified Food Input** nel senso di **nucleo condiviso** (dati, review dove applicabile, ranking coerente), mantenendo **superfici distinte** classico vs conversazionale come da roadmap

### Fase 2 — ChatCoach modulare

- estrarre la chat da SalaComandi se presente
- creare modulo separato
- definire protocollo messaggi / azioni
- integrare con foodCommandEngine e, dove previsto, orchestrazione smart (NL → review → bozza)
- supportare caricamento pasto conversazionale

### Fase 3 — Progressi nutrizionali esplorabili

- barre macro/micro
- rapporti nutrizionali
- drilldown contributi
- spiegabilità

### Fase 4 — FoodCard e override nutrienti

- scheda alimento dettagliata
- modifica valori
- salvataggio override
- tracciamento origine dati

### Fase 5 — Coach evoluto

- suggerimenti contestuali
- analisi giornaliera
- spiegazioni nutrizionali
- azioni guidate

## Cose da NON fare

- Non trasformare Kentu in una chat generica.
- Non spostare logica dentro SalaComandi.
- Non aumentare ulteriormente SalaComandi.
- Non introdurre AI/API runtime se il problema è risolvibile deterministicamente.
- Non fare refactor grandi senza motivo.
- Non modificare UI quando si sta lavorando sul motore.
- Non cambiare PastoDrawer salvo necessità esplicita.

## Decisioni già prese

- foodCommandEngine lavora solo su bozza pasto, non scrive direttamente su Firebase.
- FoodCommandReview gestisce conferma, ambiguità e no_match.
- Le modifiche al ranking devono restare nel motore o in moduli helper.
- SalaComandi non deve crescere.
- La chat futura deve essere modulo separato.
- La roadmap vive in docs e può essere aggiornata tramite Cursor.
- **Modello metabolico:** mappa = stato lento/inerziale; bussola = direzione recente non rumorosa; traiettoria = “dove si va se si continua così”; pesate = calibrazione, non giudizio (vedi *Metabolic Compass & Body Map Model*).
- **Input alimenti:** MealBuilder = **classico** (alimento + quantità); smart NL / orchestratore smart orientati a **ChatCoach** (futuro), non alla barra classica del MealBuilder.
- Direzione **Unified Food Input**: **motore e dati condivisi**, **superfici multiple** (classico vs conversazionale), ranking/review allineati dove previsto (vedi sezione omonima sopra).

## Backlog idee

- ChatCoach / canali conversazionali: NL multi-food, orchestratore smart, review interpretativa verso la stessa bozza pasto (senza fondere nella barra classica del MealBuilder)
- voce e altri ingressi come **adattatori** verso il nucleo alimentare (futuro)
- debug panel interno per food engine
- dataset alimentare USDA offline
- ranking più evoluto per alimenti generici
- suggerimenti automatici per completare micro carenti
- vista “chi ha contribuito a questo nutriente?”
- confronto pasto reale vs pasto ideale
- modalità cameriere per inserimento pasto
- profili giornata più leggibili
- controllo qualità proteica
- rapporto sodio/potassio
- rapporto omega 6/omega 3

## Direzione del prodotto

Kentu non deve chiudersi in un solo ruolo: né solo calorie tracker, né solo chat AI, né solo app fitness. La direzione è quella di un **sistema operativo della cura personale e della vitalità**: strumenti collegati, dati spiegabili, conversazione al servizio dello stato del sistema e delle scelte quotidiane—sempre nel rispetto dei limiti e del contesto di ogni persona.

In parallelo, il **modello metabolico** (mappa, bussola, traiettoria; pesate come calibrazione) qualifica Kentu come lettura del **corpo nel tempo**, non solo come registro di giornate isolate.

## Regole per Cursor

Quando lavori su Kentu:

1. Leggi questo file prima di proporre refactor importanti.
2. Non modificare SalaComandi salvo richiesta esplicita.
3. Se una modifica può vivere in modulo separato, crea modulo separato.
4. Prima analizza, poi proponi approccio.
5. Implementa solo dopo conferma.
6. Ogni patch deve essere piccola e testabile.
7. Riporta sempre:
   - file modificati
   - motivo della modifica
   - test manuali suggeriti
   - rischi/regressioni possibili

Non modificare altri file.

Non importare questo file nel codice.

Non cambiare build/runtime.
