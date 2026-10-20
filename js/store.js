// ─────────────────────────────────────────────────────────────
//  Datenschicht: Firebase (Live) oder localStorage (Demo)
//  Sammlungen: settings/main · players · raidDays · bosses · guides
// ─────────────────────────────────────────────────────────────
import { CONFIG, DEMO_MODE } from './config.js';
import { SEED_SETTINGS, SEED_PLAYERS, SEED_RAIDDAYS, SEED_BOSSES, SEED_GUIDES, SEED_RAIDS } from './seed.js';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2';
let fs = null, fa = null, db = null, fbAuth = null;

// ── Auth-Zustand (für beide Modi) ───────────────────────────
let currentUser = null;
const authListeners = new Set();
function emitAuth(u) { currentUser = u; authListeners.forEach(cb => cb(u)); }

export const auth = {
  get user() { return currentUser; },
  get isMember() { return !!currentUser?.member; },
  get isOfficer() { return !!currentUser?.officer; },
  onChange(cb) { authListeners.add(cb); cb(currentUser); return () => authListeners.delete(cb); },
  login() {
    if (DEMO_MODE) return;
    if (!CONFIG.authWorkerUrl) { alert('authWorkerUrl fehlt in js/config.js'); return; }
    sessionStorage.setItem('pn-return', location.hash || '#/');
    const back = location.origin + location.pathname;
    location.href = `${CONFIG.authWorkerUrl.replace(/\/$/, '')}/login?redirect=${encodeURIComponent(back)}`;
  },
  async logout() {
    if (DEMO_MODE) return;
    await fa.signOut(fbAuth);
    // Zwischenspeicher löschen, damit auf geteilten PCs nichts im Browser bleibt
    try { await fs.terminate(db); await fs.clearIndexedDbPersistence(db); } catch (e) { console.warn('Cache konnte nicht geleert werden', e); }
    location.reload();
  },
  /** Aktuelles Firebase-ID-Token (für geschützte Worker-Aufrufe) */
  async idToken() { return DEMO_MODE ? 'demo' : (await fbAuth.currentUser?.getIdToken()) || ''; },
  /** Nur Demo: zwischen Offizier- und Raider-Ansicht wechseln */
  setDemoRole(officer) {
    if (!DEMO_MODE) return;
    emitAuth({ uid: 'demo', name: officer ? 'Demo-Offizier' : 'Demo-Raider', avatar: '', member: true, officer });
  },
};

// ── Demo-Backend (localStorage) ─────────────────────────────
const LS_KEY = 'paranoia-demo-v1';
let local = null;
const colListeners = {};
const docListeners = {};

function loadLocal() {
  try { local = JSON.parse(localStorage.getItem(LS_KEY)); } catch { local = null; }
  if (!local) { local = seedObject(); saveLocal(); }
  if (!local.guideReads) { local.guideReads = demoReads(); saveLocal(); }
  if (!local.polls) { Object.assign(local, demoPolls()); saveLocal(); }
  if (local.settings?.main && !local.settings.main.guideTemplate) { local.settings.main.guideTemplate = structuredClone(SEED_SETTINGS.guideTemplate); saveLocal(); }
  if (local.settings?.main && local.settings.main.raidStart === undefined) { Object.assign(local.settings.main, { raidStart: SEED_SETTINGS.raidStart, raidEnd: SEED_SETTINGS.raidEnd }); saveLocal(); }
  if (!local.addons) { local.addons = demoAddons(); saveLocal(); }
  if (!local.presence) { local.presence = demoPresence(); saveLocal(); }
  if (!local.applications) { local.applications = demoApplications(); local.settings.main.recruit ||= { open: true, classes: ['Evoker', 'Priest', 'Shaman'], text: 'Vor allem Heiler und einen Augmentation-Evoker mit Mythic-Erfahrung.' }; saveLocal(); }
  if (!local.vodsDemo) { local.vodsDemo = 1; if (!Object.keys(local.vods || {}).length) local.vods = demoVods(local.settings?.main || {}); saveLocal(); }
  // Ältere Demo-Daten auf Raids umstellen
  if (!local.raids) {
    local.raids = {};
    SEED_RAIDS.forEach(({ id, ...rest }) => local.raids[id] = rest);
    Object.values(local.bosses || {}).forEach(b => { b.raidId ||= SEED_RAIDS[0].id; });
    local.settings.main.currentRaid ||= SEED_RAIDS[0].id;
    saveLocal();
  }
}
/** Beispiel-VoDs an den letzten Raidabenden (nur Demo) */
function demoVods(st) {
  const wd = st.raidWeekdays?.length ? st.raidWeekdays : [2, 4];
  const dates = [], d = new Date(); d.setDate(d.getDate() - 1);
  while (dates.length < 4) { if (wd.includes(d.getDay())) dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`); d.setDate(d.getDate() - 1); }
  const start = (date, min) => { const [h, m] = (st.raidStart || '19:45').split(':').map(Number); return new Date(new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).getTime() - min * 60e3).toISOString(); };
  const at = i => new Date(Date.now() - i * 86400e3).toISOString();
  const yt = id => `https://www.youtube.com/live/${id}`;
  return {
    v1: { date: dates[0], title: 'Mythic Prog Abend', url: yt('pnDemoVod01'), pov: 'Marschl', boss: '', note: 'Callouts in P2 nochmal anhören.', streamStart: start(dates[0], 7), streamSrc: 'youtube', marks: [{ t: 1510, label: 'Ansage Soak-Gruppen neu' }], created: at(1) },
    v2: { date: dates[0], title: 'Mythic Prog Abend', url: yt('pnDemoVod02'), pov: 'Drea', boss: '', note: '', streamStart: start(dates[0], 3), streamSrc: 'manual', marks: [], created: at(0.9) },
    v3: { date: dates[1], title: 'Mythic Prog Abend', url: yt('pnDemoVod03'), pov: 'Marschl', boss: '', note: '', streamStart: '', streamSrc: '', marks: [], created: at(4) },
    v4: { date: dates[3], title: 'Raidabend', url: yt('pnDemoVod04'), pov: 'Marschl', boss: '', note: '', streamStart: start(dates[3], 5), streamSrc: 'youtube', marks: [], created: at(9) },
  };
}
/** Beispiel-Bewerbungen (nur Demo) */
function demoApplications() {
  const t = h => new Date(Date.now() - h * 3600000).toISOString();
  return {
    a1: { char: 'Lumivoker', realm: 'Blackmoore', klasse: 'Evoker', spec: 'Augmentation', offspec: 'Preservation', discord: 'lumi.aug',
      exp: 'Letztes Tier 6/8M mit <Nachtschatten>, davor AotC und CE in Dragonflight. Augmentation seit Release.',
      why: 'Unsere Gilde löst sich auf, ich suche ein festes Mythic-Team mit 2 Raidtagen.', logs: '', allDays: true, avail: '', other: '',
      consent: true, status: 'neu', at: t(5) },
    a2: { char: 'Haldrin', realm: 'Todeswache', klasse: 'Priest', spec: 'Holy', offspec: 'Discipline', discord: 'haldrin', exp: '4/8M aktuelles Tier als Holy, 3000er M+ Score.',
      why: 'Kenne zwei Leute bei euch, habt einen guten Ruf auf dem Server.', logs: '', allDays: false, avail: 'Jeden zweiten Donnerstag erst ab 20:15', other: '',
      consent: true, status: 'pruefung', at: t(30), votes: { o1: { v: 1, name: 'Drea' } }, notes: [{ text: 'Logs passen, Gespräch am Mittwoch.', by: 'Drea', uid: 'o1', at: t(20) }] },
    a3: { char: 'Zoltrak', realm: 'Blackhand', klasse: 'Warrior', spec: 'Fury', offspec: '', discord: 'zoltrak', exp: 'Heroic clear, 2/8M.',
      why: 'Will Mythic raiden.', logs: '', allDays: true, avail: '', other: '', consent: true, status: 'abgelehnt', at: t(120) },
  };
}

/** Beispiel: ein paar Raider haben den Guide schon bestätigt (nur Demo) */
function demoReads() {
  const at = d => new Date(Date.now() - d * 3600000).toISOString();
  const o = {};
  ['Birki', 'Aleesha', 'Joul', 'Vyaness', 'Hearis', 'Linea', 'Peachqt', 'Ignizia', 'Lata', 'Marvik', 'Enya'].forEach((n, i) => {
    o['demo-' + n.toLowerCase()] = { name: n, reads: { 'entombed-sentinels': { at: at(3 + i * 5), v: 1 } } };
  });
  o['demo-drea'] = { name: 'Drea', reads: { 'entombed-sentinels': { at: at(30), v: 1 } } };   // Discord-Name ≠ Charakter → Offi ordnet zu
  return o;
}
/** Nützliches → Addons & „Neu bei uns“ (nur Demo) */
function demoAddons() {
  const at = new Date(Date.now() - 3 * 86400000).toISOString();
  return {
    bw:  { name: 'BigWigs Bossmods', cat: 'pflicht', url: 'https://www.curseforge.com/wow/addons/big-wigs', desc: 'Boss-Timer und Warnungen. Bitte **BigWigs**, nicht DBM – unsere Callouts beziehen sich auf BigWigs-Bars.', string: '', updated: at },
    rc:  { name: 'RCLootCouncil', cat: 'pflicht', url: 'https://www.curseforge.com/wow/addons/rclootcouncil', desc: 'Loot-Verteilung im Raid. Ohne Addon kein Loot.', string: '', updated: at },
    det: { name: 'Details! Damage Meter', cat: 'empfohlen', url: 'https://www.curseforge.com/wow/addons/details', desc: 'Schaden, Heilung, Tode.', string: '', updated: at },
    rio: { name: 'Raider.IO', cat: 'empfohlen', url: 'https://www.curseforge.com/wow/addons/raiderio', desc: 'M+ Score und Raid-Progress im Tooltip.', string: '', updated: at },
    plt: { name: 'Plater – Gilden-Profil', cat: 'profil', url: 'https://www.curseforge.com/wow/addons/plater-nameplates', desc: '- Wichtige Casts farbig\n- Debuffs von uns über den Nameplates', string: '!PLATER:2!' + 'DEMO'.repeat(3000), updated: at },
    det2:{ name: 'Details – Raid-Fenster', cat: 'profil', url: '', desc: 'Zwei Fenster: Schaden + Heilung, kompakt.', string: '!DETAILS:1!' + 'DEMO'.repeat(800), updated: at },
    _onboarding: { text: `> Beispieltext – Offis passen ihn oben rechts mit „Text bearbeiten“ an.

### Willkommen bei Paranøia!
Schön, dass du da bist. Hier das Wichtigste auf einen Blick.

### Raidzeiten
- **Tag & Tag**, Uhrzeit (Invite ab …)
- Abmelden bitte rechtzeitig im Discord

### Vor dem Raid
- Pflicht-Addons installiert (Liste rechts)
- Boss Guide des Abends gelesen und bestätigt
- Flasks, Food und Pots dabei

### Loot
- Verteilung über **RCLootCouncil** durch die Offis
- Kein Loot für Spieler ohne Addon

> Fragen? Schreib einfach einen Offi im Discord an.` },
  };
}
/** Online-Status (nur Demo): Zeiten relativ zu jetzt */
function demoPresence() {
  const at = m => new Date(Date.now() - m * 60000).toISOString();
  const o = { demo: { name: 'Marschl', avatar: '', at: at(0) } };
  [['Birki', 0.5], ['Joul', 1], ['Hearis', 14], ['Drea', 95], ['Aleesha', 60 * 20], ['Vyaness', 60 * 50], ['Linea', 60 * 24 * 5]]
    .forEach(([n, m]) => { o['demo-' + n.toLowerCase()] = { name: n, avatar: '', at: at(m) }; });
  return o;
}
/** Beispiel-Umfrage mit ein paar Antworten (nur Demo) */
function demoPolls() {
  const q = [
    { id: 'q1', type: 'multi', label: 'An welchen Tagen kannst du in Season 3 raiden?', options: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Sonntag'], required: true },
    { id: 'q2', type: 'single', label: 'Welche Uhrzeit passt dir am besten?', options: ['19:00–22:00', '19:30–22:30', '20:00–23:00'], required: true },
    { id: 'q3', type: 'scale', label: 'Wie zufrieden bist du mit der aktuellen Raid-Atmosphäre?', max: 5, low: 'gar nicht', high: 'sehr', required: false },
    { id: 'q4', type: 'longtext', label: 'Was sollen wir besser machen?', required: false },
  ];
  const at = h => new Date(Date.now() - h * 3600000).toISOString();
  const ans = [
    ['Birki', ['Dienstag', 'Donnerstag'], '19:30–22:30', 5, 'Passt alles!'],
    ['Joul', ['Dienstag', 'Mittwoch', 'Donnerstag'], '20:00–23:00', 4, 'Mehr Zeit für Prog-Bosse am Anfang des Abends.'],
    ['Hearis', ['Dienstag', 'Donnerstag', 'Sonntag'], '19:30–22:30', 4, ''],
    ['Lata', ['Montag', 'Donnerstag'], '19:00–22:00', 3, 'Pausen fix einplanen.'],
    ['Drea', ['Dienstag', 'Donnerstag'], '19:30–22:30', 5, ''],
  ];
  const pollAnswers = {};
  ans.forEach(([n, d, t, sc, txt], i) => {
    const uid = 'demo-' + n.toLowerCase();
    pollAnswers[`demo-poll__${uid}`] = { pollId: 'demo-poll', uid, name: n, at: at(2 + i * 7), answers: { q1: d, q2: t, q3: sc, ...(txt ? { q4: txt } : {}) } };
  });
  return {
    polls: { 'demo-poll': { title: 'Raidtage Season 3', desc: 'Wir planen die nächste Season – bitte bis Sonntag ausfüllen.', open: true, created: at(30), by: 'Marschl', questions: q } },
    pollAnswers,
  };
}
function saveLocal() { try { localStorage.setItem(LS_KEY, JSON.stringify(local)); } catch { /* voll/blockiert */ } }
function seedObject() {
  const o = { settings: { main: structuredClone(SEED_SETTINGS) }, players: {}, raidDays: {}, bosses: {}, guides: {}, raids: {} };
  SEED_RAIDS.forEach(({ id, ...rest }) => o.raids[id] = rest);
  SEED_PLAYERS.forEach((p, i) => { const { id, ...rest } = p; o.players[id] = { ...rest, order: i }; });
  SEED_RAIDDAYS.forEach(({ id, ...rest }) => o.raidDays[id] = rest);
  SEED_BOSSES.forEach(({ id, ...rest }) => o.bosses[id] = rest);
  SEED_GUIDES.forEach(({ id, ...rest }) => o.guides[id] = rest);
  return o;
}
function colArray(name) { return Object.entries(local[name] || {}).map(([id, v]) => ({ id, ...structuredClone(v) })); }
function emitLocal(name, id) {
  saveLocal();
  (colListeners[name] || new Set()).forEach(cb => cb(colArray(name)));
  const k = `${name}/${id}`;
  (docListeners[k] || new Set()).forEach(cb => cb(local[name]?.[id] ? { id, ...structuredClone(local[name][id]) } : null));
}

// ── Öffentliche API ─────────────────────────────────────────
export const store = {
  demo: DEMO_MODE,

  async init() {
    if (DEMO_MODE) {
      loadLocal();
      emitAuth({ uid: 'demo', name: 'Demo-Offizier', avatar: '', member: true, officer: true });
      return;
    }
    const [app, firestore, authMod] = await Promise.all([
      import(`${FB}/firebase-app.js`), import(`${FB}/firebase-firestore.js`), import(`${FB}/firebase-auth.js`),
    ]);
    fs = firestore; fa = authMod;
    const fbApp = app.initializeApp(CONFIG.firebase);
    // Zwischenspeicher im Browser: Seitenwechsel laden nur noch Geändertes (spart Firebase-Kontingent, schneller)
    try { db = fs.initializeFirestore(fbApp, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) }); }
    catch (e) { console.warn('Firestore-Cache nicht verfügbar', e); db = fs.getFirestore(fbApp); }
    fbAuth = fa.getAuth(fbApp);

    // Rückkehr vom Discord-Login: #auth=<token> oder #auth_error=<code>
    const m = location.hash.match(/^#auth=(.+)$/);
    const e = location.hash.match(/^#auth_error=(.+)$/);
    const back = sessionStorage.getItem('pn-return') || '#/';
    if (m) {
      history.replaceState(null, '', location.pathname + back);
      try { await fa.signInWithCustomToken(fbAuth, decodeURIComponent(m[1])); }
      catch (err) { console.error(err); sessionStorage.setItem('pn-auth-error', `firebase:${err.code || err.message || 'unbekannt'}`); }
    } else if (e) {
      sessionStorage.setItem('pn-auth-error', decodeURIComponent(e[1]));
      history.replaceState(null, '', location.pathname + back);
    }

    await new Promise(resolve => {
      let first = true;
      fa.onAuthStateChanged(fbAuth, async (u) => {
        if (!u) emitAuth(null);
        else {
          const { claims } = await u.getIdTokenResult();
          emitAuth({ uid: u.uid, name: claims.name || 'Discord', avatar: claims.avatar || '', member: !!claims.member, officer: !!claims.officer });
        }
        if (first) { first = false; resolve(); }
      });
    });
  },

  watchCol(name, cb, onError) {
    if (DEMO_MODE) {
      (colListeners[name] ||= new Set()).add(cb);
      cb(colArray(name));
      return () => colListeners[name].delete(cb);
    }
    return fs.onSnapshot(fs.collection(db, name),
      snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => { console.error(name, err); onError?.(err); });
  },

  watchDoc(name, id, cb, onError) {
    if (DEMO_MODE) {
      const k = `${name}/${id}`;
      (docListeners[k] ||= new Set()).add(cb);
      cb(local[name]?.[id] ? { id, ...structuredClone(local[name][id]) } : null);
      return () => docListeners[k].delete(cb);
    }
    return fs.onSnapshot(fs.doc(db, name, id),
      snap => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      err => { console.error(name, id, err); onError?.(err); });
  },

  /** Dokument anlegen/überschreiben (merge) */
  async set(name, id, data) {
    if (DEMO_MODE) {
      local[name] ||= {};
      local[name][id] = { ...(local[name][id] || {}), ...structuredClone(data) };
      return emitLocal(name, id);
    }
    await fs.setDoc(fs.doc(db, name, id), data, { merge: true });
  },

  async add(name, data) {
    if (DEMO_MODE) {
      const id = Math.random().toString(36).slice(2, 10);
      await this.set(name, id, data); return id;
    }
    const ref = await fs.addDoc(fs.collection(db, name), data);
    return ref.id;
  },

  async remove(name, id) {
    if (DEMO_MODE) { delete local[name]?.[id]; return emitLocal(name, id); }
    await fs.deleteDoc(fs.doc(db, name, id));
  },

  /** Einzelnes Feld in einer Map setzen, z. B. raidDays/2026-08-20 → att.<playerId>; null = löschen */
  async setMapField(name, id, mapKey, subKey, value) {
    if (DEMO_MODE) {
      local[name] ||= {};
      const d = (local[name][id] ||= {});
      d[mapKey] ||= {};
      if (value === null || value === undefined) delete d[mapKey][subKey]; else d[mapKey][subKey] = value;
      return emitLocal(name, id);
    }
    await fs.setDoc(fs.doc(db, name, id),
      { [mapKey]: { [subKey]: (value === null || value === undefined) ? fs.deleteField() : value } },
      { merge: true });
  },

  /** Startdaten in Firestore schreiben (nur Offiziere, wenn noch leer) */
  async importSeed() {
    if (DEMO_MODE) { local = seedObject(); ['settings', 'players', 'raidDays', 'bosses', 'guides', 'raids'].forEach(n => emitLocal(n, 'main')); return; }
    const batch = fs.writeBatch(db);
    batch.set(fs.doc(db, 'settings', 'main'), SEED_SETTINGS, { merge: true });
    SEED_PLAYERS.forEach((p, i) => { const { id, ...rest } = p; batch.set(fs.doc(db, 'players', id), { ...rest, order: i }); });
    SEED_RAIDDAYS.forEach(({ id, ...rest }) => batch.set(fs.doc(db, 'raidDays', id), rest, { merge: true }));
    SEED_BOSSES.forEach(({ id, ...rest }) => batch.set(fs.doc(db, 'bosses', id), rest));
    SEED_GUIDES.forEach(({ id, ...rest }) => batch.set(fs.doc(db, 'guides', id), rest));
    SEED_RAIDS.forEach(({ id, ...rest }) => batch.set(fs.doc(db, 'raids', id), rest));
    await batch.commit();
  },

  /** Demo zurücksetzen */
  resetDemo() { if (DEMO_MODE) { localStorage.removeItem(LS_KEY); location.reload(); } },
};
