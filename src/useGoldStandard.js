import { useState, useEffect, useCallback } from 'react';

/**
 * Hook per caricare crea_gold_standard.json (profili amminoacidici e minerali).
 * Predispone il "gancio" per i Food Tips in InsightCard.
 * @param {string} url - Path al JSON (default: pubblico nella app)
 * @returns {{ foods: Array, loading: boolean, error: Error | null, getTipsByMineral: (mineral: string) => string[] }}
 */
export function useGoldStandard(url = '/crea_gold_standard.json') {
  const [foods, setFoods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('File non trovato');
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : (data.alimenti || data.foods || []);
        setFoods(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [url]);

  const getTipsByMineral = useCallback((mineral = 'Magnesio') => {
    return foods
      .filter((a) => {
        const mg = a.mg ?? a.magnesio ?? a.minerali?.mg ?? 0;
        const name = (a.nome || a.desc || a.name || '').toLowerCase();
        return (mg > 0 || name.includes('farro') || name.includes('quinoa') || name.includes('orzo')) && mg >= 20;
      })
      .slice(0, 4)
      .map((a) => {
        const nome = a.nome || a.desc || a.name || 'Alimento';
        const mg = a.mg ?? a.magnesio ?? a.minerali?.mg ?? 0;
        return mg > 0 ? `${nome} (Mg ${mg} mg/100g)` : nome;
      });
  }, [foods]);

  return { foods, loading, error, getTipsByMineral };
}
