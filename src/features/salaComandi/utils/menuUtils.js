export function normalizeAddMenuOrderState(saved, defaultOrder) {
  const allowed = new Set(defaultOrder);
  if (!Array.isArray(saved)) return [...defaultOrder];
  const out = [];
  const seen = new Set();
  for (const id of saved) {
    if (id === 'luce') continue;
    if (allowed.has(id) && !seen.has(id)) {
      out.push(id);
      seen.add(id);
    }
  }
  for (const id of defaultOrder) {
    if (!seen.has(id)) {
      if (id === 'plan') out.unshift(id);
      else out.push(id);
      seen.add(id);
    }
  }
  return out;
}
