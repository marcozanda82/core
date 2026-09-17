# Bundle Analysis - Performance Profiling

**Date:** 2026-09-17  
**Build time:** 28.84s

## Chunk Sizes (Sorted by size)

| Chunk | Size (KB) | Gzip (KB) | % of Total | Type |
|---|---:|---:|---:|---|
| **index** | 1,416.47 | 441.34 | 32.9% | Main bundle |
| **SalaComandi** | 1,158.90 | 348.49 | 26.9% | Lazy loaded |
| **pdf-chunk** | 982.47 | 285.53 | 22.8% | Library (html2pdf.js) |
| **firebase-chunk** | 935.69 | 224.75 | 21.7% | Firebase SDK |
| **charts-chunk** | 602.92 | 173.49 | 14.0% | Chart.js + recharts |
| SaluteView | 179.59 | 54.41 | 4.2% | Lazy loaded |
| ui-chunk | 132.24 | 43.71 | 3.1% | UI components |
| FastMealLogger | 107.83 | 29.53 | 2.5% | Lazy loaded |
| MetabolicUnifiedView | 79.84 | 26.13 | 1.9% | Lazy loaded |
| HealthCockpitScreen | 61.07 | 19.03 | 1.4% | Lazy loaded |
| LongevityView | 58.57 | 17.81 | 1.4% | Lazy loaded |
| PlanningWizard | 40.94 | 12.36 | 1.0% | Lazy loaded |
| TimelineNodi | 33.73 | 9.99 | 0.8% | Lazy loaded |
| MainDashboardCharts | 17.08 | 5.68 | 0.4% | Lazy loaded |
| ProgressioneView | 16.12 | 4.98 | 0.4% | Lazy loaded |
| DevConsoleView | 12.75 | 4.56 | 0.3% | Lazy loaded |
| ArchivioStoricoView | 12.47 | 4.10 | 0.3% | Lazy loaded |
| BiochemicalDiagnostics | 9.82 | 2.89 | 0.2% | Lazy loaded |
| HealthReportView | 9.48 | 3.42 | 0.2% | Lazy loaded |
| Other chunks (<10KB) | ~80 | ~30 | ~2% | Various |

**Total precache:** 6,121.72 KB (54 entries)

## Key Findings

### 🔴 Critical Issues

1. **SalaComandi chunk is 1.16 MB (348 KB gzip)** - Extremely large for a lazy-loaded component
   - This blocks First Home Paint until fully downloaded and parsed
   - On slow 3G: ~17 seconds download time
   - Module evaluation likely adds 200-500ms

2. **Main bundle is 1.42 MB (441 KB gzip)** - Too large for initial load
   - Contains React, Router, Firebase Auth, and core dependencies
   - Blocks app initialization

3. **PDF chunk is 982 KB (285 KB gzip)** - Third-party library
   - html2pdf.js is very heavy
   - Should be loaded only when needed (consulto/export)

### 🟡 Moderate Issues

4. **Firebase chunk is 936 KB (225 KB gzip)**
   - Firebase SDK is bundled together
   - Could be split: Auth vs Database vs Storage

5. **Charts chunk is 603 KB (173 KB gzip)**
   - Contains both Chart.js and Recharts
   - Possibly duplicating functionality

### 🟢 Good

- Lazy loading is implemented for major views (SaluteView, FastMealLogger, etc.)
- CSS is split correctly (18.81 KB for SalaComandi, 314.58 KB for index)
- Smaller components are properly code-split

## Recommendations (NOT TO BE IMPLEMENTED YET)

### Priority 1: SalaComandi Chunk
- Split heavy calculations into separate chunks
- Move large dependencies (recharts?) out of SalaComandi
- Consider splitting by tab (Oggi, Salute, Pianifica, etc.)

### Priority 2: PDF Library
- Move html2pdf.js to dynamic import only when consulto/export is opened
- Investigate lighter alternatives

### Priority 3: Main Bundle
- Audit what's in the main bundle
- Move non-critical Firebase modules to lazy chunks
- Consider using Firebase modular SDK imports

### Priority 4: Charts
- Consolidate to one chart library (Chart.js OR Recharts, not both)
- Or split charts by usage (metabolic vs. nutritional)

## Build Warnings

1. **Duplicate keys in SalaComandi.jsx:**
   - `fullHistory` (line 6855)
   - `manualNodes` (line 6881)
   - `userUid` (line 6885)
   
2. **WorkoutView import conflict:**
   - Dynamically imported by SalaComandi.jsx
   - Statically imported by TrainingBlockCreator.jsx and workoutAdapter.js
   - This prevents proper code splitting

3. **Chunk size warning:**
   - 4 chunks > 500 KB after minification
   - Vite recommends using dynamic imports or manual chunks

## Gzip Compression Ratio

| Type | Avg Compression |
|---|---|
| JavaScript | ~30% (2.9:1) |
| CSS | ~15% (6.4:1) |

Good compression ratios indicate text-heavy bundles (not pre-compressed assets).
