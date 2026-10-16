# Paranøia – Gilden-Homepage

| Bereich | Seiten | Wer sieht es |
|---|---|---|
| Öffentlich | Home · Roster · Progress | alle |
| **Intern** | Boss Guides · Logs · Vergleich · Umfragen · Nützliches | alle Raider auf dem Discord |
| **Offi** | Raid Comp · Rotation Planer · Loot Tracker · Gear · Defensive-Check & Log-Notizen · VoDs | nur Offiziere |

Spieler werden an **einer** Stelle verwaltet (Roster → „Spieler verwalten") und tauchen automatisch im Roster, Rotation Planer und Loot Tracker auf. Archivierte Spieler verschwinden aus den Tabellen, ihre Historie bleibt erhalten.

**Rechte:** Raider auf dem Paranøia-Discord sehen den Intern-Bereich. Der Offi-Bereich ist für Raider unsichtbar und auch in der Datenbank gesperrt (nicht nur ausgeblendet). Bearbeiten dürfen überall nur Offiziere – festgelegt über die Discord-Offiziersrolle oder eure User-IDs.

**Kosten:** 0 € – GitHub Pages, Firebase (Spark-Tarif) und Cloudflare Workers sind in dieser Größenordnung kostenlos.

---

## Sofort ausprobieren (Demo-Modus)

Solange in `js/config.js` kein Firebase eingetragen ist, läuft die Seite im **Demo-Modus**: Daten liegen nur im Browser, du bist automatisch Offizier. Über den Button neben deinem Namen kannst du zur Raider-Ansicht wechseln.

Lokal starten (die Seite braucht einen Webserver, Doppelklick auf `index.html` reicht nicht):

```
cd paranoia-guild
python -m http.server 8000
```
→ http://localhost:8000

---

## Live schalten – 4 Schritte (ca. 30–45 Min.)

### 1 · GitHub Pages (Hosting)

1. Auf github.com → **New repository** → Name: `paranoia` → *Public* → Create.
2. **Add file → Upload files** → den gesamten Inhalt dieses Ordners hochladen (nicht den Ordner selbst, sondern `index.html`, `css/`, `js/` …). Commit.
3. **Settings → Pages** → Source: *Deploy from a branch* → Branch `main`, Ordner `/ (root)` → Save.
4. Nach 1–2 Min. ist die Seite erreichbar unter **https://marschlf.github.io/paranoia/**

> Der Ordner `worker/` und `firestore.rules` werden mit hochgeladen, schaden aber nicht – sie werden nur in Schritt 2 und 4 gebraucht.

### 2 · Firebase (Datenbank)

1. https://console.firebase.google.com → **Projekt hinzufügen** → Name z. B. `paranoia-guild` → Google Analytics kannst du ausschalten.
2. Links **Build → Firestore Database** → *Datenbank erstellen* → Standort **europe-west3 (Frankfurt)** → *Im Produktionsmodus starten*.
3. Im Firestore-Tab **Regeln** → den Inhalt von `firestore.rules` komplett hineinkopieren → **Veröffentlichen**.
4. Links **Build → Authentication** → *Jetzt starten* (Anbieter musst du keinen aktivieren – der Discord-Login läuft über „Custom Token").
5. Zahnrad → **Projekteinstellungen → Allgemein** → unten *App hinzufügen* → Web (`</>`) → Name `paranoia` → registrieren.
   Die angezeigten Werte (`apiKey`, `authDomain`, `projectId` …) in **`js/config.js`** unter `firebase` eintragen.
6. **Projekteinstellungen → Dienstkonten** → *Neuen privaten Schlüssel generieren* → JSON-Datei wird heruntergeladen.
   **Diese Datei niemals hochladen oder teilen** – du brauchst daraus nur `client_email` und `private_key` für Schritt 4.

### 3 · Discord-App (Login)

1. https://discord.com/developers/applications → **New Application** → Name `Paranøia Website`.
2. Links **OAuth2**:
   - **Client ID** kopieren
   - **Reset Secret** → **Client Secret** kopieren (sicher aufbewahren)
   - **Redirects → Add Redirect**: `https://paranoia-auth.<dein-name>.workers.dev/callback` (die genaue URL bekommst du in Schritt 4 – danach hier eintragen)
3. In Discord: *Einstellungen → Erweitert → Entwicklermodus* einschalten. Dann:
   - Rechtsklick auf euren Server → **Server-ID kopieren**
   - *Servereinstellungen → Rollen* → Rechtsklick auf die Offiziers-Rolle → **Rollen-ID kopieren**
   - Rechtsklick auf deinen eigenen Namen → **Benutzer-ID kopieren**

Ein Bot ist **nicht** nötig – die Seite fragt nur ab, ob jemand auf dem Server ist und welche Rollen er hat.

### 4 · Cloudflare Worker (verbindet Discord ↔ Firebase)

1. Kostenlosen Account auf https://dash.cloudflare.com anlegen.
2. [Node.js](https://nodejs.org) installieren (LTS), dann im Ordner `worker/`:
   ```
   npx wrangler login
   ```
3. **`worker/wrangler.toml`** ausfüllen:
   | Feld | Wert |
   |---|---|
   | `DISCORD_CLIENT_ID` | aus Schritt 3 |
   | `DISCORD_GUILD_ID` | Server-ID |
   | `OFFICER_ROLE_IDS` | Rollen-ID(s) der Offiziere, kommagetrennt |
   | `ADMIN_DISCORD_IDS` | deine Benutzer-ID (+ Drea, kommagetrennt) |
   | `ALLOWED_REDIRECTS` | `https://marschlf.github.io/paranoia/` |
   | `FIREBASE_CLIENT_EMAIL` | `client_email` aus der JSON-Datei |
4. Secrets setzen (werden verschlüsselt bei Cloudflare gespeichert):
   ```
   npx wrangler secret put DISCORD_CLIENT_SECRET
   npx wrangler secret put FIREBASE_PRIVATE_KEY
   ```
   Beim Private Key den kompletten Wert von `private_key` aus der JSON einfügen (inkl. `-----BEGIN PRIVATE KEY-----` … `-----END PRIVATE KEY-----`).
5. Deployen:
   ```
   npx wrangler deploy
   ```
   Die ausgegebene URL (z. B. `https://paranoia-auth.marschl.workers.dev`):
   - in **`js/config.js`** bei `authWorkerUrl` eintragen
   - als Redirect `…/callback` in der Discord-App eintragen (Schritt 3.2)
6. Geänderte `js/config.js` wieder auf GitHub hochladen.

### 5 · Warcraft Logs (automatischer Progress + Logs-Seite)

1. https://www.warcraftlogs.com/api/clients → **Create Client** → Name `Paranøia Website`, Redirect-URL beliebig (z. B. `https://marschlf.github.io/paranoia/`), *Public Client* **nicht** anhaken.
   (Hast du für deinen WCL-Analyzer schon einen Client, kannst du den auch wiederverwenden.)
2. Im Ordner `worker/`:
   ```
   npx wrangler secret put WCL_CLIENT_ID
   npx wrangler secret put WCL_CLIENT_SECRET
   npx wrangler deploy
   ```
3. In `wrangler.toml` prüfen: `WCL_GUILD_NAME` muss genau so geschrieben sein wie auf warcraftlogs.com (mit ø), `WCL_SERVER_SLUG = "todeswache"`, `WCL_REGION = "EU"`.

Danach holt die Seite alle Logs der Gilde ab Season-Start (Progress → Raid-Einstellungen):
- **Progress** zeigt pro Boss automatisch Kill + Datum, Pulls bis zum Kill und den besten Pull (nur Mythic). Markiert mit „WCL". Mit **📈 Prog-Kurve** sieht man den besten Pull und die Pulls pro Raidabend; der aktuelle Prog-Boss steht samt Kurve auch auf Home.
- **Logs** (Intern) listet jeden Raidabend mit Warcraft-Logs-, Wipefest- und WoWAnalyzer-Link. Raider sehen nur den Warcraft-Logs-Link – Wipefest, WoWAnalyzer, Notizen, VoDs und Defensive-Check sehen nur Offis.
- Die Daten werden alle 10 Minuten aktualisiert. Voraussetzung: Jeder Raid wird geloggt und hochgeladen.
- Heißt ein Boss in WCL anders als bei euch, im Progress per ✎ den „Namen in Warcraft Logs" eintragen. Für Bosse ohne Log kann man mit „Werte manuell festlegen" alles von Hand pflegen.
- **Defensive-Check** (Logs → Reiter *Defensive-Check*, oder „🛡 Check" bei einem Abend): zählt pro Spieler Defensives, Healthstones, Heil- und DPS-Tränke sowie Tode und „Erster Tod" – für einen Abend, die letzten 4 Abende oder die ganze Season. Welche Fähigkeiten zählen, stellt ihr unter **Fähigkeiten bearbeiten** ein (englischer Name wie in WCL oder Spell-ID). Die Midnight-Tränke sind vorbefüllt – einmal mit einem echten Log gegenprüfen, ob die Namen stimmen. Abgeschlossene Reports werden 7 Tage zwischengespeichert.
- Spieler werden über den Namen zugeordnet. Heißt der Charakter anders als im Roster, unter *Spieler verwalten* den **Charakternamen** eintragen.

### 6 · Raider.IO (Gear-Seite)

Nichts zu tun – Raider.IO braucht keinen Schlüssel, der Worker fragt die öffentliche API ab (30 Min. Cache).
- **Gear** (Offi) zeigt Itemlevel, M+ Score, Progress, den schwächsten Slot und fehlende Verzauberungen. Zeile anklicken = alle Slots.
- Den Realm holt die Seite automatisch aus der Raider.IO-Gildenliste (die Gilde ist realmübergreifend). Heißt der Charakter anders als im Roster (auch Akzente: Mârvic ≠ Marvik), unter *Spieler verwalten* den **Charakternamen** eintragen; erwischt sie den falschen Charakter, zusätzlich den **Realm**.
- Welche Slots als „verzauberbar" gelten, steht oben in `js/pages/gear.js` (`ENCHANT_SLOTS`) – derzeit Kopf, Schulter, Brust, Füße, Ringe, Waffe.

### 7 · Comp-Bild direkt in Discord posten (optional)

1. In Discord: Rechtsklick auf euren Raid-Anmeldungs-Channel → **Kanal bearbeiten → Integrationen → Webhooks → Neuer Webhook** → Name z. B. `Paranøia`, Profilbild nach Wunsch → **Webhook-URL kopieren**.
2. Im Ordner `worker/`:
   ```
   npx wrangler secret put DISCORD_WEBHOOK_URL
   npx wrangler deploy
   ```
   (URL einfügen. **Nicht** in `config.js` oder `wrangler.toml` schreiben – wer die URL kennt, kann in den Channel posten.)

Danach im Comp: **Als Bild für Discord → In Discord posten**. Nur Offiziere können posten (der Worker prüft das Login). Wurde schon gepostet, ist „Letzten Post ersetzen" vorausgewählt – nach einer Korrektur steht dann nur das aktuelle Bild im Channel. Einen anderen Channel nehmen = neuen Webhook anlegen und das Secret neu setzen.

### 8 · wowaudit (Wochen-Check, optional)

1. In wowaudit: **Team Settings → API** → Schlüssel kopieren.
2. Im Ordner `worker/`: `npx wrangler secret put WOWAUDIT_API_KEY` → Schlüssel einfügen → `npx wrangler deploy`.

Danach zeigt **Gear → Wochen-Check** pro Spieler die M+ Keys der Woche (EU-Reset Mittwoch), die M+ Vault-Slots (1/4/8 Keys) und die Raid-Teilnahme aus dem Rotation Planer. Die Anforderung (z. B. 4 Keys ab +10) stellt ihr oben ein; wer sie nicht erfüllt, ist rot markiert. Mit ← / → blättert ihr in vergangene Wochen. Spieler werden über den Namen zugeordnet – heißt der Charakter in wowaudit anders, im Roster den Charakternamen eintragen.

### Nützliches: Addons & Profile / Neu bei uns
Drei Tabs: **Links**, **Addons & Profile** (Pflicht / Empfohlen / Profile, Download-Link und Import-String mit Kopieren-Button) und **Neu bei uns** (Text für neue Raider + Pflicht-Addons als persönliche Checkliste). Bearbeiten nur Offis. Gespeichert in der Collection `addons` – benötigt die `addons`-Regel aus `firestore.rules`.

### Boss Guides: Titelbild, Bilder, Vorlage
- **Boss-Titelbild:** Boss bearbeiten (✎ auf der Bosskarte oder „✎ Boss“ im Guide) → Titelbild. Gespeichert in `bossCovers/<bossId>`.
- **Bilder im Guide:** bis zu 3 Bilder pro Guide direkt hochladen (Bearbeiten → Bilder), mit Beschriftung; Klick vergrößert. Gespeichert in `guideImages/<bossId>`.
- **Guide-Vorlage:** Boss Guides → „Guide-Vorlage“. Neue (leere) Guides starten mit diesem Aufbau.
Beides benötigt die Regeln `bossCovers` und `guideImages` aus `firestore.rules`.

### App-Icon
`manifest.webmanifest` + Icons in `assets/`: Auf dem Handy „Zum Home-Bildschirm“ wählen, dann startet die Seite wie eine App.

### Online-Status (nur Offis)
Eingeloggte Nutzer melden sich jede Minute (nur bei offenem Tab) in `presence/<uid>`. Offis sehen oben rechts „● n online" mit Liste inkl. „zuletzt gesehen" und im Roster einen grünen Punkt bzw. „vor x Min." am Namen. Discord-Name ≠ Charaktername → Zuordnung wie bei Guides/Umfragen (Umfrage-Auswertung). Benötigt die neuen `presence`-Regeln in `firestore.rules`.

### Update von einer älteren Version

Wer die Seite schon live hat: neue Dateien hochladen und im Ordner `worker/` einmal `npx wrangler deploy` ausführen (wegen Gear & Defensive-Check).

### Fertig – Daten übernehmen

1. Seite öffnen → **Login mit Discord**.
2. **Roster** → Button **„Startdaten aus dem Sheet importieren"** (erscheint nur, solange die Datenbank leer ist).
   Übernimmt die 28 Spieler, die Loot-Einträge vom 20.08., die 8 Bosse und den Guide für Entombed Sentinels.
3. Unter **Progress → Raid-Einstellungen** Raidtage und Season-Zeitraum prüfen. Bossnamen/Reihenfolge per ✎ anpassen.

---

## Alltag

| Aufgabe | Wo |
|---|---|
| Spieler hinzufügen / bearbeiten / archivieren | Roster → *Spieler verwalten* (auch im Rotation Planer & Loot Tracker) |
| Comp in den Raid-Channel posten | Comp → *Als Bild für Discord* → *In Discord posten* |
| Setup für einen Boss planen | Comp → Boss wählen → Spieler anklicken · „Core übernehmen" als Startpunkt · „Für Discord kopieren" |
| Attendance eintragen | Rotation → Zelle anklicken: ✓ Dabei → B Bench → – Abgemeldet → leer (Rechtsklick = leeren) |
| Loot eintragen | Loot → Klick = +1, Rechtsklick = −1 (Handy: „−1-Modus") · oder **RCLC-Import**: in WoW `/rc history` → Export → CSV, einfügen, fertig. Entzaubern/Bank zählen nicht, doppelt Importiertes wird erkannt, unbekannte Namen (Twinks) einmal zuordnen – wird gemerkt. |
| Raid fällt aus / Notiz | Datum im Tabellenkopf anklicken |
| Zusätzlicher Raidtag | *+ Raidtag* |
| Aktueller Raid (Home & Progress) | Home → Auswahl in der Progress-Kachel (nur für Offis sichtbar) |
| Kill / Pulls / Best % | automatisch aus Warcraft Logs · manuell: Progress → ✎ |
| Log-Notizen aus der Nachbesprechung | Logs → Notizfeld anklicken, tippen, fertig |
| Raid-Stream zur Analyse | VoDs → *+ VoD* → YouTube-Link (gern mit Zeitstempel) – wird direkt eingebettet und erscheint auch auf der Logs-Seite am passenden Abend |
| Boss-Guide schreiben | Boss Guides → Boss → *Bearbeiten* |
| Guide-Quiz anlegen | Boss Guides → Boss → *Bearbeiten* → Feld „Quiz": `? Frage`, darunter `* richtig` / `- falsch`. Leer = kein Quiz |
| Wer hat den Guide gelesen? | Boss Guides → Raid → Feld „x/y gelesen" auf der Boss-Kachel (oder „Gelesen" im Guide). Discord-Namen ohne Roster-Spieler dort einmal zuordnen |
| Guide stark geändert | Beim Speichern „Wichtige Änderung" anhaken → alle müssen neu bestätigen |
| Titelbild für einen Raid | Progress oder Boss Guides → ✎ auf der Raid-Kachel → *Bild auswählen* (wird automatisch verkleinert) – erscheint auch auf Home in der Progress-Kachel |
| Neue Season / neuer Raid | Boss Guides → *+ Raid* (oder Progress → Raid-Einstellungen → *+ Neuer Raid*), dann Bosse mit *+ Boss* anlegen. Alte Raids und Guides bleiben als eigener Reiter erhalten. |
| Links | Nützliches → *+ Link* |
| Zwei Spieler vergleichen (DPS, Stats, Gear, Talente) | Vergleich → Boss + 2 Spieler wählen (Daten aus dem letzten Kill bzw. besten Pull in Warcraft Logs) |
| Umfrage erstellen | Umfragen → *+ Neue Umfrage* → Fragen hinzufügen (Einfach-/Mehrfachauswahl, Kurztext, Absatz, Skala). Nach dem Veröffentlichen sehen alle Raider ein Popup und ein rotes Rufzeichen |
| Umfrage auswerten | Umfrage öffnen → Reiter *Auswertung*: wer fehlt, Antworten pro Spieler, Zusammenfassung, CSV-Download. Raider sehen nur ihre eigenen Antworten |
| Wer hat diese Woche seine Keys gemacht? | Gear → Reiter *Wochen-Check* |
| Gear-Stand prüfen | Gear → sortieren nach iLvl / Score · fehlende Verzauberungen rot |
| Defensives / Tränke nach dem Raid | Logs → *🛡 Check* beim Abend oder Reiter *Defensive-Check* |

Änderungen sind sofort für alle sichtbar (Live-Aktualisierung).

## Dateien

```
index.html            Seitengerüst
css/style.css         Design
js/config.js          ← hier Firebase + Worker-URL eintragen
js/app.js             Navigation & Login
js/store.js           Datenbank (Firebase bzw. Demo)
js/players.js         Spielerverwaltung
js/seed.js            Startdaten aus dem Sheet
js/pages/*.js         Die einzelnen Seiten
firestore.rules       Sicherheitsregeln für Firebase
js/wcl.js             Warcraft-Logs-Daten auf der Seite
js/checks.js          Defensive-Check (Fähigkeitenlisten)
js/rio.js             Raider.IO-Daten auf der Seite
js/progcurve.js       Prog-Kurve (Diagramm)
js/rclc.js            Loot-Import aus RCLootCouncil
js/guidereads.js      Guide-Lesebestätigung + Quiz
js/wowaudit.js        wowaudit-Daten auf der Seite
js/compare.js         Vergleichs-Daten auf der Seite
js/polls.js           Umfragen (Datenmodell)
worker/index.js       Discord-Login (Cloudflare)
worker/wcl.js         Warcraft-Logs-Abfrage + Defensive-Check (Cloudflare)
worker/rio.js         Raider.IO-Abfrage (Cloudflare)
worker/discord.js     Comp-Bild in Discord posten (Cloudflare)
worker/wowaudit.js    Wochen-Check aus wowaudit (Cloudflare)
worker/compare.js     Spieler-Vergleich aus Warcraft Logs (Cloudflare)
```

## Sicherheit kurz erklärt

- Passwörter sieht die Seite nie – Discord bestätigt nur, wer du bist und ob du auf dem Server bist.
- Die Firebase-Werte in `config.js` sind öffentlich gedacht; geschützt wird über `firestore.rules`.
- Umfragen: Raider können nur ihre eigene Antwort lesen und schreiben (und nur solange die Umfrage offen ist); alle Antworten sehen nur Offis.
- Guide-Lesebestätigung: jeder Raider kann nur seine eigene Bestätigung schreiben und sehen; die Übersicht, wer gelesen hat, sehen nur Offis.
- Geheim bleiben nur **Discord Client Secret**, **Firebase Private Key** und **WCL Client Secret** , die **Discord-Webhook-URL** und der **wowaudit-Schlüssel** – die liegen ausschließlich als Secret bei Cloudflare.
