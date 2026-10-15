import { store, auth } from '../store.js';
import { CLASSES, ROLES, clsColor, esc, h, specIcon } from '../ui.js';
import { openPlayerManager } from '../players.js';

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
      <div data-list><div class="loading">Lade Roster…</div></div>
    </div>`);
  root.appendChild(el);
  el.querySelector('[data-manage]')?.addEventListener('click', openPlayerManager);

  let players = [];

  const draw = () => {
    const active = players.filter(p => p.active !== false);
    el.querySelector('[data-sub]').textContent = `${active.length} Raider`;
    const shown = active;
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

    list.innerHTML = Object.entries(ROLES).map(([role, r]) => {
      const group = shown.filter(p => p.rolle === role).sort((a, b) => a.name.localeCompare(b.name));
      if (!group.length) return '';
      return `
        <div class="role-section">
          <div class="role-title">${r.label} <span class="count">${group.length}</span></div>
          <div class="roster-grid">
            ${group.map(p => `
              <div class="player-card" style="--cls:${clsColor(p.klasse)}">
                ${specIcon(p.klasse, p.spec)
                  ? `<img class="class-icon" src="${specIcon(p.klasse, p.spec)}" alt="${esc(p.spec)}" loading="lazy">`
                  : `<div class="class-icon">${esc(CLASSES[p.klasse]?.abbr || '?')}</div>`}
                <div class="player-meta">
                  <div class="player-name">${esc(p.name)}</div>
                  <div class="player-spec">${esc(p.spec || '')} ${esc(CLASSES[p.klasse]?.name || '')}</div>
                </div>
              </div>`).join('')}
          </div>
        </div>`;
    }).join('');
  };

  return store.watchCol('players', ps => { players = ps; draw(); });
}
