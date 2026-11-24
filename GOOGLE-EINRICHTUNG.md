# Google Drive einrichten (einmalig, ca. 10 Minuten, kostenlos)

Die App speichert ihre Daten in **deinem eigenen Google Drive**. Damit sie das darf, braucht sie
eine sogenannte **OAuth-Client-ID**. Das ist kein Passwort und kein Geheimnis – sie sagt Google nur,
welche App gerade nach Erlaubnis fragt. Es fallen **keine Kosten** an, ein Zahlungsmittel wird nicht benötigt.

> Die App bekommt nur die Berechtigung **„drive.file“**: Sie sieht ausschließlich Dateien, die sie
> selbst angelegt hat – nicht den Rest deines Drives.

## 1. Projekt anlegen
1. Öffne <https://console.cloud.google.com> und melde dich mit deinem Google-Konto an.
2. Oben links auf die Projektauswahl → **Neues Projekt**.
3. Name: `Burgen-Erfassung` → **Erstellen**. Danach sicherstellen, dass das neue Projekt oben ausgewählt ist.

## 2. Schnittstellen aktivieren
1. Menü ☰ → **APIs und Dienste** → **Bibliothek**.
2. Nach **Google Drive API** suchen → **Aktivieren**.
3. Zurück zur Bibliothek, nach **Google Sheets API** suchen → **Aktivieren**.

## 3. Zustimmungsbildschirm (Google Auth Platform)
1. Menü ☰ → **APIs und Dienste** → **OAuth-Zustimmungsbildschirm** (heißt teils „Google Auth Platform“) → **Jetzt starten**.
2. **App-Name:** `Burgen-Erfassung`, **Support-E-Mail:** deine Adresse → Weiter.
3. **Zielgruppe:** **Extern** → Weiter.
4. **Kontaktdaten:** deine Adresse → Weiter → Richtlinie bestätigen → **Erstellen**.
5. Unter **Zielgruppe** → **Testnutzer** → **+ Nutzer hinzufügen** → deine eigene Gmail-Adresse eintragen → Speichern.
   (Die App bleibt im Testmodus – das genügt für dich vollkommen.)

## 4. Client-ID erstellen
1. Unter **Clients** (bzw. **APIs und Dienste → Anmeldedaten**) → **+ Client erstellen** / **OAuth-Client-ID**.
2. **Anwendungstyp:** **Webanwendung**, Name: `Burgen-App`.
3. **Autorisierte JavaScript-Quellen** → **+ URI hinzufügen**:
   - `http://localhost:5173` (zum Ausprobieren am PC)
   - später zusätzlich die Adresse der veröffentlichten App, z. B. `https://DEIN-NAME.github.io`
4. **Autorisierte Weiterleitungs-URIs** leer lassen → **Erstellen**.
5. Die angezeigte **Client-ID** kopieren (endet auf `.apps.googleusercontent.com`).
   Das „Clientschlüssel“/Secret wird **nicht** gebraucht.

## 5. In der App eintragen
1. App öffnen → **Daten** → Abschnitt **Google Drive** → Client-ID einfügen → **Speichern**.
2. **Mit Google anmelden & abgleichen** → im Google-Fenster dein Konto wählen.
   Es erscheint der Hinweis *„Google hat diese App nicht überprüft“* – das ist bei eigenen Apps im
   Testmodus normal: **Weiter** klicken und den Zugriff erlauben.
3. In deinem Drive entsteht der Ordner **Burgen-Erfassung** mit der Tabelle **Burgen-DB** und dem Ordner **Bilder**.

## Gut zu wissen
- **Mehrere Geräte:** Auf dem Handy dieselbe Client-ID eintragen und mit demselben Konto anmelden –
  die App findet den vorhandenen Ordner und lädt alle Burgen herunter.
- **Abgleichsregel:** Je Burg gewinnt die zuletzt geänderte Fassung. Kataloge werden als Ganzes abgeglichen.
- **Die Tabelle** kannst du ansehen, aber bitte **nicht** von Hand bearbeiten – Änderungen dort ohne
  neuen Zeitstempel in der Spalte `geaendert` werden beim nächsten Abgleich überschrieben.
- **Anmeldung:** gilt rund eine Stunde; danach einmal auf „Jetzt abgleichen“ tippen.
- **Optional:** Statt die Client-ID in jedem Browser einzutragen, kann sie in eine Datei `.env` im
  Projektordner geschrieben werden: `VITE_GOOGLE_CLIENT_ID=…apps.googleusercontent.com`
