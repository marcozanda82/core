export function roundToOneDecimal(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(parseFloat(n.toFixed(1)));
}
