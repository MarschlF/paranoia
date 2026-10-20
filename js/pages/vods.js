// ─────────────────────────────────────────────────────────────
//  VoDs (Offi): YouTube-Streams für die Analyse, direkt eingebettet
//  Sammlung: vods/<id> { date, title, url, boss, pov, note, created,
//                        streamStart (ISO, wann der Stream begonnen hat), streamSrc ('youtube' | 'manual'),
//                        marks: [{ t (Sekunden im Video), label }] }
//  Pro Raidabend gruppiert, mehrere POVs als Tabs. Pull-Marker kommen aus Warcraft Logs:
//  Pull-Uhrzeit − Stream-Start = Stelle im Video.
// ─────────────────────────────────────────────────────────────
import { store, auth } from '../store.js';
import { CONFIG, DEMO_MODE } from '../config.js';
import { esc, h, openModal, confirmModal, toast, fmtDate, parseIso, WD, MONTHS, todayIso, raidBosses } from '../ui.js';
import { getWcl, mergeBoss } from '../wcl.js';

const WDL = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const DIFF = { 3: 'N', 4: 'HC', 5: 'M' };

/** YouTube-ID + Startzeit aus allen gängigen Link-Formaten */
export function parseYouTube(url) {
  let u; try { u = new URL(String(url).trim()); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host.endsWith('youtube.com')) {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else { const m = u.pathname.match(/^\/(live|embed|shorts|v)\/([^/?]+)/); if (m) id = m[2]; }
  }
  if (!id || !/^[\w-]{6,20}$/.test(id)) return null;
  return { id, start: parseTime(u.searchParams.get('t') || u.searchParams.get('start')) };
}
function parseTime(t) {
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Number(t);
  const m = t.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
  return m ? (Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)) : 0;
}
/** „1:13:20“, „73:20“, „1h13m20s“ oder Sekunden → Sekunden (null wenn ungültig) */
function parseClock(s) {
  s = String(s || '').trim();
  if (/^\d+(:\d{1,2}){0,2}$/.test(s)) return s.split(':').reduce((a, x) => a * 60 + Number(x), 0);
  if (/^(\d+h)?(\d+m)?(\d+s)?$/.test(s) && s) return parseTime(s);
  return null;
}
export const fmtClock = sec => {
  sec = Math.max(0, Math.round(sec));
  const hh = Math.floor(sec / 3600), mm = Math.floor(sec / 60) % 60, ss = sec % 60;
  return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};
const fmtDur = ms => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const norm = s => String(s || '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');
const sameBoss = (a, b) => { a = norm(a); b = norm(b); return !!a && !!b && (a === b || (Math.min(a.length, b.length) > 4 && (a.includes(b) || b.includes(a)))); };

// ── Daten vom Worker ────────────────────────────────────────
const workerUrl = () => (CONFIG.authWorkerUrl || '').replace(/\/$/, '');
async function workerGet(path) {
  const t = await auth.idToken();
  const r = await fetch(workerUrl() + path, { headers: { Authorization: `Bearer ${t}` } });
  return r.ok ? r.json() : null;
}
const pullCache = {};
/** Pulls eines Abends: { pulls: [{ name, enc, diff, kill, pct, t, dur }], reports: [{ url }] } */
function getPulls(date, settings) {
  if (pullCache[date]) return pullCache[date];
  const p = DEMO_MODE ? Promise.resolve(demoPulls(date, settings))
    : !workerUrl() ? Promise.resolve(null)
    : workerGet(`/vod/pulls?date=${date}`).catch(() => null);
  pullCache[date] = p;
  p.then(d => { if (!d?.configured) delete pullCache[date]; });
  return p;
}
/** Startzeit des Livestreams von YouTube → ISO-String oder '' */
async function youtubeStart(url) {
  const yt = parseYouTube(url);
  if (!yt || DEMO_MODE || !workerUrl()) return { ok: false };
  const d = await workerGet(`/yt/meta?id=${yt.id}`).catch(() => null);
  return { ok: !!d?.configured, start: d?.start || '' };
}

// ── YouTube-Player (IFrame-API, damit wir springen und die Position lesen können) ──
let ytApiP = null;
function ytApi() {
  return ytApiP ||= new Promise(res => {
    if (window.YT?.Player) return res(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); res(window.YT); };
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(s);
  });
}

export function render(root, { params }) {
  const el = h(`
    <div class="container page">
      <div class="page-head">
        <div>
          <div class="eyebrow" style="color:var(--gold)">Offi</div>
          <h2 class="page-title">VoDs</h2>
          <p class="page-sub">Raid-Streams pro Abend – mit Sprungmarken zu jedem Pull aus Warcraft Logs.</p>
        </div>
        <div class="page-actions"><button class="btn btn-primary" data-add>+ VoD</button></div>
      </div>
      <div class="vod-chips" data-chips></div>
      <div data-body><div class="loading">Lade VoDs…</div></div>
    </div>`);
  root.appendChild(el);
  const $ = s => el.querySelector(s);

  let vods = [], allBosses = [], settings = {}, wcl = null, wclFor = null;
  let bosses = [];                         // aktueller Raid, mit WCL-Daten (encId fürs Bild)
  let selDate = null, selId = params[0] ? decodeURIComponent(params[0]) : null, bossFilter = '';
  let openMonths = null, built = false;
  let player = null, playerKey = '';       // playerKey = vodId|url → nur neu laden, wenn sich das Video ändert
  let markToken = 0;

  $('[data-add]').onclick = () => editVod(null, bosses, { date: todayIso() });

  const nightsOf = () => {
    const m = new Map();
    vods.forEach(v => { if (!m.has(v.date)) m.set(v.date, []); m.get(v.date).push(v); });
    m.forEach(list => list.sort((a, b) => (a.created || '').localeCompare(b.created || '')));
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  };
  const bossById = id => bosses.find(b => b.id === id);
  const nightHasBoss = (date, list, b) => list.some(v => v.boss === b.name)
    || (wcl?.encounters || []).some(e => sameBoss(e.name, b.wclName || b.name) && (e.nights || []).some(n => n.date === date));

  // ── Boss-Filter ────────────────────────────────────────────
  function drawChips() {
    const box = $('[data-chips]');
    if (!vods.length || !bosses.length) { box.innerHTML = ''; return; }
    box.innerHTML = `<button class="vod-chip ${bossFilter ? '' : 'on'}" data-b="">Alle Bosse</button>` + bosses.map(b => `
      <button class="vod-chip ${bossFilter === b.id ? 'on' : ''}" data-b="${esc(b.id)}">${avatar(b.encId, b.name, b.thumb)}<span>${esc(b.name)}</span></button>`).join('');
    box.querySelectorAll('[data-b]').forEach(c => c.onclick = () => { bossFilter = bossFilter === c.dataset.b ? '' : c.dataset.b; draw(); });
  }

  // ── Gesamte Seite ──────────────────────────────────────────
  function draw() {
    drawChips();
    const body = $('[data-body]');
    if (!vods.length) {
      destroyPlayer(); built = false;
      body.innerHTML = `<div class="empty vod-empty"><div class="big">🎬</div>
        <p style="margin-bottom:6px">Noch keine VoDs.</p>
        <p class="hint" style="margin:0 auto 16px;max-width:520px">YouTube-Link vom Raid-Stream einfügen (auch nicht gelistet). Bei Livestreams holt sich die Seite die Startzeit selbst und setzt zu jedem Pull aus Warcraft Logs eine Sprungmarke.</p>
        <button class="btn btn-primary" data-add2>Erstes VoD hinzufügen</button></div>`;
      body.querySelector('[data-add2]').onclick = () => editVod(null, bosses, { date: todayIso() });
      return;
    }
    const nights = nightsOf();
    const fb = bossById(bossFilter);
    const shown = fb ? nights.filter(([d, l]) => nightHasBoss(d, l, fb)) : nights;

    // Auswahl: Link auf ein VoD → dessen Abend; sonst erster sichtbarer Abend
    if (selId && !selDate) selDate = vods.find(v => v.id === selId)?.date || null;
    if (!selDate || !nights.some(([d]) => d === selDate) || (fb && !shown.some(([d]) => d === selDate))) selDate = (shown[0] || nights[0])[0];
    const night = nights.find(([d]) => d === selDate)[1];
    if (!night.some(v => v.id === selId)) selId = night[0].id;

    if (!built) {
      body.innerHTML = `<div class="vod-layout"><div class="vod-main" data-main></div><aside class="vod-side card" data-side></aside></div>`;
      built = true;
    }
    drawSide(shown, nights);
    drawMain(night);
  }

  // ── Playlist rechts: Abende nach Monat ─────────────────────
  function drawSide(shown) {
    const side = $('[data-side]');
    const ym = d => d.slice(0, 7);
    if (!openMonths) openMonths = new Set([shown[0] && ym(shown[0][0]), selDate && ym(selDate)].filter(Boolean));
    if (!shown.length) { side.innerHTML = '<div class="vod-side-empty">Keine VoDs mit diesem Boss.</div>'; return; }
    const months = [];
    shown.forEach(([d, l]) => { const k = ym(d); let m = months.at(-1); if (!m || m.k !== k) months.push(m = { k, nights: [] }); m.nights.push([d, l]); });
    side.innerHTML = `<div class="vod-side-head">Raidabende <span>${shown.length}</span></div>` + months.map(m => {
      const [y, mo] = m.k.split('-').map(Number), open = openMonths.has(m.k);
      return `<div class="vod-month ${open ? 'open' : ''}">
        <button class="vod-month-h" data-m="${m.k}"><span>${MONTHS[mo - 1]} ${y}</span><em>${m.nights.length}</em><i>▾</i></button>
        ${open ? m.nights.map(([d, l]) => {
          const yt = parseYouTube(l[0].url), dt = parseIso(d);
          const bossNames = [...new Set(l.map(v => v.boss).filter(Boolean))];
          return `<button class="vn ${d === selDate ? 'active' : ''}" data-d="${d}">
            <span class="vn-thumb">${yt ? `<img src="https://i.ytimg.com/vi/${yt.id}/mqdefault.jpg" alt="" loading="lazy" onerror="this.remove()">` : ''}<span class="vn-play">▶</span>${l.length > 1 ? `<span class="vn-count">${l.length} POV</span>` : ''}</span>
            <span class="vn-main">
              <span class="vn-date">${WD[dt.getDay()]} ${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.</span>
              <span class="vn-title">${esc(l[0].title || bossNames[0] || 'Raidabend')}</span>
              <span class="vn-povs">${esc(l.map(v => v.pov || '–').join(' · '))}</span>
            </span>
          </button>`;
        }).join('') : ''}
      </div>`;
    }).join('');
    side.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { openMonths.has(b.dataset.m) ? openMonths.delete(b.dataset.m) : openMonths.add(b.dataset.m); drawSide(shown); });
    side.querySelectorAll('[data-d]').forEach(b => b.onclick = () => {
      selDate = b.dataset.d; selId = null; draw();
      history.replaceState(null, '', `#/vods/${encodeURIComponent(selId)}`);
      if (innerWidth < 1000) $('[data-main]').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // ── Player + POVs + Marker ─────────────────────────────────
  function drawMain(night) {
    const main = $('[data-main]');
    const v = night.find(x => x.id === selId);
    const dt = parseIso(v.date);
    const key = `${v.id}|${v.url}`;
    if (!main.querySelector('[data-player]')) main.innerHTML = `
      <div class="vod-top" data-top></div>
      <div class="vod-povs" data-povs></div>
      <div class="vod-player" data-player></div>
      <div class="vod-under" data-under></div>
      <div class="card vod-marks" data-marks></div>`;

    main.querySelector('[data-top]').innerHTML = `
      <div style="min-width:0">
        <div class="vod-date">${WDL[dt.getDay()]}, ${fmtDate(v.date)}</div>
        <h3>${esc(v.title || 'Raidabend')}</h3>
      </div>
      <div class="vod-actions">
        <a class="btn btn-ghost btn-sm" href="${esc(v.url)}" target="_blank" rel="noopener">YouTube ↗</a>
        <button class="btn btn-ghost btn-sm" data-edit>Bearbeiten</button>
        <button class="btn btn-ghost btn-sm vod-del" data-del title="VoD löschen">Löschen</button>
      </div>`;
    main.querySelector('[data-edit]').onclick = () => editVod(v, bosses);
    main.querySelector('[data-del]').onclick = async () => {
      if (await confirmModal('VoD löschen?', `„${v.title || fmtDate(v.date)}"${v.pov ? ` (POV ${v.pov})` : ''} wird entfernt. Das Video auf YouTube bleibt unberührt.`)) {
        await store.remove('vods', v.id); selId = null; toast('VoD gelöscht');
      }
    };

    const povs = main.querySelector('[data-povs]');
    povs.innerHTML = night.map(x => `<button class="vod-pov ${x.id === v.id ? 'on' : ''}" data-pov="${esc(x.id)}">
        <span class="vod-pov-dot ${x.streamStart ? 'ok' : ''}" title="${x.streamStart ? 'Pull-Marker synchron' : 'Noch nicht synchron'}"></span>${esc(x.pov || 'Stream')}${x.boss ? `<em>${esc(x.boss)}</em>` : ''}</button>`).join('')
      + `<button class="vod-pov add" data-addpov title="Weitere Perspektive für diesen Abend">+ POV</button>`;
    povs.querySelectorAll('[data-pov]').forEach(b => b.onclick = () => {
      if (b.dataset.pov === v.id) return;
      const next = night.find(x => x.id === b.dataset.pov);
      // Gleicher Moment in der anderen Perspektive (wenn beide synchron sind)
      let at = 0;
      if (player && v.streamStart && next.streamStart) at = Math.max(0, (Date.parse(v.streamStart) + player.time() * 1000 - Date.parse(next.streamStart)) / 1000);
      selId = next.id;
      history.replaceState(null, '', `#/vods/${encodeURIComponent(selId)}`);
      mountPlayer(next, at); playerKey = `${next.id}|${next.url}`;
      drawMain(night);
      if (at) toast(`Gleiche Stelle bei ${next.pov || 'dieser POV'}: ${fmtClock(at)}`);
    });
    povs.querySelector('[data-addpov]').onclick = () => editVod(null, bosses, { date: v.date, title: v.title, boss: v.boss });

    if (playerKey !== key) { mountPlayer(v, 0); playerKey = key; }
    drawMarks(v);
  }

  function destroyPlayer() { try { player?.destroy(); } catch {} player = null; playerKey = ''; }

  function mountPlayer(v, at) {
    destroyPlayer();
    const box = $('[data-player]');
    const yt = parseYouTube(v.url);
    if (!yt) { box.innerHTML = '<div class="vod-frame vod-placeholder"><span>Kein gültiger YouTube-Link.</span></div>'; return; }
    const start = Math.floor(at || yt.start || 0);
    if (DEMO_MODE) {
      // Vorschau: YouTube lässt sich hier nicht einbetten → Platzhalter, der die Sprünge anzeigt
      let pos = start;
      box.innerHTML = `<div class="vod-frame vod-placeholder vod-fake">
        <span class="play">▶</span>
        <span class="vod-fake-pos" data-pos>${fmtClock(pos)}</span>
        <span>Vorschau: YouTube kann hier nicht eingebettet werden.<br>Auf der Live-Seite springt das Video bei Klick auf einen Pull genau an diese Stelle.</span>
      </div>`;
      const upd = () => { const p = box.querySelector('[data-pos]'); if (p) p.textContent = fmtClock(pos); };
      player = { seek: s => { pos = s; upd(); }, time: () => pos, destroy() {} };
      return;
    }
    box.innerHTML = '<div class="vod-frame"><div data-yt></div></div>';
    let p = null, pending = null, dead = false;
    const wrap = {
      seek: s => { if (p?.seekTo) { p.seekTo(s, true); p.playVideo?.(); } else pending = s; },
      time: () => (p?.getCurrentTime ? p.getCurrentTime() : 0),
      destroy: () => { dead = true; p?.destroy?.(); },
    };
    player = wrap;
    ytApi().then(YT => {
      if (dead) return;
      p = new YT.Player(box.querySelector('[data-yt]'), {
        host: 'https://www.youtube-nocookie.com', videoId: yt.id, width: '100%', height: '100%',
        playerVars: { rel: 0, playsinline: 1, start },
        events: { onReady: () => { if (pending != null) { wrap.seek(pending); pending = null; } } },
      });
    });
  }

  // ── Pull-Marker ────────────────────────────────────────────
  async function drawMarks(v) {
    const box = $('[data-marks]'), under = $('[data-under]');
    const my = ++markToken;
    if (!box.dataset.for || box.dataset.for !== v.id) box.innerHTML = '<div class="loading">Lade Pulls aus Warcraft Logs…</div>';
    box.dataset.for = v.id;
    const d = await getPulls(v.date, settings);
    if (my !== markToken) return;

    under.innerHTML = `${v.note ? `<p class="vod-note">${esc(v.note)}</p>` : ''}${(d?.reports || []).map(r => `<a class="log-btn" href="${esc(r.url)}" target="_blank" rel="noopener">Warcraft Logs ↗</a>`).join('')}`;

    const base = v.streamStart ? Date.parse(v.streamStart) : null;
    const fb = bossById(bossFilter);
    const filterName = fb ? (fb.wclName || fb.name) : v.boss;
    const count = {};
    let pulls = (d?.pulls || []).map(p => { const k = `${p.enc}|${p.diff}`; count[k] = (count[k] || 0) + 1; return { ...p, n: count[k] }; });
    if (filterName) pulls = pulls.filter(p => sameBoss(p.name, filterName) || sameBoss(p.name, fb?.name));

    const rows = [
      ...pulls.map((p, i) => ({ kind: 'pull', p, i, t: base != null ? (p.t - base) / 1000 : null })),
      ...(v.marks || []).map((m, i) => ({ kind: 'mark', m, i, t: m.t })),
    ].sort((a, b) => (a.t ?? 1e12) - (b.t ?? 1e12) || (a.p?.t || 0) - (b.p?.t || 0));

    const synced = base != null;
    const status = synced
      ? `<span class="vm-sync ok">✓ Synchron${v.streamSrc === 'youtube' ? ' · Startzeit von YouTube' : ' · von Hand gesetzt'}</span>`
      : `<span class="vm-sync">Noch nicht synchron</span>`;
    const help = !d?.configured && !DEMO_MODE ? '<p class="hint vm-help">Warcraft Logs ist nicht verbunden – nur eigene Marker möglich.</p>'
      : !pulls.length ? `<p class="hint vm-help">${filterName ? `Keine Pulls auf ${esc(filterName)} an diesem Abend.` : 'Für diesen Abend gibt es (noch) kein Log mit Bosspulls.'}</p>`
      : synced ? '' : `<p class="hint vm-help">Spul im Video zum Beginn eines Pulls und klick in dessen Zeile auf <b>📍</b> – danach stimmen alle Marker.${DEMO_MODE ? '' : ' <button class="link-btn" data-ytsync>Startzeit von YouTube holen</button>'}</p>`;

    box.innerHTML = `
      <div class="vm-head">
        <div class="hi-title" style="margin:0">Pulls & Marker${pulls.length ? ` <span class="muted">· ${pulls.length}${filterName ? ` auf ${esc(filterName)}` : ''}</span>` : ''}</div>
        ${pulls.length ? status : ''}
        <button class="btn btn-ghost btn-sm" data-mark>+ Marker hier</button>
      </div>
      ${help}
      ${rows.length ? `<div class="vm-list">${rows.map(r => r.kind === 'mark' ? `
        <div class="vm-row mark">
          <button class="vm-time" data-seek="${r.t}">${fmtClock(r.t)}</button>
          <span class="vm-ava mark">★</span>
          <span class="vm-name">${esc(r.m.label || 'Marker')}</span>
          <span></span><span></span>
          <button class="vm-pin" data-unmark="${r.i}" title="Marker entfernen">×</button>
        </div>` : (() => {
          const p = r.p, out = r.t != null && r.t < 0;
          return `
        <div class="vm-row ${p.kill ? 'kill' : ''} ${out ? 'out' : ''}">
          ${r.t != null && !out ? `<button class="vm-time" data-seek="${r.t}">${fmtClock(r.t)}</button>` : `<span class="vm-time off" title="${out ? 'Vor dem Start dieses Streams' : 'Noch nicht synchron'}">–:––:––</span>`}
          ${avatar(p.enc, p.name)}
          <span class="vm-name">${esc(p.name)} <em>#${p.n}</em>${DIFF[p.diff] && p.diff !== 5 ? ` <small>${DIFF[p.diff]}</small>` : ''}</span>
          <span class="vm-res">${p.kill ? '<b>KILL</b>' : p.pct != null ? `${String(p.pct).replace('.', ',')} %` : ''}</span>
          <span class="vm-dur">${fmtDur(p.dur)}</span>
          <button class="vm-pin" data-pin="${r.i}" title="Dieser Pull beginnt an der aktuellen Stelle im Video">📍</button>
        </div>`;
        })()).join('')}</div>` : ''}`;

    box.querySelectorAll('[data-seek]').forEach(b => b.onclick = () => {
      player?.seek(Number(b.dataset.seek));
      box.querySelectorAll('.vm-row.cur').forEach(x => x.classList.remove('cur'));
      b.closest('.vm-row').classList.add('cur');
      if (innerWidth < 1000) $('[data-player]').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    box.querySelectorAll('[data-pin]').forEach(b => b.onclick = () => pinPull(v, pulls[Number(b.dataset.pin)]));
    box.querySelectorAll('[data-unmark]').forEach(b => b.onclick = async () => {
      const marks = (v.marks || []).filter((_, i) => i !== Number(b.dataset.unmark));
      await store.set('vods', v.id, { marks });
    });
    box.querySelector('[data-mark]').onclick = () => addMark(v);
    box.querySelector('[data-ytsync]')?.addEventListener('click', async e => {
      e.target.disabled = true; e.target.textContent = 'Frage YouTube…';
      const r = await youtubeStart(v.url);
      if (r.start) { await store.set('vods', v.id, { streamStart: r.start, streamSrc: 'youtube' }); toast('Synchron – Startzeit von YouTube übernommen'); }
      else { toast(!r.ok ? 'YouTube-Abfrage ist im Worker nicht eingerichtet' : 'Kein Livestream – bitte mit 📍 von Hand setzen', 'err'); e.target.disabled = false; e.target.textContent = 'Startzeit von YouTube holen'; }
    });
  }

  /** „Dieser Pull beginnt bei …“ → daraus Stream-Start berechnen, alle anderen Marker folgen */
  function pinPull(v, p) {
    const form = h(`<div class="form-grid">
      <div class="field full"><label>${esc(p.name)} #${p.n} beginnt im Video bei</label>
        <input class="input" name="t" value="${fmtClock(player?.time() || 0)}" placeholder="h:mm:ss"></div>
      <p class="hint full">Vorausgefüllt mit der aktuellen Stelle im Video. Am besten den Moment nehmen, in dem der Boss gepullt wird – ein paar Sekunden daneben sind egal.</p>
    </div>`);
    openModal({ title: 'Marker ausrichten', body: form, actions: [{ label: 'Abbrechen' }, { label: 'Übernehmen', cls: 'btn-primary', onClick: async () => {
      const sec = parseClock(form.querySelector('[name=t]').value);
      if (sec == null) { toast('Zeit bitte als h:mm:ss', 'err'); return true; }
      await store.set('vods', v.id, { streamStart: new Date(p.t - sec * 1000).toISOString(), streamSrc: 'manual' });
      toast('Synchron – alle Pull-Marker angepasst');
    } }] });
  }

  function addMark(v) {
    const form = h(`<div class="form-grid">
      <div class="field"><label>Zeit im Video</label><input class="input" name="t" value="${fmtClock(player?.time() || 0)}"></div>
      <div class="field"><label>Beschriftung</label><input class="input" name="label" maxlength="80" placeholder="z. B. Wipe durch Soak P2"></div>
    </div>`);
    openModal({ title: 'Eigener Marker', body: form, actions: [{ label: 'Abbrechen' }, { label: 'Speichern', cls: 'btn-primary', onClick: async () => {
      const t = parseClock(form.querySelector('[name=t]').value);
      if (t == null) { toast('Zeit bitte als h:mm:ss', 'err'); return true; }
      const label = form.querySelector('[name=label]').value.trim() || 'Marker';
      await store.set('vods', v.id, { marks: [...(v.marks || []), { t, label }].sort((a, b) => a.t - b.t) });
      toast('Marker gespeichert');
    } }] });
  }

  // ── Daten ──────────────────────────────────────────────────
  const recalcBosses = () => { bosses = raidBosses(allBosses, settings.currentRaid || '', settings).map(b => mergeBoss(b, wcl)); };
  const unsubs = [
    store.watchCol('vods', vs => { vods = vs.sort((a, b) => (b.date || '').localeCompare(a.date || '')); draw(); }),
    store.watchCol('bosses', bs => { allBosses = bs; recalcBosses(); if (vods.length) draw(); }),
    store.watchDoc('settings', 'main', st => {
      settings = st || {}; recalcBosses(); if (vods.length) draw();
      if (settings.startDate && wclFor !== settings.startDate) {
        wclFor = settings.startDate;
        getWcl(settings).then(d => { wcl = d; recalcBosses(); if (vods.length) draw(); });
      }
    }),
  ];
  return () => { unsubs.forEach(u => u()); destroyPlayer(); markToken++; };
}

/** Boss-Porträt von Warcraft Logs, sonst eigenes Vorschaubild, sonst Anfangsbuchstabe */
function avatar(encId, name, thumb = '') {
  const wcl = encId ? `https://assets.rpglogs.com/img/warcraft/bosses/${Number(encId)}-icon.jpg` : '';
  const first = wcl || thumb, next = wcl && thumb ? thumb : '';
  return `<span class="vm-ava" data-init="${esc(String(name || '?').trim()[0] || '?')}">${first ? `<img src="${first}" alt="" loading="lazy" ${next ? `data-next="${next}"` : ''} onerror="if(this.dataset.next){this.src=this.dataset.next;this.removeAttribute('data-next')}else{this.remove()}">` : ''}</span>`;
}

function editVod(vod, bosses, prefill = {}) {
  const v = vod || { date: todayIso(), title: '', url: '', boss: '', pov: '', note: '', ...prefill };
  const form = h(`
    <div class="form-grid">
      <div class="field full"><label>YouTube-Link</label><input class="input" name="url" value="${esc(v.url)}" placeholder="https://www.youtube.com/live/… oder youtu.be/… (nicht gelistet geht auch)"></div>
      <div class="field"><label>Datum (Raidabend)</label><input class="input" type="date" name="date" value="${esc(v.date)}"></div>
      <div class="field"><label>POV (wessen Stream)</label><input class="input" name="pov" value="${esc(v.pov || '')}" placeholder="z. B. Marschl"></div>
      <div class="field"><label>Titel</label><input class="input" name="title" value="${esc(v.title || '')}" placeholder="z. B. Mythic Prog Abend 3"></div>
      <div class="field"><label>Boss <span class="muted">(blendet nur dessen Pulls ein)</span></label><select class="select" name="boss">
        <option value="">– ganzer Abend –</option>
        ${bosses.map(b => `<option ${b.name === v.boss ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}
      </select></div>
      <div class="field full"><label>Notiz</label><input class="input" name="note" value="${esc(v.note || '')}" placeholder="z. B. Callouts ab Phase 2 nochmal anhören"></div>
      <p class="hint full">Bei YouTube-Livestreams werden die Pull-Marker automatisch gesetzt. Bei normal hochgeladenen Videos einmal im Video auf einen Pull spulen und 📍 drücken.</p>
    </div>`);
  openModal({
    title: vod ? 'VoD bearbeiten' : 'Neues VoD', body: form,
    actions: [{ label: 'Abbrechen' }, { label: 'Speichern', cls: 'btn-primary', onClick: async () => {
      const g = n => form.querySelector(`[name=${n}]`).value.trim();
      if (!parseYouTube(g('url'))) { toast('Bitte einen gültigen YouTube-Link einfügen', 'err'); return true; }
      if (!g('date')) { toast('Datum fehlt', 'err'); return true; }
      const data = { url: g('url'), date: g('date'), boss: g('boss'), title: g('title'), pov: g('pov'), note: g('note') };
      const newVideo = !vod || parseYouTube(vod.url)?.id !== parseYouTube(data.url).id;
      let synced = !newVideo && !!vod?.streamStart;
      if (newVideo) {
        data.streamStart = ''; data.streamSrc = '';
        const r = await youtubeStart(data.url).catch(() => ({}));
        if (r.start) { data.streamStart = r.start; data.streamSrc = 'youtube'; synced = true; }
      }
      if (vod) await store.set('vods', vod.id, data);
      else await store.add('vods', { ...data, marks: [], created: new Date().toISOString() });
      toast(synced ? 'VoD gespeichert · Pull-Marker synchron' : 'VoD gespeichert · Marker mit 📍 ausrichten');
    } }],
  });
}

// ── Beispiel-Pulls für die Vorschau ─────────────────────────
function demoPulls(date, settings) {
  let seed = [...date].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const [hh, mm] = (settings.raidStart || '19:45').split(':').map(Number);
  let t = new Date(`${date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`).getTime() + 9 * 60e3;
  const end = t + 3 * 3600e3;
  const bosses = [{ enc: 3, name: 'The Lost Explorers', from: 62 }, { enc: 4, name: 'Sszorak', from: 74 }];
  const pulls = [];
  let bi = rnd() < 0.5 ? 0 : 1, best = bosses[bi].from;
  while (t < end) {
    const b = bosses[bi];
    const kill = bi === 0 && pulls.filter(p => p.enc === b.enc).length > 7 && rnd() < 0.3;
    const pct = kill ? 0 : Math.max(4, Math.round((best - 6 + rnd() * 16) * 10) / 10);
    best = Math.min(best, pct + 4);
    const dur = kill ? 330e3 + rnd() * 60e3 : 60e3 + (100 - pct) / 100 * 260e3 + rnd() * 30e3;
    pulls.push({ code: 'demo', id: pulls.length + 1, enc: b.enc, name: b.name, diff: 5, kill, pct, t: Math.round(t), dur: Math.round(dur) });
    t += dur + 70e3 + rnd() * 120e3;
    if (kill) { bi = 1; best = bosses[1].from; t += 6 * 60e3; }
  }
  return { configured: true, demo: true, date, reports: [{ code: 'demo', url: 'https://www.warcraftlogs.com' }], pulls };
}
