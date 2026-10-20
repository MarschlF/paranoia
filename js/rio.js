// ─────────────────────────────────────────────────────────────
//  Raider.IO – Gear, Itemlevel, M+ Score und Raid-Progress pro Spieler
//  Läuft über den Worker (/rio), der jede Abfrage 30 Min. zwischenspeichert.
// ─────────────────────────────────────────────────────────────
import { CONFIG, DEMO_MODE } from './config.js';
import { CLASSES } from './ui.js';

export const DEFAULT_REALM = 'Todeswache';

/** Charaktername + Realm eines Spielers (Charname weicht ggf. vom Anzeigenamen ab) */
export function charOf(p) {
  return { name: String(p.charName || p.name || '').trim(), realm: String(p.realm || '').trim() };   // leerer Realm = automatisch
}
/** Raider.IO-Realm-Slug: "Der Rat von Dalaran" → "der-rat-von-dalaran" */
export const realmSlug = r => String(r || DEFAULT_REALM).trim().toLowerCase().replace(/['’]/g, '').replace(/\s+/g, '-');
/** Ohne Realm: "auto/<name>.<klasse>" – der Worker sucht den Realm (Gildenliste, sonst Raider.IO-Suche mit passender Klasse) */
const clsHint = p => String(CLASSES[p.klasse]?.name || '').toLowerCase().replace(/[^a-z]/g, '');
export const charKey = p => {
  const c = charOf(p);
  if (c.realm) return `${realmSlug(c.realm)}/${c.name.toLowerCase()}`;
  const h = clsHint(p);
  return `auto/${c.name.toLowerCase()}${h ? '.' + h : ''}`;
};

let cache = { key: '', at: 0, promise: null };
const IGNORE_SLOTS = ['shirt', 'tabard'];

/** → { configured, updated, chars: { 'realm/name': {...} | { error } } } oder null */
export function getRio(players, { force = false } = {}) {
  const keys = [...new Set(players.map(charKey))].sort();
  const key = keys.join(',');
  if (!force && cache.key === key && Date.now() - cache.at < 5 * 60000) return cache.promise;

  let p;
  if (DEMO_MODE) p = new Promise(r => setTimeout(() => r(demoData(players)), 350));
  else if (!CONFIG.authWorkerUrl) p = Promise.resolve(null);
  else {
    const base = CONFIG.authWorkerUrl.replace(/\/$/, '');
    // in Paketen zu 40 Charakteren abfragen
    const chunks = [];
    for (let i = 0; i < keys.length; i += 40) chunks.push(keys.slice(i, i + 40));
    p = Promise.all(chunks.map(c => fetch(`${base}/rio?c=${encodeURIComponent(c.join(','))}`).then(r => r.ok ? r.json() : null).catch(() => null)))
      .then(parts => {
        const ok = parts.filter(Boolean);
        if (!ok.length) return null;
        const chars = Object.assign({}, ...ok.map(x => x.chars || {}));
        for (const c of Object.values(chars)) if (Array.isArray(c?.items)) c.items = c.items.filter(i => !IGNORE_SLOTS.includes(i.slot));   // Hemd/Wappenrock zählen nicht
        return { configured: true, updated: ok.map(x => x.updated).sort()[0], chars };
      });
  }
  cache = { key, at: Date.now(), promise: p };
  return p;
}

// ── Beispieldaten für den Demo-Modus ────────────────────────
const DEMO_ICONS = { head: 'inv_helmet_03', neck: 'inv_jewelry_necklace_07', shoulder: 'inv_shoulder_02', back: 'inv_misc_cape_11', chest: 'inv_chest_plate16',
  waist: 'inv_belt_13', wrist: 'inv_bracer_07', hands: 'inv_gauntlets_04', legs: 'inv_pants_03', feet: 'inv_boots_05', finger1: 'inv_jewelry_ring_03',
  finger2: 'inv_jewelry_ring_03', mainhand: 'inv_sword_04', offhand: 'inv_shield_06' };
const DEMO_TRINKETS = [[270161, 'inv_121_trinket_raid_ulatek_fang_purple'], [270163, 'inv_121_trinket_raid_ulatek_ulatekclaw'], [270165, 'inv_121_trinket_raid_ulatek_golemhearts_green'], [270169, 'inv_archaeology_orcclans_crackedidol']];
const SLOTS = ['head', 'neck', 'shoulder', 'back', 'chest', 'waist', 'wrist', 'hands', 'legs', 'feet', 'finger1', 'finger2', 'trinket1', 'trinket2', 'mainhand', 'offhand'];
function rnd(seed) { let x = 0; for (const c of seed) x = (x * 31 + c.charCodeAt(0)) >>> 0; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

function demoData(players) {
  const chars = {};
  for (const pl of players) {
    const r = rnd(pl.id || pl.name);
    const base = 268 + Math.round(r() * 14);
    const items = SLOTS.filter(s => s !== 'offhand' || r() > .5).map(slot => ({
      slot,
      ilvl: base + Math.round((r() - .55) * 12),
      name: '',
      enchant: r() > .12,
      gems: 0,
      icon: DEMO_ICONS[slot] || '',
      q: 4,
    })).map(it => {
      if (!it.slot.startsWith('trinket')) return it;
      const [id, icon] = DEMO_TRINKETS[Math.floor(r() * DEMO_TRINKETS.length)];
      return { ...it, id, icon };
    });
    const ilvl = Math.round(items.reduce((a, i) => a + i.ilvl, 0) / items.length * 10) / 10;
    const kills = Math.floor(r() * 5);
    chars[charKey(pl)] = {
      name: charOf(pl).name,
      realm: charOf(pl).realm || DEFAULT_REALM,
      ilvl,
      score: Math.round(1800 + r() * 1500),
      raid: { 'the-venomous-abyss': `${kills}/8 M`, 'liberation-of-undermine': '8/8 M' },
      items,
      url: 'https://raider.io',
      crawled: new Date(Date.now() - r() * 4 * 86400000).toISOString(),
      demo: true,
    };
  }
  // Ein Charakter wird "nicht gefunden" – so sieht man, wie das aussieht
  const miss = players.find(p => p.id === 'momo');
  if (miss) chars[charKey(miss)] = { error: 'not_found' };
  return { configured: true, demo: true, updated: new Date().toISOString(), chars };
}
