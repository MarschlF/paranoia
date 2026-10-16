// ─────────────────────────────────────────────────────────────
//  Spieler-Vergleich – Daten aus Warcraft Logs über den Worker
// ─────────────────────────────────────────────────────────────
import { CONFIG, DEMO_MODE } from './config.js';

const mem = new Map();

/** → { configured, players: { <name>: {...} | { error } } } | null */
export function getCompare({ enc, diff, since, a, b }) {
  const key = [enc, diff, since, a, b].join('|');
  if (mem.has(key)) return mem.get(key);
  let p;
  if (DEMO_MODE) p = new Promise(r => setTimeout(() => r(demo({ enc, a, b })), 300));
  else if (!CONFIG.authWorkerUrl) p = Promise.resolve(null);
  else {
    const q = new URLSearchParams({ enc, diff, since, a });
    if (b) q.set('b', b);
    p = fetch(`${CONFIG.authWorkerUrl.replace(/\/$/, '')}/wcl/compare?${q}`).then(r => r.ok ? r.json() : null).catch(() => null);
  }
  p.then(v => { if (!v) mem.delete(key); });
  mem.set(key, p);
  return p;
}

// ── Demo ─────────────────────────────────────────────────────
function rnd(seed) { let x = 0; for (const c of seed) x = (x * 31 + c.charCodeAt(0)) >>> 0; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const ICONS = { head: 'inv_helmet_03', neck: 'inv_jewelry_necklace_07', shoulder: 'inv_shoulder_02', back: 'inv_misc_cape_11', chest: 'inv_chest_plate16',
  waist: 'inv_belt_13', wrist: 'inv_bracer_07', hands: 'inv_gauntlets_04', legs: 'inv_pants_03', feet: 'inv_boots_05', finger1: 'inv_jewelry_ring_03',
  finger2: 'inv_jewelry_ring_03', trinket1: 'inv_121_trinket_raid_ulatek_fang_purple', trinket2: 'inv_archaeology_orcclans_crackedidol', mainhand: 'inv_sword_04' };
const TRINKETS = { trinket1: [270161, 270163, 270165], trinket2: [270169, 270170, 270166] };
function demo({ enc, a, b }) {
  enc = Number(enc);
  const players = {};
  const shared = rnd(String(enc))() > .3;
  [a, b].filter(Boolean).forEach((n, idx) => {
    const r = rnd(n + enc);
    const lvl = 272 + Math.round(r() * 9);
    players[n] = {
      name: n, cls: '', spec: '',
      fight: { code: 'Demo', id: 7, date: '2026-10-13', kill: enc !== 4, pct: enc === 4 ? (shared ? 18.4 : 18.4 + idx * 6.1) : null, secs: 312 },
      together: shared,
      dps: Math.round(850000 + r() * 350000), hps: Math.round(650000 + r() * 250000),
      parse: enc !== 4 ? { pct: Math.round(35 + r() * 64) } : null,
      stats: { agility: Math.round(88000 + r() * 9000), intellect: Math.round(88000 + r() * 9000), strength: 0, critMelee: Math.round(6000 + r() * 6000), critSpell: 0,
        hasteMelee: Math.round(7000 + r() * 6000), mastery: Math.round(9000 + r() * 8000), versatilityDamageDone: Math.round(3000 + r() * 4000), leech: Math.round(r() * 1200) },
      gear: Object.keys(ICONS).map(slot => ({
        slot, id: TRINKETS[slot] ? TRINKETS[slot][Math.floor(r() * 3)] : 0, ilvl: lvl + Math.round((r() - .5) * 10), icon: ICONS[slot], q: 4,
        bonus: [], gemIds: [], ench: ['chest', 'feet', 'finger1', 'finger2', 'mainhand', 'head', 'shoulder'].includes(slot) && r() > .15 ? 1 : 0,
      })),
      talents: Array.from({ length: 30 }, (_, i) => `${i + 1}:${i % 7 === idx + 2 && r() > .3 ? 2 : 1}`),
      url: 'https://www.warcraftlogs.com',
      demo: true,
    };
  });
  return { configured: true, demo: true, players };
}
