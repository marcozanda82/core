# MetabolicState — Fase B: analisi e proposta tecnica (Kentu)

**Ambito:** unificazione semantica di stato corporeo, direzione recente, traiettoria, confidenza e persistenza — **senza** modificare formule, runtime dell’app né UI in questa fase.

**Prerequisito:** Fase A (dead-band, label attenuate, quadranti morbidi, downgrade anabolico in equilibrio energetico) già integrata nel bundle `computeMetabolicMapCompassBundle`.

---

## 1. Dove si calcola così com’è oggi

### 1.1 Posizione mappa (punto aggregato periodo)

| Livello | File | Responsabilità |
|--------|------|----------------|
| Medie input periodo + audit | `src/metabolicMapPeriodInputs.js` (`computeMetabolicMapInputsAndAudit`, `computeMetabolicMapInputsFromDailyHistory`) | Slice temporale (1d/7d/14d/30d), media `kcalBalance` con **dead-band** sul medio, media training → assi mappa (`energyBalance`, `trainingLoad`), sonno imputato, **glycemicInstability** teorica da surplus medio / sonno / varianza. |
| Geometria punto | `src/metabolicMapEngine.js` (`calculateMetabolicMapPosition` → `computeMetabolicMapPoint`) | Combina `energyBalance`, `trainingLoad`, `sleepHours` (modifier x/y), `glycemicInstability` → aura, **clamp**, **distance**, **zone** (green/orange/red da soglie distanza), **quadrante** NW/NE/SW/SE. |
| Bundle aggregato | `src/features/salaComandi/engines/metabolicMapEngine.js` (`computeMetabolicMapCompassBundle`) | Risolve **baseline** (`biometricHistory` + `getLastBiometricData` / `calculateBaselineOffset`), chiama `calculateMetabolicMapPosition` con input da periodo + offset baseline. |

**Punto giornaliero sulla trail (ultimi 7 giorni):** `buildDailyPointFromLogDay` nello stesso file features — dead-band **per giorno** su `kcalBalance`, glycemic **per giorno** semplificato, poi stesso `calculateMetabolicMapPosition`.

### 1.2 Direzione bussola (grande bussola)

| Livello | File | Responsabilità |
|--------|------|----------------|
| Vettore finestra | `src/metabolicDirectionEngine.js` (`computeMetabolicEngineTargetVec`, `normalizeMetabolicDay`, dead-band, media finestra, tweak coerenza x/y) | Piano **normalizzato** (x ≈ bilancio/500 post dead-band, y ≈ training/100) — **non** include sonno né baseline strutturale. |
| Rosa / bearing | `src/metabolicDirection.js` | Direzioni fisse (`METABOLIC_COMPASS_DIRECTIONS`), `metabolicAngleDegToCompassBearingDeg`, helper angoli obiettivo (`computeMetabolicCompassOrientation` per slider/simulazioni). |
| Sector + label display | `src/features/salaComandi/engines/metabolicMapEngine.js` | `nearestCompassSectorLabelFromMetabolicAngleDeg`, `computeCompassSignalStrength`, `gateMetabolicCompassDisplayLabel`, `computeVisualCompassVector`, `buildCompassAmbientStyle`. |

**Fallback standalone** (senza bundle): `MetabolicCompass.jsx` usa `computeMetabolicEngineTargetVec` + `computeMetabolicMapInputsFromDailyHistory` per parity/debug interno.

### 1.3 Traiettoria

| Concetto | File | Note |
|----------|------|------|
| Serie giornaliera (coordinate mappa) | `computeMetabolicMapCompassBundle` → `dailyMapPositions` | Ultimi 7 giorni di log → punti già in spazio mappa. |
| Proiezione numerica | `buildTrajectoryProjection` in `features/.../metabolicMapEngine.js` | Velocità media sugli ultimi segmenti → punto **projected** + **velocity**. |
| Trail SVG | `MetabolicMap.jsx` | Disegna `dailyPositions`; smoothing **inertialTipSvg** (RAF) verso `tipSvg` corrente. |
| Mini-ago sulla mappa | `MetabolicMap.jsx` | **Non** è l’angolo della bussola grande: vettore da centro (punto inerziale) verso `projectedSvg \|\| inertialTipSvg`; dipende da `projectedPosition`, `trajectoryVelocity`, `mapSignalStrength` (scala presentazione). |
| Angolo “map space” vs baseline | `compassAngleDegMapSpace` in `MetabolicMap.jsx` | Metadato **solo UI/diagnostic** per coerenza visiva ancora↔punto. |

### 1.4 Confidenza / segnale

| Output | Origine | Significato attuale |
|--------|---------|---------------------|
| `compassSignalStrength` / `mapSignalStrength` | `computeCompassSignalStrength(rawMagnitude)` su **vettore bussola** (hypot x,y normalizzati) | very_weak / weak / moderate / strong — soglie su magnitudine **compass**, non sulla mappa. |
| Presentazione mappa debole | `buildMapSignalPresentation` (`features/.../metabolicMapEngine.js`) | Ridimensionamento display x/y/aura + titoli/caption quando segnale debole o **zona neutra semantica** (distanza map). |
| Confidenza **peso** | `src/weightProjectionEngine.js` (`computeWeightProjectionFromInputs`) | Score combinato aderenza kcal, completezza log 7g, stabilità pesi → `confidence_label` + giorni proiezione. |
| UI testuale peso | `formatWeightProjectionUI` (stesso modulo) | `lineProjection`, `lineTrend`, `lineConfidence` nel riquadro sopra la mappa in `MetabolicUnifiedView.jsx`. |

### 1.5 Copy / label

| Tipo | Dove |
|------|------|
| Label bussola utente | `gateMetabolicCompassDisplayLabel`, `computeCompassDisplayLabel`, downgrade anabolico / estremi (features `metabolicMapEngine.js`) |
| Quadranti / rischio mappa | `MAP_QUADRANT_RISK_LABELS`, `QUADRANT_RISK_LABELS` in `MetabolicMap.jsx` (+ presentation caption) |
| Coach | `src/features/salaComandi/engines/metabolicCoachEngine.js` (`buildMetabolicCoachInsight`) — legge `mapData` già interpretato (`compassDisplayLabel`, `mapSignalStrength`, `mapPresentation.suppressRiskNarrative`, `distance`, `glycemic`, `longevityScore`; zona ricavata con soglie **duplicate** `zoneFromMapDistance`) |

---

## 2. Dati utili per un `MetabolicState` unico

Schema **proposto** (contratto futuro, non implementato):

```ts
/**
 * MetabolicState — vista unica “Kentu” per stato + dinamica + affidabilità.
 * I campi possono restare derivati da motori esistenti finché le formule non cambiano.
 */
type MetabolicState = {
  /** Contesto temporale e riferimenti energetici (cosa ha letto il modello). */
  calibration: {
    timeframe: '1d' | '7d' | '14d' | '30d';
    referenceTdeeKcal: number;
    energyDeadBandHalfWidthKcal: number;
    windowSlice: { realSleepDays: number; totalWindowDays: number };
    /** Moltiplicatore impatto timeframe sulle medie mappa (da periodInputs). */
    timeframeImpact?: number;
  };

  /**
   * Stato corporeo “dove sono” nello spazio Kentu (mappa): composizione strutturale + comportamento mediato.
   * Non coincide col solo bilancio giornaliero né col solo vettore bussola.
   */
  bodyState: {
    map: {
      x: number;
      y: number;
      zone: 'green' | 'orange' | 'red';
      quadrant: string;
      distance: number;
      finalAura: number;
    };
    baselineStructural: { x: number; y: number };
    /** Score longevity UI (se mantenuto): derivato da coordinate presentate. */
    longevityScore?: number;
    /** Input grezzi periodo per audit (mean kcal, training, dead-band sul medio, ecc.). */
    periodAudit: Record<string, unknown>; // in futuro tipizzare stretto
  };

  /**
   * Direzione metabolica recente (finestra bussola): piano kcal×training normalizzato + semantica rosa.
   */
  metabolicDirection: {
    vector: { x: number; y: number };
    angleDeg: number;
    magnitude: number;
    sectorLabel: string;
    displayLabel: string;
    visualVector: { visualX: number; visualY: number; visualMagnitude: number; rawMagnitude: number };
  };

  /**
   * Moto nel piano mappa: storico corto + extrapolation leggibile.
   */
  trajectory: {
    dailyPositions: Array<{ x: number; y: number; /* + campi da calculateMetabolicMapPosition */ }>;
    projected: { x: number; y: number };
    velocity: number;
    /** Nota esplicita: mini-ago UI combina projected + inerzia locale — va documentato qui, non ricalcolato nel builder senza duplicare MetabolicMap. */
    presentationNote?: string;
  };

  /**
   * Affidabilità del segnale “metabolico integrato” (oggi frammentata).
   */
  confidence: {
    compass: 'very_weak' | 'weak' | 'moderate' | 'strong';
    mapPresentation: {
      suppressRiskNarrative: boolean;
      suppressLongevityWarning: boolean;
      presentationTitle: string | null;
      presentationCaption: string | null;
    } | null;
    weightProjection: {
      score: number;
      label: 'alta' | 'media' | 'bassa';
      adherence: number;
    } | null;
  };

  /**
   * Continuità del pattern energetico (e future estensioni:giorni consecutivi, varianza, ecc.).
   */
  persistence: {
    /** Oggi: frazione giorni con |kcalBalance| fuori dead-band nella finestra bussola. */
    outsideEnergyDeadbandDayFraction: number;
    /** Estensibile: stato sonno, logging streak, ecc. */
    extras?: Record<string, unknown>;
  };
};
```

---

## 3. Mapping immediato dai campi legacy

| Campo `MetabolicState` | Fonte legacy oggi |
|------------------------|-------------------|
| `calibration.timeframe` | `selectedTimeframe` → bundle |
| `calibration.referenceTdeeKcal` | `userTargets.kcal` nel bundle |
| `calibration.energyDeadBandHalfWidthKcal` | `metabolicMapRawDetails.energyDeadBandHalfWidthKcal` |
| `calibration.windowSlice` | `metabolicMapInputs.realSleepDays`, `totalWindowDays` |
| `bodyState.map.*` | Output `calculateMetabolicMapPosition` nel bundle (`mapPosition` top-level x/y duplicate + `zone`, `quadrant`, `distance`, `finalAura`) |
| `bodyState.baselineStructural` | `baselineOffset` |
| `bodyState.periodAudit` | `metabolicMapRawDetails` (+ eventualmente `debug.rawDetails`) |
| `metabolicDirection.*` | `compassDirection`, `rawVector`, `visualVector`, `compassSectorLabel`, `compassDisplayLabel`, `rawMagnitude` |
| `trajectory.dailyPositions` | `dailyMapPositions` |
| `trajectory.projected` / `velocity` | `projectedTrajectory` |
| `confidence.compass` | `compassSignalStrength` / `mapSignalStrength` |
| `confidence.mapPresentation` | `mapPresentation` |
| `confidence.weightProjection` | Output numerico da `computeWeightProjectionFromInputs` (score interno + label + adherence) |
| `persistence.outsideEnergyDeadbandDayFraction` | `computeOutsideEnergyDeadbandDayFraction` (già nel bundle come variabile intermedia; oggi non sempre esposto sul return principale — andrebbe **aggiunto al bundle** in una fase successiva o letto da `debug`) |

---

## 4. Campi mancanti o ambigui

| Tema | Problema |
|------|-----------|
| **Due piani diversi** | Bussola: x,y normalizzati (−1…1 × 0…1) con dead-band **motore direzione**. Mappa: assi **−100…100** dopo scaling diverso (`energyBalance/5`, training mapping 35→65, sonno, baseline). Unificare il **significato** in `MetabolicState` senza confondere i due domini. |
| **`bodyState` vs “solo peso”** | La composizione corporea entra come **offset** (`baselineOffset`), non come punto dinamico separato; non esiste ancora un oggetto “ stato biometrico ” esplicito oltre offset + ultime misure. |
| **Persistenza** | Oggi esiste bene **outside-deadband fraction**; mancano persistenza **costruttiva/anabolica**, streak giorni coerenti, decadimento temporale — utili per modelli inerziali futuri. |
| **Confidenza unica** | `compassSignalStrength` e `weightProjection.confidence` misurano cose diverse (forza vettore vs qualità dati peso); unificarle in un campo sintetico è **ambiguo** senza specifica normativa Kentu. |
| **Mini-ago** | Derivato in React + RAF + opzione `projectedSvg`; non è un output puro del bundle — va referenziato come “presentation trajectory UI” o ricalcolato in modulo dedicato con test snapshot. |
| **`computeMetabolicDirection` in `metabolicDirection.js`** | Modello **grezzo** kcal/500 e training/100 **senza** dead-band — ancora usato per orientation/slider; va tenuto fuori o marcato `legacyRawPlane` rispetto al motore bussola. |
| **Coach `zoneFromMapDistance`** | Duplica soglie zona rispetto a `computeMetabolicMapPoint`; rischio divergenza se una cambia. |

---

## 5. Punto migliore per `buildMetabolicState()`

**Raccomandazione:** introdurre un modulo **puro** (nessun React), ad esempio:

- `src/features/salaComandi/engines/metabolicStateBuilder.js`  
  oppure  
- `src/metabolicState/` con `buildMetabolicState.js` + tipi JSDoc.

**Motivo:**

1. **`computeMetabolicMapCompassBundle`** è già l’orchestratore principale (mappa + bussola + trail + peso + presentazione). Arricchirlo solo con un oggetto nominato mantiene **una pipeline** e riduce drift.
2. Separare **`buildMetabolicState`** in file dedicato consente di:
   - importare il bundle esistente **oppure** le funzioni atomiche, a seconda della fase di migrazione;
   - aggiungere **normalizzazione / naming** senza intaccare le firme attuali del bundle finché la UI non migra.
3. **`useMetabolicMapEngine`** resterebbe il punto unico React che chiama `buildMetabolicState` quando la UI sarà pronta; finché no, continua a esporre solo il bundle.

Alternativa accettabile: **`computeMetabolicMapCompassBundle` restituisce `{ legacyBundle, metabolicState }`** dopo la Fase B implementativa — meno file, più accoppiamento.

---

## 6. Compatibilità con UI attuale (senza riscrivere subito)

| Componente | Contratto attuale | Strategia |
|------------|-------------------|-----------|
| `MetabolicUnifiedView.jsx` | Consuma `mapData` dal hook (`useMetabolicMapEngine`) | Hook può fare `const mapData = computeMetabolicMapCompassBundle(...)` **oppure** `const { legacy: mapData, metabolicState } = buildMetabolicState(...)` internamente senza cambiare props dei figli finché `legacy` è identico all’oggetto odierno. |
| `MetabolicCompass.jsx` | Props da bundle: `compassDirectionFromBundle`, `visualVectorFromBundle`, `compassDisplayLabelFromBundle`, `mapSignalStrengthFromBundle`, ecc. | Continuare a passare **slice** del bundle; in migrazione, uno slice può essere `metabolicDirection` + `confidence.compass`. |
| `MetabolicMap.jsx` | Props imperative (`energyBalance`, `trainingLoad`, …, `dailyPositions`, `projectedPosition`, `trajectoryVelocity`, `mapPresentation`, …) | Nessun cambiamento: `buildMetabolicState` può esporre `toMetabolicMapProps(state)` adapter che legge `bodyState` + `trajectory` + `confidence.mapPresentation`. |

---

## 7. Piano di migrazione consigliato

### Fase B1 — Adapter compatibile

- Definire **solo tipi/JSDoc** + funzione `buildMetabolicStateFromBundle(bundle)` che ri-etichetta campi esistenti (zero nuova matematica).
- Test unitari su snapshot del bundle (fixtures) per garantire mapping stabile.

### Fase B2 — Output parallelo

- `computeMetabolicMapCompassBundle` (o hook) aggiunge `metabolicState?: MetabolicState` nel return **senza** rimuovere chiavi legacy.
- Feature flag o build dev-only per consumare `metabolicState` in coach o audit.

### Fase B3 — UI graduale

- `metabolicCoachEngine` legge prima da `metabolicState.confidence` + `metabolicDirection.displayLabel` (stessi valori, meno path casuali).
- `MetabolicDataAudit` mostra sezione “MetabolicState debug”.

### Fase B4 — Deprecazione

- Documentare `mapData.debug` e campi duplicati (`x` top-level vs `bodyState.map`) come deprecated.
- Spostare calcoli duplicati (es. `zoneFromMapDistance` nel coach) su helper unico alimentato da `bodyState.map.zone`.

---

## 8. Rischi principali

| Rischio | Mitigazione |
|---------|-------------|
| **Regressione UI** | Adapter che preserva byte-identico il sottoinsieme di props attuali; test visivi / snapshot SVG opzionali per mini-ago. |
| **Doppie fonti di verità** | Tenere **una** funzione che produce `zone`/`distance` mappa e far consumare coach solo `MetabolicState.bodyState.map`. |
| **Incongruenze peso / bussola** | Documentare che **weight trend** è dominio separato (scalabilità 7+7 giorni, aderenza kcal); in `MetabolicState.confidence` tenere due sotto-strutture esplicite, mai un “score unico” implicito. |
| **Performance** | `buildMetabolicStateFromBundle` è O(1) sul bundle già calcolato; evitare ricalcoli dentro render — il memo nel hook resta su `historyFingerprint` + dipendenze. |
| **Naming opaco** | Preferire `bodyState.map` vs `compass.vector` vs `trajectory.projected`; evitare `x,y` generici senza namespace nei nuovi export. |

---

## Riferimenti file (codebase principale `src/`)

- `src/metabolicMapEngine.js` — geometria mappa
- `src/metabolicMapPeriodInputs.js` — medie periodo + glycemic teorico
- `src/metabolicDirectionEngine.js` — vettore bussola finestra
- `src/metabolicDirection.js` — rosa e trasformazioni angolo
- `src/features/salaComandi/engines/metabolicMapEngine.js` — bundle, trail, proiezione, label, presentazione
- `src/features/salaComandi/hooks/useMetabolicMapEngine.js` — hook React
- `src/MetabolicUnifiedView.jsx` — wiring peso + mappa + coach
- `src/MetabolicMap.jsx` — trail, inerzia, mini-ago
- `src/MetabolicCompass.jsx` — bussola + fallback parity
- `src/features/salaComandi/engines/metabolicCoachEngine.js` — copy coach
- `src/weightProjectionEngine.js` — trend peso e confidenza

---

*Documento: Fase B — solo analisi / design. Nessuna modifica runtime applicata in questo step.*
