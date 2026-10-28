# Kentu — Documentazione tecnica overview

Documento generato da analisi statica del repository **GhostApp / KentuOS** (root del progetto).  
**Nessuna modifica al codice applicativo** oltre a questo file.  
Dove il codice non consente una conclusione sicura compare la formula **NON DETERMINABILE DAL CODICE**.

---

## 1. Stack e setup

### 1.1 Linguaggi, framework, librerie (da `package.json`)

| Area | Tecnologia | Versione dichiarata |
|------|------------|---------------------|
| Runtime app | Node | `24.x` (`engines`) |
| UI | React + React DOM | `19.2.3` |
| Routing | `react-router-dom` | `^7.17.0` |
| Build | Vite | `^5.0.8` |
| Styling | Tailwind CSS | `^3.4.19` (+ PostCSS, Autoprefixer) |
| Backend client | Firebase JS SDK | `^12.9.0` (Auth, Realtime Database, Firestore, Functions) |
| Native shell | Capacitor (`@capacitor/core`, Android, Camera, Haptics, Splash, App) | `^8.x` |
| Auth native | `@capacitor-firebase/authentication` | `^8.5.1` |
| Speech | `@capacitor-community/speech-recognition` | `^7.0.1` |
| AI client SDK | `@google/generative-ai` | `^0.24.1` (uso effettivo tipicamente via Cloud Function `callGemini`) |
| Icone | `lucide-react` `^1.16.0`, `react-icons` `^5.6.0` |
| Chart | `chart.js` / `react-chartjs-2`, `recharts` | varie |
| Motion | `framer-motion` | `^12.38.0` |
| PWA | `vite-plugin-pwa` | `^1.3.0` |
| CSV | `papaparse` | `^5.5.3` |
| Markdown | `react-markdown` | `^9.1.0` |
| PDF | `html2pdf.js` | `^0.14.0` |

**Presenze duali / residue nel manifest:**

- `expo` `~57.0.11`, `expo-image-picker`, `react-native` `0.86.2` sono in `dependencies`, ma **non esiste cartella `ios/`** e l’ingresso nativo attivo osservato è **Capacitor Android** (`android/`, `capacitor.config.json`). Uso runtime di Expo nell’app web: **NON DETERMINABILE DAL CODICE** (probabile debito / esperimento non wireato).
- Cloud Functions (`functions/package.json`): Node **20**, `firebase-functions` `^5.1.1`, `firebase-admin` `^12.7.0`.

Nome npm del progetto: `ghost-mode-dashboard` (`package.json`). Brand UI: **KentuOS** (`capacitor.config.json` → `appId` `com.marcozanda.kentuos`).

### 1.2 Piattaforme target, build, avvio locale

| Target | Evidenza |
|--------|----------|
| **Web** (primario) | Vite + `index.html` + PWA; `npm run dev` → `http://localhost:5173` |
| **Android** | Cartella `android/` Capacitor; `webDir: "dist"` |
| **iOS** | Nessuna cartella `ios/` → **non presente nel repo** |
| Deploy web | `vercel.json` presente; dettagli pipeline: **NON DETERMINABILE DAL CODICE** oltre al file |

Comandi principali (`package.json`):

```bash
npm install
npm run dev          # Vite
npm run build        # vite build → dist/
npm run preview
npm run lint
npm test             # suite node --test (meal + focus parziale)
# molte suite Focus: npm run test:focus:* / test:meal:p1r|p1s
```

Capacitor: dopo `npm run build`, sync/build Android tramite CLI Capacitor (script dedicato non elencato in `package.json` — tipicamente `npx cap sync android`).

### 1.3 Variabili d’ambiente e servizi esterni (nomi, non valori)

Da `.env.example` e codice:

| Nome | Uso |
|------|-----|
| `VITE_FIREBASE_API_KEY` | Config Firebase web |
| `VITE_FIREBASE_AUTH_DOMAIN` | Auth |
| `VITE_FIREBASE_DATABASE_URL` | Realtime Database |
| `VITE_FIREBASE_PROJECT_ID` | Project |
| `VITE_FIREBASE_STORAGE_BUCKET` | Storage |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Messaging |
| `VITE_FIREBASE_APP_ID` | App ID |
| `VITE_GOOGLE_WEB_CLIENT_ID` | Google OAuth web (non Android) |
| `GEMINI_API_KEY` | Secret **server** Functions (`functions/index.js`) |
| `FOCUS_ADMIN_*`, `FOCUS_PILOT_*`, `FOCUS_AI_RULES`, emulator hosts | Script/test/admin Focus |

Servizi esterni osservati:

- **Firebase Auth** (Google via Capacitor plugin + web)
- **Firebase Realtime Database** (diario, profilo, bozze, analisi Focus client)
- **Firestore** — salute/diabete: collezioni `diario_salute`, `eccezioni_terapia` (`src/services/healthChatService.js`), `terapia_base` (`src/features/health/utils/therapyPlanStore.js`); pasti quotidiani restano su RTDB
- **Cloud Functions** region `europe-west1`, callable `callGemini` (`functions/index.js`; client `src/services/aiService.js`)
- **Google Gemini** (modello default lato client chat: `gemini-3.7-flash` in `GeminiStructuredClient.js`; Focus via `createAskAiFocusGeminiProvider.js`)
- **Open Food Facts** (dump locale JSON + API barcode — vedi §3)
- **Vercel** `api/search-foods.ts` (search server-side); uso runtime dal client FastMealLogger: **NON DETERMINABILE DAL CODICE**
- Analytics prodotto (GA/Mixpanel/ecc.): nessun `getAnalytics`/`logEvent` in `src/` → **assente nel codice analizzato**

**Nota sicurezza:** `src/firebaseConfig.js` e `capacitor.config.json` contengono **fallback hardcoded** di API key / client ID Google. Sono tipici ID client Firebase pubblici, ma restano esposti nel repo (vedi §10).

---

## 2. Struttura del progetto

### 2.1 Albero cartelle principali

```
GhostApp/
├── android/                 # Progetto Capacitor Android
├── api/                     # Edge/helper (es. search-foods.ts)
├── docs/                    # Spec/roadmap/analisi (Focus editorial screenshots, metabolic models…)
├── functions/               # Firebase Cloud Functions (callGemini)
├── public/                  # Asset statici + JSON DB alimentari (kentu_*.json, icone, video)
├── scripts/                 # Focus admin, sync functions, smoke Gemini, emulator tests
├── src/                     # Codice applicativo React
│   ├── App.jsx / main.jsx   # Bootstrap, auth gate, router
│   ├── SalaComandi.jsx      # Shell principale Home (orchestratore monolitico)
│   ├── coreEngine.jsx       # Normalizzazione log, chiavi storico, motori giorno
│   ├── foodLoader.js / useFoodDb.js / foodUnits.js
│   ├── components/          # UI condivisa (auth, onboarding, overlay, dial…)
│   ├── contexts/            # AuthContext, ChatOverlayContext…
│   ├── features/            # Feature folders (vedi sotto)
│   ├── hooks/               # Hook SalaComandi, pasti, workout, sync
│   ├── layout/              # AppHeader, drawer menu
│   ├── pages/               # Route-level pages (Focus, Centro Analisi, Planner…)
│   ├── platform/            # Android back, Google Assistant inbox
│   ├── services/            # aiService, firebaseAuth, usage diary
│   ├── styles/              # CSS SalaComandi
│   └── utils/               # Cache tracker, offline personal DB, sanity…
├── database.rules.json      # Regole RTDB (users + kentu_focus server)
├── capacitor.config.json
├── firebase.json
├── vite.config.js
└── package.json
```

**`src/features/` (conteggio file approssimativo al momento dell’analisi):**

| Feature | Ruolo |
|---------|--------|
| `kentuFocus/` (~246) | Prodotto Focus editoriale + lab + server/admin/tests |
| `salaComandi/` | Bottom chrome, engine four-cylinder, pezzi Home |
| `mealBuilder/` | FastMealLogger, ricerca universale, barcode, ricette |
| `commandTerminal/` | Controller chat/AI pasti, resolver multi-DB, LLM |
| `chat/` | Pulsantiera, LiveMealTray, cockpit attività, overlay |
| `trendHub/` | Hub Fotografia / salute / strumenti |
| `centroAnalisi/` | Centro Analisi |
| `mealEngine/` | Commit canonico pasti, proiezioni nutrizione giorno |
| `healthEngine/` | Snapshot salute / cockpit |
| `workout/` | Adapter workout, draft, stima kcal |
| `weeklyBlocks/`, `planning/`, `dailyProtocols/` | Piano allenamento / protocolli |
| `predictive/` | Azioni rapide contestuali |
| `wipMealBuilder/` | Pipeline pasti assistiti “WIP” |
| altre | `metabolic`, `nutrition`, `stimulants`, `quickEvents`, `salute`… |

Root `src/` contiene ancora molti moduli “storici” (GhostModeDashboard, MetabolicMap, LongevityView, TimelineNodi, ecc.) usati da SalaComandi o tab legacy.

### 2.2 Pattern architetturale e stato

- **Pattern dominante:** *feature folders* + **shell monolitica** `SalaComandi.jsx` che orchestra tab, sync Firebase, pasti, chat, timeline.
- **Non** è un MVVM formale né Redux/Zustand: stato principalmente **React `useState`/`useReducer` locali**, hook specializzati (`useDiaryFirebaseSync`, `useMealActions`, `useWorkoutManager`…), Context limitati (`AuthContext`, `ChatOverlayContext`, `UserNutritionGoalsContext`).
- **Persistenza:** Firebase RTDB come source of truth cloud; **localStorage** / cache SWR per cold start (`trackerCacheUtils`, `longevityBootstrapCache`, personal food DB).
- **AI:** client chiama `httpsCallable(functions, 'callGemini')` (`src/services/aiService.js`); logica conversazionale in `CommandTerminalController` + `GeminiStructuredClient`.

Roadmap interna (`docs/KENTU_ROADMAP.md`): obiettivo dichiarato di alleggerire SalaComandi e spostare logica in moduli; lo stato attuale è ancora ibrido.

### 2.3 Navigazione — schermate e collegamenti

**Router** (`src/App.jsx`):

| Path | Componente | Note |
|------|------------|------|
| `/` | `SalaComandi` (lazy) | Home autenticata |
| `/nuovoutente` | `UserOnboardingWizard` | Preview Battesimo (simulation, no write `firstSetupCompleted`) |
| `/planner` | `WeeklyPlannerPage` | Legacy; commento: WeeklyBuilder smantellato |
| `/centro-analisi`, `/analisi` | `CentroAnalisiPage` | Centro Analisi |
| `/consulto` | `ConsultoPreview` | Preview consulto |
| `/kentu-focus` | `KentuFocusPage` | Focus editoriale prodotto |
| `/salute` | redirect → `/` | |
| `/hub` | redirect → `/` + `state.openHub` | |
| `*` | → `/` | |

**Gate auth:** senza utente → `LoginScreen`; profilo senza `firstSetupCompleted` → onboarding; poi Routes + `GlobalChatOverlay` + `MealSavingOverlayHost`.

**Bottom navigation** (`src/constants/salaComandiConstants.js`, `BottomChrome.jsx`):

- Slot: **Home (`oggi`)** · **Diario (`analisi`)** · **FAB Kentu AI** · **Hub** · **Menu**
- Hub interno: `timeline` | `strumenti` (`HUB_INNER_TABS`)
- Tab swipe principali: `oggi` → `analisi` → `hub`

**Comandi rapidi Home** (`PulsantieraUniversale.jsx`): PAS · RAP · ATT · **FOCUS** · ALL  
→ FOCUS chiama `onOpenFocus` → `openKentuFocus` in SalaComandi → stash diario + `navigate('/kentu-focus')`.

**Location state** verso SalaComandi: `openHub` / `openHubTab`, `openFotografia`, `openInboxComposer` (Assistente + `inboxComposerFocusBus`).  
**Tab legacy** ancora nel JSX (`planning`, `longevita`) ma fuori `MAIN_BOTTOM_TAB_ORDER` — accesso UX standard: **NON DETERMINABILE DAL CODICE** senza audit menu.

Schermate/overlay *dentro* SalaComandi: FastMealLogger, `WorkoutView`, chat overlay, trash pasti, SnapshotHub, Energy Arc, drawer `activeAction`, ecc. Inventario completo dei flag `show*`: audit dedicato.

---

## 3. Modello dati e database

### 3.1 Entità RTDB principali (sotto `users/{uid}/…`)

Regole base: `.read`/`.write` se `$uid === auth.uid` (`database.rules.json`). Sottoalbero server `kentu_focus/{uid}/…` è **quasi tutto deny** al client (edizioni pubblicate lette se status published).

| Path | Contenuto tipico |
|------|------------------|
| `profile_targets` | `{ profile, targets }` — anagrafica, goal, kcal/macro, `firstSetupCompleted`, `appMode`, `targetHistory`… |
| `tracker_data/trackerStorico_YYYY-MM-DD` | Nodo giorno: `log` / `dati.log`, `mealTimes`, `manualNodes`, flag edit… |
| `tracker_data/trackerFoodDatabase` | Alimenti/ricette personali |
| `physiology_model` | Modello fisiologico / calibrazione |
| `body_metrics` | Metriche corpo (usato da pipeline Focus server/pilot) |
| `activityDrafts/{day}` | Bozze attività |
| `weeklyBlockPlan/{weekStart}/…` | Blocchi allenamento settimanali |
| `kentu_focus_ai/{periodId}/{windowKey}` | Analisi AI Focus **client** (ieri/settimana/mese) |
| `kentu_focus_ai_index` | Indice analisi AI |
| `kentu_chats/` | Archivio chat per data |
| `trash_meals` | Cestino pasti (TTL ~24h, `useMealTrash` / `mealTrash.js`) |
| `health_reports` | Report salute (hook salute) |
| `salute_preferences/` | Preferenze salute (es. sleep reference) |
| `kentu_focus/…` (root rules) | Edizioni server/admin (meta, rev, memory_events, jobs, dossiers…) — scrittura client bloccata |

Altri path root (`planning`, `weeklyPlanning`): presenti nelle rules; mapping completo UI: **NON DETERMINABILE DAL CODICE** senza tracciare ogni writer.

**Firestore (salute/diabete, dual storage):** pasti → RTDB; glicemia/terapia → Firestore (`healthChatService.js`, `therapyPlanStore.js`).

### 3.2 Forma eventi nel diario (`dailyLog`)

Normalizzazione in `coreEngine.jsx` → `normalizeLogData`:

- Tipi osservati: `food`, `recipe`, `meal` (cartella → flatten), `ghost_meal`, `workout`, sleep, inbox drafts (`unassigned_drafts` / draft blocks), stimolanti/acqua/ecc. via altri flussi.
- Orario: **`mealTime` / `time` come ora decimale** (es. `18.5` = 18:30).
- Nutrienti alimento: `kcal`/`cal`, `prot`, `carb`, `fat`/`fatTotal`, micronutrienti allineati a `TARGETS` / report keys.
- Chiavi DB: `foodDbKey` / `matchedKey`; stato bozza: `status`, tipi inbox.

Commit canonico: `src/features/mealEngine/canonicalMealCommit.js` (filtra unresolved, placeholder `grams:1`, chiavi UI-only).

### 3.3 Dove vivono i dati e sync

| Layer | Meccanismo |
|-------|------------|
| Cloud | RTDB listener su oggi + get storico (`useDiaryFirebaseSync.js`) |
| Locale | localStorage chiave giorno `trackerStorico_YYYY-MM-DD`; cache storico recente; cache profile; personal food DB |
| Strategia | Stale-while-revalidate: UI da cache, poi network |
| Focus handoff | In-RAM `focusDiaryHandoff.js` (Map per uid) — **nessuna write** Firebase al passaggio SalaComandi → Focus |

### 3.4 “Database Kentu Focus”

**Non** è un RDBMS separato. Sono **due strati correlati** (non confonderli):

1. **Prodotto client — AI Coach v3** (`src/features/kentuFocus/product/` + `pages/KentuFocusPage.jsx`)
   - Periodi: `ieri` | `settimana` | `mese` (`focusProductPeriods.js`)
   - Input: stash in-RAM da Sala Comandi e/o `loadFocusAuthenticatedDiary.js` (`tracker_data` + `profile_targets`)
   - Dossier: `buildFocusAiCoachDossier.js` + motori (`buildFocusKentuEnginesForDossier`, compass dead-band, habit compass, meal maneuver, `editorialReadingContext`)
   - Prompt: `buildFocusAiCoachPrompt.js`; validazione: `validateFocusAiCoachResponse.js` (vieta score 0–100, claim cliniche ban, headline tecnici)
   - Persistenza: `users/{uid}/kentu_focus_ai/...` (`focusAiAnalysisPersistence.js`); retention documentata 30/90/365 giorni; `dataVersion` per stale
   - UI primaria autenticata: **Genera analisi** → `FocusEditorialReport` (non la pipeline “giornale” server)
   - Sessione real diary: `editorial.available: false` per edizioni server lunghe — il flusso principale è l’AI Coach client (`buildFocusPageSession.js`)

2. **Pipeline server — edizioni “giornale”** (`src/features/kentuFocus/server/`, rules `kentu_focus`)
   - Ranking/soglie: `editorial/focusEditorialConfig.js`, `rankFocusCandidates.js`, `selectFocusEditorial.js`
   - Prompt scrittura distinto: `editorial/writing/buildFocusEditorialPrompt.js`
   - Publish: `kentu_focus/{uid}/editions/…` (meta/rev); script admin/pilot
   - Demo non autenticata: `buildFocusProductEdition.js` + `DemoEditorialBlock` su pagina Focus

**Interrogazione:** `KentuFocusPage` (load/list/regenerate store); deep-link motori `focusKentuDeepLinks.js` → Centro Analisi / fotografia.  
**Fragment regole** `proposed/kentuFocusAiClient.rules.fragment.json`: stato di merge in production rules — **NON DETERMINABILE DAL CODICE**.

### 3.5 Database alimentare

**Origini** (`foodLoader.js`, `foodDbSource.js`):

| Source ID | File / origine | Provenance UI |
|-----------|----------------|---------------|
| `KENTU_IT` | `/kentu_smart_master_db.json` (CREA / Italia) | `ITALY` / CREA |
| `GLOBAL` | `/kentu_smart_master_usda_FINAL.json` (USDA) | `GLOBAL` |
| `OFF` | `/kentu_off_master_db.json` (~centinaia di migliaia di prodotti) | `OFF` |
| Personale | RTDB `trackerFoodDatabase` + cache locale | `PERSONAL` |

Caricamento: **core-first** (CREA+USDA subito), OFF in background chunked (per non bloccare UI). PWA: JSON alimentari in runtime cache, non precache (`vite.config.js`).

**Struttura alimento normalizzata (concettuale):**

- Chiave: `id` / `dedupKey` / `fdcId` / `creaCode`…
- Nome: `italianName` / `name` / `desc`…
- Macro per 100 g: `kcal`, `prot`, `carb`, `fat`/`fatTotal`, fibre, sodio/sale, vitamine…
- `foodSource`, `semanticTags` (IG, NOVA, FODMAP… se presenti)
- Unità/porzioni: `enrichDbRowWithFoodUnits` (`foodUnits.js`) — categorie (pasta, bevande…) e unit default; OFF spesso senza enrich all’index

Barcode: `features/mealBuilder/utils/barcodeOpenFoodFacts.js` + override `barcodeFoodOverrides.js`.

---

## 4. Flusso di caricamento pasti

### 4.1 Modalità di inserimento (osservate)

| Modalità | Entry point | Note |
|----------|-------------|------|
| Manuale / ricerca | Pulsantiera PAS → Manuale → `FastMealLogger` + `UniversalSearchModal` / `useUniversalSearchEngine` | Multi-DB merge+rank |
| Wizard AI / McDrive | PAS → Guidato AI o chat intent `START_MCDRIVE_WIZARD` | `CommandTerminalController` + LiveMealTray |
| Chat testo / voce | FAB Kentu AI / hold-to-talk | STT Capacitor + Gemini structured |
| Barcode | Scanner in meal builder | OFF + overrides |
| Foto | Schema `requestFoodPhoto` / immagini verso `callGemini` | Capacitor Camera / image picker |
| Shortcut rapidi | RAP: acqua, caffè, nap… | `onManualShortcut` |
| Preferiti / co-occorrenze | `foodCooccurrence`, quick tiles | |
| Inbox bozze | Vocale/assistente → draft non assegnati | Smista su pasto |
| Crea alimento | Enrichment modal / create-new-food schema | |

Foto-pasto end-to-end sempre attiva su production: **NON DETERMINABILE DAL CODICE** (pipeline presente, copertura UX completa non verificata qui).

### 4.2 Passo-passo tipico (manuale)

1. Utente apre Manuale → `onOpenManualView` → `FastMealLogger.jsx` + `MealComposerContext`
2. Cataloghi: `useFoodDb` / core CREA+USDA, poi OFF background (`foodLoader.js`)
3. Ricerca: `useUniversalSearchEngine` (tier personale → IT → Global → OFF locale/API)
4. Selezione + unità/grammi (`foodUnits`, usage localStorage)
5. Conferma → `handleConfirm` → `onSave` → **`handleFastLoggerSave`** (`useTimelineDiaryActions.js`)
6. Shape: `toCanonicalDiaryFoodItem` (`canonicalMealCommit.js`) → `setDailyLog`
7. Sync: `syncDatiFirebase` → `denormalizeLogForFirebase` → `trackerStorico_*` (+ `mealTimes`, `manualNodes`)
8. Overlay: `MealSavingOverlayHost` / `withMealSavingOverlay`

### 4.3 Passo-passo tipico (wizard / chat)

1. Intent `START_MCDRIVE_WIZARD` / testo / voce → `CommandTerminalController`
2. Vassoio: `LiveMealTray.jsx` + `assistedMealPipeline.js` (**Gemini non è fonte kcal**)
3. Risoluzione: `multiDbFoodResolver.js` — L1 personale+Kentu (no OFF); L2 OFF/USDA + `mergeAndRank` se L1 vuoto; tier caffetteria
4. Disambiguazione: `ChatFoodEnrichmentModal.jsx` (attende OFF se ancora loading)
5. SSOT commit: **`commitAddFoodCommand`** in `SalaComandi.jsx` (UPSERT replace/merge/append; promozione OFF→personale via `personalFoodPromotion.js`)
6. Persistenza draft passiva: `persistMcDriveDraftItemsToDiary` / Inbox mentre si compone

Drawer legacy: `useMealActions.saveMealToDiary` (slot ghost + `estraiDatiFoodDb` in `foodDataEngine.js`; wrapper SalaComandi può non passare `offDb` a quel path).

### 4.4 Calcolo nutrizionale

- Draft UI: `scaleNutrientsForWeight` / `computeDraftTotals` (`foodMacroUtils.js`)
- Persistenza: `collectCanonicalPortionNutrients` — `grams/100 × row`; altrimenti valori già sul draft
- Fallback chat: `getAverageEstimate` in `mapProposalItemsToDiaryFoods`
- Proiezione giorno: `features/mealEngine/projectDayNutrition.js`
- Alimento non associato / kcal 0: bozza incompleta, non dato nutrizionale valido

### 4.5 Orario, modifica, cancellazione

- Orario: `mealTime`/`time` decimali; default slot; `exactTime` chat; mappa Firebase `mealTimes`; `applyMealTimes` al load
- Modifica: FastMealLogger `editingMealId`; UPSERT chat; drag timeline `updateMealTime`
- Delete: `removeLogItem` / delete action `commitAddFoodCommand`; undo stack snapshot
- Cestino: `useMealTrash` → RTDB `trash_meals` (TTL ~24h), UI `MealTrashSheet`
- Debounce conferma: `MEAL_CONFIRM_DEBOUNCE_MS` (900 ms)

---

## 5. Tracciamento attività fisica

### 5.1 Inserimento

- **Manuale:** Pulsantiera ATT → `StimulusCockpitOverlay` → sheet `WorkoutView.jsx` (`drawers/vistas/`, tab pesi/cardio/hiit/riposo; slider kcal cap 750)
- Catalogo tipi/muscoli: `src/activityCatalog.js` (+ sticky tab `stashActivitySheetTempTab`)
- Persistenza: `useWorkoutManager.js` → `dailyLog` + `manualNodes` + sync
- **Chat:** `ADD_WORKOUT` / `mapChatWorkoutToNativePayload` (`workoutAdapter.js`) + `workoutRegistrationSlots.js`
- **Bozze:** `activityDrafts.js` / `useActivityDrafts.js` → RTDB `activityDrafts`
- **Piano:** weekly blocks (`useWorkoutManager`, `weeklyBlockPlan`); default burn tipici 320–350 kcal se assenti
- **AI draft:** `aiWorkoutDraftEngine.js` (euristiche kcal/min)

### 5.2 Integrazioni Health

SDK Apple Health / Google Fit / Health Connect: **assenti** in `src/`.  
Comportamenti “wearable-adjacent” presenti:

- Sonno via screenshot/numerico `LOG_SLEEP` (prompt citano fitness watch / Xiaomi) — `coreEngine.jsx`, `GeminiStructuredClient.js`
- Passi su entry workout → stima `KCAL_PER_STEP_ESTIMATE = 0.04` (`cardioCylinderStatus.js`)
- Provenienza sonno `source: 'wearable'` in normalizzatori Focus (`normalizeSleepNight.js`)

### 5.3 Dispendio energetico e metriche

- Manuale/sheet: kcal **prevalentemente inserite dall’utente** o default storico (`DEFAULT_WORKOUT_KCAL` ≈ 300 in `lastWorkoutMemory.js`)
- Chat/adapter: se manca `estimatedKcal` → `durationMinutes * 6` (AI draft: ~10/min corsa, ~5 camminata)
- Cognitivo: `round(cognitiveMet × 70 × durationHours)` (`useWorkoutManager` / `activityCatalog`)
- Energy Arc: drain basale ~0.7 TDEE + burn workout (`EnergyArcWidget.jsx`)
- Muscoli / cilindri: cockpit + `normalizeWorkoutEvents.js` per Focus
- Motore MET×peso completo sul sheet pesi: **non presente** (euristiche + input utente)

---

## 6. Timeline

- Tempo: **`mealTime` / `time` decimali** 0–24; workout salvano entrambi allineati (`useWorkoutManager`)
- Grafo giorno in `SalaComandi.jsx`: `buildComputedMealNodes` + activity nodes (`timelineUtils.js`) + `manualNodes` → `allNodes` → stack overlap → `TimelineNodi.jsx`
- Persistenza nodi: RTDB `manualNodes` + cache locale timeline
- Drag: `useTimelineDrag.js` / `updateMealTime` → `syncDatiFirebase`
- Superfici: Hub→Timeline (`AnalisiTimelineTab`), tab Diario/`analisi`, `DailyTimelineList`, overlay metabolici, `TodayMealsTimeline` in meal builder
- Energy Arc Home: `EnergyArcWidget.jsx` / `EnergyArc.jsx` (accent `#22d3ee`)
- Linea ora: `NowVerticalLineOverlay.jsx`; ghost meal `type: 'ghost_meal'` kcal 0
- Giorno selezionato: `currentTrackerDate` / `fullHistory[trackerStorico_*]`

---

## 7. Motore di feedback

### 7.1 Kentu Focus (ieri / settimana / mese) — prodotto principale di feedback comportamentale

**Flusso:**

1. Apertura `/kentu-focus` (o generatore in pagina)
2. Sessione: `buildFocusPageSession.js` (real diary vs demo)
3. Dossier: aggrega diario + `buildFocusKentuEnginesForDossier`, compass, meal maneuver, sleep, wellness pillars…
4. Prompt system + user: `buildFocusAiCoachSystemInstruction` / `buildFocusAiCoachUserPrompt`
5. Risposta JSON schema editoriale v3 (headline, lead, sections, recommendedAction, evidenceRefs, claimLayers…)
6. Validazione: `validateFocusAiCoachResponse.js`
7. Persistenza RTDB + UI `FocusEditorialReport` in `KentuFocusPage.jsx`
8. Evidence: `resolveFocusEvidenceRefs.js` (nasconde path irrisolvibili)

Estratto regole prompt (system):

```text
Sei il redattore del rapporto personale Kentu Focus («a kent’annusu»).
NON riepilogare il diario…
Distingui EPISODIO (giorno di analisi) e CONTESTO RECENTE…
Vietato: diagnosi, score 0–100, causalità certe da 1–2 episodi…
Rispondi SOLO JSON conforme allo schema editoriale v3.
```

File: `src/features/kentuFocus/product/buildFocusAiCoachPrompt.js`.

**Quando mostrato:** on-demand in pagina Focus (Genera analisi / carica salvata); demo banner `FOCUS_PRODUCT_DEMO_BANNER`; harness DEV per mock.

### 7.2 Layer deterministici Focus (input al rapporto / “Prove”)

| Motore | File | Note |
|--------|------|------|
| Bussola / Pilota | `buildFocusCompassSignalsForDossier.js`, `focusCompassDeadBandMath.js` | Dead-band ~75–125 kcal / 4% TDEE; allineato a `metabolicDirectionEngine.js`; **no** metabolic score in policy Focus |
| Habit Compass | `buildFocusWeeklyHabitCompass.js` | Solo **settimana/mese** (ieri: `available: false`); soglie es. min 4 giorni cibo/sonno |
| Manovra pasti | `buildFocusMealRedistributionManeuver.js` | Cena tardiva, gap, candidati g in `redistributionCandidates` |
| Pilastri wellness | `buildFocusWellnessPillars.js` | Coach deterministico costruito in sessione; **`WellnessCoachBlock` non montato** nel dashboard real diary analizzato |
| Stimoli | `normalizeStimuliEvents.js` | Caffeina/alcol/acqua nel dossier |

Longevity score / pannello: **vietati** in output AI Coach; engine `src/longevity/` **non** wired in `kentuFocus/product`.

### 7.3 Altri feedback / report (fuori o paralleli a Focus)

- Pulsantiera ALL: `GENERATE_PERIOD_REPORT` via chat — distinto da Focus
- **Focus Metabolico chat** (`features/chat/metabolicFocus.js`): bollettino mattutino Command Terminal — **non** alimenta `buildFocusAiCoachDossier`
- Coach chat: `ConsultantEngine.js` + Gemini structured
- Longevity / GhostModeDashboard: layer legacy/gamification (README ReadyCore)
- Soglie SNC header (65/85), longevity UI: sparse — catalogo unico: **NON DETERMINABILE DAL CODICE**

### 7.4 Pipeline server edizioni Focus

Admin/pilot: ranking (`FOCUS_SCORE_THRESHOLDS` / `FOCUS_RANK_WEIGHTS`), publish barriers, memory events (test `p672*`, `p611*`). Path `kentu_focus/{uid}/editions`. UX autenticata su `/kentu-focus` usa principalmente **AI Coach client** + `kentu_focus_ai`.

---

## 8. Autenticazione, profilo e onboarding

### 8.1 Auth

- `AuthProvider` / `LoginScreen` / `firebaseAuth.js`
- Google Sign-In (web client ID + Capacitor Firebase Authentication)
- Logout / delete user path: rimozione `users/{uid}` (vedi `firebaseAuth.js`)

### 8.2 Onboarding (“Battesimo”)

`UserOnboardingWizard.jsx` — 5 step tipici:

- Genere, data di nascita (età 15–99)
- Altezza, peso
- PAL (1.2 / 1.4 / 1.6)
- Goal: cut (−300 kcal) / maintain / bulk (+250)
- Calcolo Mifflin-St Jeor → BMR → TDEE → target kcal, prot (~1.8 g/kg), fat, carb, water
- Scrittura `users/{uid}/profile_targets` con `firstSetupCompleted: true`, `targetCalories`, `proteinTarget`, ecc.

`App.jsx` legge `profile_targets` post-login; se `firstSetupCompleted !== true` mostra wizard (fail-open verso onboarding se lettura fallisce).

### 8.3 Impatto su obiettivi e feedback

- Target kcal/macro guidano dial Home, proiezioni pasto, Focus (`userTargets` nello stash), report carenze (`REPORT_NUTRIENT_KEYS`)
- `appMode` (es. diabete) altera label Piano/Terapia in pulsantiera
- Focus usa target dichiarati nel contesto editoriale (`dayVersusRecent`, bilanci vs target)

---

## 9. Design system

### 9.1 Direzione visiva

- **Tema scuro dominante** (Home, Focus, chrome); bg tipico `#050a12` (`index.css`)
- Accento **cyan/turchese** `#22d3ee` / `#00e5ff` / Tailwind `cyan-*` — convenzione condivisa, **non** un unico token globale
- Token moduli: `src/components/kentuos/kentuos.css` (`--kentu-*`); Focus `kentuFocusPage.css` (`--kf-*`); ricette glass `saluteVisualTheme.js` (`SALUTE_FROST`)

### 9.2 Tipografia

- Body app: system stack (`-apple-system`, Segoe UI, Roboto…) in `index.css`
- Focus page: `"Segoe UI", "Avenir Next", "Trebuchet MS", sans-serif`
- `tailwind.config.js`: `theme.extend` vuoto — nessun webfont brand dichiarato
- Titoli editoriali: classi `.kf-editorial*`

### 9.3 Componenti riutilizzabili (campione)

- `AppHeader`, `BottomChrome`, `PulsantieraUniversale` / `PillarButton`
- `KentuOSUI.jsx` (`KentuButton`, `KentuIcon`), `KentuTimeSelector.jsx`
- Overlay glass submenu, `MealTrashSheet`, `EnergyArcWidget` / `EnergyArc`
- Lucide (BookOpenText su FOCUS, BookOpen su Diario, …)
- Asset `public/`: wordmark/symbol/enso SVG, splash Android, icone strumenti Hub, mascotte/avatar cellula, video acqua/caffè, JSON DB alimentari

### 9.4 Brand

- **Kentu** / **KentuOS**; claim «A Kent’Annos» (roadmap + prompt Focus)
- Package npm ancora `ghost-mode-dashboard`; README root **stale** (ReadyCore) — narrativa attuale in `docs/KENTU_ROADMAP.md`
- Emblema centrale bottom nav (Kentu AI)
- Nessun Storybook: stile disperso tra Tailwind, CSS moduli e hex ripetuti

---

## 10. Stato di avanzamento

### 10.1 Funzionalità (valutazione da codice)

| Area | Stato |
|------|--------|
| Auth Google + onboarding | Completo (flusso wireato) |
| Diario pasti multi-ingresso + sync RTDB | Completo / maturo |
| Ricerca multi-DB + barcode | Completo (OFF background) |
| Chat / wizard pasti | Completo ma complesso; edge case in evoluzione |
| Attività manuale + timeline | Completo a livello app; no Health sync |
| Kentu Focus editoriale client | Completo a livello prodotto recente (test p1*) |
| Edizioni Focus server/pilot | Ampio codice + test; rollout production: **NON DETERMINABILE DAL CODICE** |
| Hub / trend / metabolic map | Presente; coerenza UX complessiva in evoluzione |
| Centro Analisi | Scheletro/pagina dedicata |
| Planner settimanale route | Legacy / ridotto |
| PWA + Android Capacitor | Presenti |
| iOS nativo | Assente nel repo |
| Integrazioni wearable | Assenti |
| Analytics prodotto | Non evidenti |

### 10.2 TODO / FIXME / mock

- Commenti `TODO`/`FIXME` letterali: **pochissimi**; segnale debito più forte: **`@deprecated`** (~40+ file, es. wizard pasti legacy, fusion USDA)
- Mock/harness Focus: `buildFocusEditorialMockAnalysis.js`, harness fixtures, `?focusHarness=1` / `?mockEditorial=1`, `FOCUS_PRODUCT_DEMO_BANNER`
- `isSimulationMode` / `SimulationModeContext`: **`syncDatiFirebase` no-op** in simulazione
- Cartella `features/wipMealBuilder`; `UIConfigProvider` definito ma **non** wrappato in `App.jsx`
- README root **ReadyCore** (stale); roadmap vera: `docs/KENTU_ROADMAP.md`
- Expo/RN in deps; camera path documenta stub Vite + Capacitor nativo (`platform/expoNativeCamera.js`)
- Rumore repo: `geminiRawResponse*.txt`, `src.zip`, cartelle morte

### 10.3 Debito tecnico evidente

- `SalaComandi.jsx` monolite (~10k linee) vs roadmap “non aumentare SalaComandi”
- Due editoriali Focus (client `kentu_focus_ai` vs server `kentu_focus/editions`) + period report chat
- Dual Capacitor + Expo; Node app `24.x` vs Functions `20`
- Tipizzazione JS-first; TS in devDependencies non enforced
- Tab legacy `planning` / `longevita` ancora nel render SalaComandi ma fuori bottom order canonico

### 10.4 Privacy e sicurezza

| Rischio | Dettaglio |
|---------|-----------|
| Dati sanitari/lifestyle su RTDB | Diari, pesi, workout, analisi AI sotto `users/{uid}` — rules per-uid OK se Auth corretta |
| Chiavi Firebase in chiaro | Fallback in `firebaseConfig.js` (attesi per client Firebase, ma repo pubblico = progetto esposto) |
| Google OAuth client ID in `capacitor.config.json` | Committed in chiaro |
| `GEMINI_API_KEY` | Solo server (buona pratica); client non deve embeddarla |
| Analisi AI / dossier | Contengono sintesi abitudini; retention client definita; edizioni server deny-by-default |
| Assistente Google inbox | Listener piattaforma — superficie aggiuntiva input |
| File response Gemini in root | Possibile leakage di prompt/output in git history |

---

## 11. Prossimi passi consigliati (priorità verso v1 pubblicabile)

1. **Igiene release:** rimuovere/ignorare artifact sensibili o legacy (`geminiRawResponse*`, zip, cartelle morte); allineare README a KentuOS; decidere su dipendenze Expo (tenere o togliere).
2. **Sicurezza config:** documentare rotazione chiavi; assicurarsi che rules production e secret Functions siano deployati; audit path Firestore salute.
3. **Hardening pasti:** suite regressione ricerca/wizard (già `test:meal:p1r/p1s`) in CI obbligatoria; monitoraggio OFF load su device low-end.
4. **Focus prodotto:** percorso felice ieri/settimana/mese su account reali; chiarire UX demo vs diario reale; policy retention privacy in store listing.
5. **Ridurre SalaComandi:** estrarre 1–2 moduli critici per release (pasti confirm + open Focus) senza big-bang.
6. **Store Android:** splash/icone già presenti; checklist Play (privacy policy dati salute, dichiarazioni Activity Recognition se aggiunte in futuro).
7. **iOS:** solo se in scope v1 — oggi **bloccante assente**; altrimenti dichiarare esplicitamente Android+Web only.
8. **Niente Health sync in v1** salvo requisito esplicito — evita scope creep; mantenere euristiche kcal trasparenti in UI.
9. **Observability:** logging errori Functions + client crash (assenza analytics → ciechi in produzione).
10. **QA mobile reale:** pasti (Nutella/OFF), Focus generate, offline cache, back Android (`NativeAndroidBackHandler`).

---

## Indice file “ancora” (riferimento rapido)

| Tema | File |
|------|------|
| Entry / routes | `src/main.jsx`, `src/App.jsx` |
| Home shell | `src/SalaComandi.jsx` |
| Sync diario | `src/hooks/salaComandi/useDiaryFirebaseSync.js` |
| Food DB | `src/foodLoader.js`, `src/useFoodDb.js`, `src/foodDbSource.js` |
| Meal UI | `src/features/mealBuilder/FastMealLogger.jsx` |
| Save manuale | `src/hooks/salaComandi/useTimelineDiaryActions.js` (`handleFastLoggerSave`) |
| Chat pasti | `src/features/commandTerminal/CommandTerminalController.js` |
| Vassoio | `src/features/chat/LiveMealTray.jsx` |
| Resolver | `src/features/commandTerminal/conversation/multiDbFoodResolver.js` |
| Commit | `src/features/mealEngine/canonicalMealCommit.js`; SSOT chat `commitAddFoodCommand` in `SalaComandi.jsx` |
| Activity sheet | `src/drawers/vistas/WorkoutView.jsx`, `src/hooks/salaComandi/useWorkoutManager.js` |
| Workout chat | `src/features/workout/workoutAdapter.js` |
| Focus page | `src/pages/KentuFocusPage.jsx` |
| Focus prompt | `src/features/kentuFocus/product/buildFocusAiCoachPrompt.js` |
| Focus AI store | `src/features/kentuFocus/product/focusAiAnalysisPersistence.js` |
| Focus handoff | `src/features/kentuFocus/product/focusDiaryHandoff.js` |
| AI BFF | `src/services/aiService.js`, `functions/index.js` |
| Salute Firestore | `src/services/healthChatService.js` |
| Onboarding | `src/components/onboarding/UserOnboardingWizard.jsx` |
| Design tokens | `src/components/kentuos/kentuos.css`, `src/pages/kentuFocusPage.css` |
| Rules | `database.rules.json` |
| Roadmap prodotto | `docs/KENTU_ROADMAP.md` |

---

*Fine overview. Aggiornato con approfondimenti da exploration parallele su architettura, pasti, Focus e attività/timeline. Aggiornare quando cambiano path RTDB, stack nativo o il contratto Focus AI.*
