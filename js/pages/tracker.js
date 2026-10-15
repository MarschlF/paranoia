// ─────────────────────────────────────────────────────────────
//  Rotation Planer & Loot Tracker (gleiche Tabelle, zwei Modi)
//  Pro Raidtag ein Dokument: raidDays/<YYYY-MM-DD> { att: {pid: X|B|A}, loot: {pid: n} }
// ─────────────────────────────────────────────────────────────
import { store, auth } from '../store.js';
import { STATUSES, ROLES, clsColor, esc, h, specImg, raidDates, todayIso, fmtShort, fmtDate, parseIso, WD, MONTHS, openModal, toast } from '../ui.js';
import { openPlayerManager } from '../players.js';
import { openRclcImport } from '../rclc.js';

const ATT_CYCLE = ['', 'X', 'B', 'A'];

export function render(root, { mode }) {
  const isRot = mode === 'rotation';
  const canEdit = auth.isOfficer;

  const el = h(`
    <div class="container page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Intern · <span data-season>–</span></div>
          <h2 class="page-title">${isRot ? 'Rotation Planer' : 'Loot Tracker'}</h2>
          <p class="page-sub">${isRot ? 'Wer war dabei, wer saß auf der Bank, wer war abgemeldet.' : 'Erhaltene Items pro Raidtag – für faire Loot-Verteilung.'}</p>
        </div>
        <div class="page-actions">
          ${canEdit && !isRot ? `<button class="btn btn-primary" data-rclc title="Loot-Verlauf aus RCLootCouncil einfügen">RCLC-Import</button>` : ''}
          ${canEdit ? `<button class="btn btn-ghost" data-manage>Spieler verwalten</button>
                       <button class="btn btn-ghost" data-extra>+ Raidtag</button>` : ''}
        </div>
      </div>

      <div class="tracker-toolbar">
        <div class="legend">
          ${isRot ? `
            <span><i class="lg c-X" style="background:var(--venom-dim)"></i>Dabei</span>
            <span><i class="lg c-B" style="background:var(--gold-dim)"></i>Bench</span>
            <span><i class="lg c-A" style="background:var(--red-dim)"></i>Abgemeldet</span>
            ${canEdit ? '<span class="muted">· Klick = weiterschalten · Rechtsklick = leeren</span>' : ''}`
          : `${canEdit ? '<span class="muted">Klick = +1 Item · Rechtsklick = −1</span>' : ''}`}
        </div>
        <div class="spacer"></div>
        ${!isRot && canEdit ? '<button class="chip" data-minus title="Für Handy: Tippen zieht 1 ab">−1-Modus</button>' : ''}
        <select class="select" data-sort style="width:auto;height:32px;font-size:13px">
          <option value="group">Nach Status</option>
          <option value="name">Nach Name</option>
          <option value="att">Attendance ↓</option>
          <option value="loot-asc">Wenigste Items zuerst</option>
          <option value="loot-desc">Meiste Items zuerst</option>
        </select>
      </div>

      <div class="table-wrap" data-wrap><div class="loading">Lade…</div></div>
    </div>`);
  root.appendChild(el);

  let settings = null, players = [], days = {}, sortBy = isRot ? 'group' : 'loot-asc', minusMode = false, scrolled = false;
  // Reihenfolge wird eingefroren, damit Zeilen beim Eintragen nicht springen.
  // Neu sortiert wird nur beim Wechsel der Sortierung, beim Öffnen der Seite oder wenn Spieler dazukommen/wegfallen.
  let order = null, daysLoaded = false;
  el.querySelector('[data-sort]').value = sortBy;
  el.querySelector('[data-sort]').onchange = e => { sortBy = e.target.value; order = null; draw(); };
  el.querySelector('[data-manage]')?.addEventListener('click', openPlayerManager);
  el.querySelector('[data-rclc]')?.addEventListener('click', () => openRclcImport({ players, settings, days }));
  el.querySelector('[data-extra]')?.addEventListener('click', () => addExtraDay(settings));
  el.querySelector('[data-minus]')?.addEventListener('click', e => { minusMode = !minusMode; e.target.classList.toggle('active', minusMode); });

  const wrap = el.querySelector('[data-wrap]');

  function stats(p, dates, past) {
    let att = 0, bench = 0, loot = 0, last4 = 0;
    const last4Days = past.slice(-4);
    for (const d of dates) {
      const day = days[d]; if (!day) continue;
      const a = day.att?.[p.id];
      if (a === 'X') att++;
      if (a === 'B') bench++;
      const l = Number(day.loot?.[p.id] || 0);
      loot += l;
      if (last4Days.includes(d)) last4 += l;
    }
    const pct = past.length ? Math.round((att / past.length) * 100) : null;
    return { att, bench, loot, last4, pct };
  }

  function draw() {
    if (!settings) return;
    el.querySelector('[data-season]').textContent = `${settings.season || ''} · ${settings.raidName || ''}`;
    const dates = raidDates(settings);
    const today = todayIso();
    const past = dates.filter(d => d <= today);
    const active = players.filter(p => p.active !== false);

    if (!active.length) { wrap.innerHTML = '<div class="empty" style="border:none"><div class="big">👥</div>Noch keine Spieler – über „Spieler verwalten" hinzufügen.</div>'; return; }
    if (!dates.length) { wrap.innerHTML = '<div class="empty" style="border:none"><div class="big">📅</div>Keine Raidtage – Season-Zeitraum unter Progress → Raid-Einstellungen festlegen.</div>'; return; }

    const rows = active.map(p => ({ p, s: stats(p, dates, past) }));
    const byName = (a, b) => a.p.name.localeCompare(b.p.name);
    const sorters = {
      group: (a, b) => (STATUSES[a.p.status]?.order ?? 9) - (STATUSES[b.p.status]?.order ?? 9) || (ROLES[a.p.rolle]?.order ?? 9) - (ROLES[b.p.rolle]?.order ?? 9) || byName(a, b),
      name: byName,
      att: (a, b) => b.s.att - a.s.att || byName(a, b),
      'loot-asc': (a, b) => a.s.loot - b.s.loot || b.s.att - a.s.att || byName(a, b),
      'loot-desc': (a, b) => b.s.loot - a.s.loot || byName(a, b),
    };
    const ids = rows.map(r => `${r.p.id}:${r.p.status}:${r.p.rolle}`).sort().join('|');
    if (!order || order.key !== ids) {
      rows.sort(sorters[sortBy]);
      if (daysLoaded) order = { key: ids, pos: new Map(rows.map((r, i) => [r.p.id, i])) };
    } else {
      rows.sort((a, b) => order.pos.get(a.p.id) - order.pos.get(b.p.id));
    }

    // Spalten-Kopf: Monate
    const months = [];
    dates.forEach(d => {
      const k = d.slice(0, 7);
      if (months.at(-1)?.k === k) months.at(-1).n++; else months.push({ k, n: 1 });
    });
    const sumHeads = isRot
      ? ['Dabei', '%', 'Bench', 'Items']
      : ['Items', 'Letzte 4', 'Ø/Raid', 'Dabei'];
    const nextRaid = dates.find(d => d >= today);

    let html = `<table class="tracker ${canEdit ? 'editable' : ''}"><thead>
      <tr><th class="sticky-col month" rowspan="2">Spieler</th>
        ${sumHeads.map((s, i) => `<th class="sum-col ${i === sumHeads.length - 1 ? 'last' : ''}" rowspan="2" style="left:${170 + i * 64}px">${s}</th>`).join('')}
        ${months.map(m => `<th class="month" colspan="${m.n}">${MONTHS[Number(m.k.slice(5)) - 1]} ${m.k.slice(0, 4)}</th>`).join('')}
      </tr><tr>
        ${dates.map(d => {
          const cls = d === nextRaid ? 'today' : d < today ? 'past' : '';
          const extra = (settings.extraDays || []).includes(d);
          return `<th class="day ${cls}" data-day="${d}" title="${fmtDate(d)}${extra ? ' · Extra-Raid' : ''}${canEdit ? ' · Klicken für Optionen' : ''}" style="${canEdit ? 'cursor:pointer' : ''}">
            <span class="wd">${WD[parseIso(d).getDay()]}${extra ? '★' : ''}</span>${fmtShort(d)}</th>`;
        }).join('')}
      </tr></thead><tbody>`;

    let lastGroup = null;
    for (const { p, s } of rows) {
      if (sortBy === 'group' && p.status !== lastGroup) {
        lastGroup = p.status;
        html += `<tr class="group-row"><td class="sticky-col" colspan="${1 + sumHeads.length}">${esc(STATUSES[p.status]?.label || p.status)}</td><td colspan="${dates.length}"></td></tr>`;
      }
      const pctCls = s.pct == null ? '' : s.pct >= 80 ? 'pct-hi' : s.pct >= 50 ? 'pct-mid' : 'pct-lo';
      const sums = isRot
        ? [s.att, s.pct == null ? '–' : `<span class="pct ${pctCls}">${s.pct}%</span>`, s.bench || '–', s.loot || '–']
        : [`<span style="color:var(--violet)">${s.loot}</span>`, s.last4 || '–', s.att ? (s.loot / s.att).toFixed(1) : '–', s.att];
      html += `<tr style="--cls:${clsColor(p.klasse)}">
        <td class="sticky-col pname"><div class="pname-inner">${specImg(p, 20)}<span class="nm">${esc(p.name)}</span><span class="rl">${esc(p.rolle || '')}</span></div></td>
        ${sums.map((v, i) => `<td class="sum-col ${i === sums.length - 1 ? 'last' : ''}" style="left:${170 + i * 64}px">${v}</td>`).join('')}
        ${dates.map(d => {
          const day = days[d];
          const tc = d === nextRaid ? ' today-col' : '';
          if (isRot) {
            const v = day?.att?.[p.id] || '';
            return `<td class="${tc}"><div class="cell ${v ? 'c-' + v : ''}" data-p="${p.id}" data-d="${d}"></div></td>`;
          }
          const n = Number(day?.loot?.[p.id] || 0);
          return `<td class="${tc}"><div class="cell ${n ? 'c-loot' : ''}" data-p="${p.id}" data-d="${d}">${n || ''}</div></td>`;
        }).join('')}
      </tr>`;
    }
    html += '</tbody></table>';

    const keepX = wrap.scrollLeft, keepY = wrap.scrollTop;
    wrap.innerHTML = html;
    if (!scrolled) {
      scrolled = true;
      const th = wrap.querySelector('th.today');
      if (th) wrap.scrollLeft = Math.max(0, th.offsetLeft - 426 - 4 * 46);
    } else { wrap.scrollLeft = keepX; wrap.scrollTop = keepY; }
  }

  // ── Klicks (Event-Delegation) ─────────────────────────────
  if (canEdit) {
    const onCell = async (e, back) => {
      const cell = e.target.closest('.cell[data-p]');
      if (cell) {
        e.preventDefault();
        const { p, d } = cell.dataset;
        if (isRot) {
          const cur = days[d]?.att?.[p] || '';
          const next = back ? '' : ATT_CYCLE[(ATT_CYCLE.indexOf(cur) + 1) % ATT_CYCLE.length];
          await store.setMapField('raidDays', d, 'att', p, next || null);
        } else {
          const cur = Number(days[d]?.loot?.[p] || 0);
          const next = Math.max(0, cur + (back || minusMode ? -1 : 1));
          await store.setMapField('raidDays', d, 'loot', p, next || null);
        }
        return;
      }
      const th = e.target.closest('th[data-day]');
      if (th && !back) dayOptions(th.dataset.day, settings, days[th.dataset.day]);
    };
    wrap.addEventListener('click', e => onCell(e, false));
    wrap.addEventListener('contextmenu', e => { if (e.target.closest('.cell[data-p]')) onCell(e, true); });
  }

  const unsubs = [
    store.watchDoc('settings', 'main', s => { settings = s || {}; draw(); }),
    store.watchCol('players', ps => { players = ps; draw(); }),
    store.watchCol('raidDays', ds => { days = Object.fromEntries(ds.map(d => [d.id, d])); daysLoaded = true; draw(); },
      err => { wrap.innerHTML = `<div class="empty" style="border:none">Keine Berechtigung (${esc(err.code || '')}).</div>`; }),
  ];
  return () => unsubs.forEach(u => u());
}

// ── Raidtag-Optionen ────────────────────────────────────────
function dayOptions(d, settings, day) {
  const extra = (settings.extraDays || []).includes(d);
  const body = h(`
    <div>
      <div class="field" style="margin-bottom:14px"><label>Notiz zum Raidtag</label>
        <input class="input" data-note value="${esc(day?.note || '')}" placeholder="z. B. Farm + 3 Pulls auf Ula'tek"></div>
      <p class="hint">Fällt der Raid aus, kannst du den Tag ausblenden – bereits eingetragene Daten bleiben gespeichert.</p>
    </div>`);
  openModal({
    title: `${WD[parseIso(d).getDay()]}, ${fmtDate(d)}`,
    body,
    actions: [
      { label: extra ? 'Extra-Raid entfernen' : 'Raid ausgefallen', cls: 'btn-danger', onClick: async () => {
        if (extra) await store.set('settings', 'main', { extraDays: (settings.extraDays || []).filter(x => x !== d) });
        else await store.set('settings', 'main', { skipDays: [...new Set([...(settings.skipDays || []), d])] });
        toast('Raidtag ausgeblendet');
      } },
      { label: 'Speichern', cls: 'btn-primary', onClick: async () => {
        await store.set('raidDays', d, { note: body.querySelector('[data-note]').value });
        toast('Gespeichert');
      } },
    ],
  });
}

function addExtraDay(settings) {
  const skipped = (settings?.skipDays || []).slice().sort();
  const body = h(`
    <div>
      <div class="field"><label>Datum</label><input class="input" type="date" data-date></div>
      ${skipped.length ? `<p class="hint" style="margin:16px 0 8px">Ausgeblendete Raidtage wiederherstellen:</p>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${skipped.map(d => `<button class="chip" data-restore="${d}">${fmtDate(d)} ↺</button>`).join('')}</div>` : ''}
    </div>`);
  const { close } = openModal({
    title: 'Zusätzlicher Raidtag', body,
    actions: [{ label: 'Abbrechen' }, { label: 'Hinzufügen', cls: 'btn-primary', onClick: async () => {
      const d = body.querySelector('[data-date]').value;
      if (!d) { toast('Datum wählen', 'err'); return true; }
      await store.set('settings', 'main', {
        extraDays: [...new Set([...(settings.extraDays || []), d])],
        skipDays: (settings.skipDays || []).filter(x => x !== d),
      });
      toast(`${fmtDate(d)} hinzugefügt`);
    } }],
  });
  body.querySelectorAll('[data-restore]').forEach(b => b.onclick = async () => {
    await store.set('settings', 'main', { skipDays: skipped.filter(x => x !== b.dataset.restore) });
    toast('Wiederhergestellt'); close();
  });
}
