import { useCallback, useEffect, useRef, useState } from 'react';
import MicronutrientEnrichmentModal from '../../mealBuilder/components/MicronutrientEnrichmentModal.jsx';
import UniversalSearchModal from '../../mealBuilder/components/UniversalSearchModal.jsx';
import { collectMultiDbFoodCandidates } from '../conversation/multiDbFoodResolver.js';
import { estimateStandardMacrosPer100g } from '../../../utils/getFoodIcon.js';
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
  const source = String(result._source || result.source || result.legacySource || 'search').trim();
  return {
    fdcId,
    name,
    confidence: 'high',
    confidenceScore: 1,
    reason: 'Selezionato da ricerca manuale',
    source,
    row: {
      ...(row && typeof row === 'object' ? row : {}),
      desc: name,
      name,
      ...(fdcId ? { id: fdcId, foodDbKey: fdcId } : {}),
    },
  };
}

/**
 * Wrapper chat: ricerca multi-DB + azioni barcode/etichetta/crea al volo.
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
      return undefined;
    }

    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;
    const foodName = String(session.foodName || '').trim();
    const preloaded = Array.isArray(session.matches) ? session.matches.filter(Boolean) : null;

    void (async () => {
      setManualSearchOpen(false);
      if (preloaded && preloaded.length > 0) {
        if (controller.signal.aborted) return;
        setLocalSession({
          foodName,
          isLoading: false,
          matches: preloaded.slice(0, 4),
          error: '',
        });
        return;
      }

      setLocalSession({
        foodName,
        isLoading: true,
        matches: [],
        error: '',
      });

      try {
        const matches = await collectMultiDbFoodCandidates(foodName, {
          kentuItDb: session.kentuItDb,
          personalDb: session.personalDb,
          globalDb: session.globalDb,
          offDb: session.offDb,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setLocalSession({
          foodName,
          isLoading: false,
          matches: Array.isArray(matches) ? matches.slice(0, 4) : [],
          error: '',
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn('[ChatFoodEnrichmentModal] multi-DB search failed', error);
        setLocalSession({
          foodName,
          isLoading: false,
          matches: [],
          error: 'Ricerca multi-database non disponibile. Usa scanner, foto etichetta, ricerca o crea al volo.',
        });
      }
    })();

    return () => {
      controller.abort();
    };
  }, [
    session?.foodName,
    session?.kentuItDb,
    session?.personalDb,
    session?.globalDb,
    session?.offDb,
    session?.matches,
  ]);

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
        const per100 = {
          kcal: Math.round(Number(macros.kcal) || 0),
          prot: Number(macros.pro) || 0,
          carb: Number(macros.carbo) || 0,
          fat: Number(macros.fat) || 0,
        };
        onSelectMatch?.({
          fdcId: null,
          name: foodName,
          confidence: 'high',
          confidenceScore: 1,
          reason: 'Etichetta letta da foto',
          source: 'custom',
          isCustom: true,
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
        error: 'Errore lettura immagine. Riprova o continua senza profilo.',
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

  const handleCreateCustom = useCallback((customPayload) => {
    const foodName = String(
      customPayload?.name || session?.foodName || localSession?.foodName || 'Alimento',
    ).trim() || 'Alimento';
    const estimated = estimateStandardMacrosPer100g(foodName);
    const per100 = {
      kcal: Math.max(0, Math.round(Number(customPayload?.kcal ?? estimated.kcal) || 0)),
      prot: Math.max(0, Number(customPayload?.prot ?? estimated.prot) || 0),
      carb: Math.max(0, Number(customPayload?.carb ?? estimated.carb) || 0),
      fat: Math.max(0, Number(customPayload?.fat ?? estimated.fat) || 0),
    };
    onSelectMatch?.({
      fdcId: null,
      name: foodName,
      confidence: 'high',
      confidenceScore: 1,
      reason: 'Creato al volo',
      source: 'custom',
      isCustom: true,
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
  }, [onSelectMatch, session?.foodName, localSession?.foodName]);

  if (!session?.foodName) return null;

  const isMcdriveMode = session?.mode === 'mcdrive';
  const isDisambiguation = session?.variant === 'disambiguation' || isMcdriveMode;
  const foodName = String(localSession?.foodName || session?.foodName || '').trim();

  return (
    <>
      <MicronutrientEnrichmentModal
        isOpen
        variant={isDisambiguation ? 'disambiguation' : (isMcdriveMode ? 'mcdrive' : 'chat')}
        productName={foodName}
        isLoading={localSession?.isLoading}
        error={localSession?.error}
        matches={localSession?.matches || []}
        onSelectMatch={onSelectMatch}
        onCreateCustom={handleCreateCustom}
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
        initialQuery={foodName || ''}
        onClose={() => setManualSearchOpen(false)}
        personalDb={session?.personalDb || {}}
        kentuItDb={session?.kentuItDb || {}}
        globalDb={session?.globalDb || {}}
        offDb={session?.offDb || {}}
        draftFoods={[]}
        onSelectFood={handleManualSearchSelect}
      />
    </>
  );
}
