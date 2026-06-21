const TARGET_MAX_BYTES = 80 * 1024;
const MIN_QUALITY = 0.35;
const QUALITY_STEP = 0.08;

let webpSupportedCache = null;

function supportsWebpExport() {
  if (webpSupportedCache != null) return webpSupportedCache;
  if (typeof document === 'undefined') {
    webpSupportedCache = false;
    return false;
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    webpSupportedCache = canvas.toDataURL('image/webp', 0.5).startsWith('data:image/webp');
  } catch {
    webpSupportedCache = false;
  }
  return webpSupportedCache;
}

function estimateDataUrlBytes(dataUrl) {
  const base64 = String(dataUrl).split(',')[1] || '';
  return Math.ceil((base64.length * 3) / 4);
}

function scaleDimensions(width, height, maxWidth) {
  const maxSide = Math.max(width, height, 1);
  if (maxSide <= maxWidth) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const ratio = maxWidth / maxSide;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function resolveOutputMime(sourceType, preserveAlpha) {
  if (preserveAlpha) {
    return supportsWebpExport() ? 'image/webp' : 'image/png';
  }
  return supportsWebpExport() ? 'image/webp' : 'image/jpeg';
}

function imageHasAlpha(img, width, height, sourceType = '') {
  const probe = document.createElement('canvas');
  probe.width = width;
  probe.height = height;
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  if (!ctx) return sourceType.includes('png');
  ctx.drawImage(img, 0, 0, width, height);
  try {
    const { data } = ctx.getImageData(0, 0, width, height);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) return true;
    }
  } catch {
    return sourceType.includes('png') || sourceType.includes('webp');
  }
  return false;
}

function sourceTypeFrom(img) {
  return String(img.currentSrc || img.src || '');
}

function encodeCanvas(canvas, mime, startQuality) {
  let quality = startQuality;
  let dataUrl = canvas.toDataURL(mime, quality);

  while (estimateDataUrlBytes(dataUrl) > TARGET_MAX_BYTES && quality > MIN_QUALITY) {
    quality = Math.max(MIN_QUALITY, quality - QUALITY_STEP);
    dataUrl = canvas.toDataURL(mime, quality);
  }

  if (estimateDataUrlBytes(dataUrl) > TARGET_MAX_BYTES && canvas.width > 200) {
    const scaled = document.createElement('canvas');
    scaled.width = Math.max(1, Math.round(canvas.width * 0.75));
    scaled.height = Math.max(1, Math.round(canvas.height * 0.75));
    const sctx = scaled.getContext('2d');
    if (sctx) {
      sctx.drawImage(canvas, 0, 0, scaled.width, scaled.height);
      return encodeCanvas(scaled, mime, Math.max(MIN_QUALITY, quality - 0.1));
    }
  }

  return dataUrl;
}

function canvasCompress(img, maxWidth, quality, sourceType = '') {
  const { width, height } = scaleDimensions(img.naturalWidth || img.width, img.naturalHeight || img.height, maxWidth);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas non disponibile');

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const typeHint = sourceType || sourceTypeFrom(img);
  const preserveAlpha =
    typeHint.includes('png')
    || typeHint.includes('webp')
    || imageHasAlpha(img, width, height, typeHint);

  const mime = resolveOutputMime(typeHint, preserveAlpha);
  return encodeCanvas(canvas, mime, quality);
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
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

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('Caricamento immagine fallito'));
    img.onload = () => resolve(img);
    img.src = dataUrl;
  });
}

/**
 * Comprime un'immagine lato client per miniature (~50-80 KB target).
 * @param {File|Blob} fileOrBlob
 * @param {number} [maxWidth=400]
 * @param {number} [quality=0.7]
 * @returns {Promise<string>} Data URL compressa
 */
export async function compressImage(fileOrBlob, maxWidth = 400, quality = 0.7) {
  if (!fileOrBlob) throw new Error('Nessuna immagine fornita');

  const blob = fileOrBlob instanceof Blob ? fileOrBlob : null;
  if (!blob) throw new Error('Input immagine non valido');

  const mime = String(blob.type || '');
  if (mime && !mime.startsWith('image/')) {
    throw new Error('Il file selezionato non è un\'immagine');
  }

  const dataUrl = await readBlobAsDataUrl(blob);
  const img = await loadImageFromDataUrl(dataUrl);
  return canvasCompress(img, maxWidth, quality, mime);
}

export async function compressImageFromClipboardItems(clipboardItems) {
  if (!clipboardItems?.length) return null;

  for (const item of clipboardItems) {
    const imageType = item.types.find((type) => type.startsWith('image/'));
    if (!imageType) continue;
    const blob = await item.getType(imageType);
    return compressImage(blob);
  }

  return null;
}

export function extractImageBlobFromPasteEvent(event) {
  const files = event.clipboardData?.files;
  if (files?.length) {
    for (const file of files) {
      if (file.type.startsWith('image/')) return file;
    }
  }

  const items = event.clipboardData?.items;
  if (!items) return null;

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      return item.getAsFile();
    }
  }

  return null;
}
