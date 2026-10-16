// ─────────────────────────────────────────────────────────────
//  Gear-Übersicht (Offi): Itemlevel, M+ Score, Raid-Progress,
//  schwächster Slot und fehlende Verzauberungen – aus Raider.IO
// ─────────────────────────────────────────────────────────────
import { store } from '../store.js';
import { ROLES, clsColor, esc, h, specImg, slug, itemIcon, refreshTooltips } from '../ui.js';
import { getRio, charKey, charOf, DEFAULT_REALM } from '../rio.js';
import { openPlayerManager } from '../players.js';
import * as week from './week.js';

// In Midnight verzauberbar (Quelle: method.gg) – bei Änderungen hier anpassen
const ENCHANT_SLOTS = ['head', 'shoulder', 'chest', 'feet', 'finger1', 'finger2', 'mainhand'];
const SLOT_DE = {
  head: 'Kopf', neck: 'Hals', shoulder: 'Schulter', back: 'Rücken', chest: 'Brust', waist: 'Taille', wrist: 'Handgelenk',
  hands: 'Hände', legs: 'Beine', feet: 'Füße', finger1: 'Ring 1', finger2: 'Ring 2', trinket1: 'Schmuck 1', trinket2: 'Schmuck 2',
  mainhand: 'Waffe', offhand: 'Nebenhand',
};
const ss = { get: k => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} } };

export function render(root, { params = [] } = {}) {
  if (params[0] === 'woche') return week.render(root);
  const el = h(`
    <div class="container page">
      <div class="page-head">
        <div>
          <div class="eyebrow" style="color:var(--gold)">Offi</div>
          <h2 class="page-title">Gear</h2>
          <p class="page-sub">Itemlevel, M+ Score und Progress aller aktiven Spieler – automatisch von Raider.IO. Zeile anklicken für alle Slots.</p>
          <p class="wcl-note" data-note></p>
        </div>
        <div class="page-actions">
          <button class="btn btn-ghost" data-manage title="Charaktername pro Spieler">Spieler verwalten</button>
          <button class="btn btn-ghost" data-reload>↻ Aktualisieren</button>
        </div>
      </div>
      ${week.gearTabs('gear')}
      <div class="stats" data-stats></div>
      <div class="tracker-toolbar" style="margin-top:18px">
        <div class="legend" data-filters></div>
        <div class="spacer"></div>
        <select class="select" data-raid style="width:auto;height:32px;font-size:13px" title="Welcher Raid bei Progress angezeigt wird"></select>
        <select class="select" data-sort style="width:auto;height:32px;font-size:13px">
          <option value="ilvl">iLvl ↓</option>
          <option value="ilvl-asc">iLvl ↑</option>
          <option value="score">M+ Score ↓</option>
          <option value="role">Nach Rolle</option>
          <option value="name">Nach Name</option>
        </select>
      </div>
      <div class="card" style="overflow:auto" data-wrap><div class="loading">Lade Raider.IO…</div></div>
    </div>`);
  root.appendChild(el);
  const $ = s => el.querySelector(s);

  let players = [], settings = null, rio, sortBy = ss.get('pn-gear-sort') || 'ilvl', filter = ss.get('pn-gear-filter') || 'raid', raidKey = ss.get('pn-gear-raid') || '';
  const open = new Set();
  $('[data-sort]').value = sortBy;
  $('[data-sort]').onchange = e => { sortBy = e.target.value; ss.set('pn-gear-sort', sortBy); draw(); };
  $('[data-raid]').onchange = e => { raidKey = e.target.value; ss.set('pn-gear-raid', raidKey); draw(); };
  $('[data-manage]').onclick = openPlayerManager;
  $('[data-reload]').onclick = () => load(true);

  const FILTERS = { raid: 'Core + Rotation', all: 'Alle aktiven' };
  function drawFilters() {
    $('[data-filters]').innerHTML = Object.entries(FILTERS).map(([k, l]) => `<button class="chip ${filter === k ? 'active' : ''}" data-f="${k}">${l}</button>`).join('');
    $('[data-filters]').querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filter = b.dataset.f; ss.set('pn-gear-filter', filter); drawFilters(); draw(); });
  }
  drawFilters();

  let loadKey = '';
  function load(force = false) {
    const list = players.filter(p => p.active !== false);
    if (!list.length) return;
    const k = list.map(charKey).sort().join(',');
    if (!force && k === loadKey) return;
    loadKey = k;
    if (force) $('[data-wrap]').innerHTML = '<div class="loading">Lade Raider.IO…</div>';
    getRio(list, { force }).then(d => { rio = d; draw(); });
  }

  function draw() {
    if (!settings) return;
    const note = $('[data-note]');
    if (rio?.configured) note.innerHTML = `<span class="wcl-dot"></span>Raider.IO verbunden${rio.demo ? ' (Beispieldaten)' : ''} · Stand ${new Date(rio.updated).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })} · Raider.IO aktualisiert Charaktere, wenn sie sich ausloggen`;
    else if (rio === null) note.textContent = 'Raider.IO ist noch nicht verbunden – Worker-URL in js/config.js eintragen.';
    if (rio === undefined) return;

    const wrap = $('[data-wrap]');
    const list = players.filter(p => p.active !== false && (filter === 'all' || p.status === 'Core' || p.status === 'Rotation'));
    const rows = list.map(p => ({ p, d: rio?.chars?.[charKey(p)] || null }));

    // Raid-Auswahl: alle Raids, die in den Daten vorkommen; Standard = aktueller Raid
    const raids = [...new Set(rows.flatMap(r => Object.keys(r.d?.raid || {})))];
    const want = slug(settings.raidName || '');
    if (!raidKey || !raids.includes(raidKey)) raidKey = raids.find(k => k === want) || raids.find(k => want && (k.includes(want) || want.includes(k))) || raids[0] || '';
    $('[data-raid]').innerHTML = raids.map(k => `<option value="${esc(k)}" ${k === raidKey ? 'selected' : ''}>${esc(prettyRaid(k))}</option>`).join('') || '<option>Kein Raid</option>';

    const ok = rows.filter(r => r.d && !r.d.error);
    const ilvls = ok.map(r => r.d.ilvl).filter(Boolean);
    const minI = Math.min(...ilvls), maxI = Math.max(...ilvls);
    const avg = ilvls.length ? (ilvls.reduce((a, b) => a + b, 0) / ilvls.length) : 0;
    const missingEnch = ok.reduce((a, r) => a + missEnch(r.d).length, 0);
    const notFound = rows.filter(r => !r.d || r.d.error);

    $('[data-stats]').innerHTML = `
      <div class="card stat"><div class="stat-label">Ø Itemlevel</div><div class="stat-value">${avg ? avg.toFixed(1) : '–'}</div></div>
      <div class="card stat"><div class="stat-label">Spanne</div><div class="stat-value">${ilvls.length ? `${minI.toFixed(0)}–${maxI.toFixed(0)}` : '–'}</div></div>
      <div class="card stat"><div class="stat-label">Fehlende Verzauberungen</div><div class="stat-value" style="color:${missingEnch ? 'var(--red)' : 'var(--venom)'}">${missingEnch}</div></div>
      <div class="card stat"><div class="stat-label">Nicht gefunden</div><div class="stat-value" style="color:${notFound.length ? 'var(--gold)' : 'inherit'}">${notFound.length}</div></div>`;

    const byName = (a, b) => a.p.name.localeCompare(b.p.name);
    const il = r => r.d?.ilvl || 0, sc = r => r.d?.score || 0;
    const sorters = {
      ilvl: (a, b) => il(b) - il(a) || byName(a, b),
      'ilvl-asc': (a, b) => (il(a) || 999) - (il(b) || 999) || byName(a, b),
      score: (a, b) => sc(b) - sc(a) || byName(a, b),
      role: (a, b) => (ROLES[a.p.rolle]?.order ?? 9) - (ROLES[b.p.rolle]?.order ?? 9) || il(b) - il(a),
      name: byName,
    };
    rows.sort(sorters[sortBy] || sorters.ilvl);

    if (!rows.length) { wrap.innerHTML = '<div class="empty" style="border:none"><div class="big">🛡️</div>Keine Spieler in dieser Auswahl.</div>'; return; }

    wrap.innerHTML = `<table class="gear-table">
      <thead><tr><th>Spieler</th><th>iLvl</th><th>M+ Score</th><th>Progress</th><th>Schwächster Slot</th><th>Verzauberungen</th><th>Stand</th><th></th></tr></thead>
      <tbody>${rows.map(({ p, d }) => {
        const k = charKey(p), c = charOf(p);
        const rn = d?.realm || c.realm;
        const realm = rn && rn.toLowerCase() !== DEFAULT_REALM.toLowerCase() ? `<span class="muted gear-realm">${esc(rn)}</span>` : '';
        const alias = c.name !== p.name ? `<span class="muted gear-realm">${esc(c.name)}</span>` : '';
        const nameCell = `<td><div class="pname-inner" style="--cls:${clsColor(p.klasse)}">${specImg(p, 22)}<span class="nm">${esc(p.name)}</span>${alias}${realm}</div></td>`;
        if (!d || d.error) return `<tr class="gear-miss">${nameCell}<td colspan="7"><span class="muted">${d?.error === 'not_found' ? `Nicht auf Raider.IO gefunden – unter „Spieler verwalten" Charaktername (genau wie ingame, inkl. Akzente) bzw. Realm prüfen (${esc(c.name)})` : 'Keine Daten'}</span></td></tr>`;
        const pct = maxI > minI ? (d.ilvl - minI) / (maxI - minI) : 1;
        const low = lowest(d);
        const miss = missEnch(d);
        const isOpen = open.has(k);
        return `<tr class="gear-row ${isOpen ? 'open' : ''}" data-k="${esc(k)}">
          ${nameCell}
          <td><div class="ilvl"><b>${d.ilvl?.toFixed ? d.ilvl.toFixed(1) : d.ilvl}</b><span class="ilvl-bar"><span style="width:${Math.round(15 + pct * 85)}%;background:${ilvlColor(pct)}"></span></span></div></td>
          <td><span style="color:${scoreColor(d.score)};font-weight:600">${d.score ? Math.round(d.score).toLocaleString('de-AT') : '–'}</span></td>
          <td>${d.raid?.[raidKey] ? `<span class="prog-tag">${esc(d.raid[raidKey])}</span>` : '<span class="muted">–</span>'}</td>
          <td>${low ? `<span class="low-cell">${itemIcon(low, 22)}${esc(SLOT_DE[low.slot] || low.slot)} <span class="muted">${low.ilvl}</span></span>` : '–'}</td>
          <td>${miss.length ? `<span class="ench-miss" title="${esc(miss.map(s => SLOT_DE[s] || s).join(', '))}">${miss.length} ${miss.length > 1 ? 'fehlen' : 'fehlt'}</span>` : '<span class="ench-ok">✓</span>'}</td>
          <td class="muted nowrap">${ago(d.crawled)}</td>
          <td class="nowrap">${d.url ? `<a class="log-btn" href="${esc(d.url)}" target="_blank" rel="noopener" data-stop>Raider.IO ↗</a>` : ''}</td>
        </tr>${isOpen ? `<tr class="gear-detail"><td colspan="8">${slotsHtml(d)}</td></tr>` : ''}`;
      }).join('')}</tbody></table>`;

    refreshTooltips();
    wrap.querySelectorAll('.gear-row').forEach(tr => tr.onclick = e => {
      if (e.target.closest('[data-stop]')) return;
      const k = tr.dataset.k; open.has(k) ? open.delete(k) : open.add(k); draw();
    });
  }

  const unsubs = [
    store.watchDoc('settings', 'main', s => { settings = s || {}; draw(); }),
    store.watchCol('players', ps => { players = ps; load(); draw(); }),
  ];
  return () => unsubs.forEach(u => u());
}

function missEnch(d) {
  const have = new Map((d.items || []).map(i => [i.slot, i]));
  return ENCHANT_SLOTS.filter(s => have.has(s) && !have.get(s).enchant);
}
function lowest(d) {
  return (d.items || []).filter(i => i.ilvl).sort((a, b) => a.ilvl - b.ilvl)[0] || null;
}
function slotsHtml(d) {
  const low = lowest(d)?.ilvl;
  const order = Object.keys(SLOT_DE);
  const items = (d.items || []).slice().sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot));
  return `<div class="slot-grid">${items.map(i => {
    const needs = ENCHANT_SLOTS.includes(i.slot);
    return `<div class="slot ${i.ilvl === low ? 'low' : ''}">
      <div class="slot-ico">${itemIcon(i, 38)}</div>
      <div class="slot-txt">
        <div class="slot-top"><span class="slot-name">${esc(SLOT_DE[i.slot] || i.slot)}</span><span class="slot-ilvl">${i.ilvl}</span></div>
        ${i.name ? `<span class="slot-item" title="${esc(i.name)}">${esc(i.name)}</span>` : ''}
        ${needs ? (i.enchant ? '<span class="slot-ench ok" title="Verzaubert">✦ verzaubert</span>' : '<span class="slot-ench miss" title="Verzauberung fehlt">✦ fehlt</span>') : ''}
      </div>
    </div>`;
  }).join('')}</div>`;
}
function prettyRaid(k) { return k.split('-').map(w => w[0]?.toUpperCase() + w.slice(1)).join(' '); }
function ilvlColor(p) { return p > .66 ? 'var(--venom)' : p > .33 ? 'var(--gold)' : 'var(--red)'; }
function scoreColor(s) { return !s ? 'var(--text-3)' : s >= 3000 ? '#ff8000' : s >= 2500 ? '#a335ee' : s >= 2000 ? '#0070dd' : s >= 1500 ? '#1eff00' : 'var(--text-2)'; }
function ago(iso) {
  if (!iso) return '–';
  const h = (Date.now() - Date.parse(iso)) / 3600000;
  if (h < 1) return 'gerade';
  if (h < 24) return `vor ${Math.round(h)} Std.`;
  return `vor ${Math.round(h / 24)} T.`;
}
