/**
 * Gate di rilevanza giornalistica per articoli centrali week/month (P6.5.1).
 * Aggregati disponibili ≠ storia pubblicabile.
 */

import { CENTERPIECE_STORY_REASON } from '../edition/editionVerification.js';

/**
 * @param {object} agg
 * @param {object|null|undefined} comparison
 * @param {'week'|'month'} scale
 * @returns {{
 *   publishable: boolean,
 *   reason: string,
 *   storyKind: string|null,
 *   dominantFact: object|null,
 * }}
 */
export function evaluateCenterpieceStory(agg, comparison, scale) {
  if (!agg) {
    return {
      publishable: false,
      reason: CENTERPIECE_STORY_REASON.insufficient_domain_coverage,
      storyKind: null,
      dominantFact: null,
    };
  }
  if (agg.futureBlocked) {
    return {
      publishable: false,
      reason: CENTERPIECE_STORY_REASON.future_window_unevaluable,
      storyKind: null,
      dominantFact: null,
    };
  }
  if (!agg.evidenceSolid) {
    return {
      publishable: false,
      reason: CENTERPIECE_STORY_REASON.insufficient_domain_coverage,
      storyKind: null,
      dominantFact: null,
    };
  }
  if (!agg.coverage?.temporalComplete && agg.coverage?.daysFuture > 0) {
    return {
      publishable: false,
      reason: CENTERPIECE_STORY_REASON.temporal_incomplete,
      storyKind: null,
      dominantFact: null,
    };
  }

  const candidates = [];

  // Cambiamento significativo con confronto affidabile
  if (comparison?.available && comparison.deltas) {
    const d = comparison.deltas;
    if (d.strengthDaysLogged != null && Math.abs(d.strengthDaysLogged) >= (scale === 'month' ? 4 : 2)) {
      // Solo se copertura activity ragionevolmente allineata
      const covOk = coverageAligned(comparison, 'activity');
      if (covOk) {
        candidates.push({
          storyKind: 'significant_change',
          theme: 'strength_frequency_change',
          domain: 'activity',
          weight: 10 + Math.abs(d.strengthDaysLogged),
          fact: {
            metric: 'strengthDaysLogged',
            absoluteDelta: d.strengthDaysLogged,
            relativeDelta: comparison.relativeDeltas?.strengthDaysLogged ?? null,
            current: agg.activity?.strengthDaysLogged,
            previous: (agg.activity?.strengthDaysLogged ?? 0) - d.strengthDaysLogged,
          },
        });
      }
    }
    if (d.avgSleepHours != null && Math.abs(d.avgSleepHours) >= (scale === 'month' ? 0.5 : 0.45)) {
      if (coverageAligned(comparison, 'sleep')) {
        candidates.push({
          storyKind: 'significant_change',
          theme: 'sleep_hours_shift',
          domain: 'sleep',
          weight: 9 + Math.abs(d.avgSleepHours),
          fact: {
            metric: 'avgSleepHours',
            absoluteDelta: d.avgSleepHours,
            relativeDelta: comparison.relativeDeltas?.avgSleepHours ?? null,
            current: agg.sleep?.avgHours,
          },
        });
      }
    }
    if (d.avgProteinG != null && Math.abs(d.avgProteinG) >= (scale === 'month' ? 15 : 12)) {
      if (coverageAligned(comparison, 'nutrition')) {
        candidates.push({
          storyKind: 'significant_change',
          theme: 'protein_intake_shift',
          domain: 'nutrition',
          weight: 8 + Math.abs(d.avgProteinG) / 10,
          fact: {
            metric: 'avgProteinG',
            absoluteDelta: d.avgProteinG,
            relativeDelta: comparison.relativeDeltas?.avgProteinG ?? null,
            current: agg.nutrition?.avgProteinG,
          },
        });
      }
    }
    if (d.avgKcal != null && Math.abs(d.avgKcal) >= (scale === 'month' ? 200 : 180)) {
      if (coverageAligned(comparison, 'nutrition')) {
        candidates.push({
          storyKind: 'significant_change',
          theme: 'kcal_intake_shift',
          domain: 'nutrition',
          weight: 7 + Math.abs(d.avgKcal) / 100,
          fact: {
            metric: 'avgKcal',
            absoluteDelta: d.avgKcal,
            relativeDelta: comparison.relativeDeltas?.avgKcal ?? null,
            current: agg.nutrition?.avgKcal,
          },
        });
      }
    }
  }

  // Continuità particolarmente interessante (non semplice media)
  const strengthDays = agg.activity?.strengthDaysLogged || 0;
  const elapsed = agg.coverage?.daysElapsed || 7;
  const strengthDensity = elapsed > 0 ? strengthDays / elapsed : 0;
  if (scale === 'week' && strengthDays >= 4 && strengthDensity >= 0.5) {
    candidates.push({
      storyKind: 'notable_continuity',
      theme: 'strength_week_density',
      domain: 'activity',
      weight: 8 + strengthDays,
      fact: { metric: 'strengthDaysLogged', current: strengthDays, density: strengthDensity },
    });
  }
  if (scale === 'month' && strengthDays >= 10 && strengthDensity >= 0.35) {
    candidates.push({
      storyKind: 'notable_continuity',
      theme: 'strength_month_continuity',
      domain: 'activity',
      weight: 8 + strengthDays * 0.3,
      fact: { metric: 'strengthDaysLogged', current: strengthDays, density: strengthDensity },
    });
  }

  // Sonno: solo se fuori fascia ordinaria O delta forte già catturato
  const sleepH = agg.sleep?.avgHours;
  const nights = agg.sleep?.nightsLogged || 0;
  if (sleepH != null && nights >= (scale === 'month' ? 10 : 5)) {
    if (sleepH < 6.3 || sleepH > 8.8) {
      candidates.push({
        storyKind: 'notable_continuity',
        theme: sleepH < 6.3 ? 'sleep_week_short' : 'sleep_week_long',
        domain: 'sleep',
        weight: 7,
        fact: { metric: 'avgSleepHours', current: sleepH, nightsLogged: nights },
      });
    }
  }

  // Coesistenza di domini ≠ storia. Articolo trasversale solo se ≥2 storie autonome
  // su domini diversi (cambiamento o continuità notevole), non per sola copertura.
  candidates.sort((a, b) => b.weight - a.weight || String(a.theme).localeCompare(b.theme));
  const autonomous = candidates.filter(
    (c) => c.storyKind === 'significant_change' || c.storyKind === 'notable_continuity',
  );
  const autonomousDomains = new Set(autonomous.map((c) => c.domain));
  if (autonomous.length >= 2 && autonomousDomains.size >= 2) {
    const primary = autonomous[0];
    const secondary = autonomous.find((c) => c.domain !== primary.domain);
    candidates.push({
      storyKind: 'linked_domains',
      theme: 'habits_link',
      domain: 'habits',
      weight: primary.weight + 0.25,
      fact: {
        ...primary.fact,
        linkedDomains: [...autonomousDomains],
        primaryTheme: primary.theme,
        secondaryTheme: secondary?.theme || null,
        secondaryDomain: secondary?.domain || null,
        foundedLink: true,
      },
    });
    candidates.sort((a, b) => b.weight - a.weight || String(a.theme).localeCompare(b.theme));
  }

  const best = candidates[0] || null;
  // Mai pubblicare habits_link senza foundedLink (difesa in profondità)
  if (best?.theme === 'habits_link' && !best.fact?.foundedLink) {
    return {
      publishable: false,
      reason: CENTERPIECE_STORY_REASON.descriptive_only,
      storyKind: null,
      dominantFact: null,
    };
  }

  if (best) {
    return {
      publishable: true,
      reason: CENTERPIECE_STORY_REASON.significant_story_selected,
      storyKind: best.storyKind,
      dominantFact: best,
    };
  }

  // Confronto presente ma solo oscillazioni
  if (comparison?.available) {
    return {
      publishable: false,
      reason: CENTERPIECE_STORY_REASON.ordinary_oscillation_no_story,
      storyKind: 'ordinary_oscillation',
      dominantFact: null,
    };
  }

  // Aggregati ok ma niente storia
  if (!comparison?.available && (agg.solidDomains || []).length >= 1) {
    return {
      publishable: false,
      reason: comparison
        ? CENTERPIECE_STORY_REASON.comparison_insufficient
        : CENTERPIECE_STORY_REASON.descriptive_only,
      storyKind: null,
      dominantFact: null,
    };
  }

  return {
    publishable: false,
    reason: CENTERPIECE_STORY_REASON.descriptive_only,
    storyKind: null,
    dominantFact: null,
  };
}

/**
 * @param {object} comparison
 * @param {'nutrition'|'sleep'|'activity'} domain
 */
function coverageAligned(comparison, domain) {
  // Per conteggi forza: allinea sulla osservazione complessiva delle finestre,
  // non sul solo ratio workout (un calo di sessioni abbassa anche quel ratio).
  if (domain === 'activity') {
    const curE = comparison.currentWindow?.daysElapsed || 0;
    const prevE = comparison.previousWindow?.daysElapsed || 0;
    const curO = comparison.currentWindow?.daysObserved || 0;
    const prevO = comparison.previousWindow?.daysObserved || 0;
    if (curE > 0 && prevE > 0) {
      const curRatio = curO / curE;
      const prevRatio = prevO / prevE;
      return Math.abs(curRatio - prevRatio) <= 0.4
        && curRatio >= 0.35
        && prevRatio >= 0.35;
    }
  }
  const cur = comparison.domainCoverage?.current?.[domain];
  const prev = comparison.domainCoverage?.previous?.[domain];
  if (cur == null || prev == null) return true;
  return Math.abs(cur - prev) <= 0.35;
}

/**
 * Sovrapposizione lead ↔ centerpiece nella stessa edizione.
 *
 * @param {object|null} lead
 * @param {object|null} centerpieceCand
 * @returns {{
 *   overlap: boolean,
 *   action: 'keep_both'|'prefer_centerpiece_drop_lead'|'drop_centerpiece'|'none',
 *   reason: string|null,
 * }}
 */
export function evaluateEditionOverlap(lead, centerpieceCand) {
  if (!lead || !centerpieceCand) {
    return { overlap: false, action: 'none', reason: null };
  }
  const leadTopic = lead.topicId || '';
  const cpTheme = centerpieceCand.coverage?.dominantTheme
    || centerpieceCand.dominantFact?.theme
    || '';
  const cpDomain = centerpieceCand.domain || '';
  const leadDomain = lead.domain || '';
  const cpStoryKind = centerpieceCand.storyKind
    || centerpieceCand.coverage?.storyKind
    || null;

  const sleepOverlap = (
    (leadTopic === 'sleep_weekly_rhythm' || lead.typology === 'sleep_weekly_rhythm')
    && (cpDomain === 'sleep' || /sleep/i.test(cpTheme) || /sleep/i.test(String(cpStoryKind)))
  );
  const strengthOverlap = (
    (leadTopic === 'strength_continuity_d30' || /strength/i.test(leadTopic))
    && (cpDomain === 'activity' || /strength/i.test(cpTheme))
  );

  if (!sleepOverlap && !strengthOverlap) {
    if (leadDomain && cpDomain && leadDomain !== cpDomain && cpDomain !== 'habits') {
      return { overlap: false, action: 'keep_both', reason: 'distinct_domains' };
    }
    return { overlap: false, action: 'keep_both', reason: null };
  }

  // Domanda giornalistica diversa: es. ritmo sveglia (timing) vs durata media sonno
  if (
    sleepOverlap
    && leadTopic === 'sleep_weekly_rhythm'
    && (cpTheme === 'sleep_hours_shift' || cpTheme === 'sleep_week_short' || cpTheme === 'sleep_week_long')
    && cpStoryKind === 'significant_change'
  ) {
    // Timing vs durata: possono coesistere se il centerpiece è un vero shift
    return { overlap: false, action: 'keep_both', reason: 'distinct_sleep_questions' };
  }

  const cpStrong = cpStoryKind === 'significant_change'
    || centerpieceCand.significantChange
    || cpStoryKind === 'notable_continuity';

  // Mensile: prospettiva mensile ha priorità sulla continuità d30 quotidiana
  if (strengthOverlap && cpStrong) {
    return {
      overlap: true,
      action: 'prefer_centerpiece_drop_lead',
      reason: 'overlap_strength_d30_vs_month_strength_story',
    };
  }

  if (sleepOverlap && cpStrong && cpStoryKind === 'notable_continuity') {
    // Stessa domanda “com’è andato il sonno” senza shift → evita doppione
    return {
      overlap: true,
      action: 'prefer_centerpiece_drop_lead',
      reason: 'overlap_sleep_rhythm_vs_week_sleep_story',
    };
  }

  if (sleepOverlap || strengthOverlap) {
    return {
      overlap: true,
      action: 'drop_centerpiece',
      reason: CENTERPIECE_STORY_REASON.overlap_no_autonomous_value,
    };
  }

  return { overlap: false, action: 'keep_both', reason: null };
}
