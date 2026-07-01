const functions = require('firebase-functions');

/** REST v1 — payload JSON in camelCase (REST Gemini). */
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

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

/**
 * generationConfig compatibile con REST v1 (camelCase).
 * Esclude responseMimeType / responseSchema (non supportati su questo endpoint).
 */
function normalizeGenerationConfig(rawConfig = {}) {
  const src = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
  const config = {};

  const temp = Number(src.temperature);
  config.temperature = Number.isFinite(temp) ? temp : 0.3;

  const maxOut = Number(src.maxOutputTokens ?? src.max_output_tokens);
  if (Number.isFinite(maxOut) && maxOut > 0) {
    config.maxOutputTokens = Math.round(maxOut);
  }

  const topP = Number(src.topP ?? src.top_p);
  if (Number.isFinite(topP)) config.topP = topP;

  const topK = Number(src.topK ?? src.top_k);
  if (Number.isFinite(topK)) config.topK = Math.round(topK);

  const stop = src.stopSequences ?? src.stop_sequences;
  if (Array.isArray(stop) && stop.length > 0) {
    config.stopSequences = stop.map((s) => String(s)).filter(Boolean);
  }

  return config;
}

function appendJsonSchemaHint(systemInstruction, responseSchema) {
  const base = String(systemInstruction || '').trim();
  if (!responseSchema || typeof responseSchema !== 'object') return base;
  const hint =
    'Rispondi SOLO con JSON valido (nessun markdown) conforme a questo schema: '
    + JSON.stringify(responseSchema);
  return base ? `${base}\n\n${hint}` : hint;
}

function extractGeminiText(geminiData) {
  const parts = geminiData?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  const textPart = parts.find((part) => typeof part?.text === 'string');
  return textPart?.text || '';
}

async function callGeminiGenerateContent({
  prompt,
  systemText,
  generationConfig,
  images,
  image,
}) {
  const geminiPayload = {
    contents: [
      {
        parts: buildUserParts(prompt, systemText, images, image),
      },
    ],
    generationConfig,
  };

  const apiKey = getGeminiApiKey();
  const url = `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload),
    });
  } catch (error) {
    throw new functions.https.HttpsError(
      'unavailable',
      `Gemini fetch failed: ${error?.message || 'network error'}`,
    );
  }

  const rawBody = await response.text();

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

  const text = extractGeminiText(geminiData);
  if (!text) {
    console.warn('Gemini empty text payload', JSON.stringify(geminiData).slice(0, 800));
  }

  return {
    text,
    candidates: geminiData.candidates || [],
    usage: geminiData.usageMetadata || null,
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
      const payload = data || {};
      const prompt = String(payload.prompt || '');
      const responseSchema = payload.responseSchema || null;
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

      const generationConfig = normalizeGenerationConfig(payload.generationConfig);

      return await callGeminiGenerateContent({
        prompt,
        systemText,
        generationConfig,
        images: payload.images,
        image: payload.image,
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
