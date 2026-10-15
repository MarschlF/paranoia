// ─────────────────────────────────────────────────────────────
//  App: Router, Navigation, Login-Status
// ─────────────────────────────────────────────────────────────
import { store, auth } from './store.js';
import { esc, h } from './ui.js';
import { DEMO_MODE } from './config.js';
import { RUF, hasGuide, isRead, watchMine } from './guidereads.js';
import { raidBosses } from './ui.js';

import * as home from './pages/home.js';
import * as roster from './pages/roster.js';
import * as progress from './pages/progress.js';
import * as tracker from './pages/tracker.js';
import * as guides from './pages/guides.js';
import * as useful from './pages/useful.js';
import * as logs from './pages/logs.js';
import * as vods from './pages/vods.js';
import * as comp from './pages/comp.js';
import * as gear from './pages/gear.js';

const ROUTES = {
  // access: public = alle · member = Raider auf dem Discord · officer = nur Offiziere
  '':           { page: home,     access: 'public' },
  'roster':     { page: roster,   access: 'public' },
  'progress':   { page: progress, access: 'public' },
  'guides':     { page: guides,   access: 'member' },
  'nuetzliches':{ page: useful,   access: 'member' },
  'gear':       { page: gear,     access: 'officer' },
  'rotation':   { page: tracker,  access: 'officer', args: { mode: 'rotation' } },
  'loot':       { page: tracker,  access: 'officer', args: { mode: 'loot' } },
  'logs':       { page: logs,     access: 'member' },
  'vods':       { page: vods,     access: 'officer' },
  'comp':       { page: comp,     access: 'officer' },
};

const app = document.getElementById('app');
let cleanup = null;

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
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

  if (route.access !== 'public' && !auth.isMember) return renderWall();
  if (route.access === 'officer' && !auth.isOfficer) return renderOfficerWall();

  app.innerHTML = '';
  cleanup = route.page.render(app, { params, ...(route.args || {}) });
}

function renderWall() {
  const err = sessionStorage.getItem('pn-auth-error');
  sessionStorage.removeItem('pn-auth-error');
  const msg = {
    not_member: 'Du bist nicht auf dem Paranøia-Discord – Zugang nur für Gildenmitglieder.',
    denied: 'Login abgebrochen.',
    token: 'Login fehlgeschlagen – bitte nochmal versuchen.',
  }[err] || (err ? 'Login fehlgeschlagen.' : '');

  app.innerHTML = '';
  const el = h(`
    <div class="container page">
      <div class="card wall">
        <div class="lock">🔒</div>
        <h2>Interner Bereich</h2>
        ${msg ? `<div class="err">${esc(msg)}</div>` : ''}
        <p>Boss Guides, Logs und Nützliches sind nur für Mitglieder des Paranøia-Discords sichtbar.</p>
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
        <p>Comp, Rotation, Loot, Gear und VoDs sind nur für Offiziere sichtbar.</p>
        <a href="#/guides" class="btn btn-ghost">Zu den Boss Guides</a>
      </div>
    </div>`));
}

const DISCORD_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.86-.61 1.25a18.27 18.27 0 0 0-5.49 0 12.6 12.6 0 0 0-.62-1.25.08.08 0 0 0-.08-.04 19.7 19.7 0 0 0-4.88 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.05 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .09-.03c.46-.63.87-1.3 1.22-1.99a.08.08 0 0 0-.04-.1 13.1 13.1 0 0 1-1.87-.9.08.08 0 0 1-.01-.12l.37-.3a.07.07 0 0 1 .08-.01c3.93 1.8 8.18 1.8 12.06 0a.07.07 0 0 1 .08.01l.37.3a.08.08 0 0 1 0 .12c-.6.35-1.22.65-1.88.9a.08.08 0 0 0-.04.1c.36.7.77 1.36 1.22 2a.08.08 0 0 0 .09.03 19.8 19.8 0 0 0 6-3.03.08.08 0 0 0 .03-.05c.5-5.18-.84-9.68-3.55-13.66a.06.06 0 0 0-.03-.03zM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.96 2.42-2.16 2.42zm7.97 0c-1.18 0-2.15-1.09-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42z"/></svg>`;

function renderAuth(u) {
  const box = document.getElementById('nav-auth');
  document.querySelectorAll('.nav-internal:not(.nav-officer) a').forEach(a => a.classList.toggle('locked', !u?.member));
  document.getElementById('nav-officer').classList.toggle('hidden', !u?.officer);
  if (!u) {
    box.innerHTML = `<button class="btn btn-discord btn-sm">${DISCORD_SVG} Login</button>`;
    box.querySelector('button').onclick = () => auth.login();
    return;
  }
  const avatar = u.avatar
    ? `<img src="${esc(u.avatar)}" alt="">`
    : `<img alt="" src="data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 28'><rect width='28' height='28' fill='#1c2330'/><text x='14' y='19' font-size='13' text-anchor='middle' fill='#a3adbd' font-family='sans-serif'>${esc(u.name[0] || '?')}</text></svg>`)}">`;
  box.innerHTML = `
    <div class="user-chip">
      ${avatar}
      <span class="name">${esc(u.name)}</span>
      <span class="role-badge ${u.officer ? 'role-officer' : 'role-member'}">${u.officer ? 'Offizier' : 'Raider'}</span>
      ${DEMO_MODE ? '' : '<button class="icon-btn" title="Logout" data-logout>⎋</button>'}
    </div>
    ${DEMO_MODE ? `<button class="btn btn-ghost btn-sm" data-demo-role title="Nur im Demo-Modus">${u.officer ? 'Raider' : 'Offi'}-Ansicht</button>` : ''}`;
  box.querySelector('[data-demo-role]')?.addEventListener('click', () => auth.setDemoRole(!u.officer));
  box.querySelector('[data-logout]')?.addEventListener('click', () => auth.logout());
}

// ── Start ───────────────────────────────────────────────────
document.getElementById('nav-toggle').onclick = () => document.getElementById('nav-menu').classList.toggle('open');
if (DEMO_MODE) document.getElementById('demo-banner').classList.remove('hidden');

app.innerHTML = '<div class="loading">Lade…</div>';
try {
  await store.init();
} catch (err) {
  console.error(err);
  app.innerHTML = `<div class="container page"><div class="empty"><div class="big">⚠️</div>Verbindung zu Firebase fehlgeschlagen. Prüfe <code>js/config.js</code>.</div></div>`;
  throw err;
}

// Rufzeichen an „Boss Guides", solange im aktuellen Raid ein Guide unbestätigt ist
let badgeStop = null;
function watchGuideBadge(u) {
  badgeStop?.(); badgeStop = null;
  const link = document.querySelector('[data-route="guides"]');
  const set = n => { link.querySelector('.ruf')?.remove(); if (n) link.insertAdjacentHTML('beforeend', RUF); };
  if (!u?.member) { set(0); return; }
  const st = { bosses: [], guides: {}, settings: {}, mine: null };
  const upd = () => set(raidBosses(st.bosses, st.settings.currentRaid || '', st.settings)
    .filter(b => hasGuide(st.guides[b.id]) && !isRead(st.mine, b.id, st.guides[b.id])).length);
  const un = [
    store.watchCol('bosses', b => { st.bosses = b; upd(); }),
    store.watchCol('guides', g => { st.guides = Object.fromEntries(g.map(x => [x.id, x])); upd(); }),
    store.watchDoc('settings', 'main', s => { st.settings = s || {}; upd(); }),
    watchMine(d => { st.mine = d; upd(); }),
  ];
  badgeStop = () => un.forEach(f => f());
}

let lastMember = null;
auth.onChange(u => {
  renderAuth(u);
  watchGuideBadge(u);
  // Nur neu rendern, wenn sich der Zugang tatsächlich ändert
  const member = !!u?.member + ':' + !!u?.officer;
  if (member !== lastMember) { lastMember = member; render(); }
});
window.addEventListener('hashchange', render);
