const STORAGE_KEY = 'ghost_api_usage_diary';
export const API_USAGE_UPDATED_EVENT = 'ghost-api-usage-updated';

const INPUT_COST_PER_MILLION = 0.30;
const OUTPUT_COST_PER_MILLION = 2.50;

const EMPTY_TOTALS = {
  promptTokenCount: 0,
  candidatesTokenCount: 0,
  callCount: 0,
};

function readRaw() {
  if (typeof localStorage === 'undefined') return { ...EMPTY_TOTALS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_TOTALS };
    const parsed = JSON.parse(raw);
    return {
      promptTokenCount: Number(parsed.promptTokenCount) || 0,
      candidatesTokenCount: Number(parsed.candidatesTokenCount) || 0,
      callCount: Number(parsed.callCount) || 0,
    };
  } catch {
    return { ...EMPTY_TOTALS };
  }
}

function writeRaw(totals) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(totals));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(API_USAGE_UPDATED_EVENT, { detail: totals }));
  }
}

export function getUsageTotals() {
  return readRaw();
}

export function recordUsage(usage) {
  if (!usage || typeof usage !== 'object') return getUsageTotals();

  const input = Number(usage.promptTokenCount) || 0;
  const output = Number(usage.candidatesTokenCount) || 0;
  if (input <= 0 && output <= 0) return getUsageTotals();

  const current = readRaw();
  const next = {
    promptTokenCount: current.promptTokenCount + input,
    candidatesTokenCount: current.candidatesTokenCount + output,
    callCount: current.callCount + 1,
  };
  writeRaw(next);
  return next;
}

export function resetUsageTotals() {
  writeRaw({ ...EMPTY_TOTALS });
  return { ...EMPTY_TOTALS };
}

export function estimateUsageCosts(totals = null) {
  const data = totals || readRaw();
  const inputCost = (data.promptTokenCount / 1_000_000) * INPUT_COST_PER_MILLION;
  const outputCost = (data.candidatesTokenCount / 1_000_000) * OUTPUT_COST_PER_MILLION;
  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  };
}
