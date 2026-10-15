// ─────────────────────────────────────────────────────────────
//  Wochen-Check (Offi): M+ Keys & Vault pro Spieler aus wowaudit,
//  Raid-Teilnahme der Woche aus dem Rotation Planer
//  Anforderung (z. B. 4 Keys ab +10) unter settings/main.weekReq
// ─────────────────────────────────────────────────────────────
import { store } from '../store.js';
import { STATUSES, clsColor, esc, h, specImg, sortPlayers, fmtShort, parseIso, WD, raidDates, toast } from '../ui.js';
import { getWeek, weekRange, vaultSlots } from '../wowaudit.js';

export function gearTabs(active) {
  return `<div class="guide-tabs" style="margin-bottom:18px">
    <a class="guide-tab ${active === 'gear' ? 'active' : ''}" href="#/gear">Gear</a>
    <a class="guide-tab ${active === 'week' ? 'active' : ''}" href="#/gear/woche">Wochen-Check</a>
  </div>`;
}

export function render(root) {
  const el = h(`
    <div class="container page">
      <div class="page-head">
        <div>
          <div class="eyebrow" style="color:var(--gold)">Offi</div>
          <h2 class="page-title">Wochen-Check</h2>
          <p class="page-sub">Wer hat diese Woche wie viele M+ Keys gemacht, welche Vault-Slots sind offen, wer war im Raid. Daten aus wowaudit und dem Rotation Planer.</p>
          <p class="wcl-note" data-note></p>
        </div>
      </div>
      ${gearTabs('week')}
      <div class="wk-bar">
        <div class="wk-nav">
          <button class="btn btn-ghost btn-sm" data-prev>←</button>
          <div class="wk-label" data-label>–</div>
          <button class="btn btn-ghost btn-sm" data-next>→</button>
        </div>
        <div class="wk-req">
          <span class="muted">Anforderung:</span>
          <input class="input" type="number" min="0" max="20" data-rk title="Anzahl Keys"> <span>Keys ab +</span>
          <input class="input" type="number" min="2" max="30" data-rl title="Mindest-Keylevel">
        </div>
        <div class="spacer"></div>
        <button class="chip active" data-only title="Nur Core + Rotation">Core + Rotation</button>
      </div>
      <div class="stats" data-stats style="margin-top:14px"></div>
      <div class="card" style="overflow:auto;margin-top:14px" data-wrap><div class="loading">Lade wowaudit…</div></div>
      <div data-extra></div>
    </div>`);
  root.appendChild(el);
  const $ = s => el.querySelector(s);

  let players = [], settings = null, days = {}, offset = 0, data, current = null, onlyRaid = true, loading = 0;

  $('[data-prev]').onclick = () => { offset++; load(); };
  $('[data-next]').onclick = () => { if (offset > 0) { offset--; load(); } };
  $('[data-only]').onclick = e => { onlyRaid = !onlyRaid; e.target.classList.toggle('active', onlyRaid); draw(); };
  const saveReq = async () => {
    const keys = Math.max(0, Math.min(20, Number($('[data-rk]').value) || 0));
    const level = Math.max(2, Math.min(30, Number($('[data-rl]').value) || 2));
    await store.set('settings', 'main', { weekReq: { keys, level } });
    toast('Anforderung gespeichert');
  };
  $('[data-rk]').onchange = saveReq; $('[data-rl]').onchange = saveReq;

  async function load() {
    const run = ++loading;
    data = undefined; draw();
    const period = current != null ? current - offset : null;
    const d = await getWeek(period, players);
    if (run !== loading) return;
    data = d;
    if (d?.current) current = d.current;
    draw();
  }

  function draw() {
    if (!settings) return;
    const req = { keys: 4, level: 10, ...(settings.weekReq || {}) };
    if (document.activeElement !== $('[data-rk]')) $('[data-rk]').value = req.keys;
    if (document.activeElement !== $('[data-rl]')) $('[data-rl]').value = req.level;
    const rg = weekRange(offset);
    $('[data-label]').innerHTML = `<b>${offset === 0 ? 'Diese Woche' : offset === 1 ? 'Letzte Woche' : `Vor ${offset} Wochen`}</b><span class="muted">${WD[parseIso(rg.from).getDay()]} ${fmtShort(rg.from)} – ${WD[parseIso(rg.to).getDay()]} ${fmtShort(rg.to)}</span>`;
    $('[data-next]').disabled = offset === 0;

    const note = $('[data-note]');
    const wrap = $('[data-wrap]');
    if (data === undefined) { wrap.innerHTML = '<div class="loading">Lade wowaudit…</div>'; return; }
    if (!data || data.configured === false) { note.textContent = ''; wrap.innerHTML = '<div class="empty" style="border:none"><div class="big">📅</div>wowaudit ist noch nicht verbunden – API-Schlüssel als Secret im Worker eintragen (README).</div>'; $('[data-stats]').innerHTML = ''; return; }
    if (data.error) { wrap.innerHTML = `<div class="empty" style="border:none">wowaudit konnte nicht geladen werden (${esc(data.error)}).</div>`; return; }
    note.innerHTML = `<span class="wcl-dot"></span>wowaudit verbunden${data.demo ? ' (Beispieldaten)' : ''} · wird alle 15 Min. aktualisiert`;

    // wowaudit-Charaktere ↔ Roster
    const active = players.filter(p => p.active !== false && (!onlyRaid || p.status === 'Core' || p.status === 'Rotation'));
    const byName = new Map(data.characters.map(c => [c.name.toLowerCase(), c]));
    const used = new Set();
    const raidDays = raidDates(settings).filter(d => d >= rg.from && d <= rg.to && d <= isoToday());
    const rows = sortPlayers(active).map(p => {
      const c = byName.get(String(p.charName || p.name).toLowerCase()) || byName.get(p.name.toLowerCase()) || null;
      if (c) used.add(c.name.toLowerCase());
      const keys = c?.keys || [];
      const good = keys.filter(k => k >= req.level).length;
      const raid = raidDays.filter(d => days[d]?.att?.[p.id] === 'X').length;
      return { p, c, keys, good, ok: good >= req.keys, vault: vaultSlots(keys), raid };
    });
    rows.sort((a, b) => (a.c ? 0 : 1) - (b.c ? 0 : 1) || Number(a.ok) - Number(b.ok) || a.good - b.good || a.p.name.localeCompare(b.p.name));

    const withData = rows.filter(r => r.c);
    const okN = withData.filter(r => r.ok).length;
    const allKeys = withData.reduce((a, r) => a + r.keys.length, 0);
    const full = withData.filter(r => r.vault[2] != null).length;
    $('[data-stats]').innerHTML = `
      <div class="card stat"><div class="stat-label">Anforderung erfüllt</div><div class="stat-value" style="color:${okN === withData.length ? 'var(--venom)' : 'var(--gold)'}">${okN}<small style="font-size:16px;color:var(--text-3)"> / ${withData.length}</small></div></div>
      <div class="card stat"><div class="stat-label">Keys gesamt</div><div class="stat-value">${allKeys}</div></div>
      <div class="card stat"><div class="stat-label">Vault 3/3 (M+)</div><div class="stat-value">${full}</div></div>
      <div class="card stat"><div class="stat-label">Raidtage bisher</div><div class="stat-value">${raidDays.length}</div></div>`;

    wrap.innerHTML = `<table class="wk-table"><thead><tr>
        <th>Spieler</th><th>Keys</th><th>Ab +${req.level}</th><th>Höchster</th><th>Vault (M+)</th><th>Raid</th><th>Status</th><th>Alle Keys</th>
      </tr></thead><tbody>
      ${rows.map(r => {
        const name = `<div class="pname-inner" style="--cls:${clsColor(r.p.klasse)}">${specImg(r.p, 20)}<span class="nm">${esc(r.p.name)}</span>${r.p.status !== 'Core' ? `<span class="status-tag st-${esc(r.p.status)}">${esc(STATUSES[r.p.status]?.label || r.p.status)}</span>` : ''}</div>`;
        if (!r.c) return `<tr class="wk-none"><td>${name}</td><td colspan="7" class="muted">Nicht in wowaudit gefunden – Charaktername prüfen oder in wowaudit hinzufügen</td></tr>`;
        return `<tr class="${r.ok ? '' : 'wk-bad'}">
          <td>${name}</td>
          <td class="num">${r.keys.length}</td>
          <td class="num"><b class="${r.ok ? 'ok' : 'bad'}">${r.good}</b><span class="muted"> / ${req.keys}</span></td>
          <td class="num">${r.keys[0] ? `+${r.keys[0]}` : '–'}</td>
          <td><div class="vault">${r.vault.map((v, i) => `<span class="vs ${v == null ? 'empty' : v >= req.level ? 'hi' : 'lo'}" title="Slot ${i + 1} (${[1, 4, 8][i]} Keys)">${v == null ? '–' : '+' + v}</span>`).join('')}</div></td>
          <td class="num">${raidDays.length ? `${r.raid}/${raidDays.length}` : '<span class="muted">–</span>'}</td>
          <td>${r.ok ? '<span class="ench-ok">✓</span>' : `<span class="ench-miss">${Math.max(0, req.keys - r.good)} ${req.keys - r.good > 1 ? 'fehlen' : 'fehlt'}</span>`}</td>
          <td><div class="wk-keys">${r.keys.map(k => `<span class="${k >= req.level ? 'hi' : ''}">${k}</span>`).join('') || '<span class="muted">keine</span>'}</div></td>
        </tr>`;
      }).join('')}
      </tbody></table>`;

    const others = data.characters.filter(c => !used.has(c.name.toLowerCase()) && c.keys.length);
    $('[data-extra]').innerHTML = others.length ? `<p class="hint" style="margin-top:12px">In wowaudit, aber nicht ${onlyRaid ? 'unter Core/Rotation ' : ''}im Roster (Twinks?): ${others.map(c => `${esc(c.name)} (${c.keys.length} Keys)`).join(' · ')}</p>` : '';
  }

  const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  let started = false;
  const unsubs = [
    store.watchDoc('settings', 'main', s => { settings = s || {}; draw(); }),
    store.watchCol('raidDays', ds => { days = Object.fromEntries(ds.map(d => [d.id, d])); draw(); }),
    store.watchCol('players', ps => { players = ps; if (!started) { started = true; load(); } else draw(); }),
  ];
  return () => { loading++; unsubs.forEach(u => u()); };
}
