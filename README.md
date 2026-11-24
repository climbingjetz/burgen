# Burgen-Erfassung

Web-App (PWA) zum Erfassen von Burgen – am PC und im Gelände auf dem Handy.

## Starten (Entwicklung)

```powershell
cd burgen
npm install
npm run dev
```

Dann im Browser http://localhost:5173 öffnen.

## Aufbau

| Pfad | Inhalt |
|---|---|
| `src/fields.js` | **Datenmodell** – alle Felder, Abschnitte und Kataloge. Neue Felder hier ergänzen. |
| `src/katalogSeed.js` | Startwerte der Kataloge (nur beim ersten Start) |
| `src/store.js` | Lokale Speicherschicht (IndexedDB, offline) |
| `src/sync.js` | Abgleich lokal ⇄ Google Drive |
| `src/google/` | Google-Anmeldung, Drive/Sheets-Zugriff, Tabellenformat |
| `src/views/` | Seiten: Liste, Bearbeiten, Feld-Erfassung, Karte, Kataloge, Daten |
| `src/components/` | GPS-Button, Kartenauswahl, Bilder, Katalog-Auswahl |
| `src/utils/export.js` | CSV-, GPX- und GeoJSON-Export |

## Stand

- [x] Erfassen/Bearbeiten aller Felder, Kataloge mit Pflege
- [x] Feld-Erfassung mit GPS (Genauigkeitsanzeige), Kamera, Offline-Speicherung
- [x] 1–4 Bilder je Burg, automatische Verkleinerung, GPS aus Foto-EXIF
- [x] Karte (Straße / Topo / Luftbild), Position per Klick setzen
- [x] Export CSV / GPX / GeoJSON (alle, Auswahl, einzeln), Datensicherung
- [x] PDF-Datenblatt (einzeln aus dem Formular, mehrere aus der Liste) – `src/utils/pdf.js`
- [x] Google Sheets / Drive-Abgleich – Einrichtung siehe [GOOGLE-EINRICHTUNG.md](GOOGLE-EINRICHTUNG.md)
- [x] Konfigurierbarer Kompaktmodus (Feld → ⚙ Felder), wird über Drive abgeglichen
- [x] Veröffentlichung über GitHub Pages vorbereitet – Anleitung siehe [VEROEFFENTLICHEN.md](VEROEFFENTLICHEN.md)
