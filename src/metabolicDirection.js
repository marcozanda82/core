/**
 * Rosa fissa: 8 direzioni (gradi sul quadrante, 0° = Nord / alto, positivo = orario).
 * Mappa canonica per etichette e geometria del volto bussola.
 */
export const METABOLIC_COMPASS_DIRECTION_BY_ANGLE_DEG = new Map(
  Object.freeze([
    [0, Object.freeze({ angleDeg: 0, label: 'Ricomposizione' })],
    [45, Object.freeze({ angleDeg: 45, label: 'Massa Pulita' })],
    [90, Object.freeze({ angleDeg: 90, label: 'Accumulo Grasso' })],
    [135, Object.freeze({ angleDeg: 135, label: 'Surplus Disfunzionale' })],
    [180, Object.freeze({ angleDeg: 180, label: 'Catabolismo' })],
    [-135, Object.freeze({ angleDeg: -135, label: 'Perdita Grasso' })],
    [-90, Object.freeze({ angleDeg: -90, label: 'Digiuno / Autofagia' })],
    [-45, Object.freeze({ angleDeg: -45, label: 'Recupero Attivo' })],
  ])
);

/** Ordine fisso per disegnare la rosa (senso orario da Nord). */
export const METABOLIC_COMPASS_DIRECTIONS = Object.freeze(
  [0, 45, 90, 135, 180, -135, -90, -45].map((a) => METABOLIC_COMPASS_DIRECTION_BY_ANGLE_DEG.get(a))
);

/** Obiettivi con angolo “Nord” bussola (direzione target nel piano vettoriale). */
export const METABOLIC_GOAL = {
  RICOMPOSIZIONE: 'Ricomposizione',
  MASSA: 'Massa Pulita',
  PERDITA_GRASSO: 'Perdita Grasso',
};

/**
 * Angolo nel piano vettoriale (atan2) dell’obiettivo — usato per ago vs stato metabolico.
 */
export const METABOLIC_TARGET_ANGLE_DEG = {
  [METABOLIC_GOAL.RICOMPOSIZIONE]: 90,
  [METABOLIC_GOAL.MASSA]: 45,
  [METABOLIC_GOAL.PERDITA_GRASSO]: -135,
};

/**
 * Angolo sulla rosa (0° = Nord / alto, orario positivo) per ogni obiettivo.
 * Ruotando il volto di `-getGoalCompassAngleDeg(goal)`, l’obiettivo finisce in alto.
 */
export const METABOLIC_GOAL_COMPASS_ANGLE_DEG = {
  [METABOLIC_GOAL.RICOMPOSIZIONE]: 0,
  [METABOLIC_GOAL.MASSA]: 45,
  [METABOLIC_GOAL.PERDITA_GRASSO]: -135,
};

/**
 * @param {string} goal
 * @returns {number} gradi rosa per l’obiettivo selezionato
 */
export function getGoalCompassAngleDeg(goal) {
  const g = goal && METABOLIC_GOAL_COMPASS_ANGLE_DEG[goal] != null ? goal : METABOLIC_GOAL.RICOMPOSIZIONE;
  return METABOLIC_GOAL_COMPASS_ANGLE_DEG[g];
}

const FINAL_ANGLE_MIN = -135;
const FINAL_ANGLE_MAX = 135;

/**
 * Riferimento per mappare il bilancio kcal dello slider su x ∈ [-1, 1] (input tipico ±500).
 * @type {number}
 */
export const METABOLIC_KCAL_NORMALIZATION_REF = 500;

/**
 * Riferimento per mappare il carico allenamento su y ∈ [0, 1] (input tipico 0–100).
 * @type {number}
 */
export const METABOLIC_TRAINING_NORMALIZATION_REF = 100;

const RAD_TO_DEG = 180 / Math.PI;

/**
 * Modello vettoriale: x e y normalizzati, angolo = atan2(y, x), nessun clamp né branching.
 *
 * @param {number} kcalBalance
 * @param {number} trainingLoad
 * @returns {{ x: number, y: number, angleDeg: number, magnitude: number }}
 *   angleDeg in gradi; magnitude = hypot(x, y)
 */
export function computeMetabolicDirection(kcalBalance, trainingLoad) {
  const x = kcalBalance / METABOLIC_KCAL_NORMALIZATION_REF;
  const y = trainingLoad / METABOLIC_TRAINING_NORMALIZATION_REF;
  const angleDeg = Math.atan2(y, x) * RAD_TO_DEG;
  const magnitude = Math.hypot(x, y);

  return { x, y, angleDeg, magnitude };
}

/**
 * Solo angolo metabolico (gradi), stesso modello di {@link computeMetabolicDirection}.
 * @param {number} kcalBalance
 * @param {number} trainingLoad
 * @returns {number}
 */
export function computeMetabolicDirectionAngleDeg(kcalBalance, trainingLoad) {
  return computeMetabolicDirection(kcalBalance, trainingLoad).angleDeg;
}

/**
 * Angolo obiettivo in gradi per l’obiettivo selezionato (default: Ricomposizione).
 * @param {string} goal
 * @returns {number}
 */
export function getMetabolicTargetAngle(goal) {
  const g = goal && METABOLIC_TARGET_ANGLE_DEG[goal] != null ? goal : METABOLIC_GOAL.RICOMPOSIZIONE;
  return METABOLIC_TARGET_ANGLE_DEG[g];
}

/**
 * Direzione rispetto al Nord bussola: la direzione target coincide con 0° (alto).
 *
 * @param {number} kcalBalance
 * @param {number} trainingLoad
 * @param {string} goal una di METABOLIC_GOAL / chiavi di METABOLIC_TARGET_ANGLE_DEG
 * @returns {{ angle: number, magnitude: number, targetAngle: number, finalAngle: number, x: number, y: number }}
 */
export function computeMetabolicCompassOrientation(kcalBalance, trainingLoad, goal) {
  const { x, y, angleDeg, magnitude } = computeMetabolicDirection(kcalBalance, trainingLoad);
  const targetAngle = getMetabolicTargetAngle(goal);
  const finalAngle = clamp(angleDeg - targetAngle, FINAL_ANGLE_MIN, FINAL_ANGLE_MAX);

  return {
    x,
    y,
    angle: angleDeg,
    magnitude,
    targetAngle,
    finalAngle,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
