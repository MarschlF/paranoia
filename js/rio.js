// ─────────────────────────────────────────────────────────────
//  Raider.IO – Gear, Itemlevel, M+ Score und Raid-Progress pro Spieler
//  Läuft über den Worker (/rio), der jede Abfrage 30 Min. zwischenspeichert.
// ─────────────────────────────────────────────────────────────
import { CONFIG, DEMO_MODE } from './config.js';

export const DEFAULT_REALM = 'Todeswache';

/** Charaktername + Realm eines Spielers (Charname weicht ggf. vom Anzeigenamen ab) */
export function charOf(p) {
  return { name: String(p.charName || p.name || '').trim(), realm: String(p.realm || DEFAULT_REALM).trim() };
}
/** Raider.IO-Realm-Slug: "Der Rat von Dalaran" → "der-rat-von-dalaran" */
export const realmSlug = r => String(r || DEFAULT_REALM).trim().toLowerCase().replace(/['’]/g, '').replace(/\s+/g, '-');
export const charKey = p => { const c = charOf(p); return `${realmSlug(c.realm)}/${c.name.toLowerCase()}`; };

let cache = { key: '', at: 0, promise: null };

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
        return { configured: true, updated: ok.map(x => x.updated).sort()[0], chars: Object.assign({}, ...ok.map(x => x.chars || {})) };
      });
  }
  cache = { key, at: Date.now(), promise: p };
  return p;
}

// ── Beispieldaten für den Demo-Modus ────────────────────────
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
    }));
    const ilvl = Math.round(items.reduce((a, i) => a + i.ilvl, 0) / items.length * 10) / 10;
    const kills = Math.floor(r() * 5);
    chars[charKey(pl)] = {
      name: charOf(pl).name,
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
