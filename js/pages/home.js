import { store, auth } from '../store.js';
import { sortRaids, setCurrentRaid, coverOk } from '../raids.js';
import { CONFIG, DEMO_MODE } from '../config.js';
import { esc, h, raidDates, todayIso, fmtShort, fmtDate, WD, parseIso, raidBosses, CLASSES, clsColor, clsName, specIcon } from '../ui.js';
import { getWcl, mergeBoss } from '../wcl.js';
import { progChartSvg, openProgCurve } from '../progcurve.js';

export function render(root) {
  const el = h(`
    <div>
      <div class="container" data-killbanner></div>
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
        <div class="home-info">
          <div class="card hi-card" data-times><div class="hi-title">Raidzeiten</div><div class="loading">…</div></div>
          <div class="card hi-card" data-kills-list><div class="hi-title">Letzte Kills</div><div class="loading">…</div></div>
          <div class="card hi-card" data-roster><div class="hi-title">Roster</div><div class="loading">…</div></div>
        </div>
      </section>
    </div>`);
  root.appendChild(el);
  const $ = s => el.querySelector(s);

  let rawBosses = [], wcl = null, settings = {}, raids = [];
  // Titelbild des aktuellen Bosses (nur dieses eine Bild laden)
  let nowCover = { id: '', img: '', stop: null };
  const watchNowCover = id => {
    if (nowCover.id === id) return;
    nowCover.stop?.(); nowCover = { id, img: '', stop: null };
    if (!id) return;
    nowCover.stop = store.watchDoc('bossCovers', id, d => { nowCover.img = coverOk(d?.img) ? d.img : ''; drawBosses(); }, () => {});
  };
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
      drawHead(); drawNow(bosses); drawKills(bosses); drawKillBanner(bosses);
  };
  /** Neuer Mythic-Erstkill (letzte 7 Tage) → goldenes Banner + einmal Konfetti pro Browser */
  const KILL_DAYS = DEMO_MODE ? 60 : 7;
  function drawKillBanner(bosses) {
    const box = $('[data-killbanner]');
    const since = new Date(Date.now() - KILL_DAYS * 86400000).toISOString().slice(0, 10);
    const hidden = (() => { try { return JSON.parse(localStorage.getItem('pn-kill-hide') || '[]'); } catch { return []; } })();
    const k = bosses.filter(b => b.status === 'kill' && b.killDate && b.killDate >= since && !hidden.includes(b.id))
      .sort((a, b) => b.killDate.localeCompare(a.killDate))[0];
    if (!k) { box.innerHTML = ''; return; }
    if (box.dataset.boss === k.id) return;            // schon angezeigt
    box.dataset.boss = k.id;
    box.innerHTML = `<div class="kill-banner">
      ${k.thumb ? `<div class="kb-img"><img src="${k.thumb}" alt=""></div>` : '<div class="kb-img kb-trophy">🏆</div>'}
      <div class="kb-txt">
        <div class="kb-kind">Neuer Mythic-Kill</div>
        <div class="kb-name">${esc(k.name)}</div>
        <div class="kb-meta">${fmtDate(k.killDate)}${k.pulls ? ` · nach ${k.pulls} Pulls` : ''}</div>
      </div>
      <a class="btn btn-ghost btn-sm" href="#/progress/${encodeURIComponent(k.raidId || settings.currentRaid || '')}">Zum Progress</a>
      <button class="icon-btn kb-x" title="Ausblenden">✕</button>
    </div>`;
    box.querySelector('.kb-x').onclick = () => {
      try { localStorage.setItem('pn-kill-hide', JSON.stringify([...hidden, k.id])); } catch {}
      box.innerHTML = ''; box.dataset.boss = '';
    };
    // Konfetti erst, wenn das Banner wirklich sichtbar ist (Tab im Vordergrund) – und erst dann als „gesehen“ merken
    const banner = box.querySelector('.kill-banner');
    banner.querySelector('.kb-img').onclick = () => confetti(banner);   // Klick aufs Bild = nochmal feiern
    banner.querySelector('.kb-img').title = 'Nochmal feiern 🎉';
    let seen = false;
    try { seen = !DEMO_MODE && localStorage.getItem('pn-kill-confetti') === k.id; } catch {}
    if (seen || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const io = new IntersectionObserver(es => {
      if (!es.some(e => e.isIntersecting) || document.visibilityState !== 'visible') return;
      io.disconnect();
      setTimeout(() => { confetti(banner); try { localStorage.setItem('pn-kill-confetti', k.id); } catch {} }, 400);
    }, { threshold: 0.6 });
    io.observe(banner);
  }
  /** Letzte Mythic-Kills (neueste zuerst) */
  function drawKills(bosses) {
    const box = $('[data-kills-list]');
    const kills = bosses.filter(b => b.status === 'kill' && b.killDate).sort((a, b) => b.killDate.localeCompare(a.killDate)).slice(0, 4);
    box.innerHTML = `<div class="hi-title">Letzte Kills</div>` + (kills.length ? `<div class="hi-kills">${kills.map(b => `
      <a class="hi-kill" href="#/progress/${encodeURIComponent(b.raidId || settings.currentRaid || '')}">
        ${b.thumb ? `<span class="hi-thumb"><img src="${b.thumb}" alt=""></span>` : '<span class="hi-check">✓</span>'}
        <span class="hi-kname">${esc(b.name)}</span>
        <span class="hi-kmeta">${fmtShort(b.killDate)}${b.pulls ? ` · ${b.pulls} Pulls` : ''}</span>
      </a>`).join('')}</div>` : '<p class="muted hi-empty">Noch kein Mythic-Kill in diesem Raid.</p>');
  }
  /** Raidtage + Uhrzeit + nächster Raid relativ */
  const WD_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  function drawTimes() {
    const s = settings;
    const days = (s.raidWeekdays || []).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => WD[d]).join(' · ') || CONFIG.guild.raidDaysText;
    const time = s.raidStart ? `${s.raidStart}${s.raidEnd ? ` – ${s.raidEnd}` : ''} Uhr` : '';
    const next = raidDates(s).find(d => d >= todayIso());
    let rel = '';
    if (next) {
      const diff = Math.round((parseIso(next) - parseIso(todayIso())) / 86400000);
      rel = diff === 0 ? 'heute' : diff === 1 ? 'morgen' : `in ${diff} Tagen`;
    }
    $('[data-times]').innerHTML = `<div class="hi-title">Raidzeiten</div>
      <div class="hi-big">${esc(days)}</div>
      ${time ? `<div class="hi-sub">${esc(time)}</div>` : ''}
      ${next ? `<div class="hi-next"><span class="hi-dot"></span>Nächster Raid: <b>${WD_LONG[parseIso(next).getDay()]}, ${fmtShort(next)}</b> <span class="hi-rel">${rel}</span></div>` : ''}`;
  }
  /** Roster: Anzahl, Rollen, Klassenverteilung als Balken */
  function drawRoster(players) {
    const active = players.filter(p => p.active !== false);
    const n = r => active.filter(p => r.includes(p.rolle)).length;
    // Pro Klasse: Icon der häufigsten Spec + Anzahl, Tooltip mit Aufteilung nach Spec
    const byCls = Object.keys(CLASSES).map(k => {
      const ps = active.filter(p => p.klasse === k);
      const specs = {}; ps.forEach(p => { specs[p.spec] = (specs[p.spec] || 0) + 1; });
      const top = Object.entries(specs).sort((a, b) => b[1] - a[1])[0]?.[0];
      return { k, n: ps.length, icon: specIcon(k, top), specs };
    }).filter(x => x.n).sort((a, b) => b.n - a.n || clsName(a.k).localeCompare(clsName(b.k)));
    $('[data-roster]').innerHTML = `<div class="hi-title">Roster</div>
      <div class="hi-big">${active.length} Raider</div>
      <div class="hi-sub">${n(['Tank'])} Tanks · ${n(['Healer'])} Heiler · ${n(['mDD', 'rDD'])} DPS</div>
      <div class="hi-cls">${byCls.map(c => `<a class="hi-ci" href="#/roster" style="--cls:${clsColor(c.k)}" title="${esc(clsName(c.k))}: ${c.n} – ${esc(Object.entries(c.specs).map(([sp, m]) => `${sp} ${m}`).join(', '))}">
        <img src="${classIconUrl(c.k)}" alt="${esc(clsName(c.k))}" data-fallback="${esc(c.icon || '')}">
        <b>${c.n}</b></a>`).join('')}</div>`;
    // Klassen-Icon nicht erreichbar (z. B. Vorschau) → Spec-Icon bzw. Kürzel
    $('[data-roster]').querySelectorAll('img[data-fallback]').forEach(im => im.onerror = () => {
      if (im.dataset.fallback) { im.src = im.dataset.fallback; im.dataset.fallback = ''; } else im.replaceWith(Object.assign(document.createElement('span'), { textContent: im.alt.slice(0, 2) }));
    });
  }
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
    watchNowCover(b.id);
    const pct = b.bestPct !== '' && b.bestPct != null ? Number(b.bestPct) : null;
    const pulls = Number(b.totalPulls || b.pulls || 0);
    const started = b.status === 'prog' && (pct != null || pulls);
    box.innerHTML = `
      ${nowCover.id === b.id && nowCover.img ? `<div class="pc-now-cover"><img src="${nowCover.img}" alt=""><div class="pc-now-label">Aktuell am Boss</div></div>` : '<div class="pc-now-label">Aktuell am Boss</div>'}
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
    store.watchCol('players', drawRoster),
    store.watchDoc('settings', 'main', s => {
      if (!s) return;
      settings = s; drawBosses(); drawSwitch();
      if (!wcl) getWcl(s).then(d => { if (d) { wcl = d; drawBosses(); } });
      drawTimes();
    }),
  ];
  return () => { unsubs.forEach(u => u()); nowCover.stop?.(); };
}

/** Kleines Konfetti (ohne Bibliothek) – einmal, ca. 2 Sekunden */
function confetti(anchor) {
  if (!anchor) return;
  const r = anchor.getBoundingClientRect();
  const c = document.createElement('canvas');
  c.className = 'confetti'; c.width = innerWidth; c.height = innerHeight;
  document.body.appendChild(c);
  const ctx = c.getContext('2d');
  const colors = ['#ffd23a', '#ffb000', '#b07cff', '#e26bff', '#5cf2a8', '#ffffff'];
  const parts = Array.from({ length: 140 }, () => ({
    x: r.left + r.width * (0.15 + Math.random() * 0.7), y: r.top + r.height / 2,
    vx: (Math.random() - 0.5) * 9, vy: -6 - Math.random() * 7, g: 0.22 + Math.random() * 0.1,
    s: 4 + Math.random() * 5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
    c: colors[Math.floor(Math.random() * colors.length)],
  }));
  const start = performance.now();
  (function frame(t) {
    const age = t - start;
    ctx.clearRect(0, 0, c.width, c.height);
    for (const p of parts) {
      p.vy += p.g; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - age / 2200);
      ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
    }
    if (age < 2300) requestAnimationFrame(frame); else c.remove();
  })(start);
}

/** Offizielles Klassen-Icon (Wowhead-CDN, wie die Item-Icons) */
const CLASS_ICON = { DK: 'deathknight', DH: 'demonhunter', Druid: 'druid', Evoker: 'evoker', Hunter: 'hunter', Mage: 'mage', Monk: 'monk',
  Paladin: 'paladin', Priest: 'priest', Rogue: 'rogue', Shaman: 'shaman', Warlock: 'warlock', Warrior: 'warrior' };
function classIconUrl(k) { return `https://wow.zamimg.com/images/wow/icons/large/classicon_${CLASS_ICON[k] || String(k).toLowerCase()}.jpg`; }
