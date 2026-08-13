import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ai.strivo.app',
  appName: 'Strivo',
  // This is a "live" wrapper, not a bundled static build: the app just
  // opens strivo.ai inside a native WebView. That means ordinary web
  // deploys (git pull + build + pm2 restart on the server) show up in the
  // app immediately, with no app-store resubmission needed. Only changes
  // to native config (icon, splash, permissions) require a new build/submit.
  server: {
    url: 'https://strivo.ai',
    androidScheme: 'https',
  },
};

export default config;
