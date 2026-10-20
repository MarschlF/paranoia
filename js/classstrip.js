// ─────────────────────────────────────────────────────────────
//  Klassen-Leiste: ein Icon pro Klasse mit Anzahl,
//  beim Hover eine Liste, wer die Klasse spielt (Home + Roster)
// ─────────────────────────────────────────────────────────────
import { CLASSES, clsColor, clsName, specIcon, esc } from './ui.js';

const CLASS_ICON = { DK: 'deathknight', DH: 'demonhunter', Druid: 'druid', Evoker: 'evoker', Hunter: 'hunter', Mage: 'mage', Monk: 'monk',
  Paladin: 'paladin', Priest: 'priest', Rogue: 'rogue', Shaman: 'shaman', Warlock: 'warlock', Warrior: 'warrior' };
/** Offizielles Klassen-Icon: liegt lokal in assets/classes (Evoker fehlt dort → Wowhead-CDN, sonst Spec-Icon) */
const LOCAL = new Set(['deathknight', 'demonhunter', 'druid', 'hunter', 'mage', 'monk', 'paladin', 'priest', 'rogue', 'shaman', 'warlock', 'warrior']);
export const classIconUrl = k => {
  const n = CLASS_ICON[k] || String(k).toLowerCase();
  return LOCAL.has(n) ? `assets/classes/${n}.webp` : `https://wow.zamimg.com/images/wow/icons/large/classicon_${n}.jpg`;
};
const RO = { Tank: 0, Healer: 1, mDD: 2, rDD: 3 };

/** players = aktive Spieler · asLink: Icons verlinken aufs Roster (Home), sonst Buttons zum Filtern (Roster) */
export function classStripHtml(players, { asLink = true, active = '' } = {}) {
  const byCls = Object.keys(CLASSES).map(k => {
    const ps = players.filter(p => p.klasse === k)
      .sort((a, b) => (RO[a.rolle] ?? 9) - (RO[b.rolle] ?? 9) || String(a.name).localeCompare(String(b.name)));
    const specs = {}; ps.forEach(p => { specs[p.spec] = (specs[p.spec] || 0) + 1; });
    const top = Object.entries(specs).sort((a, b) => b[1] - a[1])[0]?.[0];
    return { k, n: ps.length, icon: specIcon(k, top), ps };
  }).filter(x => x.n).sort((a, b) => b.n - a.n || clsName(a.k).localeCompare(clsName(b.k)));
  return `<div class="hi-cls">${byCls.map(c => {
    const tag = asLink ? 'a' : 'button';
    const attr = asLink ? 'href="#/roster"' : `type="button" data-cls="${esc(c.k)}"`;
    return `<${tag} class="hi-ci ${active === c.k ? 'sel' : ''} ${active && active !== c.k ? 'dim' : ''}" ${attr} style="--cls:${clsColor(c.k)}" aria-label="${esc(clsName(c.k))}: ${c.n}">
      <img src="${classIconUrl(c.k)}" alt="${esc(clsName(c.k))}" data-fallback="${esc(c.icon || '')}">
      <b>${c.n}</b>
      <div class="hi-tip" role="tooltip"><div class="hi-tip-head">${esc(clsName(c.k))} <small>${c.n}</small></div>
        ${c.ps.map(p => `<div class="hi-tip-row">${specIcon(p.klasse, p.spec) ? `<img src="${specIcon(p.klasse, p.spec)}" alt="">` : '<i></i>'}<span>${esc(p.name)}</span><em>${esc(p.spec || '')}</em></div>`).join('')}
      </div></${tag}>`;
  }).join('')}</div>`;
}

/** Nach dem Einfügen aufrufen: Tooltip am Bildschirmrand halten, Icon-Fallback */
export function bindClassStrip(root) {
  root.querySelectorAll('.hi-ci').forEach(a => a.addEventListener('mouseenter', () => {
    const tip = a.querySelector('.hi-tip'); tip.style.removeProperty('--shift');
    const r = tip.getBoundingClientRect(), vw = document.documentElement.clientWidth;
    const sh = r.left < 8 ? 8 - r.left : r.right > vw - 8 ? vw - 8 - r.right : 0;
    if (sh) tip.style.setProperty('--shift', sh + 'px');
  }));
  // Klassen-Icon nicht erreichbar (z. B. Vorschau) → Spec-Icon bzw. Kürzel
  root.querySelectorAll('.hi-ci > img[data-fallback]').forEach(im => {
    const fb = () => { if (im.dataset.fallback) { im.src = im.dataset.fallback; im.dataset.fallback = ''; } else im.replaceWith(Object.assign(document.createElement('span'), { textContent: im.alt.slice(0, 2) })); };
    im.onerror = fb;
    if (im.complete && !im.naturalWidth) fb();          // schon vorher fehlgeschlagen
  });
}
