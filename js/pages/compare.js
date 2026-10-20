// ─────────────────────────────────────────────────────────────
//  Vergleich (Intern): zwei Spieler auf einem Boss gegenüberstellen
//  DPS/HPS + Parse, aktive Zeit, Fähigkeiten (CPM), Stats, Gear und Talente aus Warcraft Logs
// ─────────────────────────────────────────────────────────────
import { store, auth } from '../store.js';
import { CLASSES, clsColor, esc, h, specImg, fmtDate, matchPlayer, sortPlayers, itemIcon, refreshTooltips, iconUrl } from '../ui.js';
import { getWcl } from '../wcl.js';
import { getCompare } from '../compare.js';

const ss = { get: k => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} } };
const SLOT_DE = { head: 'Kopf', neck: 'Hals', shoulder: 'Schulter', back: 'Rücken', chest: 'Brust', waist: 'Taille', wrist: 'Handgelenk',
  hands: 'Hände', legs: 'Beine', feet: 'Füße', finger1: 'Ring 1', finger2: 'Ring 2', trinket1: 'Schmuck 1', trinket2: 'Schmuck 2', mainhand: 'Waffe', offhand: 'Nebenhand' };
const STATS = [
  ['Primärwert', s => Math.max(s.agility || 0, s.strength || 0, s.intellect || 0)],
  ['Kritische Trefferchance', s => Math.max(s.critMelee || 0, s.critSpell || 0, s.critRanged || 0)],
  ['Tempo', s => Math.max(s.hasteMelee || 0, s.hasteSpell || 0, s.hasteRanged || 0)],
  ['Meisterschaft', s => s.mastery || 0],
  ['Vielseitigkeit', s => s.versatilityDamageDone || s.versatilityHealingDone || 0],
  ['Lebensraub', s => s.leech || 0],
];
const DIFFS = { 5: 'Mythic', 4: 'Heroic' };
const SAME = { spec: 'Gleiche Spec', klasse: 'Gleiche Klasse', alle: 'Alle Spieler' };
const ENCH_SLOTS = ['head', 'shoulder', 'chest', 'feet', 'finger1', 'finger2', 'mainhand'];

export function render(root) {
  const el = h(`
    <div class="container page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Intern</div>
          <h2 class="page-title">Vergleich</h2>
          <p class="page-sub">Zwei Spieler auf einem Boss: Schaden, aktive Zeit, Fähigkeiten, Stats, Gear und Talente – aus dem letzten Kill (oder dem besten Pull) in Warcraft Logs.</p>
        </div>
      </div>
      <div class="card card-pad cmp-controls">
        <div class="field"><label>Boss</label><select class="select" data-enc></select></div>
        <div class="field" style="max-width:130px"><label>Schwierigkeit</label><select class="select" data-diff>${Object.entries(DIFFS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <div class="field"><label>Spieler 1</label><select class="select" data-a></select></div>
        <button class="btn btn-ghost cmp-swap" data-swap title="Tauschen">⇄</button>
        <div class="field"><label>Spieler 2</label><select class="select" data-b></select></div>
        <div class="field" style="max-width:160px"><label>Vorschlagen</label><select class="select" data-same>${Object.entries(SAME).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      </div>
      <div data-out><div class="loading">Lade…</div></div>
    </div>`);
  root.appendChild(el);
  const $ = s => el.querySelector(s);

  let settings = null, players = [], wcl, sel = {
    enc: ss.get('pn-cmp-enc') || '', diff: ss.get('pn-cmp-diff') || '5', a: ss.get('pn-cmp-a') || '', b: ss.get('pn-cmp-b') || '',
    same: SAME[ss.get('pn-cmp-same')] ? ss.get('pn-cmp-same') : 'spec',
  }, run = 0, gearAll = false;

  const active = () => sortPlayers(players.filter(p => p.active !== false));
  const pById = id => players.find(p => p.id === id);
  const charName = p => p ? (p.charName || p.name) : '';

  function controls() {
    const encs = (wcl?.encounters || []).slice();
    if (!sel.enc && encs.length) sel.enc = String((encs.find(e => !e.kill) || encs.at(-1)).id);
    $('[data-enc]').innerHTML = encs.length
      ? encs.map(e => `<option value="${e.id}" ${String(e.id) === sel.enc ? 'selected' : ''}>${esc(e.name)}${e.kill ? ' ✓' : ''}</option>`).join('')
      : '<option value="">Keine Logs</option>';
    $('[data-diff]').value = sel.diff;

    if (!sel.a) sel.a = matchPlayer(active(), auth.user?.name)?.id || active()[0]?.id || '';
    const A = pById(sel.a);
    $('[data-same]').value = sel.same;
    // Spieler 2: je nach Auswahl nur gleiche Spec / Klasse; gibt es niemanden mit gleicher Spec, dann gleiche Klasse
    const others = active().filter(p => p.id !== sel.a);
    let listB = others;
    if (A && sel.same !== 'alle') {
      const sameCls = others.filter(p => p.klasse === A.klasse);
      const sameSpec = sameCls.filter(p => p.spec === A.spec);
      listB = sel.same === 'spec' && sameSpec.length ? [...sameSpec, ...sameCls.filter(p => p.spec !== A.spec)] : sameCls;
    }
    if (!listB.some(p => p.id === sel.b)) sel.b = listB[0]?.id || '';
    const opt = (p, cur) => `<option value="${esc(p.id)}" ${p.id === cur ? 'selected' : ''}>${esc(p.name)} · ${esc(p.spec || CLASSES[p.klasse]?.name || '')}</option>`;
    $('[data-a]').innerHTML = active().map(p => opt(p, sel.a)).join('');
    $('[data-b]').innerHTML = listB.map(p => opt(p, sel.b)).join('') || '<option value="">Kein Spieler dieser Klasse</option>';
  }

  const remember = () => Object.entries(sel).forEach(([k, v]) => ss.set(`pn-cmp-${k}`, v));
  $('[data-enc]').onchange = e => { sel.enc = e.target.value; remember(); load(); };
  $('[data-diff]').onchange = e => { sel.diff = e.target.value; remember(); load(); };
  $('[data-a]').onchange = e => { sel.a = e.target.value; controls(); remember(); load(); };
  $('[data-b]').onchange = e => { sel.b = e.target.value; remember(); load(); };
  $('[data-same]').onchange = e => { sel.same = e.target.value; controls(); remember(); load(); };
  $('[data-swap]').onclick = () => { [sel.a, sel.b] = [sel.b, sel.a]; if (sel.same !== 'alle' && pById(sel.a)?.klasse !== pById(sel.b)?.klasse) sel.same = 'alle'; controls(); remember(); load(); };

  async function load() {
    const out = $('[data-out]');
    if (!wcl?.configured) { out.innerHTML = `<div class="empty"><div class="big">⚖️</div>${wcl === undefined ? 'Lade…' : 'Warcraft Logs ist noch nicht verbunden.'}</div>`; return; }
    const A = pById(sel.a), B = pById(sel.b);
    if (!sel.enc || !A) { out.innerHTML = '<div class="empty">Boss und Spieler wählen.</div>'; return; }
    const id = ++run;
    out.innerHTML = '<div class="loading">Hole die Pulls aus Warcraft Logs… (beim ersten Mal ein paar Sekunden)</div>';
    const data = await getCompare({ enc: sel.enc, diff: sel.diff, since: settings.startDate, a: charName(A), b: charName(B), specA: A.spec, specB: B?.spec });
    if (id !== run) return;
    if (!data?.players) { out.innerHTML = '<div class="empty">Vergleich konnte nicht geladen werden.</div>'; return; }
    draw(A, B, data.players[charName(A)], B ? data.players[charName(B)] : null, data.demo);
  }

  function draw(A, B, a, b, demo) {
    const out = $('[data-out]');
    const healer = p => p?.rolle === 'Healer';
    const amount = (p, d) => healer(p) ? d.hps : d.dps;
    const fmtN = n => n >= 1e6 ? `${(n / 1e6).toLocaleString('de-AT', { maximumFractionDigits: 2 })} Mio.` : Math.round(n / 1000).toLocaleString('de-AT') + 'k';
    const fightTxt = d => `${d.fight.kill ? 'Kill' : `Bester Pull · ${Number(d.fight.pct).toLocaleString('de-AT', { maximumFractionDigits: 1 })} %`} · ${fmtDate(d.fight.date)} · ${Math.floor(d.fight.secs / 60)}:${String(d.fight.secs % 60).padStart(2, '0')}`;
    const parseCls = v => v >= 99 ? 'p-gold' : v >= 95 ? 'p-orange' : v >= 75 ? 'p-purple' : v >= 50 ? 'p-blue' : v >= 25 ? 'p-green' : 'p-grey';

    const head = (P, d) => {
      if (!P) return '';
      if (!d || d.error) return `<div class="card card-pad cmp-head" style="--cls:${clsColor(P.klasse)}"><div class="cmp-name">${specImg(P, 28)}<span>${esc(P.name)}</span></div><p class="muted" style="margin-top:10px">Kein Pull auf diesem Boss gefunden${P.charName ? '' : ' – ggf. Charakternamen im Roster eintragen'}.</p></div>`;
      return `<div class="card card-pad cmp-head" style="--cls:${clsColor(P.klasse)}">
        <div class="cmp-name">${specImg(P, 28)}<span>${esc(P.name)}</span>${d.parse?.pct != null ? `<span class="parse ${parseCls(d.parse.pct)}" title="Parse auf diesen Kill">${d.parse.pct}</span>` : ''}</div>
        <div class="cmp-amount">${fmtN(amount(P, d))}<small>${healer(P) ? 'HPS' : 'DPS'}</small></div>
        <div class="cmp-fight">${esc(fightTxt(d))}</div>
        <a class="log-btn wcl" href="${esc(d.url)}" target="_blank" rel="noopener">In Warcraft Logs ↗</a>
      </div>`;
    };

    if (!a || a.error || !b || b.error) {
      out.innerHTML = `<div class="cmp-grid">${head(A, a)}${head(B, b)}</div>`;
      return;
    }

    const va = amount(A, a), vb = amount(B, b);
    const lead = va === vb ? null : va > vb ? [A, va / vb - 1] : [B, vb / va - 1];
    const together = a.together && b.together;

    // Zeile mit zwei Balken (links Spieler 1, rechts Spieler 2)
    const nf = (v, d = 0) => Number(v).toLocaleString('de-AT', { maximumFractionDigits: d, minimumFractionDigits: d });
    const pairRow = (label, x, y, { fmt = v => nf(v), max = Math.max(x, y, 1), mid = '' } = {}) => `<div class="st-row">
        <span class="st-v ${x > y ? 'win' : ''}">${x == null ? '–' : fmt(x)}</span>
        <div class="st-bar l"><span style="width:${(x || 0) / max * 100}%"></span></div>
        <span class="st-l">${mid || label}</span>
        <div class="st-bar r"><span style="width:${(y || 0) / max * 100}%"></span></div>
        <span class="st-v r ${y > x ? 'win' : ''}">${y == null ? '–' : fmt(y)}</span>
      </div>`;

    // Stats
    const statRows = STATS.map(([label, f]) => [label, f(a.stats), f(b.stats)]).filter(([, x, y]) => x || y);
    const statsHtml = statRows.map(([label, x, y]) => pairRow(label, x, y)).join('');

    // Spielweise: aktive Zeit + Casts pro Minute
    const hasPlay = a.activePct != null || b.activePct != null || a.cpm || b.cpm;
    const playHtml = (a.activePct != null || b.activePct != null ? pairRow('Aktive Zeit', a.activePct, b.activePct, { fmt: v => nf(v, 1) + ' %', max: 100 }) : '')
      + (a.cpm || b.cpm ? pairRow('Casts pro Minute', a.cpm, b.cpm, { fmt: v => nf(v, 1) }) : '');

    // Fähigkeiten: gleiche Fähigkeit nebeneinander, Anteil als Balken, CPM als Zahl
    const abA = a.abilities || [], abB = b.abilities || [];
    const abIds = [...new Set([...abA.map(x => x.id), ...abB.map(x => x.id)])];
    const abRows = abIds.map(id => ({ x: abA.find(q => q.id === id), y: abB.find(q => q.id === id) }))
      .sort((p, q) => Math.max(q.x?.share || 0, q.y?.share || 0) - Math.max(p.x?.share || 0, p.y?.share || 0));
    const maxShare = Math.max(1, ...abRows.map(r => Math.max(r.x?.share || 0, r.y?.share || 0)));
    const abCell = (q, other, right) => {
      if (!q) return `<div class="ab-cell ${right ? 'r' : ''} none"><span class="muted">nicht genutzt</span></div>`;
      const more = other && q.cpm > other.cpm * 1.15 && q.cpm - other.cpm >= 0.3;
      return `<div class="ab-cell ${right ? 'r' : ''}">
        <span class="ab-cpm ${more ? 'win' : ''}" title="${q.casts} Casts">${q.cpm ? nf(q.cpm, 1) : '–'}<small>/min</small></span>
        <div class="ab-bar"><span style="width:${q.share / maxShare * 100}%"></span></div>
        <span class="ab-share">${nf(q.share, 1)} %</span>
      </div>`;
    };
    const abIcon = q => `<img class="ab-ico" src="${iconUrl(q.icon)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;
    const abHtml = abRows.map(({ x, y }) => {
      const q = x || y;
      return `<div class="ab-row ${!x || !y ? 'only' : ''}">${abCell(x, y)}<div class="ab-name">${abIcon(q)}<span>${esc(q.name)}</span></div>${abCell(y, x, true)}</div>`;
    }).join('');
    const onlyA = abRows.filter(r => r.x && !r.y).length, onlyB = abRows.filter(r => r.y && !r.x).length;

    // Gear (kompakt: gleiche Items ausgeblendet)
    const slots = Object.keys(SLOT_DE).filter(s => a.gear.some(g => g.slot === s) || b.gear.some(g => g.slot === s));
    const avg = g => g.length ? (g.reduce((s, x) => s + (x.ilvl || 0), 0) / g.length) : 0;
    const noEnch = g => ENCH_SLOTS.filter(s => g.some(x => x.slot === s && !x.ench)).length;
    const tier = g => g.filter(x => x.set).length;
    const gearCell = (g, other, right) => g ? `<div class="gc ${right ? 'r' : ''}">${itemIcon(g, 34)}<b class="${other && g.ilvl > other.ilvl ? 'win' : ''}">${g.ilvl}</b>${g.ench ? '<span class="gc-e" title="Verzaubert">✦</span>' : ''}${g.set ? '<span class="gc-t" title="Tier-Set">Set</span>' : ''}</div>` : '<span class="muted">–</span>';
    let hiddenSame = 0;
    const gearHtml = slots.map(s => {
      const x = a.gear.find(g => g.slot === s), y = b.gear.find(g => g.slot === s);
      const same = x && y && x.id && x.id === y.id && x.ilvl === y.ilvl;
      if (same && !gearAll) { hiddenSame++; return ''; }
      const differ = !same;
      return `<div class="gr-row ${differ ? 'diff' : ''}">${gearCell(x, y)}<span class="gr-slot">${SLOT_DE[s]}${same ? ' <span class="muted">· gleich</span>' : ''}</span>${gearCell(y, x, true)}</div>`;
    }).join('');
    const gearSum = pairRow('Ø Itemlevel', Math.round(avg(a.gear) * 10) / 10, Math.round(avg(b.gear) * 10) / 10, { fmt: v => nf(v, 1), max: Math.max(avg(a.gear), avg(b.gear), 1) })
      + `<div class="gear-chips">
          <span class="gchip" style="--c:${clsColor(A.klasse)}">${esc(A.name)}: ${tier(a.gear)}× Set${noEnch(a.gear) ? ` · <b class="bad">${noEnch(a.gear)} ohne Verzauberung</b>` : ' · alles verzaubert'}</span>
          <span class="gchip" style="--c:${clsColor(B.klasse)}">${esc(B.name)}: ${tier(b.gear)}× Set${noEnch(b.gear) ? ` · <b class="bad">${noEnch(b.gear)} ohne Verzauberung</b>` : ' · alles verzaubert'}</span>
        </div>`;

    // Talente
    const ta = new Set(a.talents), tb = new Set(b.talents);
    const all = new Set([...ta, ...tb]);
    const sameT = [...all].filter(t => ta.has(t) && tb.has(t)).length;

    out.innerHTML = `
      <div class="cmp-grid">${head(A, a)}${head(B, b)}</div>
      <div class="cmp-verdict">${lead ? `<b style="color:${clsColor(lead[0].klasse)}">${esc(lead[0].name)}</b> macht <b>${Math.round(lead[1] * 100)} %</b> mehr ${healer(lead[0]) ? 'Heilung' : 'Schaden'}` : 'Gleich viel'}
        ${together ? ' · <span class="ok">im selben Pull</span>' : ' · <span class="muted">unterschiedliche Pulls – Vergleich nur grob</span>'}${demo ? ' · <span class="muted">Beispieldaten</span>' : ''}</div>
      ${hasPlay || abRows.length ? `<div class="card card-pad cmp-play">
        <div class="comp-section-title">Spielweise</div>
        <div class="st-names"><span style="color:${clsColor(A.klasse)}">${esc(A.name)}</span><span style="color:${clsColor(B.klasse)}">${esc(B.name)}</span></div>
        ${playHtml}
        ${abRows.length ? `<div class="ab-head"><span>CPM · Anteil am ${healer(A) ? 'Heilen' : 'Schaden'}</span><span>Fähigkeit</span><span>Anteil · CPM</span></div>
          <div class="ab-list">${abHtml}</div>
          <p class="hint" style="margin-top:10px">CPM = Casts pro Minute. Grün = drückt die Fähigkeit deutlich öfter (mehr als 15 %).${onlyA || onlyB ? ` Nur bei einem genutzt: ${onlyA ? `${onlyA}× ${esc(A.name)}` : ''}${onlyA && onlyB ? ', ' : ''}${onlyB ? `${onlyB}× ${esc(B.name)}` : ''}.` : ''}</p>` : '<p class="muted" style="margin-top:8px">Keine Fähigkeiten im Log.</p>'}
      </div>` : ''}
      <div class="cmp-cols">
        <div class="card card-pad">
          <div class="comp-section-title">Stats im Pull</div>
          <div class="st-names"><span style="color:${clsColor(A.klasse)}">${esc(A.name)}</span><span style="color:${clsColor(B.klasse)}">${esc(B.name)}</span></div>
          ${statsHtml || '<p class="muted">Keine Stats im Log.</p>'}
          <p class="hint" style="margin-top:10px">Werte als Wertung (Rating) aus dem Log, nicht in %.</p>
        </div>
        <div class="card card-pad">
          <div class="comp-section-title">Talente</div>
          <div class="tal-sum"><b>${sameT}</b> von ${all.size} Talentpunkten gleich</div>
          <div class="progress-track" style="margin:10px 0 14px"><div class="progress-fill" style="width:${all.size ? sameT / all.size * 100 : 0}%"></div></div>
          <p class="hint">Die genauen Talentbäume zeigt Warcraft Logs:</p>
          <div class="log-links" style="margin-top:8px">
            <a class="log-btn" href="${esc(a.url)}" target="_blank" rel="noopener" style="color:${clsColor(A.klasse)}">Talente ${esc(A.name)} ↗</a>
            <a class="log-btn" href="${esc(b.url)}" target="_blank" rel="noopener" style="color:${clsColor(B.klasse)}">Talente ${esc(B.name)} ↗</a>
          </div>
        </div>
      </div>
      <div class="card card-pad" style="margin-top:16px">
        <div class="cmp-gear-head"><div class="comp-section-title">Gear im Pull</div>
          <div class="seg"><button class="${gearAll ? '' : 'on'}" data-gear="diff">Nur Unterschiede</button><button class="${gearAll ? 'on' : ''}" data-gear="all">Alle Slots</button></div></div>
        ${gearSum}
        <div class="gear-cmp">${gearHtml || '<p class="muted">Komplett gleiches Gear.</p>'}</div>
        <p class="hint" style="margin-top:10px">${hiddenSame ? `${hiddenSame} Slots mit identischem Item ausgeblendet · ` : ''}Maus über ein Item = Tooltip von Wowhead.</p>
      </div>`;
    out.querySelectorAll('[data-gear]').forEach(b2 => b2.onclick = () => { gearAll = b2.dataset.gear === 'all'; draw(A, B, a, b, demo); });
    refreshTooltips();
  }

  const unsubs = [
    store.watchDoc('settings', 'main', s => {
      settings = s || {};
      if (wcl === undefined && settings.startDate) getWcl(settings).then(d => { wcl = d; controls(); load(); });
    }),
    store.watchCol('players', ps => { players = ps; controls(); if (wcl !== undefined) load(); }),
  ];
  return () => { run++; unsubs.forEach(u => u()); };
}
