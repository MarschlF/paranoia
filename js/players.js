// ─────────────────────────────────────────────────────────────
//  Spielerverwaltung – EINE Stelle für Roster, Rotation & Loot
// ─────────────────────────────────────────────────────────────
import { store } from './store.js';
import { CLASSES, ROLES, STATUSES, clsColor, esc, h, openModal, confirmModal, sortPlayers, toast, specImg } from './ui.js';

const DEFAULT_ROLE = { Blood: 'Tank', Vengeance: 'Tank', Guardian: 'Tank', Brewmaster: 'Tank', Protection: 'Tank',
  Restoration: 'Healer', Mistweaver: 'Healer', Preservation: 'Healer', Discipline: 'Healer', Holy: 'Healer' };
const MELEE_SPECS = ['Unholy', 'Frost DK', 'Havoc', 'Feral', 'Survival', 'Windwalker', 'Retribution', 'Assassination', 'Outlaw', 'Subtlety', 'Enhancement', 'Arms', 'Fury'];
export function guessRole(klasse, spec) {
  if (DEFAULT_ROLE[spec]) return DEFAULT_ROLE[spec];
  if (klasse === 'DK' && spec === 'Frost') return 'mDD';
  return MELEE_SPECS.includes(spec) ? 'mDD' : 'rDD';
}

/** Formular für neuen / bestehenden Spieler */
export function openPlayerForm(player = null) {
  const p = player || { name: '', klasse: 'Warrior', spec: 'Arms', rolle: 'mDD', status: 'Rotation', note: '' };
  const form = h(`
    <div class="form-grid">
      <div class="field full"><label>Name</label><input class="input" name="name" value="${esc(p.name)}" placeholder="Charaktername" autocomplete="off"></div>
      <div class="field"><label>Klasse</label><select class="select" name="klasse">
        ${Object.entries(CLASSES).map(([k, c]) => `<option value="${k}" ${k === p.klasse ? 'selected' : ''}>${c.name}</option>`).join('')}
      </select></div>
      <div class="field"><label>Spec</label><select class="select" name="spec"></select></div>
      <div class="field"><label>Rolle</label><select class="select" name="rolle">
        ${Object.keys(ROLES).map(r => `<option value="${r}" ${r === p.rolle ? 'selected' : ''}>${r}</option>`).join('')}
      </select></div>
      <div class="field"><label>Status</label><select class="select" name="status">
        ${Object.keys(STATUSES).map(s => `<option value="${s}" ${s === p.status ? 'selected' : ''}>${s}</option>`).join('')}
      </select></div>
      <div class="field"><label>Charaktername <span class="muted">(falls anders)</span></label><input class="input" name="charName" value="${esc(p.charName || '')}" placeholder="genau wie ingame, z. B. Krágy" autocomplete="off"></div>
      <div class="field"><label>Realm <span class="muted">(leer = automatisch)</span></label><input class="input" name="realm" value="${esc(p.realm || '')}" placeholder="z. B. Thrall" autocomplete="off"></div>
    </div>`);
  const kSel = form.querySelector('[name=klasse]'), sSel = form.querySelector('[name=spec]'), rSel = form.querySelector('[name=rolle]');
  const fillSpecs = (keep) => {
    sSel.innerHTML = CLASSES[kSel.value].specs.map(s => `<option ${s === keep ? 'selected' : ''}>${s}</option>`).join('');
  };
  fillSpecs(p.spec);
  kSel.onchange = () => { fillSpecs(); rSel.value = guessRole(kSel.value, sSel.value); };
  sSel.onchange = () => { rSel.value = guessRole(kSel.value, sSel.value); };

  openModal({
    title: player ? `${player.name} bearbeiten` : 'Neuer Spieler',
    body: form,
    actions: [
      { label: 'Abbrechen' },
      { label: 'Speichern', cls: 'btn-primary', onClick: async () => {
        const data = Object.fromEntries(collect(form));
        if (!data.name.trim()) { toast('Name fehlt', 'err'); return true; }
        data.name = data.name.trim();
        data.charName = (data.charName || '').trim();
        data.realm = (data.realm || '').trim();
        if (player) await store.set('players', player.id, data);
        else await store.add('players', { ...data, active: true });
        toast(player ? 'Gespeichert' : `${data.name} hinzugefügt`);
      } },
    ],
  });
}

function collect(form) {
  return [...form.querySelectorAll('[name]')].map(i => [i.name, i.value]);
}

/** Übersicht aller Spieler mit Bearbeiten / Archivieren / Löschen */
export function openPlayerManager() {
  const body = h(`
    <div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" data-add>+ Spieler hinzufügen</button>
        <label class="hint" style="display:flex;gap:6px;align-items:center;margin-left:auto">
          <input type="checkbox" data-show-archived> Archivierte anzeigen
        </label>
      </div>
      <p class="hint" style="margin-bottom:12px">Änderungen gelten sofort für Roster, Rotation Planer und Loot Tracker. <strong>Archivieren</strong> blendet einen Spieler aus, behält aber seine Attendance- und Loot-Historie.</p>
      <div class="manage-list" data-list></div>
    </div>`);
  const { close } = openModal({ title: 'Spieler verwalten', body, wide: true });
  body.querySelector('[data-add]').onclick = () => openPlayerForm();

  let players = [];
  const list = body.querySelector('[data-list]');
  const cb = body.querySelector('[data-show-archived]');
  const draw = () => {
    const show = cb.checked;
    const rows = sortPlayers(players.filter(p => show || p.active !== false));
    list.innerHTML = rows.length ? '' : '<div class="empty">Keine Spieler</div>';
    rows.forEach(p => {
      const archived = p.active === false;
      const row = h(`
        <div class="manage-row ${archived ? 'archived' : ''}" style="--cls:${clsColor(p.klasse)}">
          <div class="pname-inner">${specImg(p, 22)}<span class="nm">${esc(p.name)}</span><span class="muted" style="font-size:12px">${esc(p.spec || '')}</span></div>
          <div class="hide-sm muted" style="font-size:13px">${esc(p.rolle || '')}</div>
          <div class="hide-sm"><span class="status-tag st-${esc(p.status)}">${esc(p.status)}</span></div>
          <div class="actions">
            <button class="btn btn-ghost btn-sm" data-edit title="Bearbeiten">✎</button>
            <button class="btn btn-ghost btn-sm" data-arch title="${archived ? 'Wiederherstellen' : 'Archivieren'}">${archived ? '↺' : '⏸'}</button>
            <button class="btn btn-danger btn-sm" data-del title="Endgültig löschen">✕</button>
          </div>
        </div>`);
      row.querySelector('[data-edit]').onclick = () => openPlayerForm(p);
      row.querySelector('[data-arch]').onclick = async () => {
        await store.set('players', p.id, { active: archived });
        toast(archived ? `${p.name} wiederhergestellt` : `${p.name} archiviert`);
      };
      row.querySelector('[data-del]').onclick = async () => {
        if (await confirmModal(`${p.name} löschen?`, 'Der Spieler wird endgültig entfernt. Tipp: Archivieren behält die Historie.')) {
          await store.remove('players', p.id); toast(`${p.name} gelöscht`);
        }
      };
      list.appendChild(row);
    });
  };
  cb.onchange = draw;
  const unsub = store.watchCol('players', ps => { players = ps; draw(); });

  // Abmelden, sobald das Modal geschlossen wird
  const obs = new MutationObserver(() => { if (!body.isConnected) { unsub(); obs.disconnect(); } });
  obs.observe(document.getElementById('modal-root'), { childList: true, subtree: true });
  return close;
}
