/**
 * Serializza una voce sleep per RTDB (campi canonici quality + notes).
 * @param {object} entry
 * @returns {object|null}
 */
export function denormalizeSleepEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (String(entry.type || '').toLowerCase() !== 'sleep') return null;

  const notes = String(entry.notes ?? entry.note ?? entry.details ?? '').trim();
  const qualityRaw = Number(entry.quality ?? entry.sleepQuality ?? entry.rating);
  const quality = Number.isFinite(qualityRaw) && qualityRaw >= 1 && qualityRaw <= 5
    ? Math.round(qualityRaw)
    : null;
  const hoursRaw = Number(entry.hours ?? entry.duration ?? entry.sleepHours);
  const sleepStart = entry.sleepStart ?? entry.bedtime ?? null;
  const sleepRow = {
    type: 'sleep',
    id: entry.id,
    wakeTime: entry.wakeTime,
    sleepStart,
    sleepEnd: entry.sleepEnd,
    hours: Number.isFinite(hoursRaw) ? hoursRaw : entry.hours,
    deepMin: entry.deepMin,
    remMin: entry.remMin,
    hr: entry.hr,
  };
  if (sleepStart != null && sleepStart !== '') {
    sleepRow.bedtime = entry.bedtime ?? sleepStart;
  }
  if (quality != null) {
    sleepRow.quality = quality;
  }
  if (notes) {
    sleepRow.notes = notes;
  }
  const qualityScore = Number(entry.qualityScore);
  if (Number.isFinite(qualityScore) && qualityScore > 5) {
    sleepRow.qualityScore = Math.round(qualityScore);
  }
  return sleepRow;
}
