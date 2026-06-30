const functions = require('firebase-functions');

const DEFAULT_MODEL = 'gemini-1.5-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function resolveModelName(rawModel) {
  const modelName = String(rawModel || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  return modelName.replace(/^models\//i, '');
}

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

function buildUserParts(prompt, images, image) {
  const parts = [];
  const imageList = [];

  if (Array.isArray(images)) imageList.push(...images);
  if (image) imageList.push(image);

  for (const src of imageList.slice(0, 4)) {
    const inlinePart = dataUrlToInlinePart(src);
    if (inlinePart) parts.push(inlinePart);
  }

  const text = String(prompt || '').trim();
  if (text) parts.push({ text });

  return parts.length > 0 ? parts : [{ text: '' }];
}

function normalizeGenerationConfig(rawConfig = {}, responseSchema) {
  const generationConfig = {
    temperature: 0.3,
  };

  if (rawConfig && typeof rawConfig === 'object') {
    Object.assign(generationConfig, rawConfig);
  }

  if (generationConfig.response_mime_type) {
    generationConfig.responseMimeType = generationConfig.response_mime_type;
    delete generationConfig.response_mime_type;
  }

  if (generationConfig.response_schema) {
    generationConfig.responseSchema = generationConfig.response_schema;
    delete generationConfig.response_schema;
  }

  if (responseSchema) {
    generationConfig.responseSchema = responseSchema;
  }

  const wantsJson =
    generationConfig.responseMimeType === 'application/json'
    || Boolean(generationConfig.responseSchema);

  if (wantsJson) {
    generationConfig.responseMimeType = 'application/json';
  } else {
    delete generationConfig.responseMimeType;
    delete generationConfig.responseSchema;
  }

  if (generationConfig.temperature != null) {
    const temp = Number(generationConfig.temperature);
    generationConfig.temperature = Number.isFinite(temp) ? temp : 0.3;
  }

  return generationConfig;
}

function extractGeminiText(geminiData) {
  const parts = geminiData?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  const textPart = parts.find((part) => typeof part?.text === 'string');
  return textPart?.text || '';
}

async function callGeminiGenerateContent({ prompt, systemInstruction, model, generationConfig, images, image }) {
  const geminiPayload = {
    contents: [
      {
        role: 'user',
        parts: buildUserParts(prompt, images, image),
      },
    ],
    generationConfig,
  };

  if (systemInstruction) {
    geminiPayload.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  const apiKey = getGeminiApiKey();
  const cleanModelName = resolveModelName(model);
  const url = `${GEMINI_API_BASE}/models/${cleanModelName}:generateContent?key=${apiKey}`;

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

  return { text, candidates: geminiData.candidates || [] };
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
      const systemInstruction = String(payload.systemInstruction || '').trim();
      const model = resolveModelName(payload.model);
      const responseSchema = payload.responseSchema || null;
      const hasImages =
        (Array.isArray(payload.images) && payload.images.length > 0)
        || Boolean(payload.image);

      if (!prompt && !hasImages) {
        throw new functions.https.HttpsError('invalid-argument', 'prompt o images richiesti.');
      }

      const generationConfig = normalizeGenerationConfig(payload.generationConfig, responseSchema);

      if (hasImages && !generationConfig.responseMimeType) {
        generationConfig.responseMimeType = 'application/json';
      }

      return await callGeminiGenerateContent({
        prompt,
        systemInstruction,
        model,
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
