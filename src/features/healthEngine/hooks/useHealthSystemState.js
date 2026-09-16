import { useMemo, useRef } from 'react';
import { getHealthSnapshot } from '../adapters/getHealthSnapshot.js';
import { getHealthSystemState } from '../engines/getHealthSystemState.js';
import { METABOLIC_PHASE_IDS } from '../contracts/healthSnapshot.types.js';

function trackerStoricoKey(dateStr) {
  const iso = String(dateStr || '').slice(0, 10);
  return iso ? `trackerStorico_${iso}` : '';
}

function mapPhaseId(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return null;
  if (s.includes('digest')) return METABOLIC_PHASE_IDS.DIGESTION;
  if (s.includes('assorb') || s.includes('absorb')) return METABOLIC_PHASE_IDS.ABSORPTION;
  return METABOLIC_PHASE_IDS.FASTING;
}

function buildTrackerStoricoDay({ dailyLog, manualNodes, fullHistory, dateStr }) {
  const iso = String(dateStr || '').slice(0, 10);
  const stored = fullHistory && typeof fullHistory === 'object'
    ? fullHistory[trackerStoricoKey(iso)]
    : null;
  const base = stored && typeof stored === 'object' ? stored : {};
  return {
    ...base,
    data: iso || base.data,
    log: Array.isArray(dailyLog) ? dailyLog : (Array.isArray(base.log) ? base.log : []),
    manualNodes: Array.isArray(manualNodes)
      ? manualNodes
      : (Array.isArray(base.manualNodes) ? base.manualNodes : []),
    mealTimes: base.mealTimes && typeof base.mealTimes === 'object' ? base.mealTimes : {},
  };
}

/**
 * Ponte dati app → adapter/motore puri.
 * Non contiene logica fisiologica: orchestra solo getHealthSnapshot + getHealthSystemState.
 *
 * @param {{
 *   dailyLog?: unknown[] | null,
 *   manualNodes?: unknown[] | null,
 *   fullHistory?: object | null,
 *   fourCylinder?: object | null,
 *   userTargets?: object | null,
 *   dateStr?: string,
 *   glycemicPenalty?: number | null,
 *   hoursSinceLastMeal?: number | null,
 *   metabolicPhaseId?: string | null,
 *   nowMs?: number | null,
 *   enabled?: boolean,
 *   isHydrated?: boolean,
 * }} [input]
 */
export function useHealthSystemState({
  dailyLog = null,
  manualNodes = null,
  fullHistory = null,
  fourCylinder = null,
  userTargets = null,
  dateStr = '',
  glycemicPenalty = null,
  hoursSinceLastMeal = null,
  metabolicPhaseId = null,
  nowMs = null,
  enabled = true,
  isHydrated = true,
} = {}) {
  const isLoading = !enabled || !isHydrated;
  const isReady = Boolean(enabled && isHydrated);

  // ⚡ PERFORMANCE FIX: Stabilizza fullHistory per evitare re-render a cascata
  // Estrae solo i dati rilevanti (giorno corrente + ultimi 14 giorni) e li memorizza
  const stableHistoryRef = useRef(null);
  const historySubset = useMemo(() => {
    if (!fullHistory || typeof fullHistory !== 'object') return {};
    
    // 1. Parsing sicuro della data (paracadute per initial render)
    let currentDate = new Date(); // Fallback a oggi
    if (dateStr) {
      const parsedDate = new Date(dateStr);
      if (!isNaN(parsedDate.getTime())) {
        currentDate = parsedDate; // Usa dateStr solo se è una data valida
      }
    }
    
    const iso = currentDate.toISOString().slice(0, 10);
    const currentDayKey = typeof trackerStoricoKey === 'function' 
      ? trackerStoricoKey(iso) 
      : `trackerStorico_${iso}`; // Fallback se non è una funzione
    
    // Estrai solo il giorno corrente e gli ultimi 14 giorni (per il calcolo settimanale)
    const relevantKeys = [currentDayKey];
    
    // 2. Creazione chiavi per i 14 giorni precedenti
    for (let i = 1; i <= 14; i++) {
      const pastDate = new Date(currentDate);
      pastDate.setDate(pastDate.getDate() - i);
      const pastIso = pastDate.toISOString().slice(0, 10);
      
      const pastKey = typeof trackerStoricoKey === 'function'
        ? trackerStoricoKey(pastIso)
        : `trackerStorico_${pastIso}`;
      
      relevantKeys.push(pastKey);
    }
    
    // Crea subset contenente solo i dati rilevanti
    const subset = {};
    relevantKeys.forEach(key => {
      if (fullHistory[key]) {
        subset[key] = fullHistory[key];
      }
    });
    
    // Confronta con il subset precedente (shallow comparison delle chiavi rilevanti)
    const prev = stableHistoryRef.current;
    if (prev) {
      let hasChanged = false;
      for (const key of relevantKeys) {
        if (prev[key] !== subset[key]) {
          hasChanged = true;
          break;
        }
      }
      if (!hasChanged) {
        // Nessun cambiamento effettivo: ritorna la referenza precedente
        return prev;
      }
    }
    
    // Aggiorna il ref e ritorna il nuovo subset
    stableHistoryRef.current = subset;
    return subset;
  }, [fullHistory, dateStr]);

  const snapshot = useMemo(() => {
    if (!isReady) return null;
    const iso = String(dateStr || '').slice(0, 10);
    
    // 🔍 DEBUG LOG 1: Verifica ingresso dati al hook
    console.log('1️⃣ HOOK - dailyLog types:', (dailyLog || []).map(i => i?.type).join(', '));
    console.log('1️⃣ HOOK - manualNodes types:', (manualNodes || []).map(i => i?.type).join(', '));
    console.log('1️⃣ HOOK - Has sleep in dailyLog?', (dailyLog || []).some(i => String(i?.type).toLowerCase() === 'sleep'));
    console.log('1️⃣ HOOK - Has sleep in manualNodes?', (manualNodes || []).some(i => String(i?.type).toLowerCase() === 'sleep'));
    
    return getHealthSnapshot({
      trackerStoricoDay: buildTrackerStoricoDay({
        dailyLog,
        manualNodes,
        fullHistory: historySubset, // Usa il subset stabilizzato
        dateStr: iso,
      }),
      trackerStoricoWeek: historySubset, // Usa il subset stabilizzato
      kineticsData: {
        glycemicPenalty,
        metabolicPenalty: glycemicPenalty,
        fastingHoursCurrent: hoursSinceLastMeal,
        hoursSinceLastMeal,
        currentPhase: mapPhaseId(metabolicPhaseId),
      },
      fourCylinderData: fourCylinder,
      userTargets,
      nowMs: Number.isFinite(Number(nowMs)) ? Number(nowMs) : undefined,
      dateStr: iso,
    });
  }, [
    isReady,
    dailyLog,
    manualNodes,
    historySubset, // 🎯 Dipendenza stabilizzata invece di fullHistory
    fourCylinder,
    userTargets,
    dateStr,
    glycemicPenalty,
    hoursSinceLastMeal,
    metabolicPhaseId,
    nowMs,
  ]);

  const healthState = useMemo(() => {
    if (!snapshot) return null;
    return getHealthSystemState(snapshot);
  }, [snapshot]);

  return {
    snapshot,
    healthState,
    isReady,
    isLoading,
  };
}

export default useHealthSystemState;
