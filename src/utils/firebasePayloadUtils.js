/** Rimuove undefined ricorsivamente per payload Firebase. */
export function stripUndefined(obj, depth = 0) {
  const MAX_STRIP_DEPTH = 25;
  if (depth > MAX_STRIP_DEPTH) return obj;
  if (obj === undefined) return null;
  if (obj === null) return null;
  if (Array.isArray(obj)) {
    return obj.map((v) => stripUndefined(v, depth + 1)).filter((v) => v !== undefined);
  }
  if (typeof obj === 'object') {
    const out = {};
    for (const k of Object.keys(obj)) {
      const v = stripUndefined(obj[k], depth + 1);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  return obj;
}
