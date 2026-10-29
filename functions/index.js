const functions = require('firebase-functions');
const {
  DEFAULT_GEMINI_MODEL,
  sanitizeGeminiModel,
  normalizeGenerationConfig,
  extractGeminiText,
  extractGeminiUsageStats,
  postGeminiGenerateContent: postGeminiHttp,
} = require('./lib/geminiHttp');

/** REST v1beta — payload JSON in camelCase (REST Gemini + thinkingConfig). */
const GEMINI_MODEL = DEFAULT_GEMINI_MODEL;

/** Cold start: prima invocazione su questa istanza del container. */
let callGeminiInstanceWarm = false;

function readLegacyConfigKey() {
  try {
    const cfg = functions.config();
    return cfg?.gemini?.key || cfg?.gemini?.api_key || null;
  } catch (error) {
    console.warn('functions.config() non disponibile:', error?.message || error);
    return null;
  }
}

function getGeminiApiKey() {
  const key = process.env.GEMINI_API_KEY || readLegacyConfigKey();
  if (!key || !String(key).trim()) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'GEMINI_API_KEY non configurata sul server. Imposta il secret/env e ridistribuisci callGemini.',
    );
  }
  return String(key).trim();
}



function dataUrlToInlinePart(imageSrc) {
  const raw = String(imageSrc || '').trim();
  if (!raw) return null;

  const base64Data = raw.includes(',') ? raw.split(',')[1] : raw;
  if (!base64Data) return null;

  const mimeMatch = raw.match(/^data:([^;]+);/i);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

  return {
    inlineData: {
      mimeType,
      data: base64Data,
    },
  };
}

function mergeSystemIntoUserPrompt(userText, systemText) {
  const user = String(userText || '').trim();
  const system = String(systemText || '').trim();
  if (!system) return user;
  const userBlock = user || '(nessun testo — analizza allegati se presenti)';
  return `[SISTEMA - REGOLE E SCHEMA]:\n${system}\n\n[INPUT UTENTE]:\n${userBlock}`;
}

function buildUserParts(userText, systemText, images, image) {
  const parts = [];
  const imageList = [];

  if (Array.isArray(images)) imageList.push(...images);
  if (image) imageList.push(image);

  for (const src of imageList.slice(0, 4)) {
    const inlinePart = dataUrlToInlinePart(src);
    if (inlinePart) parts.push(inlinePart);
  }

  const mergedText = mergeSystemIntoUserPrompt(userText, systemText);
  if (mergedText) {
    parts.push({ text: mergedText });
  } else if (parts.length === 0) {
    parts.push({ text: '' });
  }

  return parts;
}

function appendJsonSchemaHint(systemInstruction, responseSchema) {
  const base = String(systemInstruction || '').trim();
  if (!responseSchema || typeof responseSchema !== 'object') return base;
  const hint =
    'Rispondi SOLO con JSON valido (nessun markdown) conforme a questo schema: '
    + JSON.stringify(responseSchema);
  return base ? `${base}\n\n${hint}` : hint;
}

/**
 * Normalizza contents Gemini nativi: role + parts.
 * Entry invalide vengono scartate (niente 500).
 * @param {unknown} raw
 * @returns {Array<{role: string, parts: object[]}>|null}
 */
function normalizeGeminiContents(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const roleRaw = String(entry.role || '').toLowerCase();
    const role = roleRaw === 'model' || roleRaw === 'assistant' ? 'model' : 'user';
    let parts = Array.isArray(entry.parts)
      ? entry.parts.filter((part) => part && typeof part === 'object')
      : [];
    if (parts.length === 0) {
      const text = String(entry.text || '').trim();
      if (!text) continue;
      parts = [{ text }];
    }
    const safeParts = parts
      .map((part) => {
        if (typeof part.text === 'string' && part.text.trim()) {
          return { text: part.text };
        }
        if (part.inlineData && typeof part.inlineData === 'object') {
          return { inlineData: part.inlineData };
        }
        if (part.inline_data && typeof part.inline_data === 'object') {
          return { inlineData: part.inline_data };
        }
        return null;
      })
      .filter(Boolean);
    if (safeParts.length === 0) continue;
    out.push({ role, parts: safeParts });
  }
  while (out.length > 0 && out[0].role === 'model') {
    out.shift();
  }
  return out.length > 0 ? out : null;
}

async function callGeminiGenerateContent({
  prompt,
  systemText,
  generationConfig,
  images,
  image,
  historyContents,
  model,
  schemaChars = null,
  coldStart = false,
  callTag = null,
}) {
  const history = normalizeGeminiContents(historyContents) || [];
  const userTurn = {
    role: 'user',
    parts: buildUserParts(prompt, systemText, images, image),
  };
  const apiKey = getGeminiApiKey();
  const modelId = sanitizeGeminiModel(model || GEMINI_MODEL);
  const genConfig = normalizeGenerationConfig(generationConfig);
  const thinkingLevel = genConfig?.thinkingConfig?.thinkingLevel ?? null;
  const thinkingBudget = genConfig?.thinkingConfig?.thinkingBudget ?? null;

  let response;
  let rawBody;
  const tGemini0 = Date.now();
  try {
    ({ response, rawBody } = await postGeminiHttp({
      apiKey,
      model: modelId,
      contents: [...history, userTurn],
      generationConfig: genConfig,
    }));
  } catch (error) {
    throw new functions.https.HttpsError(
      'unavailable',
      `Gemini fetch failed: ${error?.message || 'network error'}`,
    );
  }

  if (!response.ok && history.length > 0 && response.status >= 400 && response.status < 500) {
    console.warn(
      'Gemini rejected native contents, retrying without history',
      response.status,
      rawBody.slice(0, 400),
    );
    try {
      ({ response, rawBody } = await postGeminiHttp({
        apiKey,
        model: modelId,
        contents: [userTurn],
        generationConfig: genConfig,
      }));
    } catch (error) {
      throw new functions.https.HttpsError(
        'unavailable',
        `Gemini fetch failed: ${error?.message || 'network error'}`,
      );
    }
  }

  const geminiMs = Date.now() - tGemini0;

  if (!response.ok) {
    console.error('Gemini API HTTP error', response.status, rawBody.slice(0, 1200));
    throw new functions.https.HttpsError(
      'internal',
      `Gemini API error ${response.status}: ${rawBody.slice(0, 500)}`,
    );
  }

  let geminiData;
  try {
    geminiData = rawBody ? JSON.parse(rawBody) : {};
  } catch (error) {
    console.error('Gemini JSON parse failed', rawBody.slice(0, 500));
    throw new functions.https.HttpsError(
      'internal',
      `Gemini response parse failed: ${error?.message || 'invalid JSON'}`,
    );
  }

  const usage = geminiData.usageMetadata || null;
  const usageStats = extractGeminiUsageStats(usage);
  const text = extractGeminiText(geminiData);
  if (!text) {
    console.warn('Gemini empty text payload', JSON.stringify(geminiData).slice(0, 800));
  }

  const meta = {
    model: modelId,
    geminiMs,
    coldStart: Boolean(coldStart),
    schemaChars: Number.isFinite(Number(schemaChars)) ? Number(schemaChars) : null,
    thinkingLevel,
    thinkingBudget,
    callTag: callTag || null,
    ...usageStats,
  };
  console.info('[callGemini]', JSON.stringify(meta));

  return {
    text,
    candidates: geminiData.candidates || [],
    usage,
    meta,
  };
}

/**
 * Callable Function (v1) — compatibile con httpsCallable(functions, 'callGemini').
 * Regione europe-west1 allineata a src/firebaseConfig.js.
 */
exports.callGemini = functions
  .region('europe-west1')
  .runWith({ timeoutSeconds: 120, memory: '512MB' })
  .https.onCall(async (data) => {
    try {
      const coldStart = !callGeminiInstanceWarm;
      callGeminiInstanceWarm = true;

      const payload = data || {};
      const prompt = String(payload.prompt || '');
      const responseSchema = payload.responseSchema || null;
      let schemaChars = null;
      try {
        schemaChars = responseSchema ? JSON.stringify(responseSchema).length : 0;
      } catch {
        schemaChars = null;
      }
      const systemText = appendJsonSchemaHint(
        String(payload.systemInstruction || '').trim(),
        responseSchema,
      );
      const hasImages =
        (Array.isArray(payload.images) && payload.images.length > 0)
        || Boolean(payload.image);

      if (!prompt && !hasImages) {
        throw new functions.https.HttpsError('invalid-argument', 'prompt o images richiesti.');
      }

      // Unisce temperature top-level (legacy askAI) + generationConfig (thinkingConfig, …).
      const generationConfig = normalizeGenerationConfig({
        ...(payload.generationConfig && typeof payload.generationConfig === 'object'
          ? payload.generationConfig
          : {}),
        ...(payload.temperature != null ? { temperature: payload.temperature } : {}),
      });
      const modelName = payload.model || 'gemini-3.8-flash';
      const callTag = payload.callTag != null ? String(payload.callTag).slice(0, 64) : null;

      return await callGeminiGenerateContent({
        prompt,
        systemText,
        generationConfig,
        images: payload.images,
        image: payload.image,
        historyContents: payload.contents,
        model: modelName,
        schemaChars,
        coldStart,
        callTag,
      });
    } catch (error) {
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      console.error('callGemini unhandled error:', error);
      throw new functions.https.HttpsError(
        'internal',
        error?.message || 'Unexpected callGemini failure',
      );
    }
  });
