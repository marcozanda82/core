import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Web/Capacitor: stub finché il bundle principale resta Vite. App Expo: rimuovere alias.
      'expo-image-picker': path.resolve(__dirname, 'src/platform/stubs/expoImagePicker.stub.js'),
      'expo-file-system': path.resolve(__dirname, 'src/platform/stubs/expoFileSystem.stub.js'),
    },
  },
});
