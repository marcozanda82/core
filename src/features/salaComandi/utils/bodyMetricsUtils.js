export function formatBodyBatteryValue(v) {
  const n = Math.round(Number(v) * 10) / 10;
  if (n === 0) return '0%';
  return `${n > 0 ? '+' : ''}${n}%`;
}
