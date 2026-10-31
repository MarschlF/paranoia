// ─────────────────────────────────────────────────────────────
//  Progress: #/progress = Raid-Übersicht · #/progress/<raidId> = Bosse
// ─────────────────────────────────────────────────────────────
import { store, auth } from '../store.js';
import { CONFIG, DEMO_MODE } from '../config.js';
import { esc, h, openModal, toast, fmtDate, raidBosses } from '../ui.js';
import { getWcl, mergeBoss } from '../wcl.js';
import { openProgCurve } from '../progcurve.js';
import { BOSS_STATUS, sortRaids, editBoss, editRaid, setCurrentRaid, adoptSeasonDates, raidCardsHtml, raidBannerHtml, watchBossCovers } from '../raids.js';

const REM_TEXT = '⏰ Anmeldungen für {tag} noch offen.\nBitte an- oder abmelden: {namen}';   // Standardtext (gleich wie worker/reminder.js)

export function render(root, { params }) {
  return params[0] ? renderRaid(root, decodeURIComponent(params[0])) : renderOverview(root);
}

/** Gemeinsame Daten (Bosse, Raids, Einstellungen, WCL) */
function watchAll(onChange0) {
  // Erst feuern, wenn die Seite fertig aufgebaut ist (Demo liefert Daten sofort)
  let live = false;
  const onChange = () => { if (live) onChange0(); };
  const st = { bosses: [], raids: [], settings: {}, wcl: null, wclFor: null };
  const loadWcl = () => {
    if (!st.settings.startDate || st.wclFor === st.settings.startDate) return;
    st.wclFor = st.settings.startDate;
    getWcl(st.settings).then(d => { st.wcl = d; onChange(); });
  };
  let adopted = false;
  const adopt = () => { if (!adopted && auth.isOfficer && st.raids.length && st.settings.currentRaid) { adopted = true; adoptSeasonDates(st.raids, st.settings); } };
  const unsubs = [
    store.watchCol('bosses', bs => { st.bosses = bs; onChange(); }),
    store.watchCol('raids', rs => { st.raids = rs; onChange(); adopt(); }),
    store.watchDoc('settings', 'main', s => { st.settings = s || {}; onChange(); loadWcl(); adopt(); }),
  ];
  live = true; queueMicrotask(onChange0);
  return { st, stop: () => unsubs.forEach(u => u()) };
}
const mergedFor = (st, rid) => raidBosses(st.bosses, rid, st.settings)
  .map(b => rid === st.settings.currentRaid ? mergeBoss(b, st.wcl) : { ...b, source: 'manual' });

// ── Übersicht ───────────────────────────────────────────────
function renderOverview(root) {
  const el = h(`
    <div class="container page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Mythic</div>
          <h2 class="page-title">Progress</h2>
          <p class="page-sub">Raid auswählen, um den Fortschritt pro Boss zu sehen.</p>
        </div>
        <div class="page-actions">${auth.isOfficer ? `
          <button class="btn btn-ghost" data-settings>Raid-Einstellungen</button>
          <button class="btn btn-primary" data-newraid>+ Raid</button>` : ''}</div>
      </div>
      <div class="raid-grid" data-grid><div class="loading">Lade…</div></div>
    </div>`);
  root.appendChild(el);

  const { st, stop } = watchAll(() => draw());
  el.querySelector('[data-newraid]')?.addEventListener('click', () => editRaid(null, st));
  el.querySelector('[data-settings]')?.addEventListener('click', () => editSettings(st.settings, st.raids, st.bosses));

  function draw() {
    const grid = el.querySelector('[data-grid]');
    const raids = sortRaids(st.raids, st.settings);
    if (!raids.length) { grid.innerHTML = `<div class="empty">Noch keine Raids.${auth.isOfficer ? ' Über „+ Raid" anlegen.' : ''}</div>`; return; }
    grid.innerHTML = raidCardsHtml(raids, st.settings, {
      href: r => `#/progress/${encodeURIComponent(r.id)}`,
      isOfficer: auth.isOfficer,
      meta: r => {
        const list = mergedFor(st, r.id);
        const kills = list.filter(b => b.status === 'kill').length;
        return { line: list.length ? `${kills}/${list.length} Mythic` : 'Noch keine Bosse', pct: list.length ? kills / list.length : null };
      },
    });
    grid.querySelectorAll('[data-edit-raid]').forEach(b => b.onclick = e => {
      e.preventDefault(); e.stopPropagation();
      editRaid(st.raids.find(r => r.id === b.dataset.editRaid), st);
    });
  }
  return stop;
}

// ── Bosse eines Raids ───────────────────────────────────────
function renderRaid(root, raidId) {
  const el = h(`
    <div class="container page">
      <div class="raid-detail-head">
        <a href="#/progress" class="back-link" style="margin:0">← Alle Raids</a>
        <div class="page-actions">${auth.isOfficer ? `
          <button class="btn btn-ghost btn-sm" data-editraid>Raid bearbeiten</button>
          <button class="btn btn-primary btn-sm" data-add>+ Boss</button>` : ''}</div>
      </div>
      <div data-banner></div>
      <p class="wcl-note" data-wcl style="margin:-10px 0 16px"></p>
      <div class="boss-list" data-list><div class="loading">Lade Progress…</div></div>
    </div>`);
  root.appendChild(el);

  const { st, stop: stopAll } = watchAll(() => draw());
  let covers = {};
  const stopCovers = watchBossCovers(c => { covers = c; draw(); });
  const stop = () => { stopAll(); stopCovers(); };
  el.querySelector('[data-editraid]')?.addEventListener('click', () => editRaid(st.raids.find(r => r.id === raidId), st));
  el.querySelector('[data-add]')?.addEventListener('click', () =>
    editBoss(null, { raids: st.raids, raidId, nextOrder: raidBosses(st.bosses, raidId, st.settings).length + 1 }));

  function draw() {
    const raid = st.raids.find(r => r.id === raidId);
    const isCurrent = raidId === st.settings.currentRaid;
    const merged = mergedFor(st, raidId);
    const kills = merged.filter(b => b.status === 'kill').length;
    el.querySelector('[data-banner]').innerHTML = raid
      ? raidBannerHtml(raid, st.settings, `${kills}/${merged.length} Mythic`)
      : (st.raids.length ? '<div class="empty">Raid nicht gefunden.</div>' : '');

    const note = el.querySelector('[data-wcl]');
    if (isCurrent && st.wcl?.configured) {
      const t = new Date(st.wcl.updated);
      note.innerHTML = `<span class="wcl-dot"></span>Automatisch aus Warcraft Logs${st.wcl.demo ? ' (Beispieldaten)' : ''} · Stand ${t.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}`;
    } else note.textContent = '';

    const list = el.querySelector('[data-list]');
    if (!merged.length) { list.innerHTML = `<div class="empty"><div class="big">🐍</div>Noch keine Bosse für diesen Raid.${auth.isOfficer ? ' Über „+ Boss" hinzufügen.' : ''}</div>`; return; }
    list.innerHTML = '';
    merged.forEach((b, i) => {
      const s = BOSS_STATUS[b.status] || BOSS_STATUS.open;
      const sub = b.status === 'kill' && b.killDate ? `Kill am ${fmtDate(b.killDate)}`
        : b.status === 'prog' && b.bestPct != null && b.bestPct !== '' ? `Best Pull ${b.bestPct} %` : '';
      const row = h(`
        <div class="card boss-row ${b.status || 'open'}">
          <div class="boss-num">${i + 1}</div>
          <div class="boss-ident">${(b.thumb || covers[b.id]) ? `<div class="boss-thumb"><img src="${b.thumb || covers[b.id]}" alt="" loading="lazy"></div>` : ''}<div style="min-width:0"><div class="boss-name">${esc(b.name)}${b.source === 'wcl' ? '<span class="src-tag" title="Aus Warcraft Logs">WCL</span>' : ''}</div><div class="boss-sub">${esc(sub)}${b.nights?.length ? `${sub ? ' · ' : ''}<button class="curve-btn" data-curve>📈 Prog-Kurve</button>` : ''}</div></div></div>
          <div><span class="boss-status ${s.cls}">${s.label}</span></div>
          <div class="hide-sm"><div class="boss-cell-label">Pulls</div><div class="boss-cell-val">${b.pulls || '–'}</div></div>
          <div class="hide-sm"><div class="boss-cell-label">Best</div><div class="boss-cell-val">${b.status === 'kill' ? '✓' : (b.bestPct !== undefined && b.bestPct !== '' ? b.bestPct + ' %' : '–')}</div></div>
          <div>${auth.isOfficer ? '<button class="icon-btn" title="Bearbeiten" data-edit>✎</button>' : ''}</div>
        </div>`);
      row.querySelector('[data-curve]')?.addEventListener('click', () => openProgCurve(b));
      row.querySelector('[data-edit]')?.addEventListener('click', () => editBoss(st.bosses.find(x => x.id === b.id), { raids: st.raids }));
      list.appendChild(row);
    });
  }
  return stop;
}

// ── Raid-Einstellungen ──────────────────────────────────────
function editSettings(s, raids, bosses) {
  const wd = new Set(s.raidWeekdays || [2, 4]);
  const rem = { on: false, daysBefore: 2, time: '12:00', ping: true, roleId: '', ...(s.reminder || {}) };
  const days = [[1, 'Mo'], [2, 'Di'], [3, 'Mi'], [4, 'Do'], [5, 'Fr'], [6, 'Sa'], [0, 'So']];
  const form = h(`
    <div class="form-grid">
      <div class="field full"><label>Aktueller Raid</label>
        <select class="select" name="currentRaid">${sortRaids(raids, s).map(r => `<option value="${esc(r.id)}" ${r.id === s.currentRaid ? 'selected' : ''}>${esc(r.name)}${r.season ? ` · ${esc(r.season)}` : ''}</option>`).join('')}</select>
        <span class="hint">Neue Season? Einfach über „+ Raid“ anlegen – dort Season-Start/-Ende eintragen und „Als aktuellen Raid setzen“ anhaken, dann stellt sich alles automatisch um. Alte Raids und ihre Guides bleiben erhalten.</span>
      </div>
      <div class="field"><label>Season-Start</label><input class="input" type="date" name="startDate" value="${esc(s.startDate || '')}"></div>
      <div class="field"><label>Season-Ende</label><input class="input" type="date" name="endDate" value="${esc(s.endDate || '')}"></div>
      <div class="field"><label>Raid-Beginn</label><input class="input" type="time" name="raidStart" value="${esc(s.raidStart || '')}"></div>
      <div class="field"><label>Raid-Ende</label><input class="input" type="time" name="raidEnd" value="${esc(s.raidEnd || '')}"></div>
      <div class="field full"><label>Raidtage</label>
        <div data-wd style="display:flex;gap:6px;flex-wrap:wrap">${days.map(([n, l]) =>
          `<label class="chip ${wd.has(n) ? 'active' : ''}" style="display:inline-flex;align-items:center"><input type="checkbox" value="${n}" ${wd.has(n) ? 'checked' : ''} style="display:none">${l}</label>`).join('')}</div>
        <span class="hint">Die Spalten im Rotation Planer und Loot Tracker werden daraus automatisch erzeugt. Zusätzliche oder ausgefallene Raidtage kannst du direkt im Rotation Planer setzen.</span>
      </div>
      <div class="field full set-sep"><label>Discord-Reminder</label>
        <label class="check-row"><input type="checkbox" name="remOn" ${rem.on ? 'checked' : ''}> Automatisch erinnern, wer sich in wowaudit noch nicht an- oder abgemeldet hat</label>
        <span class="hint">Postet in den Raidanmeldung-Channel (gleicher Webhook wie das Comp-Bild). Haben alle geantwortet, kommt keine Nachricht.</span>
      </div>
      <div class="field"><label>Wann</label>
        <div style="display:flex;gap:8px;align-items:center"><select class="select" name="remDays" style="width:auto">${[1, 2, 3, 4].map(n => `<option value="${n}" ${Number(rem.daysBefore) === n ? 'selected' : ''}>${n} ${n === 1 ? 'Tag' : 'Tage'} vorher</option>`).join('')}</select>
        <span>um</span><input class="input" type="time" name="remTime" value="${esc(rem.time)}" style="width:auto"></div>
        <span class="hint" data-remex></span>
      </div>
      <div class="field"><label>Rollen-ID für den Ping <span class="muted">(optional)</span></label>
        <input class="input" name="remRole" value="${esc(rem.roleId || '')}" placeholder="z. B. 123456789012345678" inputmode="numeric">
        <label class="check-row" style="margin-top:6px"><input type="checkbox" name="remPing" ${rem.ping ? 'checked' : ''}> Rolle pingen</label>
      </div>
      <div class="field full"><label>Text der Erinnerung</label>
        <textarea class="input" name="remText" rows="3" maxlength="1500">${esc(rem.text || REM_TEXT)}</textarea>
        <span class="hint">Platzhalter: <code>{tag}</code> = Dienstag, 03.11. · <code>{wochentag}</code> · <code>{datum}</code> · <code>{uhrzeit}</code> = Raidbeginn · <code>{namen}</code> = wer in wowaudit noch nicht geantwortet hat · <code>{anzahl}</code>. Der Rollen-Ping kommt automatisch davor.</span></div>
      <div class="field full"><button type="button" class="btn btn-ghost btn-sm" data-remtest>Testnachricht jetzt senden</button>
        <span class="hint">Schickt die Liste für den nächsten Raid sofort in den Channel – ohne Ping, mit „Test“ markiert.</span></div>
    </div>`);
  // Beispiel „Sonntag 12:00 für Dienstag“ live anzeigen
  const WDN = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const remEx = () => {
    const n = Number(form.querySelector('[name=remDays]').value), t = form.querySelector('[name=remTime]').value || '12:00';
    const sel = [...form.querySelectorAll('[data-wd] input:checked')].map(c => Number(c.value)).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    form.querySelector('[data-remex]').textContent = sel.length ? sel.map(d => `${WDN[(d - n + 7) % 7]} ${t} für ${WDN[d]}`).join(' · ') : '';
  };
  form.querySelector('[name=remDays]').onchange = remEx; form.querySelector('[name=remTime]').oninput = remEx;
  form.querySelector('[data-remtest]').onclick = async e => {
    const b = e.target; b.disabled = true; b.textContent = 'Wird gesendet…';
    try {
      if (DEMO_MODE || !CONFIG.authWorkerUrl) { toast('In der Vorschau wird nichts gesendet'); return; }
      const t = await auth.idToken();
      const r = await fetch(`${CONFIG.authWorkerUrl.replace(/\/$/, '')}/reminder/test`, { method: 'POST', headers: { Authorization: `Bearer ${t}` } });
      const j = await r.json().catch(() => ({}));
      toast(r.status === 404 ? 'Worker noch nicht aktualisiert' : j.ok ? `Testnachricht gesendet (${j.open} offen)` : `Nicht gesendet: ${j.skipped || j.error || r.status}`, j.ok ? 'ok' : 'err');
    } catch { toast('Worker nicht erreichbar', 'err'); }
    finally { b.disabled = false; b.textContent = 'Testnachricht jetzt senden'; }
  };
  // anderen Raid wählen → dessen Zeitraum eintragen
  form.querySelector('[name=currentRaid]').onchange = e => {
    const r = raids.find(x => x.id === e.target.value);
    if (r?.startDate) form.querySelector('[name=startDate]').value = r.startDate;
    if (r?.endDate) form.querySelector('[name=endDate]').value = r.endDate;
  };
  form.querySelectorAll('label.chip').forEach(l => l.onclick = (e) => {
    e.preventDefault(); const cb = l.querySelector('input'); cb.checked = !cb.checked; l.classList.toggle('active', cb.checked); remEx();
  });
  remEx();
  openModal({
    title: 'Raid-Einstellungen', body: form,
    actions: [{ label: 'Abbrechen' }, { label: 'Speichern', cls: 'btn-primary', onClick: async () => {
      const v = n => form.querySelector(`[name=${n}]`).value;
      const raid = raids.find(r => r.id === v('currentRaid'));
      if (raid && raid.id !== s.currentRaid) await setCurrentRaid(raid);
      await store.set('settings', 'main', {
        startDate: v('startDate'), endDate: v('endDate'), raidStart: v('raidStart'), raidEnd: v('raidEnd'),
        raidWeekdays: [...form.querySelectorAll('[data-wd] input:checked')].map(c => Number(c.value)),
        reminder: {
          on: form.querySelector('[name=remOn]').checked, daysBefore: Number(v('remDays')), time: v('remTime') || '12:00',
          ping: form.querySelector('[name=remPing]').checked, roleId: v('remRole').trim().replace(/\D/g, ''),
          text: v('remText').trim() === REM_TEXT ? '' : v('remText').trim(),
        },
      });
      // Zeitraum gehört zum Raid – dort mitspeichern
      if (raid) await store.set('raids', raid.id, { startDate: v('startDate'), endDate: v('endDate') });
      toast('Einstellungen gespeichert');
    } }],
  });
}
