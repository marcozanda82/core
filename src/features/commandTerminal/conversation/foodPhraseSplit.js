/**
 * Split frasi alimentari: virgole / "+" / "e" con grammatura autonoma.
 * NON spezza i descrittori "con / ai / al" ("pane con semi e noci 160g" = 1 alimento).
 */

const GRAMS_RE = /(\d+(?:[.,]\d+)?)\s*(?:g|grammi|gr)\b/i;
const RIGHT_STARTS_WITH_GRAMS_RE = /^\d+(?:[.,]\d+)?\s*(?:g|grammi|gr)\b/i;
const DESCRIPTOR_RE = /\b(?:con|col|coll['’]|ai|al|alla|alle|allo|agli|all['’])\b/i;
const HARD_SPLIT_RE = /\s*(?:,|;|\+)\s*/;
const E_KEEP_RE = /(\s+(?:e|ed)\s+)/i;

export function segmentHasOwnGrams(text) {
  return GRAMS_RE.test(String(text || ''));
}

/**
 * True se "e" separa due alimenti (non un descrittore composto).
 * @param {string} left
 * @param {string} right
 */
export function shouldSplitOnE(left, right) {
  const l = String(left || '').trim();
  const r = String(right || '').trim();
  if (!l || !r) return false;

  const leftHasGrams = segmentHasOwnGrams(l);
  const rightHasGrams = segmentHasOwnGrams(r);
  const rightStartsWithGrams = RIGHT_STARTS_WITH_GRAMS_RE.test(r);
  const leftHasDescriptor = DESCRIPTOR_RE.test(l);

  if (leftHasGrams && rightHasGrams) return true;
  if (rightStartsWithGrams) return true;
  if (leftHasDescriptor && !leftHasGrams) return false;
  if (rightHasGrams) return true;
  return !leftHasDescriptor;
}

/**
 * Spezza una frase in segmenti-alimento.
 * @param {string} text
 * @returns {string[]}
 */
export function splitFoodListSegments(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];

  const hardParts = raw.split(HARD_SPLIT_RE).map((s) => s.trim()).filter(Boolean);
  const out = [];

  hardParts.forEach((part) => {
    const tokens = part.split(E_KEEP_RE);
    let acc = tokens[0] || '';
    for (let i = 1; i < tokens.length; i += 2) {
      const conj = tokens[i];
      const next = tokens[i + 1] || '';
      if (shouldSplitOnE(acc, next)) {
        if (acc.trim()) out.push(acc.trim());
        acc = next;
      } else {
        acc = `${acc}${conj}${next}`;
      }
    }
    if (acc.trim()) out.push(acc.trim());
  });

  return out;
}

export function isCompositeFoodDescriptorName(name) {
  return DESCRIPTOR_RE.test(String(name || ''));
}
