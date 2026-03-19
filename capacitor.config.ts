import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bastyon.chat',
  appName: 'Bastyon Chat',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
  },
};

export default config;
