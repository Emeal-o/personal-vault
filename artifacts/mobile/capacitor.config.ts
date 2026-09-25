import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.vercel.emealo.vault",
  appName: "Vault",
  // Points the native shell at your live deploy — no static export needed,
  // your API routes and server components keep working exactly as they do now.
  server: {
    url: "https://emealo.vercel.app",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    CapacitorHttp: {
      enabled: false,
    },
  },
};

export default config;
