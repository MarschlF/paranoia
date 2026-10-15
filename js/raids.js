// ─────────────────────────────────────────────────────────────
//  Raids & Bosse bearbeiten (gemeinsam für Progress und Boss Guides)
//  raids/<id> { name, season, order, cover (Bild als data-URL) } · bosses/<id> { raidId, name, order, … }
// ─────────────────────────────────────────────────────────────
import { store } from './store.js';
import { esc, h, openModal, confirmModal, toast, slug } from './ui.js';

/** Nur selbst erzeugte Bilddaten zulassen */
export const coverOk = c => /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(c || '');

export const BOSS_STATUS = {
  kill: { label: 'Kill', cls: 'bs-kill' },
  prog: { label: 'Progress', cls: 'bs-prog' },
  open: { label: 'Offen', cls: 'bs-open' },
};

/** Raids sortiert: aktueller zuerst, dann nach order absteigend (neueste Season oben) */
export function sortRaids(raids, settings) {
  return [...raids].sort((a, b) =>
    (b.id === settings?.currentRaid) - (a.id === settings?.currentRaid) || (b.order || 0) - (a.order || 0));
}

/** Aktuellen Raid setzen – Name und Season landen auch in den Einstellungen */
export async function setCurrentRaid(raid) {
  await store.set('settings', 'main', { currentRaid: raid.id, raidName: raid.name, season: raid.season || '' });
}

export function editRaid(raid, { raids = [], bosses = [], settings = {} } = {}) {
  const r = raid || { name: '', season: '', order: Math.max(0, ...raids.map(x => x.order || 0)) + 1 };
  const isCurrent = raid && settings.currentRaid === raid.id;
  const form = h(`
    <div class="form-grid">
      <div class="field full"><label>Raidname</label><input class="input" name="name" value="${esc(r.name)}" placeholder="z. B. The Venomous Abyss"></div>
      <div class="field"><label>Season</label><input class="input" name="season" value="${esc(r.season || '')}" placeholder="z. B. Season 3"></div>
      <div class="field"><label>Sortierung</label><input class="input" type="number" name="order" value="${esc(r.order ?? '')}"></div>
      <div class="field full"><label>Titelbild</label>
        <div class="cover-edit">
          <div class="cover-preview" data-preview>${coverOk(r.cover) ? `<img src="${r.cover}" alt="">` : '<span>Kein Titelbild</span>'}</div>
          <div class="cover-actions">
            <label class="btn btn-ghost btn-sm">Bild auswählen<input type="file" accept="image/*" data-file hidden></label>
            <button type="button" class="btn btn-ghost btn-sm" data-clear-cover ${coverOk(r.cover) ? '' : 'hidden'}>Entfernen</button>
            <span class="hint">Querformat wirkt am besten (z. B. Raid-Artwork oder Screenshot vom Eingang). Wird automatisch verkleinert.</span>
          </div>
        </div>
      </div>
      <label class="field full check-row"><input type="checkbox" name="current" ${isCurrent || !raid ? 'checked' : ''}> Als aktuellen Raid setzen (Progress, Startseite und Comp zeigen diesen Raid)</label>
    </div>`);
  let cover = coverOk(r.cover) ? r.cover : '';
  const preview = form.querySelector('[data-preview]'), clearBtn = form.querySelector('[data-clear-cover]');
  form.querySelector('[data-file]').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    preview.innerHTML = '<span>Wird verarbeitet…</span>';
    try { cover = await compressImage(f); preview.innerHTML = `<img src="${cover}" alt="">`; clearBtn.hidden = false; }
    catch (err) { console.error(err); preview.innerHTML = '<span>Bild konnte nicht gelesen werden</span>'; }
  };
  clearBtn.onclick = () => { cover = ''; preview.innerHTML = '<span>Kein Titelbild</span>'; clearBtn.hidden = true; };
  const actions = [{ label: 'Abbrechen' }];
  if (raid) actions.unshift({ label: 'Löschen', cls: 'btn-danger', onClick: async () => {
    const own = bosses.filter(b => b.raidId === raid.id);
    if (own.length) { toast(`Erst die ${own.length} Bosse dieses Raids löschen`, 'err'); return true; }
    if (isCurrent) { toast('Der aktuelle Raid kann nicht gelöscht werden', 'err'); return true; }
    if (await confirmModal(`${raid.name} löschen?`, 'Der Raid wird entfernt.')) { await store.remove('raids', raid.id); toast('Raid gelöscht'); }
  } });
  actions.push({ label: 'Speichern', cls: 'btn-primary', onClick: async () => {
    const v = n => form.querySelector(`[name=${n}]`).value.trim();
    if (!v('name')) { toast('Name fehlt', 'err'); return true; }
    const data = { name: v('name'), season: v('season'), order: Number(v('order')) || 0, cover };
    let id = raid?.id;
    if (raid) await store.set('raids', id, data);
    else {
      id = slug(data.name);
      if (raids.some(x => x.id === id)) id += '-' + Math.random().toString(36).slice(2, 5);
      await store.set('raids', id, data);
    }
    if (form.querySelector('[name=current]').checked) await setCurrentRaid({ id, ...data });
    toast(raid ? 'Raid gespeichert' : `${data.name} angelegt`);
  } });
  openModal({ title: raid ? raid.name : 'Neuer Raid', body: form, actions });
}

export function editBoss(boss, { raids = [], raidId = '', nextOrder = 1 } = {}) {
  const b = boss || { name: '', order: nextOrder, status: 'open', raidId };
  const form = h(`
    <div class="form-grid">
      <div class="field full"><label>Bossname</label><input class="input" name="name" value="${esc(b.name)}"></div>
      <div class="field"><label>Raid</label><select class="select" name="raidId">
        ${raids.map(r => `<option value="${esc(r.id)}" ${r.id === b.raidId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}
      </select></div>
      <div class="field"><label>Reihenfolge</label><input class="input" type="number" name="order" value="${esc(b.order ?? '')}"></div>
      <div class="field"><label>Status</label><select class="select" name="status">
        ${Object.entries(BOSS_STATUS).map(([k, s]) => `<option value="${k}" ${k === b.status ? 'selected' : ''}>${s.label}</option>`).join('')}
      </select></div>
      <div class="field"><label>Kill-Datum</label><input class="input" type="date" name="killDate" value="${esc(b.killDate || '')}"></div>
      <div class="field"><label>Pulls</label><input class="input" type="number" min="0" name="pulls" value="${esc(b.pulls ?? '')}"></div>
      <div class="field"><label>Best Pull (% Boss-HP)</label><input class="input" type="number" step="0.1" min="0" max="100" name="bestPct" value="${esc(b.bestPct ?? '')}"></div>
      <div class="field full"><label>Name in Warcraft Logs (nur falls abweichend)</label><input class="input" name="wclName" value="${esc(b.wclName || '')}" placeholder="${esc(b.name || '')}"></div>
      <label class="field full check-row"><input type="checkbox" name="manual" ${b.manual ? 'checked' : ''}> Werte manuell festlegen (Warcraft Logs für diesen Boss ignorieren)</label>
      <p class="hint full">Ohne Häkchen kommen Status, Kill-Datum, Pulls und Best % automatisch aus Warcraft Logs. Die Felder greifen dann nur, solange für den Boss noch kein Log existiert.</p>
    </div>`);
  const actions = [{ label: 'Abbrechen' }];
  if (boss) actions.unshift({ label: 'Löschen', cls: 'btn-danger', onClick: async () => {
    if (await confirmModal(`${boss.name} löschen?`, 'Der Boss wird aus Progress und Boss Guides entfernt.')) { await store.remove('bosses', boss.id); toast('Gelöscht'); }
  } });
  actions.push({ label: 'Speichern', cls: 'btn-primary', onClick: async () => {
    const v = n => form.querySelector(`[name=${n}]`).value;
    if (!v('name').trim()) { toast('Name fehlt', 'err'); return true; }
    const data = {
      name: v('name').trim(), raidId: v('raidId'), status: v('status'), order: Number(v('order')) || 0,
      killDate: v('killDate'), pulls: v('pulls') === '' ? '' : Number(v('pulls')),
      bestPct: v('bestPct') === '' ? '' : Number(v('bestPct')),
      wclName: v('wclName').trim(),
      manual: form.querySelector('[name=manual]').checked,
    };
    if (boss) await store.set('bosses', boss.id, data);
    else await store.set('bosses', `${data.raidId}--${slug(data.name)}`, data);
    toast('Gespeichert');
  } });
  openModal({ title: boss ? boss.name : 'Neuer Boss', body: form, actions });
}

/** Bild verkleinern (max. 1600×900) und als WebP/JPEG-data-URL zurückgeben – passt so in die Datenbank */
export async function compressImage(file, maxW = 1600, maxH = 900) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, maxW / img.width, maxH / img.height);
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.82, 0.7, 0.55, 0.4]) {
      let d = c.toDataURL('image/webp', q);
      if (!d.startsWith('data:image/webp')) d = c.toDataURL('image/jpeg', q);
      if (d.length < 700000) return d;
    }
    throw new Error('Bild zu groß');
  } finally { URL.revokeObjectURL(url); }
}

/**
 * Raid-Kacheln (Progress & Boss Guides)
 * meta(raid) → { line: 'x/8 Mythic', pct: 0..1 }
 */
export function raidCardsHtml(raids, settings, { href, meta, isOfficer }) {
  return raids.map(r => {
    const m = meta(r);
    const cur = r.id === settings.currentRaid;
    return `
      <a class="raid-card ${cur ? 'is-current' : ''}" href="${href(r)}">
        <div class="raid-cover">${coverOk(r.cover) ? `<img src="${r.cover}" alt="" loading="lazy">` : '<div class="raid-cover-fallback"><img src="assets/logo.webp" alt=""></div>'}</div>
        <div class="raid-card-body">
          <div class="raid-card-top">
            ${cur ? '<span class="raid-badge">Aktueller Raid</span>' : ''}${r.season ? `<span class="raid-season">${esc(r.season)}</span>` : ''}${m.badge || ''}
          </div>
          <div class="raid-card-name">${esc(r.name)}</div>
          <div class="raid-card-meta"><span>${esc(m.line)}</span>${m.pct != null ? `<div class="raid-bar"><span style="width:${Math.round(m.pct * 100)}%"></span></div>` : ''}</div>
        </div>
        ${isOfficer ? `<button class="icon-btn raid-edit" data-edit-raid="${esc(r.id)}" title="Raid bearbeiten">✎</button>` : ''}
      </a>`;
  }).join('');
}

/** Banner oben auf der Raid-Detailseite */
export function raidBannerHtml(raid, settings, line) {
  if (!raid) return '';
  return `
    <div class="raid-banner">
      ${coverOk(raid.cover) ? `<img src="${raid.cover}" alt="">` : '<div class="raid-cover-fallback"><img src="assets/logo.webp" alt=""></div>'}
      <div class="raid-banner-text">
        <div class="raid-card-top">${raid.id === settings.currentRaid ? '<span class="raid-badge">Aktueller Raid</span>' : ''}${raid.season ? `<span class="raid-season">${esc(raid.season)}</span>` : ''}</div>
        <h2 class="page-title">${esc(raid.name)}</h2>
        ${line ? `<p class="page-sub">${esc(line)}</p>` : ''}
      </div>
    </div>`;
}
