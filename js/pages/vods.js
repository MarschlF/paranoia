// ─────────────────────────────────────────────────────────────
//  VoDs (Offi): YouTube-Streams für die Analyse, direkt eingebettet
//  Sammlung: vods/<id> { date, title, url, boss, pov, note }
// ─────────────────────────────────────────────────────────────
import { store } from '../store.js';
import { DEMO_MODE } from '../config.js';
import { esc, h, openModal, confirmModal, toast, fmtDate, parseIso, WD, todayIso, raidBosses } from '../ui.js';

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

export function render(root, { params }) {
  const el = h(`
    <div class="container page">
      <div class="page-head">
        <div>
          <div class="eyebrow" style="color:var(--gold)">Offi</div>
          <h2 class="page-title">VoDs</h2>
          <p class="page-sub">Raid-Streams von YouTube für die Analyse – direkt hier anschauen.</p>
        </div>
        <div class="page-actions">
          <select class="select" data-boss style="width:auto;height:38px"><option value="">Alle Bosse</option></select>
          <button class="btn btn-primary" data-add>+ VoD</button>
        </div>
      </div>
      <div data-player></div>
      <div class="vod-list" data-list><div class="loading">Lade VoDs…</div></div>
    </div>`);
  root.appendChild(el);

  let vods = [], bosses = [], allBosses = [], settings = {}, selected = params[0] ? decodeURIComponent(params[0]) : null, bossFilter = '';
  el.querySelector('[data-add]').onclick = () => editVod(null, bosses);
  el.querySelector('[data-boss]').onchange = e => { bossFilter = e.target.value; draw(); };

  function drawPlayer(v) {
    const box = el.querySelector('[data-player]');
    if (!v) { box.innerHTML = ''; return; }
    const yt = parseYouTube(v.url);
    const embed = yt
      ? (DEMO_MODE
          ? `<a class="vod-frame vod-placeholder" href="${esc(v.url)}" target="_blank" rel="noopener">
               <span class="play">▶</span><span>In der Vorschau kann YouTube nicht eingebettet werden.<br>Auf der Live-Seite läuft das Video direkt hier. Klick öffnet es auf YouTube.</span></a>`
          : `<iframe class="vod-frame" src="https://www.youtube-nocookie.com/embed/${yt.id}?rel=0${yt.start ? `&start=${yt.start}` : ''}"
               title="${esc(v.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe>`)
      : `<div class="vod-frame vod-placeholder"><span>Kein gültiger YouTube-Link.</span></div>`;
    box.innerHTML = `
      <div class="vod-stage">
        ${embed}
        <div class="vod-info card card-pad">
          <div class="vod-date">${WD[parseIso(v.date).getDay()]}, ${fmtDate(v.date)}</div>
          <h3>${esc(v.title || 'Raid-VoD')}</h3>
          <div class="vod-tags">
            ${v.boss ? `<span class="vod-tag">${esc(v.boss)}</span>` : ''}
            ${v.pov ? `<span class="vod-tag">POV ${esc(v.pov)}</span>` : ''}
          </div>
          ${v.note ? `<p class="vod-note">${esc(v.note)}</p>` : ''}
          <div class="vod-actions">
            <a class="btn btn-ghost btn-sm" href="${esc(v.url)}" target="_blank" rel="noopener">Auf YouTube öffnen</a>
            <button class="btn btn-ghost btn-sm" data-edit>Bearbeiten</button>
            <button class="btn btn-danger btn-sm" data-del>Löschen</button>
          </div>
        </div>
      </div>`;
    box.querySelector('[data-edit]').onclick = () => editVod(v, bosses);
    box.querySelector('[data-del]').onclick = async () => {
      if (await confirmModal('VoD löschen?', `„${v.title || fmtDate(v.date)}" wird entfernt. Das Video auf YouTube bleibt unberührt.`)) {
        await store.remove('vods', v.id); selected = null; toast('VoD gelöscht');
      }
    };
  }

  function draw() {
    const sel = el.querySelector('[data-boss]');
    const names = [...new Set([...bosses.map(b => b.name), ...vods.map(v => v.boss).filter(Boolean)])];
    sel.innerHTML = `<option value="">Alle Bosse</option>` + names.map(n => `<option ${n === bossFilter ? 'selected' : ''}>${esc(n)}</option>`).join('');

    const shown = vods.filter(v => !bossFilter || v.boss === bossFilter);
    const list = el.querySelector('[data-list]');
    if (!vods.length) {
      drawPlayer(null);
      list.innerHTML = `<div class="empty"><div class="big">🎬</div>
        <p style="margin-bottom:6px">Noch keine VoDs.</p>
        <p class="hint" style="margin-bottom:16px">YouTube-Link vom Raid-Stream einfügen – auch mit Zeitstempel (z. B. <code>&amp;t=1h12m</code>), dann startet das Video genau beim Pull.</p>
        <button class="btn btn-primary" data-add2>Erstes VoD hinzufügen</button></div>`;
      list.querySelector('[data-add2]').onclick = () => editVod(null, bosses);
      return;
    }
    const current = vods.find(v => v.id === selected) || shown[0] || vods[0];
    selected = current.id;
    drawPlayer(current);

    list.innerHTML = shown.length ? '' : '<div class="empty">Keine VoDs für diesen Boss.</div>';
    shown.forEach(v => {
      const item = h(`
        <button class="vod-item ${v.id === selected ? 'active' : ''}">
          <span class="vod-item-play">▶</span>
          <span class="vod-item-main">
            <span class="vod-item-title">${esc(v.title || 'Raid-VoD')}</span>
            <span class="vod-item-meta">${WD[parseIso(v.date).getDay()]} ${fmtDate(v.date)}${v.boss ? ` · ${esc(v.boss)}` : ''}${v.pov ? ` · POV ${esc(v.pov)}` : ''}</span>
          </span>
        </button>`);
      item.onclick = () => { selected = v.id; history.replaceState(null, '', `#/vods/${encodeURIComponent(v.id)}`); draw(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
      list.appendChild(item);
    });
  }

  const unsubs = [
    store.watchCol('vods', vs => { vods = vs.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created || '').localeCompare(a.created || '')); draw(); }),
    store.watchCol('bosses', bs => { allBosses = bs; bosses = raidBosses(allBosses, settings.currentRaid || '', settings); draw(); }),
    store.watchDoc('settings', 'main', st => { settings = st || {}; bosses = raidBosses(allBosses, settings.currentRaid || '', settings); draw(); }),
  ];
  return () => unsubs.forEach(u => u());
}

function editVod(vod, bosses) {
  const v = vod || { date: todayIso(), title: '', url: '', boss: '', pov: '', note: '' };
  const form = h(`
    <div class="form-grid">
      <div class="field full"><label>YouTube-Link</label><input class="input" name="url" value="${esc(v.url)}" placeholder="https://www.youtube.com/watch?v=… oder youtu.be/…"></div>
      <div class="field"><label>Datum</label><input class="input" type="date" name="date" value="${esc(v.date)}"></div>
      <div class="field"><label>Boss</label><select class="select" name="boss">
        <option value="">– ganzer Abend –</option>
        ${bosses.map(b => `<option ${b.name === v.boss ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}
      </select></div>
      <div class="field"><label>Titel</label><input class="input" name="title" value="${esc(v.title)}" placeholder="z. B. Mythic Prog Abend 3"></div>
      <div class="field"><label>POV (wessen Stream)</label><input class="input" name="pov" value="${esc(v.pov)}" placeholder="z. B. Marschl"></div>
      <div class="field full"><label>Notiz</label><input class="input" name="note" value="${esc(v.note)}" placeholder="z. B. ab 1:12:00 der 18%-Pull"></div>
      <p class="hint full">Tipp: Auf YouTube „Teilen" → „Beginnen bei" anhaken, dann startet das eingebettete Video genau an der Stelle.</p>
    </div>`);
  openModal({
    title: vod ? 'VoD bearbeiten' : 'Neues VoD', body: form,
    actions: [{ label: 'Abbrechen' }, { label: 'Speichern', cls: 'btn-primary', onClick: async () => {
      const g = n => form.querySelector(`[name=${n}]`).value.trim();
      if (!parseYouTube(g('url'))) { toast('Bitte einen gültigen YouTube-Link einfügen', 'err'); return true; }
      if (!g('date')) { toast('Datum fehlt', 'err'); return true; }
      const data = { url: g('url'), date: g('date'), boss: g('boss'), title: g('title'), pov: g('pov'), note: g('note') };
      if (vod) await store.set('vods', vod.id, data);
      else await store.add('vods', { ...data, created: new Date().toISOString() });
      toast('VoD gespeichert');
    } }],
  });
}
