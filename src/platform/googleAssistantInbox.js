import { splitFoodListSegments } from '../features/commandTerminal/conversation/foodPhraseSplit';
import { serializeInboxDraftItem } from '../utils/mealDraftStatus';
import { createPendingInboxDraft, inferDraftType } from '../utils/draftParser';

export const GOOGLE_ASSISTANT_DRAFT_SCHEME = 'kentu';
export const GOOGLE_ASSISTANT_DRAFT_HOST = 'app';
export const GOOGLE_ASSISTANT_DRAFT_PATH = '/add_draft';

function nowHHmm() {
  const date = new Date();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function parseVoiceDraftItems(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return [];
  const segments = splitFoodListSegments(text);
  const names = (segments.length > 0 ? segments : [text])
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
      status: 'pending',
    }))
    .filter(Boolean);
}

export function parseAssistantAddDraftUrl(urlString) {
  const raw = String(urlString || '').trim();
  if (!raw) return { matched: false, text: '' };
  let parsed = null;
  try {
    parsed = new URL(raw);
  } catch {
    const isVoiceDraft = /add_draft/i.test(raw);
    if (!isVoiceDraft) return { matched: false, text: '' };
    const match = raw.match(/[?&](?:text|name|query)=([^&]*)/i);
    const text = match ? decodeURIComponent(match[1].replace(/\+/g, ' ')).trim() : '';
    return { matched: true, text };
  }
  const scheme = String(parsed.protocol || '').replace(/:$/, '');
  const host = String(parsed.hostname || parsed.host || '');
  const path = String(parsed.pathname || '');
  const isVoiceDraft = (
    scheme === GOOGLE_ASSISTANT_DRAFT_SCHEME
    && host === GOOGLE_ASSISTANT_DRAFT_HOST
    && path.replace(/\/$/, '') === GOOGLE_ASSISTANT_DRAFT_PATH
  ) || /add_draft/i.test(raw);
  if (!isVoiceDraft) return { matched: false, text: '' };
  const text = parsed.searchParams.get('text')
    || parsed.searchParams.get('name')
    || parsed.searchParams.get('query')
    || '';
  return { matched: true, text: String(text).trim() };
}

export function isAssistantAddDraftUrl(urlString) {
  return parseAssistantAddDraftUrl(urlString).matched;
}

export function extractAssistantDraftTextFromUrl(urlString) {
  return parseAssistantAddDraftUrl(urlString).text;
}

export function buildVoiceInboxDraftPayload(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return null;
  const structured = createPendingInboxDraft(text);
  const items = parseVoiceDraftItems(text);
  if (items.length === 0) return null;
  return {
    id: structured.id,
    rawText: structured.rawText,
    inferredType: structured.inferredType,
    timestamp: structured.timestamp,
    status: structured.status,
    items,
    createdAt: structured.timestamp,
    timeString: nowHHmm(),
    exactTime: nowHHmm(),
    source: 'google_assistant',
  };
}

export { inferDraftType };
