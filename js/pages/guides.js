import { store, auth } from '../store.js';
import { esc, h, md, openModal, toast, safeUrl, raidBosses } from '../ui.js';
import { sortRaids, editRaid, editBoss, raidCardsHtml, raidBannerHtml, watchBossCovers, compressImage, coverOk } from '../raids.js';
import { RUF, MIN_SECONDS, hasGuide, guideVersion, isRead, watchMine, confirmRead, readStatus, openReadStatus, quizToText, textToQuiz } from '../guidereads.js';

const MAX_IMAGES = 3;   // Bilder pro Guide (alle zusammen < 1 MB in guideImages/<bossId>)
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
        <div class="page-actions">${auth.isOfficer ? '<button class="btn btn-ghost" data-template title="Aufbau, mit dem neue Guides starten">Guide-Vorlage</button><button class="btn btn-primary" data-newraid>+ Raid</button>' : ''}</div>
      </div>
      <div class="raid-grid" data-grid><div class="loading">Lade…</div></div>
    </div>`);
  root.appendChild(el);
  const { st, stop } = watchAll(() => draw());
  el.querySelector('[data-newraid]')?.addEventListener('click', () => editRaid(null, st));
  el.querySelector('[data-template]')?.addEventListener('click', () => editTemplate(st.settings.guideTemplate));

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
  const { st, stop: stopAll } = watchAll(() => draw());
  let covers = {};
  const stopCovers = watchBossCovers(c => { covers = c; draw(); });
  const stop = () => { stopAll(); stopCovers(); };
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
    const anyCover = list.some(b => covers?.[b.id]);   // dann bekommen alle Karten einen Bildbereich (gleich hoch)
    grid.innerHTML = list.map((b, i) => {
      const g = st.guides[b.id];
      const ok = hasContent(g);
      const read = ok && isRead(st.mine, b.id, g);
      const stat = auth.isOfficer && ok ? readStatus(b.id, g, st.reads, st.players) : null;
      const cv = covers?.[b.id];
      return `<a class="card guide-card ${ok && !read ? 'unread' : ''} ${anyCover ? 'has-cover' : ''}" href="#/guides/${encodeURIComponent(b.id)}">
        ${cv ? `<div class="gc-cover"><img src="${cv}" alt="" loading="lazy"></div>` : anyCover ? '<div class="gc-cover empty"><img src="assets/logo.webp" alt=""></div>' : ''}
        ${ok && !read ? `<div class="gc-ruf">${RUF}</div>` : ''}
        <div class="num">Boss ${i + 1}</div>
        <div class="nm">${esc(b.name)}</div>
        <div class="meta">${ok ? (read ? '<span class="ready">✓ Gelesen</span>' : '<span class="unread-txt">Noch nicht bestätigt</span>') : 'Noch kein Guide'}${g?.quiz?.length ? ' <span class="muted">· Quiz</span>' : ''}</div>
        ${stat ? `<button class="gr-pill ${stat.done === stat.total ? 'full' : ''}" data-status="${esc(b.id)}" title="Wer hat gelesen?">${stat.done}/${stat.total} gelesen</button>` : ''}
        ${auth.isOfficer ? `<button class="icon-btn gc-edit" data-edit-boss="${esc(b.id)}" title="Boss bearbeiten (Name, Titelbild, Löschen)">✎</button>` : ''}
      </a>`;
    }).join('');
    grid.querySelectorAll('[data-edit-boss]').forEach(btn => btn.onclick = e => {
      e.preventDefault(); e.stopPropagation();
      editBoss(list.find(x => x.id === btn.dataset.editBoss), { raids: st.raids });
    });
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
      <div data-bossbanner></div>
      <div class="page-head">
        <div data-headtxt>
          <div class="eyebrow" data-raid>Boss Guide</div>
          <h2 class="page-title" data-title>–</h2>
        </div>
        <div class="page-actions">${auth.isOfficer ? '<button class="btn btn-ghost" data-cover title="Name, Reihenfolge, Titelbild, Löschen">✎ Boss</button><button class="btn btn-ghost hidden" data-status>Gelesen</button><button class="btn btn-ghost" data-edit>Bearbeiten</button>' : ''}</div>
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

  let boss = null, guide = null, tab = 'overview', raids = [], mine = null, allReads = [], players = [], cover = '', images = [], template = null;
  let quizOpen = false, answers = {}, wrong = null, saving = false;
  const opened = Date.now();
  let reachedEnd = false;
  el.querySelector('[data-edit]')?.addEventListener('click', () => editGuide(bossId, boss, guide, images, template));
  el.querySelector('[data-cover]')?.addEventListener('click', () => boss && editBoss({ ...boss, id: bossId }, { raids }));
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
    // Titelbild: Banner mit Bossname – dann entfällt der Titel darunter
    el.querySelector('[data-bossbanner]').innerHTML = cover ? `<div class="raid-banner boss-banner">
        <img src="${cover}" alt="">
        <div class="raid-banner-text"><div class="eyebrow">${esc(raid ? `Boss Guide · ${raid.name}` : 'Boss Guide')}</div><h2 class="page-title">${esc(boss?.name || bossId)}</h2></div>
      </div>` : '';
    el.querySelector('[data-headtxt]').classList.toggle('hidden', !!cover);
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
    images.forEach((im, i) => links.push(`<button class="gimg" data-img="${i}" title="Vergrößern"><img src="${im.src}" alt="${esc(im.caption || 'Bild')}">${im.caption ? `<span>${esc(im.caption)}</span>` : ''}</button>`));
    const img = safeUrl(guide?.imageUrl), plan = safeUrl(guide?.planUrl), vid = safeUrl(guide?.videoUrl), src = safeUrl(guide?.sourceUrl);
    if (img) links.push(`<a href="${img}" target="_blank" rel="noopener"><img src="${img}" alt="Positionierung" style="width:100%;border-radius:12px;border:1px solid var(--line)"></a>`);
    if (plan) links.push(`<a class="side-link" href="${plan}" target="_blank" rel="noopener">🗺️ Raidplan öffnen</a>`);
    if (vid) links.push(`<a class="side-link" href="${vid}" target="_blank" rel="noopener">▶️ Video-Guide</a>`);
    if (src) links.push(`<a class="side-link" href="${src}" target="_blank" rel="noopener">📖 Quelle / Original-Guide</a>`);
    el.querySelector('[data-side]').innerHTML = links.join('') || '<div class="card card-pad muted" style="font-size:14px">Keine Bilder oder Links hinterlegt.</div>';
    el.querySelectorAll('[data-img]').forEach(b => b.onclick = () => openLightbox(images, Number(b.dataset.img)));
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
    store.watchDoc('guideImages', bossId, d => { images = (d?.imgs || []).filter(x => coverOk(x.src)); draw(); }, () => {}),
    store.watchDoc('settings', 'main', s => { template = s?.guideTemplate || null; }),
    store.watchDoc('bossCovers', bossId, c => { cover = /^data:image\//.test(c?.img || '') ? c.img : ''; draw(); }, () => {}),
    store.watchCol('raids', rs => { raids = rs; draw(); }),
    watchMine(d => { mine = d; draw(); }),
    ...(auth.isOfficer ? [
      store.watchCol('guideReads', rs => { allReads = rs; draw(); }),
      store.watchCol('players', ps => { players = ps; draw(); }),
    ] : []),
  ];
  return () => { clearInterval(tick); io.disconnect(); unsubs.forEach(u => u()); };
}

function editGuide(bossId, boss, guide, images = [], template = null) {
  const fresh = !hasContent(guide);
  const useTpl = fresh && template && Object.values(template).some(t => t && t.trim());
  const sec = useTpl ? template : (guide?.sections || {});
  let imgs = images.map(x => ({ ...x }));
  const body = h(`
    <div>
      ${useTpl ? '<div class="tpl-note">📋 Vorlage eingefügt – einfach ausfüllen. Leere Abschnitte bleiben im Guide unsichtbar.</div>' : ''}
      <p class="hint" style="margin-bottom:14px">Formatierung: <code>### Überschrift</code> · <code>- Aufzählung</code> · <code>**fett**</code> · <code>&gt; Hinweis-Box</code></p>
      <div class="form-grid">
        ${SECTIONS.map(([k, l]) => `<div class="field full"><label>${l}</label><textarea class="textarea" name="${k}">${esc(sec[k] || '')}</textarea></div>`).join('')}
        <div class="field full"><label>Bilder <span class="muted">(bis zu ${MAX_IMAGES}, z. B. Positionen – erscheinen rechts neben dem Guide)</span></label>
          <div class="gimg-edit" data-imgs></div>
        </div>
        <div class="field full"><label>Bild-Link <span class="muted">(optional, falls das Bild schon online liegt)</span></label><input class="input" name="imageUrl" value="${esc(guide?.imageUrl || '')}"></div>
        <div class="field"><label>Raidplan-Link</label><input class="input" name="planUrl" value="${esc(guide?.planUrl || '')}" placeholder="https://raidplan.io/plan/…"></div>
        <div class="field"><label>Video-Link</label><input class="input" name="videoUrl" value="${esc(guide?.videoUrl || '')}"></div>
        <div class="field full"><label>Quelle</label><input class="input" name="sourceUrl" value="${esc(guide?.sourceUrl || '')}"></div>
        <div class="field full"><label>Quiz (optional) – wer bestätigt, muss alle Fragen richtig beantworten</label>
          <textarea class="textarea" name="quiz" rows="6" placeholder="? Wie weit müssen die Golems auseinander?\n* Mindestens 40 m\n- 10 m\n- Egal\n\n? Was passiert bei Vitriolic Stasis?\n* …">${esc(quizToText(guide?.quiz || []))}</textarea>
          <span class="hint">Pro Frage: <code>? Frage</code>, darunter Antworten mit <code>*</code> (richtig) oder <code>-</code> (falsch). Leer lassen = kein Quiz.</span></div>
        ${hasGuide(guide) ? `<label class="check-row full gr-major"><input type="checkbox" name="major"> <span><b>Wichtige Änderung</b> – alle müssen den Guide neu bestätigen <span class="muted">(bei Tippfehlern weglassen)</span></span></label>` : ''}
      </div>
    </div>`);

  const box = body.querySelector('[data-imgs]');
  const drawImgs = () => {
    box.innerHTML = imgs.map((im, i) => `<div class="gimg-item">
        <img src="${im.src}" alt="">
        <input class="input" data-cap="${i}" placeholder="Beschriftung (optional)" value="${esc(im.caption || '')}">
        <div class="gimg-btns">
          <button type="button" class="icon-btn" data-up="${i}" title="Nach vorne" ${i ? '' : 'disabled'}>↑</button>
          <button type="button" class="icon-btn" data-del="${i}" title="Entfernen">✕</button>
        </div>
      </div>`).join('') + (imgs.length < MAX_IMAGES ? `<label class="gimg-add"><input type="file" accept="image/*" multiple hidden data-file><span>＋ Bild hochladen</span></label>` : '');
    box.querySelectorAll('[data-cap]').forEach(inp => inp.oninput = () => { imgs[Number(inp.dataset.cap)].caption = inp.value; });
    box.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { imgs.splice(Number(b.dataset.del), 1); drawImgs(); });
    box.querySelectorAll('[data-up]').forEach(b => b.onclick = () => { const i = Number(b.dataset.up); [imgs[i - 1], imgs[i]] = [imgs[i], imgs[i - 1]]; drawImgs(); });
    box.querySelector('[data-file]')?.addEventListener('change', async e => {
      const files = [...e.target.files].slice(0, MAX_IMAGES - imgs.length);
      box.querySelector('.gimg-add span').textContent = 'Wird verarbeitet…';
      for (const f of files) {
        try { imgs.push({ src: await compressImage(f, 1400, 1000, 290000), caption: '' }); }
        catch (err) { console.error(err); toast(`${f.name}: Bild konnte nicht gelesen werden`, 'err'); }
      }
      drawImgs();
    });
  };
  drawImgs();

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
      const changed = JSON.stringify(imgs) !== JSON.stringify(images);
      if (changed) {
        if (imgs.length) await store.set('guideImages', bossId, { imgs: imgs.map(x => ({ src: x.src, caption: (x.caption || '').trim().slice(0, 120) })) });
        else await store.remove('guideImages', bossId);
      }
      toast('Guide gespeichert');
    } }],
  });
}

/** Vorlage für neue Guides (settings/main.guideTemplate) */
function editTemplate(tpl = {}) {
  const body = h(`
    <div>
      <p class="hint" style="margin-bottom:14px">Mit diesem Aufbau startet jeder <b>neue</b> Guide. Bestehende Guides bleiben unverändert. Leere Abschnitte = leeres Feld.</p>
      <div class="form-grid">
        ${SECTIONS.map(([k, l]) => `<div class="field full"><label>${l}</label><textarea class="textarea" name="${k}" rows="5">${esc(tpl?.[k] || '')}</textarea></div>`).join('')}
      </div>
    </div>`);
  openModal({
    title: 'Guide-Vorlage', body, wide: true,
    actions: [{ label: 'Abbrechen' }, { label: 'Speichern', cls: 'btn-primary', onClick: async () => {
      await store.set('settings', 'main', { guideTemplate: Object.fromEntries(SECTIONS.map(([k]) => [k, body.querySelector(`[name=${k}]`).value])) });
      toast('Vorlage gespeichert');
    } }],
  });
}

/** Bild groß anzeigen, mit Pfeilen durchblättern */
function openLightbox(images, start = 0) {
  let i = start;
  const el = h(`<div class="lightbox" role="dialog">
      <button class="lb-x" title="Schließen">✕</button>
      ${images.length > 1 ? '<button class="lb-nav prev" title="Zurück">‹</button><button class="lb-nav next" title="Weiter">›</button>' : ''}
      <figure><img alt=""><figcaption></figcaption></figure>
    </div>`);
  const show = () => {
    el.querySelector('img').src = images[i].src;
    el.querySelector('figcaption').textContent = images[i].caption || (images.length > 1 ? `${i + 1} / ${images.length}` : '');
  };
  const close = () => { el.remove(); document.removeEventListener('keydown', key); };
  const go = d => { i = (i + d + images.length) % images.length; show(); };
  const key = e => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
  el.onclick = e => { if (e.target === el || e.target.tagName === 'FIGURE') close(); };
  el.querySelector('.lb-x').onclick = close;
  el.querySelector('.prev')?.addEventListener('click', e => { e.stopPropagation(); go(-1); });
  el.querySelector('.next')?.addEventListener('click', e => { e.stopPropagation(); go(1); });
  document.addEventListener('keydown', key);
  document.getElementById('modal-root').appendChild(el);
  show();
}
