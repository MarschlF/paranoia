// ─────────────────────────────────────────────────────────────
//  Defensive- & Consumable-Check (Warcraft Logs)
//  Fähigkeiten-Listen liegen in settings/checks und sind für Offis editierbar.
//  Einträge: englischer Fähigkeitsname (wie in WCL) oder Spell-ID.
// ─────────────────────────────────────────────────────────────
import { CONFIG, DEMO_MODE } from './config.js';

export const CHECK_GROUPS = [
  { key: 'def', label: 'Defensives', short: 'Def', perPull: true,
    hint: 'Persönliche Defensives – zählt jede Nutzung',
    entries: [
      'Anti-Magic Shell', 'Icebound Fortitude', 'Blur', 'Netherwalk', 'Barkskin', 'Survival Instincts',
      'Obsidian Scales', 'Renewing Blaze', 'Aspect of the Turtle', 'Exhilaration', 'Survival of the Fittest',
      'Ice Block', 'Ice Cold', 'Greater Invisibility', 'Mirror Image', 'Fortifying Brew', 'Diffuse Magic',
      'Dampen Harm', 'Divine Shield', 'Divine Protection', 'Shield of Vengeance', 'Desperate Prayer',
      'Dispersion', 'Fade', 'Cloak of Shadows', 'Evasion', 'Feint', 'Crimson Vial', 'Astral Shift',
      'Unending Resolve', 'Dark Pact', 'Die by the Sword', 'Enraged Regeneration', 'Spell Reflection',
    ] },
  { key: 'hs', label: 'Healthstone', short: 'HS', entries: ['Healthstone', 'Demonic Healthstone'] },
  { key: 'heal', label: 'Heiltrank', short: 'Heiltr.', entries: ['Silvermoon Health Potion', 'Concentrated Silvermoon Health Potion', 'Refreshing Serum', 'Amani Extract'] },
  { key: 'dps', label: 'DPS-Trank', short: 'DPS-Tr.', perPull: true,
    entries: ["Light's Potential", 'Potion of Recklessness', 'Potion of Zealotry', 'Draught of Rampant Abandon', 'Alluring Nostrum', 'Liquid Luster'] },
];

/** Gruppen mit den gespeicherten Listen aus settings/checks überschreiben */
export function groupsFrom(checksDoc) {
  return CHECK_GROUPS.map(g => ({ ...g, entries: Array.isArray(checksDoc?.[g.key]) ? checksDoc[g.key] : g.entries }));
}
export const allEntries = groups => [...new Set(groups.flatMap(g => g.entries))];

/** Casts eines Spielers einer Gruppe zuordnen → { total, by: {Name: n} } */
export function groupCount(player, abilities, group) {
  const want = new Set(group.entries.map(e => e.toLowerCase()));
  let total = 0; const by = {};
  for (const [id, n] of Object.entries(player.casts || {})) {
    const name = abilities?.[id] || id;
    if (want.has(String(id)) || want.has(String(name).toLowerCase())) { total += n; by[name] = (by[name] || 0) + n; }
  }
  return { total, by };
}

const DIFF_NUM = { Normal: 3, Heroic: 4, Mythic: 5 };
const mem = new Map();

/** Check für einen Report laden → Ergebnis des Workers (oder Demo) */
export function getCheck(report, groups, diffLabel) {
  const a = allEntries(groups);
  const diff = DIFF_NUM[diffLabel] || 5;
  const key = `${report.code}|${diff}|${a.join(',')}`;
  if (mem.has(key)) return mem.get(key);
  let p;
  if (DEMO_MODE || report.demo) p = new Promise(r => setTimeout(() => r(demoCheck(report, groups, diffLabel)), 120));
  else if (!CONFIG.authWorkerUrl) p = Promise.resolve(null);
  else p = fetch(`${CONFIG.authWorkerUrl.replace(/\/$/, '')}/wcl/check?code=${encodeURIComponent(report.code)}&diff=${diff}&a=${encodeURIComponent(a.join(','))}`)
    .then(r => r.ok ? r.json() : null).catch(() => null);
  p.then(v => { if (!v) mem.delete(key); });
  mem.set(key, p);
  return p;
}

/** Mehrere Reports zusammenzählen → { pulls, players: Map(name → agg) } */
export function aggregate(results, groups) {
  const players = new Map();
  let pulls = 0;
  for (const r of results) {
    if (!r?.players) continue;
    pulls += r.pulls || 0;
    for (const p of r.players) {
      const k = p.name.toLowerCase();
      const a = players.get(k) || { name: p.name, cls: p.cls, pulls: 0, deaths: 0, firstDeaths: 0, nights: 0, g: Object.fromEntries(groups.map(g => [g.key, { total: 0, by: {} }])) };
      a.pulls += p.pulls; a.deaths += p.deaths; a.firstDeaths += p.firstDeaths; a.nights++;
      for (const g of groups) {
        const c = groupCount(p, r.abilities, g);
        a.g[g.key].total += c.total;
        for (const [n, v] of Object.entries(c.by)) a.g[g.key].by[n] = (a.g[g.key].by[n] || 0) + v;
      }
      players.set(k, a);
    }
  }
  return { pulls, players };
}

// ── Demo ─────────────────────────────────────────────────────
const CLS_WCL = { DK: 'DeathKnight', DH: 'DemonHunter' };
function rnd(seed) { let x = 0; for (const c of seed) x = (x * 31 + c.charCodeAt(0)) >>> 0; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
let demoPlayers = [];
const DEMO_DEF = { DK: ['Anti-Magic Shell', 'Icebound Fortitude'], DH: ['Blur'], Druid: ['Barkskin'], Evoker: ['Obsidian Scales', 'Renewing Blaze'],
  Hunter: ['Aspect of the Turtle', 'Exhilaration'], Mage: ['Ice Block', 'Mirror Image'], Monk: ['Fortifying Brew', 'Diffuse Magic'],
  Paladin: ['Divine Shield', 'Divine Protection'], Priest: ['Desperate Prayer', 'Fade'], Rogue: ['Cloak of Shadows', 'Feint'],
  Shaman: ['Astral Shift'], Warlock: ['Unending Resolve', 'Dark Pact'], Warrior: ['Die by the Sword', 'Spell Reflection'] };
export function setDemoPlayers(ps) { demoPlayers = ps.filter(p => p.active !== false && (p.status === 'Core' || p.status === 'Rotation')).slice(0, 22); }

function demoCheck(report, groups, diffLabel) {
  const pulls = report.pulls?.[diffLabel]?.pulls || 0;
  const abilities = {}; let nextId = 1000;
  const idOf = name => { const f = Object.entries(abilities).find(([, n]) => n === name); if (f) return f[0]; abilities[++nextId] = name; return String(nextId); };
  const players = !pulls ? [] : demoPlayers.map(pl => {
    const r = rnd(report.code + pl.id);
    const lazy = r() < .2 ? .35 : 1;          // ein paar "Defensive-Muffel"
    const casts = {};
    const add = (name, n) => { if (n > 0) casts[idOf(name)] = (casts[idOf(name)] || 0) + n; };
    const def = DEMO_DEF[pl.klasse] || groups[0].entries.slice(0, 1);
    def.forEach(n => add(n, Math.round(pulls * (0.4 + r() * 0.9) * lazy)));
    add(groups[1].entries[0], Math.round(pulls * r() * .7 * lazy));
    add(groups[2].entries[0], Math.round(pulls * r() * .35));
    add(groups[3].entries[0], Math.round(pulls * (0.6 + r() * .9)));
    const deaths = Math.round(pulls * r() * .45);
    return { name: pl.charName || pl.name, cls: CLS_WCL[pl.klasse] || pl.klasse, pulls, deaths, firstDeaths: Math.round(deaths * r() * .35), casts };
  });
  return { configured: true, demo: true, code: report.code, pulls, abilities, players };
}
