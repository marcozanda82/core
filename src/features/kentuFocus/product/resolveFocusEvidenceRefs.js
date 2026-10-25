/**
 * Risolve evidenceRefs editoriali in voci leggibili (label + dettaglio).
 * Gestisce: stringhe path, oggetti Gemini {label,value,source,...}, mappe RTDB array-like.
 * Non inventa metriche; esclude voci senza testo visibile.
 */

/**
 * Firebase a volte deserializza array come oggetti {"0":...}.
 * @param {unknown} refs
 * @returns {unknown[]}
 */
export function coerceEvidenceRefArray(refs) {
  if (Array.isArray(refs)) return refs;
  if (refs && typeof refs === 'object') {
    const keys = Object.keys(refs);
    if (keys.length === 0) return [];
    const numeric = keys.every((k) => /^\d+$/.test(k));
    if (numeric) {
      return keys
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => refs[k]);
    }
  }
  if (typeof refs === 'string' && refs.trim()) return [refs];
  return [];
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function visibleText(value) {
  if (value == null) return '';
  return String(value)
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True se c’è almeno una lettera o cifra (evita sole bullet “vuote”).
 * @param {string} text
 */
function hasVisibleGlyph(text) {
  return /[\p{L}\p{N}]/u.test(text || '');
}

/**
 * @param {unknown} value
 * @returns {string|null}
 */
export function normalizeEvidenceRefId(value) {
  if (value == null) return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    const fromObj = value.id
      || value.ref
      || value.path
      || value.source
      || value.key
      || value.engine
      || value.engineId
      || value.metric
      || value.citation;
    return normalizeEvidenceRefId(fromObj);
  }
  const t = visibleText(value);
  if (!t || t === '[object Object]') return null;
  return t;
}

/**
 * @param {object|null|undefined} dossier
 * @param {object|null|undefined} session
 */
function enginesFrom(dossier, session) {
  return dossier?.kentuEngines || session?.kentuEngines || null;
}

/**
 * Path tecnici / indici dossier — non vanno mostrati come etichetta utente.
 * @param {string} text
 */
function looksLikeTechnicalPath(text) {
  const t = String(text || '');
  if (!t) return false;
  return /(?:^|\/)(?:kentuEngines|habitCompass|compassSignals|editorialReadingContext|nutrition|sleep)\b/i.test(t)
    || /\.\w+\[/.test(t)
    || /^[\w.]+\[\d+\]$/.test(t);
}

/**
 * @param {object|null|undefined} dossier
 * @param {object|null|undefined} session
 * @returns {object[]|null}
 */
function habitEvaluationsFrom(dossier, session) {
  const fromDossier = dossier?.habitCompass?.evaluations;
  if (Array.isArray(fromDossier) && fromDossier.length) return fromDossier;
  const fromSession = session?.habitCompass?.evaluations;
  if (Array.isArray(fromSession) && fromSession.length) return fromSession;
  return null;
}

/**
 * Risolve solo se l’indice punta a una evaluation presente e con testo umano verificabile.
 * Non presume che [0]/[3] siano sempre gli stessi pilastri tra dossier.
 * @param {string} id
 * @param {object|null} dossier
 * @param {object|null} session
 * @param {string} periodHint
 * @returns {{ id: string, label: string, detail: string, available: boolean }|null}
 */
function resolveHabitCompassEvaluationRef(id, dossier, session, periodHint) {
  const m = String(id).match(/^habitCompass\.evaluations\[(\d+)\]$/i)
    || String(id).match(/^habitCompass\.evaluations\.(\d+)$/i);
  if (!m) return null;
  const idx = Number(m[1]);
  if (!Number.isInteger(idx) || idx < 0) return null;
  const list = habitEvaluationsFrom(dossier, session);
  if (!list || idx >= list.length) return null;
  const ev = list[idx];
  if (!ev || typeof ev !== 'object') return null;

  const pillar = visibleText(ev.pillarLabel || ev.title);
  const direction = visibleText(ev.directionLabel);
  const observed = visibleText(ev.habitObserved);
  // Corrispondenza verificabile: pilastro e/o osservazione dal dossier corrente
  if (!hasVisibleGlyph(pillar) && !hasVisibleGlyph(observed)) return null;

  const label = hasVisibleGlyph(pillar)
    ? `Abitudine · ${pillar}`
    : 'Abitudine (bussola)';
  const detail = [
    direction || null,
    observed || null,
    periodHint,
  ].filter(Boolean).join(' · ');
  if (!hasVisibleGlyph(detail)) return null;

  return {
    id: visibleText(ev.id) ? `habitCompass:${ev.id}` : id,
    label,
    detail,
    available: true,
  };
}

/**
 * @param {string} id
 * @param {object|null} dossier
 * @param {object|null} session
 * @returns {{ id: string, label: string, detail: string, available: boolean }|null}
 */
function resolvePathId(id, dossier, session) {
  const engines = enginesFrom(dossier, session);
  const compass = dossier?.compassSignals || null;
  const erc = dossier?.editorialReadingContext || null;
  const nutrition = dossier?.nutrition || session?.nutrition || null;
  const sleep = dossier?.sleep || null;
  const periodId = dossier?.periodId || session?.periodId || null;
  const periodHint = periodId === 'ieri'
    ? 'giorno di analisi'
    : periodId === 'mese'
      ? 'finestra ~30 giorni'
      : periodId === 'settimana'
        ? 'finestra ~7 giorni'
        : 'finestra Focus';

  const lower = id.toLowerCase();

  if (/^habitcompass\.evaluations/i.test(id)) {
    return resolveHabitCompassEvaluationRef(id, dossier, session, periodHint);
  }

  if (/energypilot|pilota|declaredtarget|intakekcal/.test(lower)) {
    const ep = engines?.energyPilot;
    if (!ep) return null;
    const parts = [];
    if (ep.declaredTargetKcal != null) parts.push(`target ${ep.declaredTargetKcal} kcal`);
    if (ep.intakeKcalUsable != null) parts.push(`introito ${ep.intakeKcalUsable} kcal (${periodHint})`);
    if (ep.observedEnergy?.energyDirectionLabelIt) parts.push(ep.observedEnergy.energyDirectionLabelIt);
    if (!parts.length) return null;
    return {
      id,
      label: 'Pilota energetico',
      detail: parts.join(' · '),
      available: true,
    };
  }

  if (/bussola|observedtrajectory|compasssignals|meankcalbalance/.test(lower)) {
    const traj = engines?.bussola?.observedTrajectory || compass?.observedTrajectory;
    if (!traj && !engines?.bussola?.available && !compass?.available) return null;
    const parts = [];
    if (traj?.timeframe) parts.push(`timeframe ${traj.timeframe}`);
    if (traj?.energyDirectionLabelIt) parts.push(traj.energyDirectionLabelIt);
    if (traj?.meanKcalBalanceVsOperationalTarget != null) {
      parts.push(`bilancio medio vs target ${traj.meanKcalBalanceVsOperationalTarget} kcal`);
    }
    if (compass?.signalStrength || engines?.bussola?.signalStrength) {
      parts.push(`segnale: ${compass?.signalStrength || engines?.bussola?.signalStrength}`);
    }
    if (!parts.length) return null;
    return {
      id,
      label: 'Bussola metabolica',
      detail: parts.join(' · '),
      available: true,
    };
  }

  if (/musclestimulus|stimolo|muscle|strengthsession/.test(lower)) {
    const m = engines?.muscleStimulus;
    if (!m) return null;
    const n = m?.strengthSessionCount;
    // Tutti i gruppi presenti nel dossier — niente slice arbitrario che tronca la rotazione.
    const groups = (m?.muscleGroupFrequency || [])
      .map((g) => {
        if (g == null) return null;
        if (typeof g === 'string') return visibleText(g) || null;
        const name = visibleText(g.name || g.group);
        if (!name) return null;
        const sessions = g.sessions ?? g.count ?? g.n;
        return sessions != null && Number.isFinite(Number(sessions))
          ? `${name} (${sessions})`
          : name;
      })
      .filter(Boolean);
    if (n == null && groups.length === 0) return null;
    return {
      id,
      label: 'Stimolo muscolare',
      detail: [
        n != null ? `${n} sessioni di forza (${periodHint})` : null,
        groups.length ? `gruppi: ${groups.join(', ')}` : null,
      ].filter(Boolean).join(' · '),
      available: true,
    };
  }

  if (/cardio|aerobic/.test(lower)) {
    const c = engines?.cardio;
    if (!c || (c.aerobicMinutesDocumented == null && !c.intensityDocumented)) return null;
    const parts = [];
    if (c.aerobicMinutesDocumented != null) {
      parts.push(`aerobici documentati ${c.aerobicMinutesDocumented} min (${periodHint})`);
    }
    if (c.intensityDocumented) {
      if (c.moderateMinutes != null) parts.push(`moderati ${c.moderateMinutes} min`);
      if (c.vigorousMinutes != null) parts.push(`vigorosi ${c.vigorousMinutes} min`);
    } else if (c.aerobicMinutesDocumented != null) {
      parts.push('intensità non documentata nel log Focus');
    }
    if (!parts.length) return null;
    return {
      id,
      label: 'Cardio / allenamento',
      detail: parts.join(' · '),
      available: true,
    };
  }

  if (/dayversusrecent|editorialreadingcontext/.test(lower)) {
    const dvr = erc?.dayVersusRecent;
    if (!dvr) return null;
    const detail = [
      dvr.day?.intakeKcal != null ? `giorno ${dvr.day.intakeKcal} kcal` : null,
      dvr.recent7dExcludingAnalysisDay?.meanIntakeKcal != null
        ? `media 7g ${dvr.recent7dExcludingAnalysisDay.meanIntakeKcal} kcal`
        : null,
      dvr.declaredTargetKcal != null ? `target ${dvr.declaredTargetKcal} kcal` : null,
    ].filter(Boolean).join(' · ');
    if (!hasVisibleGlyph(detail)) return null;
    return {
      id,
      label: 'Episodio vs media recente',
      detail,
      available: true,
    };
  }

  if (/nutrition|meals|foodfrequency|food\b/.test(lower)) {
    const mealN = (nutrition?.meals || []).length
      || (nutrition?.ieri?.meals || []).length
      || 0;
    const freqN = (nutrition?.foodFrequency || []).length;
    if (mealN <= 0 && freqN <= 0) return null;
    return {
      id,
      label: 'Alimentazione (diario)',
      detail: mealN > 0
        ? `${mealN} pasti nella vista corrente`
        : `${freqN} alimenti in frequenza`,
      available: true,
    };
  }

  if (/sleep|sonno|seriesrecorded/.test(lower)) {
    const hours = sleep?.day?.hours
      ?? session?.sleepNight?.hours
      ?? null;
    const seriesN = (sleep?.seriesRecorded || []).length;
    if (hours == null && seriesN <= 0) return null;
    return {
      id,
      label: 'Sonno / recupero',
      detail: hours != null
        ? `notte al risveglio: ${hours} h`
        : `${seriesN} notti in serie`,
      available: true,
    };
  }

  // Nessun segnaposto / path tecnico visibile all’utente.
  return null;
}

/**
 * @param {unknown} raw
 * @param {object|null} dossier
 * @param {object|null} session
 * @returns {{ id: string, label: string, detail: string, available: boolean }|null}
 */
function resolveRawEntry(raw, dossier, session) {
  // Oggetto già “editoriale” da Gemini: usa label/value se presenti
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const labelRaw = visibleText(
      raw.label || raw.title || raw.name || raw.heading,
    );
    const detail = visibleText(
      raw.detail
      || raw.value
      || raw.description
      || raw.finding
      || raw.note
      || raw.summary
      || raw.text,
    );
    const id = normalizeEvidenceRefId(raw);
    const labelIsHuman = hasVisibleGlyph(labelRaw) && !looksLikeTechnicalPath(labelRaw);

    if (id && /kentuengines|habitcompass|compass|editorial|nutrition|sleep|bussola|pilota|stimolo|cardio/i.test(id)) {
      const fromPath = resolvePathId(id, dossier, session);
      if (fromPath && fromPath.available) {
        return {
          id: fromPath.id,
          label: labelIsHuman ? labelRaw : fromPath.label,
          detail: fromPath.detail,
          available: true,
        };
      }
      // Path citato ma non risolvibile in modo attendibile → non mostrare
      if (!labelIsHuman || looksLikeTechnicalPath(labelRaw)) return null;
    }

    if (labelIsHuman || hasVisibleGlyph(detail)) {
      if (!labelIsHuman && !hasVisibleGlyph(detail)) return null;
      if (!labelIsHuman && looksLikeTechnicalPath(id || '')) return null;
      return {
        id: id || labelRaw || detail,
        label: labelIsHuman ? labelRaw : detail,
        detail: hasVisibleGlyph(detail) && detail !== labelRaw ? detail : '',
        available: hasVisibleGlyph(detail) || labelIsHuman,
      };
    }

    if (id) return resolvePathId(id, dossier, session);
    return null;
  }

  const id = normalizeEvidenceRefId(raw);
  if (!id) return null;
  return resolvePathId(id, dossier, session);
}

/**
 * @param {unknown} refs
 * @param {{ dossier?: object|null, session?: object|null }} [ctx]
 * @returns {{ id: string, label: string, detail: string, available: boolean }[]}
 */
export function resolveFocusEvidenceRefs(refs, ctx = {}) {
  const list = coerceEvidenceRefArray(refs);
  if (list.length === 0) return [];
  const dossier = ctx.dossier || null;
  const session = ctx.session || null;
  /** @type {{ id: string, label: string, detail: string, available: boolean }[]} */
  const out = [];
  const seen = new Set();

  for (const raw of list) {
    const resolved = resolveRawEntry(raw, dossier, session);
    if (!resolved || !resolved.available) continue;
    const label = visibleText(resolved.label);
    const detail = visibleText(resolved.detail);
    if (!hasVisibleGlyph(label) && !hasVisibleGlyph(detail)) continue;
    if (looksLikeTechnicalPath(label)) continue;
    if (/citato nel rapporto|dettaglio metrico non risolto|riferimento:/i.test(detail)) continue;
    const key = `${label.toLowerCase()}|${detail.toLowerCase()}|${String(resolved.id || '').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: String(resolved.id || label || `ev_${out.length + 1}`),
      label: hasVisibleGlyph(label) ? label : detail,
      detail: hasVisibleGlyph(detail) && detail !== label ? detail : '',
      available: true,
    });
  }
  return out.slice(0, 8);
}
