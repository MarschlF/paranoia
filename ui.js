// ─────────────────────────────────────────────────────────────
//  UI-Helfer: Klassen, Formatierung, Modal, Toast
// ─────────────────────────────────────────────────────────────

export const CLASSES = {
  DK:      { name: 'Death Knight', color: '#C41E3A', abbr: 'DK', specs: ['Blood', 'Frost', 'Unholy'] },
  DH:      { name: 'Demon Hunter', color: '#A330C9', abbr: 'DH', specs: ['Havoc', 'Vengeance', 'Devourer'] },
  Druid:   { name: 'Druid',        color: '#FF7C0A', abbr: 'DR', specs: ['Balance', 'Feral', 'Guardian', 'Restoration'] },
  Evoker:  { name: 'Evoker',       color: '#33937F', abbr: 'EV', specs: ['Augmentation', 'Devastation', 'Preservation'] },
  Hunter:  { name: 'Hunter',       color: '#AAD372', abbr: 'HU', specs: ['Beast Mastery', 'Marksmanship', 'Survival'] },
  Mage:    { name: 'Mage',         color: '#3FC7EB', abbr: 'MA', specs: ['Arcane', 'Fire', 'Frost'] },
  Monk:    { name: 'Monk',         color: '#00FF98', abbr: 'MO', specs: ['Brewmaster', 'Mistweaver', 'Windwalker'] },
  Paladin: { name: 'Paladin',      color: '#F48CBA', abbr: 'PA', specs: ['Holy', 'Protection', 'Retribution'] },
  Priest:  { name: 'Priest',       color: '#E8E8E8', abbr: 'PR', specs: ['Discipline', 'Holy', 'Shadow'] },
  Rogue:   { name: 'Rogue',        color: '#FFF468', abbr: 'RO', specs: ['Assassination', 'Outlaw', 'Subtlety'] },
  Shaman:  { name: 'Shaman',       color: '#0070DD', abbr: 'SH', specs: ['Elemental', 'Enhancement', 'Restoration'] },
  Warlock: { name: 'Warlock',      color: '#8788EE', abbr: 'WL', specs: ['Affliction', 'Demonology', 'Destruction'] },
  Warrior: { name: 'Warrior',      color: '#C69B6D', abbr: 'WA', specs: ['Arms', 'Fury', 'Protection'] },
};

export const ROLES = {
  Tank:   { label: 'Tanks',  order: 0 },
  Healer: { label: 'Heiler', order: 1 },
  mDD:    { label: 'Melee',  order: 2 },
  rDD:    { label: 'Range',  order: 3 },
};

export const STATUSES = {
  Core:     { label: 'Core',     order: 0 },
  Rotation: { label: 'Rotation', order: 1 },
  Heroic:   { label: 'Heroic',   order: 2 },
  Bench:    { label: 'Bench',    order: 3 },
};

export const clsColor = (k) => CLASSES[k]?.color || '#888';
export const clsName  = (k) => CLASSES[k]?.name || k || '–';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function sortPlayers(list) {
  return [...list].sort((a, b) =>
    (STATUSES[a.status]?.order ?? 9) - (STATUSES[b.status]?.order ?? 9) ||
    (ROLES[a.rolle]?.order ?? 9) - (ROLES[b.rolle]?.order ?? 9) ||
    String(a.name).localeCompare(String(b.name)));
}

// ── Datum ────────────────────────────────────────────────────
export const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export const MONTHS = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export function isoDate(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function parseIso(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function fmtDate(s) { const d = parseIso(s); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`; }
export function fmtShort(s) { const d = parseIso(s); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`; }
export const todayIso = () => isoDate(new Date());

/** Alle Raidtage der Season aus den Einstellungen berechnen */
export function raidDates(settings) {
  if (!settings?.startDate || !settings?.endDate) return [];
  const days = new Set(settings.raidWeekdays || [2, 4]);
  const skip = new Set(settings.skipDays || []);
  const out = new Set(settings.extraDays || []);
  const end = parseIso(settings.endDate);
  for (let d = parseIso(settings.startDate); d <= end; d.setDate(d.getDate() + 1)) {
    if (days.has(d.getDay())) out.add(isoDate(d));
  }
  return [...out].filter(x => !skip.has(x)).sort();
}

// ── Toast ────────────────────────────────────────────────────
export function toast(msg, type = 'ok') {
  const el = h(`<div class="toast ${type}">${esc(msg)}</div>`);
  document.getElementById('toast-root').appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

// ── Modal ────────────────────────────────────────────────────
/**
 * openModal({ title, body (HTML), wide, actions: [{label, cls, onClick(close, root) → bool|Promise}] })
 */
export function openModal({ title, body, wide = false, actions = [] }) {
  const root = document.getElementById('modal-root');
  const el = h(`
    <div class="modal-backdrop">
      <div class="modal ${wide ? 'wide' : ''}" role="dialog">
        <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close>✕</button></div>
        <div class="modal-body"></div>
        ${actions.length ? '<div class="modal-foot"></div>' : ''}
      </div>
    </div>`);
  const bodyEl = el.querySelector('.modal-body');
  if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);

  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  el.addEventListener('mousedown', (e) => { if (e.target === el) close(); });
  el.querySelector('[data-close]').onclick = close;

  const foot = el.querySelector('.modal-foot');
  actions.forEach(a => {
    const b = h(`<button class="btn ${a.cls || 'btn-ghost'}">${esc(a.label)}</button>`);
    b.onclick = async () => {
      if (!a.onClick) return close();
      b.disabled = true;
      try { const keep = await a.onClick(close, el); if (keep !== true) close(); }
      catch (err) { console.error(err); toast(err.message || 'Fehler', 'err'); }
      finally { b.disabled = false; }
    };
    foot.appendChild(b);
  });

  root.appendChild(el);
  el.querySelector('input, select, textarea')?.focus();
  return { el, close };
}

export function confirmModal(title, text, label = 'Löschen') {
  return new Promise(resolve => {
    openModal({
      title, body: `<p class="muted">${esc(text)}</p>`,
      actions: [
        { label: 'Abbrechen', onClick: () => resolve(false) },
        { label, cls: 'btn-danger', onClick: () => resolve(true) },
      ],
    });
  });
}

/** Mini-Markdown: ### Überschrift, - Liste, **fett**, > Hinweis, Leerzeile = Absatz */
export function md(text) {
  const lines = esc(text || '').split('\n');
  let html = '', inList = false;
  const inline = s => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  for (const raw of lines) {
    const l = raw.trim();
    if (l.startsWith('- ') || l.startsWith('• ')) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${inline(l.slice(2))}</li>`; continue;
    }
    if (inList) { html += '</ul>'; inList = false; }
    if (!l) continue;
    if (l.startsWith('### ')) html += `<h3>${inline(l.slice(4))}</h3>`;
    else if (l.startsWith('&gt; ')) html += `<div class="callout">${inline(l.slice(5))}</div>`;
    else html += `<p>${inline(l)}</p>`;
  }
  if (inList) html += '</ul>';
  return html;
}

/** Nur http(s)-Links zulassen */
export function safeUrl(u) {
  const s = String(u || '').trim();
  return /^https?:\/\//i.test(s) ? esc(s) : '';
}

/** Pfad zum Spec-Icon, z. B. assets/specs/dk-unholy.webp */
const ICON_PREFIX = { DK: 'dk', DH: 'dh' };
export function specIcon(klasse, spec) {
  if (!klasse || !spec || !CLASSES[klasse]?.specs.includes(spec)) return '';
  const pre = ICON_PREFIX[klasse] || klasse.toLowerCase();
  return `assets/specs/${pre}-${spec.toLowerCase().replace(/\s+/g, '-')}.webp`;
}
/** Kleines Spec-Icon als <img>, fällt auf einen Klassenfarben-Punkt zurück */
export function specImg(p, size = 20) {
  const src = specIcon(p.klasse, p.spec);
  return src
    ? `<img class="spec-img" src="${src}" width="${size}" height="${size}" alt="${esc(p.spec)}" title="${esc(p.spec)} ${esc(CLASSES[p.klasse]?.name || '')}" loading="lazy">`
    : `<span class="dot"></span>`;
}

/** Bosse eines Raids (Bosse ohne raidId zählen zum aktuellen Raid) */
export function raidBosses(bosses, raidId, settings) {
  const cur = settings?.currentRaid || '';
  return bosses.filter(b => (b.raidId || cur) === raidId).sort((a, b) => (a.order || 0) - (b.order || 0));
}
export const slug = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').slice(0, 40) || Math.random().toString(36).slice(2, 8);

/** Namen vergleichen ohne Groß/klein und Akzente (Krágy = Kragy) */
export const fold = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
/** Spieler zu einem Charakternamen finden: exakt, sonst ohne Akzente (nur wenn eindeutig) */
export function matchPlayer(players, name) {
  const n = String(name || '').trim().toLowerCase();
  const exact = players.find(p => String(p.charName || '').toLowerCase() === n || String(p.name).toLowerCase() === n);
  if (exact) return exact;
  const f = fold(name);
  const loose = players.filter(p => fold(p.charName) === f || fold(p.name) === f);
  return loose.length === 1 ? loose[0] : null;
}

// ── Item-Symbole & Wowhead-Tooltips ─────────────────────────
const ZAM = 'https://wow.zamimg.com/images/wow/icons';
export const iconUrl = (icon, size = 'medium') => `${ZAM}/${size}/${String(icon || 'inv_misc_questionmark').toLowerCase().replace(/[^a-z0-9_-]/g, '')}.jpg`;
const QUALITY = { 0: '#9d9d9d', 1: '#ffffff', 2: '#1eff00', 3: '#0070dd', 4: '#a335ee', 5: '#ff8000', 6: '#e6cc80' };
/** Item-Symbol mit Wowhead-Tooltip. it = { id, ilvl, icon, q, bonus[], gemIds[], ench } */
export function itemIcon(it, size = 36) {
  const params = [it.id && `item=${it.id}`, it.ilvl && `ilvl=${it.ilvl}`, it.bonus?.length && `bonus=${it.bonus.join(':')}`,
    it.gemIds?.length && `gems=${it.gemIds.join(':')}`, it.ench && `ench=${it.ench}`, 'domain=de'].filter(Boolean).join('&');
  const img = `<img class="item-ico" src="${iconUrl(it.icon)}" width="${size}" height="${size}" alt="" loading="lazy" style="--q:${QUALITY[it.q] || 'var(--line-2)'}">`;
  return it.id
    ? `<a class="item-link" href="https://www.wowhead.com/de/item=${Number(it.id)}" target="_blank" rel="noopener" data-wowhead="${esc(params)}" data-stop>${img}</a>`
    : img;
}
/** Wowhead-Tooltip-Skript einmalig laden und neue Links aktivieren */
export function refreshTooltips() {
  if (!window.__whLoaded) {
    window.__whLoaded = true;
    window.whTooltips = { colorLinks: false, iconizeLinks: false, renameLinks: false };
    const sc = document.createElement('script');
    sc.src = 'https://wow.zamimg.com/js/tooltips.js';
    document.head.appendChild(sc);
    return;
  }
  try { window.$WowheadPower?.refreshLinks(); } catch {}
}
