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
