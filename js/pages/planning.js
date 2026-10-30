// ─────────────────────────────────────────────────────────────
//  Raidplanung (Offi): Comp · Rotation · Loot · Noten als Reiter auf einer Seite
//  #/planung/comp · #/planung/rotation · #/planung/loot · #/planung/noten   (alte Links #/comp usw. leitet app.js um)
// ─────────────────────────────────────────────────────────────
import * as comp from './comp.js';
import * as tracker from './tracker.js';
import * as grades from './grades.js';
import { h } from '../ui.js';

const TABS = [
  ['comp', '⚔️', 'Comp'],
  ['rotation', '🔄', 'Rotation'],
  ['loot', '💎', 'Loot'],
  ['noten', '🎓', 'Noten'],
];

export function render(root, { params = [] }) {
  const tab = TABS.some(t => t[0] === params[0]) ? params[0] : 'comp';
  const rest = params.slice(1);
  const cleanup = tab === 'comp' ? comp.render(root, { params: rest })
    : tab === 'noten' ? grades.render(root, { params: rest })
    : tracker.render(root, { mode: tab, params: rest });

  // Reiter direkt unter den Seitenkopf der jeweiligen Unterseite
  const tabs = h(`<div class="guide-tabs plan-tabs">${TABS.map(([k, ico, label]) =>
    `<a class="guide-tab ${k === tab ? 'active' : ''}" href="#/planung/${k}"><span>${ico}</span>${label}</a>`).join('')}</div>`);
  const head = root.querySelector('.page-head');
  if (head) head.after(tabs); else root.prepend(tabs);
  return cleanup;
}
