import { store, auth } from '../store.js';
import { sortRaids, setCurrentRaid, coverOk } from '../raids.js';
import { CONFIG } from '../config.js';
import { esc, h, raidDates, todayIso, fmtShort, fmtDate, WD, parseIso, raidBosses } from '../ui.js';
import { getWcl, mergeBoss } from '../wcl.js';
import { progChartSvg, openProgCurve } from '../progcurve.js';

export function render(root) {
  const el = h(`
    <div>
      <section class="hero container">
        <div class="hero-grid">
          <div>
            <div class="eyebrow">Mythic Raiding · ${esc(CONFIG.guild.realm)}</div>
            <h1 class="hero-logo"><img src="assets/logo.webp" alt="Paranøia" width="720" height="634"></h1>
            <p class="hero-lead">Mythic-Raidgilde auf EU Todeswache · Raidtage ${esc(CONFIG.guild.raidDaysText)}</p>
            <div class="hero-actions">
              <a href="#/roster" class="btn btn-primary btn-lg">Roster ansehen</a>
              <a href="#/progress" class="btn btn-ghost btn-lg">Progress</a>
            </div>
          </div>
          <div class="card progress-card">
            <a class="pc-cover" data-cover href="#/progress">
              <div class="pc-cover-img" data-cover-img></div>
              <div class="pc-cover-text">
                <div class="raid" data-raid>Mythic Progress</div>
                <div class="pc-name" data-name>–</div>
              </div>
            </a>
            <div class="pc-body">
              <select class="select raid-switch hidden" data-switch title="Aktuellen Raid wählen (nur Offis)"></select>
              <div class="count"><span data-kills>0</span><small>/ <span data-total>8</span> M</small></div>
              <div class="progress-track"><div class="progress-fill" data-fill style="width:0%"></div></div>
              <div class="boss-pips" data-pips></div>
              <div class="pc-now" data-now></div>
            </div>
          </div>
        </div>
      </section>
      <section class="container">
        <div class="stats">
          <div class="card stat"><div class="stat-label">Raider</div><div class="stat-value" data-raiders>–</div></div>
          <div class="card stat"><div class="stat-label">Tank · Heal · DPS</div><div class="stat-value" data-comp>–</div></div>
          <div class="card stat"><div class="stat-label">Nächster Raid</div><div class="stat-value" data-next>–</div></div>
          <div class="card stat"><div class="stat-label">Season</div><div class="stat-value" data-season>–</div></div>
        </div>
      </section>
    </div>`);
  root.appendChild(el);
  const $ = s => el.querySelector(s);

  let rawBosses = [], wcl = null, settings = {}, raids = [];
  const drawSwitch = () => {
    const sel = $('[data-switch]');
    const show = auth.isOfficer && raids.length > 1;
    sel.classList.toggle('hidden', !show);
    if (!show) return;
    sel.innerHTML = sortRaids(raids, settings).map(r => `<option value="${esc(r.id)}" ${r.id === settings.currentRaid ? 'selected' : ''}>${esc(r.name)}${r.season ? ' · ' + esc(r.season) : ''}</option>`).join('');
  };
  $('[data-switch]').onchange = async e => {
    const r = raids.find(x => x.id === e.target.value);
    if (r) await setCurrentRaid(r);
  };
  const drawBosses = () => {
      const bosses = raidBosses(rawBosses, settings.currentRaid || '', settings).map(b => mergeBoss(b, wcl));
      const kills = bosses.filter(b => b.status === 'kill').length;
      $('[data-kills]').textContent = kills;
      $('[data-total]').textContent = bosses.length || 8;
      $('[data-fill]').style.width = `${bosses.length ? (kills / bosses.length) * 100 : 0}%`;
      $('[data-pips]').style.gridTemplateColumns = `repeat(${bosses.length || 8}, 1fr)`;
      $('[data-pips]').innerHTML = bosses.map(b =>
        `<div class="boss-pip ${b.status === 'kill' ? 'kill' : b.status === 'prog' ? 'prog' : ''}" title="${esc(b.name)}"></div>`).join('');
      drawHead(); drawNow(bosses);
  };
  /** Titelbild + Raidname aus dem aktuellen Raid */
  function drawHead() {
    const r = raids.find(x => x.id === settings.currentRaid);
    $('[data-name]').textContent = r?.name || settings.raidName || '–';
    $('[data-cover]').href = r ? `#/progress/${encodeURIComponent(r.id)}` : '#/progress';
    const img = $('[data-cover-img]');
    const src = coverOk(r?.cover) ? r.cover : '';
    if (img.dataset.src !== src) {
      img.dataset.src = src;
      img.innerHTML = src ? `<img src="${src}" alt="">` : '<div class="raid-cover-fallback"><img src="assets/logo.webp" alt=""></div>';
    }
  }
  /** Aktueller Prog-Boss mit bestem % und Pulls */
  function drawNow(bosses) {
    const box = $('[data-now]');
    if (!bosses.length) { box.innerHTML = ''; return; }
    const open = bosses.filter(b => b.status !== 'kill');
    if (!open.length) {
      const last = bosses.map(b => b.killDate).filter(Boolean).sort().at(-1);
      box.innerHTML = `<div class="pc-now-label">Raid clear</div><div class="pc-now-boss done">Alle Bosse besiegt ✓</div>${last ? `<div class="pc-now-meta">Letzter Kill ${fmtDate(last)}</div>` : ''}`;
      return;
    }
    const b = open.find(x => x.status === 'prog') || open[0];
    const pct = b.bestPct !== '' && b.bestPct != null ? Number(b.bestPct) : null;
    const pulls = Number(b.totalPulls || b.pulls || 0);
    const started = b.status === 'prog' && (pct != null || pulls);
    box.innerHTML = `
      <div class="pc-now-label">Aktuell am Boss</div>
      <div class="pc-now-row">
        <div class="pc-now-boss">${esc(b.name)}</div>
        ${pct != null ? `<div class="pc-now-pct">${pct.toLocaleString('de-AT', { maximumFractionDigits: 1 })} %</div>` : ''}
      </div>
      ${pct != null ? `<div class="pc-hp"><span style="width:${Math.max(2, 100 - pct)}%"></span></div>` : ''}
      <div class="pc-now-meta">${started ? `${pulls ? `${pulls} Pulls` : ''}${pct != null ? `${pulls ? ' · ' : ''}bester Pull ${pct.toLocaleString('de-AT', { maximumFractionDigits: 1 })} %` : ''}` : 'Noch nicht gepullt'}</div>
      ${b.nights?.length > 1 ? `<button class="pc-spark" data-spark title="Prog-Kurve öffnen">${progChartSvg(b.nights, { mini: true })}<span>📈 Prog-Kurve · ${b.nights.length} Abende</span></button>` : ''}`;
    box.querySelector('[data-spark]')?.addEventListener('click', () => openProgCurve(b));
  }

  const unsubs = [
    store.watchCol('bosses', bs => { rawBosses = bs; drawBosses(); }),
    store.watchCol('raids', rs => { raids = rs; drawSwitch(); drawBosses(); }),
    store.watchCol('players', players => {
      const active = players.filter(p => p.active !== false);
      const n = r => active.filter(p => r.includes(p.rolle)).length;
      $('[data-raiders]').textContent = active.length;
      $('[data-comp]').textContent = `${n(['Tank'])} · ${n(['Healer'])} · ${n(['mDD', 'rDD'])}`;
    }),
    store.watchDoc('settings', 'main', s => {
      if (!s) return;
      settings = s; drawBosses(); drawSwitch();
      if (!wcl) getWcl(s).then(d => { if (d) { wcl = d; drawBosses(); } });
      $('[data-season]').textContent = s.season || '–';
      const next = raidDates(s).find(d => d >= todayIso());
      $('[data-next]').textContent = next ? `${WD[parseIso(next).getDay()]} ${fmtShort(next)}` : '–';
    }),
  ];
  return () => unsubs.forEach(u => u());
}
