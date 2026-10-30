// ─────────────────────────────────────────────────────────────
//  Spieler-Noten (nur Offis) – Reiter „Noten“ in der Raidplanung
//  Jeder Offi gibt jedem Spieler eine Schulnote (1–5, +/− nur zur Info), Schnitt pro Spieler,
//  pro Rolle (Tanks / Heiler / DDs) und eine Gesamtnote für den Raid. Mehrere Runden pro Season.
//
//  Gespeichert in der Offi-Sammlung „comps“ (nur Offis lesen/schreiben, keine neue Regel nötig):
//    comps/grades__index   { rounds: { <rid>: { name, season, created } } }
//    comps/grades__<rid>   { g: { '<pid>__<uid>': { n: '2+' | '-', c: 'Kommentar', at } },
//                            officers: { <uid>: { name } } }
//  pid '__raid' = Raid overall. n '-' = kann ich nicht beurteilen (zählt nicht).
// ─────────────────────────────────────────────────────────────
import { store, auth } from '../store.js';
import { DEMO_MODE } from '../config.js';
import { clsColor, esc, h, specImg, openModal, confirmModal, toast } from '../ui.js';

const COL = 'comps', INDEX = 'grades__index', RAID = '__raid';
const GROUPS = [
  { key: 'tank', label: 'Tanks', match: p => p.rolle === 'Tank' },
  { key: 'heal', label: 'Heiler', match: p => p.rolle === 'Healer' },
  { key: 'dd', label: 'DDs', match: p => p.rolle !== 'Tank' && p.rolle !== 'Healer' },
];
const LS_ROUND = 'pn-grades-round', LS_SORT = 'pn-grades-sort';
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

/** '2+' → 2 · '-' / leer → null   (+/− zählen wie im alten Sheet nicht in den Schnitt) */
const val = n => { const m = /^([1-6])/.exec(String(n || '')); return m ? Number(m[1]) : null; };
const avg = xs => { const v = xs.filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const fmt = x => x == null ? '–' : x.toFixed(1).replace('.', ',');
const tone = x => x == null ? '' : x <= 1.5 ? 'g1' : x <= 2.5 ? 'g2' : x <= 3.5 ? 'g3' : 'g4';

export function render(root) {
  const me = auth.user || {};
  const myUid = me.uid || 'demo', myName = me.name || 'Ich';
  const el = h(`
    <div class="container page grades-page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Offi · <span data-season>–</span></div>
          <h2 class="page-title">Spieler-Noten</h2>
          <p class="page-sub">Schulnoten von jedem Offi, Schnitt pro Spieler und Rolle. Nur für Offis sichtbar.</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-ghost" data-round-menu title="Runde umbenennen oder löschen">Runde bearbeiten</button>
          <button class="btn btn-primary" data-new>+ Neue Runde</button>
        </div>
      </div>
      <div class="tracker-toolbar">
        <select class="select" data-round style="width:auto;height:34px;font-size:13px"></select>
        <div class="legend">
          <span><i class="lg gr-g1"></i>1–1,5</span><span><i class="lg gr-g2"></i>bis 2,5</span>
          <span><i class="lg gr-g3"></i>bis 3,5</span><span><i class="lg gr-g4"></i>schlechter</span>
          <span class="muted">· Klick auf deine Spalte = benoten · <b>−</b> = kann ich nicht beurteilen · +/− zählen nicht im Schnitt</span>
        </div>
        <div class="spacer"></div>
        <select class="select" data-sort style="width:auto;height:32px;font-size:13px">
          <option value="group">Nach Rolle</option>
          <option value="best">Bester Schnitt zuerst</option>
          <option value="worst">Schlechtester Schnitt zuerst</option>
        </select>
      </div>
      <div class="table-wrap" data-wrap><div class="loading">Lade…</div></div>
    </div>`);
  root.appendChild(el);
  const $ = s => el.querySelector(s);

  let players = [], settings = {}, index = null, round = null, rid = ls.get(LS_ROUND) || '';
  let sortBy = ls.get(LS_SORT) || 'group', unRound = null;
  $('[data-sort]').value = sortBy;
  $('[data-sort]').onchange = e => { sortBy = e.target.value; ls.set(LS_SORT, sortBy); draw(); };

  const rounds = () => Object.entries(index?.rounds || {}).map(([id, r]) => ({ id, ...r })).sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')));

  function pickRound() {
    const list = rounds();
    if (!list.some(r => r.id === rid)) rid = list[0]?.id || '';
    $('[data-round]').innerHTML = list.length
      ? list.map(r => `<option value="${esc(r.id)}" ${r.id === rid ? 'selected' : ''}>${esc(r.name)}${r.season ? ' · ' + esc(r.season) : ''}</option>`).join('')
      : '<option value="">Noch keine Runde</option>';
    $('[data-round-menu]').disabled = !list.length;
    unRound?.(); round = null;
    if (!rid) return draw();
    ls.set(LS_ROUND, rid);
    unRound = store.watchDoc(COL, 'grades__' + rid, d => { round = d || {}; draw(); });
  }
  $('[data-round]').onchange = e => { rid = e.target.value; pickRound(); };

  // ── Runden ────────────────────────────────────────────────
  $('[data-new]').onclick = () => {
    const season = settings.season || '';
    const has = n => rounds().some(r => r.name === n && r.season === season);
    const suggest = !has('Mid-Season') ? 'Mid-Season' : !has('Season-Ende') ? 'Season-Ende' : '';
    const form = h(`<div class="form-grid">
      <div class="field full"><label>Name der Runde</label><input class="input" name="name" value="${esc(suggest)}" placeholder="z. B. Mid-Season" maxlength="40"></div>
      <div class="full" style="display:flex;gap:6px;flex-wrap:wrap">${['Mid-Season', 'Season-Ende', 'Nach Progress'].map(n => `<button type="button" class="chip" data-s="${n}">${n}</button>`).join('')}</div>
      <p class="hint full">Gehört zu: <b>${esc(season || 'aktuelle Season')}</b>. Jede Runde startet leer, die alten Noten bleiben erhalten.</p>
    </div>`);
    form.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { form.querySelector('[name=name]').value = b.dataset.s; });
    openModal({ title: 'Neue Bewertungsrunde', body: form, actions: [{ label: 'Abbrechen' }, { label: 'Anlegen', cls: 'btn-primary', onClick: async () => {
      const name = form.querySelector('[name=name]').value.trim();
      if (!name) { toast('Bitte einen Namen eingeben', 'err'); return true; }
      const id = `${Date.now().toString(36)}`;
      await store.setMapField(COL, INDEX, 'rounds', id, { name, season, created: new Date().toISOString() });
      rid = id; ls.set(LS_ROUND, id); toast('Runde angelegt');
    } }] });
  };

  $('[data-round-menu]').onclick = () => {
    const r = rounds().find(x => x.id === rid); if (!r) return;
    const form = h(`<div class="form-grid">
      <div class="field full"><label>Name</label><input class="input" name="name" value="${esc(r.name)}" maxlength="40"></div>
    </div>`);
    openModal({ title: 'Runde bearbeiten', body: form, actions: [
      { label: 'Runde löschen', cls: 'btn-danger', onClick: async () => {
        if (!await confirmModal('Runde löschen?', `„${r.name}“ und alle Noten darin werden endgültig gelöscht.`)) return true;
        await store.remove(COL, 'grades__' + r.id);
        await store.setMapField(COL, INDEX, 'rounds', r.id, null);
        rid = ''; toast('Runde gelöscht');
      } },
      { label: 'Abbrechen' },
      { label: 'Speichern', cls: 'btn-primary', onClick: async () => {
        const name = form.querySelector('[name=name]').value.trim(); if (!name) return true;
        await store.setMapField(COL, INDEX, 'rounds', r.id, { name, season: r.season || '', created: r.created || '' });
        toast('Gespeichert');
      } },
    ] });
  };

  // ── Tabelle ───────────────────────────────────────────────
  function officers() {
    const o = { ...(round?.officers || {}) };
    if (!o[myUid]) o[myUid] = { name: myName };
    return Object.entries(o).map(([uid, x]) => ({ uid, name: x.name || '?', me: uid === myUid }))
      .sort((a, b) => (b.me - a.me) || a.name.localeCompare(b.name, 'de'));
  }
  const cell = (pid, uid) => round?.g?.[`${pid}__${uid}`] || null;

  function draw() {
    $('[data-season]').textContent = settings.season || 'Season';
    const wrap = $('[data-wrap]');
    if (!index) return;
    if (!rid) {
      wrap.innerHTML = `<div class="empty" style="padding:40px;text-align:center">
        <p style="font-size:15px;margin-bottom:6px">Noch keine Bewertungsrunde.</p>
        <p class="muted">Leg mit „+ Neue Runde“ z. B. eine Mid-Season-Runde an.</p></div>`;
      return;
    }
    if (!round) { wrap.innerHTML = '<div class="loading">Lade…</div>'; return; }

    const offs = officers();
    const graded = new Set(Object.keys(round.g || {}).map(k => k.split('__')[0]));
    const list = players.filter(p => p.active !== false || graded.has(p.id));
    const pAvg = p => avg(offs.map(o => val(cell(p.id, o.uid)?.n)));

    const rowHtml = p => {
      const a = pAvg(p);
      return `<tr style="--cls:${clsColor(p.klasse)}">
        <td class="sticky-col pname"><div class="pname-inner">${specImg(p, 20)}<span class="nm">${esc(p.name)}</span>${p.active === false ? '<span class="rl">inaktiv</span>' : `<span class="rl">${esc(p.status || '')}</span>`}</div></td>
        ${offs.map(o => gradeTd(p.id, o)).join('')}
        <td class="gr-avg"><span class="gr-pill gr-${tone(a)}">${fmt(a)}</span></td>
      </tr>`;
    };

    let body = '';
    const groupAvgs = {};
    if (sortBy === 'group') {
      for (const g of GROUPS) {
        const ps = list.filter(g.match).sort((a, b) => String(a.name).localeCompare(String(b.name), 'de'));
        if (!ps.length) continue;
        const ga = avg(ps.map(pAvg)); groupAvgs[g.key] = ga;
        body += `<tr class="group-row"><td class="sticky-col">${g.label} <span class="muted">· ${ps.length}</span></td><td colspan="${offs.length}"></td>
          <td class="gr-avg gr-grp">Ø <span class="gr-pill gr-${tone(ga)}">${fmt(ga)}</span></td></tr>`;
        body += ps.map(rowHtml).join('');
      }
    } else {
      const dir = sortBy === 'best' ? 1 : -1;
      body = [...list].sort((a, b) => {
        const x = pAvg(a), y = pAvg(b);
        if (x == null && y == null) return String(a.name).localeCompare(String(b.name), 'de');
        if (x == null) return 1; if (y == null) return -1;
        return (x - y) * dir;
      }).map(rowHtml).join('');
    }

    // Raid overall + Schnitt je Offi
    const raidAvg = avg(offs.map(o => val(cell(RAID, o.uid)?.n)));
    const offAvg = o => avg(list.map(p => val(cell(p.id, o.uid)?.n)));
    const foot = `
      <tr class="group-row"><td class="sticky-col">Raid overall</td><td colspan="${offs.length + 1}"></td></tr>
      <tr class="gr-raid"><td class="sticky-col pname"><div class="pname-inner"><span class="nm" style="color:var(--text)">🏰 Raid als Ganzes</span></div></td>
        ${offs.map(o => gradeTd(RAID, o)).join('')}
        <td class="gr-avg"><span class="gr-pill gr-${tone(raidAvg)}">${fmt(raidAvg)}</span></td></tr>
      <tr class="gr-offavg"><td class="sticky-col"><span class="muted">Ø vergeben (wie streng)</span></td>
        ${offs.map(o => `<td><span class="muted">${fmt(offAvg(o))}</span></td>`).join('')}<td></td></tr>`;

    const keepX = wrap.scrollLeft, keepY = wrap.scrollTop;
    wrap.innerHTML = `<table class="tracker grades editable" style="width:max(100%, ${170 + 96 * (offs.length + 1)}px)"><thead><tr>
        <th class="sticky-col">Spieler</th>
        ${offs.map(o => `<th class="gr-off ${o.me ? 'me' : ''}" title="${o.me ? 'Deine Spalte' : ''}">${esc(o.name)}${o.me ? ' <span class="gr-me">du</span>' : ''}</th>`).join('')}
        <th class="gr-avg">Schnitt</th>
      </tr></thead><tbody>${body}${foot}</tbody></table>`;
    wrap.scrollLeft = keepX; wrap.scrollTop = keepY;
  }

  function gradeTd(pid, o) {
    const c = cell(pid, o.uid);
    const n = c?.n || '', has = !!c?.c;
    const v = val(n);
    const title = [c?.c, o.me ? 'Klicken zum Benoten' : ''].filter(Boolean).join('\n');
    return `<td class="${o.me ? 'gr-mine' : ''}"><div class="cell gr-cell ${v ? 'gr-t' + Math.min(v, 5) : ''} ${has ? 'has-c' : ''} ${o.me || has ? 'click' : ''}"
      data-p="${esc(pid)}" data-u="${esc(o.uid)}" ${title ? `title="${esc(title)}"` : ''}>${esc(n)}</div></td>`;
  }

  // ── Note setzen ───────────────────────────────────────────
  $('[data-wrap]').addEventListener('click', e => {
    const c = e.target.closest('.gr-cell'); if (!c) return;
    const pid = c.dataset.p, uid = c.dataset.u;
    const p = pid === RAID ? { name: 'Raid als Ganzes' } : players.find(x => x.id === pid);
    const cur = cell(pid, uid);
    if (uid !== myUid) {
      if (!cur?.c) return;
      const o = officers().find(x => x.uid === uid);
      openModal({ title: `${o?.name || 'Offi'} über ${p?.name || ''}`, body: `<p style="font-size:22px;font-weight:700;margin-bottom:8px">${esc(cur.n || '')}</p><p style="white-space:pre-wrap">${esc(cur.c)}</p>` });
      return;
    }
    editGrade(pid, p, cur);
  });

  function editGrade(pid, p, cur) {
    let base = val(cur?.n) ? String(val(cur.n)) : cur?.n === '-' ? '-' : '';
    let mod = /[+-]$/.test(cur?.n || '') && cur.n !== '-' ? cur.n.slice(-1) : '';
    const form = h(`<div class="gr-edit">
      <div class="gr-nums">${['1', '2', '3', '4', '5'].map(n => `<button type="button" class="gr-num gr-t${n}" data-n="${n}">${n}</button>`).join('')}
        <button type="button" class="gr-num gr-na" data-n="-" title="Kann ich nicht beurteilen">−</button></div>
      <div class="gr-mods"><button type="button" class="chip" data-m="+">+ (Tendenz besser)</button><button type="button" class="chip" data-m="-">− (Tendenz schlechter)</button></div>
      <div class="field"><label>Kommentar <span class="muted">(optional, sehen alle Offis)</span></label>
        <textarea class="input" name="c" rows="3" maxlength="600" placeholder="z. B. Mechaniken top, Vorbereitung ausbaufähig">${esc(cur?.c || '')}</textarea></div>
    </div>`);
    const sync = () => {
      form.querySelectorAll('[data-n]').forEach(b => b.classList.toggle('active', b.dataset.n === base));
      form.querySelectorAll('[data-m]').forEach(b => { b.classList.toggle('active', b.dataset.m === mod); b.disabled = !base || base === '-' || (base === '1' && b.dataset.m === '+') || (base === '5' && b.dataset.m === '-'); });
    };
    form.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { base = b.dataset.n; if (base === '-' || (base === '1' && mod === '+') || (base === '5' && mod === '-')) mod = ''; sync(); });
    form.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { mod = mod === b.dataset.m ? '' : b.dataset.m; sync(); });
    sync();
    const save = async n => {
      const c = form.querySelector('[name=c]').value.trim();
      const key = `${pid}__${myUid}`;
      if (!n && !c) await store.setMapField(COL, 'grades__' + rid, 'g', key, null);
      else await store.setMapField(COL, 'grades__' + rid, 'g', key, { n, c, at: new Date().toISOString() });
      await store.setMapField(COL, 'grades__' + rid, 'officers', myUid, { name: myName });
    };
    openModal({ title: `Note für ${p?.name || ''}`, body: form, actions: [
      ...(cur ? [{ label: 'Entfernen', cls: 'btn-danger', onClick: () => store.setMapField(COL, 'grades__' + rid, 'g', `${pid}__${myUid}`, null) }] : []),
      { label: 'Abbrechen' },
      { label: 'Speichern', cls: 'btn-primary', onClick: () => save(base === '-' ? '-' : base ? base + mod : '') },
    ] });
  }

  // ── Daten ─────────────────────────────────────────────────
  const unsub = [
    store.watchCol('players', ps => { players = ps; draw(); }),
    store.watchDoc('settings', 'main', s => { settings = s || {}; draw(); }),
    store.watchDoc(COL, INDEX, async d => {
      if (!d && DEMO_MODE) return seedDemo();
      const before = JSON.stringify(index?.rounds || {});
      index = d || { rounds: {} };
      if (JSON.stringify(index.rounds || {}) !== before || !round) pickRound(); else draw();
    }),
  ];
  return () => { unsub.forEach(u => u()); unRound?.(); };

  // Vorschau: eine Runde mit Noten von vier Beispiel-Offis
  async function seedDemo() {
    const id = 'demo1';
    await store.set(COL, 'grades__' + id, { g: {}, officers: { o1: { name: 'Drea' }, o2: { name: 'Peach' }, o3: { name: 'Soro' } } });
    const g = {};
    const act = players.filter(p => p.active !== false);
    act.forEach((p, i) => ['o1', 'o2', 'o3'].forEach((o, j) => {
      if ((i + j) % 11 === 7) return;
      const n = 1 + ((i * 7 + j * 3) % 9 > 6 ? 3 : (i * 5 + j) % 3) + (i % 13 === 4 ? 1 : 0);
      g[`${p.id}__${o}`] = { n: String(n) + ((i + j) % 5 === 1 ? '+' : (i + j) % 7 === 2 ? '-' : ''), c: (i + j) % 9 === 0 ? 'Mechaniken sauber, Consumables manchmal vergessen.' : '', at: new Date().toISOString() };
    }));
    ['o1', 'o2', 'o3'].forEach((o, j) => g[`${RAID}__${o}`] = { n: ['3', '2', '3-'][j], c: '' });
    await store.set(COL, 'grades__' + id, { g });
    await store.set(COL, INDEX, { rounds: { [id]: { name: 'Mid-Season', season: settings.season || 'Season 2', created: new Date().toISOString() } } });
  }
}
