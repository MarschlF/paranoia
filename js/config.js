// ─────────────────────────────────────────────────────────────
//  Paranøia – Konfiguration
//  Solange firebase.apiKey leer ist, läuft die Seite im DEMO-MODUS
//  (Daten nur lokal im Browser, du bist automatisch Offizier).
// ─────────────────────────────────────────────────────────────

export const CONFIG = {
  // Firebase → Projekteinstellungen → Allgemein → "Deine Apps" → Web-App → Konfiguration
  firebase: {
    apiKey: "AIzaSyAa34jCvGg5pTASimeOOJTG-6eTBytiPKE",
    authDomain: "paranoiaguild.firebaseapp.com",
    projectId: "paranoiaguild",
    storageBucket: "paranoiaguild.firebasestorage.app",
    messagingSenderId: "1003579099322",
    appId: "1:1003579099322:web:c1a08fbbb2a5699344da83"
  },

  // URL deines Cloudflare Workers (Discord-Login), z. B. "https://paranoia-auth.marschl.workers.dev"
  authWorkerUrl: "https://paranoia-auth.marschl.workers.dev",

  // Allgemeine Infos (werden beim ersten Import als Einstellungen gespeichert)
  guild: {
    name: "Paranøia",
    realm: "EU · Todeswache",
    raidDaysText: "Di · Do",
    raiderIo: "https://raider.io/guilds/eu/todeswache/Paran%C3%B8ia"
  }
};

export const DEMO_MODE = !CONFIG.firebase.apiKey;
