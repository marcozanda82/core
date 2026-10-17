import { useCallback, useEffect, useRef, useState } from 'react';

import { getBarcodeNutritionOverride } from '../../../barcodeFoodOverrides';
import { enrichDbRowWithFoodUnits } from '../../../foodUnits';
import { FOOD_DB_SOURCE, FOOD_PROVENANCE } from '../../../foodDbSource';
import { calculateAutoIconTag } from '../../../utils/iconEngine';
import { triggerSelectionHaptic } from '../utils/hapticFeedback';
import {
  BARCODE_NO_MATCH_MESSAGE,
  extractBarcodeFromScan,
  normalizeGtinDigits,
  resolveBarcodeCascade,
} from '../utils/barcodeOpenFoodFacts';

/** Formati BarcodeDetector: EAN/UPC classici + QR (GS1 Digital Link). */
const SCANNER_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code'];

/**
 * Fotocamera + risoluzione barcode → oggetto alimento compatibile con UniversalSearch / draft cart.
 *
 * Cascata: DB personale → dump OFF locale / cache → Open Food Facts API v2.
 *
 * @param {{
 *   personalDb?: object,
 *   offDb?: object|null,
 *   onAcquireExternalFood?: (entry: object) => Promise<{ key?: string, row?: object } | void>,
 *   onFoodResolved?: (food: object) => void,
 *   enrichOffProduct?: (offEntry: object) => Promise<object | null | undefined>,
 * }} params
 */
export default function useBarcodeScanner({
  personalDb,
  offDb = null,
  onAcquireExternalFood,
  onFoodResolved,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [notFound, setNotFound] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const isScanningRef = useRef(false);
  const offDbRef = useRef(offDb);
  offDbRef.current = offDb;

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
    setNotFound(null);
    setIsResolving(false);
    isScanningRef.current = false;
    stopCamera();
  }, [stopCamera]);

  const open = useCallback(() => {
    setError('');
    setNotFound(null);
    setIsResolving(false);
    isScanningRef.current = false;
    setIsOpen(true);
  }, []);

  const resolveBarcodeToFood = useCallback(
    async (rawBarcode) => {
      const code = extractBarcodeFromScan(rawBarcode) || normalizeGtinDigits(rawBarcode);
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

      const existingDbKey = Object.keys(personalDb || {}).find((k) => {
        const row = personalDb[k];
        if (!row) return false;
        const rowCode = normalizeGtinDigits(row.barcode);
        return rowCode && rowCode === code;
      });

      if (existingDbKey) {
        const row = personalDb[existingDbKey];
        const name = String(row.desc || row.name || '').trim() || `Barcode ${code}`;
        return {
          _source: 'personal',
          id: existingDbKey,
          key: existingDbKey,
          desc: name,
          name,
          row,
          barcode: code,
          provenance: FOOD_PROVENANCE.PERSONAL,
        };
      }

      let entryPer100 = null;
      let generatedIconTag = null;
      let offSource = null;

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
        const cascade = await resolveBarcodeCascade(code, { offDb: offDbRef.current });
        if (!cascade.success) {
          const fail = new Error(BARCODE_NO_MATCH_MESSAGE);
          fail.reason = cascade.reason || 'not_found';
          fail.barcode = code;
          throw fail;
        }
        entryPer100 = applyLocalOverride({
          ...cascade.entry,
          barcode: code,
        });
        offSource = cascade.source;
        if (!entryPer100?.desc) {
          const fail = new Error(BARCODE_NO_MATCH_MESSAGE);
          fail.reason = 'not_found';
          fail.barcode = code;
          throw fail;
        }
        if (offSource === 'online' || offSource === 'cache') {
          generatedIconTag = calculateAutoIconTag(entryPer100.desc, entryPer100.brand || '');
        }
      }

      const hasStrictMacros = ['kcal', 'prot', 'carb', 'fatTotal', 'fat'].some((k) =>
        Number.isFinite(Number(entryPer100?.[k])),
      );
      if (!entryPer100 || !hasStrictMacros) {
        const fail = new Error(BARCODE_NO_MATCH_MESSAGE);
        fail.reason = 'not_found';
        fail.barcode = code;
        throw fail;
      }

      const name = String(entryPer100.desc || '').trim() || `Barcode ${code}`;

      // Hit locale OFF: usa direttamente senza forzare acquire personale (UI immediata).
      if (offSource === 'local' || offSource === 'cache') {
        const id = String(entryPer100.id || `OFF_${code}`);
        const row = enrichDbRowWithFoodUnits(
          { ...entryPer100, desc: name, barcode: code, source: FOOD_DB_SOURCE.OFF },
          id,
        );
        return {
          _source: 'off',
          id,
          key: id,
          desc: name,
          name,
          brand: row.brand,
          row,
          barcode: code,
          source: FOOD_DB_SOURCE.OFF,
          provenance: FOOD_PROVENANCE.OFF,
        };
      }

      let dbKey = `food_${Date.now()}_${code}`;
      let row = {
        ...entryPer100,
        desc: name,
        barcode: code,
        source: FOOD_DB_SOURCE.OFF,
        foodSource: 'OFF',
      };

      if (typeof onAcquireExternalFood === 'function') {
        try {
          const saved = await Promise.race([
            onAcquireExternalFood({
              ...row,
              desc: String(row.desc || name).trim() || name,
              barcode: code,
              ...(generatedIconTag ? { iconTag: generatedIconTag } : {}),
            }),
            new Promise((_, reject) => {
              setTimeout(() => reject(new Error('acquire_timeout')), 6000);
            }),
          ]);
          if (saved?.key && saved?.row) {
            dbKey = saved.key;
            row = saved.row;
          } else if (saved?.key) {
            dbKey = saved.key;
            row = personalDb?.[dbKey] || enrichDbRowWithFoodUnits(row, dbKey);
          } else {
            row = enrichDbRowWithFoodUnits(row, dbKey);
          }
        } catch (acquireErr) {
          console.warn('[useBarcodeScanner] onAcquireExternalFood failed/timeout', acquireErr);
          row = enrichDbRowWithFoodUnits(row, dbKey);
        }
      } else {
        row = enrichDbRowWithFoodUnits(row, dbKey);
      }

      return {
        _source: 'personal',
        id: dbKey,
        key: dbKey,
        desc: String(row.desc || name).trim() || name,
        name: String(row.desc || name).trim() || name,
        row,
        barcode: code,
        provenance: FOOD_PROVENANCE.PERSONAL,
      };
    },
    [personalDb, onAcquireExternalFood],
  );

  const handleBarcodeDetected = useCallback(
    async (rawBarcode) => {
      if (isScanningRef.current) return;
      isScanningRef.current = true;
      setIsResolving(true);
      setError('');
      setNotFound(null);
      stopCamera();
      const code = extractBarcodeFromScan(rawBarcode) || normalizeGtinDigits(rawBarcode);
      try {
        if (!code) throw new Error(BARCODE_NO_MATCH_MESSAGE);
        const food = await resolveBarcodeToFood(code);
        setError('');
        setNotFound(null);
        triggerSelectionHaptic(18);
        setIsOpen(false);
        onFoodResolved?.(food);
      } catch (err) {
        const reason = err?.reason || (err?.name === 'AbortError' ? 'timeout' : 'not_found');
        setIsResolving(false);
        setNotFound({ barcode: code, reason });
        setError('');
      } finally {
        isScanningRef.current = false;
        setIsResolving(false);
      }
    },
    [resolveBarcodeToFood, stopCamera, onFoodResolved],
  );

  useEffect(() => {
    if (!isOpen || notFound || isResolving) return undefined;

    if (!('BarcodeDetector' in window)) {
      setError('Il browser non supporta la scansione barcode. Prova Chrome su Android.');
      setIsOpen(false);
      return undefined;
    }

    let stream = null;
    let barcodeDetector;
    try {
      barcodeDetector = new BarcodeDetector({ formats: SCANNER_FORMATS });
    } catch {
      // Alcuni browser accettano solo un sottoinsieme: fallback senza QR.
      try {
        barcodeDetector = new BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'],
        });
      } catch {
        setError('Scanner barcode non disponibile su questo dispositivo.');
        setIsOpen(false);
        return undefined;
      }
    }

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
              const raw = String(barcodes[0].rawValue ?? '').trim();
              const code = extractBarcodeFromScan(raw);
              if (code) handleBarcodeDetected(code);
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
  }, [isOpen, notFound, isResolving, handleBarcodeDetected, stopCamera]);

  return {
    isOpen,
    open,
    close,
    videoRef,
    error,
    setError,
    isResolving,
    notFound,
  };
}
