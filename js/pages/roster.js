import { store, auth } from '../store.js';
import { CLASSES, ROLES, clsColor, esc, h, specIcon, openModal, slug } from '../ui.js';
import { openPlayerManager, openPlayerForm } from '../players.js';
import { getRio, charKey, charOf, realmSlug } from '../rio.js';
import { presencePlayer, isOnline, ago } from '../presence.js';
import { specFx, attachFx } from '../specfx.js';
import { classStripHtml, bindClassStrip } from '../classstrip.js';

export function render(root) {
  const el = h(`
    <div class="container page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Kader</div>
          <h2 class="page-title">Roster</h2>
          <p class="page-sub" data-sub>–</p>
        </div>
        <div class="page-actions">${auth.isOfficer ? '<button class="btn btn-ghost" data-manage>Spieler verwalten</button>' : ''}</div>
      </div>
      <div class="card roster-cls hidden" data-cls-strip></div>
      <div data-list><div class="loading">Lade Roster…</div></div>
    </div>`);
  root.appendChild(el);
  el.querySelector('[data-manage]')?.addEventListener('click', openPlayerManager);

  let players = [], pres = [], reads = [], raidName = '', clsFilter = '';

  const draw = () => {
    const active = players.filter(p => p.active !== false);
    const cnt = r => active.filter(p => r.includes(p.rolle)).length;
    el.querySelector('[data-sub]').textContent = `${active.length} Raider · ${cnt(['Tank'])} Tanks · ${cnt(['Healer'])} Heiler · ${cnt(['mDD', 'rDD'])} DPS`;
    // Klassen-Leiste: Hover zeigt die Spieler, Klick filtert das Roster
    if (clsFilter && !active.some(p => p.klasse === clsFilter)) clsFilter = '';
    const strip = el.querySelector('[data-cls-strip]');
    strip.classList.toggle('hidden', !active.length);
    strip.innerHTML = `<div class="rc-head"><span class="rc-title">Klassen</span>${clsFilter ? `<button class="btn btn-ghost btn-sm" data-cls-reset>Filter: ${esc(CLASSES[clsFilter]?.name || clsFilter)} ✕</button>` : '<span class="muted rc-hint">Klick auf eine Klasse filtert</span>'}</div>${classStripHtml(active, { asLink: false, active: clsFilter })}`;
    bindClassStrip(strip);
    strip.querySelectorAll('[data-cls]').forEach(b => b.onclick = () => { clsFilter = clsFilter === b.dataset.cls ? '' : b.dataset.cls; draw(); });
    strip.querySelector('[data-cls-reset]')?.addEventListener('click', () => { clsFilter = ''; draw(); });
    const shown = clsFilter ? active.filter(p => p.klasse === clsFilter) : active;
    const list = el.querySelector('[data-list]');
    if (!players.length && auth.isOfficer) {
      list.innerHTML = `<div class="empty"><div class="big">📥</div><p style="margin-bottom:14px">Noch keine Daten in der Datenbank.</p>
        <button class="btn btn-primary" data-seed>Startdaten aus dem Sheet importieren</button></div>`;
      list.querySelector('[data-seed]').onclick = async (e) => {
        e.target.disabled = true; await store.importSeed();
      };
      return;
    }
    if (!shown.length) { list.innerHTML = '<div class="empty"><div class="big">👥</div>Noch keine Spieler im Roster.</div>'; return; }

    // Online-Status pro Spieler (nur Offis)
    const seen = new Map();
    if (auth.isOfficer) for (const d of pres) {
      const pl = presencePlayer(d, players, reads); if (!pl) continue;
      const prev = seen.get(pl.id);
      if (!prev || String(d.at) > String(prev.at)) seen.set(pl.id, { at: d.at, on: isOnline(d) });
    }
    list.innerHTML = Object.entries(ROLES).map(([role, r]) => {
      const group = shown.filter(p => p.rolle === role).sort((a, b) => a.name.localeCompare(b.name));
      if (!group.length) return '';
      return `
        <div class="role-section">
          <div class="role-title">${r.label} <span class="count">${group.length}</span></div>
          <div class="roster-grid">
            ${group.map(p => { const fx = specFx(p.klasse, p.spec); return `
              <div class="player-card clickable" style="--cls:${clsColor(p.klasse)};--fx:${fx.color || clsColor(p.klasse)}" data-fx="${fx.type}" data-pid="${esc(p.id)}" role="button" tabindex="0" title="Details zu ${esc(p.name)}">
                ${fx.layer}
                ${specIcon(p.klasse, p.spec)
                  ? `<img class="class-icon" src="${specIcon(p.klasse, p.spec)}" alt="${esc(p.spec)}" loading="lazy">`
                  : `<div class="class-icon">${esc(CLASSES[p.klasse]?.abbr || '?')}</div>`}
                <div class="player-meta">
                  <div class="player-name">${esc(p.name)}${seen.has(p.id) ? (seen.get(p.id).on ? '<span class="on-dot live" title="Gerade online"></span>' : `<span class="seen" title="Zuletzt auf der Seite">${esc(ago(seen.get(p.id).at))}</span>`) : ''}</div>
                  <div class="player-spec">${esc(p.spec || '')} ${esc(CLASSES[p.klasse]?.name || '')}</div>
                </div>
              </div>`; }).join('')}
          </div>
        </div>`;
    }).join('');
    list.querySelectorAll('.player-card[data-fx]').forEach(attachFx);
    list.querySelectorAll('[data-pid]').forEach(c => {
      const open = () => { const p = players.find(x => x.id === c.dataset.pid); if (p) openPlayer(p, seen.get(p.id), raidName); };
      c.onclick = open;
      c.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
    });
  };

  const unsubs = [store.watchCol('players', ps => { players = ps; draw(); }), store.watchDoc('settings', 'main', st => { raidName = st?.raidName || ''; })];
  if (auth.isOfficer) {
    unsubs.push(store.watchCol('presence', ps => { pres = ps; draw(); }, () => {}));
    unsubs.push(store.watchCol('guideReads', rs => { reads = rs; draw(); }, () => {}));
  }
  const tick = setInterval(() => auth.isOfficer && draw(), 60000);
  return () => { clearInterval(tick); unsubs.forEach(u => u()); };
}

// ── Spieler-Detail: Raider.IO-Daten + Links ─────────────────
function openPlayer(p, seen, raidName = '') {
  const color = clsColor(p.klasse);
  const c = charOf(p);
  const icon = specIcon(p.klasse, p.spec);
  const body = h(`<div class="pd">
    <div class="pd-head" style="--cls:${color}">
      ${icon ? `<img class="class-icon" src="${icon}" alt="">` : `<div class="class-icon">${esc(CLASSES[p.klasse]?.abbr || '?')}</div>`}
      <div class="pd-who">
        <div class="pd-name">${esc(p.name)}</div>
        <div class="muted">${esc(p.spec || '')} ${esc(CLASSES[p.klasse]?.name || '')}${c.name !== p.name ? ` · ingame <b>${esc(c.name)}</b>` : ''} <span data-realm></span></div>
        ${seen ? `<div class="pd-seen">${seen.on ? '<span class="on-dot live"></span> gerade online' : `zuletzt auf der Seite ${esc(ago(seen.at))}`}</div>` : ''}
      </div>
    </div>
    <div class="pd-stats" data-stats>
      <div><span>Itemlevel</span><b>…</b></div><div><span>M+ Score</span><b>…</b></div><div><span>Raid</span><b>…</b></div>
    </div>
    <div class="pd-links" data-links></div>
    <p class="hint" data-note style="margin-top:10px"></p>
  </div>`);
  const actions = [{ label: 'Schließen' }];
  if (auth.isOfficer) actions.unshift({ label: 'Spieler bearbeiten', onClick: () => { openPlayerForm(p); } });
  openModal({ title: 'Spieler', body, actions });

  const links = realm => {
    const n = encodeURIComponent(c.name.toLowerCase());
    const r = realm ? encodeURIComponent(realm) : '';
    const L = realm ? [
      ['Raider.IO', `https://raider.io/characters/eu/${r}/${n}`],
      ['Warcraft Logs', `https://www.warcraftlogs.com/character/eu/${r}/${n}`],
      ['Arsenal', `https://worldofwarcraft.blizzard.com/de-de/character/eu/${r}/${n}`],
    ] : [
      ['Raider.IO suchen', `https://raider.io/search?term=${encodeURIComponent(c.name)}`],
      ['Warcraft Logs suchen', `https://www.warcraftlogs.com/search/?term=${encodeURIComponent(c.name)}`],
    ];
    body.querySelector('[data-links]').innerHTML = L.map(([t, u]) => `<a class="btn btn-ghost btn-sm" href="${u}" target="_blank" rel="noopener">${t} ↗</a>`).join('');
  };
  links(c.realm ? realmSlug(c.realm) : '');

  getRio([p]).then(rio => {
    const d = rio?.chars?.[charKey(p)];
    const st = body.querySelector('[data-stats]');
    if (!d || d.error) {
      st.innerHTML = '<div><span>Itemlevel</span><b>–</b></div><div><span>M+ Score</span><b>–</b></div><div><span>Raid</span><b>–</b></div>';
      body.querySelector('[data-note]').textContent = d?.error === 'not_found' ? 'Raider.IO kennt diesen Charakter nicht – Charaktername prüfen.' : 'Raider.IO gerade nicht erreichbar.';
      return;
    }
    const realm = d.realm || c.realm;
    if (realm) { body.querySelector('[data-realm]').textContent = `· ${realm}`; links(realmSlug(realm)); }
    const raids = Object.entries(d.raid || {});
    const want = slug(raidName);
    const hit = raids.find(([k]) => k === want) || raids.find(([k]) => want && (k.includes(want) || want.includes(k)));
    const raid = (hit || raids[0])?.[1] || '–';
    const score = d.score ? Math.round(d.score).toLocaleString('de-AT') : '–';
    st.innerHTML = `<div><span>Itemlevel</span><b>${d.ilvl ? Number(d.ilvl).toFixed(1) : '–'}</b></div>
      <div><span>M+ Score</span><b>${score}</b></div>
      <div><span>Raid</span><b>${esc(raid)}</b></div>`;
    body.querySelector('[data-note]').textContent = d.crawled ? `Stand Raider.IO: ${new Date(d.crawled).toLocaleDateString('de-AT')}` : '';
  });
}
