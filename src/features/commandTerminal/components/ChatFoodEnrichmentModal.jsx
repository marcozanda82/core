import React, { useCallback, useEffect, useRef, useState } from 'react';
import MicronutrientEnrichmentModal from '../../mealBuilder/components/MicronutrientEnrichmentModal.jsx';
import { findSemanticUsdaMatches } from '../../mealBuilder/utils/SemanticMatchmaker.js';
import { requestCameraPermissionsAsync, launchCameraAsync } from '../../../platform/expoNativeCamera.js';
import { processFoodImage } from '../../foodResolution/processFoodImage.js';

/**
 * Wrapper chat: match USDA + azioni native barcode/etichetta per alimenti non trovati.
 *
 * @param {{
 *   session: {
 *     foodName: string,
 *     masterDb?: object|null,
 *     isLoading?: boolean,
 *     matches?: object[],
 *     error?: string,
 *   } | null,
 *   onSelectMatch: (match: object) => void,
 *   onSkip: () => void,
 * }} props
 */
export default function ChatFoodEnrichmentModal({
  session = null,
  onSelectMatch,
  onSkip,
}) {
  const abortRef = useRef(null);
  const [localSession, setLocalSession] = useState(null);
  const [cameraBusy, setCameraBusy] = useState(false);

  useEffect(() => {
    if (!session?.foodName) {
      setLocalSession(null);
      return undefined;
    }

    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setLocalSession({
      foodName: session.foodName,
      isLoading: true,
      matches: [],
      error: '',
    });

    void (async () => {
      try {
        const matches = await findSemanticUsdaMatches(session.foodName, session.masterDb, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setLocalSession({
          foodName: session.foodName,
          isLoading: false,
          matches: Array.isArray(matches) ? matches : [],
          error: '',
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn('[ChatFoodEnrichmentModal] USDA search failed', error);
        setLocalSession({
          foodName: session.foodName,
          isLoading: false,
          matches: [],
          error: 'Match AI non disponibile. Usa scanner o foto etichetta per registrare l\'alimento.',
        });
      }
    })();

    return () => {
      controller.abort();
    };
  }, [session?.foodName, session?.masterDb]);

  const handleCameraResolve = useCallback(async (mode) => {
    const foodName = String(session?.foodName || localSession?.foodName || '').trim();
    if (!foodName || cameraBusy) return;
    setCameraBusy(true);
    try {
      const perm = await requestCameraPermissionsAsync();
      if (!perm?.granted) {
        setLocalSession((prev) => ({
          ...(prev || { foodName, matches: [], isLoading: false }),
          error: 'Permesso fotocamera negato. Puoi continuare e usare le azioni sulla card.',
        }));
        return;
      }
      const shot = await launchCameraAsync({ quality: 0.85 });
      if (shot?.canceled || !shot?.uri) {
        if (shot?.reason === 'native_camera_unavailable') {
          setLocalSession((prev) => ({
            ...(prev || { foodName, matches: [], isLoading: false }),
            error: 'Fotocamera nativa non disponibile. Continua e usa le azioni sulla card.',
          }));
        }
        return;
      }

      const result = await processFoodImage(shot.uri, mode, { grams: 100 });
      const macros = result?.prefilledMacros;
      const hasMacros = macros
        && Number(macros.kcal) > 0;

      if (hasMacros && mode === 'label') {
        // Scala a /100g se processFoodImage ha restituito porzione.
        const per100 = result?.macrosBasis === 'portion'
          ? {
            kcal: Math.round(Number(macros.kcal) || 0),
            prot: Number(macros.pro) || 0,
            carb: Number(macros.carbo) || 0,
            fat: Number(macros.fat) || 0,
          }
          : {
            kcal: Math.round(Number(macros.kcal) || 0),
            prot: Number(macros.pro) || 0,
            carb: Number(macros.carbo) || 0,
            fat: Number(macros.fat) || 0,
          };
        onSelectMatch?.({
          fdcId: `camera_label_${Date.now()}`,
          name: foodName,
          confidence: 'high',
          reason: 'Foto etichetta',
          row: {
            desc: foodName,
            name: foodName,
            kcal: per100.kcal,
            prot: per100.prot,
            carb: per100.carb,
            fat: per100.fat,
            fatTotal: per100.fat,
          },
        });
        return;
      }

      // Barcode / etichetta senza macro: chiudi USDA e lascia NEEDS_RESOLUTION + azioni card.
      onSkip?.();
    } catch (error) {
      console.warn('[ChatFoodEnrichmentModal] camera resolve failed', error);
      setLocalSession((prev) => ({
        ...(prev || { foodName, matches: [], isLoading: false }),
        error: error?.message || 'Errore fotocamera. Puoi continuare sulla card pasto.',
      }));
    } finally {
      setCameraBusy(false);
    }
  }, [cameraBusy, localSession?.foodName, onSelectMatch, onSkip, session?.foodName]);

  const isOpen = Boolean(session?.foodName);
  const view = localSession || {
    foodName: session?.foodName || '',
    isLoading: true,
    matches: [],
    error: '',
  };

  return (
    <MicronutrientEnrichmentModal
      isOpen={isOpen}
      variant="chat"
      productName={view.foodName}
      isLoading={view.isLoading}
      error={view.error}
      matches={view.matches}
      onSelectMatch={onSelectMatch}
      onSkip={onSkip}
      cameraBusy={cameraBusy}
      onScanBarcode={() => {
        void handleCameraResolve('barcode');
      }}
      onUseLabelPhoto={() => {
        void handleCameraResolve('label');
      }}
    />
  );
}
