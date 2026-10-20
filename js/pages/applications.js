// ─────────────────────────────────────────────────────────────
//  Bewerbungen – Übersicht für Offiziere
//  applications/<id> { char, realm, klasse, spec, …, status, at, votes{uid:{v,name}}, notes[] }
// ─────────────────────────────────────────────────────────────
import { store, auth } from '../store.js';
import { CLASSES, clsColor, clsName, esc, h, toast, openModal, confirmModal, specIcon } from '../ui.js';
import { getRio, realmSlug } from '../rio.js';
import { openPlayerForm, guessRole } from '../players.js';
import { classIconUrl } from '../classstrip.js';
import { ago as presAgo } from '../presence.js';
import { APP_RETENTION_DAYS } from './legal.js';
const ago = iso => { const t = presAgo(iso); return t === 'online' ? 'gerade eben' : t; };

export const APP_STATUS = {
  neu:        { label: 'Neu',        cls: 'as-new' },
  pruefung:   { label: 'In Prüfung', cls: 'as-check' },
  trial:      { label: 'Trial',      cls: 'as-trial' },
  angenommen: { label: 'Angenommen', cls: 'as-ok' },
  abgelehnt:  { label: 'Abgelehnt',  cls: 'as-no' },
};
const OPEN = ['neu', 'pruefung', 'trial'];
const TABS = { offen: s => OPEN.includes(s), angenommen: s => s === 'angenommen', abgelehnt: s => s === 'abgelehnt', alle: () => true };

const links = a => {
  const r = realmSlug(a.realm), n = encodeURIComponent(String(a.char).toLowerCase());
  return {
    rio: `https://raider.io/characters/eu/${r}/${n}`,
    wcl: `https://www.warcraftlogs.com/character/eu/${r}/${n}`,
    arm: `https://worldofwarcraft.blizzard.com/de-de/character/eu/${r}/${n}`,
  };
};
const fmtAt = iso => { try { return new Date(iso).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const votesOf = a => { const v = Object.values(a.votes || {}); return { up: v.filter(x => x.v > 0), down: v.filter(x => x.v < 0) }; };

/** Abgeschlossene Bewerbungen nach Ablauf der Frist löschen (DSGVO) – läuft, wenn ein Offi die Seite öffnet */
let purged = false;
function purgeOld(as) {
  if (purged || !auth.isOfficer) return;
  purged = true;
  const limit = Date.now() - APP_RETENTION_DAYS * 86400e3;
  const old = as.filter(a => !OPEN.includes(a.status) && Date.parse(a.closedAt || a.at || '') < limit);
  old.forEach(a => store.remove('applications', a.id).catch(() => {}));
  if (old.length) toast(`${old.length} alte Bewerbung${old.length > 1 ? 'en' : ''} gelöscht (älter als ${Math.round(APP_RETENTION_DAYS / 30)} Monate)`);
}

export function render(root, { params = [] } = {}) {
  let tab = TABS[params[0]] ? params[0] : 'offen';
  const el = h(`
    <div class="container page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Offi</div>
          <h2 class="page-title">Bewerbungen</h2>
          <p class="page-sub">Eingänge über <a href="#/bewerben">die Bewerbungsseite</a> – nur für Offiziere sichtbar.</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-ghost" data-copy>Link kopieren</button>
          <button class="btn btn-ghost" data-recruit>„Wir suchen“ bearbeiten</button>
        </div>
      </div>
      <div class="guide-tabs" data-tabs></div>
      <div data-list><div class="loading">Lade…</div></div>
    </div>`);
  root.appendChild(el);
  const $ = s => el.querySelector(s);
  let apps = [], settings = {}, openId = '';

  $('[data-copy]').onclick = async () => {
    const url = location.href.split('#')[0] + '#/bewerben';
    try { await navigator.clipboard.writeText(url); toast('Link kopiert'); } catch { toast(url); }
  };
  $('[data-recruit]').onclick = () => editRecruit(settings);

  const draw = () => {
    const sorted = apps.slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));
    $('[data-tabs]').innerHTML = Object.entries({ offen: 'Offen', angenommen: 'Angenommen', abgelehnt: 'Abgelehnt', alle: 'Alle' }).map(([k, l]) => {
      const n = sorted.filter(a => TABS[k](a.status)).length;
      return `<a class="guide-tab ${tab === k ? 'active' : ''}" href="#/bewerbungen/${k}" data-tab="${k}">${l} <span class="muted">${n}</span></a>`;
    }).join('');
    $('[data-tabs]').querySelectorAll('[data-tab]').forEach(a => a.onclick = e => { e.preventDefault(); tab = a.dataset.tab; history.replaceState(null, '', a.getAttribute('href')); draw(); });
    const list = sorted.filter(a => TABS[tab](a.status));
    if (!list.length) {
      $('[data-list]').innerHTML = `<div class="empty"><div class="big">📨</div>${tab === 'offen' ? 'Keine offenen Bewerbungen.' : 'Nichts hier.'}<p class="muted" style="margin-top:8px">Teile den Link zur <a href="#/bewerben">Bewerbungsseite</a>, z. B. im Discord oder auf WoWProgress.</p></div>`;
      return;
    }
    $('[data-list]').innerHTML = `<div class="app-list">${list.map(a => {
      const st = APP_STATUS[a.status] || APP_STATUS.neu, v = votesOf(a);
      return `<button class="app-card ${a.status === 'neu' ? 'is-new' : ''}" data-id="${esc(a.id)}" style="--cls:${clsColor(a.klasse)}">
        ${specIcon(a.klasse, a.spec) ? `<img class="app-ico" src="${specIcon(a.klasse, a.spec)}" alt="">` : `<span class="app-ico">${esc(CLASSES[a.klasse]?.abbr || '?')}</span>`}
        <div class="app-main">
          <div class="app-name">${esc(a.char)} <span class="muted">· ${esc(a.realm)}</span></div>
          <div class="app-sub">${esc(a.spec)} ${esc(clsName(a.klasse))} · ${esc(a.discord)}</div>
        </div>
        <div class="app-votes">${v.up.length ? `<span class="up">👍 ${v.up.length}</span>` : ''}${v.down.length ? `<span class="down">👎 ${v.down.length}</span>` : ''}${(a.notes || []).length ? `<span>💬 ${a.notes.length}</span>` : ''}</div>
        <span class="app-st ${st.cls}">${st.label}</span>
        <span class="app-when" title="${esc(fmtAt(a.at))}">${esc(ago(a.at))}</span>
      </button>`;
    }).join('')}</div>`;
    $('[data-list]').querySelectorAll('[data-id]').forEach(b => b.onclick = () => openApp(b.dataset.id));
  };

  /** Detail-Fenster einer Bewerbung (aktualisiert sich live) */
  function openApp(id) {
    openId = id;
    const body = h('<div class="app-detail"></div>');
    let rio = null, rioLoaded = false;
    const paint = () => {
      const a = apps.find(x => x.id === id); if (!a) { body.innerHTML = '<p class="muted">Bewerbung wurde gelöscht.</p>'; return; }
      const L = links(a), v = votesOf(a), my = a.votes?.[auth.user?.uid]?.v || 0;
      const r = rio && !rio.error ? rio : null;
      body.innerHTML = `
        <div class="ad-head" style="--cls:${clsColor(a.klasse)}">
          ${specIcon(a.klasse, a.spec) ? `<img src="${specIcon(a.klasse, a.spec)}" alt="">` : ''}
          <div><div class="ad-name">${esc(a.char)}</div><div class="ad-sub">${esc(a.spec)} ${esc(clsName(a.klasse))} · ${esc(a.realm)}${a.offspec ? ` · Offspec: ${esc(a.offspec)}` : ''}</div></div>
          <div class="ad-links"><a class="btn btn-ghost btn-sm" href="${L.rio}" target="_blank" rel="noopener">Raider.IO ↗</a><a class="btn btn-ghost btn-sm" href="${a.logs ? esc(a.logs) : L.wcl}" target="_blank" rel="noopener">Logs ↗</a><a class="btn btn-ghost btn-sm" href="${L.arm}" target="_blank" rel="noopener">Arsenal ↗</a></div>
        </div>
        <div class="ad-stats">
          <div><small>Itemlevel</small><b>${r?.ilvl ? r.ilvl.toFixed?.(1) ?? r.ilvl : rioLoaded ? '–' : '…'}</b></div>
          <div><small>M+ Score</small><b>${r?.score ? Math.round(r.score) : rioLoaded ? '–' : '…'}</b></div>
          <div class="wide"><small>Raid-Progress</small><b>${r?.raid ? esc(Object.values(r.raid)[0] || '–') : rioLoaded ? (rio?.error ? 'nicht gefunden' : '–') : '…'}</b></div>
        </div>
        <div class="ad-status">${Object.entries(APP_STATUS).map(([k, s]) => `<button class="app-st ${s.cls} ${a.status === k ? 'cur' : ''}" data-st="${k}">${s.label}</button>`).join('')}</div>
        <div class="ad-block"><h4>Bisherige Gilden & Progress</h4><p>${esc(a.exp)}</p></div>
        <div class="ad-block"><h4>Warum Paranøia?</h4><p>${esc(a.why)}</p></div>
        <div class="ad-row">
          <div class="ad-block"><h4>Discord</h4><p><b>${esc(a.discord)}</b> <button class="icon-btn" data-copy-dc title="Kopieren">⧉</button></p></div>
          <div class="ad-block"><h4>Raidtage</h4><p>${a.allDays ? '✓ alle Raidtage' : '✗ nicht alle Raidtage'}${a.avail ? `<br><span class="muted">${esc(a.avail)}</span>` : ''}</p></div>
        </div>
        ${a.other ? `<div class="ad-block"><h4>Sonstiges</h4><p>${esc(a.other)}</p></div>` : ''}
        <div class="ad-vote">
          <h4>Offi-Meinung</h4>
          <div class="ad-vote-btns">
            <button class="vote up ${my > 0 ? 'on' : ''}" data-vote="1">👍 Dafür <b>${v.up.length}</b></button>
            <button class="vote down ${my < 0 ? 'on' : ''}" data-vote="-1">👎 Dagegen <b>${v.down.length}</b></button>
          </div>
          ${v.up.length || v.down.length ? `<div class="ad-voters">${v.up.map(x => `<span class="up">${esc(x.name)}</span>`).join('')}${v.down.map(x => `<span class="down">${esc(x.name)}</span>`).join('')}</div>` : ''}
        </div>
        <div class="ad-notes">
          <h4>Notizen <span class="muted">(intern)</span></h4>
          ${(a.notes || []).map((n, i) => `<div class="ad-note"><div><b>${esc(n.by)}</b> <span class="muted">${esc(fmtAt(n.at))}</span>${n.uid === auth.user?.uid ? ` <button class="icon-btn" data-del-note="${i}" title="Löschen">✕</button>` : ''}</div><p>${esc(n.text)}</p></div>`).join('') || '<p class="muted" style="font-size:13px">Noch keine Notizen.</p>'}
          <div class="ad-note-add"><input class="input" data-note maxlength="500" placeholder="Notiz hinzufügen, z. B. „Logs ok, Gespräch Mittwoch“"><button class="btn btn-ghost btn-sm" data-add-note>Hinzufügen</button></div>
        </div>
        <p class="hint">Eingegangen am ${esc(fmtAt(a.at))}</p>`;
      body.querySelectorAll('[data-st]').forEach(b => b.onclick = () => store.set('applications', id, { status: b.dataset.st, closedAt: OPEN.includes(b.dataset.st) ? '' : new Date().toISOString() }));
      body.querySelectorAll('[data-vote]').forEach(b => b.onclick = () => {
        const val = Number(b.dataset.vote), uid = auth.user?.uid || 'demo';
        store.setMapField('applications', id, 'votes', uid, my === val ? null : { v: val, name: auth.user?.name || 'Offi' });
      });
      body.querySelector('[data-copy-dc]').onclick = async () => { try { await navigator.clipboard.writeText(a.discord); toast('Discord-Name kopiert'); } catch {} };
      const addNote = () => {
        const inp = body.querySelector('[data-note]'), text = inp.value.trim(); if (!text) return;
        store.set('applications', id, { notes: [...(a.notes || []), { text, by: auth.user?.name || 'Offi', uid: auth.user?.uid || 'demo', at: new Date().toISOString() }] });
      };
      body.querySelector('[data-add-note]').onclick = addNote;
      body.querySelector('[data-note]').onkeydown = e => { if (e.key === 'Enter') addNote(); };
      body.querySelectorAll('[data-del-note]').forEach(b => b.onclick = () => store.set('applications', id, { notes: (a.notes || []).filter((_, i) => i !== Number(b.dataset.delNote)) }));
    };
    paint();
    paintDetail = paint;
    const a0 = apps.find(x => x.id === id);
    // Raider.IO-Daten über den Worker (wie bei Gear)
    getRio([{ id: 'app-' + id, name: a0.char, charName: a0.char, realm: a0.realm, klasse: a0.klasse }]).then(d => {
      rioLoaded = true; rio = d ? Object.values(d.chars || {})[0] || null : null; paint();
    }).catch(() => { rioLoaded = true; paint(); });

    openModal({
      title: 'Bewerbung', body, wide: true,
      actions: [
        { label: 'Löschen', cls: 'btn-danger', onClick: async () => {
          const a = apps.find(x => x.id === id);
          if (!(await confirmModal('Bewerbung löschen?', `${a?.char || ''} wird endgültig entfernt.`))) return true;
          await store.remove('applications', id); toast('Gelöscht');
        } },
        { label: 'Ins Roster übernehmen', cls: 'btn-primary', onClick: () => {
          const a = apps.find(x => x.id === id); if (!a) return;
          openPlayerForm(null, { name: a.char, charName: '', realm: a.realm, klasse: a.klasse, spec: a.spec, rolle: guessRole(a.klasse, a.spec), status: 'Rotation' });
          if (a.status !== 'angenommen') store.set('applications', id, { status: 'angenommen', closedAt: new Date().toISOString() });
        } },
        { label: 'Schließen' },
      ],
    });
  }
  let paintDetail = null;

  const unsubs = [
    store.watchCol('applications', as => { apps = as; purgeOld(as); draw(); if (openId && document.querySelector('.app-detail')) paintDetail?.(); }, () => { $('[data-list]').innerHTML = '<div class="empty">Konnte nicht geladen werden (Firestore-Regeln aktualisiert?).</div>'; }),
    store.watchDoc('settings', 'main', s => { settings = s || {}; }),
  ];
  return () => unsubs.forEach(u => u());
}

/** „Wir suchen“ für die Bewerbungsseite bearbeiten → settings/main.recruit */
function editRecruit(settings) {
  const rec = settings.recruit || {};
  let sel = new Set(rec.classes || []);
  const form = h(`<div>
    <label class="check-row"><input type="checkbox" name="open" ${rec.open === false ? '' : 'checked'}> Recruitment offen</label>
    <div class="field" style="margin-top:14px"><label>Gesuchte Klassen <span class="muted">(Klick zum An-/Abwählen)</span></label>
      <div class="apply-classes">${Object.entries(CLASSES).map(([k, c]) => `<button type="button" class="apply-cls ${sel.has(k) ? 'sel' : ''}" data-k="${k}" style="--cls:${c.color}"><img src="${classIconUrl(k)}" alt="" data-fb="${esc(specIcon(k, c.specs[0]) || '')}"><span>${esc(c.name)}</span></button>`).join('')}</div>
    </div>
    <div class="field" style="margin-top:14px"><label>Text <span class="muted">(optional)</span></label>
      <textarea class="input" name="text" rows="3" maxlength="400" placeholder="z. B. Vor allem Heiler und einen Range-DD mit Mythic-Erfahrung.">${esc(rec.text || '')}</textarea></div>
  </div>`);
  form.querySelectorAll('img[data-fb]').forEach(im => im.onerror = () => { if (im.dataset.fb) { im.src = im.dataset.fb; im.dataset.fb = ''; } });
  form.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { const k = b.dataset.k; sel.has(k) ? sel.delete(k) : sel.add(k); b.classList.toggle('sel', sel.has(k)); });
  openModal({ title: '„Wir suchen“', body: form, wide: true, actions: [{ label: 'Abbrechen' }, { label: 'Speichern', cls: 'btn-primary', onClick: async () => {
    await store.set('settings', 'main', { recruit: { open: form.querySelector('[name=open]').checked, classes: [...sel], text: form.querySelector('[name=text]').value.trim() } });
    toast('Gespeichert');
  } }] });
}
