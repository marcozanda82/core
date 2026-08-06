/**
 * Conversione URI immagine → Base64 / data URL per Gemini Vision.
 * Web: fetch + FileReader / canvas. Expo: FileSystem.readAsStringAsync.
 */

function stripDataUrlPrefix(dataUrlOrBase64) {
  const raw = String(dataUrlOrBase64 || '').trim();
  if (!raw) return { base64: '', mimeType: 'image/jpeg', dataUrl: '' };
  if (raw.startsWith('data:')) {
    const mimeMatch = raw.match(/^data:([^;]+);base64,/i);
    const mimeType = mimeMatch?.[1] || 'image/jpeg';
    const base64 = raw.includes(',') ? raw.split(',')[1] : '';
    return { base64, mimeType, dataUrl: raw };
  }
  return { base64: raw, mimeType: 'image/jpeg', dataUrl: `data:image/jpeg;base64,${raw}` };
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === 'undefined') {
      reject(new Error('FileReader non disponibile'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Lettura immagine fallita'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Formato immagine non valido'));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}

async function tryExpoFileSystemBase64(uri) {
  try {
    const FileSystem = await import('expo-file-system');
    const encoding = FileSystem.EncodingType?.Base64 || 'base64';
    if (typeof FileSystem.readAsStringAsync !== 'function') return null;
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding });
    if (!base64) return null;
    const lower = String(uri).toLowerCase();
    const mimeType = lower.includes('.png')
      ? 'image/png'
      : lower.includes('.webp')
        ? 'image/webp'
        : 'image/jpeg';
    return {
      base64: String(base64).trim(),
      mimeType,
      dataUrl: `data:${mimeType};base64,${String(base64).trim()}`,
    };
  } catch {
    return null;
  }
}

/**
 * @param {string} imageUri — file://, content://, blob:, http(s):, o data URL
 * @returns {Promise<{ base64: string, mimeType: string, dataUrl: string }>}
 */
export async function imageUriToBase64(imageUri) {
  const uri = String(imageUri || '').trim();
  if (!uri) throw new Error('image_uri_missing');

  if (uri.startsWith('data:')) {
    return stripDataUrlPrefix(uri);
  }

  const expoResult = await tryExpoFileSystemBase64(uri);
  if (expoResult?.base64) return expoResult;

  if (typeof fetch !== 'function') {
    throw new Error('image_fetch_unavailable');
  }

  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`image_fetch_failed_${response.status}`);
  }
  const blob = await response.blob();
  const dataUrl = await readBlobAsDataUrl(blob);
  const parsed = stripDataUrlPrefix(dataUrl);
  if (blob.type && blob.type.startsWith('image/')) {
    parsed.mimeType = blob.type;
    parsed.dataUrl = `data:${blob.type};base64,${parsed.base64}`;
  }
  if (!parsed.base64) throw new Error('image_base64_empty');
  return parsed;
}
