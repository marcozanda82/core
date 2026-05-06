# KENTU / GhostApp — Roadmap Prodotto e Architettura

## Visione

Kentu non deve diventare una semplice chat nutrizionale.

Deve essere un ambiente operativo nutrizionale:

- tracking alimentare
- coach conversazionale
- dashboard progressi
- analisi macro/micro
- spiegabilità dei dati
- caricamento pasti naturale

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

## Bussola e mappa metabolica

Il corpo non ricalibra il proprio stato come un LED che si spegne e si riaccende: risponde con inerzia. Una mappa metabolica credibile deve tenere conto di questo ritmo, altrimenti l’utente percepisce incoerenze tra ciò che fa oggi e ciò che lo schermo “dichiara”.

Due livelli vanno tenuti distinti:

- **stato metabolico** (dove si è, con memoria rispetto al passato recente);
- **direzione o tendenza metabolica** (verso dove si sta andando, data dagli input cumulativi).

In termini visivi: la **posizione sulla mappa** rappresenta uno stato che porta in sé un’inerzia temporale; l’**ago della bussola** rappresenta la direzione risultante **nel presente**. Marker e ago possono divergere per periodi coerenti con la biologia (reazione lenta, recupero, stallo) senza risultare contraddittori, purché la semantica sia chiara e stabile per l’utente.

**Problema spesso presente nelle mappe “istantanee”:** un solo indicatore che mescola stato e impulso odierno genera salti poco spiegabili e sfiducia. La roadmap concettuale per la bussola include quindi: zone etichettate e cognitivemente leggibili; coerenza percettiva; e, in prospettiva, memoria temporale, traiettoria storica, stima della velocità di cambiamento e lettura dei trend cumulativi—sempre al servizio della chiarezza, non dell’effetto visivo fine a sé.

## Movimento e vitalità

Il movimento in Kentu non si riduce a fitness da palazzetto o performance da competizione. Il sistema deve valorizzare stimoli compatibili con ogni età e punto di partenza: camminata, mobilità quotidiana, lavoro leggero, come molle per mantenere **capacità funzionale** nel tempo. Il corpo ha bisogno di carico e di recupero; la pianificazione concettuale include attività, recupero, scarico e **sostenibilità** nel lungo periodo. Il coach conversazionale (come modulo) deve favorire continuità ed equilibrio, non un modello estremistico o solo “performance-only”.

## Unified Food Input

Kentu deve evolvere verso un **unico sistema di inserimento alimenti**: l’utente deve poter usare, dalla stessa barra coerente (e con comportamento continuo):

- ricerca classica (catalogo + propri alimenti)
- linguaggio naturale (comandi tipo pasto)
- inserimento rapido (quantità, conferme rapide)
- in futuro input vocale (stesso protocollo logico)

**Principi**

- Lo smart input (NL) **non** sostituisce il controllo manuale: resta sempre possibile correggere, scegliere dall’elenco, rifiutare una proposta.
- Il sistema si **adatta al contesto della query** (lunghezza, token, presenza di grammi, ambiguità) senza impostazioni ostiche.
- **Alimenti utente**, **abitudini** (storico pasti / associazioni note) e **recenti** (frequenza d’uso) restano **centrali** nel ranking e nelle suggestioni, non marginali rispetto al solo catalogo CREA/USDA.
- Il comportamento deve risultare **naturale e continuo**: stesse regole di review dove possibile, stessa semantica di “candidato” e di conferma.

**Architettura desiderata (bersaglio)**

- **Un solo “sistema alimentare”** sotto il cofano: stessi vincoli di dati (CREA/USDA, override utente, chiavi).
- **Più ingressi** (UI tastiera, NL, rapido, voce) come **adattatori** sottili verso il nucleo.
- **Candidate ranking condiviso** (o derivato da un’unica funzione di merge ordinata), così ordine e spiegabilità non dipendono dal canale usato.
- **Review condivisa** (ambiguità, no_match, conferma quantità): un solo flusso di “draft pasto” aggiornabile da qualsiasi ingresso.

Implementazione: per fasi piccole, senza mega-refactor; stato attuale e analisi tecnica sintetica in `docs/FOOD_INPUT_CLASSIC_VS_SMART_ANALYSIS.md`.

## Moduli prioritari futuri

### 1. ChatCoach separato

Modulo indipendente dalla SalaComandi.

**Ruolo del coach (cosa non è / cosa è).**

Il coach non è un chatbot generico, un motivatore aggressivo o un generatore casuale di workout. È un **interprete dello stato del sistema** (nutrizione, movimento, recupero dove presenti), un **assistente alla cura personale** nel senso operativo del termine, e un **coordinatore** tra alimentazione, movimento e riposo. Agisce come **interfaccia conversazionale verso l’app**: la chat deve **parlare con il sistema**—leggere stato e regole note, proporre azioni, chiedere conferme—non solo scambiare frasi disconnesse dal resto del prodotto.

Funzioni:

- dialogo con l’utente
- caricamento pasti conversazionale
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

- parsing comando testuale
- ranking alimenti
- sinonimi / concept tokens
- ready / ambiguous / no_match
- review prima della conferma
- no Firebase diretto dal motore
- convergenza incrementale verso **Unified Food Input** (pool candidati e boost abitudini/recency allineati tra canali, dove possibile senza rompere i flussi esistenti)

### Fase 2 — ChatCoach modulare

- estrarre la chat da SalaComandi se presente
- creare modulo separato
- definire protocollo messaggi / azioni
- integrare con foodCommandEngine
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
- Direzione **Unified Food Input**: una barra, più ingressi, ranking e review condivisi obiettivo di prodotto (vedi sezione omonima sopra).

## Backlog idee

- barra alimenti unificata (classico + linguaggio naturale + rapido + voce futura)
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
