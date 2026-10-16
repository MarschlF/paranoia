// ─────────────────────────────────────────────────────────────
//  Umfragen (Intern): Raider füllen aus und sehen nur ihre eigenen Antworten,
//  Offis erstellen Umfragen und werten pro Spieler aus.
// ─────────────────────────────────────────────────────────────
import { store, auth } from '../store.js';
import { esc, h, toast, openModal, confirmModal, clsColor, specImg, sortPlayers, matchPlayer } from '../ui.js';
import { QTYPES, watchMyAnswer, saveAnswer, missingRequired, isEmpty, answerText, newId } from '../polls.js';
import { RUF } from '../guidereads.js';

const fmtAt = iso => iso ? new Date(iso).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

export function render(root, { params = [] } = {}) {
  return params[0] ? renderPoll(root, decodeURIComponent(params[0])) : renderList(root);
}

// ── Übersicht ────────────────────────────────────────────────
function renderList(root) {
  const officer = auth.isOfficer;
  const el = h(`
    <div class="container page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Intern</div>
          <h2 class="page-title">Umfragen</h2>
          <p class="page-sub">${officer ? 'Umfragen erstellen und pro Spieler auswerten. Raider sehen nur ihre eigenen Antworten.' : 'Offene Umfragen der Gildenleitung. Deine Antworten sieht nur die Leitung.'}</p>
        </div>
        <div class="page-actions">${officer ? '<button class="btn btn-primary" data-new>+ Neue Umfrage</button>' : ''}</div>
      </div>
      <div class="poll-grid" data-grid><div class="loading">Lade…</div></div>
    </div>`);
  root.appendChild(el);
  el.querySelector('[data-new]')?.addEventListener('click', () => editPoll(null));

  let polls = [], mine = {}, answers = [], players = [];
  const mySubs = new Map();
  function syncMine() {
    for (const p of polls) if (!mySubs.has(p.id)) mySubs.set(p.id, watchMyAnswer(p.id, a => { mine[p.id] = a; draw(); }));
  }
  function draw() {
    const grid = el.querySelector('[data-grid]');
    const list = polls.slice().sort((a, b) => (b.open - a.open) || String(b.created).localeCompare(String(a.created)));
    if (!list.length) { grid.innerHTML = `<div class="empty"><div class="big">🗳️</div>Noch keine Umfragen.${officer ? ' Über „+ Neue Umfrage" anlegen.' : ''}</div>`; return; }
    const total = players.filter(p => p.active !== false).length;
    grid.innerHTML = list.map(p => {
      const my = mine[p.id];
      const n = answers.filter(a => a.pollId === p.id).length;
      const status = my ? `<span class="ready">✓ Beantwortet</span>` : p.open ? `<span class="unread-txt">Noch nicht ausgefüllt</span>` : '<span class="muted">Geschlossen</span>';
      return `<a class="card poll-card ${p.open && !my ? 'unread' : ''} ${p.open ? '' : 'closed'}" href="#/umfragen/${encodeURIComponent(p.id)}">
        ${p.open && !my ? `<div class="gc-ruf">${RUF}</div>` : ''}
        <div class="poll-top">${p.open ? '<span class="raid-badge">Offen</span>' : '<span class="raid-season">Geschlossen</span>'}<span class="muted">${(p.questions || []).length} Fragen</span></div>
        <div class="nm">${esc(p.title)}</div>
        ${p.desc ? `<div class="poll-desc">${esc(p.desc)}</div>` : ''}
        <div class="meta">${status}</div>
        ${officer ? `<span class="gr-pill ${n >= total && total ? 'full' : ''}">${n}/${total} beantwortet</span>` : ''}
      </a>`;
    }).join('');
  }
  const unsubs = [
    store.watchCol('polls', ps => { polls = ps; syncMine(); draw(); }),
    ...(officer ? [store.watchCol('pollAnswers', as => { answers = as; draw(); }), store.watchCol('players', ps => { players = ps; draw(); })] : []),
  ];
  return () => { unsubs.forEach(u => u()); mySubs.forEach(u => u()); };
}

// ── Einzelne Umfrage ─────────────────────────────────────────
function renderPoll(root, pollId) {
  const officer = auth.isOfficer;
  const el = h(`
    <div class="container page">
      <a href="#/umfragen" class="back-link">← Alle Umfragen</a>
      <div class="page-head">
        <div>
          <div class="eyebrow" data-eyebrow>Umfrage</div>
          <h2 class="page-title" data-title>–</h2>
          <p class="page-sub" data-desc></p>
        </div>
        <div class="page-actions">${officer ? `
          <button class="btn btn-ghost btn-sm" data-toggle>Schließen</button>
          <button class="btn btn-ghost btn-sm" data-edit>Bearbeiten</button>
          <button class="btn btn-danger btn-sm" data-del>Löschen</button>` : ''}</div>
      </div>
      ${officer ? `<div class="guide-tabs"><button class="guide-tab" data-view="fill">Ausfüllen</button><button class="guide-tab" data-view="eval">Auswertung</button></div>` : ''}
      <div data-body><div class="loading">Lade…</div></div>
    </div>`);
  root.appendChild(el);
  const $ = s => el.querySelector(s);

  let poll, my, editing = false, draft = {}, view = officer ? (sessionStorage.getItem('pn-poll-view') || 'eval') : 'fill';
  let answers = [], players = [], reads = [], openRow = null;

  el.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { view = b.dataset.view; try { sessionStorage.setItem('pn-poll-view', view); } catch {} draw(); });
  $('[data-edit]')?.addEventListener('click', () => editPoll(poll, answers.filter(a => a.pollId === pollId).length));
  $('[data-toggle]')?.addEventListener('click', async () => { await store.set('polls', pollId, { open: !poll.open }); toast(poll.open ? 'Umfrage geschlossen' : 'Umfrage geöffnet'); });
  $('[data-del]')?.addEventListener('click', async () => {
    if (!await confirmModal('Umfrage löschen?', 'Die Umfrage und alle Antworten werden gelöscht.')) return;
    for (const a of answers.filter(a => a.pollId === pollId)) await store.remove('pollAnswers', a.id);
    await store.remove('polls', pollId); toast('Gelöscht'); location.hash = '#/umfragen';
  });

  function draw() {
    const body = $('[data-body]');
    if (poll === undefined) return;
    if (!poll) { body.innerHTML = '<div class="empty">Umfrage nicht gefunden.</div>'; return; }
    $('[data-title]').textContent = poll.title;
    $('[data-desc]').textContent = poll.desc || '';
    $('[data-eyebrow]').innerHTML = `Umfrage · ${poll.open ? '<span style="color:var(--venom)">offen</span>' : 'geschlossen'}`;
    if ($('[data-toggle]')) $('[data-toggle]').textContent = poll.open ? 'Schließen' : 'Wieder öffnen';
    el.querySelectorAll('[data-view]').forEach(b => {
      b.classList.toggle('active', b.dataset.view === view);
      if (b.dataset.view === 'eval') b.textContent = `Auswertung (${answers.filter(a => a.pollId === pollId).length})`;
    });
    if (view === 'eval' && officer) drawEval(body); else drawFill(body);
  }

  // ── Ausfüllen / eigene Antworten ────────────────────────────
  function drawFill(body) {
    const qs = poll.questions || [];
    if (my && !editing) {
      body.innerHTML = `<div class="card card-pad poll-form">
        <div class="gr-done" style="margin-bottom:14px">✓ Deine Antworten · ${esc(fmtAt(my.at))}</div>
        ${qs.map(q => `<div class="pq"><div class="pq-label">${esc(q.label)}</div><div class="pq-answer">${esc(answerText(q, my.answers?.[q.id])).replace(/\n/g, '<br>')}</div></div>`).join('')}
        ${poll.open ? '<button class="btn btn-ghost" data-change style="margin-top:8px">Antworten ändern</button>' : '<p class="hint">Die Umfrage ist geschlossen.</p>'}
        <p class="hint" style="margin-top:12px">Nur du und die Gildenleitung sehen deine Antworten.</p>
      </div>`;
      body.querySelector('[data-change]')?.addEventListener('click', () => { editing = true; draft = structuredClone(my.answers || {}); draw(); });
      return;
    }
    if (!poll.open) { body.innerHTML = '<div class="empty"><div class="big">🔒</div>Diese Umfrage ist geschlossen.</div>'; return; }
    body.innerHTML = `<form class="card card-pad poll-form" data-form novalidate>
      ${qs.map((q, i) => `<div class="pq" data-q="${esc(q.id)}">
        <div class="pq-label">${i + 1}. ${esc(q.label)}${q.required ? ' <span class="req">*</span>' : ''}</div>
        ${inputHtml(q, draft[q.id])}
      </div>`).join('')}
      <div class="poll-actions">
        <button class="btn btn-primary" type="submit">${my ? 'Änderungen speichern' : 'Absenden'}</button>
        ${my ? '<button class="btn btn-ghost" type="button" data-cancel>Abbrechen</button>' : ''}
        <span class="hint">* Pflichtfrage · Deine Antworten sieht nur die Gildenleitung.</span>
      </div>
    </form>`;
    const form = body.querySelector('[data-form]');
    form.addEventListener('input', () => { draft = readForm(form, qs); });
    form.addEventListener('change', () => { draft = readForm(form, qs); });
    body.querySelector('[data-cancel]')?.addEventListener('click', () => { editing = false; draw(); });
    form.onsubmit = async e => {
      e.preventDefault();
      draft = readForm(form, qs);
      const miss = missingRequired(poll, draft);
      form.querySelectorAll('.pq').forEach(d => d.classList.toggle('pq-miss', miss.some(q => q.id === d.dataset.q)));
      if (miss.length) { toast(`Bitte noch ${miss.length} Pflichtfrage${miss.length > 1 ? 'n' : ''} ausfüllen`, 'err'); return; }
      try { await saveAnswer(poll, draft); editing = false; toast('Danke – gespeichert'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      catch (err) { console.error(err); toast('Speichern fehlgeschlagen', 'err'); }
    };
  }

  // ── Auswertung (nur Offis) ─────────────────────────────────
  function drawEval(body) {
    const qs = poll.questions || [];
    const list = answers.filter(a => a.pollId === pollId).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const active = players.filter(p => p.active !== false);
    const mapped = new Map(reads.filter(r => r.playerId).map(r => [r.id, r.playerId]));
    const who = a => players.find(p => p.id === mapped.get(a.uid)) || matchPlayer(active, a.name);
    const doneIds = new Set(list.map(who).filter(Boolean).map(p => p.id));
    const missing = sortPlayers(active.filter(p => !doneIds.has(p.id)));
    const chip = p => `<span class="abs-pill" style="--cls:${clsColor(p.klasse)}">${specImg(p, 16)}${esc(p.name)}</span>`;
    const nameOf = a => { const p = who(a); return p ? `<span style="color:${clsColor(p.klasse)};font-weight:600">${esc(p.name)}</span>` : `${esc(a.name)} <span class="muted">(Discord)</span>`; };

    const summary = q => {
      const vals = list.map(a => ({ a, v: a.answers?.[q.id] })).filter(x => !isEmpty(x.v));
      if (QTYPES[q.type]?.options) {
        const counts = q.options.map(o => ({ o, who: vals.filter(x => Array.isArray(x.v) ? x.v.includes(o) : x.v === o).map(x => x.a) }));
        const max = Math.max(1, ...counts.map(c => c.who.length));
        return counts.map(c => `<div class="ev-opt">
          <span class="ev-o">${esc(c.o)}</span>
          <div class="ev-bar"><span style="width:${c.who.length / max * 100}%"></span></div>
          <span class="ev-n">${c.who.length}</span>
          <div class="ev-who">${c.who.map(nameOf).join(', ')}</div>
        </div>`).join('');
      }
      if (q.type === 'scale') {
        const nums = vals.map(x => Number(x.v));
        const avg = nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
        const steps = Array.from({ length: q.max || 5 }, (_, i) => i + 1);
        const max = Math.max(1, ...steps.map(s => nums.filter(n => n === s).length));
        return `<div class="ev-avg">Ø <b>${avg ? avg.toLocaleString('de-AT', { maximumFractionDigits: 1 }) : '–'}</b> / ${q.max || 5}</div>
          <div class="ev-scale">${steps.map(s => { const n = nums.filter(x => x === s).length; return `<div class="ev-col" title="${n}× ${s}"><span style="height:${n / max * 100}%"></span><small>${s}</small></div>`; }).join('')}</div>`;
      }
      return vals.length ? `<div class="ev-texts">${vals.map(x => `<div class="ev-text"><div>${nameOf(x.a)}</div><p>${esc(x.v).replace(/\n/g, '<br>')}</p></div>`).join('')}</div>` : '<span class="muted">Noch keine Antworten.</span>';
    };

    body.innerHTML = `
      <div class="card card-pad">
        <div class="gr-head"><b>${list.length}</b> Antworten · ${doneIds.size} von ${active.length} aktiven Spielern</div>
        <div class="progress-track" style="margin:10px 0 14px"><div class="progress-fill" style="width:${active.length ? doneIds.size / active.length * 100 : 0}%"></div></div>
        ${missing.length ? `<div class="comp-section-title">Fehlt noch (${missing.length})</div><div class="abs-claims">${missing.map(chip).join('')}</div>` : '<span class="abs-all">Alle aktiven Spieler haben teilgenommen ✓</span>'}
        ${(() => { const un = list.filter(a => !who(a)); return un.length ? `<div class="rc-unknown" style="margin-top:14px"><div class="comp-section-title" style="margin-bottom:8px">Discord-Namen ohne Roster-Spieler – einmal zuordnen (gilt auch für Guides)</div>
          ${un.map(a => `<div class="rc-map"><span>${esc(a.name)}</span><select class="select" data-map="${esc(a.uid)}"><option value="">– wählen –</option>${sortPlayers(active).map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></div>`).join('')}</div>` : ''; })()}
        <div style="margin-top:14px"><button class="btn btn-ghost btn-sm" data-csv>Als CSV herunterladen</button></div>
      </div>
      <div class="card" style="margin-top:16px;overflow:auto">
        <div class="abs-list-head"><div class="comp-section-title" style="margin:0">Antworten pro Spieler</div></div>
        ${list.length ? `<table class="ev-table"><thead><tr><th>Spieler</th><th>Abgegeben</th><th></th></tr></thead><tbody>
          ${list.map(a => `<tr class="ev-row ${openRow === a.id ? 'open' : ''}" data-row="${esc(a.id)}"><td>${nameOf(a)}</td><td class="muted">${esc(fmtAt(a.at))}</td><td class="muted" style="text-align:right">${openRow === a.id ? '▲' : '▼'}</td></tr>
            ${openRow === a.id ? `<tr class="ev-detail"><td colspan="3">${qs.map(q => `<div class="pq"><div class="pq-label">${esc(q.label)}</div><div class="pq-answer">${esc(answerText(q, a.answers?.[q.id])).replace(/\n/g, '<br>')}</div></div>`).join('')}</td></tr>` : ''}`).join('')}
        </tbody></table>` : '<div class="empty" style="border:none;margin:0">Noch keine Antworten.</div>'}
      </div>
      <div class="comp-section-title" style="margin:22px 0 10px">Zusammenfassung pro Frage</div>
      ${qs.map((q, i) => `<div class="card card-pad ev-q"><div class="pq-label">${i + 1}. ${esc(q.label)} <span class="muted">· ${QTYPES[q.type]?.label || ''}</span></div>${summary(q)}</div>`).join('')}`;

    body.querySelectorAll('[data-map]').forEach(sel => sel.onchange = async () => {
      if (!sel.value) return;
      await store.set('guideReads', sel.dataset.map, { playerId: sel.value });
      toast('Zugeordnet');
    });
    body.querySelectorAll('[data-row]').forEach(tr => tr.onclick = () => { openRow = openRow === tr.dataset.row ? null : tr.dataset.row; draw(); });
    body.querySelector('[data-csv]').onclick = () => {
      const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const rows = [['Spieler', 'Discord', 'Abgegeben', ...qs.map(q => q.label)].map(cell).join(';'),
        ...list.map(a => [who(a)?.name || '', a.name, fmtAt(a.at), ...qs.map(q => answerText(q, a.answers?.[q.id]))].map(cell).join(';'))];
      const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
      link.download = `umfrage-${poll.title.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-')}.csv`; link.click();
    };
  }

  const unsubs = [
    store.watchDoc('polls', pollId, p => { poll = p; draw(); }),
    watchMyAnswer(pollId, a => { my = a; if (!editing) draft = structuredClone(a?.answers || {}); draw(); }),
    ...(officer ? [
      store.watchCol('pollAnswers', as => { answers = as; draw(); }),
      store.watchCol('players', ps => { players = ps; draw(); }),
      store.watchCol('guideReads', rs => { reads = rs; draw(); }, () => {}),
    ] : []),
  ];
  return () => unsubs.forEach(u => u());
}

// ── Eingabefelder ────────────────────────────────────────────
function inputHtml(q, v) {
  const n = `q_${q.id}`;
  if (q.type === 'single') return `<div class="pq-opts">${q.options.map(o => `<label class="pq-opt"><input type="radio" name="${n}" value="${esc(o)}" ${v === o ? 'checked' : ''}> <span>${esc(o)}</span></label>`).join('')}</div>`;
  if (q.type === 'multi') return `<div class="pq-opts">${q.options.map(o => `<label class="pq-opt"><input type="checkbox" name="${n}" value="${esc(o)}" ${Array.isArray(v) && v.includes(o) ? 'checked' : ''}> <span>${esc(o)}</span></label>`).join('')}</div>`;
  if (q.type === 'longtext') return `<textarea class="textarea" name="${n}" rows="4" maxlength="2000">${esc(v || '')}</textarea>`;
  if (q.type === 'scale') {
    const max = q.max || 5;
    return `<div class="pq-scale">${q.low ? `<span class="muted">${esc(q.low)}</span>` : ''}${Array.from({ length: max }, (_, i) => i + 1).map(s => `<label class="pq-step"><input type="radio" name="${n}" value="${s}" ${Number(v) === s ? 'checked' : ''}><span>${s}</span></label>`).join('')}${q.high ? `<span class="muted">${esc(q.high)}</span>` : ''}</div>`;
  }
  return `<input class="input" name="${n}" maxlength="300" value="${esc(v || '')}">`;
}
function readForm(form, qs) {
  const out = {};
  for (const q of qs) {
    const n = `q_${q.id}`;
    if (q.type === 'multi') out[q.id] = [...form.querySelectorAll(`[name="${n}"]:checked`)].map(i => i.value);
    else if (q.type === 'single' || q.type === 'scale') { const c = form.querySelector(`[name="${n}"]:checked`); out[q.id] = c ? (q.type === 'scale' ? Number(c.value) : c.value) : null; }
    else out[q.id] = (form.querySelector(`[name="${n}"]`)?.value || '').trim();
    if (isEmpty(out[q.id])) delete out[q.id];
  }
  return out;
}

// ── Editor (Offis) ───────────────────────────────────────────
export function editPoll(poll, answerCount = 0) {
  const p = poll ? structuredClone(poll) : { title: '', desc: '', open: true, questions: [{ id: newId(), type: 'single', label: '', options: ['Ja', 'Nein'], required: true }] };
  const body = h(`<div class="poll-edit">
    <div class="field"><label>Titel</label><input class="input" data-title value="${esc(p.title)}" placeholder="z. B. Raidtage Season 3"></div>
    <div class="field" style="margin-top:10px"><label>Beschreibung (optional)</label><textarea class="textarea" rows="2" data-desc>${esc(p.desc || '')}</textarea></div>
    ${answerCount ? `<p class="hint" style="margin-top:10px;color:var(--gold)">Es gibt schon ${answerCount} Antworten. Fragen umbenennen ist kein Problem – Antwortmöglichkeiten ändern kann alte Antworten unpassend machen.</p>` : ''}
    <div class="pe-list" data-list></div>
    <button class="btn btn-ghost btn-sm" data-addq style="margin-top:10px">+ Frage hinzufügen</button>
  </div>`);
  const list = body.querySelector('[data-list]');

  function sync() {
    p.title = body.querySelector('[data-title]').value;
    p.desc = body.querySelector('[data-desc]').value;
    list.querySelectorAll('[data-qi]').forEach(card => {
      const q = p.questions[Number(card.dataset.qi)];
      q.label = card.querySelector('[data-label]').value;
      q.type = card.querySelector('[data-type]').value;
      q.required = card.querySelector('[data-req]').checked;
      const opts = card.querySelector('[data-opts]');
      if (opts) q.options = opts.value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 20);
      const max = card.querySelector('[data-max]');
      if (max) { q.max = Number(max.value); q.low = card.querySelector('[data-low]').value.trim(); q.high = card.querySelector('[data-high]').value.trim(); }
    });
  }
  function drawQs() {
    list.innerHTML = p.questions.map((q, i) => `<div class="pe-q" data-qi="${i}">
      <div class="pe-row">
        <span class="pe-num">${i + 1}</span>
        <input class="input" data-label value="${esc(q.label)}" placeholder="Frage">
        <select class="select" data-type>${Object.entries(QTYPES).map(([k, t]) => `<option value="${k}" ${q.type === k ? 'selected' : ''}>${t.icon}  ${t.label}</option>`).join('')}</select>
      </div>
      ${QTYPES[q.type]?.options ? `<div class="field" style="margin-top:8px"><label>Antwortmöglichkeiten – eine pro Zeile</label><textarea class="textarea" rows="${Math.max(3, (q.options || []).length + 1)}" data-opts>${esc((q.options || []).join('\n'))}</textarea></div>` : ''}
      ${q.type === 'scale' ? `<div class="pe-scale"><label>Von 1 bis <select class="select" data-max>${[5, 10].map(m => `<option ${Number(q.max || 5) === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
        <input class="input" data-low value="${esc(q.low || '')}" placeholder="Text bei 1 (optional)"><input class="input" data-high value="${esc(q.high || '')}" placeholder="Text beim Maximum (optional)"></div>` : ''}
      <div class="pe-foot">
        <label class="check-row"><input type="checkbox" data-req ${q.required ? 'checked' : ''}> Pflichtfrage</label>
        <span class="spacer"></span>
        <button class="icon-btn" data-up title="Nach oben" ${i ? '' : 'disabled'}>↑</button>
        <button class="icon-btn" data-down title="Nach unten" ${i < p.questions.length - 1 ? '' : 'disabled'}>↓</button>
        <button class="icon-btn" data-rm title="Frage löschen">✕</button>
      </div>
    </div>`).join('');
    list.querySelectorAll('[data-qi]').forEach(card => {
      const i = Number(card.dataset.qi);
      card.querySelector('[data-type]').onchange = e => {
        sync(); const q = p.questions[i];
        if (QTYPES[q.type]?.options && !(q.options || []).length) q.options = ['Option 1', 'Option 2'];
        if (q.type === 'scale' && !q.max) q.max = 5;
        drawQs();
      };
      card.querySelector('[data-up]').onclick = () => { sync(); [p.questions[i - 1], p.questions[i]] = [p.questions[i], p.questions[i - 1]]; drawQs(); };
      card.querySelector('[data-down]').onclick = () => { sync(); [p.questions[i + 1], p.questions[i]] = [p.questions[i], p.questions[i + 1]]; drawQs(); };
      card.querySelector('[data-rm]').onclick = () => { sync(); p.questions.splice(i, 1); drawQs(); };
    });
  }
  body.querySelector('[data-addq]').onclick = () => { sync(); p.questions.push({ id: newId(), type: 'single', label: '', options: ['Option 1', 'Option 2'], required: false }); drawQs(); };
  drawQs();

  openModal({
    title: poll ? 'Umfrage bearbeiten' : 'Neue Umfrage', body, wide: true,
    actions: [{ label: 'Abbrechen' }, { label: poll ? 'Speichern' : 'Veröffentlichen', cls: 'btn-primary', onClick: async () => {
      sync();
      if (!p.title.trim()) { toast('Titel fehlt', 'err'); return true; }
      const qs = p.questions.filter(q => q.label.trim());
      if (!qs.length) { toast('Mindestens eine Frage', 'err'); return true; }
      if (qs.some(q => QTYPES[q.type]?.options && (q.options || []).length < 2)) { toast('Auswahlfragen brauchen mind. 2 Antworten', 'err'); return true; }
      const data = { title: p.title.trim(), desc: p.desc.trim(), questions: qs.map(q => ({ ...q, label: q.label.trim() })) };
      if (poll) await store.set('polls', poll.id, data);
      else { const id = await store.add('polls', { ...data, open: true, created: new Date().toISOString(), by: auth.user?.name || '' }); location.hash = `#/umfragen/${id}`; }
      toast(poll ? 'Gespeichert' : 'Umfrage veröffentlicht');
    } }],
  });
}
