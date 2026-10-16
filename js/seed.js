// ─────────────────────────────────────────────────────────────
//  Startdaten – übernommen aus "Paranoia (Leitung).xlsx"
//  Wird beim ersten Start (Demo) bzw. per Button "Startdaten importieren" geladen.
// ─────────────────────────────────────────────────────────────

export const SEED_RAIDS = [
  { id: 'venomous-abyss', name: 'The Venomous Abyss', season: 'Season 2', order: 2 },
];

export const SEED_SETTINGS = {
  guideTemplate: {
    overview: '### Setup\n- Tanks · Heiler · DPS: \n- Bloodlust: \n\n### Grundregeln\n- \n\n### Häufigste Fehler\n- ',
    tanks: '### Swap\n- \n\n### Positionierung\n- ',
    healer: '### Schadensspitzen\n- \n\n### Dispels\n- ',
    dps: '### Prioritäten\n- \n\n### Kicks / Adds\n- ',
    intermission: '',
  },
  currentRaid: 'venomous-abyss',
  raidName: 'The Venomous Abyss',
  season: 'Season 2',
  startDate: '2026-08-20',
  endDate: '2027-02-02',
  raidWeekdays: [2, 4],      // 2 = Dienstag, 4 = Donnerstag
  raidStart: '19:45',
  raidEnd: '23:00',
  extraDays: [],
  skipDays: [],
  links: [
    { icon: '🩸', name: 'Bloodmallet',   desc: 'Trinket- & Item-Rankings pro Spec', url: 'https://bloodmallet.com' },
    { icon: '🤖', name: 'Raidbots',      desc: 'Droptimizer & Sims für deinen Char', url: 'https://www.raidbots.com' },
    { icon: '📈', name: 'Warcraft Logs', desc: 'Logs & Performance-Analyse', url: 'https://www.warcraftlogs.com' },
    { icon: '💀', name: 'Wipefest',      desc: 'Wipe-Analyse aus WCL-Logs', url: 'https://www.wipefest.gg' },
    { icon: '📊', name: 'Raider.IO',     desc: 'Gildenprofil & M+ Scores', url: 'https://raider.io/guilds/eu/todeswache/Paran%C3%B8ia' },
    { icon: '📖', name: 'Method Guides', desc: 'Boss-Guides (EN)', url: 'https://www.method.gg/guides' },
    { icon: '❄️', name: 'Icy Veins',     desc: 'Spec-Guides & BiS-Listen', url: 'https://www.icy-veins.com/wow/' },
    { icon: '🗺️', name: 'Raidplan.io',   desc: 'Raidpläne erstellen & teilen', url: 'https://raidplan.io' },
  ],
};

export const SEED_PLAYERS = [
  {"id": "birki", "name": "Birki", "klasse": "DK", "spec": "Blood", "rolle": "Tank", "status": "Core", "active": true},
  {"id": "aleesha", "name": "Aleesha", "klasse": "Paladin", "spec": "Protection", "rolle": "Tank", "status": "Core", "active": true},
  {"id": "dazan", "name": "Dazan", "klasse": "Hunter", "spec": "Beast Mastery", "rolle": "rDD", "status": "Core", "active": true},
  {"id": "dreapal", "name": "Dreapal", "klasse": "Monk", "spec": "Mistweaver", "rolle": "Healer", "status": "Core", "active": true},
  {"id": "joul", "name": "Joul", "klasse": "Shaman", "spec": "Restoration", "rolle": "Healer", "status": "Core", "active": true},
  {"id": "vyaness", "name": "Vyaness", "klasse": "Priest", "spec": "Holy", "rolle": "Healer", "status": "Core", "active": true},
  {"id": "peachqt", "name": "Peachqt", "klasse": "DK", "spec": "Unholy", "rolle": "mDD", "status": "Core", "active": true},
  {"id": "hearis", "name": "Hearis", "klasse": "DH", "spec": "Havoc", "rolle": "mDD", "status": "Core", "active": true},
  {"id": "linea", "name": "Linea", "klasse": "Paladin", "spec": "Retribution", "rolle": "mDD", "status": "Core", "active": true},
  {"id": "sorobron", "name": "Sorobron", "klasse": "Warlock", "spec": "Affliction", "rolle": "rDD", "status": "Core", "active": true},
  {"id": "nacho", "name": "Nacho", "klasse": "Evoker", "spec": "Preservation", "rolle": "Healer", "status": "Core", "active": true},
  {"id": "momo", "name": "Momo", "klasse": "Mage", "spec": "Frost", "rolle": "rDD", "status": "Core", "active": true},
  {"id": "ignizia", "name": "Ignizia", "klasse": "Mage", "spec": "Arcane", "rolle": "rDD", "status": "Core", "active": true},
  {"id": "marvik", "name": "Marvik", "klasse": "Shaman", "spec": "Elemental", "rolle": "rDD", "status": "Core", "active": true},
  {"id": "enya", "name": "Enya", "klasse": "Druid", "spec": "Feral", "rolle": "mDD", "status": "Core", "active": true},
  {"id": "lata", "name": "Lata", "klasse": "Warlock", "spec": "Affliction", "rolle": "rDD", "status": "Core", "active": true},
  {"id": "mario", "name": "Mario", "klasse": "Warrior", "spec": "Arms", "rolle": "mDD", "status": "Rotation", "active": true},
  {"id": "hakeda", "name": "Hakeda", "klasse": "Rogue", "spec": "Subtlety", "rolle": "mDD", "status": "Rotation", "active": true},
  {"id": "anakim", "name": "Anakim", "klasse": "Hunter", "spec": "Beast Mastery", "rolle": "rDD", "status": "Rotation", "active": true},
  {"id": "strawanza", "name": "Strawanza", "klasse": "Shaman", "spec": "Enhancement", "rolle": "mDD", "status": "Rotation", "active": true},
  {"id": "laathi", "name": "Laathi", "klasse": "Hunter", "spec": "Marksmanship", "rolle": "rDD", "status": "Rotation", "active": true},
  {"id": "clealacy", "name": "Clealacy", "klasse": "DH", "spec": "Havoc", "rolle": "mDD", "status": "Rotation", "active": true},
  {"id": "baguette", "name": "Baguette", "klasse": "Priest", "spec": "Shadow", "rolle": "rDD", "status": "Rotation", "active": true},
  {"id": "garax", "name": "Garax", "klasse": "DH", "spec": "Havoc", "rolle": "rDD", "status": "Heroic", "active": true},
  {"id": "pridefox", "name": "Pridefox", "klasse": "Rogue", "spec": "Subtlety", "rolle": "mDD", "status": "Heroic", "active": true},
  {"id": "haphazard", "name": "Haphazard", "klasse": "Warrior", "spec": "Arms", "rolle": "mDD", "status": "Rotation", "active": true},
  {"id": "nexow", "name": "Nexow", "klasse": "DH", "spec": "Havoc", "rolle": "mDD", "status": "Rotation", "active": true},
  {"id": "kragy", "name": "Kragy", "klasse": "DK", "spec": "Unholy", "rolle": "mDD", "status": "Rotation", "active": true}
];

// Loot vom ersten Raidtag (20.08.2026) aus dem Loot Tracker
export const SEED_RAIDDAYS = [
  { id: '2026-08-20', att: {}, loot: {"aleesha": 3, "dazan": 3, "dreapal": 5, "peachqt": 2, "hearis": 1, "linea": 2, "sorobron": 2, "nacho": 1, "momo": 1, "ignizia": 4, "marvik": 1, "enya": 3, "lata": 4, "hakeda": 3, "strawanza": 2, "laathi": 3, "clealacy": 1, "baguette": 3, "haphazard": 2, "nexow": 4, "kragy": 2} },
];

// Bossnamen & Reihenfolge bitte im Progress-Tab prüfen/anpassen
export const SEED_BOSSES = [
  { raidId: 'venomous-abyss', id: 'entombed-sentinels', order: 1, name: 'Entombed Sentinels',  status: 'open' },
  { raidId: 'venomous-abyss', id: 'vashnik',            order: 2, name: 'Vashnik the Malignant', status: 'open' },
  { raidId: 'venomous-abyss', id: 'lost-explorers',     order: 3, name: 'The Lost Explorers',  status: 'open' },
  { raidId: 'venomous-abyss', id: 'sszorak',            order: 4, name: 'Sszorak',             status: 'open' },
  { raidId: 'venomous-abyss', id: 'twin-fangs',         order: 5, name: 'The Twin Fangs',      status: 'open' },
  { raidId: 'venomous-abyss', id: 'nymrissa',           order: 6, name: 'Nymrissa Wavecaller', status: 'open' },
  { raidId: 'venomous-abyss', id: 'coiled-altar',       order: 7, name: 'The Coiled Altar',    status: 'open' },
  { raidId: 'venomous-abyss', id: 'ulatek',             order: 8, name: "Ula'tek",             status: 'open' },
];

export const SEED_GUIDES = [
  {
    id: 'entombed-sentinels',
    planUrl: '',
    videoUrl: '',
    sourceUrl: 'https://www.method.gg/guides/the-venomous-abyss/entombed-sentinels-heroic',
    sections: {
      overview: `### Setup
- 2 Tanks · 4 Heiler · 14 DPS
- Bloodlust: Pull

### Grundregeln
- Beide Golems **immer mindestens 40 m** auseinander halten – sonst 99 % Schadensreduktion
- HP beider Golems gleichmäßig halten – bei Vitriolic Stasis wird der schwächere auf den stärkeren hochgeheilt
- Zwei gleich große Gruppen, jede kämpft gegen einen Golem
- In jeder Intermission **Seite und Tanks wechseln** (DoT-Stacks fallen ab)

> Kein Padding: gleichmäßiger Schaden auf beiden Seiten ist Pflicht.`,
      tanks: `### Grüner Golem – Empowering Slam
- +15 % phys. Schaden pro Slam auf dasselbe Ziel
- Swap passiert beim Seitenwechsel in der Intermission

### Roter Golem – Bloodvenom Injection
- Stapelbarer Shadow-DoT, beim Ablaufen entsteht eine **große Pfütze**
- Vor Ablauf an den Rand laufen, Stacks nicht zu hoch werden lassen`,
      healer: `### Blighted Blood (roter Golem)
- Dispelbarer DoT – Dispel löst **Blood Venom** (Pfütze) aus
- Betroffene zuerst an den Rand schicken, **dann** dispellen

### Mark of Acid / Mark of Blood
- Stapelnder Raid-DoT, Stacks fallen nur beim Seitenwechsel ab – Cooldowns gegen Ende der Phase planen`,
      dps: `### Grüner Golem
- **Toxic Droplets** aufsammeln (1–2 pro Spieler), sonst Raidschaden nach 16 Sek.
- **Venom Coagulation** (Add) sofort töten – höchste Priorität
- **Living Venom**: Linien kommen zum Boss zurück – Hin- und Rückweg meiden

### Roter Golem
- Gruppe in eine Ecke stellen, Pfützen am Rand ablegen
- **Unstable Miasma**: stacken zum Teilen, danach verteilen`,
      intermission: `### Vitriolic Stasis (100 Energie)
- Beide Golems treffen sich in der Mitte, 30 Sek. 99 % Schadensreduktion

### Helical Toxins
- Jeder bekommt 4 Orbs (rot + grün)
- Genau **einen** Partner berühren: zusammen müssen es **exakt 4 grüne** Orbs sein
- 1 grün → Partner mit 3 grün · 2 grün → Partner mit 2 grün
- Gruppen und Treffpunkte **vor dem Pull** festlegen

### Cultivated Burst
- Falsche Paarung = tödliche Explosion + Pfütze
- Strafecke festlegen, Immunities können überleben`,
    },
  },
];
