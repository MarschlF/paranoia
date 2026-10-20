// ─────────────────────────────────────────────────────────────
//  Nützliches (Intern) – drei Tabs
//  · Links             settings/main.links
//  · Addons & Profile  addons/<id> { name, cat, desc, url, string, updated }
//  · Sims              „Nach Spec“ für alle Raider, „Nach Trinket“ (Loot-Verteilung) nur für Offis – Daten live von bloodmallet.com
//  Lesen: alle Raider · Bearbeiten: Offis
// ─────────────────────────────────────────────────────────────
import { store, auth } from '../store.js';
import { loadTrinketMatrix } from '../bloodmallet.js';
import { esc, h, openModal, toast, safeUrl, md, confirmModal, fmtShort, CLASSES, matchPlayer, specIcon, clsColor } from '../ui.js';

const CATS = {
  pflicht:   { label: 'Pflicht',    hint: 'Muss jeder installiert haben' },
  empfohlen: { label: 'Empfohlen',  hint: 'Macht das Leben leichter' },
  profil:    { label: 'Profile',    hint: 'Import-Strings für einheitliche Einstellungen' },
};
const ONB = '_onboarding';
/** Logo einer Seite über den Favicon-Dienst von Google (64 px) – fällt bei Fehler auf das Emoji zurück */
const logoUrl = url => { try { return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(new URL(url).hostname)}`; } catch { return ''; } };
const ls = {
  get: k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

export function render(root, { params = [] } = {}) {
  const tab = params[0] === 'addons' ? 'addons' : params[0] === 'sims' ? 'sims' : 'links';
  const el = h(`
    <div class="container page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Intern</div>
          <h2 class="page-title">Nützliches</h2>
          <p class="page-sub">${tab === 'addons' ? 'Addons und Profile, die wir im Raid nutzen – Strings mit einem Klick kopieren und ingame importieren.'
            : tab === 'sims' ? 'Welche Trinkets, Phiolen & Co. für deine Spec am meisten bringen – aktuelle Simulationen von Bloodmallet.'
            : 'Tools, Links und Ressourcen für den Raid.'}</p>
        </div>
        <div class="page-actions" data-actions></div>
      </div>
      <div class="guide-tabs">
        <a class="guide-tab ${tab === 'links' ? 'active' : ''}" href="#/nuetzliches">Links</a>
        <a class="guide-tab ${tab === 'addons' ? 'active' : ''}" href="#/nuetzliches/addons">Addons & Profile</a>
        <a class="guide-tab ${tab === 'sims' ? 'active' : ''}" href="#/nuetzliches/sims">Sims</a>
      </div>
      <div data-body><div class="loading">Lade…</div></div>
    </div>`);
  root.appendChild(el);
  const actions = el.querySelector('[data-actions]');
  const body = el.querySelector('[data-body]');
  if (tab === 'addons') return renderAddons(body, actions);
  if (tab === 'sims') return renderSims(body);
  return renderLinks(body, actions);
}

// ── Links ────────────────────────────────────────────────────
function renderLinks(body, actions) {
  actions.innerHTML = `${auth.isOfficer ? '<button class="btn btn-primary" data-add>+ Link</button>' : ''}
    ${store.demo ? '<button class="btn btn-ghost" data-reset title="Demo-Daten zurücksetzen">Demo zurücksetzen</button>' : ''}`;
  body.innerHTML = '<div class="link-grid" data-grid><div class="loading">Lade…</div></div>';
  let settings = {};
  actions.querySelector('[data-reset]')?.addEventListener('click', () => store.resetDemo());
  actions.querySelector('[data-add]')?.addEventListener('click', () => {
    const form = h(`
      <div class="form-grid">
        <div class="field"><label>Name</label><input class="input" name="name"></div>
        <div class="field"><label>Ersatz-Icon (Emoji)</label><input class="input" name="icon" value="🔗"><span class="hint">Das Logo der Seite wird automatisch geladen – das Emoji nur, falls das nicht klappt.</span></div>
        <div class="field full"><label>URL</label><input class="input" name="url" placeholder="https://…"></div>
        <div class="field full"><label>Beschreibung</label><input class="input" name="desc"></div>
      </div>`);
    openModal({
      title: 'Neuer Link', body: form,
      actions: [{ label: 'Abbrechen' }, { label: 'Hinzufügen', cls: 'btn-primary', onClick: async () => {
        const v = n => form.querySelector(`[name=${n}]`).value.trim();
        if (!v('name') || !safeUrl(v('url'))) { toast('Name und gültige URL (https://…) nötig', 'err'); return true; }
        await store.set('settings', 'main', { links: [...(settings.links || []), { name: v('name'), icon: v('icon') || '🔗', url: v('url'), desc: v('desc') }] });
        toast('Link hinzugefügt');
      } }],
    });
  });

  const draw = () => {
    const links = settings.links || [];
    const grid = body.querySelector('[data-grid]');
    grid.innerHTML = links.length ? '' : '<div class="empty">Noch keine Links.</div>';
    links.forEach((l, i) => {
      const url = safeUrl(l.url);
      const card = h(`
        <a class="card link-card" href="${url || '#'}" target="_blank" rel="noopener">
          <div class="ico">${url && l.logo !== false ? `<img src="${logoUrl(url)}" alt="" loading="lazy" data-fallback="${esc(l.icon || '🔗')}">` : esc(l.icon || '🔗')}</div>
          <div><div class="nm">${esc(l.name)}</div><div class="ds">${esc(l.desc || '')}</div></div>
          ${auth.isOfficer ? '<button class="icon-btn del" title="Entfernen">✕</button>' : ''}
        </a>`);
      const im = card.querySelector('.ico img');
      if (im) im.onerror = () => { im.replaceWith(document.createTextNode(im.dataset.fallback)); };
      card.querySelector('.del')?.addEventListener('click', async e => {
        e.preventDefault(); e.stopPropagation();
        await store.set('settings', 'main', { links: links.filter((_, j) => j !== i) });
        toast('Link entfernt');
      });
      grid.appendChild(card);
    });
  };
  return store.watchDoc('settings', 'main', s => { settings = s || {}; draw(); });
}

// ── Addons & Profile ─────────────────────────────────────────
function renderAddons(body, actions) {
  if (auth.isOfficer) {
    actions.innerHTML = '<button class="btn btn-primary" data-add>+ Addon / Profil</button>';
    actions.querySelector('[data-add]').onclick = () => editAddon(null);
  }
  let list = null;
  const draw = () => {
    if (!list) return;
    const items = list.filter(a => a.id !== ONB);
    if (!items.length) {
      body.innerHTML = `<div class="empty"><div class="big">🧩</div>Noch keine Addons eingetragen.${auth.isOfficer ? '<br><span class="muted">Oben rechts „+ Addon / Profil“.</span>' : ''}</div>`;
      return;
    }
    body.innerHTML = Object.entries(CATS).map(([k, c]) => {
      const group = items.filter(a => (a.cat || 'empfohlen') === k).sort((a, b) => a.name.localeCompare(b.name));
      if (!group.length) return '';
      return `<section class="addon-sec">
        <div class="addon-sec-head"><h3>${c.label}</h3><span class="muted">${c.hint}</span></div>
        <div class="addon-grid">${group.map(addonCard).join('')}</div>
      </section>`;
    }).join('');
    body.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => copy(items.find(a => a.id === b.dataset.copy)?.string || '', b));
    body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editAddon(items.find(a => a.id === b.dataset.edit)));
  };
  return store.watchCol('addons', a => { list = a; draw(); }, () => { body.innerHTML = '<div class="empty">Konnte nicht geladen werden.</div>'; });
}

function addonCard(a) {
  const url = safeUrl(a.url);
  const kb = a.string ? Math.max(1, Math.round(a.string.length / 1024)) : 0;
  return `<div class="card addon-card ${a.cat === 'pflicht' ? 'must' : ''}">
    <div class="addon-top">
      <div class="addon-name">${esc(a.name)}</div>
      ${a.cat === 'pflicht' ? '<span class="addon-tag">Pflicht</span>' : ''}
      ${auth.isOfficer ? `<button class="icon-btn" data-edit="${esc(a.id)}" title="Bearbeiten">✎</button>` : ''}
    </div>
    ${a.desc ? `<div class="addon-desc">${md(a.desc)}</div>` : ''}
    <div class="addon-actions">
      ${url ? `<a class="btn btn-ghost btn-sm" href="${url}" target="_blank" rel="noopener">Download ↗</a>` : ''}
      ${a.string ? `<button class="btn btn-primary btn-sm" data-copy="${esc(a.id)}">⧉ String kopieren</button><span class="muted addon-size">${kb} KB</span>` : ''}
    </div>
    ${a.updated ? `<div class="addon-upd muted">Stand ${esc(fmtShort(a.updated.slice(0, 10)))}</div>` : ''}
  </div>`;
}

async function copy(text, btn) {
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch {}
    ta.remove();
  }
  if (!ok) { toast('Kopieren ging nicht – bitte manuell markieren', 'err'); return; }
  const old = btn.innerHTML;
  btn.innerHTML = '✓ Kopiert'; btn.disabled = true;
  setTimeout(() => { btn.innerHTML = old; btn.disabled = false; }, 1600);
  toast('String kopiert – ingame im Addon importieren');
}

function editAddon(a) {
  const form = h(`
    <div class="form-grid">
      <div class="field"><label>Name</label><input class="input" name="name" value="${esc(a?.name || '')}" placeholder="z. B. Plater Profil"></div>
      <div class="field"><label>Kategorie</label><select class="select" name="cat">${Object.entries(CATS).map(([k, c]) => `<option value="${k}" ${(a?.cat || 'empfohlen') === k ? 'selected' : ''}>${c.label}</option>`).join('')}</select></div>
      <div class="field full"><label>Download-Link <span class="muted">(CurseForge, Wago, …)</span></label><input class="input" name="url" value="${esc(a?.url || '')}" placeholder="https://…"></div>
      <div class="field full"><label>Beschreibung <span class="muted">(optional, - für Aufzählung, **fett**)</span></label><textarea class="textarea" name="desc" rows="3">${esc(a?.desc || '')}</textarea></div>
      <div class="field full"><label>Import-String <span class="muted">(optional – ingame exportieren und hier einfügen)</span></label><textarea class="textarea mono" name="string" rows="5" spellcheck="false">${esc(a?.string || '')}</textarea></div>
    </div>`);
  const acts = [{ label: 'Abbrechen' }];
  if (a) acts.unshift({ label: 'Löschen', cls: 'btn-danger', onClick: async () => {
    if (!(await confirmModal('Eintrag löschen?', `„${a.name}“ wird entfernt.`))) return true;
    await store.remove('addons', a.id); toast('Gelöscht');
  } });
  acts.push({ label: 'Speichern', cls: 'btn-primary', onClick: async () => {
    const v = n => form.querySelector(`[name=${n}]`).value.trim();
    if (!v('name')) { toast('Name fehlt', 'err'); return true; }
    if (v('url') && !safeUrl(v('url'))) { toast('Link muss mit https:// beginnen', 'err'); return true; }
    if (v('string').length > 900000) { toast('String ist zu groß (max. ca. 900 KB)', 'err'); return true; }
    const data = { name: v('name'), cat: v('cat'), url: v('url'), desc: v('desc'), string: v('string') };
    if (!a || a.string !== data.string || a.url !== data.url) data.updated = new Date().toISOString();
    if (a) await store.set('addons', a.id, data); else await store.add('addons', data);
    toast('Gespeichert');
  } });
  openModal({ title: a ? 'Addon bearbeiten' : 'Addon / Profil hinzufügen', body: form, wide: true, actions: acts });
}


// ── Sims (Bloodmallet) ───────────────────────────────────────
// Offizielle Einbettung laut bloodmallet.com/faq („All data is free to use for everyone“):
// <div class="bloodmallet_chart" data-wow-class=… data-wow-spec=…> + bm-charts.js
const BM_BASE = 'https://bloodmallet.com/static/general_website/';
const BM_CLASS = { DK: 'death_knight', DH: 'demon_hunter' };
const snake = s => String(s || '').toLowerCase().replace(/\s+/g, '_');
const BM_TYPES = { trinkets: 'Trinkets', phials: 'Phiolen', potions: 'Tränke', weapon_enchantments: 'Waffen-Verzauberungen', secondary_distributions: 'Sekundärwerte', races: 'Völker' };
const BM_FIGHT = { castingpatchwerk: '1 Ziel', castingpatchwerk3: '3 Ziele', castingpatchwerk5: '5 Ziele' };
// Farben wie auf bloodmallet.com (eine Farbe pro Itemlevel) – [Hintergrund, Schrift]
const BM_PAL = [['#7cb5ec', '#0d1520'], ['#8a8a96', '#111'], ['#90ed7d', '#0e1a0c'], ['#f7a35c', '#21130a'], ['#8085e9', '#0d0e22'], ['#f15c80', '#230a10'], ['#e4d354', '#1f1c08'], ['#2b908f', '#fff'], ['#f45b5b', '#230909'], ['#91e8e1', '#0b1d1c']];
let bmLoading = null;
// bm-charts.js braucht bm-utils.js davor; das Stylesheet muss absolut eingebunden werden (Skript sucht es sonst bei uns)
const addScript = src => new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = src; sc.onload = res; sc.onerror = rej; document.head.appendChild(sc); });
const loadBm = () => bmLoading ||= (async () => {
  if (!document.getElementById('bm-chart-styles')) document.head.insertAdjacentHTML('beforeend', `<link id="bm-chart-styles" rel="stylesheet" href="${BM_BASE}css/bm-charts.css">`);
  await addScript(BM_BASE + 'js/bm-utils.js');
  await addScript(BM_BASE + 'js/bm-charts.js');
})().catch(e => { bmLoading = null; throw e; });

function renderSims(body) {
  const saved = ls.get('pn-sims') || {};
  let st = { klasse: saved.klasse || '', spec: saved.spec || '', type: saved.type || 'trinkets', fight: saved.fight || 'castingpatchwerk',
    mode: saved.mode === 'trinket' && auth.isOfficer ? 'trinket' : saved.mode === 'pi' ? 'pi' : 'spec', item: saved.item || '', ilvl: saved.ilvl || 0, ours: saved.ours !== false, hide: Array.isArray(saved.hide) ? saved.hide : [], palette: saved.palette === 'cls' ? 'cls' : 'bm' };
  let players = [];
  body.innerHTML = `
    <div class="sims-mode seg" data-mode><button data-v="spec">Nach Spec</button><button data-v="pi">Power Infusion</button>${auth.isOfficer ? '<button data-v="trinket">Nach Trinket <span class="tab-offi">Offi</span></button>' : ''}</div>
    <div data-trinket hidden></div>
    <div data-pi hidden>
      <div class="card card-pad sims-controls">
        <div class="field"><label>Ziele</label><div class="seg" data-pfight>${Object.entries(BM_FIGHT).map(([k, v]) => `<button data-v="${k}">${v}</button>`).join('')}</div></div>
        <p class="hint" style="margin:0;flex:1;min-width:220px">Wie viel jede Spec von einer <a href="https://www.wowhead.com/de/spell=10060" target="_blank" rel="noopener">Seele der Macht</a> (Power Infusion) eines Priesters gewinnt – hilft bei der Frage, wer die PI bekommt.</p>
      </div>
      <div class="card sims-chart"><div data-pichart></div></div>
    </div>
    <div data-specview>
    <div class="card card-pad sims-controls">
      <div class="field"><label>Klasse</label><select class="select" data-k>${Object.entries(CLASSES).map(([k, c]) => `<option value="${k}">${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Spec</label><div class="sims-specs" data-specs></div></div>
      <div class="field"><label>Was</label><select class="select" data-type>${Object.entries(BM_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="field"><label>Ziele</label><div class="seg" data-fight>${Object.entries(BM_FIGHT).map(([k, v]) => `<button data-v="${k}">${v}</button>`).join('')}</div></div>
    </div>
    <div class="card sims-chart"><div class="sims-note">Angezeigt werden die <b>20 besten</b> Einträge.</div><div data-chart></div></div>
    </div>
    <p class="hint" style="margin-top:10px">Daten & Diagramm: <a href="https://bloodmallet.com" target="_blank" rel="noopener">bloodmallet.com</a> (SimulationCraft, „Casting Patchwerk“) – danke an Bloodmallet! Aktualisiert sich automatisch, sobald dort neu simuliert wird.</p>`;
  const $ = q => body.querySelector(q);
  const save = () => ls.set('pn-sims', st);

  // ── Modus „Nach Trinket“: ein Trinket wählen → alle Specs als Balken (% Gewinn) ──
  const tBox = $('[data-trinket]');
  let matrix = null;
  const setMode = () => {
    body.querySelectorAll('[data-mode] button').forEach(b => b.classList.toggle('on', b.dataset.v === st.mode));
    tBox.hidden = st.mode !== 'trinket'; $('[data-specview]').hidden = st.mode !== 'spec'; $('[data-pi]').hidden = st.mode !== 'pi';
    // Bloodmallet lädt jedes .bloodmallet_chart auf der Seite – das jeweils andere Diagramm leeren
    if (st.mode !== 'spec') $('[data-chart]').innerHTML = '';
    if (st.mode !== 'pi') $('[data-pichart]').innerHTML = '';
    if (st.mode === 'trinket') drawTrinket(); else if (st.mode === 'pi') drawPi(); else draw();
  };
  body.querySelectorAll('[data-mode] button').forEach(b => b.onclick = () => { st.mode = b.dataset.v === 'trinket' && !auth.isOfficer ? 'spec' : b.dataset.v; save(); setMode(); });
  // ── Power Infusion: ein Bloodmallet-Diagramm über alle Specs (liegt bei Bloodmallet unter priest/shadow) ──
  function drawPi() {
    body.querySelectorAll('[data-pfight] button').forEach(b => b.classList.toggle('on', b.dataset.v === st.fight));
    const box = $('[data-pichart]');
    box.innerHTML = `<div class="bloodmallet_chart" data-wow-class="priest" data-wow-spec="shadow" data-type="power_infusion" data-fight-style="${st.fight}"
      data-language="de" data-enable-title="true" data-enable-subtitle="true" data-enable-tooltips="true"><div class="loading">Lade Power-Infusion-Sims von Bloodmallet…</div></div>`;
    loadBm().then(() => { try { window.bm_import_charts?.(); } catch (e) { console.error(e); } })
      .catch(() => { box.innerHTML = `<div class="empty"><div class="big">📊</div>Bloodmallet ist gerade nicht erreichbar.<p class="muted" style="margin-top:8px"><a href="https://bloodmallet.com/chart/power_infusion" target="_blank" rel="noopener">Direkt auf bloodmallet.com öffnen ↗</a></p></div>`; });
  }
  body.querySelectorAll('[data-pfight] button').forEach(b => b.onclick = () => { st.fight = b.dataset.v; save(); drawPi(); });
  async function drawTrinket() {
    if (!matrix) {
      tBox.innerHTML = '<div class="card card-pad"><div class="loading" data-prog>Lade Sims aller Specs von Bloodmallet…</div></div>';
      try {
        matrix = await loadTrinketMatrix(st.fight, { onProgress: (n, t) => { const el = tBox.querySelector('[data-prog]'); if (el) el.textContent = `Lade Sims aller Specs von Bloodmallet… ${n}/${t}`; } });
      } catch {
        tBox.innerHTML = `<div class="card empty"><div class="big">📊</div>Bloodmallet ist gerade nicht erreichbar.</div>`; return;
      }
    }
    const items = matrix.items;
    if (!items.length) { tBox.innerHTML = '<div class="card empty">Keine Trinket-Daten gefunden.</div>'; return; }
    if (!items.some(i => i.key === st.item)) st.item = items[0].key;
    const it = items.find(i => i.key === st.item);
    const ourSpecs = new Set(players.filter(p => p.active !== false).map(p => `${p.klasse}|${p.spec}`));
    const levels = it.levels;
    // ausgeblendete Itemlevel (Klick auf die Legende) – mindestens eins bleibt sichtbar
    let hidden = new Set(st.hide.map(Number).filter(l => levels.includes(l)));
    if (hidden.size >= levels.length) hidden = new Set();
    let rows = matrix.stack(st.item).map(r => {
      const lv = r.levels.filter(l => !hidden.has(l.ilvl));
      return { ...r, levels: lv, top: lv.at(-1)?.pct ?? 0 };
    }).filter(r => r.levels.length).sort((a, b) => b.top - a.top);
    const total = rows.length;
    if (st.ours && ourSpecs.size) rows = rows.filter(r => ourSpecs.has(`${r.klasse}|${r.spec}`));
    const max = Math.max(0.1, ...rows.map(r => r.top));
    const fmt = v => (v > 0 ? '+' : '') + v.toLocaleString('de-AT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %';
    // Balken gestapelt: unterstes Itemlevel dunkel, jedes höhere Itemlevel heller (wie bei Bloodmallet)
    const shade = i => levels.length < 2 ? 1 : 0.22 + 0.78 * Math.pow(i / (levels.length - 1), 1.3);
    const segStyle = i => st.palette === 'bm' ? `--bg:${BM_PAL[i % BM_PAL.length][0]};--fg:${BM_PAL[i % BM_PAL.length][1]}` : `--a:${shade(i)}`;
    const bar = r => {
      let prev = 0;
      return r.levels.map(l => {
        const idx = levels.indexOf(l.ilvl), seg = Math.max(0, l.pct - prev); prev = Math.max(prev, l.pct);
        const w = seg / max * 100;
        return `<span class="bm-seg ${st.palette === 'bm' ? 'pal' : ''}" style="width:${w}%;${segStyle(idx)}" title="${l.ilvl}: ${fmt(l.pct)}"><em>${l.ilvl}</em></span>`;
      }).join('');
    };
    tBox.innerHTML = `
      <div class="card card-pad sims-controls">
        <div class="field bm-search" style="flex:1;min-width:240px"><label>Trinket <span class="muted">(${items.length})</span></label>
          <input class="input" data-item value="${esc(it.name)}" placeholder="🔍 Trinket suchen (Deutsch oder Englisch)…" autocomplete="off" spellcheck="false">
          <div class="bm-sugg" data-sugg hidden></div></div>
        <div class="field"><label>Farben</label><div class="seg" data-pal><button data-v="bm" class="${st.palette === 'bm' ? 'on' : ''}">Bloodmallet</button><button data-v="cls" class="${st.palette === 'cls' ? 'on' : ''}">Klassenfarbe</button></div></div>
        <div class="field"><label>Ziele</label><div class="seg" data-tfight>${Object.entries(BM_FIGHT).map(([k, v]) => `<button data-v="${k}" class="${k === st.fight ? 'on' : ''}">${v}</button>`).join('')}</div></div>
        <label class="check-row"><input type="checkbox" data-ours ${st.ours ? 'checked' : ''}> nur Specs aus unserem Roster</label>
      </div>
      <div class="card card-pad">
        <div class="bm-head"><div><div class="bm-title">${it.id ? `<a href="https://www.wowhead.com/de/item=${Number(it.id)}" target="_blank" rel="noopener">${esc(it.name)}</a>` : esc(it.name)}</div>
          <div class="hint">Mehr Schaden gegenüber keinem Trinket · ${esc(BM_FIGHT[st.fight])} · ${rows.length} von ${total} Specs</div></div>
          <div class="bm-legend" title="Klicken zum Aus-/Einblenden">${levels.map((l, i) => `<button class="${hidden.has(l) ? 'off' : ''}" data-lv="${l}"><i class="${st.palette === 'bm' ? 'pal' : ''}" style="${segStyle(i)}"></i>${l}</button>`).join('')}</div></div>
        <div class="bm-bars">${rows.map(r => `
          <div class="bm-row ${ourSpecs.has(`${r.klasse}|${r.spec}`) ? 'ours' : ''}" style="--cls:${clsColor(r.klasse)}">
            <span class="bm-spec">${specIcon(r.klasse, r.spec) ? `<img src="${specIcon(r.klasse, r.spec)}" alt="">` : ''}<b>${esc(r.spec)}</b><small>${esc(CLASSES[r.klasse]?.name || '')}</small></span>
            <div class="bm-bar stack">${bar(r)}</div>
            <span class="bm-val ${r.top < 0 ? 'neg' : ''}" title="${r.levels.map(l => `${l.ilvl}: ${fmt(l.pct)}`).join(' · ')}">${fmt(r.top)}</span>
          </div>`).join('') || '<p class="muted">Keine Specs aus dem Roster mit Daten für dieses Trinket.</p>'}</div>
        <p class="hint" style="margin-top:10px">Balken-Abschnitte = Itemlevel (dunkel → hell = niedrig → hoch). Klick auf ein Itemlevel oben rechts blendet es aus. Zahl rechts = höchstes sichtbares Itemlevel. Maus drauf zeigt alle Werte.${matrix.updated ? ` · Stand Bloodmallet: ${esc(String(matrix.updated).slice(0, 16).replace('T', ' '))}` : ''}</p>
      </div>`;
    // Trinket-Suche: tippen filtert, Pfeiltasten + Enter oder Klick wählt
    const inp = tBox.querySelector('[data-item]'), sugg = tBox.querySelector('[data-sugg]');
    let hits = [], cur = 0;
    const norm = v => v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const showSugg = () => {
      const q = norm(inp.value.trim());
      hits = items.filter(i => !q || norm(i.name).includes(q) || norm(i.en || '').includes(q)).slice(0, 40);   // Deutsch oder Englisch
      cur = Math.min(cur, Math.max(0, hits.length - 1));
      sugg.innerHTML = hits.length ? hits.map((i, n) => `<button type="button" class="${n === cur ? 'cur' : ''} ${i.key === st.item ? 'sel' : ''}" data-k="${esc(i.key)}"><span>${esc(i.name)}${i.en && i.en !== i.name ? `<i>${esc(i.en)}</i>` : ''}</span><small>${i.levels.at(-1)}</small></button>`).join('') : '<p class="muted">Kein Trinket gefunden</p>';
      sugg.hidden = false;
      sugg.querySelector('.cur')?.scrollIntoView({ block: 'nearest' });
      sugg.querySelectorAll('[data-k]').forEach(b => b.onmousedown = e => { e.preventDefault(); pick(b.dataset.k); });
    };
    const pick = k => { st.item = k; save(); drawTrinket(); };
    inp.onfocus = () => { inp.select(); cur = 0; inp.dataset.q = ''; hits = items; showSugg(); };
    inp.oninput = () => { cur = 0; showSugg(); };
    inp.onblur = () => setTimeout(() => { sugg.hidden = true; inp.value = it.name; }, 120);
    inp.onkeydown = e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); cur = Math.min(hits.length - 1, cur + 1); showSugg(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); cur = Math.max(0, cur - 1); showSugg(); }
      else if (e.key === 'Enter' && hits[cur]) { e.preventDefault(); pick(hits[cur].key); }
      else if (e.key === 'Escape') inp.blur();
    };
    tBox.querySelectorAll('[data-pal] button').forEach(b => b.onclick = () => { st.palette = b.dataset.v; save(); drawTrinket(); });
    tBox.querySelectorAll('[data-tfight] button').forEach(b => b.onclick = () => { if (st.fight !== b.dataset.v) { st.fight = b.dataset.v; matrix = null; save(); drawTrinket(); } });
    tBox.querySelector('[data-ours]').onchange = e => { st.ours = e.target.checked; save(); drawTrinket(); };
    tBox.querySelectorAll('[data-lv]').forEach(b => b.onclick = () => {
      const l = Number(b.dataset.lv), set = new Set(st.hide.map(Number));
      set.has(l) ? set.delete(l) : set.add(l);
      if (levels.every(x => set.has(x))) return;          // nicht alles ausblenden
      st.hide = [...set]; save(); drawTrinket();
    });
  }

  const draw = () => {
    const c = CLASSES[st.klasse] || CLASSES.Warrior;
    if (!c.specs.includes(st.spec)) st.spec = c.specs[0];
    $('[data-k]').value = st.klasse;
    $('[data-type]').value = st.type;
    $('[data-specs]').innerHTML = c.specs.map(sp => `<button class="apply-spec ${sp === st.spec ? 'sel' : ''}" data-s="${esc(sp)}" style="--cls:${clsColor(st.klasse)}">${specIcon(st.klasse, sp) ? `<img src="${specIcon(st.klasse, sp)}" alt="">` : ''}${esc(sp)}</button>`).join('');
    $('[data-specs]').querySelectorAll('[data-s]').forEach(b => b.onclick = () => { st.spec = b.dataset.s; save(); draw(); });
    body.querySelectorAll('[data-fight] button').forEach(b => b.classList.toggle('on', b.dataset.v === st.fight));
    const box = $('[data-chart]');
    box.innerHTML = `<div class="bloodmallet_chart" data-wow-class="${BM_CLASS[st.klasse] || snake(st.klasse)}" data-wow-spec="${snake(st.spec)}" data-type="${st.type}"
      data-fight-style="${st.fight}" data-show-top="20" data-language="de" data-enable-title="true" data-enable-subtitle="true" data-enable-tooltips="true">
      <div class="loading">Lade Simulation von Bloodmallet…</div></div>`;
    loadBm().then(() => { try { window.bm_import_charts?.(); } catch (e) { console.error(e); } })
      .catch(() => { box.innerHTML = `<div class="empty"><div class="big">📊</div>Bloodmallet ist gerade nicht erreichbar.<p class="muted" style="margin-top:8px"><a href="https://bloodmallet.com/chart/${BM_CLASS[st.klasse] || snake(st.klasse)}/${snake(st.spec)}/${st.type}/${st.fight}" target="_blank" rel="noopener">Direkt auf bloodmallet.com öffnen ↗</a></p></div>`; });
  };
  $('[data-k]').onchange = e => { st.klasse = e.target.value; st.spec = ''; save(); draw(); };
  $('[data-type]').onchange = e => { st.type = e.target.value; save(); draw(); };
  body.querySelectorAll('[data-fight] button').forEach(b => b.onclick = () => { st.fight = b.dataset.v; save(); draw(); });

  // Standard: eigene Klasse/Spec (über den Discord-Namen), sonst Warrior
  return store.watchCol('players', ps => {
    const first = !players.length; players = ps;
    if (first && !st.klasse) { const me = matchPlayer(ps.filter(p => p.active !== false), auth.user?.name); st.klasse = me?.klasse || 'Warrior'; st.spec = me?.spec || ''; }
    if (first) setMode();
  });
}
