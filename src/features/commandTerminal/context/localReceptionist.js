/**
 * Local Receptionist — triage locale per query di sola lettura (macro / cardio / cilindri).
 * Risponde senza chiamare Gemini quando il pattern è chiaro e i dati sono in KENTU_GLOBAL_STATE.
 *
 * Non importa kentuGlobalState: riceve il pack già costruito dal controller
 * (buildKentuGlobalStateFromAppState(...).object).
 */

function asTrimmedString(value) {
  return String(value ?? '').trim();
}

function normalizeQuery(text) {
  return asTrimmedString(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Azioni di scrittura: il receptionist NON deve intercettarle. */
const WRITE_ACTION_RE =
  /\b(ho\s+mangiat|ho\s+bevut|ho\s+preso|ho\s+completato|registra|aggiung|logga|inserisci|salva|modifica|togli|rimuovi|sostituisci)\b/i;

/** "ho fatto X" come log azione — non come domanda ("quanto cardio ho fatto?"). */
const WRITE_HO_FATTO_RE =
  /^(?!.*\b(?:quanto|quante|come|cosa|stato|budget)\b).*?\bho\s+fatto\b/i;

/**
 * True se il testo sembra un inserimento dati (non una domanda di stato).
 * @param {string} text
 * @returns {boolean}
 */
function looksLikeWriteAction(text) {
  const raw = asTrimmedString(text);
  if (!raw) return false;
  // Domande / consulti: mai trattarli come write.
  if (/\?/.test(raw)) return false;
  if (/^(quanto|quante|come|cosa|stato|budget|macro|calorie|proteine|cilindr)/i.test(raw)) {
    return false;
  }
  if (WRITE_ACTION_RE.test(raw)) return true;
  if (WRITE_HO_FATTO_RE.test(raw)) return true;
  return false;
}

const CARDIO_QUERY_RE =
  /\b(quanto\s+cardio|cardio\s+(?:fatto|fatti|riman|rimasti|status|stato)|stato\s+(?:del\s+)?cardio|minuti\s+(?:di\s+)?cardio|cilindro\s+cardio|fill\s+cardio)\b/i;

const MACRO_PRO_RE =
  /\b(quant[ea]\s+pro(?:teine?)?|pro(?:teine?)?\s+(?:mancanti|rimanenti|residue)|mi\s+mancano\s+(?:le\s+)?pro|proteine?\s+(?:oggi|riman))\b/i;

const MACRO_KCAL_RE =
  /\b(quant[ea]\s+(?:calor|kcal)|calorie\s+(?:riman|mancant|residue)|budget\s+(?:calor|kcal|energet)|kcal\s+(?:riman|mancant)|macro\s+riman|budget\s+metabol)\b/i;

const MACRO_CARB_RE =
  /\b(quant[ea]\s+(?:carb|cho)|carboidrat\w*\s+(?:riman|mancant)|cho\s+(?:riman|mancant))\b/i;

const MACRO_FAT_RE =
  /\b(quant[ea]\s+(?:grass|fat|lipidi)|grass[io]\s+(?:riman|mancant)|lipidi\s+(?:riman|mancant))\b/i;

const MACRO_GENERAL_RE =
  /\b(macro\s+(?:riman|di\s+oggi|oggi)|budget\s+(?:di\s+oggi|oggi)|rimanent[ei]\s+(?:di\s+oggi|oggi)|cosa\s+mi\s+manca\s+(?:di\s+)?(?:macro|oggi))\b/i;

const CYLINDER_QUERY_RE =
  /\b(?:stato\s+(?:dei\s+)?cilindr\w*|cilindr[io]\s+(?:muscolar\w*|spinta|trazione|gambe)|recupero\s+(?:muscolar\w*|spinta|trazione|gambe)|muscoli\s+(?:oggi|stato|recupero)|quanto\s+(?:stimolo|recupero)|(?:spinta|trazione|gambe)\s+(?:a\s+)?quanto|fase\s+di\s+recupero)\b/i;

const CYLINDER_PUSH_RE = /\b(spinta|push|petto)\b/i;
const CYLINDER_PULL_RE = /\b(trazione|pull|dorso|schiena)\b/i;
const CYLINDER_LEGS_RE = /\b(gambe|legs|lower)\b/i;

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Accetta il pack KENTU_GLOBAL_STATE (o wrapper { object }).
 * @param {object} globalState
 * @returns {object|null}
 */
function resolveGlobalStateObject(globalState = {}) {
  const raw = globalState && typeof globalState === 'object' ? globalState : {};
  if (raw.Nutrition_Context || raw.Cardio_Cylinder || raw.Muscular_Cylinders) {
    return raw;
  }
  if (raw.object && (raw.object.Nutrition_Context || raw.object.Cardio_Cylinder || raw.object.Muscular_Cylinders)) {
    return raw.object;
  }
  return null;
}

function formatDeltaMacro(delta, unitLabel) {
  const n = Math.round(asNumber(delta));
  if (n > 0) return `Ti mancano ${n}${unitLabel}`;
  if (n < 0) return `Hai sforato di ${Math.abs(n)}${unitLabel}`;
  return `Sei in pari (${unitLabel.trim()} a target)`;
}

function phaseLabel(phase) {
  const p = asTrimmedString(phase).toLowerCase();
  if (p === 'stimolo_alto') return 'stimolo alto';
  if (p === 'recupero_attivo') return 'recupero attivo';
  if (p === 'pronto') return 'pronto';
  return p || 'n/d';
}

function answerCardio(pack) {
  const cardio = pack?.Cardio_Cylinder || {};
  const acc = Math.round(asNumber(cardio.accumulatedMinutes));
  const target = Math.round(asNumber(cardio.weeklyTargetMinutes) || 150);
  const fill = Math.round(asNumber(cardio.fillPercent));
  const remain = Math.round(asNumber(cardio.remainingMinutes));
  const pure = Math.round(asNumber(cardio.pureCardioMinutes));
  const spill = Math.round(asNumber(cardio.spilloverFromStrengthMinutes));

  return (
    `Cardio (ultimi 7 giorni): ${acc} min su ${target} (${fill}%). `
    + `Puri ${pure} min + spillover pesi ${spill} min. `
    + (remain > 0 ? `Ti mancano circa ${remain} min al target.` : 'Target settimanale raggiunto.')
  );
}

function answerMacros(pack, focus = 'all') {
  const nutrition = pack?.Nutrition_Context || {};
  const delta = nutrition.Delta || {};
  const target = nutrition.Budget_Target || {};
  const consumed = nutrition.Consumato || {};

  if (focus === 'pro') {
    return `${formatDeltaMacro(delta.Pro, 'g di proteine')} oggi (consumate ${Math.round(asNumber(consumed.Pro))}/${Math.round(asNumber(target.Pro))}g).`;
  }
  if (focus === 'kcal') {
    return `${formatDeltaMacro(delta.Kcal, ' kcal')} oggi (consumate ${Math.round(asNumber(consumed.Kcal))}/${Math.round(asNumber(target.Kcal))} kcal).`;
  }
  if (focus === 'carb') {
    return `${formatDeltaMacro(delta.Cho, 'g di carboidrati')} oggi (consumati ${Math.round(asNumber(consumed.Cho))}/${Math.round(asNumber(target.Cho))}g).`;
  }
  if (focus === 'fat') {
    return `${formatDeltaMacro(delta.Fat, 'g di grassi')} oggi (consumati ${Math.round(asNumber(consumed.Fat))}/${Math.round(asNumber(target.Fat))}g).`;
  }

  return (
    `Budget di oggi — rimanenti: `
    + `${Math.round(asNumber(delta.Kcal))} kcal, `
    + `${Math.round(asNumber(delta.Pro))}g pro, `
    + `${Math.round(asNumber(delta.Cho))}g cho, `
    + `${Math.round(asNumber(delta.Fat))}g fat `
    + `(consumato ${Math.round(asNumber(consumed.Kcal))}/${Math.round(asNumber(target.Kcal))} kcal).`
  );
}

function answerCylinders(pack, query) {
  const cyl = pack?.Muscular_Cylinders || {};
  const legs = cyl.Gambe || {};
  const chest = cyl.Petto || {};
  const backShoulders = cyl.SchienaSpalle || {};
  const arms = cyl.Braccia || {};
  const core = cyl.AbsCore || {};

  const wantPush = CYLINDER_PUSH_RE.test(query);
  const wantPull = CYLINDER_PULL_RE.test(query);
  const wantLegs = CYLINDER_LEGS_RE.test(query);
  const specific = wantPush || wantPull || wantLegs;

  const lines = [];
  if (!specific || wantLegs) {
    lines.push(`Gambe ${Math.round(asNumber(legs.fillPercent))}% (${phaseLabel(legs.recoveryPhase)})`);
  }
  if (!specific || wantPush) {
    lines.push(`Petto ${Math.round(asNumber(chest.fillPercent))}% (${phaseLabel(chest.recoveryPhase)})`);
    lines.push(`Braccia ${Math.round(asNumber(arms.fillPercent))}% (${phaseLabel(arms.recoveryPhase)})`);
  }
  if (!specific || wantPull) {
    lines.push(`Schiena/Spalle ${Math.round(asNumber(backShoulders.fillPercent))}% (${phaseLabel(backShoulders.recoveryPhase)})`);
  }
  if (!specific) {
    lines.push(`Core ${Math.round(asNumber(core.fillPercent))}% (${phaseLabel(core.recoveryPhase)})`);
  }

  const systemic = Math.round(asNumber(cyl.systemicStressPct));
  const recovery = Math.round(asNumber(cyl.recoveryIndexPct));
  const phase = asTrimmedString(cyl.physiologyPhase) || 'n/d';

  return (
    `Cilindri: ${lines.join(' · ')}. `
    + `Fase ${phase}, stress sistemico ${systemic}%, indice recupero ${recovery}%.`
  );
}

/**
 * Intercetta query di routine e risponde in locale.
 *
 * @param {string} userInput
 * @param {object} globalState — oggetto KENTU_GLOBAL_STATE
 * @returns {string|null}
 */
export function handleLocalQuery(userInput, globalState = {}) {
  const raw = asTrimmedString(userInput);
  if (!raw) return null;

  // Mai intercettare azioni di scrittura (pasto/workout/log).
  if (looksLikeWriteAction(raw)) return null;

  const query = normalizeQuery(raw);
  if (!query) return null;

  const isCardio = CARDIO_QUERY_RE.test(query);
  const isPro = MACRO_PRO_RE.test(query);
  const isKcal = MACRO_KCAL_RE.test(query);
  const isCarb = MACRO_CARB_RE.test(query);
  const isFat = MACRO_FAT_RE.test(query);
  const isMacroGeneral = MACRO_GENERAL_RE.test(query);
  const isCylinder = CYLINDER_QUERY_RE.test(query);

  if (!isCardio && !isPro && !isKcal && !isCarb && !isFat && !isMacroGeneral && !isCylinder) {
    return null;
  }

  const pack = resolveGlobalStateObject(globalState);
  if (!pack) return null;

  if (isCardio) return answerCardio(pack);
  if (isPro) return answerMacros(pack, 'pro');
  if (isCarb) return answerMacros(pack, 'carb');
  if (isFat) return answerMacros(pack, 'fat');
  if (isKcal) return answerMacros(pack, 'kcal');
  if (isMacroGeneral) return answerMacros(pack, 'all');
  if (isCylinder) return answerCylinders(pack, query);

  return null;
}

/**
 * @param {string} userInput
 * @returns {boolean}
 */
export function isLocalReceptionistQuery(userInput) {
  const raw = asTrimmedString(userInput);
  if (!raw || looksLikeWriteAction(raw)) return false;
  const query = normalizeQuery(raw);
  return (
    CARDIO_QUERY_RE.test(query)
    || MACRO_PRO_RE.test(query)
    || MACRO_KCAL_RE.test(query)
    || MACRO_CARB_RE.test(query)
    || MACRO_FAT_RE.test(query)
    || MACRO_GENERAL_RE.test(query)
    || CYLINDER_QUERY_RE.test(query)
  );
}
