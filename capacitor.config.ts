import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.ownerslocal.app",
  appName: "OwnersLocal",
  webDir: "dist",
  plugins: {
    FirebaseAuthentication: {
      // Google OAuth in Android WebView requires the native account chooser.
      // Establish the shared JS Firebase auth session from its Google ID token.
      skipNativeAuth: true,
      providers: ["google.com"]
    }
  }
};

export default config;
