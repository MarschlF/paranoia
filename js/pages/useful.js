// ─────────────────────────────────────────────────────────────
//  Nützliches (Intern) – drei Tabs
//  · Links             settings/main.links
//  · Addons & Profile  addons/<id> { name, cat, desc, url, string, updated }
//  · Neu bei uns       addons/_onboarding { text }  + Pflicht-Addons als Checkliste
//  Lesen: alle Raider · Bearbeiten: Offis
// ─────────────────────────────────────────────────────────────
import { store, auth } from '../store.js';
import { esc, h, openModal, toast, safeUrl, md, confirmModal, fmtShort } from '../ui.js';

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
  const tab = params[0] === 'addons' ? 'addons' : params[0] === 'neu' ? 'neu' : 'links';
  const el = h(`
    <div class="container page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Intern</div>
          <h2 class="page-title">Nützliches</h2>
          <p class="page-sub">${tab === 'addons' ? 'Addons und Profile, die wir im Raid nutzen – Strings mit einem Klick kopieren und ingame importieren.'
            : tab === 'neu' ? 'Alles, was du als neuer Raider wissen musst.' : 'Tools, Links und Ressourcen für den Raid.'}</p>
        </div>
        <div class="page-actions" data-actions></div>
      </div>
      <div class="guide-tabs">
        <a class="guide-tab ${tab === 'links' ? 'active' : ''}" href="#/nuetzliches">Links</a>
        <a class="guide-tab ${tab === 'addons' ? 'active' : ''}" href="#/nuetzliches/addons">Addons & Profile</a>
        <a class="guide-tab ${tab === 'neu' ? 'active' : ''}" href="#/nuetzliches/neu">Neu bei uns</a>
      </div>
      <div data-body><div class="loading">Lade…</div></div>
    </div>`);
  root.appendChild(el);
  const actions = el.querySelector('[data-actions]');
  const body = el.querySelector('[data-body]');
  if (tab === 'addons') return renderAddons(body, actions);
  if (tab === 'neu') return renderOnboarding(body, actions);
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

// ── Neu bei uns ──────────────────────────────────────────────
function renderOnboarding(body, actions) {
  if (auth.isOfficer) {
    actions.innerHTML = '<button class="btn btn-ghost" data-edit>✎ Text bearbeiten</button>';
  }
  const doneKey = `pn-onb-${auth.user?.uid || 'x'}`;
  let list = null;
  const draw = () => {
    if (!list) return;
    const onb = list.find(a => a.id === ONB);
    const must = list.filter(a => a.id !== ONB && a.cat === 'pflicht').sort((a, b) => a.name.localeCompare(b.name));
    const done = new Set(ls.get(doneKey) || []);
    const n = must.filter(a => done.has(a.id)).length;
    body.innerHTML = `<div class="onb-grid">
      <div class="card onb-text prose">${onb?.text ? md(onb.text) : `<p class="muted">Noch kein Text.${auth.isOfficer ? ' Oben rechts „Text bearbeiten“ – z. B. Raidzeiten, Regeln, Ansprechpartner, Loot-System.' : ''}</p>`}</div>
      <div class="card onb-check">
        <div class="onb-check-head"><h3>Pflicht-Addons</h3>${must.length ? `<span class="${n === must.length ? 'ok' : 'muted'}">${n} / ${must.length}</span>` : ''}</div>
        ${must.length ? must.map(a => {
          const url = safeUrl(a.url);
          return `<label class="onb-item ${done.has(a.id) ? 'done' : ''}">
            <input type="checkbox" data-id="${esc(a.id)}" ${done.has(a.id) ? 'checked' : ''}>
            <span>${esc(a.name)}</span>
            ${url ? `<a href="${url}" target="_blank" rel="noopener" title="Download">↗</a>` : ''}
          </label>`;
        }).join('') : '<p class="muted">Keine Pflicht-Addons eingetragen.</p>'}
        <p class="hint" style="margin-top:10px">Abhaken ist nur für dich – wird in deinem Browser gemerkt. Profile & Strings unter <a href="#/nuetzliches/addons">Addons & Profile</a>.</p>
      </div>
    </div>`;
    body.querySelectorAll('[data-id]').forEach(cb => cb.onchange = () => {
      const s = new Set(ls.get(doneKey) || []);
      cb.checked ? s.add(cb.dataset.id) : s.delete(cb.dataset.id);
      ls.set(doneKey, [...s]); draw();
    });
  };
  actions.querySelector('[data-edit]')?.addEventListener('click', () => {
    const onb = list?.find(a => a.id === ONB);
    const form = h(`<div class="field full"><label>Text für neue Raider <span class="muted">(### Überschrift, - Aufzählung, **fett**, &gt; Hinweisbox)</span></label>
      <textarea class="textarea" name="text" rows="16">${esc(onb?.text || '')}</textarea></div>`);
    openModal({ title: 'Neu bei uns – Text', body: form, wide: true, actions: [{ label: 'Abbrechen' }, { label: 'Speichern', cls: 'btn-primary', onClick: async () => {
      await store.set('addons', ONB, { text: form.querySelector('[name=text]').value });
      toast('Gespeichert');
    } }] });
  });
  return store.watchCol('addons', a => { list = a; draw(); }, () => { body.innerHTML = '<div class="empty">Konnte nicht geladen werden.</div>'; });
}
