import { useCallback, useEffect, useRef, useState } from 'react';
import MicronutrientEnrichmentModal from '../../mealBuilder/components/MicronutrientEnrichmentModal.jsx';
import UniversalSearchModal from '../../mealBuilder/components/UniversalSearchModal.jsx';
import {
  collectLevel1LocalCandidates,
  collectLevel2ExternalCandidates,
  filterAcceptableDisambiguationCandidates,
} from '../conversation/multiDbFoodResolver.js';
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

const INITIAL_LOCAL = {
  foodName: '',
  isLoading: false,
  matches: [],
  error: '',
  loadingMessage: '',
  searchPhase: null,
  canInterrupt: false,
};

/**
 * Wrapper chat / McDrive: ricerca a livelli + azioni barcode/etichetta/crea al volo.
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

  const interruptSearch = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setLocalSession((prev) => ({
      ...(prev || INITIAL_LOCAL),
      isLoading: false,
      loadingMessage: '',
      searchPhase: null,
      canInterrupt: false,
      matches: filterAcceptableDisambiguationCandidates(
        prev?.foodName || session?.foodName || '',
        prev?.matches || [],
      ),
      error: '',
    }));
    setManualSearchOpen(true);
  }, [session?.foodName]);

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
    const preloadedRaw = Array.isArray(session.matches) ? session.matches.filter(Boolean) : null;
    const preloaded = preloadedRaw
      ? filterAcceptableDisambiguationCandidates(foodName, preloadedRaw)
      : null;
    const forceExternal = session.needsExternalSearch === true;

    const dbCtx = {
      kentuItDb: session.kentuItDb,
      personalDb: session.personalDb,
      globalDb: session.globalDb,
      offDb: session.offDb,
      signal: controller.signal,
      onProgress: (info) => {
        if (controller.signal.aborted) return;
        setLocalSession((prev) => ({
          ...(prev || { foodName, matches: [], error: '' }),
          foodName,
          isLoading: true,
          loadingMessage: String(info?.message || '').trim(),
          searchPhase: info?.phase || null,
          canInterrupt: info?.level === 2,
          error: '',
        }));
      },
    };

    void (async () => {
      setManualSearchOpen(false);

      // Match L1 già pronti dal controller → mostra subito, niente L2.
      if (preloaded && preloaded.length > 0 && !forceExternal) {
        if (controller.signal.aborted) return;
        setLocalSession({
          foodName,
          isLoading: false,
          matches: preloaded,
          error: '',
          loadingMessage: '',
          searchPhase: null,
          canInterrupt: false,
        });
        return;
      }

      try {
        let matches = [];

        if (!forceExternal) {
          setLocalSession({
            foodName,
            isLoading: true,
            matches: [],
            error: '',
            loadingMessage: 'Cerco nel Database Personale e Kentu ITA…',
            searchPhase: 'local',
            canInterrupt: false,
          });
          matches = await collectLevel1LocalCandidates(foodName, dbCtx);
          if (controller.signal.aborted) return;

          if (matches.length > 0) {
            setLocalSession({
              foodName,
              isLoading: false,
              matches,
              error: '',
              loadingMessage: '',
              searchPhase: null,
              canInterrupt: false,
            });
            return;
          }
        }

        setLocalSession({
          foodName,
          isLoading: true,
          matches: [],
          error: '',
          loadingMessage: 'Non trovato nei tuoi archivi. Interrogazione Open Food Facts e USDA in corso…',
          searchPhase: 'external',
          canInterrupt: true,
        });
        matches = await collectLevel2ExternalCandidates(foodName, dbCtx);
        if (controller.signal.aborted) return;

        setLocalSession({
          foodName,
          isLoading: false,
          matches: filterAcceptableDisambiguationCandidates(foodName, matches),
          error: '',
          loadingMessage: '',
          searchPhase: null,
          canInterrupt: false,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn('[ChatFoodEnrichmentModal] tiered search failed', error);
        setLocalSession({
          foodName,
          isLoading: false,
          matches: [],
          error: 'Ricerca non disponibile. Usa scanner, foto etichetta, ricerca manuale o crea al volo.',
          loadingMessage: '',
          searchPhase: null,
          canInterrupt: false,
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
    session?.needsExternalSearch,
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
  const isLoading = Boolean(localSession?.isLoading);

  return (
    <>
      <MicronutrientEnrichmentModal
        isOpen
        variant={isDisambiguation ? 'disambiguation' : (isMcdriveMode ? 'mcdrive' : 'chat')}
        productName={foodName}
        isLoading={isLoading}
        loadingMessage={localSession?.loadingMessage || ''}
        searchPhase={localSession?.searchPhase || null}
        canInterruptSearch={Boolean(localSession?.canInterrupt && isLoading)}
        onInterruptSearch={interruptSearch}
        error={localSession?.error}
        matches={localSession?.matches || []}
        onSelectMatch={onSelectMatch}
        onCreateCustom={handleCreateCustom}
        onSkip={() => {
          if (manualSearchOpen) {
            setManualSearchOpen(false);
            return;
          }
          if (isLoading && abortRef.current) {
            abortRef.current.abort();
          }
          onSkip?.();
        }}
        onScanBarcode={() => {
          if (isLoading && abortRef.current) abortRef.current.abort();
          handleCameraResolve('barcode');
        }}
        onUseLabelPhoto={() => {
          if (isLoading && abortRef.current) abortRef.current.abort();
          handleCameraResolve('label');
        }}
        onManualSearch={() => {
          if (isLoading) interruptSearch();
          else setManualSearchOpen(true);
        }}
        cameraBusy={cameraBusy}
        allowActionsWhileLoading
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
