/**
 * Stub Vite/Web — il bundle Capacitor non include il runtime Expo.
 * In app Expo/React Native, rimuovere l'alias in vite.config e usare il pacchetto reale
 * `expo-image-picker` (vedi expoNativeCamera.js).
 */
export const MediaTypeOptions = { Images: 'images' };
export const MediaType = { Images: 'images' };

export async function requestCameraPermissionsAsync() {
  return { granted: false, status: 'unavailable', canAskAgain: false };
}

export async function launchCameraAsync() {
  return { canceled: true, assets: [] };
}
