/**
 * Provider finto per l'emulatore. Restituisce un JSON v5 costruito dal dossier,
 * senza chiamare Gemini. Con VITE_EMULATOR_REAL_AI=1 non si usa: callGemini
 * parla con l'emulatore delle Functions e la chiave resta in functions/.secret.local.
 */

import { isEmulatorRealAiEnabled, isFirebaseEmulatorMode } from '../../../config/emulatorUser.js';
import { composeFocusV5Report } from './composeFocusV5Report.js';

export function emulatorFocusAskAi(userText) {
  const match = String(userText || '').match(/\[FOCUS_INPUT_DATA\]([\s\S]*?)\[\/FOCUS_INPUT_DATA\]/);
  let brief = {};
  if (match) {
    try {
      const parsed = JSON.parse(match[1].trim());
      brief = parsed?.periodBrief && typeof parsed.periodBrief === 'object'
        ? parsed.periodBrief
        : parsed;
    } catch {
      brief = {};
    }
  }
  return JSON.stringify(composeFocusV5Report(brief || {}));
}

/** L'harness vince. Altrimenti, sull'emulatore, il mock è il default. */
export function resolveEmulatorFocusAskAi(harnessFn) {
  if (typeof harnessFn === 'function') return harnessFn;
  if (isFirebaseEmulatorMode() && !isEmulatorRealAiEnabled()) return emulatorFocusAskAi;
  return undefined;
}
