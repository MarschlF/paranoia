// ─────────────────────────────────────────────────────────────
//  Logs (Offi): Raidabende mit Warcraft-Logs-Links, Pulls und Notizen
//  + Defensive-Check: Defensives, Healthstones, Tränke und Tode pro Spieler
// ─────────────────────────────────────────────────────────────
import { store, auth } from '../store.js';
import { esc, h, raidDates, todayIso, fmtDate, fmtShort, parseIso, WD, toast, openModal, clsColor, specImg } from '../ui.js';
import { getWcl } from '../wcl.js';
import { CHECK_GROUPS, groupsFrom, getCheck, aggregate, setDemoPlayers } from '../checks.js';
import { DEMO_MODE } from '../config.js';

const ss = { get: k => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} } };

export function render(root) {
  const officer = auth.isOfficer;   // Raider sehen nur die Abende mit Links – ohne Notizen, VoDs und Defensive-Check
  const el = h(`
    <div class="container page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Intern</div>
          <h2 class="page-title">Logs</h2>
          <p class="page-sub">${officer ? 'Alle Raidabende mit Warcraft Logs, Pulls und euren Notizen – plus Defensive- & Consumable-Check pro Spieler.' : 'Alle Raidabende mit direktem Link zum Log auf Warcraft Logs.'}</p>
          <p class="wcl-note" data-wcl></p>
        </div>
      </div>
      <div class="guide-tabs ${officer ? '' : 'hidden'}" data-tabs>
        <button class="guide-tab" data-view="nights">Raidabende</button>
        <button class="guide-tab" data-view="check">Defensive-Check</button>
      </div>
      <div data-nights>
        <div class="tracker-toolbar"><div class="spacer"></div><button class="chip" data-only>Nur Tage mit Logs</button></div>
        <div class="card" style="overflow:auto" data-wrap><div class="loading">Lade Logs…</div></div>
      </div>
      <div data-check class="hidden">
        <div class="tracker-toolbar">
          <div class="legend">
            <select class="select" data-range style="width:auto;height:32px;font-size:13px">
              <option value="1">Letzter Abend</option>
              <option value="4">Letzte 4 Abende</option>
              <option value="all">Ganze Season</option>
            </select>
            <select class="select" data-diff style="width:auto;height:32px;font-size:13px">
              <option>Mythic</option><option>Heroic</option>
            </select>
            <button class="chip active" data-roster title="Nur Spieler aus dem Roster (keine Trials/Randoms)">Nur Roster</button>
          </div>
          <div class="spacer"></div>
          <button class="btn btn-ghost btn-sm" data-edit-abil>Fähigkeiten bearbeiten</button>
        </div>
        <div class="card" style="overflow:auto" data-cwrap></div>
        <p class="hint" style="margin-top:10px">Pro Pull = Nutzungen geteilt durch Pulls, an denen der Spieler dabei war. „Erster Tod“ = wie oft jemand als Erster gestorben ist. Farben vergleichen mit dem Raid-Schnitt (Tanks ausgenommen). Zeile anklicken für die einzelnen Fähigkeiten.</p>
      </div>
    </div>`);
  root.appendChild(el);
  const $ = s => el.querySelector(s);

  let settings = null, days = {}, wcl, onlyLogs = false, wclFor = null, vodsByDate = {}, players = [], checksDoc = null;
  let view = officer ? (ss.get('pn-logs-view') || 'nights') : 'nights';
  let range = ss.get('pn-check-range') || '4', diff = ss.get('pn-check-diff') || 'Mythic', onlyRoster = true;
  const wrap = $('[data-wrap]');
  const groups = () => groupsFrom(checksDoc);

  // ── Tabs ──────────────────────────────────────────────────
  function setView(v) {
    view = v; ss.set('pn-logs-view', v);
    el.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === v));
    $('[data-nights]').classList.toggle('hidden', v !== 'nights');
    $('[data-check]').classList.toggle('hidden', v !== 'check');
    if (v === 'check') drawCheck();
  }
  el.querySelectorAll('[data-view]').forEach(b => b.onclick = () => setView(b.dataset.view));
  $('[data-only]').onclick = e => { onlyLogs = !onlyLogs; e.target.classList.toggle('active', onlyLogs); draw(); };
  $('[data-range]').value = range;
  $('[data-diff]').value = diff;
  $('[data-range]').onchange = e => { range = e.target.value; ss.set('pn-check-range', range); drawCheck(); };
  $('[data-diff]').onchange = e => { diff = e.target.value; ss.set('pn-check-diff', diff); drawCheck(); };
  $('[data-roster]').onclick = e => { onlyRoster = !onlyRoster; e.target.classList.toggle('active', onlyRoster); drawCheck(); };
  $('[data-edit-abil]').onclick = () => editAbilities(checksDoc);

  const reportsByDate = () => {
    const byDate = {};
    (wcl?.reports || []).forEach(r => (byDate[r.date] ||= []).push(r));
    return byDate;
  };

  // ── Raidabende ────────────────────────────────────────────
  function draw() {
    if (!settings) return;
    const note = $('[data-wcl]');
    if (wcl?.configured) note.innerHTML = `<span class="wcl-dot"></span>Logs werden automatisch geladen${wcl.demo ? ' (Beispieldaten)' : ''} · Stand ${new Date(wcl.updated).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}`;
    else if (wcl !== undefined) note.textContent = 'Warcraft Logs ist noch nicht verbunden – Notizen funktionieren trotzdem.';

    const today = todayIso();
    const byDate = reportsByDate();
    let dates = [...new Set([...raidDates(settings).filter(d => d <= today), ...Object.keys(byDate)])].sort().reverse();
    if (onlyLogs) dates = dates.filter(d => byDate[d]);

    if (!dates.length) { wrap.innerHTML = '<div class="empty" style="border:none"><div class="big">📈</div>Noch keine vergangenen Raidabende.</div>'; return; }

    wrap.innerHTML = `
      <table class="logs-table">
        <thead><tr><th>Datum</th><th>Schwierigkeit</th><th>Pulls</th><th>${officer ? 'Logs & Analyse' : 'Logs'}</th>${officer ? '<th style="width:40%">Notiz</th>' : ''}</tr></thead>
        <tbody>
          ${dates.map(d => {
            const reps = byDate[d] || [];
            const dif = reps.map(r => r.difficulty).sort((a, b) => rank(b) - rank(a))[0] || '';
            const pulls = sumPulls(reps, dif);
            return `<tr class="${reps.length ? '' : 'no-log'}">
              <td><span class="log-date"><span class="wd">${WD[parseIso(d).getDay()]}</span>${fmtDate(d)}</span></td>
              <td>${dif ? `<span class="diff-tag diff-${dif}">${dif}</span>` : '<span class="muted">–</span>'}</td>
              <td class="pull-count">${pulls ? `${pulls.pulls} Pulls${pulls.kills ? ` · <span class="k">${pulls.kills} Kill${pulls.kills > 1 ? 's' : ''}</span>` : ''}` : '<span class="muted">–</span>'}</td>
              <td><div class="log-links">${reps.length ? reps.map(r => `
                <a class="log-btn wcl" href="${esc(r.url)}" target="_blank" rel="noopener" title="${esc(r.title)}">Warcraft Logs</a>
                ${r.demo || !officer ? '' : `<a class="log-btn" href="https://www.wipefest.gg/report/${esc(r.code)}" target="_blank" rel="noopener">Wipefest</a>
                <a class="log-btn" href="https://wowanalyzer.com/report/${esc(r.code)}" target="_blank" rel="noopener">WoWAnalyzer</a>`}`).join('')
                : 'Kein Log hochgeladen'}${officer && pulls?.pulls && (dif === 'Mythic' || dif === 'Heroic') ? `<button class="log-btn dc-btn" data-night="${d}" title="Defensives, Healthstones, Tränke und Tode an diesem Abend">🛡 Check</button>` : ''}${(officer ? vodsByDate[d] || [] : []).map(v => `<a class="log-btn vod" href="#/vods/${encodeURIComponent(v.id)}" title="${esc(v.title || '')}">▶ VoD${v.pov ? ` ${esc(v.pov)}` : ''}</a>`).join('')}</div></td>
              ${officer ? `<td><input class="note-input" data-note="${d}" value="${esc(days[d]?.note || '')}" placeholder="Notiz hinzufügen…"></td>` : ''}
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;

    wrap.querySelectorAll('[data-note]').forEach(inp => inp.addEventListener('change', async () => {
      await store.set('raidDays', inp.dataset.note, { note: inp.value.trim() });
      toast('Notiz gespeichert');
    }));
    wrap.querySelectorAll('[data-night]').forEach(b => b.onclick = () => openNight(b.dataset.night));
  }

  function updateNotes() {
    wrap.querySelectorAll('[data-note]').forEach(inp => {
      if (document.activeElement !== inp) inp.value = days[inp.dataset.note]?.note || '';
    });
  }

  // ── Check: ein Abend (Modal) ──────────────────────────────
  async function openNight(d) {
    const reps = reportsByDate()[d] || [];
    const dif = reps.map(r => r.difficulty).sort((a, b) => rank(b) - rank(a))[0] || 'Mythic';
    const body = h(`<div><div class="loading">Lade Check…</div></div>`);
    openModal({ title: `Defensive-Check · ${WD[parseIso(d).getDay()]} ${fmtDate(d)} · ${dif}`, body, wide: true });
    const g = groups();
    const res = await Promise.all(reps.filter(r => r.pulls?.[dif]).map(r => getCheck(r, g, dif)));
    if (!body.isConnected) return;
    if (res.some(r => r === null) && !res.some(Boolean)) { body.innerHTML = '<div class="empty" style="border:none">Check konnte nicht geladen werden – Warcraft Logs verbunden?</div>'; return; }
    body.innerHTML = '';
    body.appendChild(checkTable(aggregate(res, g), g, players, { onlyRoster: true, nights: false }));
  }

  // ── Check: Zeitraum ───────────────────────────────────────
  let checkRun = 0;
  async function drawCheck() {
    if (view !== 'check' || !settings || wcl === undefined) return;
    const box = $('[data-cwrap]');
    if (!wcl?.configured) { box.innerHTML = '<div class="empty" style="border:none"><div class="big">🛡️</div>Warcraft Logs ist noch nicht verbunden.</div>'; return; }
    const reps = (wcl.reports || []).filter(r => r.pulls?.[diff]?.pulls);
    const dates = [...new Set(reps.map(r => r.date))].sort().reverse();
    const pick = range === 'all' ? dates : dates.slice(0, Number(range));
    const use = reps.filter(r => pick.includes(r.date));
    if (!use.length) { box.innerHTML = `<div class="empty" style="border:none"><div class="big">🛡️</div>Keine ${esc(diff)}-Logs in diesem Zeitraum.</div>`; return; }

    const run = ++checkRun, g = groups();
    let done = 0;
    box.innerHTML = `<div class="loading" data-prog>Lade ${use.length} Report${use.length > 1 ? 's' : ''}…</div>`;
    const results = [];
    for (let i = 0; i < use.length; i += 4) {
      const part = await Promise.all(use.slice(i, i + 4).map(r => getCheck(r, g, diff).then(x => { done++; const p = box.querySelector('[data-prog]'); if (p) p.textContent = `Lade Reports… ${done}/${use.length}`; return x; })));
      results.push(...part);
      if (run !== checkRun) return;
    }
    if (run !== checkRun || view !== 'check') return;
    const agg = aggregate(results, g);
    const span = pick.length > 1 ? `${fmtShort(pick.at(-1))} – ${fmtShort(pick[0])}` : fmtDate(pick[0]);
    box.innerHTML = '';
    box.appendChild(h(`<div class="dc-head"><strong>${pick.length} Abend${pick.length > 1 ? 'e' : ''}</strong> · ${esc(span)} · ${agg.pulls} ${esc(diff)}-Pulls${results.some(r => r === null) ? ' · <span style="color:var(--red)">einige Reports nicht geladen</span>' : ''}</div>`));
    box.appendChild(checkTable(agg, g, players, { onlyRoster, nights: pick.length > 1 }));
  }

  const unsubs = [
    store.watchDoc('settings', 'main', s => {
      settings = s || {};
      if (settings.startDate && wclFor !== settings.startDate) {
        wclFor = settings.startDate;
        getWcl(settings).then(d => { wcl = d; draw(); drawCheck(); });
      }
      draw();
    }),
    officer && store.watchDoc('settings', 'checks', c => { const changed = checksDoc !== null || c; checksDoc = c; if (changed) drawCheck(); }),
    officer && store.watchCol('players', ps => { players = ps; if (DEMO_MODE) setDemoPlayers(ps); }),
    officer && store.watchCol('vods', vs => {
      vodsByDate = {};
      vs.forEach(v => (vodsByDate[v.date] ||= []).push(v));
      draw();
    }),
    officer && store.watchCol('raidDays', ds => {
      const first = !Object.keys(days).length;
      days = Object.fromEntries(ds.map(d => [d.id, d]));
      first ? draw() : updateNotes();
    }),
  ];
  setView(view);
  return () => { checkRun++; unsubs.forEach(u => u && u()); };
}

// ── Tabelle ──────────────────────────────────────────────────
function checkTable(agg, groups, players, { onlyRoster, nights }) {
  const roster = new Map();
  players.forEach(p => roster.set(String(p.charName || p.name).toLowerCase(), p));
  let rows = [...agg.players.values()].map(a => ({ a, p: roster.get(a.name.toLowerCase()) || null }));
  if (onlyRoster) rows = rows.filter(r => r.p);

  const per = (n, r) => r.a.pulls ? n / r.a.pulls : 0;
  const isTank = r => r.p?.rolle === 'Tank';
  const avg = f => { const v = rows.filter(r => !isTank(r) && r.a.pulls).map(f); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : 0; };
  const avgDef = avg(r => per(r.a.g.def?.total || 0, r));
  const avgDeath = avg(r => per(r.a.deaths, r));

  const cols = [
    { k: 'name', l: 'Spieler', v: r => r.p?.name || r.a.name, txt: true },
    ...(nights ? [{ k: 'nights', l: 'Abende', v: r => r.a.nights }] : []),
    { k: 'pulls', l: 'Pulls', v: r => r.a.pulls },
    { k: 'deaths', l: 'Tode', v: r => r.a.deaths },
    { k: 'dpp', l: 'Tode/Pull', v: r => per(r.a.deaths, r), fmt: v => v.toFixed(2), cls: (v, r) => isTank(r) ? '' : v > avgDeath * 1.5 && v > .15 ? 'bad' : v < avgDeath * .6 ? 'good' : '' },
    { k: 'first', l: 'Erster Tod', v: r => r.a.firstDeaths, cls: v => v >= 3 ? 'bad' : '' },
    ...groups.map(g => g.perPull
      ? { k: g.key, l: `${g.label}/Pull`, title: g.label, v: r => per(r.a.g[g.key].total, r), fmt: (v, r) => `${v.toFixed(2)} <small class="muted">(${r.a.g[g.key].total})</small>`,
          cls: (v, r) => g.key === 'def' ? (isTank(r) ? 'tank' : v < avgDef * .5 ? 'bad' : v < avgDef * .8 ? 'mid' : 'good') : (v < .5 ? 'bad' : v < .8 ? 'mid' : '') }
      : { k: g.key, l: g.label, v: r => r.a.g[g.key].total, cls: v => v ? '' : 'zero' }),
  ];

  const el = h(`<div class="dc-wrap"></div>`);
  let sortK = 'def', asc = true;
  const open = new Set();
  function paint() {
    const col = cols.find(c => c.k === sortK) || cols[0];
    const list = rows.slice().sort((x, y) => {
      const a = col.v(x), b = col.v(y);
      const c = col.txt ? String(a).localeCompare(String(b)) : a - b;
      return (asc ? c : -c) || String(x.a.name).localeCompare(y.a.name);
    });
    if (!list.length) { el.innerHTML = '<div class="empty" style="border:none">Keine Spieler gefunden – „Nur Roster“ ausschalten oder Charakternamen im Roster prüfen.</div>'; return; }
    el.innerHTML = `<table class="dc-table"><thead><tr>${cols.map(c => `<th data-s="${c.k}" class="${c.k === sortK ? 'sorted' : ''}" title="${esc(c.title || c.l)} – klicken zum Sortieren">${esc(c.l)}${c.k === sortK ? (asc ? ' ↑' : ' ↓') : ''}</th>`).join('')}</tr></thead><tbody>
      ${list.map(r => {
        const k = r.a.name.toLowerCase();
        const nameCell = r.p
          ? `<div class="pname-inner" style="--cls:${clsColor(r.p.klasse)}">${specImg(r.p, 20)}<span class="nm">${esc(r.p.name)}</span>${isTank(r) ? '<span class="dc-tank">Tank</span>' : ''}</div>`
          : `<span class="muted">${esc(r.a.name)}</span> <small class="muted">(nicht im Roster)</small>`;
        return `<tr class="dc-row ${open.has(k) ? 'open' : ''}" data-k="${esc(k)}">${cols.map((c, i) => {
          if (i === 0) return `<td>${nameCell}</td>`;
          const v = c.v(r);
          return `<td class="num ${c.cls ? c.cls(v, r) : ''}">${c.fmt ? c.fmt(v, r) : v}</td>`;
        }).join('')}</tr>
        ${open.has(k) ? `<tr class="dc-detail"><td colspan="${cols.length}"><div class="dc-break">${groups.map(g => {
          const by = Object.entries(r.a.g[g.key].by).sort((a, b) => b[1] - a[1]);
          return `<div><div class="dc-break-h">${esc(g.label)}</div>${by.length ? by.map(([n, v]) => `<div class="side-row"><span>${esc(n)}</span><span>${v}</span></div>`).join('') : '<div class="muted" style="font-size:13px">nichts genutzt</div>'}</div>`;
        }).join('')}</div></td></tr>` : ''}`;
      }).join('')}
    </tbody></table>`;
    el.querySelectorAll('[data-s]').forEach(th => th.onclick = () => {
      if (sortK === th.dataset.s) asc = !asc; else { sortK = th.dataset.s; asc = th.dataset.s === 'name' || ['def', 'dps', 'hs', 'heal'].includes(th.dataset.s); }
      paint();
    });
    el.querySelectorAll('.dc-row').forEach(tr => tr.onclick = () => { const k = tr.dataset.k; open.has(k) ? open.delete(k) : open.add(k); paint(); });
  }
  paint();
  return el;
}

// ── Fähigkeiten bearbeiten ───────────────────────────────────
function editAbilities(doc) {
  const g = groupsFrom(doc);
  const body = h(`<div>
    <p class="hint" style="margin-bottom:14px">Eine Fähigkeit pro Zeile – <strong>englischer Name wie in Warcraft Logs</strong> oder die Spell-ID (Zahl, z. B. von Wowhead).
    Tipp: In einem Log unter <em>Casts</em> nachsehen, wie ein Trank genau heißt.</p>
    <div class="dc-edit">${g.map(x => `<div class="field"><label>${esc(x.label)} <span class="muted">(${x.entries.length})</span></label>
      <textarea class="textarea" rows="${x.key === 'def' ? 14 : 6}" data-k="${x.key}">${esc(x.entries.join('\n'))}</textarea></div>`).join('')}</div>
  </div>`);
  openModal({
    title: 'Fähigkeiten für den Check', body, wide: true,
    actions: [
      { label: 'Standard wiederherstellen', onClick: async () => {
        await store.set('settings', 'checks', Object.fromEntries(CHECK_GROUPS.map(x => [x.key, x.entries])));
        toast('Standardlisten wiederhergestellt');
      } },
      { label: 'Speichern', cls: 'btn-primary', onClick: async () => {
        const data = {};
        for (const ta of body.querySelectorAll('[data-k]')) {
          const list = [...new Set(ta.value.split('\n').map(s => s.trim()).filter(Boolean))];
          if (list.some(s => s.length > 60 || /["\\,]/.test(s))) { toast('Keine Anführungszeichen, Kommas oder Backslashes', 'err'); return true; }
          data[ta.dataset.k] = list;
        }
        await store.set('settings', 'checks', data);
        toast('Gespeichert');
      } },
    ],
  });
}

const rank = d => ({ Mythic: 3, Heroic: 2, Normal: 1 }[d] || 0);
function sumPulls(reps, diff) {
  if (!diff) return null;
  return reps.reduce((a, r) => {
    const p = r.pulls?.[diff]; if (p) { a.pulls += p.pulls; a.kills += p.kills; }
    return a;
  }, { pulls: 0, kills: 0 });
}
