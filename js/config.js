// ─────────────────────────────────────────────────────────────
//  Paranøia – Konfiguration
//  Solange firebase.apiKey leer ist, läuft die Seite im DEMO-MODUS
//  (Daten nur lokal im Browser, du bist automatisch Offizier).
// ─────────────────────────────────────────────────────────────

export const CONFIG = {
  // Firebase → Projekteinstellungen → Allgemein → "Deine Apps" → Web-App → Konfiguration
  firebase: {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  },

  // URL deines Cloudflare Workers (Discord-Login), z. B. "https://paranoia-auth.marschl.workers.dev"
  authWorkerUrl: "",

  // Allgemeine Infos (werden beim ersten Import als Einstellungen gespeichert)
  guild: {
    name: "Paranøia",
    realm: "EU · Todeswache",
    raidDaysText: "Di · Do",
    raiderIo: "https://raider.io/guilds/eu/todeswache/Paran%C3%B8ia"
  }
};

export const DEMO_MODE = !CONFIG.firebase.apiKey;
