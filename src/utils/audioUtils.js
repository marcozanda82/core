/**
 * Converte un Blob audio in Base64 puro (senza prefisso data:…).
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export function audioBlobToBase64(blob) {
  return new Promise((resolve, reject) => {
    if (!blob || typeof blob.size !== 'number') {
      reject(new Error('missing_blob'));
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl) {
        reject(new Error('empty_filereader_result'));
        return;
      }
      resolve(stripDataUrlPrefix(dataUrl));
    };
    reader.onerror = () => {
      reject(reader.error || new Error('filereader_failed'));
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Rimuove il prefisso data:*;base64, da una stringa data URL.
 * @param {string} dataUrlOrBase64
 * @returns {string}
 */
export function stripDataUrlPrefix(dataUrlOrBase64) {
  const raw = String(dataUrlOrBase64 || '').trim();
  if (!raw) return '';
  const comma = raw.indexOf(',');
  if (raw.startsWith('data:') && comma >= 0) {
    return raw.slice(comma + 1).trim();
  }
  return raw;
}

/**
 * @param {string} base64
 * @param {string} [mimeType]
 * @returns {string}
 */
export function audioBase64ToDataUrl(base64, mimeType = 'audio/webm') {
  const data = stripDataUrlPrefix(base64);
  if (!data) return '';
  const mime = normalizeAudioMimeType(mimeType);
  return `data:${mime};base64,${data}`;
}

/**
 * @param {string} mimeType
 * @returns {string}
 */
export function normalizeAudioMimeType(mimeType) {
  const raw = String(mimeType || 'audio/webm').trim().toLowerCase();
  if (!raw) return 'audio/webm';
  return raw.split(';')[0].trim() || 'audio/webm';
}
