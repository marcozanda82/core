# Piano di attuazione — Modello Kentu

10 nov 2026. Confronto tra `docs/MODELLO_KENTU.md` (approvato) e il codice attuale. Nessuna modifica di codice è stata fatta per produrre questo documento.

Vincolo di implementazione: **non far crescere `src/SalaComandi.jsx`**. La logica nuova vive in moduli dedicati; SalaComandi al massimo riceve un collegamento già esistente (props, import di un hook). Dove il dato oggi nasce dentro SalaComandi, il piano dice di estrarre, non di aggiungere.

Legenda: **esiste** = c’è nel codice e si può riusare; **adattare** = c’è ma il significato non coincide col Modello; **manca** = non c’è. Dove il codice non permette di decidere, è scritto **NON DETERMINABILE**.

---

## 1. Mappa per sezione del Modello

### 1.1 I quattro cilindri

Il prodotto oggi non ha quattro cilindri. Il Focus ha cinque aree in `src/features/kentuFocus/product/focusAreas.js` (`FOCUS_AREAS`): Energia, Qualità, Ritmo, Sonno, Movimento. Forza e cardio sono fusi in Movimento. Il corpo non è un cilindro: peso e vita stanno nel cruscotto Salute e in `body_metrics`.

| Cilindro del Modello | Cosa esiste | Cosa adattare | Cosa manca |
| --- | --- | --- | --- |
| Alimentazione — energia | Totali kcal del diario; target in `userTargets.kcal`. `scoreProgressionNutritionDay` (`src/features/trendHub/utils/saluteDashboardMetrics.js`) dà un punteggio 0–1 (60% kcal, 40% proteine) solo se kcal ≥ soglia. `assessEnergyIrregularity` (`focusEnergyVariability.js`) segnala giorni oltre ±banda sul target. | Il punteggio premia la vicinanza al target, non «costante meglio di più». Un deficit grande può risultare «buono» se le proteine ci sono. Non è il punteggio del giorno del Modello. | Scala continua blu/giallo/arancio sul giorno; veto del salvavita sul deficit eccessivo. |
| Alimentazione — qualità | `buildFocusFoodQualityBlock.js`: NOVA, ruoli verdura/frutta/legume/integrale da catalogo o da nome, ultra-processati «critique-worthy» via `assessNova4CritiqueProfile.js`. Fibre e omega-3/6 se presenti sulla voce di diario (`canonicalMealCommit.js`, chiavi nutrienti). | I ruoli da nome sono euristiche, non un fattore con peso e fonte. Omega-6 spesso assente: il codice non stima la fonte di grassi. | Fattori nominati dal Modello come barre (pesce azzurro, EVOO, cacao, omega-6:3, sodio:potassio, alcol oltre il moderato) con peso documentato. Cache «stimato» sulla fonte di grassi. |
| Alimentazione — orari | Orario voce (`mealTime` / `time`) e orari slot sul nodo giorno. `resolveFoodClockHourDetailed` (`focusMealSlots.js`). Primo e ultimo pasto in `buildFocusDeterministicSignals.js` (`pickExtremeMealHour`). | L’orario mancante su una voce può cadere su un default (in `getDayLastMealTime` di `dayTrackingStatus.js` l’ora assente diventa 20). Non è dichiarato all’utente. | Distanza primo/ultimo pasto come rotta quotidiana del cilindro, con provenienza visibile. |
| Sonno — durata e orari | Voce `type: 'sleep'` scritta da `commitLogSleepCommand` in `SalaComandi.jsx`: `hours`, `duration`, `sleepHours`, `wakeTime`, `bedtime` / `sleepStart` calcolati come wake − ore. Lettura Focus: `normalizeSleepNight.js`, `resolveMainNightSleep.js`. Soglia < 7 h già in `buildFocusDeterministicSignals` (`sleep_under_7h`). | `deepMin` e `remMin` sono spesso 60/60 di segnaposto: `normalizeSleepNight.js` li marca `missing` se non c’è indizio wearable. Il bedtime è spesso `derived`, non registrato. | Check-in del mattino che chieda durata e orari come fatti, distinto dalla stima. |
| Sonno — qualità soggettiva | `commitLogSleepCommand` accetta `sleepQuality` 1–5 (stelle) e, in alternativa, `qualityScore` wearable. Si salvano `quality` e `sleepQuality`. | Non c’è un check-in mattutino che le chieda insieme all’energia al risveglio. **NON DETERMINABILE** quante notti reali abbiano il campo compilato: dipende dai dati utente, non dal codice. | Energia al risveglio. Il campo non compare in `commitLogSleepCommand`. |
| Forza | Scheda attività: `handleSaveWorkout` in `useWorkoutManager.js` salva `muscles` (via `normalizeMuscleGroupArray` in `activityCatalog.js`), `workoutType`, `duration`, `time`, `kcal`, `rpe`, `workoutGoal`, e il testo libero `workoutDetailNote`. Il Focus legge i gruppi con `extractRecordedMuscleGroups` (`normalizeWorkoutEvents.js`). | Carichi e ripetizioni della scheda pesi **non** sono campi strutturati: la UI (`WorkoutView.jsx`, etichetta «Carichi, serie e ripetizioni») è una textarea salvata in `workoutDetailNote`. Il percorso chat (`mapChatWorkoutToNativePayload` in `workoutAdapter.js`) salva invece `exercises[]` con `sets`, `reps`, `weightKg`. Due forme diverse. | Serie di carichi confrontabili nel tempo; «giorni dall’ultimo stimolo per gruppo» e riposo 48 h come rotta del cilindro. |
| Cardio | `workoutType` (camminata, corsa, cardio, hiit, …), `duration` in ore. Minuti: `durationToMinutes` (se il numero è > 5 si legge come minuti, altrimenti come ore). Classificazione euristica `classifyFocusActivity` (strength / aerobic / other). Finestre: `historyWindows.js` somma `cardioMinutes`. | Due finestre diverse convivono: Focus e `buildSaluteLongevityWindow.cardioMinutesTotal` (14 giorni). Il commento in `buildFocusKentuEnginesForDossier.js` lo dice esplicitamente. Le kcal allenamento sono stimate (`durationMinutes * 6` se manca `estimatedKcal`). | Finestra mobile 7 giorni come unica rotta; tipo come fatto, non come pattern sul nome. |
| Corpo | `buildBodyMetricsPayload` in `bodyMetricsEngine.js` scrive su RTDB `body_metrics` `weight` e/o `waist` (alias `girovita`, `waistCm`). Il Focus esporta le pesate in `buildBodyMeasurements` (`buildFocusLabDossier.js`). WHtR: `useSaluteExperienceData.js` fa `waistCm / height`. | Il Modello mette vita e peso negli effetti (dopo la v1 per la vista «Cosa hai ottenuto»). In v1 non sono un cilindro quotidiano. La vita non ha protocollo (mattina, digiuno, due misure) né media mobile dedicata. | Protocollo di misura; media mobile; rapporto vita/altezza come fattore dell’ago (dopo la v1). |
| Collegamenti tra cilindri | `meal_within_3h_of_bedtime` accosta ultimo pasto e bedtime. È un segnale, non una frase di rapporto. | L’AI del Focus può raccontarlo; il codice non vieta di presentarlo come causa. | Regola «due fatti, nessuna causa» nel validatore del testo. |
| Orologio degli effetti | **Manca** come contenuto di onboarding. | — | Quattro orizzonti dichiarati all’ingresso. |
| Conto delle gocce / esperimenti | **Mancano.** Sono dopo la v1. | — | — |

### 1.2 Focus e calendario

| Pezzo del Modello | Stato |
| --- | --- |
| Pagina Focus | Esiste: `src/pages/KentuFocusPage.jsx`, sessione in `buildFocusPageSession.js`. Periodi prodotto: ieri, settimana, mese (`FOCUS_PRODUCT_PERIODS`). Si apre sul periodo scelto, non «sempre sull’ultimo periodo completo» con freccia verso quello in corso. |
| Calendario a colpo d’occhio | **Manca.** Nessuna striscia di 7 giorni, griglia con scie, mini-calendari anno. L’anno è dopo la v1. |
| Intestazione con pallino aggregato e stato a parole | **Manca** nel senso del Modello. Ci sono verdetto e hero (`FocusVerdict.jsx`, `FocusHero.jsx`) scritti o proposti dall’edizione, non un colore medio calcolato sui giorni chiusi. |
| Quattro cilindri come righe | **Adattare.** Oggi cinque chip (`AreaChip.jsx` + `FOCUS_AREAS`). |
| Una sola azione | Esiste come blocco `FocusAction.jsx` nel testo dell’edizione. Non è vincolata all’orizzonte «Oggi / Questa settimana / Questo mese» da codice. |
| «Chiedi all’assistente» e «Perché te lo dico» | «Perché» esiste (`FocusWhy.jsx`). «Chiedi all’assistente» è dopo la v1. |
| Oggi in corso, bordo tratteggiato, giorni futuri spenti | **Manca.** |
| Si apre su ieri | Il periodo default del prodotto è `ieri` (`buildFocusPageSession.js`, `periodId` default `'ieri'`). Non è «il più recente tra i giorni chiusi». |

### 1.3 Punteggio del giorno

**Manca** come oggetto unico, deterministico, versionato, dai quattro cilindri, che diventa un colore.

Esistono punteggi diversi, non equivalenti:

- `calculateHealthScore` in `src/features/health/HealthScoreEngine.js` — avatar «Health Score» in chat (`useHealthScoreSnapshot.js`).
- `scoreProgressionNutritionDay` — solo nutrizione, giorni con kcal sufficienti.
- Pilastri longevità 4×25 in `longevityInsightGenerator.js` (cardio, forza, sonno, «Focus Metabolico»).
- Colore metabolico della Home (fase di digestione/digiuno), non un giudizio sulla giornata.

Nessuno di questi è il punteggio del Modello. Nessuno è versionato nel senso «se cambiano i pesi, lo storico non si ricalcola in silenzio».

### 1.4 Buchi, scie, pausa, giorno chiuso

| Concetto | Stato |
| --- | --- |
| Giorno con almeno un alimento | `dayHasFoodLog` in `src/utils/dayTrackingStatus.js`. |
| Giorno usabile nelle medie | `isDayTrackableForAverages`: cibo **oppure** `isIntentionalFast === true` sul nodo del tracker. Il flag si scrive da `SalaComandi.jsx` (circa riga 8026) e si conserva in `useDiaryFirebaseSync.js` se il log è vuoto. Il diario chiede «buco di tracciamento o digiuno intenzionale?» in `DiaryDetailsSheet.jsx`. |
| Giorno completo / giorno chiuso del Modello | **Manca.** `nutritionDayComplete` / `dayComplete` / `isComplete` sono **letti** in `saluteDashboardMetrics.js` e `saluteHistorySeries.js`. Nel codice sotto `src/` **non c’è uno scrittore** di questi flag. `resolveProgressionDayEvaluationContext` (`progressionInsightGenerator.js`) chiude il giorno con un’euristica: giorno passato, oppure cena registrata, oppure kcal ≥ 85% del target, oppure ora oltre una soglia. Non chiede «Ieri hai registrato tutto?». |
| Buco nero | **Manca.** Un giorno senza log è escluso dalle medie, non disegnato nero. |
| Registrato dopo (48 h) | **Manca.** |
| Giornata ricordata a grandi linee | **Manca.** |
| Pausa dichiarata (vacanza, malattia) | **Manca.** `isIntentionalFast` è un digiuno, non una pausa. |
| Scie (≥ 3 giorni sulla rotta, giallo in pausa, buco che spezza) | **Manca.** |
| Copertura «N giorni su M» | **Manca** come superficie. Il conteggio dei giorni con cibo si può derivare da `dayHasFoodLog`, non è mostrato così. |
| Bentornato dopo un buco | **Manca.** |

### 1.5 Potenziale infiammatorio

**Dopo la v1.** Pezzi riusabili, non l’ago:

- qualità NOVA e ruoli vegetali (`buildFocusFoodQualityBlock.js`);
- omega-3 / omega-6 / sodio / potassio se la voce di diario li ha;
- WHtR in Salute;
- sonno corto e minuti di attività come segnali già calcolati.

Mancano: zero centrale, media mobile 4 settimane (7 giorni in Giorno/Settimana), ago del periodo precedente, alone di incertezza, barre «cosa muove l’ago», pesi con fonte, stima omega da lista ingredienti in cache «stimato», affiancamento PCR. Il nome DII non va usato finché la licenza non è verificata (il Modello lo dice; nel codice il DII non risulta implementato).

### 1.6 Salvavita

**Manca** come livello unico che scatta sopra l’AI.

Pezzi sparsi, da non confondere con le soglie del Modello (che il Modello dice di definire con le fonti **prima** del codice):

- digiuno lungo e sonno < 7 h nei segnali Focus;
- outlier di peso in `bodyMetricsEngine.js` (`isWeightOutlier`);
- penalità deficit+allenamento in `coreEngine.jsx` (`applyDeficitWorkoutPenalty` / `getYesterdayCompletedWorkouts`);
- «scarico» come etichetta di piano (`planIsDeload` in `WorkoutView.jsx`), non come successo del salvavita;
- modalità diabete: `SalaComandi.jsx` (`userProfile` mode `diabete` / `salute`) e `useCommandTerminal.js` (`classifyDiabetesChatIntent`). Il consiglio medico esplicito del Modello non è un controllo deterministico separato;
- `intermittentFasting === true` sul profilo spegne il segnale di digiuno lungo (`buildFocusDeterministicSignals.js`). È il flag che il Modello cita.

Mancano: deficit protratto, −1% peso/settimana, proteine sotto il minimo in deficit, crescita troppo rapida del carico, stesso gruppo senza 48 h, sovraccarico combinato (FC a riposo, sonno, energia al risveglio, prestazioni). La FC a riposo **non** ha un registro proprio: l’unico `heartRate` trovato è un campo opzionale sulla voce workout (`normalizeWorkoutEvents.js`).

### 1.7 Regole di credibilità

| Regola | Stato |
| --- | --- |
| Provenienza del dato | Parziale, nel dossier Focus: `focusDossier.v1.js` (`FOCUS_PROVENANCE`, `focusMetric`, `missingMetric`) e i normalizzatori. Non è un tocco «dal colore al cibo» in tutta l’app. |
| Livelli di certezza visibili all’utente | Parziali nel Focus (etichette di verifica nutrizione). Non la tabella del Modello. |
| Validatore che impedisce al testo di contraddire lo stato | `validateFocusWrittenEdition.js` e `validateFocusAiCoachResponse.js` bloccano frasi vietate e forma. Non confrontano il testo con un colore di giorno, perché quel colore non esiste. |
| Dossier senza dati grezzi | `slimFocusAiCoachDossier.js` e `buildFocusAiCoachDossier.js` mandano aggregati. Da mantenere. |
| Metodo versionato | Revisioni di edizione Focus (id di harness, pipeline server). Non un numero di versione dei pesi del punteggio giorno. |
| Fabbisogno ricalibrato sul peso | `calculateMetabolicVariance` è chiamato da `SalaComandi.jsx` sui `bodyMetricsHistory`. **NON DETERMINABILE** se la formula coincida con «ricalibra il fabbisogno con errore 10–15%»: non è stato verificato il contenuto della funzione oltre la chiamata. |
| Kcal allenamento fuori dal bilancio | Non è la regola attuale: il workout salva `kcal` / `cal` e diverse UI le mostrano. Il Modello dice di non usarle nel bilancio. |
| Condimenti proposti (olio, sale tipico) | **Manca** in registrazione. C’è solo un suggerimento testuale in `coreEngine.jsx` («sposta l’olio…») e il riconoscimento visivo dell’olio in `foodVisualResolver.js`. |
| Audit composti vs semplici | Esiste, sola lettura: `auditCompoundFoodMatchesCore.js`, UI dev `FocusCompoundFoodAuditDev.jsx`, script `scripts/auditCompoundFoodMatches.mjs`. La correzione delle voci è il primo punto v1 ed è ancora aperta. |
| Cosa Kentu non dice | Liste di frasi vietate in `focusAiCoachBannedUserPhrases.js` e nel validatore editoriale. Da estendere alle parole del Modello («stato infiammatorio», «carenza», «anni di vita», diagnosi) quando il rapporto nuovo esiste. |

### 1.8 Linguaggio visivo

| Pezzo | Stato |
| --- | --- |
| Blu = sulla rotta, niente verde «positivo» | **Da migrare.** Vedi sezione 2.5. Il verde è ancora il colore «favorevole» in diversi grafici. |
| Ciano `#22D3EE` = azione / in corso | Già usato come azione e fase digestiva (`#22d3ee` in `metabolicPhaseColors.js`, classi `text-cyan-300` sul pilastro Focus). Va tenuto distinto dal blu dei giorni. |
| Colori di area | `FOCUS_AREAS`: Energia `#AB4C1D`, Qualità `#2E6B4C` (verde), Ritmo `#974B0E`, Sonno `#5B4A9E`, Movimento `#0B6E75`. Il Modello vuole alimentazione arancio, sonno viola, **forza verde**, cardio ciano. Il verde della Qualità non è il verde della Forza. |
| Tema scuro default, chiaro in `ui_preferences` | `focusTheme.js` legge/scrive `users/{uid}/ui_preferences/focusTheme` (e localStorage `kentu_focus_theme`). È il tema del Focus, non uno switch di tutta l’app. **NON DETERMINABILE** se lo switch in alto del resto dell’app usi la stessa chiave: la ricerca non ha trovato un altro writer di `ui_preferences` fuori dal Focus. |
| Tono e formati italiani | Parziali: `formatFocusHoursIt`, `formatFocusItNumber` in `focusDateUtils.js`. Il resto dell’app non è stato auditato frase per frase. |
| Brand (cento, Blue Zones, paesaggi, «A kent'annos») | Hero immagini: `focusHeroImages.js` / `FocusHeroImage.jsx` (scelte dal codice). Il testo «Blue Zones» / «A kent'annos» **non** risulta nel codice applicativo. Onboarding che spiega il nome: **NON DETERMINABILE** da questa lettura (nessun modulo di onboarding dedicato è emerso con quelle frasi). |
| Nome utente solo «Kentu» | KentuOS resta il titolo della finestra (`index.html` / document title visto in app). È un nome interno da non mostrare, secondo il Modello: oggi la shell del browser lo mostra. |

### 1.9 Perimetro v1 — stato a una riga

| Voce v1 | Stato |
| --- | --- |
| Audit storico composti | Strumento presente, correzioni no |
| Giorno chiuso nel check-in, energia al risveglio, qualità sonno | Manca il check-in; qualità sonno salvabile se arriva nel payload; energia al risveglio assente |
| Condimenti suggeriti | Manca |
| Copertura, buchi, 48 h, pausa | Manca |
| Punteggio del giorno versionato | Manca |
| Focus con calendario (Giorno su ieri, Settimana, Mese), quattro cilindri, una azione | Pagina e tre periodi sì; calendario e quattro cilindri no |
| Salvavita con soglie documentate | Manca; le soglie non vanno codificate prima delle fonti |
| Taratura 1–2 settimane | Manca |
| Rapporto al mattino + notifica locale | Manca come rapporto del Modello. Esistono saluti predittivi (`predictiveGreeting.js`) e il Focus Metabolico in chat, che sono un’altra cosa |
| Spegnere le superfici legacy | Ancora attive (sezione 2.4) |
| Crash, GDPR, dispositivo medico, Play Console | Fuori dal codice letto. **NON DETERMINABILE** qui |

---

## 2. Verifiche richieste

### 2.1 Dati oggi, per cilindro

**Alimentazione**

- Energia: somma `kcal` / `cal` delle voci `food` / `recipe` del log del giorno. Target: `userTargets.kcal` (fallback 2000 in `resolveProgressionNutritionTargets` se il target non è un numero positivo — questo fallback è del punteggio Progressione, non del diario).
- Qualità: NOVA e ruoli in `buildFocusFoodQualityBlock`; fibra e micro se la voce li porta (`fibre` / `fiber` / `fiberG`, `omega3`, `omega6`). Ultra-processati «da criticare» sono un sottoinsieme NOVA 4, non tutti i NOVA 4.
- Orari: `mealTime` o `time` sulla voce; orari di slot in `dayNode.mealTimes`. Primo e ultimo pasto si ricalcolano, non sono campi salvati.

**Sonno**

- Durata: `hours` / `duration` / `sleepHours` sulla voce `type: 'sleep'`.
- Orari: `wakeTime` (default 7 se il payload non ha un’ora valida, in `commitLogSleepCommand`); `bedtime` e `sleepStart` derivati. Il Focus distingue `recorded` / `derived` / `missing`.
- Qualità soggettiva: `quality` e `sleepQuality` interi 1–5, solo se il payload li porta. Non c’è un campo «energia al risveglio».

**Forza**

- Gruppi: sì, array `muscles` normalizzato, sia dalla scheda (`handleSaveWorkout`) sia dalla chat se il payload ha `muscles` (altrimenti la chat deduce Petto/Spalle/Tricipiti, Dorso/Bicipiti o Gambe dal tipo `spinta` / `trazione` / `gambe`).
- Data: la voce sta nel log del giorno del tracker; l’ora è `time` / `mealTime`.
- Carichi e ripetizioni: **dalla scheda pesi, no, non come numeri.** Si salva il testo `workoutDetailNote`. **Dalla chat, sì**, se il comando porta `exercises[].sets`, `reps`, `weightKg` (`workoutAdapter.js`). Un confronto «carico nel tempo» sul testo della scheda non è deterministico.

**Cardio**

- Minuti: `duration` (ore) convertita da `durationToMinutes`.
- Tipo: `workoutType` / `subType` (camminata, corsa, cardio, hiit, …). Il Focus può riclassificare dal nome con `classifyFocusActivity` se l’etichetta manca o è ambigua.

**Corpo**

- Peso: `body_metrics.weight` (kg), storia in `bodyMetricsHistory`.
- Vita: `body_metrics.waist` (cm). Altezza per il rapporto sta nel profilo letto da `useSaluteExperienceData.js`, non nella misura.

### 2.2 Giorno «registrato» e giorno completo

Oggi un giorno è «tracciato per le medie» se ha almeno una voce alimentare **oppure** `isIntentionalFast`. Funzioni: `dayHasFoodLog`, `isDayIntentionalFast`, `isDayTrackableForAverages` in `src/utils/dayTrackingStatus.js`.

Non esiste un concetto di giorno completo nel senso del Modello (tutto registrato, confermato al mattino, affidabilità). L’euristica più vicina è `dayClosed` in `resolveProgressionDayEvaluationContext`: un giorno passato è chiuso sempre; oggi si chiude con l’ora, con una cena, o con almeno l’85% delle kcal. I flag `nutritionDayComplete` / `dayComplete` sono letti e non scritti: se un giorno storico li avesse, verrebbero onorati, ma l’app non li imposta.

### 2.3 Segnali deterministici e riuso per il punteggio del giorno

Punto di ingresso: `buildFocusDeterministicSignals` in `src/features/kentuFocus/product/buildFocusDeterministicSignals.js`. Lo chiama `buildFocusAiCoachDossier.js`. Non assegna un colore.

Segnali prodotti:

| id | Area | Soglia nel codice | Riuso per il punteggio |
| --- | --- | --- | --- |
| `sleep_under_7h` | sonno | < 7 h | Sì, come rotta sonno, se la durata è un fatto (`recorded` / ore presenti). Oggi scatta anche senza distinguere la provenienza delle ore. |
| `fasting_over_14h` | ritmo | > 14 h, e in settimana/mese solo se ≥ 3 giorni e primo pasto irregolare (> 2 h di scarto). Spento se `intermittentFasting`. Sul giorno singolo è osservato ma `summaryEligible: false`. | Parziale: è ritmo alimentare, non un cilindro. Non va promosso a giudizio del giorno da solo. |
| `meal_within_3h_of_bedtime` | ritmo | ultimo pasto < 3 h prima del bedtime, solo se bedtime è `recorded`, `derived` o `calculated` | Sì come collegamento cena–sonno, con la provenienza già calcolata. |
| `energy_irregular` | energia | finestra 7 giorni, banda in `focusEnergyVariability.js` | Sì per la rotta energia su settimana/mese. Non è il giudizio di un singolo giorno. |

Intorno, riusabili ma non dentro quella funzione:

- `buildFocusFoodQualityBlock` — rotta qualità;
- `normalizeWorkoutEvents` / `historyWindows` — minuti cardio e kind strength/aerobic;
- `extractRecordedMuscleGroups` — gruppi, non il recupero a 48 h;
- `scoreProgressionNutritionDay` — **non** riusabile così com’è: un numero 0–1 che tratta la vicinanza al target come bene, senza il salvavita.

Il punteggio del giorno va in un modulo nuovo (proposta: `src/features/kentuDay/scoreDay.js`), che consuma questi segnali e non li ricalcola. I pesi stanno in un file di versione (`scoreDay.v1.js`) così un cambio non ricalcola lo storico in silenzio.

### 2.4 Superfici di feedback legacy ancora attive

| Superficie | Dove | Attiva? |
| --- | --- | --- |
| Focus Metabolico in chat | `src/features/chat/metabolicFocus.js` (`METABOLIC_FOCUS_LABEL`), `clinicalInsightCoach.js`, intent `REQUEST_CLINICAL_INSIGHT` in `CommandTerminalController.js` (circa 5480, commento «Focus Metabolico») e `useCommandTerminal.js`. Card: `MetabolicFocusChatCard.jsx`, montata in `AiCluster.jsx`. Voce di menu: `CLINICAL_INSIGHT_ITEM` in `PulsantieraUniversale.jsx` (testo visibile «Insight clinico», intent nascosto). | Sì |
| Health Analyzer | `src/features/trendHub/engines/HealthAnalyzerEngine.js`. Consumato da `useHealthDailyReport.js` e `SaluteClinicalInsight.jsx`. Schema LLM in `commandSchemas.js`. | Sì, nel cruscotto Salute |
| Report dal tasto ALL | `GENERATE_PERIOD_REPORT` è nel sottomenu `SUBMENUS.report` di `PulsantieraUniversale.jsx` (Report di ieri, sintesi settimanale, e la voce clinica). L’intent è gestito in `CommandTerminalController.js` e `reportCommandIntent.js`. Il pilastro in vista si chiama «Tutti» (`id: 'tutti'`) e apre il **vocabolario**, non il sottomenu report (`activeCategory === 'tutti'`). | Il comando e il sottomenu **restano nel codice**. **NON DETERMINABILE** se un gesto visibile chiami ancora `setActiveCategory('report')`: in questo file il ramo `tutti` non lo fa. Va spento il comando, non solo il bottone. |
| Longevity / GhostMode | `LongevityView` è montata da `src/components/salaComandi/LongevityTabShell.jsx` dentro `SalaComandi.jsx` (circa 9133). Anche `src/features/longevity/HealthspanOverlay.jsx` e `src/longevity/LongevityPanel.jsx`. `GhostModeDashboard.jsx` è in root `src/` ed è il componente descritto nel README; **NON DETERMINABILE** se la Home attuale lo monti ancora: la ricerca in `SalaComandi.jsx` non ha trovato il nome. I pilastri e il filtro WHtR vivono in `longevityInsightGenerator.js` e `saluteDashboardMetrics.js`. | Longevità sì. GhostMode dashboard: presente nel repo, montaggio sulla Home non confermato in SalaComandi. |
| Edizioni server Focus | Pipeline attiva sotto `src/features/kentuFocus/server/`: `runFocusEditionPipeline.js`, `runFocusAdminEdition.js`, `runFocusPilotEdition.js`, `publishFocusEdition.js`, `validateFocusEdition.js`, persistenza RTDB, Gemini. È il Focus editoriale (testo AI), non il calendario del Modello. | Sì. Il Modello dice che l’AI scrive titolo e azione **dopo** che il codice ha fissato gli stati. Questa pipeline oggi genera l’edizione senza quegli stati. |

Health Score in chat (`HealthScoreEngine.js`, avatar in `AiCluster.jsx`, intent `REQUEST_HEALTH_DIAGNOSIS` in `SalaComandi.jsx`) non è nella lista di spegnimento del Modello con quel nome, ma è un giudizio legacy parallelo. Va deciso se spegnerlo insieme alle altre superfici: il Modello non lo nomina. Segnato qui per non lasciarlo implicito.

### 2.5 Verde usato come «positivo» (da migrare al blu)

Il Modello tiene il verde **solo** come colore di area della Forza. Tutto il verde che significa «bene / favorevole / ottimo» va al blu. Elenco dei punti in cui il verde è il capo favorevole di una scala o un badge di esito, trovato nel codice (non è un inventario di ogni classe `emerald-*` decorativa: quelle sono molte e non tutte significano «sulla rotta»):

| Dove | Valore | Ruolo |
| --- | --- | --- |
| `src/index.css` `.fat-details-omega__value` e `.fat-details-omega__gradient` | `#4ade80`, gradiente che parte da `#22c55e` | lato favorevole del rapporto omega |
| `src/index.css` `.carbs-details-kpi__ratio-value` e `__ratio-gradient` | `#4ade80`, gradiente che finisce su `#22c55e` | lato favorevole dei carboidrati |
| `src/index.css` `.protein-quality-badge--green` | `#22c55e` | badge qualità proteica buona |
| `src/index.css` `.minerals-water-balance__gradient` | finisce su `#22c55e` | lato favorevole del bilancio minerale |
| `src/components/EnergyArcWidget.jsx` | `longevityDisplay >= 70 → #22c55e`; fase anabolica/assorbimento `#22c55e` | punteggio alto e fase «buona» |
| `src/features/salaComandi/utils/metabolicPhaseConfig.js` | `iconColor: '#22c55e'` | colore di una fase metabolica, non del giorno |
| `src/features/salaComandi/utils/metabolicPhaseColors.js` | `default: '#4ade80'` | fallback di fase |
| `src/features/salute/components/SalutePillarDetail.jsx` | `STIMOLO OTTIMALE` → `text-emerald-200` | esito positivo di pilastro |
| `src/features/chat/MetabolicFocusChatCard.jsx` | badge `emerald` | stato positivo della card legacy |
| `src/features/centroAnalisi/CentroAnalisiLiveCards.jsx` | stop SVG `#22c55e` | estremità favorevole |
| `src/features/trendHub/components/SaluteGlycemicRiskBar.jsx` | gradiente che parte da `#22c55e` | rischio basso |
| `src/features/kentuFocus/product/focusAreas.js` | Qualità `iconColor: '#2E6B4C'` | verde di **area**, non di giornata. Con i quattro cilindri questo verde va alla Forza, non alla qualità del cibo |

Classi `emerald-*` su protocolli, sessioni, widget allenamento e menu (`DailyProtocolHomeBanner.jsx`, `ProtocolTimeline.jsx`, `DailySessionsView.jsx`, `TrainingBlockWidget.jsx`, `MainMenuDrawer.jsx`) sono «successo / attivo» dell’UI. Vanno riviste una per una: se dicono «è andata bene», diventano blu; se sono solo il bottone di conferma, il Modello assegna il ciano all’azione.

`coreEngine.jsx` usa `#4ade80` come colore dell’etichetta Meditazione, non come giudizio. Non è un candidato al blu dei giorni.

---

## 3. Piano a fasi (perimetro v1)

Ogni fase è un modulo nuovo o un modulo Focus già isolato. Nessuna fase aggiunge logica in `SalaComandi.jsx`. I test sono file `node --test` accanto al modulo, su fixture già usate dal Focus (`src/features/kentuFocus/__tests__/fixtures/`).

### Fase 0 — Audit dello storico

Il Modello la mette come primo passo, e condiziona il resto.

- File: `auditCompoundFoodMatchesCore.js`, `FocusCompoundFoodAuditDev.jsx`, `scripts/auditCompoundFoodMatches.mjs`, `foodMatchQuality.js`. La correzione delle voci, se si fa, sta in un modulo di diary write già esistente (`canonicalMealCommit` / sync diario), non in SalaComandi.
- Rischio: correggere un piatto composto giusto (es. un alimento il cui nome contiene «di») e spostare kcal/macro di giorni già chiusi. L’audit è in sola lettura: la scrittura va dietro conferma, una voce alla volta, con il prima/dopo.
- Test: fixture con «ravioli di spinaci» vs spinaci semplici; un nome composto legittimo che non deve matchare; nessuna scrittura se l’utente non conferma.

### Fase 1 — Giorno chiuso e check-in del mattino

- Modulo nuovo `src/features/kentuDay/`: `closeDay.js` (fatti: pasti presenti, cena presente, sonno presente, conferma utente, affidabilità alta/bassa), `morningCheckIn.js` (ieri completo?, qualità sonno 1–5, energia al risveglio). Persistenza sul nodo giorno del tracker, con campi nuovi e espliciti (`dayClose`), non riusando `nutritionDayComplete` che nessuno scrive.
- `commitLogSleepCommand` oggi vive in SalaComandi: la fase 1 non lo allunga. Il check-in chiama un writer piccolo estratto, oppure scrive solo `dayClose` + un evento sonno tramite il comando già registrato. Se l’estrazione del comando sonno è troppo larga, la fase si ferma all’interfaccia e al writer di `dayClose`.
- Rischio: chiudere in automatico i giorni passati (l’euristica `dayClosed` lo fa) e dipingere di blu giorni incompleti. Il Modello vuole affidabilità bassa se non c’è conferma o se manca la cena / c’è un solo pasto.
- Test: ieri con colazione+pranzo+cena+sonno e conferma → affidabilità alta; ieri con un solo pasto → bassa; oggi mai chiuso; qualità fuori 1–5 rifiutata; energia al risveglio assente non inventata.

### Fase 2 — Condimenti suggeriti

- Modulo nuovo `src/features/mealBuilder/suggestTypicalCondiments.js`, chiamato dal costruttore pasti (McDrive / MealBuilder), non da SalaComandi.
- Rischio: aggiungere olio e sale che l’utente non ha usato, gonfiando kcal e sodio. Devono entrare come proposte, con etichetta «valore tipico», mai come fatto registrato finché non si accettano.
- Test: un piatto di pasta propone olio con grammi e kcal dichiarati stimati; un caffè non propone olio; rifiuto = nessuna riga nel log.

### Fase 3 — Copertura, buchi, 48 ore, pausa

- Modulo `src/features/kentuDay/coverage.js`: per ogni data, stato `empty | recorded | recordedLate | recalled | paused | inProgress | future`. `recordedLate` se il primo write utile arriva entro 48 h dalla mezzanotte di quel giorno (confronto timestamp della voce più vecchia e data). Pausa: flag dichiarato **prima**, distinto da `isIntentionalFast`.
- Rischio: un giorno di digiuno intenzionale dipinto nero. `isIntentionalFast` resta un giorno registrato a 0 kcal, non un buco e non una pausa.
- Test: giorno senza log = empty; log scritto il giorno dopo entro 48 h = recordedLate; oltre 48 h = NON DETERMINABILE dal Modello se resti buco o diventi «ricordata» (il Modello lega il riempimento alle 48 h e tratta «ricordata» come opzione a parte: il test fissa solo che oltre le 48 h non scatta `recordedLate`); pausa dichiarata il giorno prima = paused; digiuno intenzionale ≠ paused.

### Fase 4 — Punteggio del giorno, versionato

- Modulo `src/features/kentuDay/scoreDay.v1.js` (costanti e soglie, importate, non ricalcolate in linea) e `scoreDay.js`. Input: i quattro fatti già normalizzati (energia vs target, qualità, sonno, forza a finestra, cardio a 7 giorni) più `coverage.js`. Output: stato `onCourse | mid | offCourse | hole | pause | inProgress` e un grado continuo solo per onCourse e offCourse. Nessuna chiamata AI.
- Consuma `buildFocusDeterministicSignals` e `buildFocusFoodQualityBlock` senza duplicarne le soglie: se la soglia deve cambiare, cambia nel modulo del segnale e il punteggio legge il risultato.
- Rischio: un giorno a deficit estremo che diventa blu perché sonno e allenamento sono a posto. Il salvavita (fase 6) ha il veto; finché la fase 6 non c’è, il punteggio v1 non assegna `onCourse` se l’energia è sotto una soglia provvisoria segnata `PROVISIONAL` nel file di versione. Le soglie definitive restano bloccate dalle fonti, come dice il Modello.
- Test: stessi input → stesso stato (determinismo); giorno vuoto = hole, non rosso; oggi = inProgress; pausa = pause anche con allenamento; un giorno con un solo pasto non è `onCourse`; cambiare la costante di versione non riscrive un risultato già serializzato con `methodVersion: 1`.

### Fase 5 — Focus con calendario

- UI in `src/pages/KentuFocusPage.jsx` e componenti nuovi sotto `src/features/kentuFocus/product/ui/` (`FocusCalendar.jsx`, `FocusCylinders.jsx`). I dati vengono da `scoreDay` + `coverage`, non da un nuovo calcolo nella pagina.
- Struttura del Modello per Giorno (su ieri), Settimana, Mese. L’anno no, in v1.
- Apertura: ultimo periodo completo (ieri; lunedì → settimana precedente; primo del mese → mese precedente). Il periodo in corso è un passo avanti.
- Rischio: la pagina Focus è già grande (`KentuFocusPage.jsx` supera le 2400 righe). La fase aggiunge componenti, non altro JSX inline. Spegnere hero/verdetto vecchi solo quando il calendario li sostituisce, per non avere due giudizi.
- Test: rendering degli stati (colore, bordo tratteggiato, nero, grigio) su una settimana fixture; scia di 3 giorni onCourse sottolineata; un giallo non spezza; un buco spezza; copertura bassa → niente pallino e testo «dati insufficienti»; lunedì apre la settimana conclusa.

### Fase 6 — Salvavita

- Non si scrive codice di soglia finché le fonti non sono nel file `src/features/kentuDay/safeguard.sources.md` (numeri + citazione). Poi `safeguard.js` legge solo quel file.
- Comportamenti già decisi dal Modello e testabili senza il numero esatto: mai `onCourse` se il safeguard è scattato sull’energia; il riposo pianificato non è `offCourse`; con mode diabete il risultato include `seeDoctor: true`; `intermittentFasting` non fa scattare il digiuno come allarme.
- Rischio: duplicare gli allarmi già sparsi (`isWeightOutlier`, penalità deficit in `coreEngine.jsx`) e ottenere due messaggi. Quei punti si lasciano dov’è sono finché il salvavita non li copre; poi si spengono, non si sommano.
- Test: veto sul blu; diabete → seeDoctor; digiuno intermittente → il segnale lungo non è un allarme; safeguard assente quando nessun fatto supera soglia (niente riga in cima).

### Fase 7 — Taratura 1–2 settimane

- Modulo `src/features/kentuDay/baseline.js`: per un utente nuovo, i primi 7–14 giorni chiusi fissano la linea (energia media, orari, sonno) e il Focus non giudica «fuori rotta» contro un ideale assoluto finché la linea non c’è. I buchi si vedono lo stesso.
- Rischio: tarare su giorni incompleti e fissare una linea troppo bassa. Si usano solo giorni a affidabilità alta della fase 1.
- Test: meno di 7 giorni chiusi → stato «in taratura», nessun pallino di periodo; all’ottavo giorno la linea è la media dei chiusi e non include i buchi.

### Fase 8 — Rapporto del mattino e notifica locale

- Il rapporto è il Focus di ieri già calcolato (fasi 4–5), aperto dal check-in, non un nuovo testo del Focus Metabolico. Generazione: il codice produce gli stati; un chiamante AI esistente (`requestFocusAiCoachAnalysis.js`) può scrivere titolo e azione solo se `validateFocusAiCoachResponse` conferma che non contraddicono lo stato. Notifica: **NON DETERMINABILE** se il progetto abbia già un permesso di notifica locale (nessun modulo di notifica è emerso in questa lettura). La fase non inventa un canale: se il permesso non c’è, il rapporto si apre all’avvio dell’app.
- Rischio: la pipeline server (`runFocusEditionPipeline.js`) pubblica un’edizione che ignora `scoreDay`. Il rapporto v1 non deve leggerla finché la pipeline non riceve gli stati come input vincolante.
- Test: titolo AI che dice «giornata ottima» con stato `offCourse` → rifiutato dal validatore; titolo coerente → accettato; nessuna notifica se il giorno non è chiuso.

### Fase 9 — Spegnere le superfici legacy

Solo dopo che il rapporto del mattino esiste, altrimenti si toglie l’unica lettura senza sostituirla.

- Togliere l’invio di `REQUEST_CLINICAL_INSIGHT` e la card `MetabolicFocusChatCard` (il codice resta, il percorso UI no).
- Togliere la chiamata a `HealthAnalyzerEngine` da `SaluteClinicalInsight` / `useHealthDailyReport`.
- Far rispondere `GENERATE_PERIOD_REPORT` con un rifiuto che punta al Focus, in `reportCommandIntent.js`, senza aggiungere rami in SalaComandi.
- La tab Longevità (`LongevityTabShell`) si svuota del giudizio a pilastri o si nasconde. Non si cancella `LongevityView` in questa fase: si smette di presentarla come lettura della giornata.
- Health Score avatar: decisione esplicita prima di spegnerlo (non è nella lista del Modello).
- Rischio: intent vocali che ancora chiedono «focus metabolico» e finiscono nel vuoto. Il router deve rispondere con il Focus nuovo, non con un errore.
- Test: i tre intent non producono più un bollettino; una frase utente «com’è andata ieri» non chiama `clinicalInsightCoach.js`.

### Fase 10 — Crash, privacy, dispositivo medico, Play Console

Non è una fase di codice in questo piano. Il Modello la mette in v1 e va trattata fuori dal repository (informativa, base giuridica dei dati di sonno/peso/glicemia, parere sul confine con i dispositivi medici, scheda Play). Nessun modulo va scritto «nel frattempo» per sembrare conformi.

### Backlog

- Riallineare la Home al Modello Kentu. L’arco (per esempio 44%) va spiegato: oggi è il punteggio di longevità leggero degli ultimi 14 giorni (`useLongevityScore`), non il punteggio del giorno del Focus, e i due numeri non sono la stessa cosa. Le frasi metaboliche a tempo («Brucio grassi tra 2h e 53m») vanno tolte oppure dichiarate come stima. Il blu è il colore positivo, come nel Focus.
- La mappa metabolica deve leggere le barre di `hypertrophyMath` (`computeHypertrophyLevels01`). Dopo quel collegamento si smette di aggiornare il residuo 0,50 di `fourCylinderEngine.js`. La fatica sistemica resta.
- Ricalibrare la fatica di `fourCylinderEngine`: il recupero notturno è 0,08 e ogni sessione aggiunge 0,03–0,05, quindi la fatica sistemica non supera circa 0,17 e la soglia 0,8 non scatta mai. Lo sfv-2 non la legge più.
- Il DataGuard non deve bloccare le sessioni senza distretti muscolari. Le camminate con somma dei decadimenti a zero restano ferme.

### Dopo la v1 (non in queste fasi)

Nell’ordine del Modello: misure e vista Mese «Cosa hai ottenuto»; ago infiammatorio; anno; esperimenti e proiezioni; «Chiedi all’assistente»; MCP / Gemini sul telefono; prova di un modello più grande. I dati peso/vita e WHtR già ci sono e restano in Salute finché non entra quella vista.

---

## 4. Cosa non è stato deciso dal codice

- Quante notti reali abbiano `sleepQuality` compilato.
- Se un gesto ancora visibile apra il sottomenu `report` (il pilastro Tutti apre il vocabolario).
- Se `GhostModeDashboard` sia montato sulla Home attuale.
- Se `calculateMetabolicVariance` sia la ricalibrazione del fabbisogno descritta dal Modello.
- Se esista già un canale di notifica locale.
- Se lo switch chiaro/scuro dell’app intera usi `ui_preferences` oltre al tema Focus.
- Se l’onboarding contenga già la frase sulle Blue Zones o «A kent'annos» (non risultano nel codice applicativo cercato).
- Il numero esatto delle soglie del salvavita: il Modello vieta di inventarle.
