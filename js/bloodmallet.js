// ─────────────────────────────────────────────────────────────
//  Bloodmallet: Trinket → alle Specs
//  Holt die öffentlichen Trinket-Sims aller Specs (bloodmallet.com/chart/get/trinkets/<fight>/<class>/<spec>)
//  und rechnet pro Trinket + Itemlevel den Gewinn in % gegenüber der Baseline.
//  Wird 6 Stunden im Browser zwischengespeichert (≈ 33 Abfragen beim ersten Mal).
// ─────────────────────────────────────────────────────────────

// Specs, für die Bloodmallet Trinket-Sims hat (gleiche Liste wie bloodmallet.com selbst)
export const BM_SPECS = [
  ['DK', 'death_knight', 'Blood'], ['DK', 'death_knight', 'Frost'], ['DK', 'death_knight', 'Unholy'],
  ['DH', 'demon_hunter', 'Havoc'], ['DH', 'demon_hunter', 'Vengeance'], ['DH', 'demon_hunter', 'Devourer'],
  ['Druid', 'druid', 'Balance'], ['Druid', 'druid', 'Feral'], ['Druid', 'druid', 'Guardian'],
  ['Evoker', 'evoker', 'Augmentation'], ['Evoker', 'evoker', 'Devastation'],
  ['Hunter', 'hunter', 'Beast Mastery'], ['Hunter', 'hunter', 'Marksmanship'], ['Hunter', 'hunter', 'Survival'],
  ['Mage', 'mage', 'Arcane'], ['Mage', 'mage', 'Fire'], ['Mage', 'mage', 'Frost'],
  ['Monk', 'monk', 'Brewmaster'], ['Monk', 'monk', 'Windwalker'],
  ['Paladin', 'paladin', 'Protection'], ['Paladin', 'paladin', 'Retribution'],
  ['Priest', 'priest', 'Shadow'],
  ['Rogue', 'rogue', 'Assassination'], ['Rogue', 'rogue', 'Outlaw'], ['Rogue', 'rogue', 'Subtlety'],
  ['Shaman', 'shaman', 'Elemental'], ['Shaman', 'shaman', 'Enhancement'],
  ['Warlock', 'warlock', 'Affliction'], ['Warlock', 'warlock', 'Demonology'], ['Warlock', 'warlock', 'Destruction'],
  ['Warrior', 'warrior', 'Arms'], ['Warrior', 'warrior', 'Fury'], ['Warrior', 'warrior', 'Protection'],
];
const snake = s => String(s).toLowerCase().replace(/\s+/g, '_');
const CACHE_KEY = 'pn-bm-trinkets-v1', CACHE_MS = 6 * 3600 * 1000;
const mem = {};

/**
 * → { items: [{ key, name, id, levels: [ilvl…] }], pct(itemKey, ilvl) → [{ klasse, spec, pct, dps }], specs: n, updated }
 */
export function loadTrinketMatrix(fight = 'castingpatchwerk', { lang = 'de_DE', onProgress } = {}) {
  if (mem[fight]) return mem[fight];
  mem[fight] = (async () => {
    let raw = null;
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (c?.[fight] && Date.now() - c[fight].at < CACHE_MS) raw = c[fight].data;
    } catch {}
    if (!raw) {
      raw = {}; let done = 0;
      await Promise.all(BM_SPECS.map(async ([klasse, cls, spec]) => {
        try {
          const r = await fetch(`https://bloodmallet.com/chart/get/trinkets/${fight}/${cls}/${snake(spec)}`);
          if (r.ok) {
            const j = await r.json();
            if (j && j.status !== 'error' && j.data) raw[`${klasse}|${spec}`] = { data: j.data, translations: j.translations || {}, item_ids: j.item_ids || {}, timestamp: j.timestamp || '' };
          }
        } catch {}
        onProgress?.(++done, BM_SPECS.length);
      }));
      if (!Object.keys(raw).length) throw new Error('bloodmallet');
      try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; c[fight] = { at: Date.now(), data: raw }; localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch {}
    }
    return build(raw, lang);
  })().catch(e => { delete mem[fight]; throw e; });
  return mem[fight];
}

function build(raw, lang) {
  const items = new Map();       // key → { name, id, levels:Set }
  const table = {};              // key → ilvl → [{klasse, spec, pct, dps}]
  let updated = '';
  for (const [sk, e] of Object.entries(raw)) {
    const [klasse, spec] = sk.split('|');
    const base = e.data.baseline || {};
    const baseVal = Number(Object.values(base)[0]) || 0;
    if (!baseVal) continue;
    if (e.timestamp > updated) updated = e.timestamp;
    for (const [name, levels] of Object.entries(e.data)) {
      if (name === 'baseline' || !levels || typeof levels !== 'object') continue;
      const key = name.toLowerCase().replace(/\s+/g, '_');
      const tr = e.translations?.[name] || {};
      if (!items.has(key)) items.set(key, { key, name: tr[lang] || tr.en_US || name, en: tr.en_US || name, id: e.item_ids?.[name] || 0, levels: new Set() });
      for (const [ilvl, dps] of Object.entries(levels)) {
        const v = Number(dps); if (!v) continue;
        items.get(key).levels.add(Number(ilvl));
        ((table[key] ||= {})[ilvl] ||= []).push({ klasse, spec, dps: v, pct: Math.round((v / baseVal - 1) * 1000) / 10 });
      }
    }
  }
  const list = [...items.values()].map(i => ({ ...i, levels: [...i.levels].sort((a, b) => a - b) })).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return {
    items: list,
    specs: Object.keys(raw).length,
    updated,
    pct: (key, ilvl) => (table[key]?.[ilvl] || []).slice().sort((a, b) => b.pct - a.pct),
    /** Gestapelt wie bei Bloodmallet: pro Spec alle Itemlevel → [{ klasse, spec, levels: [{ ilvl, pct }], top }] */
    stack: key => {
      const by = new Map();
      for (const [ilvl, rows] of Object.entries(table[key] || {})) for (const r of rows) {
        const k = `${r.klasse}|${r.spec}`;
        if (!by.has(k)) by.set(k, { klasse: r.klasse, spec: r.spec, levels: [] });
        by.get(k).levels.push({ ilvl: Number(ilvl), pct: r.pct });
      }
      return [...by.values()].map(x => { x.levels.sort((a, b) => a.ilvl - b.ilvl); x.top = x.levels.at(-1)?.pct ?? 0; return x; }).sort((a, b) => b.top - a.top);
    },
  };
}
