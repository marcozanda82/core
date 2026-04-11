/**
 * Valida prima di aggiungere un alimento: simula i totali e decide se serve conferma.
 * @param {{ current?: object, target?: object, addition?: object, time?: unknown }} params
 * @returns {boolean} true = consenti senza avviso; false = mostra conferma (sonno/digestione)
 */
export function validateFoodAddition({ current, target, addition, time }) {
  const hourOfDay = (t) => {
    if (t == null) return 12;
    if (typeof t === 'number' && Number.isFinite(t)) return Math.min(24, Math.max(0, t));
    if (t instanceof Date) return t.getHours() + t.getMinutes() / 60;
    if (typeof t === 'string') {
      const m = t.trim().match(/^(\d{1,2}):(\d{2})/);
      if (m) {
        const h = Number(m[1]);
        const min = Number(m[2]);
        if (Number.isFinite(h) && Number.isFinite(min)) return h + min / 60;
      }
    }
    return 12;
  };

  const read = (o) => ({
    protein: Number(o?.protein ?? o?.prot ?? 0) || 0,
    fats: Number(o?.fats ?? o?.fat ?? o?.fatTotal ?? 0) || 0,
  });

  const cur = read(current && typeof current === 'object' ? current : {});
  const add = read(addition && typeof addition === 'object' ? addition : {});
  const tgt = target && typeof target === 'object' ? target : {};
  const tgtP = Number(tgt.protein ?? tgt.prot ?? 0) || 0;

  const newP = cur.protein + add.protein;
  const newF = cur.fats + add.fats;

  const evening = hourOfDay(time) >= 17;

  const proteinSignificantlyOver = tgtP > 0 && newP > tgtP * 1.1;

  const eveningFatRisk = evening && newF > 30;

  if (proteinSignificantlyOver || eveningFatRisk) return false;
  return true;
}
