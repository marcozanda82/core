/**
 * Allineato a {@link classifyMapPoint} / calculateMetabolicMapPosition (solo lettura, non muta il motore mappa).
 * @param {number} distance
 * @returns {'green' | 'orange' | 'red'}
 */
function zoneFromMapDistance(distance) {
  const d = Number(distance) || 0;
  if (d > 70) return 'red';
  if (d > 35) return 'orange';
  return 'green';
}

function isSoftCompassDisplayLabel(label) {
  const s = String(label || '').toLowerCase();
  return (
    s.includes('debole') ||
    s.includes('quasi neutro') ||
    s.includes('tendenza lieve') ||
    s.includes('lieve verso')
  );
}

const DEFAULT_INSIGHT = {
  severity: 'info',
  title: 'Coach metabolico',
  message: 'Aggiungi qualche giorno di diario per un feedback più preciso.',
  reason: null,
  actionLabel: null,
};

/**
 * Messaggio coach puro da stato mappa + bussola (nessuna modifica a TDEE / target).
 *
 * @param {{
 *   mapData?: object | null,
 *   userTargets?: { kcal?: number } | null,
 *   selectedTimeframe?: string,
 * }} param0
 * @returns {{
 *   severity: 'info' | 'warning' | 'good',
 *   title: string,
 *   message: string,
 *   reason: string | null,
 *   actionLabel: string | null,
 * }}
 */
export function buildMetabolicCoachInsight({
  mapData = null,
  userTargets = null,
  selectedTimeframe = '7d',
} = {}) {
  const tf = selectedTimeframe != null ? String(selectedTimeframe) : '7d';

  if (!mapData || typeof mapData !== 'object') {
    return { ...DEFAULT_INSIGHT };
  }

  const strength = mapData.mapSignalStrength ?? mapData.compassSignalStrength ?? null;
  const displayLabel = String(mapData.compassDisplayLabel ?? '').trim();
  const presentation = mapData.mapPresentation;
  const suppressRisk = presentation?.suppressRiskNarrative === true;
  const zone = zoneFromMapDistance(mapData.distance);
  const glycemic = Number(mapData.glycemic ?? mapData.metabolicMapInputs?.glycemicInstability ?? 0) || 0;
  const longevity = Number(mapData.longevityScore);
  const kcalTarget = userTargets?.kcal;

  if (strength === 'very_weak') {
    return {
      severity: 'info',
      title: 'Nessuna direzione chiara',
      message: 'I dati non indicano una direzione metabolica significativa.',
      reason: `Periodo analizzato: ${tf}`,
      actionLabel: null,
    };
  }

  if (strength === 'weak' || isSoftCompassDisplayLabel(displayLabel)) {
    return {
      severity: 'info',
      title: 'Quadro in evoluzione',
      message:
        displayLabel ||
        'Il segnale è ancora leggero: un po’ più di dati consecutivi aiuta a definire il trend.',
      reason: kcalTarget ? `${tf} · obiettivo ${Math.round(kcalTarget)} kcal` : `Periodo: ${tf}`,
      actionLabel: null,
    };
  }

  const strongEnough = strength === 'moderate' || strength === 'strong';
  const riskVisible = !suppressRisk && strongEnough;

  if (riskVisible && (zone === 'red' || zone === 'orange' || glycemic > 55)) {
    const parts = [];
    if (zone === 'red') parts.push('distanza dalla Blue Zone elevata');
    else if (zone === 'orange') parts.push('transizione verso una zona di maggiore adattamento');
    if (glycemic > 55) parts.push('instabilità glicemica teorica sopra la media');

    return {
      severity: 'warning',
      title: 'Spazio di miglioramento',
      message:
        'Con il segnale attuale vale la pena osservare recupero, bilancio e qualità del sonno nella finestra selezionata.',
      reason: parts.length ? parts.join(' · ') : `Mappa · ${tf}`,
      actionLabel: 'Controlla diario e sonno',
    };
  }

  if (strongEnough && zone === 'green') {
    const lowGly = glycemic <= 50;
    return {
      severity: 'good',
      title: lowGly ? 'Profilo ordinato' : 'Buon equilibrio',
      message:
        displayLabel && !isSoftCompassDisplayLabel(displayLabel)
          ? lowGly
            ? `${displayLabel} — la mappa resta nella Blue Zone con segnale sufficiente.`
            : `${displayLabel} — zona favorevole con qualche fattore da osservare (es. bilancio).`
          : lowGly
            ? 'Bussola e mappa concordano su un profilo complessivamente controllato.'
            : 'Posizione vicina al centro: ottima base, monitora comunque glicemia teorica e carico.',
      reason:
        Number.isFinite(longevity) && longevity > 0
          ? `Longevity indicativa ${Math.round(longevity)} · ${tf}`
          : `Finestra ${tf}`,
      actionLabel: lowGly ? 'Continua con costanza' : null,
    };
  }

  return {
    severity: 'info',
    title: 'Monitoraggio',
    message: displayLabel || 'Segui il trend nei prossimi giorni con logging regolare.',
    reason: tf,
    actionLabel: null,
  };
}
