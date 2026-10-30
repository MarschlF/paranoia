// ─────────────────────────────────────────────────────────────
//  App: Router, Navigation, Login-Status
// ─────────────────────────────────────────────────────────────
import { store, auth } from './store.js';
import { esc, h, clsColor } from './ui.js';
import { DEMO_MODE } from './config.js';
import { RUF, hasGuide, isRead, watchMine } from './guidereads.js';
import { watchMyAnswer } from './polls.js';
import { startPresence, isOnline, presencePlayer, ago } from './presence.js';
import { watchStatus } from './status.js';
import * as polls from './pages/polls.js';
import { raidBosses, raidDates, todayIso, parseIso, WD } from './ui.js';

import * as home from './pages/home.js';
import * as roster from './pages/roster.js';
import * as progress from './pages/progress.js';
import * as guides from './pages/guides.js';
import * as useful from './pages/useful.js';
import * as logs from './pages/logs.js';
import * as vods from './pages/vods.js';
import * as gear from './pages/gear.js';
import * as compare from './pages/compare.js';
import * as apply from './pages/apply.js';
import * as applications from './pages/applications.js';
import * as legal from './pages/legal.js';
import * as planning from './pages/planning.js';

const ROUTES = {
  // access: public = alle · member = Raider auf dem Discord · officer = nur Offiziere
  '':           { page: home,     access: 'public' },
  'roster':     { page: roster,   access: 'public' },
  'progress':   { page: progress, access: 'public' },
  'bewerben':   { page: apply,    access: 'public' },
  'bewerbungen':{ page: applications, access: 'officer' },
  'rechtliches':{ page: legal,    access: 'public' },
  'guides':     { page: guides,   access: 'member' },
  'vergleich':  { page: compare,  access: 'member' },
  'umfragen':   { page: polls,    access: 'member' },
  'nuetzliches':{ page: useful,   access: 'member' },
  'gear':       { page: gear,     access: 'officer' },
  'planung':    { page: planning, access: 'officer' },   // Reiter: Comp | Rotation | Loot
  'logs':       { page: logs,     access: 'member' },
  'vods':       { page: vods,     access: 'officer' },
};

const app = document.getElementById('app');
app.classList.add('compact');   // schmale Seitenköpfe überall (Home & Bewerben haben eigene Köpfe)
let cleanup = null;

const MOVED = { comp: 'planung/comp', rotation: 'planung/rotation', loot: 'planung/loot' };   // alte Links weiterleiten
function parseRoute() {
  let parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (MOVED[parts[0]]) {
    parts = [...MOVED[parts[0]].split('/'), ...parts.slice(1)];
    history.replaceState(null, '', '#/' + parts.join('/'));
  }
  return { key: parts[0] || '', params: parts.slice(1) };
}

function render() {
  if (typeof cleanup === 'function') { try { cleanup(); } catch {} }
  cleanup = null;
  window.scrollTo(0, 0);
  document.getElementById('modal-root').innerHTML = '';

  const { key, params } = parseRoute();
  const route = ROUTES[key] || ROUTES[''];

  document.querySelectorAll('[data-route]').forEach(a =>
    a.classList.toggle('active', a.dataset.route === (key || 'home')));
  document.getElementById('nav-menu').classList.remove('open');
  document.documentElement.classList.remove('nav-open');

  if (route.access !== 'public' && !auth.isMember) return renderWall();
  if (route.access === 'officer' && !auth.isOfficer) return renderOfficerWall();

  app.innerHTML = '';
  cleanup = route.page.render(app, { params, ...(route.args || {}) });
}

/** Login-Fehler in Klartext (Code kommt vom Worker bzw. von Firebase) */
function authErrorText(err) {
  if (!err) return '';
  if (err === 'not_member') return 'Du bist nicht auf dem Paranøia-Discord – Zugang nur für Gildenmitglieder.';
  if (err === 'denied') return 'Login abgebrochen.';
  if (err === 'state') return 'Login-Sicherheitsprüfung fehlgeschlagen – bitte im selben Tab nochmal versuchen (Werbeblocker/Cookies prüfen).';
  if (err.startsWith('discord_token')) return `Discord hat den Login abgelehnt (${err}) – Client Secret oder Redirect-URL im Worker prüfen.`;
  if (err.startsWith('member_check')) return `Server-Mitgliedschaft konnte nicht geprüft werden (${err}) – DISCORD_GUILD_ID prüfen.`;
  if (err.startsWith('firebase:')) return `Firebase hat die Anmeldung abgelehnt (${err.slice(9)}) – FIREBASE_PRIVATE_KEY / FIREBASE_CLIENT_EMAIL im Worker prüfen.`;
  return `Login fehlgeschlagen (${err}).`;
}

function renderWall() {
  const err = sessionStorage.getItem('pn-auth-error');
  sessionStorage.removeItem('pn-auth-error');
  const msg = authErrorText(err);

  app.innerHTML = '';
  const el = h(`
    <div class="container page">
      <div class="card wall">
        <div class="lock">🔒</div>
        <h2>Interner Bereich</h2>
        ${msg ? `<div class="err">${esc(msg)}</div>` : ''}
        <p>Boss Guides, Logs, Vergleich, Umfragen und Nützliches sind nur für Mitglieder des Paranøia-Discords sichtbar.</p>
        <button class="btn btn-discord btn-lg" data-login>
          ${DISCORD_SVG} Login mit Discord
        </button>
      </div>
    </div>`);
  el.querySelector('[data-login]').onclick = () => auth.login();
  app.appendChild(el);
}

function renderOfficerWall() {
  app.innerHTML = '';
  app.appendChild(h(`
    <div class="container page">
      <div class="card wall">
        <div class="lock">🛡️</div>
        <h2>Offi-Bereich</h2>
        <p>Raidplanung, Gear, VoDs und Bewerbungen sind nur für Offiziere sichtbar.</p>
        <a href="#/guides" class="btn btn-ghost">Zu den Boss Guides</a>
      </div>
    </div>`));
}

const DISCORD_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.86-.61 1.25a18.27 18.27 0 0 0-5.49 0 12.6 12.6 0 0 0-.62-1.25.08.08 0 0 0-.08-.04 19.7 19.7 0 0 0-4.88 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.05 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .09-.03c.46-.63.87-1.3 1.22-1.99a.08.08 0 0 0-.04-.1 13.1 13.1 0 0 1-1.87-.9.08.08 0 0 1-.01-.12l.37-.3a.07.07 0 0 1 .08-.01c3.93 1.8 8.18 1.8 12.06 0a.07.07 0 0 1 .08.01l.37.3a.08.08 0 0 1 0 .12c-.6.35-1.22.65-1.88.9a.08.08 0 0 0-.04.1c.36.7.77 1.36 1.22 2a.08.08 0 0 0 .09.03 19.8 19.8 0 0 0 6-3.03.08.08 0 0 0 .03-.05c.5-5.18-.84-9.68-3.55-13.66a.06.06 0 0 0-.03-.03zM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.96 2.42-2.16 2.42zm7.97 0c-1.18 0-2.15-1.09-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42z"/></svg>`;

function renderAuth(u) {
  const box = document.getElementById('nav-auth');
  document.querySelectorAll('.nav-internal:not(.nav-officer) a').forEach(a => a.classList.toggle('locked', !u?.member));
  document.getElementById('nav-officer').classList.toggle('hidden', !u?.officer);
  document.querySelector('[data-route="bewerben"]')?.classList.toggle('hidden', !!u?.member && !DEMO_MODE);   // Mitglieder brauchen den Link nicht (Demo zeigt ihn)
  if (!u) {
    box.innerHTML = `<button class="btn btn-discord btn-sm">${DISCORD_SVG} Login</button>`;
    box.querySelector('button').onclick = () => auth.login();
    return;
  }
  const avatar = u.avatar
    ? `<img src="${esc(u.avatar)}" alt="">`
    : `<img alt="" src="data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 28'><rect width='28' height='28' fill='#1c2330'/><text x='14' y='19' font-size='13' text-anchor='middle' fill='#a3adbd' font-family='sans-serif'>${esc(u.name[0] || '?')}</text></svg>`)}">`;
  box.innerHTML = `
    ${u.officer ? '<div class="online-wrap status-wrap" id="status-wrap"></div><div class="online-wrap" id="online-wrap"></div>' : ''}
    <div class="user-wrap">
      <button class="user-chip" data-user aria-haspopup="true" aria-expanded="false" title="Konto">
        ${avatar}
        <span class="name">${esc(u.name)}</span>
        <span class="role-badge ${u.officer ? 'role-officer' : 'role-member'}">${u.officer ? 'Offizier' : 'Raider'}</span>
        <svg class="uc-caret" width="12" height="12" viewBox="0 0 12 12"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="user-menu" data-umenu hidden>
        <div class="um-head">${avatar}<div><div class="um-name">${esc(u.name)}</div><div class="um-role ${u.officer ? 'off' : ''}">${u.officer ? 'Offizier' : 'Raider'} · über Discord angemeldet</div></div></div>
        <button class="um-item um-logout" data-logout>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>
          Abmelden
        </button>
      </div>
    </div>
    ${DEMO_MODE ? `<button class="btn btn-ghost btn-sm" data-demo-role title="Nur im Demo-Modus">${u.officer ? 'Raider' : 'Offi'}-Ansicht</button>` : ''}`;
  box.querySelector('[data-demo-role]')?.addEventListener('click', () => auth.setDemoRole(!u.officer));
  // Konto-Menü: Klick auf den Chip öffnet, Klick daneben / Esc schließt
  const chip = box.querySelector('[data-user]'), menu = box.querySelector('[data-umenu]');
  const setOpen = o => { menu.hidden = !o; chip.setAttribute('aria-expanded', String(o)); chip.classList.toggle('open', o); };
  chip.onclick = e => { e.stopPropagation(); setOpen(menu.hidden); };
  document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) setOpen(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
  box.querySelector('[data-logout]').addEventListener('click', () => {
    if (DEMO_MODE) { setOpen(false); import('./ui.js').then(m => m.toast('Im Demo-Modus gibt es kein Abmelden')); return; }
    auth.logout();
  });
  watchOnline(u);
}

// ── Online-Status (nur Offis) ───────────────────────────────
let onlineStop = null;
function watchOnline(u) {
  onlineStop?.(); onlineStop = null;
  if (!u?.officer) return;
  const st = { pres: [], players: [], reads: [], open: false };
  const draw = () => {
    const wrap = document.getElementById('online-wrap'); if (!wrap) return;
    const rows = st.pres.map(d => ({ d, p: presencePlayer(d, st.players, st.reads), on: isOnline(d) }))
      .sort((a, b) => (b.on - a.on) || String(b.d.at).localeCompare(String(a.d.at)));
    const n = rows.filter(r => r.on).length;
    const avatar = d => d.avatar ? `<img class="on-ava" src="${esc(d.avatar)}" alt="">` : `<span class="on-ava">${esc((d.name || '?')[0])}</span>`;
    wrap.innerHTML = `
      <button class="online-btn" data-on title="Wer ist gerade auf der Seite?"><span class="on-dot ${n ? 'live' : ''}"></span>${n}<span class="on-txt"> online</span></button>
      ${st.open ? `<div class="online-panel">
        <div class="comp-section-title" style="margin-bottom:6px">Online & zuletzt gesehen</div>
        ${rows.length ? rows.map(r => `<div class="on-row ${r.on ? 'on' : ''}">
          ${avatar(r.d)}
          <span class="on-name" ${r.p ? `style="color:${clsColor(r.p.klasse)}"` : ''}>${esc(r.p?.name || r.d.name)}${r.p && r.p.name.toLowerCase() !== String(r.d.name).toLowerCase() ? ` <small class="muted">${esc(r.d.name)}</small>` : ''}</span>
          <span class="on-when">${r.on ? '<span class="on-dot live"></span>online' : esc(ago(r.d.at))}</span>
        </div>`).join('') : '<p class="muted" style="font-size:13px">Noch niemand eingeloggt.</p>'}
        <p class="hint" style="margin-top:8px">Nur für Offis sichtbar · zählt nur eingeloggte Nutzer mit offenem Tab.</p>
      </div>` : ''}`;
    wrap.querySelector('[data-on]').onclick = e => { e.stopPropagation(); st.open = !st.open; draw(); };
  };
  const close = e => { if (st.open && !e.target.closest('#online-wrap')) { st.open = false; draw(); } };
  document.addEventListener('click', close);
  const tick = setInterval(draw, 30000);
  const un = [
    store.watchCol('presence', ps => { st.pres = ps; draw(); }, () => {}),
    store.watchCol('players', ps => { st.players = ps; draw(); }),
    store.watchCol('guideReads', rs => { st.reads = rs; draw(); }, () => {}),
  ];
  onlineStop = () => { un.forEach(f => f()); clearInterval(tick); document.removeEventListener('click', close); };
}

// ── Footer: Raidzeiten aus den Einstellungen ────────────────
function watchFooter() {
  const box = document.querySelector('[data-foot-times]'); if (!box) return;
  store.watchDoc('settings', 'main', s => {
    if (!s) return;
    const days = (s.raidWeekdays || []).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => WD[d]).join(' · ');
    const time = s.raidStart ? `${s.raidStart}${s.raidEnd ? `–${s.raidEnd}` : ''}` : '';
    box.innerHTML = days ? `<span class="foot-label">Raidzeiten</span><b>${esc(days)}</b>${time ? `<span>${esc(time)} Uhr</span>` : ''}` : '';
  });
}

// ── Start ───────────────────────────────────────────────────
document.getElementById('nav-toggle').onclick = () => {
  const open = document.getElementById('nav-menu').classList.toggle('open');
  document.documentElement.classList.toggle('nav-open', open);   // Handy: Seite dahinter nicht mitscrollen
};

if (DEMO_MODE) document.getElementById('demo-banner').classList.remove('hidden');

app.innerHTML = '<div class="loading">Lade…</div>';
try {
  await store.init();
} catch (err) {
  console.error(err);
  app.innerHTML = `<div class="container page"><div class="empty"><div class="big">⚠️</div>Verbindung zu Firebase fehlgeschlagen. Prüfe <code>js/config.js</code>.</div></div>`;
  throw err;
}
watchFooter();

// ── „Neu für dich": Rufzeichen am Menü + Popup unten links ──
// Ungelesene Guides im aktuellen Raid und offene, noch nicht ausgefüllte Umfragen
let badgeStop = null;
const NEWS_HIDE = 'pn-news-hide';
const hidden = () => { try { return new Set(JSON.parse(sessionStorage.getItem(NEWS_HIDE) || '[]')); } catch { return new Set(); } };
function hideNews(key) { const s = hidden(); s.add(key); try { sessionStorage.setItem(NEWS_HIDE, JSON.stringify([...s])); } catch {} }

const newsShown = new Set();
let newsOpen = false;          // weitere Popups aufgeklappt?
function watchGuideBadge(u) {
  badgeStop?.(); badgeStop = null;
  const setBadge = (route, n) => {
    const link = document.querySelector(`[data-route="${route}"]`); if (!link) return;
    link.querySelector('.ruf')?.remove(); if (n) link.insertAdjacentHTML('beforeend', RUF);
  };
  const box = document.getElementById('news-root');
  if (!u?.member) { setBadge('guides', 0); setBadge('umfragen', 0); box.innerHTML = ''; return; }
  const st = { bosses: [], guides: {}, settings: {}, mine: null, polls: [], my: {} };
  const pollSubs = new Map();

  function upd() {
    const guides = raidBosses(st.bosses, st.settings.currentRaid || '', st.settings)
      .filter(b => hasGuide(st.guides[b.id]) && !isRead(st.mine, b.id, st.guides[b.id]));
    const polls = st.polls.filter(p => p.open && st.my[p.id] === null);
    setBadge('guides', guides.length); setBadge('umfragen', polls.length);

    const route = location.hash;
    const hide = hidden();
    const items = [
      ...polls.map(p => ({ key: `poll:${p.id}`, icon: '🗳️', kind: 'Neue Umfrage', title: p.title, href: `#/umfragen/${encodeURIComponent(p.id)}`, cta: 'Ausfüllen' })),
      ...guides.map(b => {
        const g = st.guides[b.id], changed = st.mine?.reads?.[b.id];
        return { key: `guide:${b.id}:${g.version || 1}`, icon: '📖', kind: changed ? 'Guide geändert' : 'Neuer Guide', title: b.name, href: `#/guides/${encodeURIComponent(b.id)}`, cta: changed ? 'Neu bestätigen' : 'Lesen' };
      }),
    ].filter(it => !hide.has(it.key) && route !== it.href);
    // Bestehende Popups stehen lassen (sonst bricht die Animation ab), nur neue einfügen / weggefallene entfernen
    // Standard: nur EIN Popup, der Rest steckt hinter „+ N weitere“ (deckt sonst Inhalt/Footer zu)
    if (items.length <= 1) newsOpen = false;
    const show = items.slice(0, newsOpen ? 4 : 1);
    const keep = new Set(show.map(it => it.key));
    box.querySelectorAll('.news-card').forEach(c => { if (!keep.has(c.dataset.key)) c.remove(); });
    box.querySelector('.news-more')?.remove();
    let delay = 0, prev = null;
    for (const it of show) {
      let c = [...box.querySelectorAll('.news-card')].find(x => x.dataset.key === it.key);
      if (!c) {
        const fresh = !newsShown.has(it.key); newsShown.add(it.key);
        c = h(`<div class="news-card ${fresh ? 'pop' : ''}" data-key="${esc(it.key)}" style="--d:${fresh ? (delay++) * 0.18 : 0}s">
          <span class="news-ico" title="${esc(it.kind)}">${RUF}</span>
          <div class="news-txt"><div class="news-kind">${esc(it.kind)}</div><div class="news-title">${esc(it.title)}</div></div>
          <a class="btn btn-primary btn-sm" href="${esc(it.href)}">${esc(it.cta)}</a>
          <button class="icon-btn news-x" title="Ausblenden">✕</button>
        </div>`);
        c.querySelector('.news-x').onclick = () => { hideNews(c.dataset.key); c.remove(); upd(); };
        c.querySelector('a').onclick = () => setTimeout(upd, 50);
        c.addEventListener('animationend', e => { if (e.animationName === 'questShine') c.classList.remove('pop'); });
      }
      // nur verschieben, wenn die Position wirklich nicht passt (Verschieben startet Animationen neu)
      const ok = prev ? prev.nextElementSibling === c : box.firstElementChild === c;
      if (!ok) { if (prev) prev.after(c); else box.prepend(c); }
      prev = c;
    }
    if (items.length > 1) {
      const rest = items.length - show.length;
      const btn = h(`<button class="news-more">${newsOpen ? (rest > 0 ? `+ ${rest} weitere · ` : '') + 'Einklappen ▾' : `+ ${items.length - 1} weitere anzeigen ▴`}</button>`);
      btn.onclick = () => { newsOpen = !newsOpen; upd(); };
      box.appendChild(btn);
    }
  }
  const un = [
    store.watchCol('bosses', b => { st.bosses = b; upd(); }),
    store.watchCol('guides', g => { st.guides = Object.fromEntries(g.map(x => [x.id, x])); upd(); }),
    store.watchDoc('settings', 'main', s => { st.settings = s || {}; upd(); }),
    watchMine(d => { st.mine = d; upd(); }),
    store.watchCol('polls', ps => {
      st.polls = ps;
      ps.filter(p => p.open && !pollSubs.has(p.id)).forEach(p => pollSubs.set(p.id, watchMyAnswer(p.id, a => { st.my[p.id] = a; upd(); })));
      upd();
    }, () => {}),
  ];
  window.addEventListener('hashchange', upd);
  badgeStop = () => { un.forEach(f => f()); pollSubs.forEach(f => f()); window.removeEventListener('hashchange', upd); };
}

// Login-Fehler sofort zeigen – auch wenn man auf einer öffentlichen Seite landet
{
  const err = sessionStorage.getItem('pn-auth-error');
  const { key } = parseRoute();
  if (err && (ROUTES[key] || ROUTES['']).access === 'public') {
    sessionStorage.removeItem('pn-auth-error');
    const el = h(`<div class="toast err" style="max-width:520px">${esc(authErrorText(err))}</div>`);
    document.getElementById('toast-root').appendChild(el);
    setTimeout(() => el.remove(), 15000);
    el.onclick = () => el.remove();
  }
}

// Offis: Rufzeichen an „Bewerbungen“, solange neue Bewerbungen da sind
let appStop = null;
function watchApplications(u) {
  appStop?.(); appStop = null;
  const link = document.querySelector('[data-route="bewerbungen"]'); if (!link) return;
  link.querySelector('.ruf')?.remove();
  if (!u?.officer) return;
  appStop = store.watchCol('applications', as => {
    link.querySelector('.ruf')?.remove();
    if (as.some(a => a.status === 'neu')) link.insertAdjacentHTML('beforeend', RUF);
  }, () => {});
}

let lastMember = null;
auth.onChange(u => {
  renderAuth(u);
  watchStatus(u);
  startPresence(u);
  watchGuideBadge(u);
  watchApplications(u);
  // Nur neu rendern, wenn sich der Zugang tatsächlich ändert
  const member = !!u?.member + ':' + !!u?.officer;
  if (member !== lastMember) { lastMember = member; render(); }
});
window.addEventListener('hashchange', render);
