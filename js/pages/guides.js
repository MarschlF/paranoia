import { store, auth } from '../store.js';
import { esc, h, md, openModal, toast, safeUrl, raidBosses } from '../ui.js';
import { sortRaids, editRaid, editBoss, raidCardsHtml, raidBannerHtml } from '../raids.js';
import { RUF, MIN_SECONDS, hasGuide, guideVersion, isRead, watchMine, confirmRead, readStatus, openReadStatus, quizToText, textToQuiz } from '../guidereads.js';

const SECTIONS = [
  ['overview', 'Übersicht'],
  ['tanks', 'Tanks'],
  ['healer', 'Heiler'],
  ['dps', 'DPS'],
  ['intermission', 'Phasen / Intermission'],
];

export function render(root, { params }) {
  if (params[0] === 'raid' && params[1]) return renderRaid(root, decodeURIComponent(params[1]));
  return params[0] ? renderDetail(root, decodeURIComponent(params[0])) : renderOverview(root);
}

function watchAll(onChange0) {
  // Erst feuern, wenn die Seite fertig aufgebaut ist (Demo liefert Daten sofort)
  let live = false;
  const onChange = () => { if (live) onChange0(); };
  const st = { bosses: [], guides: {}, raids: [], settings: {}, mine: null, reads: [], players: [] };
  const unsubs = [
    watchMine(d => { st.mine = d; onChange(); }),
    ...(auth.isOfficer ? [
      store.watchCol('guideReads', rs => { st.reads = rs; onChange(); }),
      store.watchCol('players', ps => { st.players = ps; onChange(); }),
    ] : []),
    store.watchCol('bosses', bs => { st.bosses = bs; onChange(); }),
    store.watchCol('raids', rs => { st.raids = rs; onChange(); }),
    store.watchDoc('settings', 'main', s => { st.settings = s || {}; onChange(); }),
    store.watchCol('guides', gs => { st.guides = Object.fromEntries(gs.map(g => [g.id, g])); onChange(); }),
  ];
  live = true; queueMicrotask(onChange0);
  return { st, stop: () => unsubs.forEach(u => u()) };
}

// ── Übersicht: Raids als Kacheln ────────────────────────────
function renderOverview(root) {
  const el = h(`
    <div class="container page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Intern · Taktiken</div>
          <h2 class="page-title">Boss Guides</h2>
          <p class="page-sub">Raid auswählen, um zu den Taktiken der einzelnen Bosse zu kommen.</p>
        </div>
        <div class="page-actions">${auth.isOfficer ? '<button class="btn btn-primary" data-newraid>+ Raid</button>' : ''}</div>
      </div>
      <div class="raid-grid" data-grid><div class="loading">Lade…</div></div>
    </div>`);
  root.appendChild(el);
  const { st, stop } = watchAll(() => draw());
  el.querySelector('[data-newraid]')?.addEventListener('click', () => editRaid(null, st));

  function draw() {
    const grid = el.querySelector('[data-grid]');
    const raids = sortRaids(st.raids, st.settings);
    if (!raids.length) { grid.innerHTML = `<div class="empty">Noch keine Raids.${auth.isOfficer ? ' Über „+ Raid" anlegen.' : ''}</div>`; return; }
    grid.innerHTML = raidCardsHtml(raids, st.settings, {
      href: r => `#/guides/raid/${encodeURIComponent(r.id)}`,
      isOfficer: auth.isOfficer,
      meta: r => {
        const list = raidBosses(st.bosses, r.id, st.settings);
        const ready = list.filter(b => hasContent(st.guides[b.id])).length;
        const open = list.filter(b => hasGuide(st.guides[b.id]) && !isRead(st.mine, b.id, st.guides[b.id])).length;
        return {
          line: list.length ? `${ready} von ${list.length} Guides fertig${open ? ` · ${open} ungelesen` : ''}` : 'Noch keine Bosse',
          pct: list.length ? ready / list.length : null,
          badge: open ? RUF : '',
        };
      },
    });
    grid.querySelectorAll('[data-edit-raid]').forEach(b => b.onclick = e => {
      e.preventDefault(); e.stopPropagation();
      editRaid(st.raids.find(r => r.id === b.dataset.editRaid), st);
    });
  }
  return stop;
}

// ── Bosse eines Raids ───────────────────────────────────────
function renderRaid(root, raidId) {
  const el = h(`
    <div class="container page">
      <div class="raid-detail-head">
        <a href="#/guides" class="back-link" style="margin:0">← Alle Raids</a>
        <div class="page-actions">${auth.isOfficer ? `
          <button class="btn btn-ghost btn-sm" data-editraid>Raid bearbeiten</button>
          <button class="btn btn-primary btn-sm" data-newboss>+ Boss</button>` : ''}</div>
      </div>
      <div data-banner></div>
      <div class="guide-grid" data-grid><div class="loading">Lade…</div></div>
    </div>`);
  root.appendChild(el);
  const { st, stop } = watchAll(() => draw());
  el.querySelector('[data-editraid]')?.addEventListener('click', () => editRaid(st.raids.find(r => r.id === raidId), st));
  el.querySelector('[data-newboss]')?.addEventListener('click', () =>
    editBoss(null, { raids: st.raids, raidId, nextOrder: raidBosses(st.bosses, raidId, st.settings).length + 1 }));

  function draw() {
    const raid = st.raids.find(r => r.id === raidId);
    const list = raidBosses(st.bosses, raidId, st.settings);
    const ready = list.filter(b => hasContent(st.guides[b.id])).length;
    el.querySelector('[data-banner]').innerHTML = raid ? raidBannerHtml(raid, st.settings, `${ready} von ${list.length} Guides fertig`) : '';
    const grid = el.querySelector('[data-grid]');
    if (!list.length) { grid.innerHTML = `<div class="empty">Noch keine Bosse in diesem Raid.${auth.isOfficer ? ' Über „+ Boss" hinzufügen.' : ''}</div>`; return; }
    grid.innerHTML = list.map((b, i) => {
      const g = st.guides[b.id];
      const ok = hasContent(g);
      const read = ok && isRead(st.mine, b.id, g);
      const stat = auth.isOfficer && ok ? readStatus(b.id, g, st.reads, st.players) : null;
      return `<a class="card guide-card ${ok && !read ? 'unread' : ''}" href="#/guides/${encodeURIComponent(b.id)}">
        ${ok && !read ? `<div class="gc-ruf">${RUF}</div>` : ''}
        <div class="num">Boss ${i + 1}</div>
        <div class="nm">${esc(b.name)}</div>
        <div class="meta">${ok ? (read ? '<span class="ready">✓ Gelesen</span>' : '<span class="unread-txt">Noch nicht bestätigt</span>') : 'Noch kein Guide'}${g?.quiz?.length ? ' <span class="muted">· Quiz</span>' : ''}</div>
        ${stat ? `<button class="gr-pill ${stat.done === stat.total ? 'full' : ''}" data-status="${esc(b.id)}" title="Wer hat gelesen?">${stat.done}/${stat.total} gelesen</button>` : ''}
      </a>`;
    }).join('');
    grid.querySelectorAll('[data-status]').forEach(btn => btn.onclick = e => {
      e.preventDefault(); e.stopPropagation();
      const b = list.find(x => x.id === btn.dataset.status);
      openReadStatus(b, st.guides[b.id], st.reads, st.players);
    });
  }
  return stop;
}

const hasContent = g => g && Object.values(g.sections || {}).some(t => t && t.trim());

function renderDetail(root, bossId) {
  const el = h(`
    <div class="container page">
      <a href="#/guides" class="back-link" data-back>← Alle Guides</a>
      <div class="page-head">
        <div>
          <div class="eyebrow" data-raid>Boss Guide</div>
          <h2 class="page-title" data-title>–</h2>
        </div>
        <div class="page-actions">${auth.isOfficer ? '<button class="btn btn-ghost hidden" data-status>Gelesen</button><button class="btn btn-ghost" data-edit>Bearbeiten</button>' : ''}</div>
      </div>
      <div class="guide-layout">
        <div>
          <div class="card card-pad">
            <div class="guide-tabs" data-tabs></div>
            <div class="prose" data-content></div>
          </div>
          <div class="card card-pad gr-box" data-confirm></div>
        </div>
        <div class="side-links" data-side></div>
      </div>
    </div>`);
  root.appendChild(el);

  let boss = null, guide = null, tab = 'overview', raids = [], mine = null, allReads = [], players = [];
  let quizOpen = false, answers = {}, wrong = null, saving = false;
  const opened = Date.now();
  let reachedEnd = false;
  el.querySelector('[data-edit]')?.addEventListener('click', () => editGuide(bossId, boss, guide));
  el.querySelector('[data-status]')?.addEventListener('click', () => openReadStatus({ ...boss, id: bossId }, guide, allReads, players));

  // ── Lesebestätigung ───────────────────────────────────────
  const box = el.querySelector('[data-confirm]');
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting) && !reachedEnd) { reachedEnd = true; drawConfirm(); } }, { threshold: 0.6 });
  io.observe(box);
  const tick = setInterval(() => { if (!quizOpen && !isRead(mine, bossId, guide) && hasGuide(guide)) drawConfirm(); }, 1000);

  function drawConfirm() {
    if (!hasGuide(guide)) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    if (isRead(mine, bossId, guide)) {
      const at = mine.reads[bossId].at;
      box.className = 'card card-pad gr-box done';
      box.innerHTML = `<div class="gr-done">✓ Gelesen und bestätigt <span class="muted">· ${at ? new Date(at).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span></div>`;
      return;
    }
    box.className = 'card card-pad gr-box';
    const left = Math.max(0, MIN_SECONDS - Math.floor((Date.now() - opened) / 1000));
    const ready = reachedEnd && left === 0;
    const quiz = guide.quiz || [];
    const old = mine?.reads?.[bossId];
    if (quizOpen && quiz.length) {
      box.innerHTML = `
        <div class="gr-title">${RUF} Kurzes Quiz · ${quiz.length} Frage${quiz.length > 1 ? 'n' : ''}</div>
        ${quiz.map((q, i) => `<div class="qz ${wrong?.includes(i) ? 'wrong' : ''}">
          <div class="qz-q">${i + 1}. ${esc(q.q)}</div>
          ${q.a.map((a, j) => `<label class="qz-a"><input type="radio" name="q${i}" value="${j}" ${answers[i] === j ? 'checked' : ''}> ${esc(a)}</label>`).join('')}
        </div>`).join('')}
        ${wrong?.length ? `<p class="qz-msg">${wrong.length} Antwort${wrong.length > 1 ? 'en' : ''} falsch – schau nochmal in den Guide und versuch's erneut.</p>` : ''}
        <div style="display:flex;gap:8px;margin-top:12px"><button class="btn btn-primary" data-submit>Antworten prüfen</button><button class="btn btn-ghost" data-cancel>Zurück zum Guide</button></div>`;
      box.querySelectorAll('input[type=radio]').forEach(r => r.onchange = () => { answers[Number(r.name.slice(1))] = Number(r.value); });
      box.querySelector('[data-cancel]').onclick = () => { quizOpen = false; drawConfirm(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
      box.querySelector('[data-submit]').onclick = async () => {
        if (quiz.some((_, i) => answers[i] === undefined)) { toast('Bitte alle Fragen beantworten', 'err'); return; }
        wrong = quiz.map((q, i) => answers[i] === q.c ? -1 : i).filter(i => i >= 0);
        if (wrong.length) { answers = {}; drawConfirm(); return; }
        await save();
      };
      return;
    }
    box.innerHTML = `
      <div class="gr-title">${RUF} Bitte bestätigen, dass du den Guide gelesen hast</div>
      ${old ? '<p class="hint" style="margin:-4px 0 10px">Der Guide wurde seit deiner letzten Bestätigung wichtig geändert.</p>' : ''}
      <div class="gr-checks">
        <span class="${reachedEnd ? 'ok' : ''}">${reachedEnd ? '✓' : '○'} Bis zum Ende gelesen</span>
        <span class="${left === 0 ? 'ok' : ''}">${left === 0 ? '✓' : '○'} ${left === 0 ? `Mindestens ${MIN_SECONDS} Sekunden` : `Noch ${left} s`}</span>
        ${quiz.length ? `<span>○ Quiz mit ${quiz.length} Frage${quiz.length > 1 ? 'n' : ''}</span>` : ''}
      </div>
      <button class="btn btn-primary" data-ok ${ready && !saving ? '' : 'disabled'}>${quiz.length ? 'Weiter zum Quiz' : 'Gelesen ✓'}</button>`;
    box.querySelector('[data-ok]').onclick = async () => {
      if (quiz.length) { quizOpen = true; wrong = null; answers = {}; drawConfirm(); return; }
      await save();
    };
  }
  async function save() {
    if (saving) return; saving = true;
    try { await confirmRead(mine, bossId, guide); toast('Danke – als gelesen bestätigt'); quizOpen = false; }
    catch (e) { console.error(e); toast('Speichern fehlgeschlagen', 'err'); }
    saving = false; drawConfirm();
  }

  const draw = () => {
    el.querySelector('[data-title]').textContent = boss?.name || bossId;
    const raid = raids.find(r => r.id === boss?.raidId);
    el.querySelector('[data-raid]').textContent = raid ? `Boss Guide · ${raid.name}` : 'Boss Guide';
    const back = el.querySelector('[data-back]');
    if (raid) { back.href = `#/guides/raid/${encodeURIComponent(raid.id)}`; back.textContent = `← ${raid.name}`; }
    const sec = guide?.sections || {};
    el.querySelector('[data-tabs]').innerHTML = SECTIONS.map(([k, l]) =>
      `<button class="guide-tab ${tab === k ? 'active' : ''}" data-tab="${k}">${l}</button>`).join('');
    el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; draw(); });
    el.querySelector('[data-content]').innerHTML = sec[tab]?.trim()
      ? md(sec[tab])
      : `<p class="muted">Noch nichts eingetragen.${auth.isOfficer ? ' Über „Bearbeiten" ergänzen.' : ''}</p>`;

    const links = [];
    const img = safeUrl(guide?.imageUrl), plan = safeUrl(guide?.planUrl), vid = safeUrl(guide?.videoUrl), src = safeUrl(guide?.sourceUrl);
    if (img) links.push(`<a href="${img}" target="_blank" rel="noopener"><img src="${img}" alt="Positionierung" style="width:100%;border-radius:12px;border:1px solid var(--line)"></a>`);
    if (plan) links.push(`<a class="side-link" href="${plan}" target="_blank" rel="noopener">🗺️ Raidplan öffnen</a>`);
    if (vid) links.push(`<a class="side-link" href="${vid}" target="_blank" rel="noopener">▶️ Video-Guide</a>`);
    if (src) links.push(`<a class="side-link" href="${src}" target="_blank" rel="noopener">📖 Quelle / Original-Guide</a>`);
    el.querySelector('[data-side]').innerHTML = links.join('') || '<div class="card card-pad muted" style="font-size:14px">Keine Links hinterlegt.</div>';
    const sb = el.querySelector('[data-status]');
    if (sb && hasGuide(guide)) {
      const s = readStatus(bossId, guide, allReads, players);
      sb.classList.remove('hidden'); sb.textContent = `Gelesen ${s.done}/${s.total}`;
    } else sb?.classList.add('hidden');
    if (!quizOpen) drawConfirm();
  };

  const unsubs = [
    store.watchDoc('bosses', bossId, b => { boss = b; draw(); }),
    store.watchDoc('guides', bossId, g => { guide = g; draw(); }),
    store.watchCol('raids', rs => { raids = rs; draw(); }),
    watchMine(d => { mine = d; draw(); }),
    ...(auth.isOfficer ? [
      store.watchCol('guideReads', rs => { allReads = rs; draw(); }),
      store.watchCol('players', ps => { players = ps; draw(); }),
    ] : []),
  ];
  return () => { clearInterval(tick); io.disconnect(); unsubs.forEach(u => u()); };
}

function editGuide(bossId, boss, guide) {
  const sec = guide?.sections || {};
  const body = h(`
    <div>
      <p class="hint" style="margin-bottom:14px">Formatierung: <code>### Überschrift</code> · <code>- Aufzählung</code> · <code>**fett**</code> · <code>&gt; Hinweis-Box</code></p>
      <div class="form-grid">
        ${SECTIONS.map(([k, l]) => `<div class="field full"><label>${l}</label><textarea class="textarea" name="${k}">${esc(sec[k] || '')}</textarea></div>`).join('')}
        <div class="field full"><label>Bild-URL (z. B. Positionierungs-Screenshot)</label><input class="input" name="imageUrl" value="${esc(guide?.imageUrl || '')}"></div>
        <div class="field"><label>Raidplan-Link</label><input class="input" name="planUrl" value="${esc(guide?.planUrl || '')}" placeholder="https://raidplan.io/plan/…"></div>
        <div class="field"><label>Video-Link</label><input class="input" name="videoUrl" value="${esc(guide?.videoUrl || '')}"></div>
        <div class="field full"><label>Quelle</label><input class="input" name="sourceUrl" value="${esc(guide?.sourceUrl || '')}"></div>
        <div class="field full"><label>Quiz (optional) – wer bestätigt, muss alle Fragen richtig beantworten</label>
          <textarea class="textarea" name="quiz" rows="6" placeholder="? Wie weit müssen die Golems auseinander?\n* Mindestens 40 m\n- 10 m\n- Egal\n\n? Was passiert bei Vitriolic Stasis?\n* …">${esc(quizToText(guide?.quiz || []))}</textarea>
          <span class="hint">Pro Frage: <code>? Frage</code>, darunter Antworten mit <code>*</code> (richtig) oder <code>-</code> (falsch). Leer lassen = kein Quiz.</span></div>
        ${hasGuide(guide) ? `<label class="check-row full gr-major"><input type="checkbox" name="major"> <span><b>Wichtige Änderung</b> – alle müssen den Guide neu bestätigen <span class="muted">(bei Tippfehlern weglassen)</span></span></label>` : ''}
      </div>
    </div>`);
  openModal({
    title: `Guide: ${boss?.name || bossId}`, body, wide: true,
    actions: [{ label: 'Abbrechen' }, { label: 'Speichern', cls: 'btn-primary', onClick: async () => {
      const v = n => body.querySelector(`[name=${n}]`).value;
      let quiz;
      try { quiz = textToQuiz(v('quiz')); } catch (e) { toast(e.message, 'err'); return true; }
      const major = body.querySelector('[name=major]')?.checked;
      await store.set('guides', bossId, {
        quiz,
        version: guideVersion(guide) + (major ? 1 : 0),
        sections: Object.fromEntries(SECTIONS.map(([k]) => [k, v(k)])),
        imageUrl: v('imageUrl').trim(), planUrl: v('planUrl').trim(), videoUrl: v('videoUrl').trim(), sourceUrl: v('sourceUrl').trim(),
        updated: new Date().toISOString(),
      });
      toast('Guide gespeichert');
    } }],
  });
}
