import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.veridian.app',
  appName: 'Veridian Companion',
  webDir: 'dist',
  // http scheme + cleartext lets the WebView call the PC's LAN server over
  // http:// without mixed-content blocking. The companion is a viewer/remote;
  // it talks to the desktop server baked in via VITE_API_BASE at build time.
  server: { androidScheme: 'http', cleartext: true },
  android: { allowMixedContent: true }
};

export default config;
