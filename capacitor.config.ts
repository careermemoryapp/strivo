import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ai.strivo.app',
  appName: 'Strivo',
  // This is a "live" wrapper, not a bundled static build: the app just
  // opens strivo.ai inside a native WebView. That means ordinary web
  // deploys (git pull + build + pm2 restart on the server) show up in the
  // app immediately, with no app-store resubmission needed. Only changes
  // to native config (icon, splash, permissions, this URL) require a new
  // build/submit.
  //
  // Points at /app, not the bare domain: strivo.ai's root is now a public
  // marketing page (browser visitors only) with the real app moved to
  // /app (see src/app/app/page.tsx and src/app/page.tsx). This line
  // changing is itself a native config change — needs a rebuild + Play
  // Console resubmission before real users get it, same as the other
  // pending native rebuilds already queued up.
  server: {
    url: 'https://strivo.ai/app',
    androidScheme: 'https',
  },
};

export default config;
