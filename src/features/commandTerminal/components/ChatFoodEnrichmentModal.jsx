import React, { useCallback, useEffect, useRef, useState } from 'react';
import MicronutrientEnrichmentModal from '../../mealBuilder/components/MicronutrientEnrichmentModal.jsx';
import { findSemanticKentuMatches } from '../../mealBuilder/utils/SemanticMatchmaker.js';
import { requestCameraPermissionsAsync, launchCameraAsync } from '../../../platform/expoNativeCamera.js';
import { processFoodImage } from '../../foodResolution/processFoodImage.js';

/**
 * Wrapper chat: match Kentu DB (CREA + IT) + azioni barcode/etichetta per alimenti non trovati.
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
        const matches = await findSemanticKentuMatches(session.foodName, {
          kentuItDb: session.kentuItDb,
          personalDb: session.personalDb,
        }, {
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
        console.warn('[ChatFoodEnrichmentModal] Kentu DB search failed', error);
        setLocalSession({
          foodName: session.foodName,
          isLoading: false,
          matches: [],
          error: 'Match Kentu DB non disponibile. Usa scanner o foto etichetta per registrare l\'alimento.',
        });
      }
    })();

    return () => {
      controller.abort();
    };
  }, [session?.foodName, session?.kentuItDb, session?.personalDb]);

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
      const hasMacros = macros && Number(macros.kcal) > 0;

      if (hasMacros && mode === 'label') {
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
          fdcId: null,
          name: foodName,
          confidence: 'high',
          reason: 'Etichetta letta da foto',
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

      setLocalSession((prev) => ({
        ...(prev || { foodName, matches: [], isLoading: false }),
        error: 'Non ho estratto macro utili dalla foto. Prova lo scanner barcode o continua senza profilo.',
      }));
    } catch (error) {
      console.warn('[ChatFoodEnrichmentModal] camera resolve failed', error);
      setLocalSession((prev) => ({
        ...(prev || { foodName: session?.foodName, matches: [], isLoading: false }),
        error: 'Errore lettura immagine. Riprova o continua senza profilo Kentu.',
      }));
    } finally {
      setCameraBusy(false);
    }
  }, [session?.foodName, localSession?.foodName, cameraBusy, onSelectMatch]);

  if (!session?.foodName && !localSession?.foodName) return null;

  return (
    <MicronutrientEnrichmentModal
      isOpen
      variant="chat"
      productName={localSession?.foodName || session?.foodName}
      isLoading={localSession?.isLoading}
      error={localSession?.error}
      matches={localSession?.matches || []}
      onSelectMatch={onSelectMatch}
      onSkip={onSkip}
      onScanBarcode={() => handleCameraResolve('barcode')}
      onUseLabelPhoto={() => handleCameraResolve('label')}
      cameraBusy={cameraBusy}
    />
  );
}
