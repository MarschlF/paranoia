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
  async logout() { if (!DEMO_MODE) await fa.signOut(fbAuth); },
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
  // Ältere Demo-Daten auf Raids umstellen
  if (!local.raids) {
    local.raids = {};
    SEED_RAIDS.forEach(({ id, ...rest }) => local.raids[id] = rest);
    Object.values(local.bosses || {}).forEach(b => { b.raidId ||= SEED_RAIDS[0].id; });
    local.settings.main.currentRaid ||= SEED_RAIDS[0].id;
    saveLocal();
  }
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
    db = fs.getFirestore(fbApp);
    fbAuth = fa.getAuth(fbApp);

    // Rückkehr vom Discord-Login: #auth=<token> oder #auth_error=<code>
    const m = location.hash.match(/^#auth=(.+)$/);
    const e = location.hash.match(/^#auth_error=(.+)$/);
    const back = sessionStorage.getItem('pn-return') || '#/';
    if (m) {
      history.replaceState(null, '', location.pathname + back);
      try { await fa.signInWithCustomToken(fbAuth, decodeURIComponent(m[1])); }
      catch (err) { console.error(err); sessionStorage.setItem('pn-auth-error', 'token'); }
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
