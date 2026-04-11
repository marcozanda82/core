/**
 * Stato budget macro rispetto ai target giornalieri (guida decisioni utente).
 * @param {{ protein?: number, prot?: number, carbs?: number, carb?: number, fats?: number, fat?: number, fatTotal?: number, kcal?: number }} current
 * @param {{ protein?: number, prot?: number, carbs?: number, carb?: number, fats?: number, fat?: number, fatTotal?: number, kcal?: number }} target
 * @returns {{ protein: 'blocked'|'warning'|'free', carbs: 'blocked'|'warning'|'free', fats: 'blocked'|'warning'|'free' }}
 * @example
 * const current = { kcal: 1800, protein: 120, carbs: 190, fats: 58 };
 * const target = { kcal: 2000, protein: 150, carbs: 220, fats: 70 };
 * console.log(getMacroBudgetStatus(current, target));
 */
export function getMacroBudgetStatus(current, target) {
  const c = current && typeof current === 'object' ? current : {};
  const t = target && typeof target === 'object' ? target : {};

  const curP = Number(c.protein ?? c.prot ?? 0) || 0;
  const curC = Number(c.carbs ?? c.carb ?? c.cho ?? 0) || 0;
  const curF = Number(c.fats ?? c.fat ?? c.fatTotal ?? 0) || 0;

  const tgtP = Number(t.protein ?? t.prot ?? 0) || 0;
  const tgtC = Number(t.carbs ?? t.carb ?? t.cho ?? 0) || 0;
  const tgtF = Number(t.fats ?? t.fat ?? t.fatTotal ?? 0) || 0;

  const one = (currentVal, targetVal) => {
    const tv = Number(targetVal);
    if (!(tv > 0)) return 'free';
    if (currentVal >= tv) return 'blocked';
    if (currentVal >= 0.9 * tv) return 'warning';
    return 'free';
  };

  return {
    protein: one(curP, tgtP),
    carbs: one(curC, tgtC),
    fats: one(curF, tgtF),
  };
}

