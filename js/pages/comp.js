// ─────────────────────────────────────────────────────────────
//  Raid Comp Planer (Offi)
//  comps/setup__<diff> { groups: { g1:[ids], g2:[…], …, bench:[ids] }, specs: {id: spec}, note, diff }
// ─────────────────────────────────────────────────────────────
import { store, auth } from '../store.js';
import { CONFIG, DEMO_MODE } from '../config.js';
import { CLASSES, ROLES, STATUSES, clsColor, esc, h, specImg, specIcon, toast, openModal, raidDates, todayIso, fmtShort, parseIso, WD } from '../ui.js';
import { coverOk } from '../raids.js';
import { guessRole } from '../players.js';

const ss = { get: k => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} } };
const DIFFS = { mythic: { label: 'Mythic', groups: 4 }, heroic: { label: 'Heroic', groups: 6 } };
const GROUP_SIZE = 5;

// Raid-Buffs & Utility nach Klasse – bei Klassenänderungen in Midnight hier anpassen
const BUFFS = [
  { name: 'Battle Shout',      what: 'Angriffskraft',         classes: ['Warrior'] },
  { name: 'Arcane Intellect',  what: 'Intelligenz',           classes: ['Mage'] },
  { name: 'Fortitude',         what: 'Ausdauer',              classes: ['Priest'] },
  { name: 'Mark of the Wild',  what: 'Vielseitigkeit',        classes: ['Druid'] },
  { name: 'Skyfury',           what: 'Meisterschaft',         classes: ['Shaman'] },
  { name: 'Mystic Touch',      what: 'Phys. Schaden am Ziel', classes: ['Monk'] },
  { name: 'Chaos Brand',       what: 'Magieschaden am Ziel',  classes: ['DH'] },
  { name: "Hunter's Mark",     what: 'Schaden am Ziel',       classes: ['Hunter'] },
  { name: 'Blessing of the Bronze', what: 'Bewegungs-CDs',    classes: ['Evoker'] },
  { name: 'Devotion Aura',     what: 'Schadensreduktion',     classes: ['Paladin'] },
];
const UTILITY = [
  { name: 'Bloodlust',       classes: ['Shaman', 'Mage', 'Hunter', 'Evoker'] },
  { name: 'Battle Rez',      classes: ['DK', 'Druid', 'Warlock', 'Paladin'] },
  { name: 'Rallying Cry',    classes: ['Warrior'] },
  { name: 'Darkness',        classes: ['DH'] },
  { name: 'Anti-Magic Zone', classes: ['DK'] },
  { name: 'Power Infusion',  classes: ['Priest'] },
];
const ARMOR = { Stoff: ['Mage', 'Priest', 'Warlock'], Leder: ['DH', 'Druid', 'Monk', 'Rogue'], Kette: ['Evoker', 'Hunter', 'Shaman'], Platte: ['DK', 'Paladin', 'Warrior'] };
const ROLE_ORDER = { Tank: 0, Healer: 1, mDD: 2, rDD: 3 };

export function render(root) {
  const el = h(`
    <div class="container page">
      <div class="page-head">
        <div>
          <div class="eyebrow" style="color:var(--gold)">Offi</div>
          <h2 class="page-title">Raid Comp</h2>
          <p class="page-sub">Spieler anklicken oder in eine Gruppe ziehen. Eingeplante Spieler: Klick = Spec ändern oder verschieben, Rechtsklick = entfernen.</p>
        </div>
        <div class="page-actions">
          <select class="select" data-diff style="width:auto;height:38px">
            ${Object.entries(DIFFS).map(([k, d]) => `<option value="${k}">${d.label} (${d.groups * GROUP_SIZE})</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="comp-layout">
        <aside class="card comp-pool" data-drop="pool">
          <div class="comp-pool-head"><input class="input" data-search placeholder="Spieler suchen…" autocomplete="off"></div>
          <div class="comp-pool-list" data-pool></div>
        </aside>

        <section class="comp-main">
          <div class="card card-pad comp-top">
            <div class="comp-count"><span data-count>0</span><small>/ <span data-size>20</span></small></div>
            <div class="progress-track" style="margin:0;flex:1"><div class="progress-fill" data-fill style="width:0%"></div></div>
            <div class="comp-tools">
              <button class="btn btn-ghost btn-sm" data-core>Core übernehmen</button>
              <select class="select" data-copy style="width:auto;height:32px;font-size:13px"><option value="">Kopieren von…</option></select>
              <button class="btn btn-ghost btn-sm" data-clear>Leeren</button>
              <button class="btn btn-primary btn-sm" data-image>Als Bild für Discord</button>
            </div>
          </div>
          <div class="comp-groups" data-groups></div>
          <div class="card comp-group comp-benchgroup" data-drop="bench">
            <div class="comp-group-head" data-target="bench">Ersatzbank <span data-bench-count></span></div>
            <div class="comp-bench-slots" data-benchslots></div>
          </div>
          <div class="card card-pad">
            <div class="comp-section-title">Notiz zum Setup</div>
            <input class="input" data-note placeholder="z. B. 2. Resto Shaman für Spirit Link in P2">
          </div>
          <div class="card card-pad">
            <div class="comp-section-title">Nicht eingeplant <span class="muted" data-out-n></span></div>
            <div class="comp-bench" data-out></div>
          </div>
        </section>

        <aside class="comp-side" data-side></aside>
      </div>
    </div>`);
  root.appendChild(el);
  const $ = s => el.querySelector(s);

  let players = [], comps = {}, settings = {};
  let diff = ss.get('pn-comp-diff') || 'mythic', search = '', target = 'g1';
  $('[data-diff]').value = diff;

  const groupKeys = () => Array.from({ length: DIFFS[diff].groups }, (_, i) => `g${i + 1}`);
  const emptyLayout = () => Object.fromEntries([...groupKeys(), 'bench'].map(k => [k, []]));
  const compId = (d = diff) => `setup__${d}`;
  const pById = id => players.find(p => p.id === id);
  /** Spieler mit der Spec, die in diesem Setup gilt (Offspec überschreibt Haupt-Spec nur hier) */
  const eff = id => {
    const p = pById(id); if (!p) return null;
    const sp = comps[compId()]?.specs?.[id];
    return sp && sp !== p.spec && CLASSES[p.klasse]?.specs.includes(sp)
      ? { ...p, spec: sp, rolle: guessRole(p.klasse, sp), offspec: true } : p;
  };
  const activeIds = () => new Set(players.filter(p => p.active !== false).map(p => p.id));

  /** Aktuelles Setup als { g1:[…], …, bench:[…] } – alte Einträge (players-Liste) werden umgerechnet */
  function layout() {
    const c = comps[compId()] || {};
    const act = activeIds();
    const out = emptyLayout();
    if (c.groups) for (const k of Object.keys(out)) out[k] = (c.groups[k] || []).filter(id => act.has(id));
    else if (c.players) fillGroups(out, c.players.filter(id => act.has(id)));
    return out;
  }
  function fillGroups(out, ids) {
    const sorted = ids.map(eff).filter(Boolean).sort((a, b) => (ROLE_ORDER[a.rolle] ?? 9) - (ROLE_ORDER[b.rolle] ?? 9) || a.name.localeCompare(b.name));
    for (const p of sorted) {
      const g = groupKeys().find(k => out[k].length < GROUP_SIZE);
      (g ? out[g] : out.bench).push(p.id);
    }
  }
  const inRaid = l => groupKeys().flatMap(k => l[k]);
  const whereIs = (l, id) => Object.keys(l).find(k => l[k].includes(id)) || null;

  async function saveLayout(l) {
    await store.set('comps', compId(), { groups: l, diff, updated: new Date().toISOString() });
  }
  /** Spieler nach dest verschieben ('pool' = entfernen). Mit swapWith wird bei voller Gruppe getauscht. */
  async function move(id, dest, swapWith = null) {
    const l = layout();
    const from = whereIs(l, id);
    if (from === dest && !swapWith) return;
    if (dest !== 'pool' && dest !== 'bench' && l[dest].length >= GROUP_SIZE && from !== dest) {
      if (swapWith && l[dest].includes(swapWith)) {
        l[dest][l[dest].indexOf(swapWith)] = id;
        if (from) l[from][l[from].indexOf(id)] = swapWith;   // Plätze tauschen
        return saveLayout(l);                                // aus dem Pool: anderer Spieler wird frei
      }
      toast(`Gruppe ${dest.slice(1)} ist voll – direkt auf einen Spieler ziehen zum Tauschen`, 'err'); return;
    }
    if (from) l[from] = l[from].filter(x => x !== id);
    if (dest !== 'pool') l[dest].push(id);
    await saveLayout(l);
  }
  /** Klick im Pool: in Zielgruppe, sonst nächste freie Gruppe, sonst Ersatzbank. Erneuter Klick entfernt. */
  async function addFromPool(id) {
    const l = layout();
    if (whereIs(l, id)) return move(id, 'pool');
    let dest = target;
    if (dest !== 'bench' && l[dest]?.length >= GROUP_SIZE) dest = groupKeys().find(k => l[k].length < GROUP_SIZE) || 'bench';
    if (dest === 'bench' && target !== 'bench') toast('Raid ist voll – auf die Ersatzbank gesetzt');
    await move(id, dest);
  }

  function chipMenu(id) {
    const p = pById(id); if (!p) return;
    const cur = eff(id);
    const l = layout(), from = whereIs(l, id);
    const specs = CLASSES[p.klasse]?.specs || [];
    const body = h(`<div>
      <div class="comp-section-title">Spec in diesem Setup</div>
      <div class="spec-pick">
        ${specs.map(sp => `<button class="spec-opt ${sp === cur.spec ? 'active' : ''}" data-spec="${esc(sp)}" style="--cls:${clsColor(p.klasse)}">
          ${specImg({ klasse: p.klasse, spec: sp }, 26)}
          <span><b>${esc(sp)}</b><small>${esc(guessRole(p.klasse, sp))}${sp === p.spec ? ' · Haupt-Spec' : ''}</small></span>
        </button>`).join('')}
      </div>
      <div class="comp-section-title" style="margin-top:16px">Verschieben</div>
      <div class="move-grid">
      ${groupKeys().map(k => `<button class="btn ${k === from ? 'btn-primary' : 'btn-ghost'}" data-to="${k}" ${l[k].length >= GROUP_SIZE && k !== from ? 'disabled' : ''}>Gruppe ${k.slice(1)} <span class="muted">${l[k].length}/5</span></button>`).join('')}
      <button class="btn ${from === 'bench' ? 'btn-primary' : 'btn-ghost'}" data-to="bench">Ersatzbank</button>
      <button class="btn btn-danger" data-to="pool">Entfernen</button>
    </div></div>`);
    const { close } = openModal({ title: p.name, body });
    body.querySelectorAll('[data-to]').forEach(b => b.onclick = async () => { close(); await move(id, b.dataset.to); });
    body.querySelectorAll('[data-spec]').forEach(b => b.onclick = async () => {
      close();
      const sp = b.dataset.spec;
      await store.set('comps', compId(), { diff });
      await store.setMapField('comps', compId(), 'specs', id, sp === p.spec ? null : sp);
      toast(sp === p.spec ? `${p.name}: zurück auf ${sp}` : `${p.name} spielt hier ${sp} (${guessRole(p.klasse, sp)})`);
    });
  }

  // ── Drag & Drop (Desktop) ─────────────────────────────────
  el.addEventListener('dragstart', e => {
    const c = e.target.closest?.('[data-drag]'); if (!c) return;
    e.dataTransfer.setData('text/plain', c.dataset.drag); e.dataTransfer.effectAllowed = 'move';
    c.classList.add('dragging');
  });
  el.addEventListener('dragend', e => {
    e.target.closest?.('[data-drag]')?.classList.remove('dragging');
    el.querySelectorAll('.drop-hover').forEach(x => x.classList.remove('drop-hover'));
  });
  el.addEventListener('dragover', e => {
    const z = e.target.closest?.('[data-drop]'); if (!z) return;
    e.preventDefault();
    el.querySelectorAll('.drop-hover').forEach(x => x !== z && x.classList.remove('drop-hover'));
    z.classList.add('drop-hover');
  });
  el.addEventListener('drop', e => {
    const z = e.target.closest?.('[data-drop]'); if (!z) return;
    e.preventDefault(); z.classList.remove('drop-hover');
    const id = e.dataTransfer.getData('text/plain'); if (!id) return;
    const onChip = e.target.closest('.comp-group [data-drag]')?.dataset.drag;
    move(id, z.dataset.drop, onChip && onChip !== id ? onChip : null);
  });

  // ── Bedienelemente ────────────────────────────────────────
  $('[data-diff]').onchange = e => { diff = e.target.value; ss.set('pn-comp-diff', diff); target = 'g1'; draw(); };
  $('[data-search]').oninput = e => { search = e.target.value.toLowerCase(); drawPool(); };
  $('[data-note]').onchange = e => store.set('comps', compId(), { note: e.target.value.trim(), diff }).then(() => toast('Notiz gespeichert'));
  $('[data-clear]').onclick = () => saveLayout(emptyLayout());
  $('[data-core]').onclick = () => {
    const l = emptyLayout();
    fillGroups(l, players.filter(p => p.active !== false && p.status === 'Core').map(p => p.id));
    saveLayout(l).then(() => toast('Core übernommen'));
  };
  $('[data-copy]').onchange = e => {
    const src = comps[e.target.value]; e.target.value = ''; if (!src) return;
    const l = emptyLayout(), act = activeIds();
    if (src.groups) {
      for (const k of Object.keys(l)) l[k] = (src.groups[k] || []).filter(id => act.has(id));
      // Gruppen 5/6 aus Heroic beim Kopieren nach Mythic auf freie Plätze bzw. Ersatzbank verteilen
      fillGroups(l, Object.keys(src.groups).filter(k => !(k in l)).flatMap(k => src.groups[k]).filter(id => act.has(id)));
    } else fillGroups(l, (src.players || []).filter(id => act.has(id)));
    saveLayout(l)
      .then(() => Promise.all(Object.entries(src.specs || {}).map(([pid, sp]) => store.setMapField('comps', compId(), 'specs', pid, sp))))
      .then(() => toast('Setup übernommen'));
  };
  $('[data-image]').onclick = () => exportImage();

  // ── Zeichnen ──────────────────────────────────────────────
  const chip = (p, small = false) => `
    <div class="comp-chip ${small ? 'small' : ''} ${p.offspec ? 'is-offspec' : ''}" draggable="true" data-drag="${esc(p.id)}" data-click="${esc(p.id)}" style="--cls:${clsColor(p.klasse)}" title="${esc(p.spec || '')} ${esc(CLASSES[p.klasse]?.name || '')}${p.offspec ? ' (Offspec in diesem Setup)' : ''}">
      ${specImg(p, small ? 18 : 22)}<span class="nm">${esc(p.name)}</span>${p.offspec ? `<span class="os-tag">${esc(p.rolle === 'Healer' ? 'Heal' : p.rolle)}</span>` : ''}
    </div>`;

  function draw() {
    $('[data-copy]').innerHTML = '<option value="">Kopieren von…</option>' + Object.keys(DIFFS)
      .filter(d => d !== diff && comps[compId(d)]?.groups && Object.values(comps[compId(d)].groups).flat().length)
      .map(d => `<option value="${esc(compId(d))}">${DIFFS[d].label}-Setup</option>`).join('');
    const noteInp = $('[data-note]');
    if (document.activeElement !== noteInp) noteInp.value = comps[compId()]?.note || '';
    drawPool(); drawMain(); drawSide();
  }

  function drawPool() {
    const l = layout();
    const list = players.filter(p => p.active !== false)
      .filter(p => !search || p.name.toLowerCase().includes(search) || (p.spec || '').toLowerCase().includes(search) || (CLASSES[p.klasse]?.name || '').toLowerCase().includes(search));
    const pool = $('[data-pool]');
    pool.innerHTML = Object.entries(ROLES).map(([role, r]) => {
      const group = list.filter(p => eff(p.id).rolle === role).sort((a, b) => (STATUSES[a.status]?.order ?? 9) - (STATUSES[b.status]?.order ?? 9) || a.name.localeCompare(b.name));
      if (!group.length) return '';
      return `<div class="comp-pool-group">${r.label}</div>` + group.map(p => {
        const at = whereIs(l, p.id), e = eff(p.id);
        return `<button class="comp-pick ${at ? 'in' : ''}" data-pid="${esc(p.id)}" draggable="true" data-drag="${esc(p.id)}" style="--cls:${clsColor(p.klasse)}">
          ${specImg(e, 22)}<span class="nm">${esc(p.name)}${e.offspec ? ` <small class="os-inline">${esc(e.spec)}</small>` : ''}</span>
          <span class="st st-${esc(p.status)}">${esc(p.status === 'Rotation' ? 'Rot.' : p.status)}</span>
          <span class="ck" title="${at === 'bench' ? 'Ersatzbank' : at ? `Gruppe ${at.slice(1)}` : 'Hinzufügen'}">${at === 'bench' ? 'E' : at ? at.slice(1) : '+'}</span>
        </button>`;
      }).join('');
    }).join('') || '<div class="muted" style="padding:16px">Keine Spieler gefunden.</div>';
    pool.querySelectorAll('[data-pid]').forEach(b => {
      b.onclick = () => addFromPool(b.dataset.pid);
      b.oncontextmenu = e => { if (whereIs(layout(), b.dataset.pid)) { e.preventDefault(); move(b.dataset.pid, 'pool'); } };
    });
  }

  function drawMain() {
    const l = layout(), raid = inRaid(l), size = DIFFS[diff].groups * GROUP_SIZE;
    $('[data-count]').textContent = raid.length;
    $('[data-size]').textContent = size;
    $('[data-fill]').style.width = `${Math.min(100, raid.length / size * 100)}%`;
    $('[data-groups]').innerHTML = groupKeys().map(k => `
      <div class="card comp-group ${target === k ? 'is-target' : ''}" data-drop="${k}">
        <div class="comp-group-head" data-target="${k}" title="Anklicken: neue Spieler landen in dieser Gruppe">Gruppe ${k.slice(1)} <span>${l[k].length}/5</span></div>
        ${l[k].map(eff).filter(Boolean).map(p => chip(p)).join('')}
        ${'<div class="comp-slot"></div>'.repeat(Math.max(0, GROUP_SIZE - l[k].length))}
      </div>`).join('');
    const bench = l.bench.map(eff).filter(Boolean);
    $('[data-bench-count]').textContent = bench.length ? `(${bench.length})` : '';
    $('[data-benchslots]').innerHTML = bench.map(p => chip(p, true)).join('') || '<span class="muted" style="padding:4px 2px">Spieler hierher ziehen – zählen nicht zum Raid.</span>';
    el.querySelector('.comp-benchgroup').classList.toggle('is-target', target === 'bench');

    el.querySelectorAll('[data-target]').forEach(t => t.onclick = () => { target = t.dataset.target; drawMain(); });
    el.querySelectorAll('.comp-main [data-click]').forEach(c => {
      c.onclick = () => chipMenu(c.dataset.click);
      c.oncontextmenu = e => { e.preventDefault(); move(c.dataset.click, 'pool'); };
    });

    const placed = new Set(Object.values(l).flat());
    const out = players.filter(p => p.active !== false && !placed.has(p.id) && (p.status === 'Core' || p.status === 'Rotation')).sort((a, b) => a.name.localeCompare(b.name));
    $('[data-out-n]').textContent = out.length ? `(${out.length})` : '';
    $('[data-out]').innerHTML = out.length
      ? out.map(p => `<button class="comp-chip small" data-add="${esc(p.id)}" style="--cls:${clsColor(p.klasse)}" title="Klicken zum Einplanen">${specImg(p, 18)}<span class="nm">${esc(p.name)}</span></button>`).join('')
      : '<span class="muted">Alle Core- und Rotation-Spieler sind eingeplant.</span>';
    $('[data-out]').querySelectorAll('[data-add]').forEach(b => b.onclick = () => addFromPool(b.dataset.add));
  }

  function drawSide() {
    const sel = inRaid(layout()).map(eff).filter(Boolean);
    const count = cls => sel.filter(p => cls.includes(p.klasse)).length;
    const roleN = r => sel.filter(p => p.rolle === r).length;
    const isMythic = diff === 'mythic';
    const roleRows = [['Tanks', roleN('Tank'), isMythic ? 2 : null], ['Heiler', roleN('Healer'), isMythic ? 4 : null], ['Melee', roleN('mDD'), null], ['Range', roleN('rDD'), null]];
    const maxArm = Math.max(1, ...Object.values(ARMOR).map(count));
    $('[data-side]').innerHTML = `
      <div class="card card-pad">
        <div class="comp-section-title">Rollen</div>
        ${roleRows.map(([lb, n, t]) => `<div class="side-row"><span>${lb}</span><span class="${t != null && n !== t ? 'warn' : ''}">${n}${t != null ? ` / ${t}` : ''}</span></div>`).join('')}
      </div>
      <div class="card card-pad">
        <div class="comp-section-title">Raid-Buffs</div>
        ${BUFFS.map(b => { const n = count(b.classes); return `<div class="side-row buff ${n ? 'ok' : 'miss'}" title="${esc(b.what)}"><span><i>${n ? '✓' : '✕'}</i>${esc(b.name)}</span><span>${n || ''}</span></div>`; }).join('')}
      </div>
      <div class="card card-pad">
        <div class="comp-section-title">Utility</div>
        ${UTILITY.map(u => { const n = count(u.classes); return `<div class="side-row buff ${n ? 'ok' : 'miss'}"><span><i>${n ? '✓' : '✕'}</i>${esc(u.name)}</span><span>${n}</span></div>`; }).join('')}
      </div>
      <div class="card card-pad">
        <div class="comp-section-title">Rüstung</div>
        ${Object.entries(ARMOR).map(([t, c]) => `<div class="side-row bar-row"><span>${t}</span><div class="mini-bar"><span style="width:${count(c) / maxArm * 100}%"></span></div><span>${count(c)}</span></div>`).join('')}
      </div>`;
  }

  // ── Bild für Discord ──────────────────────────────────────
  async function exportImage() {
    const l = layout();
    const title = settings.raidName || 'Raid-Setup';
    const nd0 = raidDates(settings).find(d => d >= todayIso());
    const raid = await currentRaid(settings);
    const blob = await renderCompImage({
      title: raid?.name || title, cover: coverOk(raid?.cover) ? raid.cover : '', season: raid?.season || '',
      date: nd0 ? `${WD[parseIso(nd0).getDay()]} ${fmtShort(nd0)}${settings.raidStart ? ` · ${settings.raidStart}` : ''}` : '',
      diff: DIFFS[diff].label,
      sub: `${DIFFS[diff].label} · ${inRaid(l).length}/${DIFFS[diff].groups * GROUP_SIZE}`,
      groups: groupKeys().map(k => l[k].map(eff).filter(Boolean)),
      bench: l.bench.map(eff).filter(Boolean),
      note: comps[compId()]?.note || '',
    });
    const url = URL.createObjectURL(blob);
    const file = `comp-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${diff}.png`;
    const nd = raidDates(settings).find(d => d >= todayIso());
    const prev = comps[compId()]?.discord;
    const defMsg = `**Aufstellung ${DIFFS[diff].label}${nd ? ` · ${WD[parseIso(nd).getDay()]} ${fmtShort(nd)}` : ''}**`;
    const body = h(`<div>
      <img src="${url}" alt="Raid-Setup" style="width:100%;border-radius:10px;border:1px solid var(--line)">
      <div class="field" style="margin-top:14px"><label>Nachricht dazu (optional)</label>
        <input class="input" data-msg maxlength="500" value="${esc(defMsg)}"></div>
      ${prev?.id ? `<label class="check-row" style="margin-top:10px"><input type="checkbox" data-replace checked> Letzten Post ersetzen <span class="muted">(${esc(prev.at ? new Date(prev.at).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '')}${prev.by ? ' · ' + esc(prev.by) : ''})</span></label>` : ''}
      <p class="hint" style="margin-top:10px">„In Discord posten" schickt das Bild direkt in euren Raid-Channel. Alternativ kopieren und mit Strg+V einfügen.</p>
    </div>`);
    openModal({
      title: 'Setup als Bild', body, wide: true,
      actions: [
        { label: 'Herunterladen', onClick: () => { const a = document.createElement('a'); a.href = url; a.download = file; document.body.appendChild(a); a.click(); a.remove(); return true; } },
        { label: 'Bild kopieren', onClick: async () => {
          try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); toast('Bild kopiert – in Discord einfügen'); }
          catch { toast('Kopieren nicht erlaubt – Rechtsklick aufs Bild → „Bild kopieren"', 'err'); }
          return true;
        } },
        { label: 'In Discord posten', cls: 'btn-discord', onClick: async () => {
          const replace = body.querySelector('[data-replace]')?.checked ? prev.id : '';
          const r = await postToDiscord(blob, body.querySelector('[data-msg]').value.trim(), replace);
          if (!r) return true;
          await store.set('comps', compId(), { discord: { id: r.id, at: new Date().toISOString(), by: auth.user?.name || '' } });
          toast(replace ? 'Post in Discord ersetzt' : 'In Discord gepostet');
        } },
      ],
    });
  }

  /** Bild über den Worker in den Discord-Channel schicken → { id } oder null */
  async function postToDiscord(blob, content, replace) {
    if (DEMO_MODE) { await new Promise(r => setTimeout(r, 400)); return { id: String(Date.now()) }; }
    if (!CONFIG.authWorkerUrl) { toast('Worker-URL fehlt in js/config.js', 'err'); return null; }
    const fd = new FormData();
    fd.append('file', blob, 'comp.png'); fd.append('content', content); if (replace) fd.append('replace', replace);
    try {
      const res = await fetch(`${CONFIG.authWorkerUrl.replace(/\/$/, '')}/discord/comp`, {
        method: 'POST', body: fd, headers: { Authorization: `Bearer ${await auth.idToken()}` },
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) return j;
      toast(j.error === 'webhook_missing' ? 'Discord-Webhook ist noch nicht eingerichtet (README)' : j.error === 'forbidden' ? 'Nur Offiziere dürfen posten' : 'Posten fehlgeschlagen', 'err');
    } catch { toast('Worker nicht erreichbar', 'err'); }
    return null;
  }

  const unsubs = [
    store.watchCol('players', ps => { players = ps; draw(); }),
    store.watchDoc('settings', 'main', st => { settings = st || {}; draw(); }),
    store.watchCol('comps', cs => { comps = Object.fromEntries(cs.map(c => [c.id, c])); draw(); }),
  ];
  return () => unsubs.forEach(u => u());
}

// ── Canvas-Rendering für das Discord-Bild ───────────────────
const loadImg = src => new Promise(res => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
const fit = (ctx, t, max) => { if (ctx.measureText(t).width <= max) return t; while (t.length && ctx.measureText(t + '…').width > max) t = t.slice(0, -1); return t + '…'; };
const once = (fn) => new Promise(res => { let un = null, done = false; const fin = v => { if (done) return; done = true; res(v); setTimeout(() => un?.(), 0); }; un = fn(fin, () => fin(null)); setTimeout(() => fin(null), 4000); });

/** Aktueller Raid (Name, Season, Titelbild aus Boss Guides / Progress) */
async function currentRaid(settings) {
  if (!settings.currentRaid) return null;
  return await once((ok, err) => store.watchDoc('raids', settings.currentRaid, ok, err));
}

const hexA = (hex, a) => { const n = parseInt(String(hex).replace('#', ''), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };

async function renderCompImage({ title, sub, groups, bench, note, cover, season, date, diff }) {
  try { await document.fonts.ready; } catch {}
  const W = 1200, PAD = 36, GAP = 16, ROW = 46, HEAD = 200, TOP = HEAD + 26;
  const cols = Math.min(groups.length, 4);
  const gRows = Math.ceil(groups.length / cols);
  const colW = (W - PAD * 2 - GAP * (cols - 1)) / cols;
  const groupH = 50 + 5 * ROW + 6;
  const benchCols = 4, benchRows = Math.ceil(bench.length / benchCols);
  const benchH = bench.length ? 50 + benchRows * ROW + 6 : 0;
  const H = TOP + gRows * (groupH + GAP) + (bench.length ? benchH + GAP : 0) + (note ? 44 : 0) + 44;

  const c = document.createElement('canvas');
  const scale = 2; c.width = W * scale; c.height = H * scale;
  const x = c.getContext('2d'); x.scale(scale, scale);
  const F = (w, s) => `${w} ${s}px Inter, system-ui, sans-serif`;
  const D = (w, s) => `${w} ${s}px "Space Grotesk", Inter, system-ui, sans-serif`;
  const rr = (X, Y, w, hh, r) => { x.beginPath(); x.roundRect(X, Y, w, hh, r); };
  const ACC = '#b07cff', ACC2 = '#e26bff';

  const [logo, bg] = await Promise.all([loadImg('assets/logo-nav.webp'), loadImg(cover)]);

  // Hintergrund
  x.fillStyle = '#07080d'; x.fillRect(0, 0, W, H);
  let g = x.createRadialGradient(W * .15, H, 10, W * .15, H, 700); g.addColorStop(0, 'rgba(176,124,255,.14)'); g.addColorStop(1, 'rgba(176,124,255,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  g = x.createRadialGradient(W * .95, H * .5, 10, W * .95, H * .5, 600); g.addColorStop(0, 'rgba(226,107,255,.08)'); g.addColorStop(1, 'rgba(226,107,255,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H);

  // Kopf: Boss-Titelbild oder Lila-Verlauf
  x.save(); rr(0, 0, W, HEAD, 0); x.clip();
  if (bg) {
    const sc = Math.max(W / bg.width, HEAD / bg.height), bw = bg.width * sc, bh = bg.height * sc;
    x.drawImage(bg, (W - bw) / 2, (HEAD - bh) * 0.18, bw, bh);
    g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, 'rgba(7,8,13,.96)'); g.addColorStop(.45, 'rgba(7,8,13,.7)'); g.addColorStop(1, 'rgba(7,8,13,.15)'); x.fillStyle = g; x.fillRect(0, 0, W, HEAD);
  } else {
    g = x.createLinearGradient(0, 0, W, HEAD); g.addColorStop(0, '#120b22'); g.addColorStop(1, '#2a1150'); x.fillStyle = g; x.fillRect(0, 0, W, HEAD);
    g = x.createRadialGradient(W * .8, HEAD * .3, 10, W * .8, HEAD * .3, 420); g.addColorStop(0, 'rgba(226,107,255,.35)'); g.addColorStop(1, 'rgba(226,107,255,0)'); x.fillStyle = g; x.fillRect(0, 0, W, HEAD);
    if (logo) { x.globalAlpha = .12; const lh = 260, lw = logo.width / logo.height * lh; x.drawImage(logo, W - lw + 30, -30, lw, lh); x.globalAlpha = 1; }
  }
  g = x.createLinearGradient(0, HEAD - 70, 0, HEAD); g.addColorStop(0, 'rgba(7,8,13,0)'); g.addColorStop(1, '#07080d'); x.fillStyle = g; x.fillRect(0, HEAD - 70, W, 70);
  x.restore();
  // Leuchtlinie unter dem Kopf
  g = x.createLinearGradient(PAD, 0, W - PAD, 0); g.addColorStop(0, hexA(ACC, 0)); g.addColorStop(.3, ACC); g.addColorStop(.7, ACC2); g.addColorStop(1, hexA(ACC2, 0));
  x.fillStyle = g; x.fillRect(PAD, HEAD - 1, W - PAD * 2, 2);
  x.save(); x.shadowColor = ACC; x.shadowBlur = 18; x.fillRect(PAD + 200, HEAD - 1, W - PAD * 2 - 400, 2); x.restore();

  // Logo + Titel
  let tx = PAD;
  if (logo) { const lh = 74, lw = logo.width / logo.height * lh; x.save(); x.shadowColor = 'rgba(176,124,255,.6)'; x.shadowBlur = 20; x.drawImage(logo, PAD - 4, 40, lw, lh); x.restore(); tx = PAD + lw + 16; }
  x.fillStyle = ACC; x.font = F('800', 13); x.fillText(`AUFSTELLUNG · ${String(diff || '').toUpperCase()}`, tx, 56);
  x.fillStyle = '#ffffff'; x.font = D('700', 42); x.save(); x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 12; x.fillText(fit(x, title, W - tx - 340), tx, 100); x.restore();
  x.fillStyle = '#c7cede'; x.font = F('500', 16); x.fillText([season, date].filter(Boolean).join('  ·  ') || sub, tx, 128);

  // Rollen-Zähler rechts
  const all = groups.flat();
  const cnt = { Tank: 0, Healer: 0, DPS: 0 };
  all.forEach(p => { if (p.rolle === 'Tank') cnt.Tank++; else if (p.rolle === 'Healer') cnt.Healer++; else cnt.DPS++; });
  const chips = [['TANKS', cnt.Tank, '#5aa9ff'], ['HEILER', cnt.Healer, '#5dff9d'], ['DPS', cnt.DPS, '#ff6b6b']];
  let cx = W - PAD;
  for (const [lab, n, col] of chips.reverse()) {
    const cw = 92; cx -= cw;
    rr(cx, 52, cw - 10, 70, 12); x.fillStyle = 'rgba(10,10,18,.72)'; x.fill(); x.strokeStyle = hexA(col, .55); x.lineWidth = 1.2; x.stroke();
    x.textAlign = 'center'; x.fillStyle = col; x.font = D('700', 30); x.fillText(String(n), cx + (cw - 10) / 2, 94);
    x.fillStyle = '#aab3c5'; x.font = F('700', 10.5); x.fillText(lab, cx + (cw - 10) / 2, 112); x.textAlign = 'left';
  }
  x.fillStyle = '#e6ebf2'; x.font = F('700', 13); x.textAlign = 'right'; x.fillText(`${all.length} SPIELER`, W - PAD - 10, 146); x.textAlign = 'left';

  // Spec-Icons laden
  const everyone = [...all, ...bench];
  const icons = Object.fromEntries(await Promise.all(
    [...new Set(everyone.map(p => specIcon(p.klasse, p.spec)).filter(Boolean))].map(async s => [s, await loadImg(s)])));

  const drawPlayer = (p, X, Y, w) => {
    const col = clsColor(p.klasse), ic = icons[specIcon(p.klasse, p.spec)], hh = ROW - 6;
    x.save(); rr(X, Y, w, hh, 8); x.clip();
    x.fillStyle = '#121624'; x.fillRect(X, Y, w, hh);
    const gg = x.createLinearGradient(X, 0, X + w, 0); gg.addColorStop(0, hexA(col, .34)); gg.addColorStop(.55, hexA(col, .08)); gg.addColorStop(1, hexA(col, 0));
    x.fillStyle = gg; x.fillRect(X, Y, w, hh);
    x.fillStyle = col; x.fillRect(X, Y, 3, hh);
    x.restore();
    if (ic) { x.save(); rr(X + 9, Y + 5, 30, 30, 6); x.clip(); x.drawImage(ic, X + 9, Y + 5, 30, 30); x.restore(); }
    x.strokeStyle = 'rgba(0,0,0,.6)'; x.lineWidth = 1; rr(X + 9, Y + 5, 30, 30, 6); x.stroke();
    x.fillStyle = col; x.font = F('700', 16);
    const nm = fit(x, p.name, w - (p.offspec ? 112 : 58)); x.save(); x.shadowColor = hexA(col, .45); x.shadowBlur = 8; x.fillText(nm, X + 48, Y + 26); x.restore();
    if (p.offspec) {
      const tag = p.rolle === 'Healer' ? 'HEAL' : p.rolle.toUpperCase();
      const nx = X + 48 + x.measureText(nm).width + 8;
      x.font = F('700', 10.5); const tw = x.measureText(tag).width + 10;
      rr(nx, Y + 12, tw, 17, 4); x.fillStyle = 'rgba(245,196,81,.18)'; x.fill();
      x.fillStyle = '#f5c451'; x.fillText(tag, nx + 5, Y + 24.5);
    }
  };
  const panel = (X, Y, w, hh, label, right, accent) => {
    rr(X, Y, w, hh, 14); x.fillStyle = 'rgba(17,19,31,.92)'; x.fill(); x.strokeStyle = 'rgba(176,124,255,.22)'; x.lineWidth = 1; x.stroke();
    x.save(); rr(X, Y, w, hh, 14); x.clip();
    const gg = x.createLinearGradient(X, 0, X + w, 0); gg.addColorStop(0, accent[0]); gg.addColorStop(1, accent[1]); x.fillStyle = gg; x.fillRect(X, Y, w, 3);
    const gl = x.createLinearGradient(0, Y, 0, Y + 46); gl.addColorStop(0, hexA(accent[0].startsWith('#') ? accent[0] : ACC, .12)); gl.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gl; x.fillRect(X, Y, w, 46);
    x.restore();
    x.fillStyle = accent[0]; x.font = F('800', 13); x.fillText(label, X + 16, Y + 31);
    if (right) { x.fillStyle = '#8b93a7'; x.font = F('700', 12.5); x.textAlign = 'right'; x.fillText(right, X + w - 16, Y + 31); x.textAlign = 'left'; }
  };

  // Gruppen
  groups.forEach((grp, i) => {
    const X = PAD + (i % cols) * (colW + GAP), Y = TOP + Math.floor(i / cols) * (groupH + GAP);
    panel(X, Y, colW, groupH, `GRUPPE ${i + 1}`, `${grp.length}/5`, [ACC, ACC2]);
    for (let r = 0; r < 5; r++) {
      const py = Y + 46 + r * ROW;
      if (grp[r]) drawPlayer(grp[r], X + 9, py, colW - 18);
      else { x.setLineDash([4, 4]); rr(X + 9, py, colW - 18, ROW - 6, 8); x.strokeStyle = '#2a2f44'; x.lineWidth = 1; x.stroke(); x.setLineDash([]); }
    }
  });

  // Ersatzbank
  let y = TOP + gRows * (groupH + GAP);
  if (bench.length) {
    panel(PAD, y, W - PAD * 2, benchH, `ERSATZBANK`, String(bench.length), ['#f5c451', '#ff9a3c']);
    const bw = (W - PAD * 2 - 18 - GAP * (benchCols - 1)) / benchCols;
    bench.forEach((p, i) => drawPlayer(p, PAD + 9 + (i % benchCols) * (bw + GAP), y + 46 + Math.floor(i / benchCols) * ROW, bw));
    y += benchH + GAP;
  }
  if (note) { x.fillStyle = '#c7cede'; x.font = F('italic 500', 15); x.fillStyle = ACC; x.fillRect(PAD, y + 4, 3, 22); x.fillStyle = '#c7cede'; x.fillText(fit(x, note, W - PAD * 2 - 14), PAD + 14, y + 20); y += 44; }

  // Fußzeile
  x.fillStyle = '#5d6478'; x.font = F('700', 11.5); x.fillText('PARANØIA · MYTHIC-RAIDGILDE · EU TODESWACHE', PAD, H - 18);
  x.textAlign = 'right'; x.fillText(new Date().toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }), W - PAD, H - 18); x.textAlign = 'left';

  return new Promise(res => c.toBlob(res, 'image/png'));
}
