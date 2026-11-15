# Metodo kds-3

Questo è il modo in cui Kentu dà un punteggio al giorno. Il numero è sempre lo stesso a parità di dati: non lo scrive un modello, e un parere «Ti torna?» non lo sposta. La versione si chiama **kds-3** e sostituisce kds-2.

Fino al lancio lo storico si ricalcola quando il metodo cambia. Dopo il lancio vale la regola delle versioni: un giorno salvato con un metodo diverso resta com'è finché non si decide di riscriverlo. La funzione di migrazione esiste e non parte da sola.

Il punteggio sta fra 0 e 1. Può anche mancare. Manca quando il giorno è nel futuro, è ancora in corso, è un buco, oppure è una pausa dichiarata. Manca anche quando meno di due pilastri fra alimentazione, sonno e movimento hanno un dato.

L'affidabilità è **bassa** se il giorno non è ancora confermato, se è segnato come approssimato, o se ha un buco evidente. Negli altri casi è **alta**.

Le durate si scrivono «6 h 40» e «1 h 35». Sotto un'ora si scrive «58 min», non «0 h 58». Un'ora intera resta «7 h». Se il sonno non è registrato, il fatto è «non registrato».

I pesi stanno in `scoreConfig.kds-3.js`.

## Pilastri sempre attivi

Nell'interfaccia i quattro elementi si chiamano pilastri: Alimentazione, Sonno, Movimento, Forza. La media usa solo i primi tre. Un pilastro senza dato esce e i pesi rimasti tornano a somma 1.

### Alimentazione — peso 0,45

Si guarda lo scostamento assoluto dall'obiettivo, sia in meno sia in più.

- Entro il 10%, 10% compreso: valore 1, pallino sulla rotta.
- Da lì fino al 35% il valore scende in linea retta fino a 0,15. Il pallino è a metà.
- Dal 35% in poi il valore resta 0,15 e il pallino è fuori rotta.

Se c'è almeno un ultra-processato sfavorevole, il valore si moltiplica per 0,8. Il pallino non cambia per questo. È sfavorevole quando il profilo Nutri-Score è D o E, oppure la porzione ha almeno 15 g di zuccheri o 5 g di grassi saturi. Il cioccolato fondente dal 70% in su non conta. Se il profilo non c'è, non si inventa una critica.

Il ritmo sta qui. Se l'ultimo pasto dista meno di 2 ore dall'addormentamento, il valore scende di 0,15 e non va sotto zero. L'orario vale se è registrato o ricavato. Se manca, lo sconto non scatta.

Se manca il cibo o manca l'obiettivo, il pilastro non ha un dato.

`energy_low_day` è citato sotto l'obiettivo di più del 25%. `heavy_late_meal` è citato quando la cena è abbondante secondo la regola già in uso. Quei segnali non spostano da soli il valore.

### Sonno — peso 0,30

La notte del giorno D è quella registrata la mattina dopo, il giorno D+1. Se manca la durata, il fatto è «non registrato». Non si ripesca la notte precedente.

- Fra 7 e 9 ore, estremi compresi: valore 1, pallino sulla rotta.
- Sotto le 7 ore il valore scende fino a 0,15 a 5 ore. Fra 5 e 7 il pallino è a metà. A 5 ore o meno è fuori rotta.
- Sopra le 9 ore lo specchio, fino a 0,15 a 11 ore.

La distanza dall'ultimo pasto non entra nel sonno.

La qualità entra solo se è registrata. Cinque e quattro stelle non muovono il numero. Tre lo moltiplicano per 0,9, due per 0,8, una per 0,7.

### Movimento — peso 0,25

Sostituisce il cardio, anche nel nome della barra in Home, Hub e cruscotto: lì si chiama Movimento. I minuti sono equivalenti moderati, come nell'indicazione OMS: la camminata vale i suoi minuti, un'attività vigorosa vale il doppio. I pesi non entrano.

La definizione è una sola, in `workoutMovement.js`: camminata ×1, corsa, bici, nuoto, ellittica, cardio, HIIT e remo ×2. La barra la applica sulle ultime 168 ore. Il Focus la applica sui giorni chiusi, con la stessa funzione. Il lettore delle sessioni è uno solo, `collectRecentWorkoutLogs`: il log del diario, deduplicato per id, senza `manualNodes`.

Il tipo della sessione (`workoutType`) decide la classe. Il nome serve solo se il tipo manca. Una sessione senza nome e con tipo `camminata` è una camminata.

La durata esplicita è `durationMinutes`, e da ora le sessioni nuove la salvano. Se c'è, si usa quella. Se manca, vale la regola già in uso: un numero sopra 5 è in minuti, altrimenti è in ore. Così 0,5 resta mezz'ora, 20 resta venti minuti e 90 resta novanta minuti.

- Camminata, passeggiata, walking: ×1.
- Corsa, bici, nuoto, ellittica, cardio, HIIT e remo: ×2.

Il valore del giorno è la somma di due metà:

- metà è la camminata di oggi divisa per il riferimento giornaliero, mai sopra 1;
- metà sono i minuti equivalenti degli ultimi 7 giorni, oggi compreso, divisi per 150, mai sopra 1.

Il riferimento giornaliero è 30 minuti. Quando per quel giorno ci sono i passi, il riferimento diventa 8.000 passi sotto i 60 anni e 6.500 dai 60 in su. L'età si legge dal profilo. Se l'età manca, si usano gli 8.000. I passi non ci sono ancora nel diario: il campo è pronto (`steps` sul giorno, oppure un log `steps` / `passi`) e, se un giorno è compilato, comanda la camminata di quel giorno.

L'ordine delle fonti, per la camminata di oggi, è: passi, attività registrate, stima del check-in. La stima non entra se quel giorno ha già una camminata o un'attività vigorosa nel diario.

Il check-in del mattino chiede «Ieri quanto hai camminato?» con tre risposte: Poco (10 min), Circa mezz'ora (30 min), Un'ora o più (60 min). Il valore è marcato stimato.

Il pallino: da 0,75 in su sulla rotta, da 0,40 a 0,75 a metà, sotto fuori rotta. Zero minuti, con un diario leggibile, è un dato: è fuori rotta, non un'assenza.

## Forza, solo se attiva (Costanza mm-1)

L'impostazione è `users/{uid}/cylinders/forza/enabled`. Se è disattivata, la forza non è una penalità: non entra nel numero e la riga è grigia, «Forza · non attiva».

Obiettivo settimanale opzionale: `users/{uid}/cylinders/forza/weeklyGoalDays` (2|3|4, default **2**).

Se è attiva:

- non entra lo stesso nel punteggio del giorno;
- l'UI e il Focus leggono un solo calcolo **Costanza** (`mm-1`): chip del catalogo → muscoli fini con peso 1 (allenato) o 0,5 (coinvolto); merge per sessione `max(pesi)`; Total Body tocca tutti a 0,5; scale/alzate dalla sedia senza chip → Gambe via mappa;
- header: giorni di forza nella settimana lun–dom / obiettivo + scia di settimane (la settimana in corso non spezza la scia);
- copertura 7 giorni per gruppo (Petto, Schiena, Spalle, Braccia, Gambe, Core): **coperto** / **toccato** / **vuoto**; «allenato X giorni fa» conta solo peso 1;
- copy onesta: «Conta i giorni e i gruppi allenati, non le serie.»

`forceIntensity` (**force-ci-1**) = `0.5 * min(1, giorniForzaSett / obiettivo) + 0.5 * (gruppiCoperto7g / 5)` con i 5 gruppi del quoziente blu **Petto, Schiena, Spalle, Gambe, Core** (Braccia solo in UI). Gate invariato: forza on e score giorno ≥ 0,75; altrimenti 0. Solo colore.

Salvavita **sfv-3**: `same_district_no_recovery` sullo stesso **muscolo** allenato (peso 1) entro 48h. Fatica sistemica fourCylinder invariata.

Contano anche le forme quotidiane, registrabili accanto ai pesi: corpo libero, elastici, lavori pesanti, scale, alzate dalla sedia.

## Colore

Lo score percorre una scala continua dall'arancio-rosso (`#C2410C`) al blu chiaro (`#93C5FD`). `forceIntensity` sposta quel blu verso il blu elettrico (`#2563EB`), e solo se il giorno è già almeno a 0,75. La forza non può rendere blu una giornata che non lo è. Un punteggio assente resta nero.

## Giorni sulla rotta, scie, media

Un giorno è sulla rotta quando il punteggio è almeno 0,75. La media del periodo usa i giorni passati chiusi o recuperati, e manca se coprono meno del 60%. La scia chiede almeno tre giorni sulla rotta. Un buco, una pausa, un punteggio assente o un giorno sotto 0,50 la interrompono. Un solo giorno fra 0,50 e 0,75 la mette in pausa.

## Cosa viene ricordato

`users/{uid}/focus_day_scores/{data}`: versione `kds-3`, punteggio, `forceIntensity`, affidabilità, pilastri, impronta dei fatti. Il campo salvato si chiama ancora `cylinders`: è il nome del record, non quello che si legge nell'interfaccia.

`users/{uid}/movement_checkin/{data}`: la stima della camminata, sempre con `estimated: true`.

`users/{uid}/score_feedback/{data}`: il parere «Ti torna?». Non rientra nel calcolo.

`users/{uid}/cylinders/forza/enabled`: se la forza è accesa per quella persona.

`users/{uid}/cylinders/forza/weeklyGoalDays`: obiettivo giorni di forza a settimana (2|3|4).
