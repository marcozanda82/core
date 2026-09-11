import { splitFoodListSegments } from '../features/commandTerminal/conversation/foodPhraseSplit';
import { serializeInboxDraftItem } from '../utils/mealDraftStatus';

export const GOOGLE_ASSISTANT_DRAFT_SCHEME = 'kentu';
export const GOOGLE_ASSISTANT_DRAFT_HOST = 'app';
export const GOOGLE_ASSISTANT_DRAFT_PATH = '/add_draft';

function nowHHmm() {
  const date = new Date();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function stripAssistantCommandWrapper(text) {
  return String(text || '')
    .trim()
    .replace(/^(?:ok\s+google[,:]?\s*)?(?:aggiungi|add|inserisci|salva|registra)\s+/i, '')
    .replace(/\s+(?:a|su|in|nel|nella)\s+kentu(?:os)?\s*$/i, '')
    .trim();
}

export function parseVoiceDraftItems(rawText) {
  const cleaned = stripAssistantCommandWrapper(rawText);
  if (!cleaned) return [];
  const segments = splitFoodListSegments(cleaned);
  const names = (segments.length > 0 ? segments : [cleaned])
    .map((name) => String(name || '').trim())
    .filter(Boolean);
  const stamp = Date.now();
  return names
    .map((foodName, index) => serializeInboxDraftItem({
      id: `voice_${stamp}_${index}_${Math.random().toString(36).slice(2, 8)}`,
      foodName,
      name: foodName,
      desc: foodName,
      spokenFoodName: foodName,
      grams: 1,
      status: 'raw',
    }))
    .filter(Boolean);
}

export function extractAssistantDraftTextFromUrl(urlString) {
  const raw = String(urlString || '').trim();
  if (!raw) return '';
  let parsed = null;
  try {
    parsed = new URL(raw);
  } catch {
    const match = raw.match(/[?&](?:text|name|query)=([^&]*)/i);
    return match ? decodeURIComponent(match[1].replace(/\+/g, ' ')).trim() : '';
  }
  const scheme = String(parsed.protocol || '').replace(/:$/, '');
  const host = String(parsed.hostname || parsed.host || '');
  const path = String(parsed.pathname || '');
  const isVoiceDraft = (
    scheme === GOOGLE_ASSISTANT_DRAFT_SCHEME
    && host === GOOGLE_ASSISTANT_DRAFT_HOST
    && path.replace(/\/$/, '') === GOOGLE_ASSISTANT_DRAFT_PATH
  ) || /add_draft/i.test(raw);
  if (!isVoiceDraft) return '';
  const text = parsed.searchParams.get('text')
    || parsed.searchParams.get('name')
    || parsed.searchParams.get('query')
    || '';
  return String(text).trim();
}

export function buildVoiceInboxDraftPayload(rawText) {
  const items = parseVoiceDraftItems(rawText);
  if (items.length === 0) return null;
  const createdAt = Date.now();
  return {
    items,
    createdAt,
    timeString: nowHHmm(),
    exactTime: nowHHmm(),
    source: 'google_assistant',
  };
}
