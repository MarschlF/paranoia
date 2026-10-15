import { store, auth } from '../store.js';
import { esc, h, openModal, toast, safeUrl } from '../ui.js';

export function render(root) {
  const el = h(`
    <div class="container page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Intern</div>
          <h2 class="page-title">Nützliches</h2>
          <p class="page-sub">Tools, Links und Ressourcen für den Raid.</p>
        </div>
        <div class="page-actions">${auth.isOfficer ? '<button class="btn btn-primary" data-add>+ Link</button>' : ''}
          ${store.demo ? '<button class="btn btn-ghost" data-reset title="Demo-Daten zurücksetzen">Demo zurücksetzen</button>' : ''}</div>
      </div>
      <div class="link-grid" data-grid><div class="loading">Lade…</div></div>
    </div>`);
  root.appendChild(el);

  let settings = {};
  el.querySelector('[data-reset]')?.addEventListener('click', () => store.resetDemo());
  el.querySelector('[data-add]')?.addEventListener('click', () => {
    const form = h(`
      <div class="form-grid">
        <div class="field"><label>Name</label><input class="input" name="name"></div>
        <div class="field"><label>Icon (Emoji)</label><input class="input" name="icon" value="🔗"></div>
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
    const grid = el.querySelector('[data-grid]');
    grid.innerHTML = links.length ? '' : '<div class="empty">Noch keine Links.</div>';
    links.forEach((l, i) => {
      const url = safeUrl(l.url);
      const card = h(`
        <a class="card link-card" href="${url || '#'}" target="_blank" rel="noopener">
          <div class="ico">${esc(l.icon || '🔗')}</div>
          <div><div class="nm">${esc(l.name)}</div><div class="ds">${esc(l.desc || '')}</div></div>
          ${auth.isOfficer ? '<button class="icon-btn del" title="Entfernen">✕</button>' : ''}
        </a>`);
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
