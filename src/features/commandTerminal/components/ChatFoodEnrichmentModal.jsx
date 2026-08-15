import React, { useCallback, useEffect, useRef, useState } from 'react';
import MicronutrientEnrichmentModal from '../../mealBuilder/components/MicronutrientEnrichmentModal.jsx';
import UniversalSearchModal from '../../mealBuilder/components/UniversalSearchModal.jsx';
import { findSemanticKentuMatches } from '../../mealBuilder/utils/SemanticMatchmaker.js';
import { requestCameraPermissionsAsync, launchCameraAsync } from '../../../platform/expoNativeCamera.js';
import { processFoodImage } from '../../foodResolution/processFoodImage.js';

/**
 * Converte un risultato UniversalSearch nel formato match atteso da resume / onSelectMatch.
 * @param {object} result
 */
function searchResultToEnrichmentMatch(result) {
  if (!result || typeof result !== 'object') return null;
  const row = result.row && typeof result.row === 'object'
    ? result.row
    : result;
  const name = String(
    result.desc || result.name || row.desc || row.name || '',
  ).trim();
  if (!name) return null;
  const fdcId = String(
    result.key || result.id || result.fdcId || row.id || row.foodDbKey || '',
  ).trim() || null;
  return {
    fdcId,
    name,
    confidence: 'high',
    reason: 'Selezionato da ricerca manuale',
    row: {
      ...(row && typeof row === 'object' ? row : {}),
      desc: name,
      name,
      ...(fdcId ? { id: fdcId, foodDbKey: fdcId } : {}),
    },
  };
}

/**
 * Wrapper chat: match Kentu DB (CREA + IT) + azioni barcode/etichetta/ricerca per alimenti non trovati.
 */
export default function ChatFoodEnrichmentModal({
  session = null,
  onSelectMatch,
  onSkip,
}) {
  const abortRef = useRef(null);
  const [localSession, setLocalSession] = useState(null);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [manualSearchOpen, setManualSearchOpen] = useState(false);

  useEffect(() => {
    if (!session?.foodName) {
      setLocalSession(null);
      setManualSearchOpen(false);
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
    setManualSearchOpen(false);

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
          error: 'Match Kentu DB non disponibile. Usa scanner, foto etichetta o ricerca manuale.',
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
        error: 'Non ho estratto macro utili dalla foto. Prova lo scanner barcode o la ricerca manuale.',
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

  const handleManualSearchSelect = useCallback((result) => {
    const match = searchResultToEnrichmentMatch(result);
    setManualSearchOpen(false);
    if (!match) {
      setLocalSession((prev) => ({
        ...(prev || { foodName: session?.foodName, matches: [], isLoading: false }),
        error: 'Selezione non valida. Riprova dalla ricerca manuale.',
      }));
      return;
    }
    onSelectMatch?.(match);
  }, [onSelectMatch, session?.foodName]);

  if (!session?.foodName && !localSession?.foodName) return null;

  const isMcdriveMode = session?.mode === 'mcdrive';
  const foodName = String(localSession?.foodName || session?.foodName || '').trim();

  return (
    <>
      <MicronutrientEnrichmentModal
        isOpen
        variant={isMcdriveMode ? 'mcdrive' : 'chat'}
        productName={foodName}
        isLoading={localSession?.isLoading}
        error={localSession?.error}
        matches={localSession?.matches || []}
        onSelectMatch={onSelectMatch}
        onSkip={() => {
          if (manualSearchOpen) {
            setManualSearchOpen(false);
            return;
          }
          onSkip?.();
        }}
        onScanBarcode={() => handleCameraResolve('barcode')}
        onUseLabelPhoto={() => handleCameraResolve('label')}
        onManualSearch={() => setManualSearchOpen(true)}
        cameraBusy={cameraBusy}
      />
      <UniversalSearchModal
        isOpen={manualSearchOpen}
        initialQuery={foodName}
        onClose={() => setManualSearchOpen(false)}
        personalDb={session?.personalDb || null}
        kentuItDb={session?.kentuItDb || null}
        globalDb={session?.globalDb || null}
        onSelectFood={handleManualSearchSelect}
      />
    </>
  );
}
