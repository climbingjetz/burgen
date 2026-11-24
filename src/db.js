import Dexie from 'dexie'

// Lokale Datenbank im Browser (IndexedDB). Funktioniert offline und wird
// mit Google Drive (Tabelle + Bilderordner) abgeglichen.
export const db = new Dexie('burgen')

db.version(1).stores({
  burgen: 'id, name, status, art, land, geaendert',
  bilder: 'id, burgId',
  katalog: '++id, katalog, &[katalog+schluessel]',
})

// v2: gelöschte Burgen merken, damit die Löschung beim Abgleich übertragen wird
db.version(2).stores({
  geloescht: 'id',
})

// v3: Zusatzdateien je Burg (Notizen, Audio, Video, Dokumente …) und Geräte-Einstellungen
//   dateien: { id, burgId, name, typ, groesse, blob|null, driveId, notiz, erstellt, geaendert, geloescht, uploadUrl }
//            blob = null → Datei liegt nur in Drive (wird nach dem Hochladen lokal freigegeben)
//   einstellungen: { key, value } – z. B. der gewählte Sicherungsordner
db.version(3).stores({
  dateien: 'id, burgId',
  einstellungen: 'key',
})
