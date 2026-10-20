// ─────────────────────────────────────────────────────────────
//  Dienst-Status für Offis (Punkt oben in der Leiste, neben „online“)
//  Fragt GET /status am Worker ab (dort 5 Min. zwischengespeichert), hier alle 10 Min.
// ─────────────────────────────────────────────────────────────
import { auth } from './store.js';
import { CONFIG, DEMO_MODE } from './config.js';
import { esc } from './ui.js';

let stop = null;

export function watchStatus(u) {
  stop?.(); stop = null;
  if (!u?.officer) return;
  const st = { data: null, loading: false, open: false, failed: false };
  const base = (CONFIG.authWorkerUrl || '').replace(/\/$/, '');

  const load = async (fresh = false) => {
    st.loading = true; draw();
    try {
      if (DEMO_MODE) { await new Promise(r => setTimeout(r, fresh ? 500 : 0)); st.data = demo(); }
      else if (!base) st.data = { checked: new Date().toISOString(), items: [{ key: 'worker', label: 'Worker', state: 'err', msg: 'authWorkerUrl fehlt in js/config.js' }] };
      else {
        const t = await auth.idToken();
        const r = await fetch(`${base}/status${fresh ? '?fresh=1' : ''}`, { headers: { Authorization: `Bearer ${t}` } });
        if (r.status === 404) throw new Error('alt');   // Worker noch ohne /status
        st.data = r.ok ? await r.json() : null;
        if (!st.data) throw new Error(String(r.status));
      }
      st.failed = false;
    } catch (e) {
      st.failed = true;
      st.data = { checked: new Date().toISOString(), items: [{ key: 'worker', label: 'Worker', state: 'err',
        msg: e.message === 'alt' ? 'Worker ist noch nicht auf dem neuesten Stand (npx wrangler deploy)' : 'Worker nicht erreichbar' }] };
    }
    st.loading = false; draw();
  };

  const icon = s => s === 'ok' ? '✓' : s === 'off' ? '–' : '✗';
  function draw() {
    const wrap = document.getElementById('status-wrap'); if (!wrap) return;
    const items = st.data?.items || [];
    const bad = items.filter(i => i.state === 'err').length;
    const offN = items.filter(i => i.state === 'off').length;
    const cls = !st.data ? '' : bad ? 'bad' : 'good';
    const title = !st.data ? 'Status wird geprüft…' : bad ? `${bad} Dienst${bad > 1 ? 'e' : ''} mit Problem` : 'Alle Dienste laufen';
    const t = st.data ? new Date(st.data.checked).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' }) : '';
    wrap.innerHTML = `
      <button class="status-btn ${cls}" data-st title="${esc(title)}">
        <span class="st-dot ${cls}"></span>${bad ? `<b>${bad}</b>` : ''}<span class="st-txt">${bad ? ' Problem' + (bad > 1 ? 'e' : '') : ' Status'}</span>
      </button>
      ${st.open ? `<div class="online-panel status-panel">
        <div class="comp-section-title" style="margin-bottom:6px">Dienste</div>
        ${items.map(i => `<div class="st-row ${i.state}">
          <span class="st-ico">${icon(i.state)}</span>
          <span class="st-main"><span class="st-label">${esc(i.label)}</span>${i.msg ? `<span class="st-msg">${esc(i.msg)}</span>` : ''}</span>
        </div>`).join('') || '<p class="muted" style="font-size:13px">Wird geprüft…</p>'}
        <div class="st-foot">
          <span class="hint">${t ? `Geprüft ${t} Uhr` : ''}${offN ? ` · „–“ = nicht eingerichtet` : ''}</span>
          <button class="btn btn-ghost btn-sm" data-refresh ${st.loading ? 'disabled' : ''}>${st.loading ? 'Prüfe…' : 'Neu prüfen'}</button>
        </div>
      </div>` : ''}`;
    wrap.querySelector('[data-st]').onclick = e => { e.stopPropagation(); st.open = !st.open; draw(); };
    wrap.querySelector('[data-refresh]')?.addEventListener('click', e => { e.stopPropagation(); load(true); });
  }
  const close = e => { if (st.open && !e.target.closest('#status-wrap')) { st.open = false; draw(); } };
  document.addEventListener('click', close, true);
  const iv = setInterval(() => load(), 10 * 60e3);
  load();
  stop = () => { clearInterval(iv); document.removeEventListener('click', close, true); };
}

function demo() {
  return { checked: new Date().toISOString(), demo: true, items: [
    { key: 'login', label: 'Login (Discord)', state: 'ok', msg: '' },
    { key: 'firebase', label: 'Datenbank-Zugang (Firebase)', state: 'ok', msg: '' },
    { key: 'wcl', label: 'Warcraft Logs', state: 'ok', msg: '' },
    { key: 'rio', label: 'Raider.IO', state: 'ok', msg: '' },
    { key: 'youtube', label: 'YouTube (VoD-Marker)', state: 'err', msg: 'YouTube Data API v3 im Google-Projekt nicht aktiviert' },
    { key: 'comp', label: 'Comp-Webhook (Discord)', state: 'ok', msg: 'Postet als „Paranøia“' },
    { key: 'apply', label: 'Bewerbungs-Webhook (Discord)', state: 'off', msg: 'Kein DISCORD_APPLY_WEBHOOK_URL – Keine Discord-Meldung bei neuen Bewerbungen' },
    { key: 'wowaudit', label: 'wowaudit (M+ Keys)', state: 'off', msg: 'Nicht eingerichtet (optional)' },
  ] };
}
