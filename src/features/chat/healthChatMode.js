/**
 * Modalità chat salute/diabete vs flusso Kentu standard (macro).
 *
 * Attivazione Firebase RTDB:
 *   users/{uid}/profile_targets/profile/appMode = "diabete" | "standard" | …
 *
 * Il profilo principale (senza appMode o con "kentu"/"nutrition"/"standard")
 * continua sul motore macronutrienti senza interferenze.
 */

/** Valori canonici del selettore Impostazioni Universali. */
export const APP_MODE_STANDARD = 'standard';
export const APP_MODE_DIABETE = 'diabete';

/** Opzioni UI (Select / Radio). */
export const APP_MODE_OPTIONS = Object.freeze([
  {
    value: APP_MODE_STANDARD,
    label: 'Standard — Nutrizione & Ipertrofia',
    hint: 'Chat pasti, macro, report nutrizionale (comportamento classico Kentu).',
  },
  {
    value: APP_MODE_DIABETE,
    label: 'Diabete — Salute & Glicemia',
    hint: 'Chat glicemie/farmaci, report medico e condivisione WhatsApp.',
  },
]);

/** Valori che attivano processHealthChatMessage. */
const HEALTH_DIABETES_APP_MODES = new Set([
  APP_MODE_DIABETE,
  'diabetes',
  'salute',
  'health',
  'health_diabetes',
  'diario_salute',
]);

/** Valori espliciti per il flusso Kentu standard. */
const STANDARD_APP_MODES = new Set([
  APP_MODE_STANDARD,
  'kentu',
  'nutrition',
  'nutrizione',
  'macro',
  'main',
  'primary',
]);

/**
 * Normalizza appMode da profilo Firebase.
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeAppMode(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

/**
 * Valore del selettore UI a partire dal profilo (sempre standard | diabete).
 * @param {object | null | undefined} userProfile
 * @returns {'standard' | 'diabete'}
 */
export function resolveSelectableAppMode(userProfile) {
  return isHealthDiabetesChatMode(userProfile) ? APP_MODE_DIABETE : APP_MODE_STANDARD;
}

/**
 * True se il profilo loggato è in modalità salute/diabete.
 * @param {object | null | undefined} userProfile
 * @param {string | null | undefined} [_uid] — riservato (es. allowlist futura)
 * @returns {boolean}
 */
export function isHealthDiabetesChatMode(userProfile, _uid = null) {
  const mode = normalizeAppMode(
    userProfile?.appMode
    ?? userProfile?.chatMode
    ?? userProfile?.mode,
  );
  if (!mode) return false;
  if (STANDARD_APP_MODES.has(mode)) return false;
  return HEALTH_DIABETES_APP_MODES.has(mode);
}
