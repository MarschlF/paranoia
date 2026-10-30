// ─────────────────────────────────────────────────────────────
//  Impressum (Offenlegung) & Datenschutz – öffentlich
//  Name, Wohnort und Kontakt kommen aus settings/main.legal { name, ort, mail } (Offis bearbeiten hier)
// ─────────────────────────────────────────────────────────────
import { store, auth } from '../store.js';
import { esc, h, openModal, toast } from '../ui.js';

export const APP_RETENTION_DAYS = 180;   // abgeschlossene Bewerbungen werden danach gelöscht (applications.js)

export function render(root) {
  const el = h(`
    <div class="container page legal-page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Rechtliches</div>
          <h2 class="page-title">Impressum & Datenschutz</h2>
          <p class="page-sub">Wer hinter der Seite steht und was mit deinen Daten passiert.</p>
        </div>
        <div class="page-actions">${auth.isOfficer ? '<button class="btn btn-ghost" data-edit>Angaben bearbeiten</button>' : ''}</div>
      </div>
      <div data-body><div class="loading">…</div></div>
    </div>`);
  root.appendChild(el);
  let legal = {};
  el.querySelector('[data-edit]')?.addEventListener('click', () => edit(legal));

  const un = store.watchDoc('settings', 'main', s => { legal = s?.legal || {}; draw(); });
  function draw() {
    const ph = t => `<span class="legal-ph">[${t}]</span>`;
    const name = legal.name ? esc(legal.name) : ph('Name eintragen');
    const ort = legal.ort ? esc(legal.ort) : ph('Wohnort eintragen');
    const mail = legal.mail ? `<a href="mailto:${esc(legal.mail)}">${esc(legal.mail)}</a>` : ph('Kontakt-E-Mail eintragen');
    const missing = !legal.name || !legal.ort || !legal.mail;
    el.querySelector('[data-body]').innerHTML = `
      ${missing && auth.isOfficer ? `<div class="legal-warn">Noch nicht vollständig: Bitte über „Angaben bearbeiten“ Name, Wohnort und eine Kontakt-Mail eintragen.</div>` : ''}
      <div class="legal-grid">
        <nav class="legal-toc card">
          <a href="#/rechtliches" data-jump="impressum">Offenlegung</a>
          <a href="#/rechtliches" data-jump="ds">Datenschutz</a>
          <a href="#/rechtliches" data-jump="ds-bewerb">Bewerbungen</a>
          <a href="#/rechtliches" data-jump="ds-dienste">Eingebundene Dienste</a>
          <a href="#/rechtliches" data-jump="ds-rechte">Deine Rechte</a>
        </nav>
        <div class="legal-body card">
          <section id="impressum">
            <h3>Offenlegung gemäß § 25 Mediengesetz</h3>
            <dl class="legal-dl">
              <dt>Medieninhaber</dt><dd>${name}, ${ort}</dd>
              <dt>Kontakt</dt><dd>${mail}</dd>
              <dt>Grundlegende Richtung</dt><dd>Private, nicht-kommerzielle Website der World-of-Warcraft-Gilde Paranøia (EU-Todeswache). Informationen für Mitglieder und Interessenten rund um Raids, Roster und Progress.</dd>
            </dl>
            <p class="muted">World of Warcraft, Warcraft und Blizzard Entertainment sind Marken oder eingetragene Marken von Blizzard Entertainment, Inc. Diese Seite steht in keiner Verbindung zu Blizzard. Spielgrafiken und Icons gehören den jeweiligen Rechteinhabern.</p>
          </section>

          <section id="ds">
            <h3>Datenschutzerklärung</h3>
            <h4>Verantwortlich</h4>
            <p>${name}, ${ort} · ${mail}</p>
            <h4>Kurz gesagt</h4>
            <ul>
              <li>Keine Werbung, kein Tracking, keine Analyse-Tools, keine Weitergabe oder Verkauf von Daten.</li>
              <li>Wir speichern nur, was für die Gilde nötig ist: Ingame-Charaktere, Raid-Planung und Bewerbungen.</li>
              <li>Beim Aufruf jeder Website wird technisch bedingt deine IP-Adresse an den Server übertragen, der die Seite ausliefert.</li>
            </ul>

            <h4>Hosting</h4>
            <p>Die Seite wird über <b>GitHub Pages</b> (GitHub Inc., USA) ausgeliefert. Dabei verarbeitet GitHub technisch notwendige Zugriffsdaten wie IP-Adresse, Zeitpunkt und Browser, um die Seite bereitzustellen und vor Missbrauch zu schützen. Rechtsgrundlage: berechtigtes Interesse am Betrieb der Website (Art. 6 Abs. 1 lit. f DSGVO).</p>

            <h4>Datenbank & Login</h4>
            <p>Inhalte wie Roster, Progress, Raid-Planung und Bewerbungen liegen in <b>Google Firebase</b> (Google Ireland Ltd. / Google LLC). Für Logins und Datenabfragen (z. B. von Warcraft Logs) nutzen wir einen Dienst bei <b>Cloudflare</b> (Cloudflare Inc.).</p>
            <p>Der Mitglieder-Bereich nutzt den <b>Login mit Discord</b>. Dabei erhalten wir von Discord deine Discord-ID, deinen Anzeigenamen, dein Profilbild und ob du Mitglied (bzw. Offizier) auf unserem Gilden-Discord bist. Damit wird nur geprüft, was du sehen darfst. Für die Online-Anzeige speichern wir zusätzlich, wann du zuletzt auf der Seite warst. Rechtsgrundlage: deine Mitgliedschaft in der Gilde bzw. dein Login (Art. 6 Abs. 1 lit. b und f DSGVO).</p>
            <p>Google, GitHub und Cloudflare können Daten auch in den USA verarbeiten. Alle drei sind unter dem EU-US Data Privacy Framework zertifiziert.</p>

            <h4>Roster, Progress & Logs</h4>
            <p>Angezeigt werden Ingame-Charakternamen sowie öffentlich abrufbare Spieldaten (Ausrüstung, Wertungen, Kampf-Logs) von Raider.IO, Warcraft Logs und Blizzard. Für die Raidplanung sehen Offiziere außerdem eure Raid-Anmeldungen und M+ Daten aus <b>wowaudit</b> sowie, wer laut Log an einem Abend dabei war. Möchtest du nicht im öffentlichen Roster stehen, sag einem Offizier Bescheid.</p>
            <p>Zur Raidplanung halten die Offiziere intern kurze Einschätzungen zu Raidern fest (Schulnote und optional ein Kommentar, z. B. zur Mechanik-Ausführung). Das sehen nur die Offiziere und es wird nicht veröffentlicht. Auf Nachfrage sagen wir dir gern, was über dich vermerkt ist (Art. 6 Abs. 1 lit. f DSGVO).</p>
          </section>

          <section id="ds-bewerb">
            <h4>Bewerbungen</h4>
            <p>Wenn du dich über das Formular bewirbst, speichern wir deine Angaben: Charakter, Realm, Klasse/Spec, Discord-Name, deine Texte zu Erfahrung, Motivation und Verfügbarkeit sowie den Zeitpunkt. Lesen können das nur die Offiziere. Bei einer neuen Bewerbung bekommen die Offiziere eine kurze Benachrichtigung in ihrem internen Discord-Kanal (Discord Inc., USA).</p>
            <p>Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), die du jederzeit per Nachricht an uns widerrufen kannst. Abgeschlossene Bewerbungen (angenommen oder abgelehnt) werden nach spätestens <b>${Math.round(APP_RETENTION_DAYS / 30)} Monaten</b> automatisch gelöscht, auf Wunsch auch sofort. Wirst du aufgenommen, übernehmen wir nur deinen Charakter ins Roster.</p>
          </section>

          <section id="ds-dienste">
            <h4>Eingebundene Dienste</h4>
            <p>Einige Inhalte werden direkt von anderen Anbietern geladen. Dabei erhält der jeweilige Anbieter deine IP-Adresse:</p>
            <ul>
              <li><b>Wowhead</b> (Item-Tooltips und Icons): wowhead.com / zamimg.com</li>
              <li><b>Warcraft Logs</b> (Boss-Bilder): rpglogs.com</li>
              <li><b>Bloodmallet</b> (Sim-Diagramme unter „Nützliches“): bloodmallet.com</li>
              <li><b>YouTube</b> (Raid-VoDs, nur für Offiziere, im erweiterten Datenschutzmodus über youtube-nocookie.com)</li>
            </ul>
            <p>Schriften liegen direkt auf dieser Seite, es werden keine Google Fonts geladen.</p>
            <h4>Speicher im Browser</h4>
            <p>Die Seite merkt sich im Speicher deines Browsers (localStorage) ein paar Einstellungen, z. B. bereits gelesene Hinweise oder zwischengespeicherte Sim-Daten. Das bleibt auf deinem Gerät und dient keinem Tracking. Firebase legt für den Login ein eigenes Anmelde-Token ab und speichert bereits geladene Inhalte zwischen, damit die Seite schneller lädt. Beim Abmelden wird dieser Zwischenspeicher gelöscht.</p>
          </section>

          <section id="ds-rechte">
            <h4>Deine Rechte</h4>
            <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch. Schreib uns dafür einfach an ${mail} oder einen Offizier im Discord.</p>
            <p>Du kannst dich außerdem bei der österreichischen Datenschutzbehörde beschweren: <a href="https://www.dsb.gv.at" target="_blank" rel="noopener">dsb.gv.at</a>.</p>
          </section>
        </div>
      </div>`;
    el.querySelectorAll('[data-jump]').forEach(a => a.onclick = e => { e.preventDefault(); el.querySelector('#' + a.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }
  return () => un();
}

function edit(legal) {
  const form = h(`<div class="form-grid">
    <div class="field full"><label>Name (Medieninhaber)</label><input class="input" name="name" value="${esc(legal.name || '')}" placeholder="Vor- und Nachname"></div>
    <div class="field"><label>Wohnort</label><input class="input" name="ort" value="${esc(legal.ort || '')}" placeholder="z. B. Graz"></div>
    <div class="field"><label>Kontakt-E-Mail</label><input class="input" type="email" name="mail" value="${esc(legal.mail || '')}" placeholder="z. B. paranoia.gilde@…"></div>
    <p class="hint full">Für eine private Website reichen Name und Wohnort (keine Adresse). Als Kontakt am besten ein eigenes Gilden-Postfach statt der privaten Mail.</p>
  </div>`);
  openModal({ title: 'Impressum-Angaben', body: form, actions: [{ label: 'Abbrechen' }, { label: 'Speichern', cls: 'btn-primary', onClick: async () => {
    const g = n => form.querySelector(`[name=${n}]`).value.trim();
    await store.set('settings', 'main', { legal: { name: g('name'), ort: g('ort'), mail: g('mail') } });
    toast('Gespeichert');
  } }] });
}
