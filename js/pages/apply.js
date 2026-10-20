// ─────────────────────────────────────────────────────────────
//  Bewerben – öffentliches Formular (kein Login nötig)
//  Speichert in applications/<auto-id>. Lesen dürfen nur Offiziere.
//  „Wir suchen“ kommt aus settings/main.recruit { open, text, classes[] }
// ─────────────────────────────────────────────────────────────
import { store } from '../store.js';
import { CONFIG, DEMO_MODE } from '../config.js';
import { CLASSES, clsColor, clsName, esc, h, toast, specIcon } from '../ui.js';
import { classIconUrl } from '../classstrip.js';

export const LIMITS = { char: 24, realm: 40, offspec: 60, discord: 40, exp: 2000, why: 2000, avail: 300, other: 1500, logs: 300 };

export function render(root) {
  const el = h(`
    <div class="container page apply-page">
      <div class="apply-hero">
        <div class="apply-hero-txt">
          <div class="eyebrow">Recruitment</div>
          <h2 class="page-title">Bewirb dich bei Paranøia</h2>
          <p class="page-sub">Mythic-Raidgilde auf EU Todeswache · Horde. Füll das Formular aus – wir melden uns über Discord bei dir.</p>
        </div>
        <img class="apply-logo" src="assets/logo.webp" alt="">
      </div>
      <div class="apply-grid">
        <aside class="apply-side" data-side><div class="loading">…</div></aside>
        <form class="card apply-form" data-form novalidate>
          <div class="apply-sec">
            <div class="apply-sec-title"><span>1</span>Dein Charakter</div>
            <div class="form-grid">
              <div class="field"><label>Charaktername *</label><input class="input" name="char" maxlength="${LIMITS.char}" placeholder="wie ingame" autocomplete="off" required></div>
              <div class="field"><label>Realm *</label><input class="input" name="realm" maxlength="${LIMITS.realm}" placeholder="z. B. Todeswache" autocomplete="off" required></div>
              <div class="field full"><label>Klasse *</label><div class="apply-classes" data-classes>
                ${Object.entries(CLASSES).map(([k, c]) => `<button type="button" class="apply-cls" data-k="${k}" style="--cls:${c.color}" title="${esc(c.name)}"><img src="${classIconUrl(k)}" alt="" data-fb="${esc(specIcon(k, c.specs[0]) || '')}"><span>${esc(c.name)}</span></button>`).join('')}
              </div></div>
              <div class="field full"><label>Spec *</label><div class="apply-specs" data-specs><span class="muted">Erst Klasse wählen</span></div></div>
              <div class="field full"><label>Offspec / Twinks <span class="muted">(optional)</span></label><input class="input" name="offspec" maxlength="${LIMITS.offspec}" placeholder="z. B. Resto als Offspec, Mage-Twink"></div>
            </div>
          </div>
          <div class="apply-sec">
            <div class="apply-sec-title"><span>2</span>Erfahrung</div>
            <div class="form-grid">
              <div class="field full"><label>Bisherige Gilden & Mythic-Progress *</label><textarea class="input" name="exp" rows="4" maxlength="${LIMITS.exp}" placeholder="Welche Gilden, welcher Progress, in welcher Rolle?" required></textarea></div>
              <div class="field full"><label>Warum Paranøia? *</label><textarea class="input" name="why" rows="3" maxlength="${LIMITS.why}" placeholder="Was suchst du, was erwartest du von uns?" required></textarea></div>
              <div class="field full"><label>Logs <span class="muted">(optional – Warcraft Logs o. Ä., wird sonst automatisch verlinkt)</span></label><input class="input" name="logs" maxlength="${LIMITS.logs}" placeholder="https://www.warcraftlogs.com/…"></div>
            </div>
          </div>
          <div class="apply-sec">
            <div class="apply-sec-title"><span>3</span>Kontakt & Zeit</div>
            <div class="form-grid">
              <div class="field"><label>Discord-Name *</label><input class="input" name="discord" maxlength="${LIMITS.discord}" placeholder="z. B. marschl" autocomplete="off" required></div>
              <div class="field"><label>Raidtage</label><label class="check-row apply-check"><input type="checkbox" name="allDays" checked> <span data-days>Ich kann an allen Raidtagen</span></label></div>
              <div class="field full"><label>Einschränkungen <span class="muted">(optional)</span></label><input class="input" name="avail" maxlength="${LIMITS.avail}" placeholder="z. B. Schichtdienst, jeden 2. Donnerstag später"></div>
              <div class="field full"><label>Sonst noch etwas? <span class="muted">(optional)</span></label><textarea class="input" name="other" rows="2" maxlength="${LIMITS.other}"></textarea></div>
              <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
            </div>
          </div>
          <label class="check-row apply-consent"><input type="checkbox" name="consent"> Ich bin einverstanden, dass die Offiziere von Paranøia meine Angaben zur Bearbeitung der Bewerbung speichern. Details in der <a href="#/rechtliches" target="_blank">Datenschutzerklärung</a>; abgeschlossene Bewerbungen werden nach spätestens 6 Monaten gelöscht. *</label>
          <div class="apply-foot">
            <span class="muted" data-msg>* Pflichtfeld</span>
            <button class="btn btn-primary btn-lg" type="submit" data-send>Bewerbung absenden</button>
          </div>
        </form>
      </div>
    </div>`);
  root.appendChild(el);
  const $ = s => el.querySelector(s);
  const form = $('[data-form]');
  let klasse = '', spec = '';

  el.querySelectorAll('img[data-fb]').forEach(im => im.onerror = () => { if (im.dataset.fb) { im.src = im.dataset.fb; im.dataset.fb = ''; } });

  const drawSpecs = () => {
    el.querySelectorAll('.apply-cls').forEach(b => b.classList.toggle('sel', b.dataset.k === klasse));
    $('[data-specs]').innerHTML = klasse ? CLASSES[klasse].specs.map(s => `<button type="button" class="apply-spec ${s === spec ? 'sel' : ''}" data-s="${esc(s)}" style="--cls:${clsColor(klasse)}">
      ${specIcon(klasse, s) ? `<img src="${specIcon(klasse, s)}" alt="">` : ''}${esc(s)}</button>`).join('') : '<span class="muted">Erst Klasse wählen</span>';
    $('[data-specs]').querySelectorAll('[data-s]').forEach(b => b.onclick = () => { spec = b.dataset.s; drawSpecs(); });
  };
  el.querySelectorAll('.apply-cls').forEach(b => b.onclick = () => { if (klasse !== b.dataset.k) spec = ''; klasse = b.dataset.k; if (CLASSES[klasse].specs.length === 1) spec = CLASSES[klasse].specs[0]; drawSpecs(); });

  form.onsubmit = async e => {
    e.preventDefault();
    const v = n => (form.elements[n]?.value || '').trim();
    if (v('website')) return;                                   // Spam-Falle
    const miss = [];
    if (v('char').length < 2) miss.push('Charaktername');
    if (v('realm').length < 2) miss.push('Realm');
    if (!klasse) miss.push('Klasse');
    if (!spec) miss.push('Spec');
    if (v('discord').length < 2) miss.push('Discord-Name');
    if (v('exp').length < 5) miss.push('Erfahrung');
    if (v('why').length < 5) miss.push('Warum Paranøia');
    if (!form.elements.consent.checked) miss.push('Einverständnis');
    form.querySelectorAll('.invalid').forEach(x => x.classList.remove('invalid'));
    if (miss.length) {
      ['char', 'realm', 'discord', 'exp', 'why'].forEach(n => { if (v(n).length < (n === 'exp' || n === 'why' ? 5 : 2)) form.elements[n].classList.add('invalid'); });
      if (!klasse) $('[data-classes]').classList.add('invalid'); if (!spec) $('[data-specs]').classList.add('invalid');
      if (!form.elements.consent.checked) form.querySelector('.apply-consent').classList.add('invalid');
      $('[data-msg]').textContent = `Fehlt noch: ${miss.join(', ')}`; $('[data-msg]').className = 'err-txt';
      return;
    }
    const logs = v('logs');
    const data = {
      char: v('char'), realm: v('realm'), klasse, spec, offspec: v('offspec'), discord: v('discord'),
      exp: v('exp'), why: v('why'), logs: /^https?:\/\//i.test(logs) ? logs : '',
      allDays: form.elements.allDays.checked, avail: v('avail'), other: v('other'),
      consent: true, status: 'neu', at: new Date().toISOString(),
    };
    const btn = $('[data-send]'); btn.disabled = true; btn.textContent = 'Wird gesendet…';
    try {
      const id = await store.add('applications', data);
      // Offis im Discord benachrichtigen (Worker liest die Bewerbung selbst aus der Datenbank)
      if (!DEMO_MODE && CONFIG.authWorkerUrl && id) fetch(`${CONFIG.authWorkerUrl.replace(/\/$/, '')}/apply/notify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
      }).catch(() => {});
      try { localStorage.setItem('pn-applied', data.at); } catch {}
      done(data);
    } catch (err) {
      console.error(err);
      btn.disabled = false; btn.textContent = 'Bewerbung absenden';
      toast('Senden fehlgeschlagen – bitte später nochmal oder direkt auf Discord melden', 'err');
    }
  };

  function done(d) {
    form.outerHTML = `<div class="card apply-done">
      <div class="apply-done-ico">✓</div>
      <h3>Danke, ${esc(d.char)}!</h3>
      <p>Deine Bewerbung ist bei uns angekommen. Die Offiziere schauen sie sich an und melden sich über Discord bei <b>${esc(d.discord)}</b>.</p>
      <a class="btn btn-ghost" href="#/">Zur Startseite</a>
    </div>`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Seitenleiste: Wir suchen + Raidzeiten
  const WDL = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const un = store.watchDoc('settings', 'main', s => {
    s = s || {};
    const rec = s.recruit || {};
    const days = (s.raidWeekdays || []).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => WDL[d]);
    const time = s.raidStart ? `${s.raidStart}${s.raidEnd ? ` – ${s.raidEnd}` : ''} Uhr` : '';
    if (days.length) $('[data-days]').textContent = `Ich kann an allen Raidtagen (${days.map(d => d.slice(0, 2)).join(' / ')})`;
    $('[data-side]').innerHTML = `
      <div class="card apply-card">
        <div class="hi-title">Wir suchen</div>
        <div class="apply-status ${rec.open === false ? 'closed' : ''}"><span class="hi-dot"></span>${rec.open === false ? 'Aktuell nur Ausnahmen' : 'Recruitment offen'}</div>
        ${(rec.classes || []).length ? `<div class="apply-want">${rec.classes.map(k => `<span class="apply-want-c" style="--cls:${clsColor(k)}" title="${esc(clsName(k))}"><img src="${classIconUrl(k)}" alt="" data-fb="${esc(specIcon(k, CLASSES[k]?.specs[0]) || '')}"><em>${esc(clsName(k))}</em></span>`).join('')}</div>` : ''}
        ${rec.text ? `<p class="apply-want-txt">${esc(rec.text)}</p>` : (rec.classes || []).length ? '' : '<p class="apply-want-txt">Starke Spieler jeder Klasse sind willkommen.</p>'}
      </div>
      <div class="card apply-card">
        <div class="hi-title">Raidzeiten</div>
        <div class="hi-big">${esc(days.join(' · ') || '–')}</div>
        ${time ? `<div class="hi-sub">${esc(time)}</div>` : ''}
      </div>
      <div class="card apply-card apply-steps">
        <div class="hi-title">So läuft's ab</div>
        <ol><li>Formular absenden</li><li>Wir schauen uns Logs & Raider.IO an</li><li>Kurzes Gespräch auf Discord</li><li>Trial-Raids mit uns</li></ol>
      </div>`;
    $('[data-side]').querySelectorAll('img[data-fb]').forEach(im => im.onerror = () => { if (im.dataset.fb) { im.src = im.dataset.fb; im.dataset.fb = ''; } });
  });
  return () => un();
}
