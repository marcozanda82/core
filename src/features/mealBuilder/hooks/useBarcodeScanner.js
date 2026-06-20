import { useCallback, useEffect, useRef, useState } from 'react';

import { getBarcodeNutritionOverride } from '../../../barcodeFoodOverrides';
import { enrichDbRowWithFoodUnits } from '../../../foodUnits';
import {
  BARCODE_NO_MATCH_MESSAGE,
  fetchOpenFoodFactsByBarcode,
} from '../utils/barcodeOpenFoodFacts';

/**
 * Fotocamera + risoluzione barcode → oggetto alimento compatibile con UniversalSearch / draft cart.
 */
export default function useBarcodeScanner({ personalDb, onAcquireExternalFood, onFoodResolved }) {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const resolvingRef = useRef(false);

  const stopCamera = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setError('');
    stopCamera();
  }, [stopCamera]);

  const open = useCallback(() => {
    setError('');
    setIsOpen(true);
  }, []);

  const resolveBarcodeToFood = useCallback(
    async (barcode) => {
      const code = String(barcode ?? '').trim();
      if (!code) throw new Error(BARCODE_NO_MATCH_MESSAGE);

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

      const existingDbKey = Object.keys(personalDb || {}).find(
        (k) => personalDb[k] && String(personalDb[k].barcode ?? '').trim() === code,
      );

      let entryPer100 = existingDbKey ? { ...(personalDb[existingDbKey] || {}) } : null;

      if (!entryPer100) {
        const localOv = getBarcodeNutritionOverride(code);
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
          entryPer100 = await fetchOpenFoodFactsByBarcode(code);
          if (entryPer100) {
            entryPer100 = applyLocalOverride({ ...entryPer100, barcode: code });
          }
        }
      }

      const hasStrictMacros = ['kcal', 'prot', 'carb', 'fatTotal', 'fat'].some((k) =>
        Number.isFinite(Number(entryPer100?.[k])),
      );
      if (!entryPer100 || !hasStrictMacros) {
        throw new Error(BARCODE_NO_MATCH_MESSAGE);
      }

      const name = String(entryPer100.desc || '').trim() || `Barcode ${code}`;

      if (existingDbKey) {
        const row = personalDb[existingDbKey];
        return {
          _source: 'personal',
          id: existingDbKey,
          key: existingDbKey,
          desc: row.desc || row.name || name,
          name: row.desc || row.name || name,
          row,
          barcode: code,
        };
      }

      let dbKey = `food_${Date.now()}_${code}`;
      let row = { ...entryPer100, desc: name, barcode: code };

      if (typeof onAcquireExternalFood === 'function') {
        const saved = await onAcquireExternalFood({ ...row, desc: name, barcode: code });
        if (saved?.key && saved?.row) {
          dbKey = saved.key;
          row = saved.row;
        } else if (saved?.key) {
          dbKey = saved.key;
          row = personalDb?.[dbKey] || enrichDbRowWithFoodUnits(row, dbKey);
        } else {
          row = enrichDbRowWithFoodUnits(row, dbKey);
        }
      } else {
        row = enrichDbRowWithFoodUnits(row, dbKey);
      }

      return {
        _source: 'personal',
        id: dbKey,
        key: dbKey,
        desc: name,
        name,
        row,
        barcode: code,
      };
    },
    [personalDb, onAcquireExternalFood],
  );

  const handleBarcodeDetected = useCallback(
    async (barcode) => {
      if (resolvingRef.current) return;
      resolvingRef.current = true;
      setIsResolving(true);
      stopCamera();
      setIsOpen(false);
      try {
        const food = await resolveBarcodeToFood(barcode);
        setError('');
        onFoodResolved?.(food);
      } catch (err) {
        const msg = err?.message || BARCODE_NO_MATCH_MESSAGE;
        setError(msg);
      } finally {
        resolvingRef.current = false;
        setIsResolving(false);
      }
    },
    [resolveBarcodeToFood, stopCamera, onFoodResolved],
  );

  useEffect(() => {
    if (!isOpen || !videoRef.current) return;

    if (!('BarcodeDetector' in window)) {
      setError('Il browser non supporta la scansione barcode. Prova Chrome su Android.');
      setIsOpen(false);
      return undefined;
    }

    let stream = null;
    const barcodeDetector = new BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'],
    });

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        stream = s;
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play();
        }
        scanIntervalRef.current = setInterval(async () => {
          if (!videoRef.current || !stream) return;
          try {
            const barcodes = await barcodeDetector.detect(videoRef.current);
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
        setError('Impossibile accedere alla fotocamera.');
        setIsOpen(false);
      });

    return () => {
      stopCamera();
    };
  }, [isOpen, handleBarcodeDetected, stopCamera]);

  return {
    isOpen,
    open,
    close,
    videoRef,
    error,
    setError,
    isResolving,
  };
}
