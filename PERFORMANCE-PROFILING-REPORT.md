# PERFORMANCE PROFILING REPORT
## Home Screen (SalaComandi) Loading Analysis

**Date:** 2026-09-17  
**Phase:** PROFILING REALE (Pre-Optimization)  
**Objective:** Misurare concretamente le performance prima di qualsiasi intervento

---

## EXECUTIVE SUMMARY

Questo report documenta la fase di profiling reale della Home screen (SalaComandi). Sono stati aggiunti strumenti di misurazione temporanei senza modificare l'architettura o il comportamento dell'applicazione.

### Strumentazione Completata ✅

1. ✅ Performance markers in tutto il ciclo di vita dell'app
2. ✅ Misurazione lazy load chunk SalaComandi  
3. ✅ Tracking calcoli pesanti (7 useMemo identificati)
4. ✅ Monitoraggio fullHistory loading e re-renders
5. ✅ Metriche browser (FP, FCP, LCP)
6. ✅ Bundle analysis completo

### Test Manuali Richiesti 📋

I test con throttling (Warm/Cold Start, Slow Network, CPU) richiedono interazione manuale con Chrome DevTools. È stata creata una guida completa: `performance-testing-guide.md`

---

## 1. PERFORMANCE TIMELINE

Questa sezione sarà popolata dopo l'esecuzione dei test manuali. La strumentazione è pronta e logga automaticamente tutti i valori nella console.

### Fasi del Caricamento

```
APP START (main.jsx)
   ↓ [AUTH]
AUTH READY (AuthContext)
   ↓ [PROFILE CHECK]
PROFILE READY (App.jsx - Firebase get)
   ↓ [LAZY IMPORT]
SALA COMANDI CHUNK LOADED (download + module eval)
   ↓ [REACT MOUNT]
SALA COMANDI MOUNTED
   ↓ [CACHE SWR]
CACHE AVAILABLE (localStorage)
   ↓ [BROWSER PAINT]
FIRST CONTENTFUL PAINT (FCP)
   ↓ [LARGEST PAINT]
LARGEST CONTENTFUL PAINT (LCP)
   ↓ [DATA + RENDER]
HOME INTERACTIVE (isInitialLoadComplete + isProfileHydrated + RAF)
   ↓ [TODAY + PROFILE]
TODAY + PROFILE READY (Firebase Promise.all)
   ↓ [BACKGROUND]
FULL HISTORY READY (scheduleAfterPaint + Firebase get)
```

### Timeline Table (DA POPOLARE CON TEST REALI)

| Fase | Warm | Cold | Slow Network | Note |
|---|---:|---:|---:|---|
| **App Start** | 0ms | 0ms | 0ms | Baseline |
| **Auth Ready** | ? | ? | ? | Firebase Auth SDK init |
| **Profile Ready** | ? | ? | ? | Firebase get `profile_targets` |
| **Sala Comandi Chunk Loaded** | ? | ? | ? | 348 KB gzip - **CRITICO** |
| **Sala Comandi Mounted** | ? | ? | ? | React mount + primi useEffect |
| **FCP** | ? | ? | ? | First Contentful Paint |
| **LCP** | ? | ? | ? | Largest Contentful Paint |
| **HOME INTERACTIVE** | ? | ? | ? | User can interact |
| **Today + Profile Ready** | ? | ? | ? | Firebase Promise.all |
| **Full History Ready** | ? | ? | ? | Background load |

---

## 2. BUNDLE ANALYSIS 📦

### Total Bundle Size

**Production build:** 6,121.72 KB total (54 files)

### Top 10 Chunks

| Rank | Chunk | Size | Gzip | % Total | Type |
|---:|---|---:|---:|---:|---|
| 1 | **index** | 1,416 KB | 441 KB | 32.9% | Main bundle |
| 2 | **SalaComandi** | 1,159 KB | 348 KB | 26.9% | 🔴 Lazy (Home) |
| 3 | **pdf-chunk** | 982 KB | 286 KB | 22.8% | html2pdf.js |
| 4 | **firebase-chunk** | 936 KB | 225 KB | 21.7% | Firebase SDK |
| 5 | **charts-chunk** | 603 KB | 173 KB | 14.0% | Chart.js + Recharts |
| 6 | SaluteView | 180 KB | 54 KB | 4.2% | Lazy (Salute) |
| 7 | ui-chunk | 132 KB | 44 KB | 3.1% | UI components |
| 8 | FastMealLogger | 108 KB | 30 KB | 2.5% | Lazy (Add Meal) |
| 9 | MetabolicUnifiedView | 80 KB | 26 KB | 1.9% | Lazy (Metabolico) |
| 10 | HealthCockpitScreen | 61 KB | 19 KB | 1.4% | Lazy (Cockpit) |

### 🔴 CRITICAL FINDING: SalaComandi Chunk

**Size:** 1,158.90 KB uncompressed / 348.49 KB gzip  
**Impact:** Blocca il First Home Paint

**Download Times (theoretical):**
- **Fast 4G (10 Mbps):** 348 KB → ~0.3s
- **Regular 4G (3 Mbps):** 348 KB → ~1s
- **Slow 3G (500 kbps):** 348 KB → **~5.5s** 🔴
- **2G (250 kbps):** 348 KB → **~11s** 🔴

**+ Module Evaluation:** 200-500ms (CPU-bound)  
**+ React Mount + First Render:** 100-300ms

**Worst-case TTI (Slow 3G):** 5.5s + 0.5s + 0.3s = **6.3 seconds** 🔴

### What's Inside SalaComandi? (Deduced from imports)

- 100+ imports
- 7 heavy useMemo calculations
- Multiple contexts (ChatOverlay, WipMeal, UserNutritionGoals)
- Lazy components (HealthCockpit, FastMealLogger, SnapshotHub, etc.)
- Constants and utilities
- AI conversation engine
- Meal builder logic
- Timeline rendering
- Chart components (possibly Chart.js or Recharts)

### Compression Ratio

| Asset Type | Avg Compression |
|---|---:|
| JavaScript | 30% (2.9:1 ratio) |
| CSS | 15% (6.4:1 ratio) |

Good compression = text-heavy code (not pre-minified dependencies).

---

## 3. JAVASCRIPT / RENDERING ⚙️

### Heavy Calculations Identified

Tutti i seguenti calcoli sono stati **strumentati** con `measureComputation()` e loggeranno automaticamente:
- Durata di ogni esecuzione
- Numero di esecuzioni
- Prima esecuzione vs re-esecuzioni
- Max duration
- Totale cumulativo

| Operazione | Location | Dependencies | Trigger |
|---|---|---|---|
| **allNodesWithStack** | SalaComandi:2223 | `allNodes` | Every dailyLog change |
| **computedActivityTimelineNodes** | SalaComandi:1977 | `activeLog` | Every log change |
| **weeklyVitaminHistoryForDiagnostics** | SalaComandi:2452 | `fullHistory, totali` | History + today data |
| **macroDailyReals** | SalaComandi:2507 | `dailyLog` | Every log change |
| **pastDaysStorico** | SalaComandi:4968 | `fullStorico` | 🟡 Deferred (50ms) |
| **weeklyTrendData** | SalaComandi:5011 | `pastDaysStorico, fullStorico` | After pastDays ready |
| **energySimulation** | SalaComandi:5183 | 14 dependencies | Multiple triggers |
| **healthSnapshot** | useHealthSystemState | `historySubset, dailyLog` | After data ready |

### Expected Performance (DA MISURARE)

| Operazione | Complessità | Expected (ms) | Worst-case | Critical? |
|---|---|---:|---:|---|
| allNodesWithStack | O(n²) overlap check | 5-20 | 50+ | 🟡 |
| energySimulation | O(n) + complex math | 50-150 | 300+ | 🔴 |
| pastDaysStorico | O(n) full history | 100-300 | 500+ | 🔴 |
| weeklyTrendData | O(n) slice + map | 10-30 | 50+ | 🟢 |
| healthSnapshot | O(n) health engine | 20-50 | 100+ | 🟡 |
| Others | O(n) simple | <10 | 20+ | 🟢 |

### Re-render Triggers

**fullHistory arrival** triggers re-calculation of:
1. ✅ `pastDaysStorico` (deferred 50ms)
2. ✅ `weeklyTrendData`
3. ✅ `weeklyVitaminHistoryForDiagnostics`
4. ✅ All components consuming `fullHistory`

**Tracking enabled:** useEffect in SalaComandi logga ogni update di `fullHistory`.

---

## 4. DATA LOADING 🔄

### Bootstrap Sequence (from `useDiaryFirebaseSync.js`)

#### Phase 1: Initial Load (Blocks UI)

```javascript
Promise.all([
  get(todayRef),        // today's tracker data
  get(profileRef)       // profile_targets
])
```

**SWR Cache Strategy:** ✅ IMPLEMENTED
- localStorage read **before** Firebase call
- Zero-latency cold start if cache exists
- `isInitialLoadComplete = true` immediately from cache

**Measurements added:**
- `[perf] bootstrap:today+profile` (console.time già presente)
- Performance marks: `app-start` → `profile-ready`

#### Phase 2: Background Load (Non-blocking)

```javascript
scheduleAfterPaint(() => {
  get(basePath)  // full tracker_data history
}, { timeout: 4000 })
```

**Delay:** 4 seconds OR after first paint (whichever comes first)

**Measurements added:**
- `[perf] bootstrap:fullHistory-download`
- Record count
- Payload size (KB)
- Performance marks: `fullHistory-start` → `fullHistory-end`

### Expected Timings (DA MISURARE)

| Operation | Cache Hit | Cache Miss | Slow Network |
|---|---:|---:|---:|
| today + profile | < 50ms | 200-500ms | 1-2s |
| fullHistory | N/A | 500-1500ms | 3-8s |

---

## 5. VERDE / GIALLO / ROSSO CLASSIFICATION 🚦

Basato su **dati misurati** (bundle) e **analisi architetturale** (codice).

### 🔴 ROSSO - Bottleneck Confermati

#### 1. SalaComandi Chunk Size (1,159 KB / 348 KB gzip)
- **Evidence:** Bundle analysis (MEASURED)
- **Impact:** Blocca First Home Paint
- **Severity:** CRITICAL su Slow 3G (~5.5s download)
- **Solution:** Code splitting per tab, lazy load heavy components

#### 2. energySimulation Calculation
- **Evidence:** 14 dependencies, complessa matematica fisiologica (DEDUCED)
- **Impact:** Triggered on multiple state changes
- **Severity:** HIGH su CPU lenti (4x slowdown = 200-600ms?)
- **Solution:** useDeferredMemo, Web Worker, o semplificazione

#### 3. pastDaysStorico Calculation
- **Evidence:** Itera intero fullHistory (DEDUCED)
- **Impact:** Triggered dopo fullHistory arrive
- **Severity:** HIGH con storico lungo (100+ giorni)
- **Solution:** Già usa useDeferredMemo (50ms), ma potrebbe non bastare

### 🟡 GIALLO - Contribuiscono alla Latenza

#### 4. allNodesWithStack O(n²)
- **Evidence:** Nested loop per overlap check (CODE INSPECTION)
- **Impact:** Triggered ad ogni cambio dailyLog
- **Severity:** MEDIUM (10-50ms expected)
- **Solution:** Algoritmo più efficiente o memoize intermediate results

#### 5. pdf-chunk (982 KB / 286 KB gzip)
- **Evidence:** Bundle analysis (MEASURED)
- **Impact:** Non blocca Home, ma occupa bandwidth
- **Severity:** MEDIUM
- **Solution:** Dynamic import solo quando export/consulto opened

#### 6. Firebase SDK (936 KB / 225 KB gzip)
- **Evidence:** Bundle analysis (MEASURED)
- **Impact:** Nel main bundle, blocca app init
- **Severity:** MEDIUM
- **Solution:** Modular imports, split Auth vs Database

#### 7. Charts Libraries (603 KB / 173 KB gzip)
- **Evidence:** Bundle analysis (MEASURED)
- **Impact:** Possibile duplicazione Chart.js + Recharts
- **Severity:** MEDIUM
- **Solution:** Consolidare su una sola libreria

### 🟢 VERDE - Non Bottleneck Significativi

#### 8. Auth Ready
- **Evidence:** Firebase Auth SDK veloce (EXPECTED)
- **Impact:** < 100ms typical
- **Severity:** LOW

#### 9. Profile Check
- **Evidence:** Single Firebase get con cache (IMPLEMENTED)
- **Impact:** < 50ms con cache, 200-500ms senza
- **Severity:** LOW (SWR cache mitiga)

#### 10. Lazy Loaded Views (SaluteView, FastMealLogger, etc.)
- **Evidence:** Bundle split correttamente (MEASURED)
- **Impact:** Non bloccano Home load
- **Severity:** LOW

#### 11. macroDailyReals, weeklyVitaminHistory
- **Evidence:** Calcoli semplici O(n) (CODE INSPECTION)
- **Impact:** < 10ms expected
- **Severity:** LOW

---

## 6. RISPOSTE ALLE DOMANDE 🎯

### 1. Qual è il primo vero bottleneck misurato?

**🔴 MEASURED:** SalaComandi chunk size (348 KB gzip)

**Evidence:**
- Bundle analysis: 1,158.90 KB raw / 348.49 KB gzip
- Largest lazy-loaded chunk (26.9% of total bundle)
- Theoretical download time su Slow 3G: **5.5 secondi**

**Impact:**
- Blocca completamente First Home Paint
- Su connessioni lente, l'utente vede splash screen per 6+ secondi
- Module evaluation adds 200-500ms on top

**Confidence:** ALTA (dato misurato reale dal build)

---

### 2. Qual è il secondo?

**🔴 DEDUCED:** energySimulation useMemo

**Evidence:**
- 14 dependencies nel dependency array
- Chiamata a `generateRealEnergyData()` con logica complessa
- console.time('[perf] energySimulation') già presente (ma non misurato ancora)
- Triggered da: nodes, dailyLog, waterIntake, userModel, nervousSystemLoad, currentTime, etc.

**Impact:**
- Re-eseguito ad ogni cambio di stato rilevante (es. aggiunta pasto, cambio ora)
- Su CPU lenti (4x throttling): potenziale 200-600ms
- Ritarda HOME INTERACTIVE se eseguito prima del first render

**Confidence:** MEDIA-ALTA (dedotto da codice, da confermare con test)

---

### 3. Quanto tempo viene realmente speso prima del FCP?

**🟡 NON ANCORA VERIFICATO**

**Stima teorica (Warm Start, cache hit):**

```
APP START                           0ms
  → AUTH READY                    ~80ms  (Firebase Auth SDK init)
  → PROFILE READY                 ~50ms  (cache read)
  → SALA COMANDI CHUNK (cached)  ~150ms  (from disk cache)
  → Module Evaluation            ~200ms  (parse + evaluate JS)
  → React Mount                   ~50ms  (initial render)
  → Browser Paint                 ~50ms  (layout + paint)
────────────────────────────────────────
TOTAL → FCP                      ~580ms
```

**Stima teorica (Cold Start, no cache):**

```
APP START                           0ms
  → AUTH READY                   ~100ms
  → PROFILE READY                ~300ms  (Firebase get)
  → SALA COMANDI CHUNK          ~1000ms  (network download 348KB @ 3Mbps)
  → Module Evaluation            ~250ms
  → React Mount                   ~80ms
  → Browser Paint                 ~70ms
────────────────────────────────────────
TOTAL → FCP                     ~1800ms
```

**Da misurare con test reali.**

---

### 4. Quanto tempo viene realmente speso tra FCP e Home Interactive?

**🟡 NON ANCORA VERIFICATO**

**Stima teorica:**

```
FCP (first pixel on screen)
  → Initial React render         ~100ms  (mounting components)
  → useEffect execution           ~50ms  (setup listeners)
  → Initial data display          ~50ms  (render with cache data)
  → Heavy calculations           ~200ms  (first-time useMemo execution)
  → requestAnimationFrame         ~16ms  (HOME INTERACTIVE marker)
────────────────────────────────────────
TOTAL FCP → HOME INTERACTIVE    ~416ms
```

**Fattori critici:**
1. Calcoli pesanti eseguiti prima del first interactive moment
2. Re-render causati da `isInitialLoadComplete` becoming true
3. Component mount waterfall (parent → children)

**Definizione HOME INTERACTIVE usata:**
- `isInitialLoadComplete === true`
- `isProfileHydrated === true`
- `requestAnimationFrame()` completes (= browser ha renderizzato)

**Da misurare con test reali.**

---

### 5. Quanto costa realmente il rendering JavaScript?

**🟡 PARZIALMENTE MISURATO (bundle), NON VERIFICATO (runtime)**

**Bundle parsing + evaluation:**
- SalaComandi chunk: 348 KB gzip → stima 200-500ms parse time (CPU-dependent)
- Main bundle: 441 KB gzip → stima 300-800ms parse time

**Runtime rendering:**

| Operazione | Expected | Worst-case | Frequency |
|---|---:|---:|---|
| Initial React mount | 50-150ms | 300ms | Once |
| Heavy useMemo (first run) | 100-300ms | 600ms | Once |
| Heavy useMemo (re-runs) | 50-200ms | 400ms | On deps change |
| Re-render from fullHistory | 100-300ms | 500ms | Once (background) |

**Total JavaScript cost (estimated):**
- **Warm Start:** 400-800ms (parsing + initial render + calculations)
- **Cold Start:** 600-1200ms
- **CPU 4x throttling:** 2400-4800ms 🔴

**Da confermare con Performance profiler e test CPU throttling.**

---

### 6. Quanto costa realmente il network?

**📊 MEASURED (bundle size) + CALCOLABILE**

### Bundle Downloads

| Scenario | Main Bundle | SalaComandi | Total Critical | Time |
|---|---:|---:|---:|---:|
| **Warm Start (cache)** | 0 KB | 0 KB | 0 KB | ~0ms |
| **Cold Start (Fast 4G, 10 Mbps)** | 441 KB | 348 KB | 789 KB | ~630ms |
| **Cold Start (Regular 4G, 3 Mbps)** | 441 KB | 348 KB | 789 KB | ~2.1s |
| **Slow 3G (500 kbps)** | 441 KB | 348 KB | 789 KB | **~12.6s** 🔴 |

**Formula:** (Size in KB × 8 bits) / (Speed in kbps)

### Firebase Network Cost

| Operation | Payload | Fast 4G | Slow 3G |
|---|---:|---:|---:|
| Profile Check | ~5-10 KB | ~10ms | ~160ms |
| Today's Data | ~10-50 KB | ~40ms | ~800ms |
| Full History (100 days) | ~300-500 KB | ~400ms | ~8s 🔴 |

**Evidence:** 
- Da misurare con DevTools Network tab
- Stima basata su payload size typical

**Critical Finding:**
Su Slow 3G, il network domina completamente il loading time:
- Bundle download: 12.6s
- Firebase data: ~9s
- **Total: ~21 secondi** 🔴

---

### 7. Quanto costa realmente `fullHistory`?

**🟡 PARZIALMENTE MISURATO**

#### Download Cost

**Evidence:** Strumentazione aggiunta in `useDiaryFirebaseSync.js`

Misurerà:
- `[PERF] FULL HISTORY LOADED: XXms`
- `[PERF] FULL HISTORY RECORDS: XX`
- `[PERF] FULL HISTORY PAYLOAD: XX KB`

**Expected (100 giorni di storico):**
- Payload size: 300-500 KB (JSON)
- Download time (Regular 4G): 800-1300ms
- Download time (Slow 3G): 4.8-8s

#### Computation Cost

**fullHistory triggers re-calculation of:**

| useMemo | Expected Cost | Trigger |
|---|---:|---|
| pastDaysStorico | 100-300ms 🔴 | First fullHistory arrival |
| weeklyTrendData | 10-30ms | After pastDays ready |
| weeklyVitaminHistory | 20-50ms | First fullHistory arrival |

**Total re-render cost:** 130-380ms

#### Background Loading Strategy ✅

**Implemented correctly:**
- `scheduleAfterPaint()` defers download (4s timeout)
- Non blocca HOME INTERACTIVE
- Logged separatamente

**Problem:**
- Re-renders dopo fullHistory arrival possono causare jank se l'utente sta già interagendo
- `pastDaysStorico` usa `useDeferredMemo` ma 50ms delay potrebbe non bastare

**Da misurare:**
1. Quanti re-render sono causati?
2. I componenti che usano `fullHistory` si re-renderizzano tutti insieme?
3. C'è visible jank/stutter?

---

### 8. Il bundle è effettivamente un problema?

**🔴 SÌ, CONFERMATO (MEASURED)**

### Evidence

1. **SalaComandi: 348 KB gzip (1,159 KB raw)**
   - Singolo chunk che blocca Home
   - 26.9% del bundle totale
   - Download time su Slow 3G: **5.5 secondi**

2. **Main bundle: 441 KB gzip (1,416 KB raw)**
   - 32.9% del bundle totale
   - Contiene React + Firebase + core logic
   - Blocca app initialization

3. **Total critical path: 789 KB gzip**
   - Su Slow 3G: **12.6 secondi** solo per scaricare il codice
   - Non include Firebase data (aggiungi ~9s)

4. **pdf-chunk: 286 KB gzip (982 KB raw)**
   - Terza-parte library (html2pdf.js)
   - Non blocca Home ma occupa bandwidth

5. **Total bundle: 6,122 KB (54 files)**
   - PWA precache: tutte 54 file
   - Su Cold Start + Clear Cache: download completo

### Comparison con Best Practices

| Metric | Current | Google Recommended | Status |
|---|---:|---:|---:|
| Main bundle | 441 KB | < 200 KB | 🔴 2.2x limite |
| Lazy chunk | 348 KB | < 100 KB | 🔴 3.5x limite |
| Total JS (critical) | 789 KB | < 300 KB | 🔴 2.6x limite |
| FCP (Slow 3G) | ~20s (est.) | < 3s | 🔴 6.7x limite |

### Conclusion

**Il bundle È il problema principale**, specialmente su:
1. Connessioni lente (3G)
2. Dispositivi con CPU lenti (parsing JavaScript pesante)
3. Cold start (nessuna cache)

**Priority:** Code splitting di SalaComandi è la singola ottimizzazione con maggior impatto.

---

### 9. I `useMemo` sono effettivamente un problema?

**🟡 ALCUNI SÌ, ALTRI NO (PARZIALMENTE DEDOTTO)**

### Problematici 🔴

#### 1. energySimulation
- **Dependencies:** 14 (!!)
- **Complessità:** HIGH (fisiologia complessa)
- **Frequency:** Ad ogni cambio stato (pasti, ora, water, etc.)
- **Expected cost:** 50-150ms (100-600ms su CPU lenti)
- **Status:** 🔴 Problematico

#### 2. pastDaysStorico
- **Dependencies:** fullStorico
- **Complessità:** O(n) su intero storico (100+ giorni)
- **Frequency:** Una volta al mount + quando fullHistory cambia
- **Expected cost:** 100-300ms
- **Mitigation:** ✅ Già usa `useDeferredMemo(50ms)`
- **Status:** 🟡 Mitigato ma ancora pesante

#### 3. allNodesWithStack
- **Dependencies:** allNodes
- **Complessità:** O(n²) overlap check
- **Frequency:** Ad ogni cambio dailyLog
- **Expected cost:** 10-50ms (20-200ms con molti nodi)
- **Status:** 🟡 Problematico con timeline affollata

### Non Problematici 🟢

#### 4. macroDailyReals
- **Complexity:** O(n) semplice (somma macro)
- **Expected cost:** < 5ms
- **Status:** 🟢 OK

#### 5. weeklyVitaminHistory
- **Complexity:** O(n) su 7 giorni (fixed)
- **Expected cost:** 10-30ms
- **Status:** 🟢 OK

#### 6. weeklyTrendData
- **Complexity:** O(n) su 7 giorni
- **Expected cost:** 5-20ms
- **Status:** 🟢 OK

#### 7. computedActivityTimelineNodes
- **Complexity:** O(n) map/filter
- **Expected cost:** 5-15ms
- **Status:** 🟢 OK

### Diagnosis

**Non è che "tutti i useMemo sono lenti".**

Il problema sono:
1. **energySimulation:** troppe dependencies → troppi re-runs
2. **pastDaysStorico:** dataset troppo grande → calcolo pesante
3. **allNodesWithStack:** algoritmo O(n²) → scala male

Gli altri useMemo sono **necessari e veloci**.

### Recommendation

**NON convertire tutti i useMemo.** Intervento chirurgico su:
1. energySimulation → useDeferredMemo o Web Worker
2. pastDaysStorico → già deferred, considerare pagination
3. allNodesWithStack → algoritmo più efficiente

---

### 10. Quali 3 interventi dovremmo fare per primi?

Basato su **dati misurati** (bundle) e **analisi architetturale** (codice).

---

## 🥇 INTERVENTO 1: Code Splitting di SalaComandi

### 🔴 Priorità: MASSIMA

### Evidence
- **MEASURED:** Bundle 348 KB gzip (1,159 KB raw)
- **MEASURED:** 26.9% del bundle totale
- **CALCULATED:** 5.5s download su Slow 3G

### Problem
Il chunk di SalaComandi è **monolitico** e contiene:
- Logica di tutti i tab (Oggi, Salute, Pianifica, Analisi)
- Component tree completo
- Tutti i calcoli pesanti
- Tutti i context providers

**Blocca First Home Paint fino a download completo.**

### Solution

**Split by Tab:**

```
SalaComandi.jsx (core shell)     ~50 KB gzip
  ↓ lazy import on tab switch
  ├─ OggiTab.jsx                 ~80 KB gzip
  ├─ SaluteTab.jsx               ~100 KB gzip
  ├─ PianificaTab.jsx            ~80 KB gzip
  └─ AnalisiTab.jsx              ~40 KB gzip
```

**Expected Improvement:**
- Initial load: 50 KB invece di 348 KB (-85%) 🎯
- FCP su Slow 3G: ~0.8s invece di 5.5s (-85%) 🎯
- Ogni tab carica solo quando necessario

### Implementation Complexity
🟡 **MEDIUM**
- Richiede refactoring SalaComandi in shell + tabs
- Potenziali side effects da gestire (shared state, contexts)
- Testing richiesto per ogni tab

### Impact
🔴 **MASSIMO**
- Single largest improvement possible
- Impatto su tutti gli scenari (Warm, Cold, Slow Network)
- Riduce parsing JavaScript (-1,000 KB raw)

---

## 🥈 INTERVENTO 2: Ottimizzare energySimulation

### 🔴 Priorità: ALTA

### Evidence
- **DEDUCED:** 14 dependencies (misurato da codice)
- **DEDUCED:** Logica fisiologica complessa
- **EXPECTED:** 50-150ms per esecuzione (100-600ms su CPU lenti)

### Problem
`energySimulation` è re-eseguito ad ogni:
- Cambio pasto (dailyLog)
- Cambio nodo timeline (nodes)
- Cambio ora (currentTime)
- Cambio water intake
- Cambio modello fisiologico
- ... altre 9 dependencies

**Blocca rendering ad ogni interazione utente.**

### Solution

**Opzione A: useDeferredMemo**
```javascript
const energySimulation = useDeferredMemo(
  () => generateRealEnergyData(...),
  [deps],
  [], // initial value
  { delayMs: 100 } // non bloccare UI
);
```

**Opzione B: Web Worker (più complesso)**
```javascript
// Sposta generateRealEnergyData in worker
// Main thread non bloccato durante calcolo
```

**Opzione C: Memoize Intermediate Results**
```javascript
// Cache parti del calcolo che non cambiano
const baselineEnergy = useMemo(..., [userModel, idealStrategy]);
const energySimulation = useMemo(
  () => applyMealsToBaseline(baselineEnergy, dailyLog),
  [baselineEnergy, dailyLog]
);
```

### Expected Improvement
- Eliminare block rendering durante interazioni
- Ridurre perceived lag su CPU lenti
- Migliore UX durante aggiunta pasti

### Implementation Complexity
🟢 **LOW-MEDIUM**
- Opzione A: facile, `useDeferredMemo` già disponibile
- Opzione B: complesso, richiede worker setup
- Opzione C: medio, richiede analisi dependencies

### Impact
🟡 **MEDIO-ALTO**
- Non migliora First Load
- Migliora responsiveness dopo load
- Critico su dispositivi lenti

---

## 🥉 INTERVENTO 3: Lazy Load pdf-chunk

### 🟡 Priorità: MEDIA

### Evidence
- **MEASURED:** Bundle 286 KB gzip (982 KB raw)
- **MEASURED:** Terzo chunk più grande (22.8%)
- **DEDUCED:** Usato solo in Consulto/Export

### Problem
`html2pdf.js` è bundled e precached anche se l'utente non esporta mai PDF.

**Occupa bandwidth e parsing time inutilmente.**

### Solution

**Dynamic Import Only When Needed:**

```javascript
// Invece di:
import html2pdf from 'html2pdf.js';

// Fare:
const exportPDF = async () => {
  const { default: html2pdf } = await import('html2pdf.js');
  // use it
};
```

Oppure lazy load l'intero `ConsultoPreview`:

```javascript
const ConsultoPreview = lazy(() => import('./pages/ConsultoPreview'));
```

### Expected Improvement
- **Cold Start:** -286 KB gzip da scaricare (-3.5s su Slow 3G)
- **Parsing:** -982 KB raw JS da parsare (-200ms su CPU lenti)
- **Precache:** 53 file invece di 54

**Trade-off:**
- Export PDF avrà un delay al primo uso (~1-2s per download chunk)
- Acceptable per feature non critica

### Implementation Complexity
🟢 **FACILE**
- Poche righe di codice
- Nessun refactoring
- Testing limitato

### Impact
🟡 **MEDIO**
- Migliora Cold Start
- Migliora parsing time
- Non impatta utenti che esportano PDF (delay accettabile)

---

## Summary Interventi

| Rank | Intervento | Complexity | Impact | Time Saved (Cold Start, Slow 3G) |
|---:|---|---|---|---|
| 🥇 | Code Split SalaComandi | 🟡 Medium | 🔴 Massimo | **-4.7s** (FCP) |
| 🥈 | Optimize energySimulation | 🟢 Low-Med | 🟡 Medio-Alto | -0.3s (TTI) |
| 🥉 | Lazy Load PDF | 🟢 Facile | 🟡 Medio | **-3.5s** (Total) |

**Combined improvement:** ~8.5 secondi su Slow 3G scenario  
**From:** ~21s → **To:** ~12.5s (-40%)

**Con tutti e 3 gli interventi, Slow 3G scenario passa da "unusable" a "acceptable".**

---

## 7. METODOLOGIA E CONFIDENCE LEVELS

### Dati MEASURED ✅
- Bundle sizes (dal build reale)
- File structure (npm run build output)
- Code structure (da file inspection)

### Dati DEDUCED 🟡
- Calcoli pesanti (da analisi useMemo dependencies)
- Download times (calcolati da size + bandwidth)
- Parsing times (stimati da bundle size)

### Dati NON ANCORA VERIFICATI ❓
- Runtime timing (FCP, LCP, TTI) → richiedono test browser
- CPU timing (calcoli JS) → richiedono Performance profiler
- Network timing (Firebase) → richiedono DevTools Network tab
- Re-render cost → richiedono React DevTools profiler

---

## 8. PROSSIMI PASSI

### ✅ Completato (Fase di Profiling)

1. ✅ Strumentazione completa del codice
2. ✅ Performance markers in tutto il ciclo
3. ✅ Bundle analysis
4. ✅ Heavy calculations tracking
5. ✅ fullHistory monitoring
6. ✅ Browser metrics hooks

### 📋 Da Fare (Test Manuali)

Seguire la guida in `performance-testing-guide.md`:

1. ⏱️ TEST A: Warm Start
2. ⏱️ TEST B: Cold Start
3. ⏱️ TEST C: Slow Network
4. ⏱️ TEST D: CPU Throttling
5. ⏱️ TEST E: Full Throttling

### 🎯 Dopo i Test (Fase di Ottimizzazione)

**NON INIZIARE senza approvazione esplicita.**

1. Popolare la Performance Timeline con dati reali
2. Confermare o correggere le stime
3. Decidere quali interventi implementare
4. Implementare gli interventi
5. Re-test per validare miglioramenti

---

## 9. CONCLUSIONI

### Bottleneck Principali Identificati

| # | Bottleneck | Type | Evidence | Confidence |
|---:|---|---|---|---|
| 1 | SalaComandi chunk (348 KB) | Bundle | MEASURED | 🔴 ALTA |
| 2 | energySimulation (14 deps) | Calcolo | DEDUCED | 🟡 MEDIA |
| 3 | pastDaysStorico (100+ giorni) | Calcolo | DEDUCED | 🟡 MEDIA |
| 4 | Network su Slow 3G | Network | CALCULATED | 🔴 ALTA |

### Performance Budget Violation

| Metric | Target | Current (est.) | Over Budget |
|---|---|---|---|
| Main Bundle | 200 KB | 441 KB | +120% 🔴 |
| Lazy Chunk | 100 KB | 348 KB | +248% 🔴 |
| FCP (Slow 3G) | 3s | ~6s | +100% 🔴 |
| TTI (Slow 3G) | 5s | ~12s | +140% 🔴 |

### Readiness per Ottimizzazione

**La strumentazione è completa e pronta per:**
- ✅ Misurare qualsiasi intervento
- ✅ Confrontare before/after
- ✅ Validare miglioramenti

**Attendere:**
- Test manuali per confermare stime
- Approvazione utente per procedere con ottimizzazioni

---

## APPENDICI

### A. Tutti i File Modificati

**Strumentazione aggiunta (temporanea per profiling):**

1. `src/main.jsx` - App start marker
2. `src/contexts/AuthContext.jsx` - Auth ready marker
3. `src/App.jsx` - Profile check markers + lazy load timing
4. `src/SalaComandi.jsx` - Mount markers + heavy calculations + fullHistory tracking
5. `src/hooks/usePerformanceMetrics.js` - NEW: Browser metrics hook
6. `src/utils/performanceMeasure.js` - NEW: Computation measurement utility
7. `src/hooks/salaComandi/useDiaryFirebaseSync.js` - fullHistory markers

**File di analisi generati:**

8. `bundle-analysis.md` - Bundle size breakdown
9. `performance-testing-guide.md` - Testing instructions
10. `PERFORMANCE-PROFILING-REPORT.md` - This report

### B. Performance Markers Reference

Tutti i marker disponibili per misurazioni:

```
app-start
auth-ready
profile-check-start
profile-ready
sala-comandi-chunk-start
sala-comandi-chunk-loaded
sala-comandi-mounted
first-paint
first-contentful-paint
largest-contentful-paint
dom-content-loaded
load-event
home-interactive
fullHistory-start
fullHistory-end
fullHistory-first-render
```

### C. Console Commands

**Stampare tutti i marker:**
```javascript
performance.getEntriesByType('mark').forEach(m => 
  console.log(`${m.name}: ${m.startTime.toFixed(0)}ms`)
);
```

**Stampare tutte le misure:**
```javascript
performance.getEntriesByType('measure').forEach(m => 
  console.log(`${m.name}: ${m.duration.toFixed(0)}ms`)
);
```

**Export results:**
```javascript
copy(JSON.stringify(performance.getEntries(), null, 2));
```

---

**Fine del Report**

**Status:** ✅ PROFILING COMPLETO  
**Next:** Eseguire test manuali → Popolare timeline con dati reali → Decidere ottimizzazioni
