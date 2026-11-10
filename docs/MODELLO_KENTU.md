# Modello Kentu

Nov 10, 2026 · @Marco

Kentu mostra all'utente gli effetti del proprio stile di vita, giorno dopo giorno, con un'evidenza che non si può contestare perché dichiara sempre da dove viene e quanto è sicura. Questo documento è il riferimento per prodotto, codice e prompt dell'AI.

## Visione

Yazio e MyFitnessPal aiutano a registrare. Kentu mostra **cosa stanno facendo le tue abitudini**. Le rinunce si sostengono solo se si vede che servono: per questo ogni funzione deve rispondere a una domanda, "che effetto ha quello che faccio?".

Tre principi guidano ogni scelta:

- **Rotta ogni giorno, effetti nel tempo.** Il ritorno è quotidiano (sei nella direzione giusta?), gli effetti misurati arrivano in settimane e mesi. Come la goccia sulla roccia: una non scava, tutte insieme sì.
- **Costante è meglio di più.** Il modello sono i centenari sardi: persone moderate e costanti per decenni, non atleti estremi né persone a dieta. Kentu non premia mai l'eccesso.
- **Onestà anche quando la notizia è cattiva.** Uno strumento si guarda perché ci si fida della lettura. Un'app che mostra sempre progressi per motivare perde credibilità, e con lei la motivazione.

Il valore per cui l'utente paga: dati affidabili, memoria lunga delle abitudini, un giudizio coerente nel tempo e un rapporto che arriva da solo ogni mattina. I chatbot conversano meglio; Kentu ricorda, misura e parla per primo.

## I quattro cilindri

Lo stile di vita si legge su quattro cilindri, più una misura del corpo. Ogni cilindro ha quattro livelli: la **rotta** (cosa hai fatto, ogni giorno), i **segnali rapidi** (cosa senti e misuri in pochi giorni), gli **effetti** (cosa è cambiato in settimane e mesi), i **limiti** (le soglie del salvavita).

| Cilindro | Rotta (ogni giorno) | Segnali rapidi | Effetti misurati | Riferimenti |
| --- | --- | --- | --- | --- |
| Alimentazione | energia rispetto all'obiettivo, qualità (ultra-processati sfavorevoli, fibra, integrali, pesce azzurro, olio extravergine), primo pasto e ultimo pasto | fame, digestione, gonfiore | peso (media mobile), vita, esami del sangue | fabbisogno stimato, poi ricalibrato sui dati reali; LARN per i nutrienti |
| Sonno | durata, orari, distanza dall'ultimo pasto | qualità percepita, energia al risveglio (check-in) | frequenza cardiaca a riposo, regolarità nel tempo | almeno 7 ore per l'adulto |
| Forza | gruppi allenati e giorni dall'ultimo stimolo per gruppo, riposo tra le sessioni | fatica, indolenzimento | carichi e ripetizioni nei movimenti principali | 48 ore di recupero per gruppo |
| Cardio | minuti negli ultimi 7 giorni (finestra mobile) | fiato, fatica percepita | frequenza a riposo, tempo sullo stesso percorso, battiti allo stesso ritmo | 150-300 min a settimana di attività moderata (OMS) |
| Corpo | — | — | circonferenza vita e rapporto vita/altezza, una misura a settimana | rapporto vita/altezza sotto 0,5 |

**Forza e cardio si leggono sempre su finestre mobili**, anche nel rapporto di ieri: un giorno di riposo non è un giorno negativo.

**I cilindri sono collegati**, e il rapporto può accostare due fatti senza affermare una causa: la cena tardiva e il sonno, il sonno corto e l'appetito, il cardio regolare e la qualità del sonno, il recupero insufficiente e i carichi che calano.

**L'orologio degli effetti** va dichiarato fin dall'onboarding, perché molti abbandonano aspettando un risultato nel momento sbagliato:

1. in pochi giorni: sonno, energia, digestione;
2. in 1-3 settimane: andamento del peso, frequenza a riposo, ago infiammatorio;
3. in 3-6 settimane: vita, forza, ritmo nel cardio;
4. in 2-3 mesi: composizione corporea, esami del sangue.

**Le evidenze più forti sono quelle personali.** Il "conto delle gocce" somma i comportamenti rispetto al proprio periodo precedente ("38 cene prima delle 20:30 in più in tre mesi"). Gli esperimenti personali confrontano i propri periodi ("dopo le cene entro le 20:30 hai dormito 34 minuti in più, 18 notti contro 22"), un'ipotesi alla volta, con una durata minima e il coraggio di dire "non è ancora chiaro".

Le misure di effetto si presentano sempre in unità vere, come prima → dopo: centimetri, chili, battiti, minuti. Mai in punteggi.

## Il Focus e il calendario

Il Focus si apre con il calendario: a colpo d'occhio deve rispondere a "come sto andando?", senza scorrere e senza toccare niente. Tutto il resto è un livello sotto, a un tocco.

**Struttura della pagina**, uguale per ogni periodo:

1. schede Giorno · Settimana · Mese · Anno;
2. intestazione del periodo con il pallino aggregato (colore medio) e lo stato a parole: sulla rotta, a metà, fuori rotta;
3. il calendario del periodo: striscia di 7 giorni (Giorno, Settimana), griglia con le scie (Mese), 12 mini-calendari (Anno);
4. il titolo del periodo, una frase;
5. i quattro cilindri come righe compatte (icona, un numero, pallino), apribili per il dettaglio;
6. una sola azione, con l'orizzonte del periodo: "Oggi prova così", "Questa settimana", "Questo mese";
7. "Chiedi all'assistente" e "Perché te lo dico".

**Si apre sempre l'ultimo periodo completo.** Giorno si apre su ieri, il più recente tra i giorni chiusi. Il lunedì, Settimana si apre sulla settimana appena conclusa; il primo del mese, Mese sul mese precedente. Il periodo in corso è a una freccia di distanza.

**Oggi è "in corso".** Bordo tratteggiato, nessun colore: mostra cosa è già registrato e se finora sei sulla rotta, ma il giudizio arriva domattina. I giorni futuri sono spenti.

**Il punteggio del giorno** è deterministico: lo calcola il codice dai quattro cilindri, sempre con lo stesso metodo, mai l'AI. Diventa un colore su una scala continua.

| Stato | Aspetto | Significato |
| --- | --- | --- |
| Sulla rotta | dall'azzurro al blu profondo | giornata positiva; più è profondo, più era vicina all'ideale |
| A metà | giallo | qualcosa ha funzionato, qualcosa no |
| Fuori rotta | dall'arancio al rosso | giornata negativa |
| Buco | nero, con bordo e ombra interna | giorno non registrato |
| Pausa | grigio con icona | pausa dichiarata prima (vacanza, malattia) |
| In corso | bordo tratteggiato ciano | oggi, non ancora giudicabile |

**Il buco nero.** Registrare è parte della routine: un giorno non registrato è un'interruzione dell'attenzione e deve vedersi. Non è rosso, perché il rosso giudica come hai vissuto, mentre il nero dice che Kentu non lo sa. Accortezze:

- un giorno registrato entro 48 ore riempie il buco, con il segno "registrato dopo";
- "giornata ricordata a grandi linee" è un'opzione onesta: riempie il buco ma pesa meno nei calcoli;
- al ritorno dopo una pausa non dichiarata, Kentu accoglie ("Bentornato, ripartiamo da oggi"), non rimprovera.

**Le scie.** Una scia è una serie di almeno 3 giorni sulla rotta, sottolineata nel calendario. Un buco la interrompe; un solo giorno giallo la mette in pausa senza spezzarla. Accanto alla scia più lunga si mostrano sempre i giorni sulla rotta del periodo, un numero che non si azzera mai.

**Il giorno chiuso.** Nel check-in del mattino: "Ieri hai registrato tutto?". I giorni non confermati, o con buchi evidenti (un solo pasto, nessuna cena), hanno affidabilità bassa: colore meno pieno, nessun giudizio forte.

**I pallini aggregati** si calcolano solo sui giorni chiusi e registrati. Se la copertura del periodo è troppo bassa, niente pallino, né scie, né medie: "dati insufficienti". Da decidere: media semplice o con più peso ai giorni recenti.

## Il potenziale infiammatorio

Kentu stima il **potenziale infiammatorio dello stile di vita**, non lo stato infiammatorio della persona, che si misura solo con gli esami. Il concetto è studiato in letteratura e verificato contro marcatori nel sangue (PCR, interleuchine): nel Dietary and Lifestyle Inflammation Score (Journal of Nutrition, 2019) il fattore singolo più pesante è l'obesità, più di qualunque alimento.

**Lo strumento** è un indicatore a zero centrale, come un voltmetro: ago a sinistra = tendente anti, al centro = neutro, a destra = tendente pro. Scala blu → giallo → arancio, senza rosso. L'ago è **smorzato** da una media mobile di 4 settimane (7 giorni nel Focus di Giorno e Settimana), così una giornata storta non lo fa saltare. Un ago tratteggiato mostra il periodo precedente. Un **alone** attorno all'ago mostra l'incertezza: più dati stimati, alone più largo. Sotto, "Cosa muove l'ago": ogni fattore è una barra che parte dal centro, verso sinistra o verso destra.

| Fattore | Cilindro | Direzione | Nota sui dati |
| --- | --- | --- | --- |
| Fibra, verdure, legumi, frutta intera | Alimentazione | anti | dati solidi |
| Pesce azzurro, omega-3 | Alimentazione | anti | omega-3 presente in CREA e USDA |
| Olio extravergine, cacao fondente | Alimentazione | anti | riconoscibile per nome e catalogo |
| Rapporto omega-6 : omega-3 | Alimentazione | pro se alto | omega-6 spesso assente in Open Food Facts: stimato |
| Rapporto sodio : potassio | Alimentazione | pro se alto | sottostimato: il sale aggiunto non si registra |
| Ultra-processati sfavorevoli, carni lavorate, zuccheri | Alimentazione | pro | già distinti nel dossier |
| Alcol oltre le quantità moderate | Alimentazione | pro |  |
| Sonno corto e cronico | Sonno | pro |  |
| Attività fisica regolare | Cardio, Forza | anti |  |
| Rapporto vita/altezza | Corpo | pro sopra 0,5 | il fattore più pesante |
| Spezie (curcuma e simili) | Alimentazione | anti, peso basso | quasi mai registrate: "dati insufficienti" |

**Regole di calcolo:**

- ogni fattore ha un valore misurato, un riferimento dalla letteratura e un peso documentato con la sua fonte; il contributo è lo scostamento dal riferimento per il peso; la somma, limitata alla scala, è la posizione dell'ago;
- un fattore entra solo se i dati lo coprono, altrimenti appare grigio con "dati insufficienti";
- mai un giudizio sul giorno singolo: il giorno contribuisce, non giudica;
- l'indice si chiama "potenziale infiammatorio stimato" e si dichiara come stima basata sulla letteratura, non come indice validato. Il DII è un riferimento per l'ordine di grandezza dei pesi; usarne il nome o il metodo esatto richiede di verificarne la licenza.

**Stima di omega-3 e omega-6 mancanti.** L'AI legge una sola volta la lista ingredienti di un prodotto e indica la fonte di grassi prevalente (girasole, palma, burro, extravergine, frutta secca). Il codice calcola omega-3 e omega-6 come grassi totali per il profilo noto di quella fonte. Il risultato si salva nella cache del prodotto come "stimato", con la fonte dichiarata.

**La taratura.** Quando l'utente inserisce un esame (PCR), Kentu lo affianca al potenziale stimato nei mesi precedenti. È l'unico modo per verificare lo strumento sulla persona.

## Il salvavita

Il salvavita è un livello di controlli deterministici che scatta quando qualcosa supera una soglia, qualunque cosa dica l'AI. Kentu deve saper dire "rallenta" e trattare il riposo come un obiettivo, non come un passo indietro.

| Area | Soglia | Cosa fa Kentu |
| --- | --- | --- |
| Energia | deficit grande e protratto rispetto al fabbisogno; giornate molto basse ripetute | sotto osservazione, poi invito a rallentare il deficit |
| Peso | perdita oltre l'1% del peso corporeo a settimana | invito a rallentare |
| Proteine | sotto il minimo in fase di deficit | segnalazione nell'alimentazione |
| Allenamento | carico settimanale che cresce troppo in fretta; troppi giorni di fila senza riposo; stesso gruppo senza 48 ore di recupero | proposta di riposo o settimana di scarico |
| Sovraccarico | frequenza a riposo in aumento, sonno peggiore, energia al risveglio bassa, prestazioni in calo, insieme | "rallenta", settimana di scarico trattata come un successo |

Le soglie numeriche esatte vanno definite con le fonti, prima del codice.

**Regole di comportamento:**

- **mai premiare l'eccesso**: nessun "ottimo" per una giornata a 1.200 kcal o per il settimo allenamento di fila; un giorno con deficit eccessivo non è mai blu, anche se tutto il resto è perfetto;
- **il riposo conta**: un giorno di recupero ben piazzato vale come un allenamento;
- **attenzione al rapporto con il cibo**: restrizioni severe e ripetute non si incoraggiano; in quel caso Kentu smette di parlare di numeri e suggerisce con delicatezza un supporto professionale;
- **condizioni particolari**: con la modalità diabete, o con condizioni dichiarate, il consiglio di sentire il medico è esplicito;
- **riferimenti personalizzabili**: turni, digiuno intermittente dichiarato (flag già previsto), età avanzata cambiano i riferimenti, così Kentu non rimprovera chi segue un percorso diverso.

Il salvavita appare nel Focus solo quando ha qualcosa da dire: una riga in cima quando scatta, discreto quando è "sotto osservazione", assente quando tutto va bene.

## Regole di credibilità

Nessuna stima è incontrovertibile; un'evidenza diventa inattaccabile quando si può ripercorrere fino all'origine, dichiara quanto è sicura e non esagera mai.

**Ogni informazione ha il suo livello di certezza**, e lo mostra:

| Livello | Esempio | Quanto è contestabile |
| --- | --- | --- |
| Fatto registrato | "hai cenato alle 21:46" | per niente |
| Calcolo | "34 g di fibra al giorno" | verificabile |
| Stima dalla letteratura | "potenziale tendente anti", con alone di incertezza | dichiarata come tale |
| Effetto misurato | vita, peso, frequenza a riposo, esami | il livello più forte |
| Evidenza personale | "dopo le cene entro le 20:30 hai dormito 34 minuti in più" | sono i tuoi dati |

**Tracciabilità.** Tocchi un colore e vedi i cilindri; tocchi un cilindro e vedi gli alimenti e i giorni; tocchi il metodo e vedi la fonte. "Perché te lo dico" è il certificato di taratura dello strumento.

**Il dato prima di tutto.** Le vulnerabilità più gravi stanno nei dati, non nel modello:

- Kentu non distingue "ho mangiato poco" da "non ho registrato tutto": per questo il giorno chiuso;
- si registrano più volentieri i giorni buoni: per questo i buchi neri e la copertura sempre visibile ("24 giorni registrati su 31");
- porzioni a occhio e condimenti dimenticati: Kentu propone olio e sale con valori tipici quando si registra un piatto, e dichiara che il sodio è sottostimato;
- errori di riconoscimento degli alimenti (il caso ravioli/spinaci): risolutore corretto, storico da verificare con l'audit;
- il fabbisogno è una formula con un errore del 10-15%: con settimane di peso e calorie, Kentu lo ricalibra sulla persona;
- le calorie degli allenamenti sono indovinate: meglio non usarle nel bilancio che usarle sbagliate;
- la vita si misura con un protocollo (mattina, a digiuno, all'ombelico, due misure) e si legge come media mobile.

**Il metodo è versionato.** Pesi, soglie e fattori sono scelte di progetto. Se cambiano, lo storico non si ricalcola in silenzio: o resta com'era, o si ricalcola dicendolo.

**Il ruolo dell'AI.**

- Gli stati (colori dei giorni, pallini dei cilindri, ago, salvavita) li decide il codice. L'AI scrive il titolo, l'azione e le righe di dettaglio.
- Il testo non può mai contraddire uno stato calcolato: il validatore lo verifica.
- Il dossier contiene aggregati e segnali, non dati grezzi; l'AI non inventa valori nutrizionali.
- Il modello è fissato a una versione; a ogni cambio si rilanciano i test sui fixture reali.
- Le proiezioni hanno sempre un intervallo, e il confronto tra previsto e reale è visibile.
- Gli esperimenti personali: un'ipotesi alla volta, dichiarata prima, nessuna caccia a correlazioni tra tutto e tutto.
- "Chiedi all'assistente" condivide dati già calcolati, con un prompt che vincola il chatbot a quei dati.

**Cosa Kentu non dice mai:** diagnosi, "stato infiammatorio", "carenza", "anni di vita guadagnati", rischio di una malattia specifica. Parla di stile di vita e di andamento. Il confine con i dispositivi medici (normativa europea) va verificato con un esperto prima della pubblicazione.

## Linguaggio visivo e brand

Blu per la rotta, arancio per la deriva, nero per i buchi: lo stesso significato in tutta l'app.

**Colori con significato:**

- **blu** = sulla rotta (giorni, pallini dei cilindri, zona anti dell'ago, "Bene" nel rapporto). Il verde non si usa più come "positivo";
- **giallo** = a metà; **arancio e rosso** = fuori rotta; **nero** = non registrato; **grigio** = pausa o dato assente;
- **ciano** (#22D3EE) = azione, giorno in corso, pulsanti. Deve restare chiaramente diverso dal blu dei giorni: da verificare su un telefono vero, in piena luce;
- blu e arancio sono anche la coppia più leggibile per chi distingue male rosso e verde (circa un uomo su dodici).

**Colori delle aree** (icone nei cerchi): alimentazione arancio, sonno viola, forza verde, cardio ciano. Ogni cilindro ha sempre la stessa icona e lo stesso colore, in Focus, diario e timeline.

**Temi.** Scuro come predefinito, coerente con il resto dell'app; chiaro disponibile con lo switch in alto, salvato in `ui_preferences`.

**Tono.** Seconda persona, diretto, mai consolatorio né da cartolina. "Hai cenato alle 21:46", non "Spunto di riflessione". Frasi brevi, numeri veri, formati italiani (6 h 30, virgola decimale).

**Il brand, presente ma non dichiarato:**

| Elemento | Dove vive |
| --- | --- |
| Kentu = cento | nome; spiegato una volta, nell'onboarding |
| Il blu delle Blue Zones | calendario e tutti gli stati positivi; una riga di legenda e una frase nell'onboarding: "Il blu è il colore delle Blue Zones, i luoghi dove si vive più a lungo. La Sardegna è una di queste." |
| Paesaggi dell'entroterra sardo | immagini del Focus, scelte dal codice in base a periodo ed esito; generate con un prompt fisso, mai luoghi riconoscibili |
| "A kent'annos" | solo ai traguardi (un mese blu, un esperimento riuscito, il compleanno); una sola grafia in tutta l'app |
| Costanza e moderazione | il salvavita, il riposo come obiettivo, nessun premio all'eccesso |

Nomi per l'utente: solo **Kentu**; KentuOS resta un nome interno.

## Perimetro della v1

La v1 punta su dati affidabili e onestà sull'incertezza, non sul numero di funzioni: le funzioni più ambiziose arrivano quando ci sono abbastanza dati per renderle credibili. Piattaforme: Android e web; iOS escluso per ora.

**Nella v1**

- [ ] Audit dello storico (alimenti composti al posto di quelli semplici) e correzione delle voci sbagliate
- [ ] Giorno chiuso nel check-in del mattino, con energia al risveglio e qualità del sonno
- [ ] Condimenti suggeriti alla registrazione di un piatto
- [ ] Copertura dei dati visibile; buchi neri, recupero entro 48 ore, pausa dichiarata
- [ ] Punteggio del giorno deterministico e versionato, dai quattro cilindri
- [ ] Focus con calendario: Giorno (su ieri), Settimana, Mese; quattro cilindri; una sola azione
- [ ] Salvavita con soglie documentate
- [ ] Periodo di taratura di 1-2 settimane per i nuovi utenti, che fissa la linea di partenza
- [ ] Generazione automatica del rapporto al mattino, con notifica locale
- [ ] Spegnimento delle vecchie superfici di feedback (Focus Metabolico in chat, Health Analyzer, report dal tasto ALL, longevity legacy)
- [ ] Crash reporting ed eventi chiave; privacy e GDPR per i dati sanitari; verifica del confine con i dispositivi medici; Play Console

**Dopo la v1**, in quest'ordine indicativo:

1. misure del corpo (vita, peso, frequenza a riposo) e la vista Mese "Cosa hai ottenuto";
2. ago del potenziale infiammatorio, con la tabella dei fattori, pesi e fonti;
3. vista Anno;
4. esperimenti personali e proiezioni;
5. "Chiedi all'assistente" (condivisione verso il chatbot) e importazione dei pasti dal chatbot nell'Inbox;
6. connettore MCP e integrazione con Gemini sul telefono (AppFunctions), quando Google la aprirà;
7. prova alla cieca di un modello di fascia alta per il Focus.

**Prossimo passo concreto:** l'audit dello storico, che è in attesa e condiziona l'affidabilità di tutto il resto.
