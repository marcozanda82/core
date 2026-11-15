/**
 * Shim per moduli browser/AI non usati dal MCP in sola lettura.
 */
const noop = () => null;

export default {};
export const getLogFromStoricoTree = noop;
export const getTodayString = noop;
export const TRACKER_STORICO_KEY = () => '';
export const decimalToTimeStr = noop;
export const toCanonicalMealType = noop;
export const callGeminiAPIWithRotation = noop;
export const auth = null;
export const db = null;
export const app = null;
export const firebaseConfig = {};
export const functions = null;
