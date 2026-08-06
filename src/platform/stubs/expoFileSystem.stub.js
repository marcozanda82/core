/** Stub Vite/Web — FileSystem Expo non disponibile nel bundle Capacitor/Vite. */
export const EncodingType = { Base64: 'base64', UTF8: 'utf8' };

export async function readAsStringAsync() {
  throw new Error('expo-file-system unavailable in web build');
}
