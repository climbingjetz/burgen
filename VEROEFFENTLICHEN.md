# App veröffentlichen (GitHub Pages – kostenlos, mit https)

Damit die App auf dem Handy läuft (inkl. GPS, das nur über **https** funktioniert), wird sie über
**GitHub Pages** veröffentlicht. Danach ist sie z. B. unter `https://DEIN-NAME.github.io/burgen/` erreichbar.
Bei jeder Änderung am Code baut GitHub die App automatisch neu (Datei `.github/workflows/deploy.yml`).

> **Wichtig:** Veröffentlicht wird nur der **Programmcode**. Deine Burgen, Bilder und die Client-ID liegen
> **nicht** im Repository, sondern in deinem Browser bzw. in deinem Google Drive.

## 1. GitHub-Konto und Repository
1. Konto anlegen auf <https://github.com> (falls noch keins vorhanden).
2. Oben rechts **+** → **New repository**.
3. Name: `burgen`, Sichtbarkeit **Public** (GitHub Pages ist für öffentliche Repositories kostenlos),
   **keine** README/Lizenz/.gitignore anhaken → **Create repository**.

## 2. Code hochladen
Im Projektordner (PowerShell):
```powershell
cd C:\Users\wolfg\Downloads\ClaudeCODE\burgen
git init -b main
git add .
git commit -m "Burgen-Erfassung"
git remote add origin https://github.com/DEIN-NAME/burgen.git
git push -u origin main
```
Beim ersten `git push` öffnet sich ein Anmeldefenster von GitHub im Browser.

## 3. GitHub Pages einschalten
1. Im Repository → **Settings** → **Pages**.
2. **Source:** **GitHub Actions** auswählen.
3. Unter **Actions** sieht man den Lauf „Veröffentlichen“ – nach 1–2 Minuten ist die App online.

## 4. Google-Anmeldung für die neue Adresse freischalten
In der Google Cloud Console → **Clients** → deinen Web-Client öffnen →
**Autorisierte JavaScript-Quellen** → `https://DEIN-NAME.github.io` hinzufügen (ohne `/burgen`) → Speichern.

## 5. Auf dem Handy einrichten
1. Die Adresse im Handy-Browser öffnen (Android: Chrome, iPhone: Safari).
2. **Zum Startbildschirm hinzufügen** (Android: Menü ⋮ → „App installieren“; iPhone: Teilen → „Zum Home-Bildschirm“).
3. App öffnen → **Daten** → Client-ID eintragen → **Mit Google anmelden & abgleichen**.
4. Beim ersten GPS-Zugriff den Standort erlauben.
