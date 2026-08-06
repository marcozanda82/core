/**
 * Fotocamera nativa — Expo Image Picker (React Native / Expo) + fallback Capacitor.
 * Nessun <input type="file">.
 *
 * Build Vite attuale: `expo-image-picker` è aliasato a uno stub (vedi vite.config.js).
 * Su device Capacitor Android/iOS usa @capacitor/camera quando Expo non è disponibile.
 * App Expo futura: rimuovere l'alias Vite e usare il pacchetto reale expo-image-picker.
 */

let cachedImagePicker = undefined;

async function loadExpoImagePicker() {
  if (cachedImagePicker !== undefined) return cachedImagePicker;
  try {
    cachedImagePicker = await import('expo-image-picker');
  } catch (error) {
    console.warn('[expoNativeCamera] expo-image-picker non disponibile in questo runtime', error?.message);
    cachedImagePicker = null;
  }
  return cachedImagePicker;
}

async function loadCapacitorCamera() {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor?.isNativePlatform?.()) return null;
    const mod = await import('@capacitor/camera');
    return mod;
  } catch {
    return null;
  }
}

/**
 * @returns {Promise<{ granted: boolean, status?: string, canAskAgain?: boolean }>}
 */
export async function requestCameraPermissionsAsync() {
  const ImagePicker = await loadExpoImagePicker();
  if (ImagePicker?.requestCameraPermissionsAsync) {
    const result = await ImagePicker.requestCameraPermissionsAsync();
    return {
      granted: result?.granted === true || result?.status === 'granted',
      status: result?.status,
      canAskAgain: result?.canAskAgain,
    };
  }

  const CapCamera = await loadCapacitorCamera();
  if (CapCamera?.Camera?.requestPermissions) {
    const result = await CapCamera.Camera.requestPermissions({ permissions: ['camera'] });
    const cam = result?.camera ?? result?.photos;
    return {
      granted: cam === 'granted' || cam === 'limited',
      status: cam,
    };
  }

  return { granted: false, status: 'unavailable' };
}

/**
 * @param {{ quality?: number, allowsEditing?: boolean }} [options]
 * @returns {Promise<{ canceled: boolean, uri?: string | null, reason?: string }>}
 */
export async function launchCameraAsync(options = {}) {
  const ImagePicker = await loadExpoImagePicker();
  if (ImagePicker?.launchCameraAsync) {
    const mediaTypes = ImagePicker.MediaTypeOptions?.Images
      ?? ImagePicker.MediaType?.Images
      ?? 'images';
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes,
      allowsEditing: options.allowsEditing === true,
      quality: Number.isFinite(options.quality) ? options.quality : 0.85,
      exif: false,
    });
    if (result?.canceled) {
      return { canceled: true, uri: null };
    }
    const uri = result?.assets?.[0]?.uri ?? result?.uri ?? null;
    return { canceled: !uri, uri };
  }

  const CapCamera = await loadCapacitorCamera();
  if (CapCamera?.Camera?.getPhoto) {
    try {
      const photo = await CapCamera.Camera.getPhoto({
        quality: Math.round((Number(options.quality) || 0.85) * 100),
        allowEditing: options.allowsEditing === true,
        resultType: CapCamera.CameraResultType.Uri,
        source: CapCamera.CameraSource.Camera,
      });
      const uri = photo?.webPath ?? photo?.path ?? null;
      return { canceled: !uri, uri };
    } catch (error) {
      if (String(error?.message || '').toLowerCase().includes('cancel')) {
        return { canceled: true, uri: null };
      }
      return { canceled: true, uri: null, reason: error?.message || 'camera_error' };
    }
  }

  return { canceled: true, uri: null, reason: 'native_camera_unavailable' };
}
