# Modello Kentu

Nov 12, 2026 · @Marco

Kentu mostra all'utente gli effetti del proprio stile di vita, giorno dopo giorno, con un'evidenza che non si può contestare perché dichiara sempre da dove viene e quanto è sicura. Questo documento è il riferimento per prodotto, codice e prompt dell'AI.

## Visione

Yazio e MyFitnessPal aiutano a registrare. Kentu mostra **cosa stanno facendo le tue abitudini**. Le rinunce si sostengono solo se si vede che servono: per questo ogni funzione deve rispondere a una domanda, "che effetto ha quello che faccio?".

Tre principi guidano ogni scelta:

- **Rotta ogni giorno, effetti nel tempo.** Il ritorno è quotidiano (sei nella direzione giusta?), gli effetti misurati arrivano in settimane e mesi. Come la goccia sulla roccia: una non scava, tutte insieme sì.
- **Costante è meglio di più.** Il modello sono i centenari sardi: persone moderate e costanti per decenni, non atleti estremi né persone a dieta. Kentu non premia mai l'eccesso.
- **Onestà anche quando la notizia è cattiva.** Uno strumento si guarda perché ci si fida della lettura. Un'app che mostra sempre progressi per motivare perde credibilità, e con lei la motivazione.

Il valore per cui l'utente paga: dati affidabili, memoria lunga delle abitudini, un giudizio coerente nel tempo e un rapporto che arriva da solo ogni mattina. I chatbot conversano meglio; Kentu ricorda, misura e parla per primo.

## I quattro pilastri

Lo stile di vita si legge su quattro pilastri, più una misura del corpo. Il colore di una giornata nasce da alimentazione, sonno e movimento, sempre attivi; la forza, a scelta, rende il blu più intenso. Ogni pilastro ha quattro livelli: la **rotta** (cosa hai fatto, ogni giorno), i **segnali rapidi** (cosa senti in pochi giorni), gli **effetti** (cosa è cambiato in settimane e mesi), i **limiti** (le soglie del salvavita).

| Pilastro | Attivo | Rotta (ogni giorno) | Segnali rapidi | Effetti misurati | Riferimenti |
| --- | --- | --- | --- | --- | --- |
| Alimentazione | sempre | energia rispetto all'obiettivo; qualità (ultra-processati sfavorevoli, fibra, integrali, pesce azzurro, olio extravergine); ritmo (cena abbondante o a meno di 2 ore dal sonno) | fame, digestione | peso (media mobile), vita, esami del sangue | obiettivo dal profilo, poi ricalibrato sui dati reali; LARN |
| Sonno | sempre | durata e orari | qualità ed energia al risveglio (check-in) | frequenza cardiaca a riposo, regolarità | da 7 a 9 ore |
| Movimento | sempre | camminata di oggi e minuti equivalenti degli ultimi 7 giorni (camminata ×1, attività vigorosa ×2, pesi esclusi) | fiato, fatica percepita | frequenza a riposo, tempo sullo stesso percorso | 30 minuti al giorno o 8.000 passi sotto i 60 anni, 6.500 dai 60; 150 minuti a settimana |
| Forza | a scelta | macro-gruppi allenati negli ultimi 7 giorni (parte alta, parte bassa, core facoltativo); carica dallo stimolo muscolare del cruscotto | indolenzimento | carichi; alzate dalla sedia in 30 secondi, equilibrio su una gamba | 2 giorni a settimana; dai 65 anni "Forza ed equilibrio" |
| Corpo | misura | — | — | rapporto vita/altezza, una misura a settimana | sotto 0,5 |

**Si giudica solo ciò che l'utente ha scelto, più la base per tutti.** Alimentazione, sonno e movimento valgono per chiunque. La forza si attiva nell'onboarding o nelle impostazioni: se non è attiva non compare e non penalizza. Kentu può ricordarne il valore al massimo una volta al mese, nella lingua dell'obiettivo della persona (a un corridore: meno infortuni, corsa migliore), con un pulsante "Non mi interessa" che lo fa smettere.

**La forza non è solo pesi.** Contano corpo libero, elastici, scale, alzate dalla sedia, lavori pesanti. I centenari sardi non hanno mai sollevato un bilanciere, ma hanno usato il corpo ogni giorno.

**Una sola fonte di verità.** Movimento e stimolo muscolare si leggono dagli stessi dati in cruscotto, Home e Focus: un unico lettore delle sessioni, il tipo di attività preso dal campo workoutType, la durata salvata in minuti.

**Il movimento si misura senza fatica.** Oggi: una domanda nel check-in del mattino ("Ieri quanto hai camminato?"), marcata come stima. Poi: i passi letti da Health Connect.

**Test mensili, a casa, in due minuti:** alzate dalla sedia in 30 secondi, secondi in equilibrio su una gamba, tempo per salire una rampa di scale. Sono effetti misurati, comprensibili a ogni età.

**L'orologio degli effetti** va dichiarato fin dall'onboarding:

1. in pochi giorni: sonno, energia, digestione;
2. in 1-3 settimane: andamento del peso, frequenza a riposo;
3. in 3-6 settimane: vita, forza, ritmo nella camminata o nella corsa;
4. in 2-3 mesi: composizione corporea, esami del sangue.

**Le evidenze più forti sono quelle personali**: il "conto delle gocce" (i comportamenti sommati rispetto alla propria linea di partenza) e gli esperimenti personali (i propri periodi a confronto, un'ipotesi alla volta, con il coraggio di dire "non è ancora chiaro"). Le misure di effetto si mostrano in unità vere, come prima → dopo: centimetri, chili, battiti, minuti.

## Il Focus e il calendario

Il Focus si apre con il calendario e risponde a colpo d'occhio a "come sto andando?", senza scorrere e senza toccare niente. Tutto il resto è un livello sotto, a un tocco.

**Struttura della pagina**, uguale per ogni periodo:

1. schede Giorno · Settimana · Mese (l'Anno arriva dopo la v1);
2. intestazione del periodo: pallino aggregato con il colore medio e lo stato a parole (sulla rotta, a metà, fuori rotta, dati insufficienti, in corso);
3. calendario: striscia di 7 giorni (Giorno, Settimana), griglia del mese di calendario con le scie (Mese);
4. titolo del periodo, in seconda persona: sui periodi sulla rotta prima ciò che è andato bene, poi il punto da migliorare;
5. righe dei pilastri attivi (icona, una frase, pallino), apribili per il dettaglio; nei periodi i dati sono aggregati (medie, giorni fuori fascia, sessioni per macro-gruppo);
6. una sola azione, con quantità e momento; card di sostegno quando serve;
7. "Ti torna?" (solo nella vista Giorno) e "Perché te lo dico" (approfondimento, limiti, metodo, linea di partenza, Rigenera).

**Si apre sull'ultimo periodo completo**: Giorno su ieri, Settimana sull'ultima settimana conclusa, Mese sull'ultimo mese concluso. Il periodo in corso è a una freccia di distanza. Oggi è "in corso": bordo tratteggiato, nessun colore, "Il giudizio arriva domattina".

**Il punteggio del giorno (metodo kds-3)** è deterministico e versionato; lo calcola il codice, mai l'AI.

- Ogni pilastro ha un punteggio continuo da 0 a 1. Alimentazione: 1 entro ±10% dell'obiettivo, poi scende fino a 0,15 a ±35%; −0,15 per una cena abbondante o a meno di 2 ore dal sonno (insieme al massimo −0,20); ×0,8 con un ultra-processato sfavorevole. Sonno: 1 tra 7 e 9 ore, fino a 0,15 a 5 ore. Movimento: metà camminata di oggi, metà minuti equivalenti dei 7 giorni su 150.
- Punteggio del giorno = media pesata di alimentazione (0,45), sonno (0,30) e movimento (0,25). La forza non entra nella media.
- Stato di ogni pilastro e del giorno dallo stesso punteggio: da 0,75 sulla rotta, da 0,45 a 0,75 a metà, sotto 0,45 fuori rotta.
- Intensità della forza = distretto più acceso delle barre dello stimolo muscolare diviso 0,65, fino a 1. Vale solo sui giorni sulla rotta e con la forza attiva: una sessione di pesi non rende blu una giornata storta. Lo stimolo sfuma nei giorni dopo l'allenamento, e il calendario mostra "onde" di blu intenso.

**I colori** sono una scala divergente senza verde né ciano, calcolata in OKLab: arancio-rosso, ambra, sabbia chiaro a metà, azzurro, blu profondo; con la forza il blu si spinge fino al blu elettrico.

| Stato | Aspetto | Significato |
| --- | --- | --- |
| Sulla rotta | dall'azzurro al blu profondo, più intenso con la forza | giornata positiva |
| A metà | ambra e sabbia | qualcosa ha funzionato, qualcosa no |
| Fuori rotta | dall'arancio al rosso | giornata negativa |
| Non confermato | stesso colore, meno pieno | dati presenti ma giorno non confermato nel check-in |
| Buco | nero, con bordo e ombra interna | giorno non registrato |
| Pausa | grigio con icona | pausa dichiarata |
| In corso | bordo tratteggiato ciano | oggi |

**Buchi, recupero, pausa.** Un giorno non registrato è un buco nero e interrompe la scia: registrare fa parte della routine. Registrato entro 48 ore, il buco si riempie con il segno "registrato dopo"; "ricordato a grandi linee" lo riempie con peso minore. La pausa dichiarata (vacanza, malattia) non è un buco. Al ritorno Kentu accoglie, non rimprovera.

**Le scie**: almeno 3 giorni di fila sulla rotta, sottolineati; un buco interrompe, un solo giorno a metà mette in pausa. Accanto si mostrano sempre i giorni sulla rotta del periodo; senza scie: "Nessuna scia ancora".

**Affidabilità.** I giorni non confermati contano nelle medie con peso 0,8 e affidabilità media (una riga nei limiti). Affidabilità bassa, con titolo prudente, solo per giorni con buchi evidenti o ricordati a grandi linee. I pallini dei periodi si calcolano sui giorni con dati; sotto il 60% di copertura: "dati insufficienti".

**L'azione.** Il pilastro lo sceglie il codice: un segnale del salvavita, altrimenti l'impatto più alto, cioè (1 − punteggio) × peso. Nella vista Giorno conta l'acuto (il movimento di oggi), nei periodi il cronico. Dopo due giorni sullo stesso pilastro si passa a un altro, ma solo se non è sulla rotta; se tutto va bene, l'azione è di mantenimento. L'azione chiude almeno un terzo della distanza dal riferimento (mai oltre la metà), con una quantità e un momento. Per un periodo concluso riguarda il periodo successivo ("La prossima settimana…", "A novembre…").

**"Ti torna?"** Ogni mattina l'utente può dire se il giudizio di ieri gli torna. Le risposte non cambiano il punteggio: si rivedono periodicamente per tarare il metodo, distinguendo "il motore sbaglia" da "il riferimento non piace".

**Taratura e linea di partenza.** I primi 14 giorni con dati (al massimo 28 di calendario) sono "taratura": colori visibili, nessun giudizio netto, nessuna scia, salvavita sempre attivo. Alla fine Kentu calcola la linea di partenza (calorie medie e giorni fuori fascia, sonno, movimento, forza, orario dell'ultimo pasto, copertura), la mostra una volta e la usa come riferimento per tutti i confronti futuri.

**Rapporto al mattino.** Alla prima apertura del giorno Kentu prepara il rapporto di ieri (il lunedì anche la settimana, il primo del mese anche il mese), al massimo una volta per periodo. Una notifica locale, mezz'ora dopo il risveglio abituale, invita ad aprirlo.

## Il potenziale infiammatorio

Kentu stima il **potenziale infiammatorio dello stile di vita**, non lo stato infiammatorio della persona, che si misura solo con gli esami. Il concetto è studiato in letteratura e verificato contro marcatori nel sangue (PCR, interleuchine): nel Dietary and Lifestyle Inflammation Score (Journal of Nutrition, 2019) il fattore singolo più pesante è l'obesità, più di qualunque alimento.

**Lo strumento** è un indicatore a zero centrale, come un voltmetro: ago a sinistra = tendente anti, al centro = neutro, a destra = tendente pro. Stessa scala del calendario: blu a sinistra, sabbia al centro, arancio a destra. L'ago è **smorzato** da una media mobile di 4 settimane (7 giorni nel Focus di Giorno e Settimana), così una giornata storta non lo fa saltare. Un ago tratteggiato mostra il periodo precedente. Un **alone** attorno all'ago mostra l'incertezza: più dati stimati, alone più largo. Sotto, "Cosa muove l'ago": ogni fattore è una barra che parte dal centro, verso sinistra o verso destra.

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
| Attività fisica regolare | Movimento, Forza | anti |  |
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

Il salvavita (metodo sfv-2) è un livello di controlli deterministici che scatta quando qualcosa supera una soglia, qualunque cosa dica l'AI. Kentu deve saper dire "rallenta" e trattare il riposo come un obiettivo, non come un passo indietro. Usa solo giorni chiusi, mai i giorni in pausa.

| Segnale | Soglia iniziale | Livello | Cosa fa Kentu |
| --- | --- | --- | --- |
| Deficit protratto | media degli ultimi 7 giorni sotto il 75% dell'obiettivo | osservazione | segnalazione nel rapporto |
| Giorni molto bassi ripetuti | almeno 3 giorni sotto il 60% in 7, o 2 sotto il metabolismo basale | intervento | la giornata non può essere blu; invito a rallentare il deficit |
| Peso in calo rapido | oltre l'1% a settimana per 2 settimane (con almeno 4 pesate in 14 giorni) | intervento | invito a rallentare |
| Proteine basse in deficit | deficit oltre il 10% e proteine sotto 1,2 g/kg | osservazione | segnalazione nell'alimentazione |
| Nessun riposo | 6 giorni di fila con pesi o attività vigorosa (8: intervento) | osservazione / intervento | proposta di riposo |
| Stesso distretto senza recupero | meno di 48 ore, 2 volte in 7 giorni | osservazione | proposta di alternare |
| Picco di carico | minuti settimanali di pesi e attività vigorosa oltre il 150% della media delle 4 settimane prima | osservazione | proposta di gradualità |
| Sovraccarico | nessun riposo o picco di carico, più due tra: sonno sotto 6 ore, energia al risveglio ≤ 2, qualità del sonno ≤ 2 (2 volte su 3) | intervento | "rallenta", settimana di scarico trattata come un successo |
| Restrizione | almeno 5 giorni sotto il 60% dell'obiettivo o sotto il basale in 14 | intervento | nessun numero su calorie e peso, card di sostegno che propone un confronto con un professionista |

Le soglie sono valori iniziali prudenti, in un file di configurazione versionato: prima del lancio vanno riviste da un professionista. La fatica sistemica del vecchio motore muscolare non è usata finché non viene ricalibrata.

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

**Sicurezza e dati di prova.** Le chiavi API vivono solo come segreti del server, mai nel codice; un controllo prima di ogni commit blocca le chiavi; il repository è privato. Le verifiche si fanno sull'emulatore con un utente di prova e un diario finto realistico: i dati reali degli utenti non entrano mai nel repository.

## Linguaggio visivo e brand

Blu per la rotta, arancio per la deriva, nero per i buchi: lo stesso significato in tutta l'app.

**Colori con significato:**

- **blu** = sulla rotta (giorni, pallini, zona anti dell'ago); più intenso con la forza, fino al blu elettrico;
- **ambra e sabbia** = a metà; **arancio e rosso** = fuori rotta; **nero** = non registrato; **grigio** = pausa o dato assente;
- **ciano** (#22D3EE) = azione, giorno in corso, pulsanti; non compare mai nella scala dei giorni;
- il **verde** non significa più "positivo": resta solo come colore dell'icona della forza;
- blu e arancio sono la coppia più leggibile anche per chi distingue male rosso e verde.

**Icone dei pilastri** (sempre uguali in Focus, diario, Home e cruscotto): alimentazione arancio, sonno viola, movimento ciano, forza verde.

**Temi.** Scuro come predefinito, chiaro con lo switch in alto.

**Tono.** Seconda persona, diretto, mai consolatorio né burocratico: "Hai cenato alle 21:46", non "Introito registrato". Niente titoli che giustificano un segnale negativo. Una sola leva per azione. Formati italiani (6 h 30, virgola decimale, "obiettivo" e non "target").

**Il brand, presente ma non dichiarato:**

| Elemento | Dove vive |
| --- | --- |
| Kentu = cento | ultima schermata dell'onboarding, con un paesaggio dell'entroterra sardo: "Kentu vuol dire cento, in sardo. Il blu che vedrai nell'app è il colore delle Blue Zones, i luoghi dove si vive più a lungo: la Sardegna è una di queste." |
| Il blu delle Blue Zones | calendario e tutti gli stati positivi; una riga di legenda sotto il calendario |
| Paesaggi dell'entroterra sardo | immagini generate con un prompt fisso, mai luoghi riconoscibili, scelte dal codice in base a periodo ed esito (public/focus/) |
| "A kent'annos" | solo ai traguardi; una sola grafia in tutta l'app |
| Costanza e moderazione | salvavita, riposo come obiettivo, nessun premio all'eccesso |

**Nomi.** Per l'utente solo **Kentu**: "KentuOS", "Battesimo", "motore metabolico" e simili restano interni. Nel Focus i quattro elementi si chiamano pilastri; "cilindri" resta il nome interno del motore muscolare. La vecchia mascotte è stata tolta dall'onboarding (ricordava un virus ed era verde): al suo posto il simbolo di Kentu o i paesaggi.

## Perimetro della v1

La v1 punta su dati affidabili e onestà sull'incertezza, non sul numero di funzioni. Piattaforme: Android e web; iOS escluso per ora. Al 12 novembre il Focus della v1 è completo; restano i lavori sui dati storici, sulla Home e sulla pubblicazione.

**Fatto**

- [x] Ricerca degli alimenti corretta (corrispondenza esatta prima dei piatti composti, nomi italiani di CREA)
- [x] Stato del giorno, check-in del mattino (giorno chiuso, sonno, energia, camminata), pausa, recupero entro 48 ore
- [x] Punteggio del giorno kds-3 con i pilastri, intensità della forza, una sola fonte di verità con il cruscotto
- [x] Salvavita sfv-2
- [x] Schema AI v5: stati dal codice, parole dall'AI, validatore
- [x] Focus con calendario (Giorno, Settimana, Mese), scala arancio-sabbia-blu, buchi, scie, temi scuro e chiaro
- [x] "Ti torna?"
- [x] Rapporto al mattino e notifica locale
- [x] Spegnimento delle superfici legacy con feature flag
- [x] Condimenti suggeriti, taratura e linea di partenza, onboarding dei pilastri e racconto del nome
- [x] Emulatore con utente di prova e diario finto realistico

**Da fare prima della pubblicazione**

- [ ] Le tre immagini mancanti (mese buono, mese irregolare, riserva)
- [ ] Audit dello storico (alimenti composti al posto di quelli semplici) e correzione delle voci sbagliate
- [ ] Riallineare la Home al Modello: via l'arco del punteggio di longevità e le frasi metaboliche a tempo, blu come colore positivo, collegamento al Focus
- [ ] Prova sul telefono: notifiche, permessi, build Android
- [ ] Sicurezza: repository privato, verifica di chi ha distrutto le versioni del segreto, limiti sulle chiavi Firebase
- [ ] Crash reporting ed eventi chiave; privacy e GDPR per i dati sanitari; verifica del confine con i dispositivi medici; Play Console con le dichiarazioni necessarie
- [ ] Revisione delle soglie del salvavita da parte di un professionista

**Dopo la v1**, in ordine indicativo:

1. passi da Health Connect e misure del corpo (vita, peso, frequenza a riposo), con la vista Mese "Cosa hai ottenuto";
2. test mensili (alzate dalla sedia, equilibrio, scale) e modalità semplice per gli utenti più anziani;
3. ago del potenziale infiammatorio, con la tabella dei fattori, dei pesi e delle fonti;
4. vista Anno;
5. esperimenti personali e proiezioni;
6. "Chiedi al tuo assistente" (condivisione verso il chatbot) e importazione dei pasti dal chatbot nell'Inbox;
7. connettore MCP e Gemini sul telefono (AppFunctions), quando Google lo aprirà;
8. ricalibrazione della fatica sistemica e passaggio della mappa metabolica alle barre dello stimolo muscolare;
9. prova alla cieca di un modello di fascia alta per il Focus.

**Prossimo passo concreto:** l'audit dello storico, che condiziona l'affidabilità delle linee di partenza.
