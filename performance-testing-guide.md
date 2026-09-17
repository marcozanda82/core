# Performance Testing Guide

## Setup

L'app è stata strumentata con misurazioni di performance complete. Tutte le metriche vengono loggato automaticamente nella console del browser.

**Dev Server:** `http://localhost:5174/`

## Test da eseguire

### TEST A: Warm Start (Cache presente)

**Prerequisiti:**
1. Apri l'app almeno una volta
2. Chiudi il browser SENZA pulire la cache
3. Riapri il browser

**Procedura:**
1. Apri Chrome DevTools (F12)
2. Vai alla tab Console
3. Naviga a `http://localhost:5174/`
4. Fai login (se necessario)
5. Attendi il caricamento completo della Home

**Metriche da raccogliere dalla console:**
- `[PERF] APP START marked at`
- `[PERF] AUTH READY:`
- `[PERF] PROFILE CHECK:`
- `[PERF] APP → PROFILE READY:`
- `[PERF] SALA COMANDI CHUNK LOADED:`
- `[PERF] SALA COMANDI MOUNT:`
- `[PERF] First Paint (FP):`
- `[PERF] First Contentful Paint (FCP):`
- `[PERF] Largest Contentful Paint (LCP):`
- `[PERF] HOME INTERACTIVE:`
- `[PERF] FULL HISTORY LOADED:`
- `[PERF] allNodesWithStack:` (prima esecuzione)
- `[PERF] weeklyVitaminHistoryForDiagnostics:` (prima esecuzione)
- Altri calcoli pesanti

**Metriche da raccogliere da DevTools > Network:**
- Total transfer size
- Total resources
- Finish time
- DOMContentLoaded time
- Load time

---

### TEST B: Cold Start (Cache pulita)

**Prerequisiti:**
1. Apri Chrome DevTools (F12)
2. Vai a Application > Storage > Clear site data
3. Oppure usa Ctrl+Shift+Delete e pulisci "Cached images and files" per ultimo giorno

**Procedura:**
1. Con DevTools aperto, vai alla tab Console
2. Naviga a `http://localhost:5174/`
3. Fai login
4. Attendi il caricamento completo della Home

**Metriche da raccogliere:** Stesse del TEST A

**Differenze attese:**
- FCP e LCP dovrebbero essere più lunghi
- `SALA COMANDI CHUNK LOADED` dovrebbe essere più lungo (download reale vs cached)
- `FULL HISTORY LOADED` potrebbe essere simile (viene da Firebase, non da cache browser)

---

### TEST C: Slow Network (Cold Start + Throttling)

**Prerequisiti:**
1. Pulisci cache (come TEST B)
2. Apri DevTools > Network tab
3. Nel dropdown "No throttling", seleziona **"Slow 3G"**

**Procedura:**
1. Con throttling attivo, naviga a `http://localhost:5174/`
2. Fai login (sarà lento)
3. Attendi il caricamento completo della Home
4. Raccogli le stesse metriche

**Metriche critiche da notare:**
- Quanto aumenta `SALA COMANDI CHUNK LOADED`?
- Quanto aumenta `FCP` e `LCP`?
- `HOME INTERACTIVE` è accettabile?

**Slow 3G settings:**
- Download: 500 kbps
- Upload: 500 kbps
- Latency: 2000ms

**Calcolo teorico:**
- SalaComandi chunk: 348 KB gzip
- Tempo download teorico: (348 KB * 8) / 500 kbps = ~5.5 secondi
- Con latency + parsing: ~6-7 secondi previsti

---

### TEST D: CPU Throttling (Warm Start + CPU Slow)

**Prerequisiti:**
1. Cache presente (non pulire)
2. Apri DevTools > Performance tab
3. Click sull'icona Settings (ingranaggio)
4. Imposta CPU: **4x slowdown**

**Procedura:**
1. Con CPU throttling attivo, naviga a `http://localhost:5174/`
2. Fai login
3. Attendi il caricamento completo della Home
4. Raccogli le metriche dalla Console

**Metriche critiche da notare:**
- I tempi di download (`CHUNK LOADED`) dovrebbero essere simili al Warm Start
- I tempi di calcolo dovrebbero essere 4x più lunghi:
  - `allNodesWithStack`
  - `energySimulation`
  - `pastDaysStorico`
  - `weeklyTrendData`
- `HOME INTERACTIVE` potrebbe essere significativamente più lungo

---

### TEST E: Full Throttling (Cold Start + Slow 3G + CPU 4x)

**Prerequisiti:**
1. Pulisci cache
2. Network: Slow 3G
3. CPU: 4x slowdown

**Procedura:**
1. Naviga a `http://localhost:5174/`
2. Fai login (molto lento)
3. Attendi il caricamento completo della Home
4. Raccogli le metriche

**Scenario:** Simula un dispositivo vecchio (es. Android 2018) con connessione 3G lenta.

---

## Metriche Aggiuntive

### fullHistory Re-renders

Dopo il caricamento iniziale della Home, controlla la console per:

```
[PERF] fullHistory updated (load #1)
[PERF] fullHistory keys: XX
[PERF] APP → FULL HISTORY FIRST RENDER: XXXms
```

Poi verifica se ci sono esecuzioni multiple dei calcoli pesanti:

```
[PERF] allNodesWithStack: XXXms (execution #2, ...)
[PERF] weeklyTrendData: XXXms (execution #2, ...)
```

Questo indica quanti re-render sono causati da `fullHistory`.

---

## Comandi Utili

### Generare report performance automatico

In Console DevTools, esegui:

```javascript
// Stampa tutte le performance marks e measures
performance.getEntries().filter(e => e.name.includes('perf')).forEach(e => {
  console.log(`${e.entryType}: ${e.name} = ${e.duration || e.startTime}ms`);
});

// Ottieni il report dei calcoli pesanti
// (se hai importato il modulo performanceMeasure)
// printPerformanceReport();
```

### Salvare i risultati

```javascript
// Copia tutti i log di performance
copy(
  performance.getEntries()
    .filter(e => e.name.includes('app') || e.name.includes('sala') || e.name.includes('home'))
    .map(e => `${e.name}: ${e.duration || e.startTime}ms`)
    .join('\n')
);
```

---

## Note

- Tutti i test dovrebbero essere eseguiti in **modalità incognito** per evitare interferenze da estensioni
- **Importante:** Non fare refresh durante il caricamento, lascia che l'app completi il bootstrap
- I test possono essere ripetuti 3 volte e fare la media per maggiore accuratezza
- Se vedi errori nella console, annotali nel report

---

## Risultati Attesi

### Baseline (Warm Start, no throttling)
- APP → AUTH READY: < 100ms
- APP → PROFILE READY: < 200ms
- APP → FCP: < 500ms
- APP → HOME INTERACTIVE: < 1500ms
- SALA COMANDI CHUNK LOADED: < 200ms (da cache)

### Cold Start
- APP → FCP: < 1000ms
- APP → HOME INTERACTIVE: < 2500ms
- SALA COMANDI CHUNK LOADED: 500-1000ms (download reale)

### Slow Network
- APP → FCP: < 3000ms
- APP → HOME INTERACTIVE: < 8000ms
- SALA COMANDI CHUNK LOADED: 5000-7000ms

### CPU Throttling (4x)
- Calcoli pesanti: 4x tempo normale
- Download tempi: uguali a baseline
- HOME INTERACTIVE: potrebbe raddoppiare

---

## Dopo i Test

Una volta raccolti tutti i dati, crea un file `performance-results.json` con questa struttura:

```json
{
  "warmStart": {
    "authReady": 95,
    "profileReady": 180,
    "fcp": 420,
    "lcp": 680,
    "homeInteractive": 1200,
    "salaComandi": {
      "chunkLoad": 180,
      "mount": 45
    },
    "fullHistory": {
      "load": 2100,
      "records": 120,
      "payloadKB": 450
    },
    "heavyCalculations": {
      "allNodesWithStack": { "first": 12, "reexec": 1, "max": 15 },
      "energySimulation": { "first": 85, "reexec": 2, "max": 92 },
      ...
    }
  },
  "coldStart": { ... },
  "slowNetwork": { ... },
  "cpuThrottling": { ... }
}
```

Questo verrà usato per generare il report finale.
