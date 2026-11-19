/**
 * Lettura nutrienti dal diario per MCP: niente inventati.
 * Preferisce fibreTotali; sodio da sale se na assente/incoerente; 0 sentinella → null.
 */

const ANIMAL_NO_FIBRE = /(?:^|[^a-z0-9àèéìòù])(merluzzo|pesce|filett|tonno|salmone|pollo|tacchino|manzo|vitello|maiale|carne|bresaola|prosciutto|speck|wurstel|wudy|salsicc|uovo|uova|egg|formaggio|mozzarella|parmigiano|grana|yogurt\s*greco|ricotta|burrata)(?=[^a-z0-9àèéìòù]|$)/iu;

export function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function looksLikeAnimalNoFibre(name) {
  return ANIMAL_NO_FIBRE.test(String(name || ''));
}

/**
 * Fibre in grammi della porzione. Se manca o è sospetta → null.
 * @returns {{ value: number|null, reason: string|null }}
 */
export function readFibreGrams(entry) {
  if (!entry || typeof entry !== 'object') return { value: null, reason: 'missing' };

  const totali = finite(entry.fibreTotali);
  const fibre = finite(entry.fibre ?? entry.fiber);
  const name = entry.name || entry.foodName || entry.desc || '';

  let value = null;
  let reason = null;

  if (totali != null) {
    // fibreTotali (anche 0) è la fonte più affidabile nel diario Kentu
    value = totali;
  } else if (fibre != null) {
    value = fibre;
  } else {
    return { value: null, reason: 'missing' };
  }

  if (looksLikeAnimalNoFibre(name) && value > 0.05) {
    return { value: null, reason: 'animal_fibre_suspicious' };
  }

  // 0 fibre è un dato valido (es. carne con fibreTotali:0)
  if (value < 0) return { value: null, reason: 'missing' };
  return { value, reason: null };
}

/**
 * Sodio in mg della porzione.
 * - na===0 senza sale → null (sentinella «sconosciuto», non zero reale)
 * - na molto piccolo con sale → usa sale×393.4 (na spesso in g o sporco)
 * - na < 5 senza sale → interpreta come grammi di Na → ×1000
 * @returns {{ value: number|null, reason: string|null }}
 */
export function readSodiumMg(entry) {
  if (!entry || typeof entry !== 'object') return { value: null, reason: 'missing' };

  const na = finite(entry.na ?? entry.sodium ?? entry.sodiumMg);
  const sale = finite(entry.sale);
  const fromSale = sale != null && sale > 0 ? Math.round(sale * 393.4 * 10) / 10 : null;

  if (na == null || na === 0) {
    if (fromSale != null) return { value: fromSale, reason: null };
    return { value: null, reason: 'missing' };
  }

  if (na > 0 && na < 5) {
    // Probabile grammi di sodio (es. pesto na:0.56) oppure campo sporco
    if (fromSale != null && Math.abs(fromSale - na * 1000) / fromSale < 0.55) {
      return { value: Math.round(na * 1000 * 10) / 10, reason: null };
    }
    if (fromSale != null) return { value: fromSale, reason: null };
    return { value: Math.round(na * 1000 * 10) / 10, reason: null };
  }

  // na in mg ma incoerente con sale (es. na:0.3 mangled already caught; na:0 with sale handled)
  if (fromSale != null && na < fromSale * 0.05) {
    return { value: fromSale, reason: null };
  }

  return { value: na, reason: null };
}

export function readMacroGrams(entry, key) {
  if (!entry || typeof entry !== 'object') return null;
  if (key === 'prot') return finite(entry.prot ?? entry.protein ?? entry.proteins);
  if (key === 'carb') return finite(entry.carb ?? entry.carbs ?? entry.carbohydrates);
  if (key === 'fat') return finite(entry.fat ?? entry.fatTotal ?? entry.fatTot ?? entry.fats);
  return finite(entry[key]);
}
