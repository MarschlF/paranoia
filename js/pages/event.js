// ─────────────────────────────────────────────────────────────
//  Events (z. B. Paranøia MDI) – #/event = aktives Event · #/event/<id> = ein bestimmtes · #/event/archiv
//  events/<id> { name, when, info: [Text…], fee, share, part: [Namen], guests: [Namen],
//                teams: [{ name, members: [5] }], rounds: [Key][Team] { dungeon, timer, time, failed },
//                timers: [{ end: ms | 0, left: Sek. }], status: 'live' | 'done', created, winner }
//  settings/main.activeEvent = <id>  → Menüpunkt „🏆 Event“, Startseiten-Banner und Khadgar für alle Raider
//  Raider sehen alles live, nur Offis tragen ein. Wertung: % der Timerzeit, 2 · 1 · 0 Punkte, Gleichstand → kleinere %-Summe
// ─────────────────────────────────────────────────────────────
import { store, auth } from '../store.js';
import { esc, h, openModal, confirmModal, toast, clsColor, fold, fmtDate } from '../ui.js';

const TEAMC = ['#b07cff', '#4fc3f7', '#ff9f5a'];
const ROLES = [['heal', 'Heiler'], ['tank', 'Tank'], ['dd', 'DD'], ['dd', 'DD'], ['dd', 'DD']];
const PLAN = 600;   // 10 Minuten Routenplanung

export const newEvent = (o = {}) => ({
  name: 'Paranøia MDI', when: '', info: ['3 Keys · Stufe +12', 'Wertung: % der Timerzeit', 'Punkte 2 · 1 · 0'],
  fee: 50000, share: 75, part: [], guests: [],
  teams: [0, 1, 2].map(i => ({ name: `Team ${i + 1}`, members: ['', '', '', '', ''] })),
  rounds: [0, 1, 2].map(() => [0, 1, 2].map(() => ({ dungeon: '', timer: '', time: '', failed: false }))),
  timers: [0, 1, 2].map(() => ({ end: 0, left: PLAN })),
  status: 'live', created: new Date().toISOString(), ...o,
});

// ── Wertung ─────────────────────────────────────────────────
export function parseTime(v) {
  v = String(v || '').trim().replace(/[.,]/g, ':');
  if (!v) return null;
  let m;
  if ((m = v.match(/^(\d{1,3}):(\d{1,2})$/))) return +m[1] * 60 + +m[2];
  if ((m = v.match(/^(\d{1,2})(\d{2})$/)) && v.length >= 3) return +m[1] * 60 + +m[2];
  if (/^\d{1,3}$/.test(v)) return +v * 60;
  return null;
}
const fmtClock = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const fmtPct = p => p == null ? '–' : `${p.toFixed(1).replace('.', ',')} %`;
const fmtGold = g => `${Math.round(g).toLocaleString('de-DE')} g`;

function roundResult(r) {
  const rows = r.map((e, t) => {
    const timer = parseTime(e.timer), time = parseTime(e.time);
    const pct = !e.failed && timer && time != null ? time / timer * 100 : null;
    return { t, pct, failed: !!e.failed, done: !!e.failed || pct != null };
  });
  const allDone = rows.every(x => x.done);
  const order = [...rows.filter(x => x.pct != null).sort((a, b) => a.pct - b.pct), ...rows.filter(x => x.failed)];
  order.forEach((x, i) => { x.place = i > 0 && x.pct != null && order[i - 1].pct != null && Math.abs(order[i - 1].pct - x.pct) < 1e-9 ? order[i - 1].place : i + 1; });
  rows.forEach(x => { x.points = allDone && x.place ? ([2, 1, 0][x.place - 1] ?? 0) : null; if (x.failed && allDone) x.points = 0; });
  return { rows, allDone };
}
export function standings(ev) {
  const tot = ev.teams.map((tm, t) => ({ t, name: tm.name || `Team ${t + 1}`, members: tm.members, points: 0, pctSum: 0, played: 0 }));
  ev.rounds.forEach(r => {
    const res = roundResult(r); if (!res.allDone) return;
    res.rows.forEach(x => { tot[x.t].points += x.points; tot[x.t].pctSum += x.pct ?? 200; tot[x.t].played++; });
  });
  return tot.sort((a, b) => b.points - a.points || a.pctSum - b.pctSum);
}
const roundsDone = ev => ev.rounds.filter(r => roundResult(r).allDone).length;
function prize(ev) {
  const n = ev.part.length || 0, fee = Math.max(0, +ev.fee || 0), sh = Math.min(100, Math.max(0, +ev.share || 0));
  const pool = n * fee; return { n, fee, sh, pool, g1: pool * sh / 100, g2: pool - pool * sh / 100 };
}
/** Kurztext für Banner / Khadgar: „Team X führt mit 4 Punkten“ */
export function leaderLine(ev) {
  if (!ev) return '';
  const st = standings(ev), done = roundsDone(ev);
  if (!done) return ev.when ? `Start: ${ev.when}` : 'Gleich geht’s los';
  if (ev.status === 'done') return `Sieger: ${st[0].name} mit ${st[0].points} Punkten`;
  return `${st[0].name} führt mit ${st[0].points} Punkten · Key ${done} von 3 gewertet`;
}

// ── Seite ───────────────────────────────────────────────────
export function render(root, { params = [] }) {
  const officer = auth.isOfficer;
  const el = h(`<div class="container page mdi-page"><div data-body><div class="loading">Lade…</div></div></div>`);
  root.appendChild(el);
  const body = el.querySelector('[data-body]');
  let settings = {}, events = [], players = [], ev = null, evId = '';
  let pending = null, saveT = null, focusLock = false;

  // Fokus-Sperre: während ein Offi tippt, keine Neuzeichnung durch Speicherungen
  body.addEventListener('focusin', e => { if (e.target.matches('input:not([type=checkbox])')) focusLock = true; });
  body.addEventListener('focusout', () => { focusLock = false; setTimeout(() => { if (!focusLock && !pending && ev) { const d = events.find(x => x.id === evId); if (d && JSON.stringify({ ...d, id: undefined }) !== JSON.stringify({ ...ev, id: undefined })) draw(); } }, 700); });

  const want = () => params[0] === 'archiv' ? '' : (params[0] ? decodeURIComponent(params[0]) : settings.activeEvent || '');

  // ── Speichern (Offis): sammeln & kurz verzögert schreiben, damit Tippen flüssig bleibt
  const save = (patch, now = false) => {
    Object.assign(ev, patch); pending = { ...(pending || {}), ...patch };
    clearTimeout(saveT);
    const go = async () => { const p = pending; pending = null; if (p) await store.set('events', evId, p); };
    if (now) go(); else saveT = setTimeout(go, 450);
  };

  function draw() {
    if (params[0] === 'archiv' || !want()) return drawArchive();
    const d = events.find(x => x.id === want());
    if (!d) { body.innerHTML = `<div class="empty"><div class="big">🏆</div>Event nicht gefunden. <a href="#/event/archiv">Zum Archiv</a></div>`; return; }
    if (focusLock && evId === d.id) return;   // Offi tippt gerade – nicht neu zeichnen
    evId = d.id; ev = structuredClone(d);
    drawEvent();
  }

  // ── Archiv / kein Event aktiv
  function drawArchive() {
    const list = events.slice().sort((a, b) => String(b.created).localeCompare(String(a.created)));
    const active = list.find(e => e.id === settings.activeEvent);
    body.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">Events</div><h2 class="page-title">🏆 Events & Hall of Fame</h2>
        <p class="page-sub">${active ? `Gerade läuft: <a href="#/event">${esc(active.name)}</a>` : 'Gerade läuft kein Event.'}</p></div>
        <div class="page-actions">${officer ? '<button class="btn btn-primary" data-new>+ Neues Event</button>' : ''}</div></div>
      ${list.length ? `<div class="mdi-archive">${list.map(e => {
        const st = standings(e), done = roundsDone(e);
        return `<a class="card mdi-arch" href="#/event/${encodeURIComponent(e.id)}">
          <div class="mdi-arch-top"><b>${esc(e.name)}</b>${e.id === settings.activeEvent ? '<span class="mdi-live">LIVE</span>' : e.status === 'done' ? '<span class="raid-season">Beendet</span>' : '<span class="raid-season">Entwurf</span>'}</div>
          <div class="muted">${esc(e.when || fmtDate(String(e.created).slice(0, 10)))}</div>
          ${done ? `<div class="mdi-arch-win">🥇 ${esc(st[0].name)} <span class="muted">· ${st[0].points} Pkt</span></div><div class="muted mdi-arch-mem">${st[0].members.filter(Boolean).map(esc).join(' · ')}</div>` : '<div class="muted">Noch keine Wertung</div>'}
        </a>`;
      }).join('')}</div>` : '<div class="empty"><div class="big">🏆</div>Noch keine Events.</div>'}`;
    body.querySelector('[data-new]')?.addEventListener('click', createEvent);
  }

  // ── Event-Ansicht
  function drawEvent() {
    const isActive = settings.activeEvent === evId, ed = officer;
    const pz = prize(ev);
    body.innerHTML = `
      <div class="mdi-head">
        <div><div class="eyebrow">${isActive ? '<span class="mdi-live">LIVE</span>' : ev.status === 'done' ? 'Beendet' : 'Nicht aktiv'} · <a href="#/event/archiv">Alle Events</a></div>
          <h1 class="mdi-title" ${ed ? 'data-edit-name title="Umbenennen"' : ''}>${esc(ev.name)}</h1></div>
        <div class="mdi-meta">${ev.when ? `<span class="mdi-pill">📅 <b>${esc(ev.when)}</b></span>` : ''}${(ev.info || []).map(t => `<span class="mdi-pill">${esc(t)}</span>`).join('')}</div>
      </div>
      ${ed ? `<div class="mdi-admin card">
        <label class="check-row"><input type="checkbox" data-active ${isActive ? 'checked' : ''}> <b>Event aktiv</b> <span class="muted">– Raider sehen „🏆 Event“ im Menü, ein Banner auf der Startseite und Khadgar kündigt es an</span></label>
        <div class="mdi-admin-btns"><button class="btn btn-ghost btn-sm" data-settings>Einstellungen</button>
          <button class="btn btn-ghost btn-sm" data-copy>Ergebnis für Discord kopieren</button>
          ${ev.status === 'done' ? '<button class="btn btn-ghost btn-sm" data-reopen>Wieder öffnen</button>' : '<button class="btn btn-ghost btn-sm" data-finish>Event beenden</button>'}
          <button class="btn btn-danger btn-sm" data-del>Löschen</button></div>
      </div>` : ''}

      <section class="mdi-grid2">
        <div class="card mdi-panel"><h3>Preispool</h3>
          ${ed ? `<div class="mdi-pool-in"><label><span>Startgebühr (Gold)</span><input class="input" type="number" min="0" step="1000" data-fee value="${esc(ev.fee)}"></label>
            <label><span>Anteil Platz 1 (%)</span><input class="input" type="number" min="0" max="100" data-share value="${esc(ev.share)}"></label></div>` : ''}
          <div class="mdi-prize" data-prize></div>
        </div>
        <div class="card mdi-panel"><h3>Teilnehmer <span class="muted" data-pcount></span></h3>
          <div class="mdi-chips" data-chips></div>
          ${ed ? `<form class="mdi-add" data-add><input class="input" placeholder="Gast oder Twink hinzufügen" data-addname><button class="btn btn-ghost btn-sm">Hinzufügen</button></form>
            <p class="hint">Antippen = dabei. Die Spielerzahl für den Preispool zählt sich daraus.</p>` : ''}
        </div>
      </section>

      <section class="card mdi-panel"><h3>Routenplanung ${ed ? '<span class="mdi-tm-all"><button class="btn btn-primary btn-sm" data-tall>Alle starten</button><button class="btn btn-ghost btn-sm" data-treset>Alle auf 10:00</button></span>' : ''}</h3>
        <div class="mdi-timers" data-timers></div>
        <p class="hint">Vor jedem Key 10 Minuten. Die Uhren laufen bei allen gleichzeitig.</p></section>

      <section class="mdi-teams" data-teams></section>
      <section data-rounds style="display:grid;gap:14px"></section>

      <section class="card mdi-panel"><h3>Gesamtwertung</h3><div class="mdi-standings" data-standings></div>
        <p class="hint">Gleichstand nach Punkten: Es gewinnt das Team mit der niedrigeren Summe der Prozentwerte.</p></section>`;

    drawPrize(); drawChips(); drawTimers(); drawTeams(); drawRounds(); drawStandings();
    const $ = s => body.querySelector(s);
    if (!ed) return;
    $('[data-fee]').oninput = e => { save({ fee: e.target.value }); drawPrize(); drawStandings(); };
    $('[data-share]').oninput = e => { save({ share: e.target.value }); drawPrize(); drawStandings(); };
    $('[data-active]').onchange = async e => {
      await store.set('settings', 'main', { activeEvent: e.target.checked ? evId : '' });
      if (e.target.checked && ev.status === 'done') save({ status: 'live' }, true);
      toast(e.target.checked ? 'Event ist jetzt für alle sichtbar' : 'Event ausgeblendet');
    };
    $('[data-settings]').onclick = () => editSettings();
    $('[data-edit-name]').onclick = () => editSettings();
    $('[data-copy]').onclick = copyResult;
    $('[data-finish]')?.addEventListener('click', async () => {
      if (!await confirmModal('Event beenden?', 'Die Wertung wird festgehalten und das Event kommt ins Archiv. Der Menüpunkt verschwindet für die Raider.', 'Beenden', 'btn-primary')) return;
      const st = standings(ev);
      save({ status: 'done', winner: { name: st[0].name, members: st[0].members.filter(Boolean), points: st[0].points } }, true);
      if (settings.activeEvent === evId) await store.set('settings', 'main', { activeEvent: '' });
      toast('Event beendet – Glückwunsch an die Sieger!');
    });
    $('[data-reopen]')?.addEventListener('click', () => save({ status: 'live' }, true));
    $('[data-del]').onclick = async () => {
      if (!await confirmModal('Event löschen?', `„${ev.name}“ mit allen Ergebnissen wird endgültig gelöscht.`)) return;
      if (settings.activeEvent === evId) await store.set('settings', 'main', { activeEvent: '' });
      await store.remove('events', evId); location.hash = '#/event/archiv';
    };
    $('[data-add]').onsubmit = e => {
      e.preventDefault();
      const n = $('[data-addname]').value.trim(); if (!n) return;
      const known = players.find(p => fold(p.name) === fold(n) || fold(p.charName) === fold(n));
      const name = known?.name || n;
      const guests = known || ev.guests.some(g => fold(g) === fold(n)) ? ev.guests : [...ev.guests, n];
      const part = ev.part.some(x => fold(x) === fold(name)) ? ev.part : [...ev.part, name];
      save({ guests, part }, true); $('[data-addname]').value = ''; drawChips(); drawPrize(); drawStandings();
    };
    $('[data-tall]').onclick = () => { const now = Date.now(); save({ timers: ev.timers.map(x => x.end ? x : { end: now + (x.left || PLAN) * 1000, left: x.left || PLAN }) }, true); drawTimers(); };
    $('[data-treset]').onclick = () => { save({ timers: ev.timers.map(() => ({ end: 0, left: PLAN })) }, true); drawTimers(); };
  }

  function drawPrize() {
    const p = prize(ev);
    body.querySelector('[data-prize]').innerHTML = `
      <div><span class="mdi-lbl">Pool gesamt</span><span class="mdi-v">${fmtGold(p.pool)}</span><span class="mdi-s">${p.n} × ${fmtGold(p.fee)}</span></div>
      <div class="p1"><span class="mdi-lbl">Platz 1</span><span class="mdi-v">${fmtGold(p.g1)}</span><span class="mdi-s">${p.sh} % · je Spieler ${fmtGold(p.g1 / 5)}</span></div>
      <div class="p2"><span class="mdi-lbl">Platz 2</span><span class="mdi-v">${fmtGold(p.g2)}</span><span class="mdi-s">${100 - p.sh} % · je Spieler ${fmtGold(p.g2 / 5)}</span></div>`;
  }

  const roster = () => players.filter(p => p.active !== false).sort((a, b) => String(a.name).localeCompare(String(b.name), 'de'));
  const classOf = n => players.find(p => fold(p.name) === fold(n) || fold(p.charName) === fold(n))?.klasse || '';
  const teamOf = n => ev.teams.findIndex(tm => tm.members.some(m => m && fold(m) === fold(n)));
  function drawChips() {
    const ed = officer;
    const all = [...roster().map(p => ({ n: p.name, c: p.klasse })), ...ev.guests.map(n => ({ n, c: '', guest: true }))];
    const shown = ed ? all : all.filter(r => ev.part.some(x => fold(x) === fold(r.n)));
    body.querySelector('[data-pcount]').textContent = `· ${ev.part.length} dabei`;
    const box = body.querySelector('[data-chips]');
    box.innerHTML = shown.length ? shown.map(r => {
      const on = ev.part.some(x => fold(x) === fold(r.n)), t = teamOf(r.n);
      return `<${ed ? 'button type="button"' : 'span'} class="mdi-chip ${on ? 'on' : ''}" data-n="${esc(r.n)}" style="--cc:${r.c ? clsColor(r.c) : 'var(--accent)'}" title="${esc(r.guest ? 'Gast' : r.c)}${t >= 0 ? ' · ' + esc(ev.teams[t].name) : ''}">
        ${t >= 0 ? `<i style="background:${TEAMC[t]}"></i>` : ''}${esc(r.n)}${ed && r.guest ? '<span class="x" data-del="1" title="Gast entfernen">✕</span>' : ''}</${ed ? 'button' : 'span'}>`;
    }).join('') : '<span class="muted">Noch niemand eingetragen.</span>';
    if (!ed) return;
    box.querySelectorAll('[data-n]').forEach(b => b.onclick = e => {
      const n = b.dataset.n;
      if (e.target.dataset.del) save({ guests: ev.guests.filter(x => x !== n), part: ev.part.filter(x => fold(x) !== fold(n)) }, true);
      else save({ part: ev.part.some(x => fold(x) === fold(n)) ? ev.part.filter(x => fold(x) !== fold(n)) : [...ev.part, n] }, true);
      drawChips(); drawPrize(); drawStandings();
    });
    let dl = document.getElementById('mdi-dl'); if (!dl) { dl = document.createElement('datalist'); dl.id = 'mdi-dl'; body.appendChild(dl); }
    dl.innerHTML = (ev.part.length ? ev.part : all.map(r => r.n)).map(n => `<option value="${esc(n)}">`).join('');
  }

  // Timer: gemeinsame Uhr über Zeitstempel (end) – läuft bei allen gleich
  const tleft = x => x.end ? Math.max(0, Math.round((x.end - Date.now()) / 1000)) : (x.left ?? PLAN);
  function drawTimers() {
    const ed = officer;
    body.querySelector('[data-timers]').innerHTML = ev.timers.map((x, t) => `
      <div class="mdi-tmr" style="--tc:${TEAMC[t]}"><div class="tn">${esc(ev.teams[t].name)}</div>
        <div class="mdi-clock" data-clock="${t}">${fmtClock(tleft(x))}</div>
        ${ed ? `<div class="row"><button class="btn btn-primary btn-sm" data-ts="${t}">${x.end ? 'Pause' : tleft(x) === PLAN ? 'Start' : tleft(x) === 0 ? 'Neu' : 'Weiter'}</button><button class="btn btn-ghost btn-sm" data-tr="${t}">10:00</button></div>` : ''}
      </div>`).join('');
    tick();
    if (!ed) return;
    body.querySelectorAll('[data-ts]').forEach(b => b.onclick = () => {
      const t = +b.dataset.ts, x = ev.timers[t], timers = structuredClone(ev.timers);
      if (x.end) timers[t] = { end: 0, left: tleft(x) };
      else { const l = tleft(x) || PLAN; timers[t] = { end: Date.now() + l * 1000, left: l }; }
      save({ timers }, true); drawTimers();
    });
    body.querySelectorAll('[data-tr]').forEach(b => b.onclick = () => { const timers = structuredClone(ev.timers); timers[+b.dataset.tr] = { end: 0, left: PLAN }; save({ timers }, true); drawTimers(); });
  }
  function tick() {
    if (!ev) return;
    body.querySelectorAll('[data-clock]').forEach(c => {
      const s = tleft(ev.timers[+c.dataset.clock]);
      c.textContent = fmtClock(s); c.classList.toggle('warn', s > 0 && s <= 60); c.classList.toggle('done', s === 0);
    });
  }
  const iv = setInterval(tick, 250);

  function drawTeams() {
    const ed = officer;
    body.querySelector('[data-teams]').innerHTML = ev.teams.map((tm, t) => `
      <div class="card mdi-team" style="--tc:${TEAMC[t]}">
        <div class="mdi-team-h">${ed ? `<input class="mdi-tname" data-tname="${t}" value="${esc(tm.name)}" aria-label="Teamname">` : `<span class="mdi-tname">${esc(tm.name)}</span>`}
          <span class="mdi-score" data-tscore="${t}">0<small>Pkt</small></span></div>
        <div class="mdi-slots">${ROLES.map(([cls, lbl], i) => {
          const m = tm.members[i] || '', c = classOf(m);
          return `<div class="mdi-slot"><span class="mdi-role ${cls}">${lbl}</span>${ed
            ? `<input class="input" data-m="${t}-${i}" list="mdi-dl" value="${esc(m)}" placeholder="${i === 0 ? 'Leader (Heiler)' : lbl}" autocomplete="off" style="${c ? `color:${clsColor(c)};font-weight:600` : ''}">`
            : `<span class="mdi-mem" style="${c ? `color:${clsColor(c)}` : ''}">${esc(m) || '<span class="muted">–</span>'}</span>`}</div>`;
        }).join('')}</div>
      </div>`).join('');
    if (!ed) return;
    body.querySelectorAll('[data-tname]').forEach(i => i.oninput = e => {
      const teams = structuredClone(ev.teams); teams[+i.dataset.tname].name = e.target.value; save({ teams });
      body.querySelectorAll(`[data-tn="${i.dataset.tname}"]`).forEach(x => x.textContent = e.target.value);
      drawStandings();
    });
    body.querySelectorAll('[data-m]').forEach(i => i.oninput = e => {
      const [t, k] = i.dataset.m.split('-').map(Number), teams = structuredClone(ev.teams);
      teams[t].members[k] = e.target.value; save({ teams });
      const c = classOf(e.target.value); i.style.color = c ? clsColor(c) : ''; i.style.fontWeight = c ? '600' : '';
      drawStandings(); drawChips();
    });
  }

  function drawRounds() {
    const ed = officer;
    body.querySelector('[data-rounds]').innerHTML = ev.rounds.map((r, k) => `
      <section class="card mdi-panel mdi-round"><div class="mdi-round-h"><h3>Key ${k + 1}</h3><span class="muted" data-rhint="${k}"></span></div>
        <div class="table-wrap"><table class="mdi-tbl"><thead><tr><th>Team</th><th>Dungeon</th><th>Timer</th><th>Zeit</th><th>% der Zeit</th><th>Ergebnis</th>${ed ? '<th></th>' : ''}</tr></thead>
        <tbody>${r.map((e, t) => `<tr style="--tc:${TEAMC[t]}">
          <td class="tn" data-tn="${t}">${esc(ev.teams[t].name)}</td>
          ${ed ? `<td><input class="input" data-f="${k}-${t}-dungeon" value="${esc(e.dungeon)}" placeholder="z. B. Ruby"></td>
            <td><input class="input mono" data-f="${k}-${t}-timer" value="${esc(e.timer)}" placeholder="28:00" inputmode="numeric"></td>
            <td><input class="input mono" data-f="${k}-${t}-time" value="${esc(e.time)}" placeholder="12:45" inputmode="numeric"></td>`
            : `<td>${esc(e.dungeon) || '<span class="muted">–</span>'}</td><td class="mono">${esc(e.timer) || '–'}</td><td class="mono">${esc(e.time) || (e.failed ? '' : '–')}</td>`}
          <td class="pct" data-pct="${k}-${t}">–</td><td data-pl="${k}-${t}"></td>
          ${ed ? `<td><label class="check-row mdi-fail"><input type="checkbox" data-fail="${k}-${t}" ${e.failed ? 'checked' : ''}> nicht beendet</label></td>` : ''}
        </tr>`).join('')}</tbody></table></div></section>`).join('');
    ev.rounds.forEach((_, k) => updRound(k));
    if (!ed) return;
    body.querySelectorAll('[data-f]').forEach(i => i.oninput = e => {
      const [k, t, f] = i.dataset.f.split('-'), rounds = structuredClone(ev.rounds);
      rounds[+k][+t][f] = e.target.value; save({ rounds }); updRound(+k); drawStandings();
    });
    body.querySelectorAll('[data-fail]').forEach(i => i.onchange = e => {
      const [k, t] = i.dataset.fail.split('-').map(Number), rounds = structuredClone(ev.rounds);
      rounds[k][t].failed = e.target.checked; save({ rounds }, true); updRound(k); drawStandings();
    });
  }
  function updRound(k) {
    const res = roundResult(ev.rounds[k]);
    res.rows.forEach(x => {
      const pc = body.querySelector(`[data-pct="${k}-${x.t}"]`);
      pc.textContent = x.failed ? 'abgebrochen' : fmtPct(x.pct); pc.classList.toggle('over', x.pct > 100);
      body.querySelector(`[data-pl="${k}-${x.t}"]`).innerHTML = res.allDone && x.place
        ? `<span class="mdi-place r${x.place}">${x.place}. · ${x.points} Pkt</span>` : x.done ? '<span class="muted">wartet</span>' : '';
    });
    body.querySelector(`[data-rhint="${k}"]`).textContent = res.allDone ? 'gewertet' : `${res.rows.filter(x => x.done).length} von 3 Teams`;
  }

  function drawStandings() {
    const st = standings(ev), any = roundsDone(ev) > 0, p = prize(ev);
    st.forEach(x => { const s = body.querySelector(`[data-tscore="${x.t}"]`); if (s) s.innerHTML = `${x.points}<small>Pkt</small>`; });
    body.querySelector('[data-standings]').innerHTML = st.map((x, i) => `
      <div class="mdi-st ${any && i === 0 ? 'first' : ''} ${any && i === 1 ? 'second' : ''}" style="--tc:${TEAMC[x.t]}">
        <span class="rank">${any ? ['🥇', '🥈', '🥉'][i] : i + 1 + '.'}</span>
        <div style="min-width:0"><div class="nm">${esc(x.name)}</div><div class="mem">${x.members.filter(Boolean).map(esc).join(' · ') || 'Noch keine Spieler'}</div></div>
        <div class="pts">${x.points} Pkt<small>${x.played ? `Σ ${fmtPct(x.pctSum)}` : 'noch keine Runde'}</small></div>
        <div class="gold">${i === 0 ? fmtGold(p.g1) : i === 1 ? fmtGold(p.g2) : '–'}<small>${i < 2 ? `je ${fmtGold((i ? p.g2 : p.g1) / 5)}` : ''}</small></div>
      </div>`).join('');
  }

  async function copyResult() {
    const p = prize(ev), st = standings(ev), medal = ['🥇', '🥈', '🥉'];
    const lines = [`**${ev.name} – Ergebnis**`, ''];
    ev.rounds.forEach((r, k) => {
      const res = roundResult(r); if (!res.allDone) return;
      lines.push(`**Key ${k + 1}**`);
      res.rows.slice().sort((a, b) => a.place - b.place).forEach(x => lines.push(`${x.place}. ${ev.teams[x.t].name} – ${r[x.t].dungeon || '?'} – ${x.failed ? 'abgebrochen' : fmtPct(x.pct)} (${x.points} Pkt)`));
      lines.push('');
    });
    lines.push('**Gesamt**');
    st.forEach((x, i) => lines.push(`${medal[i]} ${x.name} – ${x.points} Pkt${i < 2 ? ` – ${fmtGold(i ? p.g2 : p.g1)} (je ${fmtGold((i ? p.g2 : p.g1) / 5)})` : ''}`));
    try { await navigator.clipboard.writeText(lines.join('\n')); toast('Ergebnis kopiert'); } catch { toast('Kopieren blockiert', 'err'); }
  }

  function editSettings() {
    const form = h(`<div class="form-grid">
      <div class="field full"><label>Name</label><input class="input" name="name" value="${esc(ev.name)}"></div>
      <div class="field full"><label>Wann</label><input class="input" name="when" value="${esc(ev.when || '')}" placeholder="z. B. Samstag, 06.12. · 19:00"></div>
      <div class="field full"><label>Infos (eine pro Zeile, erscheinen oben als Kärtchen)</label><textarea class="input" name="info" rows="3">${esc((ev.info || []).join('\n'))}</textarea></div>
    </div>`);
    openModal({ title: 'Event bearbeiten', body: form, actions: [{ label: 'Abbrechen' }, { label: 'Speichern', cls: 'btn-primary', onClick: () => {
      const v = n => form.querySelector(`[name=${n}]`).value.trim();
      save({ name: v('name') || 'Event', when: v('when'), info: v('info').split('\n').map(x => x.trim()).filter(Boolean) }, true);
      draw();
    } }] });
  }

  async function createEvent() {
    const form = h(`<div class="form-grid">
      <div class="field full"><label>Name</label><input class="input" name="name" value="Paranøia MDI"></div>
      <div class="field full"><label>Wann</label><input class="input" name="when" placeholder="z. B. Samstag, 06.12. · 19:00"></div>
      <div class="field"><label>Startgebühr (Gold)</label><input class="input" type="number" name="fee" value="50000" step="1000"></div>
      <div class="field"><label>Anteil Platz 1 (%)</label><input class="input" type="number" name="share" value="75"></div>
      <p class="hint full">Das Event startet ausgeschaltet. Erst mit „Event aktiv“ sehen es die Raider.</p>
    </div>`);
    openModal({ title: 'Neues Event', body: form, actions: [{ label: 'Abbrechen' }, { label: 'Anlegen', cls: 'btn-primary', onClick: async () => {
      const v = n => form.querySelector(`[name=${n}]`).value.trim();
      const id = await store.add('events', newEvent({ name: v('name') || 'Paranøia MDI', when: v('when'), fee: +v('fee') || 0, share: +v('share') || 75 }));
      location.hash = `#/event/${id}`;
    } }] });
  }

  const unsub = [
    store.watchDoc('settings', 'main', s => { settings = s || {}; draw(); }),
    store.watchCol('players', ps => { players = ps; if (ev && !focusLock) drawChips(); }),
    store.watchCol('events', es => { events = es; draw(); }, () => { body.innerHTML = '<div class="empty">Events konnten nicht geladen werden.</div>'; }),
  ];
  return () => { clearInterval(iv); clearTimeout(saveT); if (pending && evId) store.set('events', evId, pending); unsub.forEach(u => u()); };
}
