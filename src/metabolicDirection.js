/**
 * Bussola metabolica fissa: 8 direzioni semantiche.
 * Convenzione: 0° = Nord / alto, senso orario positivo.
 * Ordine = senso orario da Nord (struttura stabile per rosa e logica).
 *
 * @type {ReadonlyArray<Readonly<{ label: string, angle: number }>>}
 */
export const METABOLIC_COMPASS_DIRECTIONS = Object.freeze([
  Object.freeze({ label: 'Ricomposizione', angle: 0 }),
  Object.freeze({ label: 'Massa Pulita', angle: 45 }),
  Object.freeze({ label: 'Accumulo Grasso', angle: 90 }),
  Object.freeze({ label: 'Surplus Disfunzionale', angle: 135 }),
  Object.freeze({ label: 'Catabolismo', angle: 180 }),
  Object.freeze({ label: 'Perdita Grasso', angle: -135 }),
  Object.freeze({ label: 'Digiuno / Autofagia', angle: -90 }),
  Object.freeze({ label: 'Recupero Attivo', angle: -45 }),
]);

/** Lookup per angolo (gradi rosa) → voce di {@link METABOLIC_COMPASS_DIRECTIONS}. */
export const METABOLIC_COMPASS_DIRECTION_BY_ANGLE = new Map(
  METABOLIC_COMPASS_DIRECTIONS.map((d) => [d.angle, d])
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
 * Mappa l’obiettivo selezionato (label = voce in {@link METABOLIC_COMPASS_DIRECTIONS}) sull’angolo rosa.
 *
 * @param {string} goalLabel es. {@link METABOLIC_GOAL}
 * @returns {number} targetAngle in gradi (0° = Nord, orario +)
 */
export function getCompassTargetAngleForGoal(goalLabel) {
  const found = METABOLIC_COMPASS_DIRECTIONS.find((d) => d.label === goalLabel);
  return found ? found.angle : 0;
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
 * Da angolo atan2(y,x) (0° = asse +x, positivo = antiorario) a bearing sul volto bussola
 * (0° = Nord / alto, positivo = orario), coerente con tacche ed etichette.
 */
export function metabolicAngleDegToCompassBearingDeg(angleDeg) {
  return 90 - angleDeg;
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
