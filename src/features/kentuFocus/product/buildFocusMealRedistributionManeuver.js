/**
 * Manovra Ghost Car — redistribuzione giustificata di alimenti già registrati.
 * La modifica deve colpire la criticità dichiarata (es. gap pre-allenamento → spuntino),
 * non uno spostamento matematico irrilevante (cena→pranzo).
 */

const LATE_DINNER_HOUR = 21;
const LONG_GAP_HOURS = 5.5;
const HEAVY_MEAL_SHARE = 0.42;
const MIN_MOVE_KCAL = 80;
const MAX_MOVE_KCAL = 400;
const LOW_DAY_KCAL = 1000;
const PRE_WORKOUT_SNACK_OFFSET_H = 1.25; // ore prima dell'allenamento

const NO_MANEUVER_MSG = 'Nessuna manovra specifica consigliata';

/**
 * @param {number|null|undefined} hour
 */
function formatClock(hour) {
  if (hour == null || !Number.isFinite(Number(hour))) return null;
  const h = Math.floor(Number(hour)) % 24;
  const m = Math.round((Number(hour) - Math.floor(Number(hour))) * 60) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * @param {object[]} meals
 */
function mealsWithTime(meals) {
  return (meals || [])
    .filter((m) => m && Number.isFinite(Number(m.clockHour)))
    .slice()
    .sort((a, b) => Number(a.clockHour) - Number(b.clockHour));
}

function itemKcal(item) {
  const k = Number(item?.macros?.kcal);
  return Number.isFinite(k) ? k : null;
}
function itemProtein(item) {
  const p = Number(item?.macros?.proteinG);
  return Number.isFinite(p) ? p : null;
}
function itemCarb(item) {
  const c = Number(item?.macros?.carbG);
  return Number.isFinite(c) ? c : null;
}
function itemFat(item) {
  const f = Number(item?.macros?.fatG);
  return Number.isFinite(f) ? f : null;
}

/**
 * Ruolo nutrizionale euristico da macro documentate + nome (non inventa valori).
 * @param {object} item
 */
function classifyFoodRole(item) {
  const kcal = itemKcal(item) || 0;
  const p = itemProtein(item) || 0;
  const c = itemCarb(item) || 0;
  const f = itemFat(item) || 0;
  const name = String(item?.name || '').toLowerCase();

  const carbHint = /riso|pasta|pane|patat|fiocco|avena|cereale|banana|mela|frutta|cracker|galletta|miele|marmellata|couscous|quinoa|tortilla|wrap/
    .test(name);
  const proteinHint = /pollo|tacchino|manzo|bistecca|carne|pesce|salmone|tonno|uova|uovo|proteine|yogurt greco|ricotta|fesa|petto|merluzzo|sgombro/
    .test(name);
  const fatHint = /olio|avocado|noci|mandorl|burro|formaggio|salame|nocciol/
    .test(name);

  if (kcal > 0 && c >= 15 && c >= p * 1.2) return 'carb_source';
  if (carbHint && c >= 8) return 'carb_source';
  if (kcal > 0 && p >= 20 && p >= c) return 'protein_source';
  if (proteinHint && p >= 15) return 'protein_source';
  if (fatHint && f >= 10) return 'fat_source';
  if (c >= 10) return 'carb_source';
  if (p >= 12) return 'protein_source';
  return 'mixed';
}

/**
 * @param {object} meal
 */
function movableItems(meal) {
  return (meal.items || []).filter((it) => {
    if (!it?.name || !String(it.name).trim()) return false;
    if (it.grams == null || !Number.isFinite(Number(it.grams)) || Number(it.grams) <= 0) return false;
    const kcal = itemKcal(it);
    if (kcal == null || kcal < MIN_MOVE_KCAL || kcal > MAX_MOVE_KCAL) return false;
    return true;
  });
}

/**
 * Fonte proteica dominante del pasto (per non svuotare il recupero serale).
 * @param {object} meal
 */
function dominantProteinItem(meal) {
  const items = movableItems(meal);
  if (!items.length) return null;
  let best = null;
  let bestP = -1;
  for (const it of items) {
    const p = itemProtein(it) || 0;
    if (p > bestP) {
      bestP = p;
      best = it;
    }
  }
  if (!best || bestP < 20) return null;
  const mealProt = Number(meal.distribution?.proteinG) || items.reduce((s, i) => s + (itemProtein(i) || 0), 0);
  if (mealProt > 0 && bestP / mealProt >= 0.45) return best;
  if (classifyFoodRole(best) === 'protein_source') return best;
  return null;
}

/**
 * @param {object[]} timedMeals
 * @param {number} workoutHour
 */
function findGapContainingWorkout(timedMeals, workoutHour) {
  for (let i = 0; i < timedMeals.length - 1; i += 1) {
    const a = timedMeals[i];
    const b = timedMeals[i + 1];
    const ha = Number(a.clockHour);
    const hb = Number(b.clockHour);
    if (workoutHour > ha && workoutHour < hb) {
      return {
        before: a,
        after: b,
        gapHours: Math.round((hb - ha) * 10) / 10,
      };
    }
  }
  return null;
}

/**
 * Orario spuntino pre-workout plausibile (fra pasto precedente e allenamento).
 * @param {number} lunchHour
 * @param {number} workoutHour
 */
function suggestPreWorkoutSnackHour(lunchHour, workoutHour) {
  const ideal = workoutHour - PRE_WORKOUT_SNACK_OFFSET_H;
  const earliest = lunchHour + 1.5;
  const latest = workoutHour - 0.5;
  if (latest <= earliest) return null;
  const hour = Math.min(latest, Math.max(earliest, ideal));
  return Math.round(hour * 100) / 100;
}

/**
 * Candidati per supporto pre-allenamento: preferisci carboidrati; evita proteina dominante cena.
 * @param {object} fromMeal
 * @param {object|null} dominantProt
 */
function pickPreWorkoutFuelItem(fromMeal, dominantProt) {
  const items = movableItems(fromMeal).filter((it) => {
    if (dominantProt && (it.id === dominantProt.id || it.name === dominantProt.name)) return false;
    return true;
  });
  if (!items.length) return null;

  const carbs = items.filter((it) => classifyFoodRole(it) === 'carb_source');
  const pool = carbs.length ? carbs : items.filter((it) => classifyFoodRole(it) !== 'protein_source');
  if (!pool.length) return null; // solo proteine → non forzare

  return pool
    .slice()
    .sort((a, b) => {
      const score = (it) => {
        const c = itemCarb(it) || 0;
        const k = itemKcal(it) || 0;
        const near = 1 / (1 + Math.abs(k - 200));
        return c * 2 + near * 50;
      };
      return score(b) - score(a);
    })[0];
}

/**
 * @param {object} fromMeal
 * @param {object|null} dominantProt
 * @param {{ allowProtein?: boolean }} opts
 */
function pickLateDinnerLightener(fromMeal, dominantProt, opts = {}) {
  const items = movableItems(fromMeal).filter((it) => {
    if (!opts.allowProtein && dominantProt
      && (it.id === dominantProt.id || it.name === dominantProt.name)) {
      return false;
    }
    return true;
  });
  if (!items.length) return null;
  // Preferisci carb/extra, non la proteina principale
  const nonProt = items.filter((it) => classifyFoodRole(it) !== 'protein_source');
  const pool = nonProt.length ? nonProt : (opts.allowProtein ? items : []);
  if (!pool.length) return null;
  return pool
    .slice()
    .sort((a, b) => Math.abs((itemKcal(a) || 0) - 200) - Math.abs((itemKcal(b) || 0) - 200))[0];
}

/**
 * @param {object} item
 */
function itemMacroSnapshot(item) {
  const kcal = itemKcal(item);
  const proteinG = itemProtein(item);
  const carbG = itemCarb(item);
  const fatG = itemFat(item);
  return {
    name: item.name,
    grams: item.grams,
    kcal,
    proteinG,
    carbG,
    fatG,
    documented: {
      kcal: kcal != null,
      proteinG: proteinG != null,
      carbG: carbG != null,
      fatG: fatG != null,
    },
    role: classifyFoodRole(item),
  };
}

/**
 * @param {object[]} meals
 * @param {{
 *   fromSlotId: string,
 *   toSlotId: string|null,
 *   toVirtual?: { mealLabel: string, clockHour: number, clockLabel: string }|null,
 *   itemId: string|null,
 *   itemName: string,
 * }} move
 */
function simulateRedistribution(meals, move) {
  const mealRows = meals.map((m) => ({
    mealSlotId: m.mealSlotId,
    mealLabel: m.mealLabel,
    clockLabel: m.clockLabel,
    clockHour: m.clockHour ?? null,
    kcal: Number(m.distribution?.kcal) || 0,
    proteinG: Number(m.distribution?.proteinG) || 0,
    carbG: Number(m.distribution?.carbG) || 0,
    fatG: Number(m.distribution?.fatG) || 0,
  }));

  const from = meals.find((m) => m.mealSlotId === move.fromSlotId);
  const item = (from?.items || []).find(
    (it) => (move.itemId && it.id === move.itemId)
      || String(it.name || '') === move.itemName,
  );
  if (!from || !item) return { ok: false, reason: 'item_not_found_in_diary' };

  const snap = itemMacroSnapshot(item);
  if (snap.kcal == null) return { ok: false, reason: 'item_kcal_missing' };

  const before = mealRows.map((r) => ({ ...r }));
  /** @type {object[]} */
  const after = mealRows.map((r) => ({ ...r }));

  const fromRow = after.find((r) => r.mealSlotId === move.fromSlotId);
  if (!fromRow) return { ok: false, reason: 'from_missing' };
  fromRow.kcal = Math.round((fromRow.kcal - snap.kcal) * 10) / 10;
  if (snap.proteinG != null) fromRow.proteinG = Math.round((fromRow.proteinG - snap.proteinG) * 10) / 10;
  if (snap.carbG != null) fromRow.carbG = Math.round((fromRow.carbG - snap.carbG) * 10) / 10;
  if (snap.fatG != null) fromRow.fatG = Math.round((fromRow.fatG - snap.fatG) * 10) / 10;

  if (move.toVirtual) {
    after.push({
      mealSlotId: `virtual_snack_${move.toVirtual.clockLabel}`,
      mealLabel: move.toVirtual.mealLabel,
      clockLabel: move.toVirtual.clockLabel,
      clockHour: move.toVirtual.clockHour,
      virtual: true,
      kcal: snap.kcal,
      proteinG: snap.proteinG || 0,
      carbG: snap.carbG || 0,
      fatG: snap.fatG || 0,
    });
  } else if (move.toSlotId) {
    const toRow = after.find((r) => r.mealSlotId === move.toSlotId);
    if (!toRow) return { ok: false, reason: 'to_missing' };
    toRow.kcal = Math.round((toRow.kcal + snap.kcal) * 10) / 10;
    if (snap.proteinG != null) toRow.proteinG = Math.round((toRow.proteinG + snap.proteinG) * 10) / 10;
    if (snap.carbG != null) toRow.carbG = Math.round((toRow.carbG + snap.carbG) * 10) / 10;
    if (snap.fatG != null) toRow.fatG = Math.round((toRow.fatG + snap.fatG) * 10) / 10;
  } else {
    return { ok: false, reason: 'no_destination' };
  }

  const sumMacro = (rows, key) => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
  const dailyKcalBefore = Math.round(sumMacro(before, 'kcal') * 10) / 10;
  const dailyKcalAfter = Math.round(sumMacro(after, 'kcal') * 10) / 10;
  if (Math.abs(dailyKcalBefore - dailyKcalAfter) > 0.2) {
    return { ok: false, reason: 'daily_total_drift' };
  }

  const conserved = { kcal: true };
  if (snap.documented.proteinG) {
    conserved.proteinG = Math.abs(sumMacro(before, 'proteinG') - sumMacro(after, 'proteinG')) < 0.2;
  }
  if (snap.documented.carbG) {
    conserved.carbG = Math.abs(sumMacro(before, 'carbG') - sumMacro(after, 'carbG')) < 0.2;
  }
  if (snap.documented.fatG) {
    conserved.fatG = Math.abs(sumMacro(before, 'fatG') - sumMacro(after, 'fatG')) < 0.2;
  }

  return {
    ok: true,
    item: snap,
    mealTotalsBefore: before,
    mealTotalsAfter: after,
    dailyKcalBefore,
    dailyKcalAfter,
    conservedMacros: conserved,
  };
}

/**
 * Verifica che la destinazione intervenga sulla criticità (non pranzo se il problema è gap pre-workout).
 * @param {string} criticalityId
 * @param {object} move
 * @param {object} ctx
 */
function validatesAgainstCriticality(criticalityId, move, ctx) {
  if (criticalityId === 'pre_workout_fuel_gap') {
    if (!move.toVirtual) return { ok: false, reason: 'needs_pre_workout_snack_not_lunch' };
    const snackH = Number(move.toVirtual.clockHour);
    const wH = Number(ctx.workoutHour);
    const lunchH = Number(ctx.lunchHour);
    if (!(snackH > lunchH && snackH < wH)) {
      return { ok: false, reason: 'snack_not_between_lunch_and_workout' };
    }
    if (wH - snackH > 2.5 || wH - snackH < 0.4) {
      return { ok: false, reason: 'snack_timing_not_plausible' };
    }
    if (move.toSlotId && ctx.lunchSlotId && move.toSlotId === ctx.lunchSlotId) {
      return { ok: false, reason: 'moving_to_lunch_does_not_fix_gap' };
    }
    return { ok: true };
  }
  if (criticalityId === 'late_heavy_dinner') {
    if (move.toVirtual) return { ok: false, reason: 'late_dinner_should_use_existing_earlier_meal' };
    return { ok: true };
  }
  return { ok: true };
}

function emptyResult(reason, limits = [], extra = {}) {
  const statusAlias = {
    insufficient_data: 'insufficient_data',
    low_or_incomplete_intake: 'low_or_incomplete_intake',
    no_justified_advantage: 'no_justified_advantage',
  };
  return {
    schema: 'kentu.focusMealRedistributionManeuver.v1',
    suggested: false,
    status: statusAlias[reason] || 'no_change',
    reason,
    message: NO_MANEUVER_MSG,
    criticality: null,
    objective: null,
    observation: extra.observation || null,
    suggestedChange: null,
    expectedAdvantage: null,
    tradeoffs: null,
    motivation: null,
    watchNextDays: extra.watchNextDays || null,
    limits,
    simulation: null,
    policy: {
      simulationOnly: true,
      noDiaryWrite: true,
      noInventedFoods: true,
      preserveDailyTotals: true,
      noBussolaScore: true,
      mustAddressCriticality: true,
      longGapAloneNotEnough: true,
    },
  };
}

/**
 * @param {{
 *   periodId?: string,
 *   nutritionView?: object|null,
 *   wellness?: object|null,
 *   sleepNight?: object|null,
 *   userTargets?: object|null,
 *   analysisDate?: string|null,
 *   publicationDate?: string|null,
 * }} input
 */
export function buildFocusMealRedistributionManeuver(input) {
  const periodId = String(input.periodId || 'ieri').toLowerCase();
  /** @type {string[]} */
  const limits = [];

  if (periodId !== 'ieri') {
    return emptyResult('period_not_ieri', [
      'La redistribuzione è valutata sul giorno di analisi (Ieri).',
    ]);
  }

  const ieri = input.nutritionView?.ieri;
  if (!ieri?.hasFood || !Array.isArray(ieri.meals) || ieri.meals.length < 2) {
    return emptyResult('insufficient_data', [
      'Servono almeno due pasti registrati con alimenti reali.',
    ]);
  }

  const timed = mealsWithTime(ieri.meals);
  if (timed.length < 2) {
    return emptyResult('insufficient_data', [
      'Orari dei pasti incompleti: senza orari attendibili non propongo spostamenti.',
    ]);
  }

  const dayKcal = ieri.totals?.kcal?.usableForJudgement
    ? Number(ieri.totals.kcal.value)
    : timed.reduce((s, m) => s + (Number(m.distribution?.kcal) || 0), 0);

  if (!Number.isFinite(dayKcal) || dayKcal <= 0) {
    return emptyResult('insufficient_data', ['Energia giornaliera non attendibile.']);
  }

  const targets = input.userTargets && typeof input.userTargets === 'object'
    ? input.userTargets
    : null;
  const targetKcal = targets?.kcal != null ? Number(targets.kcal) : null;

  if (dayKcal < LOW_DAY_KCAL
    || (targetKcal && Number.isFinite(targetKcal) && dayKcal < targetKcal * 0.45)) {
    return emptyResult('low_or_incomplete_intake', [
      `Apporto energetico registrato molto basso o incompleto (~${Math.round(dayKcal)} kcal)`
        + (targetKcal ? ` rispetto al target di sessione (~${Math.round(targetKcal)} kcal)` : '')
        + ': non tratto la giornata come nutrizionalmente normale e non propongo redistribuzioni.',
    ], {
      observation: 'I pasti registrati non bastano per una manovra di redistribuzione credibile.',
    });
  }

  if (!targets?.kcal) {
    limits.push('Obiettivo calorico personale non disponibile in sessione: non lo invento.');
  }
  if (input.sleepNight && !input.sleepNight.sleepAvailable) {
    limits.push('Sonno non registrato: nessuna causalità cena–sonno.');
  } else if (!input.sleepNight) {
    limits.push('Dato sonno non allegato a questa manovra.');
  }

  const workouts = (input.wellness?.pillarsById?.exercise?.workouts || [])
    .filter((w) => w && Number.isFinite(Number(w.clockHour)));

  /** @type {object[]} */
  const candidates = [];

  // --- Criticità: gap lungo CON allenamento → serve carburante PRIMA dell'allenamento ---
  for (const w of workouts) {
    const gap = findGapContainingWorkout(timed, Number(w.clockHour));
    if (!gap || gap.gapHours < LONG_GAP_HOURS) continue;

    const dinner = gap.after;
    const lunch = gap.before;
    const snackHour = suggestPreWorkoutSnackHour(Number(lunch.clockHour), Number(w.clockHour));
    if (snackHour == null) {
      limits.push('Non riesco a collocare uno spuntino plausibile fra pranzo e allenamento.');
      continue;
    }

    const dominant = dominantProteinItem(dinner);
    const item = pickPreWorkoutFuelItem(dinner, dominant);
    if (!item) {
      candidates.push({
        blocked: true,
        criticalityId: 'pre_workout_fuel_gap',
        blockReason: 'only_main_protein_or_no_suitable_fuel',
        observation: `Allenamento alle ${w.clockLabel || formatClock(w.clockHour)} in un intervallo di ~${gap.gapHours} h `
          + `fra ${lunch.mealLabel} e ${dinner.mealLabel}, ma in ${dinner.mealLabel} non ci sono alimenti adatti `
          + 'da spostare come supporto (carboidrati/extra) senza togliere la principale fonte proteica.',
      });
      continue;
    }

    const toVirtual = {
      mealLabel: 'Spuntino pre-allenamento (simulato)',
      clockHour: snackHour,
      clockLabel: formatClock(snackHour),
    };

    const move = {
      fromSlotId: dinner.mealSlotId,
      toSlotId: null,
      toVirtual,
      itemId: item.id || null,
      itemName: item.name,
    };

    const gate = validatesAgainstCriticality('pre_workout_fuel_gap', move, {
      workoutHour: Number(w.clockHour),
      lunchHour: Number(lunch.clockHour),
      lunchSlotId: lunch.mealSlotId,
    });
    if (!gate.ok) continue;

    const sim = simulateRedistribution(ieri.meals, move);
    if (!sim.ok) continue;

    const muscles = (w.muscleGroups || []).join(', ');
    candidates.push({
      blocked: false,
      criticalityId: 'pre_workout_fuel_gap',
      criticality: `Intervallo lungo (~${gap.gapHours} h) fra ${lunch.mealLabel} (${lunch.clockLabel}) e `
        + `${dinner.mealLabel} (${dinner.clockLabel}) con allenamento `
        + `(${w.label || 'sessione'}${muscles ? ` · ${muscles}` : ''}) alle `
        + `${w.clockLabel || formatClock(w.clockHour)}, senza pasto intermedio registrato.`,
      objective: 'Avvicinare energia/carboidrati documentati all’allenamento con uno spuntino simulato, '
        + 'senza anticipare tutto al pranzo (che non chiude il gap pomeridiano).',
      expectedAdvantage: `Riduce le ore senza apporto prima dell’allenamento: l’alimento arriva intorno alle `
        + `${toVirtual.clockLabel}, non alle ${lunch.clockLabel}.`,
      tradeoffs: dominant
        ? `La principale fonte proteica di ${dinner.mealLabel} («${dominant.name}») resta a cena per non peggiorare il recupero.`
        : `Compromesso: alleggerisce leggermente ${dinner.mealLabel}; totale giornaliero invariato sui macro documentati.`,
      observation: `Fra ${lunch.clockLabel} e ${dinner.clockLabel} passano ~${gap.gapHours} ore e l’allenamento è alle `
        + `${w.clockLabel || formatClock(w.clockHour)}. Spostare cibo solo al pranzo non colmerebbe questo buco.`,
      move,
      sim,
      watchNextDays: 'Osserva energia in allenamento e sazietà serale; non aggiungere digiuni o pasti inventati nel diario.',
      score: 30 + Math.min(gap.gapHours, 10),
    });
  }

  // --- Criticità: cena tarda e molto concentrata (senza confonderla col gap pre-workout) ---
  const hasWorkoutGapCandidate = candidates.some((c) => !c.blocked && c.criticalityId === 'pre_workout_fuel_gap');
  if (!hasWorkoutGapCandidate) {
    for (const m of timed.filter((x) => Number(x.clockHour) >= LATE_DINNER_HOUR)) {
      const share = (Number(m.distribution?.kcal) || 0) / dayKcal;
      if (share < HEAVY_MEAL_SHARE) continue;
      const earlier = timed.filter((x) => Number(x.clockHour) < Number(m.clockHour)).slice(-1)[0];
      if (!earlier) continue;
      const dominant = dominantProteinItem(m);
      const item = pickLateDinnerLightener(m, dominant, { allowProtein: false });
      if (!item) {
        candidates.push({
          blocked: true,
          criticalityId: 'late_heavy_dinner',
          blockReason: 'only_main_protein_available',
          observation: `${m.mealLabel} è tarda e concentrata, ma gli unici alimenti spostabili sarebbero la fonte proteica principale.`,
        });
        continue;
      }
      const move = {
        fromSlotId: m.mealSlotId,
        toSlotId: earlier.mealSlotId,
        toVirtual: null,
        itemId: item.id || null,
        itemName: item.name,
      };
      const sim = simulateRedistribution(ieri.meals, move);
      if (!sim.ok) continue;
      candidates.push({
        blocked: false,
        criticalityId: 'late_heavy_dinner',
        criticality: `${m.mealLabel} alle ${m.clockLabel} concentra ~${Math.round(share * 100)}% dell’energia del giorno.`,
        objective: `Alleggerire ${m.mealLabel} spostando un extra già registrato a ${earlier.mealLabel}, senza togliere la proteina principale.`,
        expectedAdvantage: `Meno carico energetico tardivo; ${earlier.mealLabel} guadagna l’alimento spostato.`,
        tradeoffs: dominant
          ? `«${dominant.name}» resta a ${m.mealLabel}.`
          : 'Totale giornaliero invariato sui macro documentati.',
        observation: `${m.mealLabel} è molto concentrata in tarda serata rispetto al resto della giornata registrata.`,
        move,
        sim,
        watchNextDays: 'Osserva sazietà serale e riposo senza interpretare la manovra come cura del sonno.',
        score: 20 + Math.round(share * 20),
      });
    }
  }

  const viable = candidates.filter((c) => !c.blocked).sort((a, b) => (b.score || 0) - (a.score || 0));
  const blocked = candidates.filter((c) => c.blocked);

  if (!viable.length) {
    if (blocked.some((b) => b.criticalityId === 'pre_workout_fuel_gap')) {
      const b = blocked.find((x) => x.criticalityId === 'pre_workout_fuel_gap');
      return emptyResult('no_justified_advantage', [
        ...limits,
        'Esiste un gap pre-allenamento, ma non c’è un alimento adatto (es. fonte di carboidrati) da spostare senza compromettere le proteine della cena.',
      ], {
        observation: b?.observation || null,
        watchNextDays: 'Se registri anche un carboidrato a cena, potrò valutare uno spuntino simulato pre-allenamento.',
      });
    }

    const onlyGaps = timed.some((m, i) => {
      if (i === 0) return false;
      return Number(m.clockHour) - Number(timed[i - 1].clockHour) >= LONG_GAP_HOURS;
    }) && workouts.length === 0;

    if (onlyGaps) {
      limits.push('Intervalli lunghi fra registrazioni da soli non giustificano uno spuntino (non presumo digiuno errato).');
    }

    return emptyResult('no_significant_opportunity', limits, {
      observation: onlyGaps
        ? 'Ci sono intervalli ampi fra i pasti, senza allenamento nel mezzo né altre criticità documentate.'
        : 'Nessuna criticità con vantaggio pratico abbastanza chiaro per una redistribuzione.',
      watchNextDays: 'Continua a registrare pasti, orari e allenamenti in modo completo.',
    });
  }

  const best = viable[0];
  const sim = best.sim;
  const move = best.move;
  const item = sim.item;

  // Re-validate criticality on chosen move
  if (best.criticalityId === 'pre_workout_fuel_gap') {
    const w = workouts.find((x) => {
      const g = findGapContainingWorkout(timed, Number(x.clockHour));
      return g && g.after.mealSlotId === move.fromSlotId;
    });
    const lunch = timed.find((m) => Number(m.clockHour) < Number(w?.clockHour));
    const gate = validatesAgainstCriticality('pre_workout_fuel_gap', move, {
      workoutHour: Number(w?.clockHour),
      lunchHour: Number(lunch?.clockHour),
      lunchSlotId: lunch?.mealSlotId,
    });
    if (!gate.ok) {
      return emptyResult('validation_failed', [...limits, `La proposta non interviene sulla criticità (${gate.reason}).`]);
    }
  }

  const toLabel = move.toVirtual
    ? `${move.toVirtual.mealLabel} · ${move.toVirtual.clockLabel}`
    : (() => {
      const dest = timed.find((m) => m.mealSlotId === move.toSlotId);
      return dest ? `${dest.mealLabel} (${dest.clockLabel})` : 'pasto precedente';
    })();

  const fromMeal = timed.find((m) => m.mealSlotId === move.fromSlotId)
    || ieri.meals.find((m) => m.mealSlotId === move.fromSlotId);

  const macroBits = [
    item.kcal != null ? `${Math.round(item.kcal)} kcal` : null,
    item.documented.proteinG ? `P ${item.proteinG} g` : null,
    item.documented.carbG ? `C ${item.carbG} g` : null,
    item.documented.fatG ? `F ${item.fatG} g` : null,
  ].filter(Boolean).join(' · ');

  const suggestedChange = {
    type: move.toVirtual ? 'move_food_to_simulated_snack' : 'move_food_between_meals',
    foodName: item.name,
    grams: item.grams,
    kcal: item.kcal,
    proteinG: item.documented.proteinG ? item.proteinG : null,
    carbG: item.documented.carbG ? item.carbG : null,
    fatG: item.documented.fatG ? item.fatG : null,
    role: item.role,
    from: {
      mealLabel: fromMeal?.mealLabel || null,
      mealSlotId: move.fromSlotId,
      clockLabel: fromMeal?.clockLabel || null,
    },
    to: move.toVirtual
      ? {
        mealLabel: move.toVirtual.mealLabel,
        mealSlotId: null,
        clockLabel: move.toVirtual.clockLabel,
        clockHour: move.toVirtual.clockHour,
        virtualSnack: true,
      }
      : {
        mealLabel: timed.find((m) => m.mealSlotId === move.toSlotId)?.mealLabel || null,
        mealSlotId: move.toSlotId,
        clockLabel: timed.find((m) => m.mealSlotId === move.toSlotId)?.clockLabel || null,
        virtualSnack: false,
      },
    text: `Sposta «${item.name}» (${item.grams} g${macroBits ? ` · ${macroBits}` : ''}) `
      + `da ${fromMeal?.mealLabel || 'pasto'} (${fromMeal?.clockLabel || '?'}) a ${toLabel}.`,
  };

  if (targetKcal) {
    limits.push(`Target energetico in sessione: ~${Math.round(targetKcal)} kcal (contesto, non score).`);
  }
  limits.push('Simulazione: nessuna scrittura sul diario. Conservo solo i macro effettivamente documentati sull’alimento.');

  return {
    schema: 'kentu.focusMealRedistributionManeuver.v1',
    suggested: true,
    status: 'proposal',
    reason: best.criticalityId,
    message: suggestedChange.text,
    criticality: best.criticality,
    objective: best.objective,
    observation: best.observation,
    suggestedChange,
    expectedAdvantage: best.expectedAdvantage,
    tradeoffs: best.tradeoffs,
    motivation: best.expectedAdvantage,
    watchNextDays: best.watchNextDays,
    limits,
    simulation: {
      dailyKcalUnchanged: true,
      dailyKcalBefore: sim.dailyKcalBefore,
      dailyKcalAfter: sim.dailyKcalAfter,
      conservedMacros: sim.conservedMacros,
      item: sim.item,
      mealTotalsBefore: sim.mealTotalsBefore,
      mealTotalsAfter: sim.mealTotalsAfter,
      addressesCriticality: true,
    },
    policy: {
      simulationOnly: true,
      noDiaryWrite: true,
      noInventedFoods: true,
      preserveDailyTotals: true,
      noBussolaScore: true,
      mustAddressCriticality: true,
      longGapAloneNotEnough: true,
      dinnerToLunchNotValidForPreWorkoutGap: true,
    },
  };
}
