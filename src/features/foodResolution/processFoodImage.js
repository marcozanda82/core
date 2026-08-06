import { imageUriToBase64 } from '../../platform/imageUriToBase64.js';
import { extractMacrosFromImage } from '../../services/aiVisionService.js';

/**
 * Processa foto cibo: etichetta → Gemini Vision; barcode → form manuale (OCR barcode al prossimo giro).
 *
 * @param {string} imageUri
 * @param {'barcode' | 'label'} mode
 * @param {{
 *   onPhase?: (phase: 'processing' | 'done' | 'error') => void,
 *   grams?: number,
 *   signal?: AbortSignal,
 * }} [options]
 * @returns {Promise<{
 *   imageUri: string,
 *   mode: string,
 *   openManual: boolean,
 *   prefilledMacros: { kcal: number, pro: number, carbo: number, fat: number } | null,
 *   macrosBasis: 'per100' | 'portion' | null,
 *   errorToast: string | null,
 * }>}
 */
export async function processFoodImage(imageUri, mode, options = {}) {
  const uri = String(imageUri || '').trim();
  const safeMode = mode === 'barcode' ? 'barcode' : 'label';
  const onPhase = typeof options.onPhase === 'function' ? options.onPhase : null;
  const grams = Math.max(0, Math.round(Number(options.grams) || 0));

  onPhase?.('processing');

  if (!uri) {
    onPhase?.('error');
    return {
      imageUri: '',
      mode: safeMode,
      openManual: true,
      prefilledMacros: null,
      macrosBasis: null,
      errorToast: 'Lettura etichetta fallita, inserisci manualmente',
    };
  }

  // Barcode: vision OCR barcode non ancora collegato — apre form vuoto.
  if (safeMode === 'barcode') {
    onPhase?.('done');
    return {
      imageUri: uri,
      mode: safeMode,
      openManual: true,
      prefilledMacros: null,
      macrosBasis: null,
      errorToast: null,
    };
  }

  try {
    const { dataUrl, base64 } = await imageUriToBase64(uri);
    const per100 = await extractMacrosFromImage(dataUrl || base64, {
      signal: options.signal,
    });

    let prefilledMacros = per100;
    let macrosBasis = 'per100';

    // Form manuale lavora sulla porzione: scala /100g → grammi dichiarazione.
    if (grams > 0) {
      const factor = grams / 100;
      prefilledMacros = {
        kcal: Math.round(per100.kcal * factor),
        pro: Math.round(per100.pro * factor * 10) / 10,
        carbo: Math.round(per100.carbo * factor * 10) / 10,
        fat: Math.round(per100.fat * factor * 10) / 10,
      };
      macrosBasis = 'portion';
    }

    onPhase?.('done');
    return {
      imageUri: uri,
      mode: safeMode,
      openManual: true,
      prefilledMacros,
      macrosBasis,
      errorToast: null,
    };
  } catch (error) {
    console.warn('[processFoodImage] vision failed', error?.message || error);
    onPhase?.('error');
    return {
      imageUri: uri,
      mode: safeMode,
      openManual: true,
      prefilledMacros: null,
      macrosBasis: null,
      errorToast: 'Lettura etichetta fallita, inserisci manualmente',
    };
  }
}
