// ─────────────────────────────────────────────────────────────
//  Loot-Import aus RCLootCouncil (Export als CSV oder TSV)
//  Zählt pro Spieler und Raidtag +1 Item im Loot Tracker.
//  Bereits importierte Zeilen werden gemerkt (raidDays/<datum>.rclc) → kein Doppelzählen.
//  Namen, die nicht im Roster stehen, ordnet man einmal zu → wird gemerkt (settings.main.lootAliases).
// ─────────────────────────────────────────────────────────────
import { store } from './store.js';
import { esc, h, openModal, toast, fmtDate, raidDates, isoDate, parseIso, WD, sortPlayers } from './ui.js';

// Antworten, die standardmäßig NICHT zählen (Entzaubern, Bank, Pass …)
const SKIP = /disenchant|entzaub|bank|pass|free|frei|offspec ?\(free\)|transmog/i;
const DIFF = { 14: 'Normal', 15: 'Heroic', 16: 'Mythic', 17: 'LFR' };

/** CSV/TSV mit Anführungszeichen parsen */
export function parseTable(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const sep = (firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length ? '\t'
    : (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some(x => x.trim())) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur); if (row.some(x => x.trim())) rows.push(row);
  return rows;
}

function parseDate(s) {
  s = String(s || '').trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/))) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return '';
}

/** RCLC-Export → Einträge */
export function parseRclc(text) {
  const rows = parseTable(text.trim());
  if (rows.length < 2) throw new Error('Keine Daten gefunden');
  const head = rows[0].map(x => x.trim().toLowerCase());
  const col = (...names) => head.findIndex(x => names.includes(x));
  const C = {
    player: col('player', 'name', 'spieler'), date: col('date', 'datum'), time: col('time', 'zeit'),
    id: col('id'), item: col('item', 'itemname'), itemID: col('itemid'), response: col('response', 'antwort'),
    award: col('isawardreason'), boss: col('boss'), diff: col('difficultyid'), instance: col('instance'),
  };
  if (C.player < 0 || C.date < 0) throw new Error('Spalten „player“ und „date“ fehlen – bitte als CSV aus RCLootCouncil exportieren');
  return rows.slice(1).map((r, i) => {
    const g = k => (C[k] >= 0 ? String(r[C[k]] ?? '').trim() : '');
    const full = g('player');
    const name = full.split('-')[0].trim();
    const date = parseDate(g('date'));
    const response = g('response');
    const award = /^true$/i.test(g('award'));
    const item = g('item').replace(/^\[|\]$/g, '').replace(/\|c[0-9a-f]{8}|\|r|\|H[^|]*\||\|h/gi, '');
    const id = (g('id') || `${full}|${g('itemID')}|${date}|${g('time')}`).replace(/[.\/#$\[\]]/g, '_').slice(0, 120);
    return { i, name, full, date, response, award, item, boss: g('boss'), diff: DIFF[g('diff')] || '', id };
  }).filter(e => e.name && e.date);
}

/** Import-Dialog für den Loot Tracker */
export function openRclcImport({ players, settings, days }) {
  const aliases = { ...(settings.lootAliases || {}) };
  const dates = new Set(raidDates(settings));
  const byName = new Map();
  players.forEach(p => { byName.set(String(p.charName || p.name).toLowerCase(), p.id); byName.set(String(p.name).toLowerCase(), p.id); });
  const findPlayer = n => aliases[n.toLowerCase()] || byName.get(n.toLowerCase()) || '';
  // Nach Mitternacht gelootet → gehört zum Raidtag davor
  const raidDay = d => {
    if (dates.has(d)) return d;
    const prev = parseIso(d); prev.setDate(prev.getDate() - 1);
    const p = isoDate(prev);
    return dates.has(p) ? p : '';
  };

  let entries = [];
  const body = h(`
    <div>
      <p class="hint" style="margin-bottom:10px">In WoW: <code>/rc history</code> → oben <strong>Export</strong> → Format <strong>CSV</strong> (oder TSV) → kopieren und hier einfügen. Du kannst auch die Datei wählen.</p>
      <textarea class="textarea" data-text rows="5" placeholder="player,date,time,id,item,itemID,…"></textarea>
      <div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap">
        <label class="btn btn-ghost btn-sm" style="cursor:pointer">Datei wählen<input type="file" accept=".csv,.tsv,.txt" data-file hidden></label>
        <button class="btn btn-ghost btn-sm" data-parse>Einlesen</button>
        <span class="muted" style="font-size:13px" data-sum></span>
      </div>
      <div class="rc-wrap" data-preview></div>
    </div>`);

  const { close } = openModal({
    title: 'Loot aus RCLootCouncil importieren', body, wide: true,
    actions: [{ label: 'Abbrechen' }, { label: 'Importieren', cls: 'btn-primary', onClick: () => doImport() }],
  });

  const sel = players.filter(p => p.active !== false);
  const playerOpts = cur => `<option value="">– nicht zählen –</option>` + sortPlayers(sel).map(p => `<option value="${esc(p.id)}" ${p.id === cur ? 'selected' : ''}>${esc(p.name)}</option>`).join('');

  function read(text) {
    try { entries = parseRclc(text); }
    catch (e) { body.querySelector('[data-preview]').innerHTML = `<div class="empty" style="border:none;color:var(--red)">${esc(e.message)}</div>`; return; }
    entries.forEach(e => {
      e.pid = findPlayer(e.name);
      e.day = raidDay(e.date);
      e.done = !!(e.day && days[e.day]?.rclc?.[e.id]);
      e.use = !!e.pid && !!e.day && !e.done && !e.award && !SKIP.test(e.response);
    });
    draw();
  }

  function draw() {
    const box = body.querySelector('[data-preview]');
    if (!entries.length) { box.innerHTML = '<div class="empty" style="border:none">Keine Einträge erkannt.</div>'; return; }
    const unknown = [...new Set(entries.filter(e => !e.pid).map(e => e.name))];
    box.innerHTML = `
      ${unknown.length ? `<div class="rc-unknown"><div class="comp-section-title" style="margin-bottom:8px">Nicht im Roster gefunden – einmal zuordnen (wird gemerkt)</div>
        ${unknown.map(n => `<div class="rc-map"><span>${esc(n)}</span><select class="select" data-alias="${esc(n)}">${playerOpts('')}</select></div>`).join('')}</div>` : ''}
      <table class="rc-table"><thead><tr><th></th><th>Raidtag</th><th>Spieler</th><th>Item</th><th>Antwort</th><th>Boss</th></tr></thead><tbody>
      ${entries.map(e => {
        const p = players.find(x => x.id === e.pid);
        const why = e.done ? 'schon importiert' : !e.day ? `kein Raidtag (${fmtDate(e.date)})` : !e.pid ? 'Spieler unbekannt' : '';
        return `<tr class="${e.use ? '' : 'off'}">
          <td><input type="checkbox" data-use="${e.i}" ${e.use ? 'checked' : ''} ${e.done || !e.day || !e.pid ? 'disabled' : ''}></td>
          <td class="nowrap">${e.day ? `${WD[parseIso(e.day).getDay()]} ${fmtDate(e.day)}` : '<span class="muted">–</span>'}</td>
          <td>${p ? esc(p.name) : `<span class="muted">${esc(e.name)}</span>`}${p && e.name.toLowerCase() !== p.name.toLowerCase() ? ` <small class="muted">(${esc(e.name)})</small>` : ''}</td>
          <td>${esc(e.item)}</td>
          <td>${esc(e.response)}${why ? ` <small class="rc-why">${esc(why)}</small>` : ''}</td>
          <td class="muted">${esc(e.boss)}${e.diff ? ` · ${esc(e.diff)}` : ''}</td>
        </tr>`;
      }).join('')}</tbody></table>`;
    box.querySelectorAll('[data-use]').forEach(c => c.onchange = () => { entries[c.dataset.use].use = c.checked; summary(); });
    box.querySelectorAll('[data-alias]').forEach(s => s.onchange = () => {
      const n = s.dataset.alias.toLowerCase();
      if (s.value) aliases[n] = s.value; else delete aliases[n];
      entries.filter(e => e.name.toLowerCase() === n).forEach(e => { e.pid = s.value; e.use = !!s.value && !!e.day && !e.done && !e.award && !SKIP.test(e.response); });
      draw();
    });
    summary();
  }

  function summary() {
    const use = entries.filter(e => e.use);
    const ppl = new Set(use.map(e => e.pid)).size;
    const done = entries.filter(e => e.done).length;
    body.querySelector('[data-sum]').textContent = entries.length
      ? `${use.length} Items für ${ppl} Spieler werden gezählt${done ? ` · ${done} schon importiert` : ''}` : '';
  }

  async function doImport() {
    const use = entries.filter(e => e.use);
    if (!use.length) { toast('Nichts zum Importieren', 'err'); return true; }
    const per = {};
    use.forEach(e => {
      const d = (per[e.day] ||= { loot: { ...(days[e.day]?.loot || {}) }, rclc: { ...(days[e.day]?.rclc || {}) } });
      d.loot[e.pid] = Number(d.loot[e.pid] || 0) + 1;
      d.rclc[e.id] = e.pid;
    });
    for (const [d, data] of Object.entries(per)) await store.set('raidDays', d, data);
    // neue Namens-Zuordnungen merken
    if (JSON.stringify(aliases) !== JSON.stringify(settings.lootAliases || {})) await store.set('settings', 'main', { lootAliases: aliases });
    toast(`${use.length} Items importiert`);
  }

  body.querySelector('[data-parse]').onclick = () => read(body.querySelector('[data-text]').value);
  body.querySelector('[data-text]').addEventListener('paste', () => setTimeout(() => read(body.querySelector('[data-text]').value), 0));
  body.querySelector('[data-file]').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const t = await f.text();
    body.querySelector('[data-text]').value = t; read(t);
  };
  return close;
}
