import {
  normalizeLogData,
  addDays,
  getTodayString,
  getLogFromStoricoTree,
} from '../../coreEngine';

/** Totali kcal/P/C/F solo da voci food/recipe nel log giornaliero. */
export function aggregateFoodRecipeDayTotals(log) {
  const list = normalizeLogData(Array.isArray(log) ? log : Object.values(log || {}));
  let kcal = 0;
  let prot = 0;
  let carb = 0;
  let fat = 0;
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item || (item.type !== 'food' && item.type !== 'recipe')) continue;
    kcal += Number(item.kcal ?? item.cal) || 0;
    prot += Number(item.prot ?? item.proteine) || 0;
    carb += Number(item.carb ?? item.carboidrati) || 0;
    fat += Number(item.fatTotal ?? item.fat ?? item.grassi) || 0;
  }
  return { kcal, prot, carb, fat };
}

/**
 * Prompt nascosto per Quick Action "Briefing": solo numeri locali, niente domanda generica.
 */
export function buildQuickBriefingSecretPrompt({
  bodyBatteryPercent,
  dynamicDailyKcal,
  totali,
  userTargets,
  strategicPlan,
}) {
  const daysMap = ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato'];
  const todayPlan = strategicPlan?.days?.[daysMap[new Date().getDay()]];
  const strategyContext = todayPlan 
    ? `\n\n[INFO CRITICA: L'utente ha pianificato per OGGI un'attività strategica: ${todayPlan.type} (Focus: ${todayPlan.focus?.join(', ') || 'Nessuno'}) alle ore ${todayPlan.hour}. Tieni conto di questo impegno nel tuo briefing, suggerendo come prepararsi nutrizionalmente e mentalmente.]`
    : '';
  const bb = Math.round(Number(bodyBatteryPercent) || 0);
  const dynK = Math.round(Number(dynamicDailyKcal) || 0);
  const eatenK = Math.round(Number(totali?.kcal) || 0);
  const kcalSurplus = eatenK > dynK ? Math.round(eatenK - dynK) : 0;
  const resKcal = Math.max(0, dynK - eatenK);
  const kcalBalanceSnippet =
    kcalSurplus > 0 ? `SURPLUS +${kcalSurplus} kcal` : `residuo ~${resKcal}kcal`;
  const tProt = Number(userTargets?.prot ?? 150);
  const tCarb = Number(userTargets?.carb ?? 200);
  const tFat = Number(userTargets?.fatTotal ?? userTargets?.fat ?? 65);
  const eProt = Number(totali?.prot) || 0;
  const eCarb = Number(totali?.carb) || 0;
  const eFat = Number(totali?.fatTotal ?? totali?.fat) || 0;
  const rProt = Math.max(0, Math.round((tProt - eProt) * 10) / 10);
  const rCarb = Math.max(0, Math.round((tCarb - eCarb) * 10) / 10);
  const rFat = Math.max(0, Math.round((tFat - eFat) * 10) / 10);
  return (
    `QUICK_ACTION=BRIEFING. Sintesi operativa solo da questi dati (non chiedere altri dati): ` +
    `BB ${bb}% · budget kcal giornaliero ~${dynK} · assunte ${eatenK}kcal · ${kcalBalanceSnippet} · ` +
    `macro residui ${rProt}g P / ${rCarb}g C / ${rFat}g F. ` +
    `Applica REGOLE DI STILE Quick Action (Lavagna, max 3 elenchi, zero intro/outro).` +
    strategyContext
  );
}

/**
 * Prompt nascosto "Analisi ieri": solo scostamenti vs target da log storico (local-first).
 */
export function buildYesterdayGapSecretPrompt(fullHistory, anchorDateStr, userTargets) {
  const anchor = anchorDateStr || getTodayString();
  const yStr = addDays(anchor, -1);
  const rawLog = getLogFromStoricoTree(fullHistory, yStr) || [];
  const agg = aggregateFoodRecipeDayTotals(rawLog);
  const tK = Number(userTargets?.kcal ?? 2000);
  const tP = Number(userTargets?.prot ?? 150);
  const tC = Number(userTargets?.carb ?? 200);
  const tF = Number(userTargets?.fatTotal ?? userTargets?.fat ?? 65);
  const thin = agg.kcal < 5 && agg.prot < 1 && agg.carb < 1 && agg.fat < 1;
  const gaps = [];
  if (thin) {
    gaps.push('log alimenti vuoto o quasi per quel giorno');
  } else {
    const dk = agg.kcal - tK;
    if (Math.abs(dk) > 120) gaps.push(`kcal ${Math.round(agg.kcal)} vs target ${Math.round(tK)} (${dk > 0 ? '+' : ''}${Math.round(dk)})`);
    const dp = agg.prot - tP;
    if (Math.abs(dp) > 15) gaps.push(`prot ${Math.round(agg.prot)}g vs ${Math.round(tP)}g (${dp > 0 ? '+' : ''}${Math.round(dp)}g)`);
    const dc = agg.carb - tC;
    if (Math.abs(dc) > 30) gaps.push(`carb ${Math.round(agg.carb)}g vs ${Math.round(tC)}g (${dc > 0 ? '+' : ''}${Math.round(dc)}g)`);
    const df = agg.fat - tF;
    if (Math.abs(df) > 15) gaps.push(`grassi ${Math.round(agg.fat)}g vs ${Math.round(tF)}g (${df > 0 ? '+' : ''}${Math.round(df)}g)`);
  }
  if (gaps.length === 0) gaps.push('nessuno scostamento macro/kcal rilevante vs target');
  return (
    `QUICK_ACTION=ANALISI_IERI. Giorno ${yStr}. Solo questi fatti (non inventare, non elencare ogni pasto): ${gaps.join(' · ')}. ` +
    `Interpreta come coach: cosa correggere oggi. REGOLE DI STILE Quick Action (Lavagna, max 3 elenchi, zero intro/outro).`
  );
}

/** Quick Action "Idea pasto": forza solo MEAL_PROPOSAL; Dispensa e macro sono in [CONTEXT_LIVE]. */
export function buildMealIdeaFromDispensaSecretPrompt() {
  return (
    `QUICK_ACTION=IDEA_PASTO. Usa ESCLUSIVAMENTE [CONTEXT_LIVE] per macro residui e Dispensa probabile. ` +
    `Rispetta i vincoli Smart in [CONTEXT_LIVE] (pranzo: tetto zuccheri semplici e fibre minime; cena: tetto grassi fisso). ` +
    `Priorità ingredienti: pranzo = verdure fibrose e proteine magre; cena = carboidrati complessi e proteine magre, grassi bassi. ` +
    `Se nessun alimento in Dispensa è ideale, stima quantità con macro credibili (fallback) e non bloccare la proposta. ` +
    `Proponi UN pasto con ingredienti prioritariamente dalla Dispensa. ` +
    `Rispondi SOLO con il blocco [MEAL_PROPOSAL:{...}] su una riga (CARTA MENU), zero testo prima o dopo.`
  );
}

/**
 * Pasti unici (ultimi 30 giorni) dal diario storico: label compatta + macro medi per occorrenza (contesto agenda Kentu).
 */
export function buildRecentMealsContextForDinner(fullHistory, anchorDateStr) {
  if (!fullHistory || typeof fullHistory !== 'object' || !anchorDateStr) return '';

  const byNorm = new Map();

  for (let i = 0; i < 30; i++) {
    const dStr = addDays(anchorDateStr, -i);
    const log = getLogFromStoricoTree(fullHistory, dStr) || [];
    const foods = log.filter(
      (item) => item && (item.type === 'food' || item.type === 'recipe' || item.type === 'meal')
    );
    if (foods.length === 0) continue;

    const groups = {};
    foods.forEach((item) => {
      const timeKey = typeof item.mealTime === 'number' ? String(item.mealTime) : 'unknown';
      const typeKey = item.mealType || 'pasto';
      const gid = `${typeKey}_${timeKey}`;
      if (!groups[gid]) groups[gid] = [];
      groups[gid].push(item);
    });

    Object.values(groups).forEach((items) => {
      if (!items.length) return;
      const names = [];
      const seen = new Set();
      for (const it of items) {
        const raw = (it.desc || it.name || '').trim();
        if (!raw) continue;
        const low = raw.toLowerCase();
        if (seen.has(low)) continue;
        seen.add(low);
        names.push(raw);
        if (names.length >= 4) break;
      }
      if (!names.length) return;

      const displayName = names.slice(0, 3).join(' e ');
      const norm = displayName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      let kcal = 0;
      let prot = 0;
      let carb = 0;
      let fat = 0;
      items.forEach((it) => {
        kcal += Number(it.kcal || it.cal || 0) || 0;
        prot += Number(it.prot || it.proteine || 0) || 0;
        carb += Number(it.carb || it.carboidrati || 0) || 0;
        fat += Number(it.fatTotal || it.fat || it.grassi || 0) || 0;
      });

      if (kcal < 10 && prot < 2 && carb < 2 && fat < 2) return;

      const prev = byNorm.get(norm);
      if (prev) {
        prev.n += 1;
        prev.kcal += kcal;
        prev.prot += prot;
        prev.carb += carb;
        prev.fat += fat;
        if (displayName.length > prev.label.length) prev.label = displayName;
      } else {
        byNorm.set(norm, { label: displayName, n: 1, kcal, prot, carb, fat });
      }
    });
  }

  const rows = Array.from(byNorm.values())
    .map((v) => ({
      label: v.label.length > 72 ? `${v.label.slice(0, 69)}…` : v.label,
      n: v.n,
      kcal: Math.round(v.kcal / v.n),
      prot: Math.round(v.prot / v.n),
      carb: Math.round(v.carb / v.n),
      fat: Math.round(v.fat / v.n)
    }))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
    .slice(0, 25);

  return rows.map((r) => `- ${r.label} (~${r.kcal} kcal, P${r.prot} / C${r.carb} / F${r.fat} g)`).join('\n');
}

const AI_MEAL_CONSTRAINTS_MAX_ITEMS = 20;

function normalizeAiMealConstraintList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value
      .map((x) => String(x).trim())
      .filter(Boolean)
      .slice(0, AI_MEAL_CONSTRAINTS_MAX_ITEMS);
  }
  if (typeof value === 'string') {
    return value
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, AI_MEAL_CONSTRAINTS_MAX_ITEMS);
  }
  return [];
}

/**
 * Blocco testo per prompt Gemini: fissi / esclusi / preferiti.
 * @param {object} [constraints]
 * @param {string|string[]} [constraints.fixedFoods]
 * @param {string|string[]} [constraints.excludedFoods]
 * @param {string|string[]} [constraints.preferredFoods]
 */
export function buildAiMealConstraintsPromptBlock(constraints) {
  const c = constraints && typeof constraints === 'object' ? constraints : {};
  const fixed = normalizeAiMealConstraintList(c.fixedFoods ?? c.fixed);
  const excluded = normalizeAiMealConstraintList(c.excludedFoods ?? c.excluded);
  const preferred = normalizeAiMealConstraintList(c.preferredFoods ?? c.preferred);
  if (fixed.length === 0 && excluded.length === 0 && preferred.length === 0) return '';
  const lines = [
    '',
    'VINCOLI MENU (OBBLIGATORI — applica alla lista alimenti che generi):',
  ];
  if (fixed.length > 0) {
    lines.push(
      `- INCLUDI OBBLIGATORIAMENTE questi alimenti (grammi realistici per porzione; ogni nome deve comparire come voce distinta nell'output): ${fixed.join('; ')}`
    );
  }
  if (excluded.length > 0) {
    lines.push(
      `- NON includere né sostituti stretti di: ${excluded.join('; ')} (niente derivati oculati dello stesso ingrediente).`
    );
  }
  if (preferred.length > 0) {
    lines.push(
      `- PREFERISCI dove compatibile con target e storico (includi almeno uno se sensato): ${preferred.join('; ')}`
    );
  }
  lines.push(
    'Verifica prima di rispondere: tutti i fissi presenti; nessun escluso; preferiti rispettati se possibile senza violare i target.'
  );
  return lines.join('\n');
}

/** Righe compatte pasti ultimi 7 giorni (prompt generazione draftFoods). */
export function buildLast7DaysMealLinesForDraftPrompt(fullHistory, anchorDateStr) {
  if (!fullHistory || typeof fullHistory !== 'object' || !anchorDateStr) return '(nessuno storico)';
  const lines = [];
  for (let i = 0; i < 7; i++) {
    const dStr = addDays(anchorDateStr, -i);
    const log = getLogFromStoricoTree(fullHistory, dStr) || [];
    log.forEach((item) => {
      if (!item || (item.type !== 'food' && item.type !== 'recipe' && item.type !== 'meal')) return;
      const d = String(item.desc || item.name || '').trim();
      if (!d) return;
      const mt = item.mealType || '';
      const kcal = Math.round(Number(item.kcal || item.cal) || 0);
      lines.push(`- ${d} (${mt}, ~${kcal} kcal)`);
    });
  }
  return lines.slice(0, 45).join('\n') || '(nessun pasto negli ultimi 7 giorni)';
}

/**
 * Ultime ~30 giorni: attività / allenamenti dal diario storico, medie durata e kcal per tipo.
 */
export function buildRecentActivitiesContext(fullHistory, anchorDateStr) {
  if (!fullHistory || typeof fullHistory !== 'object' || !anchorDateStr) return '';

  const byNorm = new Map();

  for (let i = 0; i < 30; i++) {
    const dStr = addDays(anchorDateStr, -i);
    const log = getLogFromStoricoTree(fullHistory, dStr) || [];
    const acts = log.filter(
      (item) =>
        item &&
        (item.type === 'workout' ||
          item.type === 'work' ||
          item.type === 'activity' ||
          item.type === 'cognitive')
    );
    acts.forEach((item) => {
      const raw = (item.desc || item.name || item.label || '').trim();
      if (!raw) return;
      const norm = raw
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const durH = Number(item.duration);
      const hours = Number.isFinite(durH) && durH > 0 ? durH : null;
      const kcal = Number(item.kcal || item.cal || 0) || 0;
      const prev = byNorm.get(norm);
      if (prev) {
        prev.n += 1;
        if (hours != null) {
          prev.durSum += hours;
          prev.durCount += 1;
        }
        prev.kcal += kcal;
        if (raw.length > prev.label.length) prev.label = raw;
      } else {
        byNorm.set(norm, {
          label: raw,
          n: 1,
          durSum: hours != null ? hours : 0,
          durCount: hours != null ? 1 : 0,
          kcal,
        });
      }
    });
  }

  const rows = Array.from(byNorm.values())
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
    .slice(0, 20)
    .map((v) => {
      const avgK = Math.round(v.kcal / Math.max(1, v.n));
      let durPart = 'n/d';
      if (v.durCount > 0) {
        const avgH = v.durSum / v.durCount;
        if (avgH >= 1) durPart = `${avgH.toFixed(1).replace(/\.0$/, '')}h`;
        else if (avgH > 0) durPart = `${Math.round(avgH * 60)}min`;
      }
      return `- ${v.label.length > 56 ? `${v.label.slice(0, 53)}…` : v.label} (media ${durPart}, ~${avgK} kcal)`;
    });

  return rows.join('\n');
}

export function buildKentuAgendaSecretPrompt(userMessage, activitiesContext, mealsContext) {
  const act =
    activitiesContext && String(activitiesContext).trim()
      ? String(activitiesContext).trim()
      : '(nessuna attività strutturata negli ultimi 30 giorni nel diario)';
  const meals =
    mealsContext && String(mealsContext).trim()
      ? String(mealsContext).trim()
      : '(nessun pasto recente rilevante nel diario)';
  const safeUser = String(userMessage || '').trim() || '(nessun dettaglio fornito)';
  return `L'utente ha questi piani per oggi: ${safeUser}

STORICO ATTIVITÀ:
${act}

STORICO PASTI:
${meals}

DIRETTIVE:
1. Trova le attività nello storico che combaciano con i piani di oggi. Se non ci sono, stima tu calorie e durata.
2. Genera una strategia nutrizionale rapida per supportare questo specifico carico di lavoro (es. quando inserire i carboidrati per l'allenamento gambe), usando i pasti dello storico se possibile.
3. Rispondi in modo discorsivo ma conciso.
4. Alla fine, allega un blocco JSON chiamato agenda_options contenente un array delle attività individuate, con "name", "duration" (in minuti) e "kcal" stimate.

Formato esatto dell'ultima riga (solo JSON valido, senza markdown):
{"agenda_options":[{"name":"etichetta breve","duration":90,"kcal":300}]}`;
}

/** Snapshot stabile delle voci food/recipe per il coach (stesso contenuto → stessa stringa anche con array nuovo). */
export function buildAiCoachFoodLogFingerprint(log) {
  const arr = log || [];
  const parts = [];
  for (let i = 0; i < arr.length; i += 1) {
    const e = arr[i];
    if (!e || (e.type !== 'food' && e.type !== 'recipe' && e.type !== 'ghost_meal')) continue;
    const id = e.id ?? e.entryId ?? e.logId ?? `idx${i}`;
    const mtRaw = String(e.mealType || 'snack').split('_')[0];
    const kcal = Number(e.kcal ?? e.cal) || 0;
    const prot = Number(e.prot ?? e.proteine) || 0;
    parts.push(`${id}:${e.type}:${mtRaw}:${kcal}:${prot}`);
  }
  return parts.join('|');
}
