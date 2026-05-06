import { useCallback, useEffect, useRef, useState } from 'react';
import { ref, set } from 'firebase/database';
import { searchFoodsDetailed } from '../../../foodSearch';
import { getCreaFusionPayload, fuseUsdaIntoCrea } from '../../../foodSourceFusion';
import { TARGETS, getDefaultNutrientValue } from '../../../useBiochimico';
import { getBarcodeNutritionOverride } from '../../../barcodeFoodOverrides';
import { enrichDbRowWithFoodUnits } from '../../../foodUnits';
import { estraiDatiFoodDb, getAverageEstimate } from '../engines/foodDataEngine';
import { orchestrateFoodInput } from '../engines/foodInputOrchestrator.js';
import { parseFoodCommandIntent } from '../engines/foodCommandEngine.js';

export default function useFoodInputEngine({
  foodDb,
  mealType,
  addedFoods,
  userUid,
  fullHistoryRef,
  db,
  csvFoodDb,
  csvFoodDbLoading,
  setFoodDb,
  setAddedFoods,
  setShowFoodDropdown,
  setMealBuilderBarcodeBootstrap,
  getLastQuantityForFoodRef,
  callGeminiAPIWithRotationRef,
  flatLog,
}) {
  const [foodNameInput, setFoodNameInput] = useState('');
  const [foodWeightInput, setFoodWeightInput] = useState('');
  const [foodDropdownSuggestions, setFoodDropdownSuggestions] = useState([]);
  const [foodInputOrchestration, setFoodInputOrchestration] = useState(null);
  const [creaResults, setCreaResults] = useState([]);
  const [isCreaLoading, setIsCreaLoading] = useState(false);
  const [isBarcodeScannerOpen, setIsBarcodeScannerOpen] = useState(false);
  const [isGeneratingFood, setIsGeneratingFood] = useState(false);

  const creaUsdaAbortRef = useRef(null);
  const lastCreaNormalizedRef = useRef(null);
  const lastCreaQueryRef = useRef('');
  const usdaFusionDoneForQueryRef = useRef('');
  const barcodeVideoRef = useRef(null);
  const barcodeStreamRef = useRef(null);
  const barcodeScanIntervalRef = useRef(null);

  useEffect(() => {
    const q = (foodNameInput || '').trim();
    if (!q) {
      setFoodDropdownSuggestions([]);
      setFoodInputOrchestration(null);
      return;
    }

    const detailedCandidates = searchFoodsDetailed(foodDb, q, {
      mode: 'autocomplete',
      limit: 8,
      includeUserHistory: true,
    });

    const matches = detailedCandidates.slice(0, 5).map((item) => ({
      key: item.id,
      desc: item.name || item.id,
    }));

    setFoodDropdownSuggestions(matches);

    const safeFlatLog = Array.isArray(flatLog) ? flatLog : [];
    const safeFoodDb =
      foodDb != null && typeof foodDb === 'object' && !Array.isArray(foodDb) ? foodDb : {};
    const orchestration = orchestrateFoodInput({
      query: q,
      foodDb: safeFoodDb,
      flatLog: safeFlatLog,
      maxClassicResults: 8,
      classicSearchFn: () => detailedCandidates,
      smartParseFn: ({ text, foodDb: fd, flatLog: fl }) =>
        parseFoodCommandIntent({
          text,
          foodDb: fd && typeof fd === 'object' && !Array.isArray(fd) ? fd : {},
          flatLog: Array.isArray(fl) ? fl : [],
          mealContext: null,
        }),
    });
    setFoodInputOrchestration(orchestration);

    if (import.meta.env?.DEV) {
      // eslint-disable-next-line no-console
      console.log('[foodInputOrchestration:DEV]', {
        query: orchestration.query,
        mode: orchestration.mode,
        shouldShowSmartSuggestion: orchestration.shouldShowSmartSuggestion,
        classicCount: orchestration.classicCandidates?.length ?? 0,
        smartStatus: orchestration.smartSuggestion?.status ?? null,
      });
    }
  }, [foodNameInput, foodDb, flatLog]);

  const fetchOpenFoodFactsProduct = useCallback(async (barcode) => {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,ingredients_text_it,ingredients_text,nutriments`);
    const data = await res.json();
    if (data?.status === 0 || !data?.product) return null;
    const p = data?.product;
    const nut = p?.nutriments || {};
    const toNum = (v) => (v != null && v !== '' ? parseFloat(v) : undefined);
    const kcalFromKj = (kj) => (kj != null && Number.isFinite(kj) ? kj / 4.184 : undefined);
    const energyKcal = toNum(nut['energy-kcal_100g']);
    const energyKj = toNum(nut.energy_100g);
    const entryPer100 = {
      desc: p?.product_name || `Barcode ${barcode}`,
      kcal: energyKcal ?? kcalFromKj(energyKj),
      prot: toNum(nut.proteins_100g),
      carb: toNum(nut.carbohydrates_100g),
      fatTotal: toNum(nut.fat_100g),
      fibre: toNum(nut.fiber_100g),
    };
    ['sugars_100g', 'saturated-fat_100g', 'salt_100g', 'sodium_100g', 'calcium_100g', 'iron_100g', 'potassium_100g', 'vitamin-c_100g', 'vitamin-d_100g'].forEach((key, i) => {
      const our = ['zuccheri', 'fatSat', 'sale', 'na', 'ca', 'fe', 'k', 'vitc', 'vitD'][i];
      if (our && nut[key] != null) entryPer100[our] = parseFloat(nut[key]);
    });
    return entryPer100;
  }, []);

  const handleBarcodeDetected = useCallback(async (barcode) => {
    setIsBarcodeScannerOpen(false);
    if (barcodeStreamRef.current) {
      barcodeStreamRef.current.getTracks().forEach((t) => t.stop());
      barcodeStreamRef.current = null;
    }
    if (barcodeScanIntervalRef.current) clearInterval(barcodeScanIntervalRef.current);
    const code = String(barcode ?? '').trim();
    const slugName = (name) => String(name).replace(/[.$#[\]/\\\s]/g, '_').replace(/[^\w\-]/g, '_').slice(0, 30);

    const applyLocalOverride = (base) => {
      const ov = getBarcodeNutritionOverride(code);
      if (!ov) return base;
      const next = { ...base };
      if (ov.desc) next.desc = ov.desc;
      if (ov.kcal != null) next.kcal = ov.kcal;
      if (ov.prot != null) next.prot = ov.prot;
      if (ov.carb != null) next.carb = ov.carb;
      if (ov.fat != null) next.fatTotal = ov.fat;
      return next;
    };

    const fillPer100Defaults = (row) => {
      const r = { ...row };
      Object.keys(TARGETS).forEach((g) =>
        Object.keys(TARGETS[g] || {}).forEach((k) => {
          if (r[k] == null) r[k] = getDefaultNutrientValue(k, fullHistoryRef.current);
        })
      );
      if (r.kcal == null) r.kcal = getDefaultNutrientValue('kcal', fullHistoryRef.current);
      return r;
    };

    try {
      let entryPer100 = await fetchOpenFoodFactsProduct(code);
      const localOv = getBarcodeNutritionOverride(code);

      if (!entryPer100) {
        if (localOv && (localOv.desc || localOv.kcal != null)) {
          entryPer100 = {
            desc: localOv.desc || `Barcode ${code}`,
            kcal: localOv.kcal,
            prot: localOv.prot,
            carb: localOv.carb,
            fatTotal: localOv.fat,
            barcode: code,
          };
        } else {
          entryPer100 = { desc: `Barcode ${code}`, barcode: code };
        }
      } else {
        entryPer100 = { ...entryPer100, barcode: code };
        entryPer100 = applyLocalOverride(entryPer100);
      }

      entryPer100 = fillPer100Defaults(entryPer100);
      const name = String(entryPer100.desc || '').trim() || `Barcode ${code}`;

      let savedRow = { ...entryPer100, desc: name };
      let dbKey = `local_${Date.now()}_${code}`;

      if (userUid && db) {
        const basePath = `users/${userUid}/tracker_data`;
        const existingKey = Object.keys(foodDb || {}).find(
          (k) => foodDb[k] && String(foodDb[k].barcode ?? '') === code
        );
        dbKey = existingKey || `food_${Date.now()}_${slugName(name)}`;
        const entrySaved = enrichDbRowWithFoodUnits(savedRow, dbKey);
        await set(ref(db, `${basePath}/trackerFoodDatabase/${dbKey}`), entrySaved);
        setFoodDb((prev) => ({ ...(prev || {}), [dbKey]: entrySaved }));
        savedRow = entrySaved;
      }

      setFoodNameInput(savedRow.desc || name);
      setFoodWeightInput(getLastQuantityForFoodRef.current?.(savedRow.desc || name) || '100');
      setMealBuilderBarcodeBootstrap({
        nonce: Date.now(),
        match: {
          id: dbKey,
          desc: savedRow.desc || name,
          row: savedRow,
          barcode: code,
        },
      });
      setTimeout(() => document.getElementById('weight-input')?.focus(), 100);
    } catch {
      setFoodNameInput(`Barcode ${code}`);
      setFoodWeightInput('100');
      setMealBuilderBarcodeBootstrap({
        nonce: Date.now(),
        match: {
          id: `err_${Date.now()}`,
          desc: `Barcode ${code}`,
          row: { desc: `Barcode ${code}`, barcode: code },
          barcode: code,
        },
      });
      setTimeout(() => document.getElementById('weight-input')?.focus(), 100);
    }
  }, [foodDb, userUid, fullHistoryRef, db, fetchOpenFoodFactsProduct, setFoodDb, getLastQuantityForFoodRef, setMealBuilderBarcodeBootstrap]);

  useEffect(() => {
    if (!isBarcodeScannerOpen || !barcodeVideoRef.current) return;
    if (!('BarcodeDetector' in window)) {
      alert('Il browser non supporta la scansione barcode. Prova Chrome su Android.');
      setIsBarcodeScannerOpen(false);
      return;
    }
    let stream = null;
    const barcodeDetector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        stream = s;
        barcodeStreamRef.current = s;
        if (barcodeVideoRef.current) {
          barcodeVideoRef.current.srcObject = s;
          barcodeVideoRef.current.play();
        }
        barcodeScanIntervalRef.current = setInterval(async () => {
          if (!barcodeVideoRef.current || !stream) return;
          try {
            const barcodes = await barcodeDetector.detect(barcodeVideoRef.current);
            if (barcodes.length > 0) {
              const code = barcodes[0].rawValue;
              handleBarcodeDetected(code);
            }
          } catch {
            /* ignore detect errors */
          }
        }, 200);
      })
      .catch(() => {
        alert('Impossibile accedere alla fotocamera.');
        setIsBarcodeScannerOpen(false);
      });
    return () => {
      if (barcodeScanIntervalRef.current) clearInterval(barcodeScanIntervalRef.current);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      barcodeStreamRef.current = null;
    };
  }, [isBarcodeScannerOpen, handleBarcodeDetected]);

  const closeBarcodeScanner = useCallback(() => {
    setIsBarcodeScannerOpen(false);
    if (barcodeStreamRef.current) {
      barcodeStreamRef.current.getTracks().forEach((t) => t.stop());
      barcodeStreamRef.current = null;
    }
    if (barcodeScanIntervalRef.current) clearInterval(barcodeScanIntervalRef.current);
  }, []);

  const generateFoodWithAI = useCallback(async (foodName) => {
    const name = (foodName || foodNameInput || '').trim();
    if (!name) return;
    if (!userUid) {
      alert('Effettua il login per salvare nuovi alimenti.');
      return;
    }
    setIsGeneratingFood(true);
    try {
      const prompt = `Restituisci SOLO un JSON valido, senza altro testo, con i valori nutrizionali per 100g dell'alimento "${name}".
Chiavi obbligatorie (numeri): desc (stringa con il nome), kcal, prot, carb, fatTotal, fibre.
Aggiungi se possibile: leu, iso, val, lys, vitA, vitc, vitD, ca, fe, mg, zn, omega3 (tutti in mg o µg come standard RDA).
Esempio: {"desc":"${name}","kcal":120,"prot":25,"carb":0,"fatTotal":2,"fibre":0}`;
      const raw = await callGeminiAPIWithRotationRef.current?.(prompt);
      if (raw == null) throw new Error('Risposta AI non disponibile');
      let jsonStr = raw.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1].trim();
      const data = JSON.parse(jsonStr);
      const desc = data.desc || name;
      const entryPer100 = { desc };
      ['kcal', 'cal', 'prot', 'carb', 'fatTotal', 'fibre', 'leu', 'iso', 'val', 'lys', 'vitA', 'vitc', 'vitD', 'ca', 'fe', 'mg', 'zn', 'omega3'].forEach((k) => {
        if (typeof data[k] === 'number' && data[k] > 0) entryPer100[k] = data[k];
      });
      Object.keys(TARGETS).forEach((g) => Object.keys(TARGETS[g]).forEach((k) => {
        if (entryPer100[k] == null || entryPer100[k] === 0) {
          entryPer100[k] = getAverageEstimate({ nutrientKey: k, foodDesc: desc, fullHistory: fullHistoryRef.current });
        }
      }));
      if (entryPer100.kcal == null || entryPer100.kcal === 0) {
        entryPer100.kcal = entryPer100.cal ?? getAverageEstimate({ nutrientKey: 'kcal', foodDesc: desc, fullHistory: fullHistoryRef.current });
      }
      entryPer100.cal = entryPer100.cal ?? entryPer100.kcal;
      const newKey = `food_${Date.now()}_${String(desc).replace(/[.$#[\]/\\\s]/g, '_').replace(/[^\w\-]/g, '_').slice(0, 30)}`;
      const basePath = `users/${userUid}/tracker_data`;
      const entrySaved = enrichDbRowWithFoodUnits(entryPer100, newKey);
      await set(ref(db, `${basePath}/trackerFoodDatabase/${newKey}`), entrySaved);
      setFoodDb((prev) => ({ ...prev, [newKey]: entrySaved }));
      const weight = parseFloat(foodWeightInput) || 100;
      const ratio = weight / 100;
      const newItem = {
        id: Date.now() + Math.random(),
        type: 'food',
        mealType,
        desc,
        qta: weight,
        weight,
      };
      Object.keys(entrySaved).forEach((k) => {
        if (typeof entrySaved[k] === 'number' && k !== 'id') newItem[k] = entrySaved[k] * ratio;
      });
      newItem.units = entrySaved.units;
      newItem.defaultUnit = entrySaved.defaultUnit;
      newItem.category = entrySaved.category;
      newItem.foodDbKey = newKey;
      Object.keys(TARGETS).forEach((g) => Object.keys(TARGETS[g]).forEach((k) => {
        if (newItem[k] == null || newItem[k] === 0) {
          newItem[k] = (getAverageEstimate({ nutrientKey: k, foodDesc: desc, fullHistory: fullHistoryRef.current }) / 100) * weight;
        }
      }));
      newItem.kcal = newItem.kcal ?? newItem.cal ?? ((getAverageEstimate({ nutrientKey: 'kcal', foodDesc: desc, fullHistory: fullHistoryRef.current }) || 0) / 100) * weight;
      newItem.cal = newItem.cal ?? newItem.kcal;
      setAddedFoods((prev) => [...prev, newItem]);
      setFoodNameInput('');
      setFoodWeightInput('');
      setShowFoodDropdown(false);
    } catch (e) {
      alert(`Generazione alimento fallita: ${e.message}`);
    } finally {
      setIsGeneratingFood(false);
    }
  }, [userUid, mealType, foodNameInput, foodWeightInput, callGeminiAPIWithRotationRef, fullHistoryRef, db, setFoodDb, setAddedFoods, setShowFoodDropdown]);

  const triggerCreaSearch = useCallback(async (query, opts = {}) => {
    const q = String(query || '').trim();
    if (!q) return;

    if (import.meta.env?.DEV) {
      const userN =
        foodDb != null && typeof foodDb === 'object' && !Array.isArray(foodDb)
          ? Object.keys(foodDb).length
          : 0;
      const csvN =
        csvFoodDb != null && typeof csvFoodDb === 'object' && !Array.isArray(csvFoodDb)
          ? Object.keys(csvFoodDb).length
          : 0;
      // eslint-disable-next-line no-console
      console.log('[useFoodInputEngine:DEV:triggerCreaSearch]', {
        input: q,
        opts,
        foodDbUserKeys: userN,
        csvFoodDbKeys: csvN,
        csvFoodDbLoading,
      });
    }

    const onlyUsda = opts.onlyUsda === true;
    if (onlyUsda) {
      if (lastCreaQueryRef.current !== q || !Array.isArray(lastCreaNormalizedRef.current)) {
        return;
      }
      if (usdaFusionDoneForQueryRef.current === q) return;
      creaUsdaAbortRef.current?.abort();
      const ac = new AbortController();
      creaUsdaAbortRef.current = ac;
      try {
        const merged = await fuseUsdaIntoCrea(lastCreaNormalizedRef.current, q, {
          signal: ac.signal,
          minQueryLengthForUsda: 3,
        });
        if (!ac.signal.aborted) {
          setCreaResults(merged);
          usdaFusionDoneForQueryRef.current = q;
        }
      } catch {
        /* CREA invariata */
      }
      return;
    }

    creaUsdaAbortRef.current?.abort();
    const ac = new AbortController();
    creaUsdaAbortRef.current = ac;
    usdaFusionDoneForQueryRef.current = '';
    lastCreaQueryRef.current = q;

    setShowFoodDropdown(true);
    setCreaResults([]);
    setIsCreaLoading(true);
    try {
      if (csvFoodDbLoading) {
        setCreaResults([]);
        return;
      }

      const { creaNormalized, uiItems } = getCreaFusionPayload(csvFoodDb, q, {
        includeUserHistory: false,
        creaLimit: 50,
      });
      lastCreaNormalizedRef.current = creaNormalized;
      setCreaResults(uiItems);
      setShowFoodDropdown(true);
      setIsCreaLoading(false);

      if (import.meta.env?.DEV) {
        const sourceBoost = (s) => (s === 'CREA' ? 20 : s === 'USDA' ? 5 : 0);
        const fuseOrdering = (n) =>
          Number(n.textScore ?? n.matchScore ?? 0) * 100
          + Number(n.recencyScore ?? 0) * 100
          + Number(n.frequencyScore ?? 0) * 100
          + sourceBoost(n.source);
        // eslint-disable-next-line no-console
        console.log('[classicFoodSearch:DEV]', {
          path: 'creaDropdown',
          query: q,
          includeUserHistory: false,
          dbScope: 'csvFoodDb (solo catalogo CREA locale)',
          top: creaNormalized.slice(0, 10).map((n, i) => ({
            rank: i + 1,
            id: n.id,
            candidateSource: n.source ?? 'CREA',
            textMatch100: Number(n.textScore ?? n.matchScore ?? 0) * 100,
            recency100: Number(n.recencyScore ?? 0) * 100,
            frequency100: Number(n.frequencyScore ?? 0) * 100,
            sourceBoost: sourceBoost(n.source),
            orderingScore: fuseOrdering(n),
          })),
        });
      }

      const loadUsda = opts.loadUsda !== false && q.length >= 3;
      if (!loadUsda) return;

      try {
        const merged = await fuseUsdaIntoCrea(creaNormalized, q, {
          signal: ac.signal,
          minQueryLengthForUsda: 3,
        });
        if (!ac.signal.aborted) {
          setCreaResults(merged);
          usdaFusionDoneForQueryRef.current = q;
          if (import.meta.env?.DEV) {
            // uiItems da fuseUsdaIntoCrea: ordine finale = fusion; punteggi interni non esposti su row UI
            // eslint-disable-next-line no-console
            console.log('[classicFoodSearch:DEV]', {
              path: 'creaUsdaMerged',
              query: q,
              top: merged.slice(0, 10).map((it, i) => ({
                rank: i + 1,
                id: it.id,
                name: it.name,
                candidateSource: it.foodSource ?? it.row?.foodSource ?? 'unknown',
              })),
            });
          }
        }
      } catch {
        /* USDA opzionale: lista CREA già mostrata */
      }
    } catch (err) {
      console.error('CREA search failed', err);
      setCreaResults([]);
    } finally {
      setIsCreaLoading(false);
    }
  }, [csvFoodDb, csvFoodDbLoading, setShowFoodDropdown]);

  const handleAddFoodManual = useCallback(() => {
    if (!foodNameInput || !foodWeightInput) return;
    const item = estraiDatiFoodDb({
      nome: foodNameInput.trim(),
      qta: parseFloat(foodWeightInput),
      pastoType: mealType,
      foodDb,
      fullHistory: fullHistoryRef.current,
    });
    setAddedFoods([item, ...addedFoods]);
    setFoodNameInput('');
    setFoodWeightInput('');
  }, [foodNameInput, foodWeightInput, mealType, foodDb, fullHistoryRef, setAddedFoods, addedFoods]);

  return {
    foodNameInput,
    setFoodNameInput,
    foodWeightInput,
    setFoodWeightInput,
    foodDropdownSuggestions,
    foodInputOrchestration,
    creaResults,
    isCreaLoading,
    isBarcodeScannerOpen,
    setIsBarcodeScannerOpen,
    isGeneratingFood,
    triggerCreaSearch,
    handleBarcodeDetected,
    closeBarcodeScanner,
    generateFoodWithAI,
    handleAddFoodManual,
    barcodeVideoRef,
  };
}
