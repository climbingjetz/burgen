// Export als ZIP für QGIS:
//   Burgen_JJJJ-MM-TT/
//   ├── Burgen.gpkg        GeoPackage mit Punkten, allen Feldern und eingebautem QGIS-Stil
//   ├── Burgen.qgz         QGIS-Projekt (Doppelklick): Burgen + OpenStreetMap-Hintergrund
//   ├── bilder/<id>_<name>/01.jpg …
//   └── LIESMICH.txt
// Das GeoPackage wird mit sql.js (SQLite als WebAssembly) direkt im Browser erzeugt.
import { zip as zipAsync, zipSync, strToU8 } from 'fflate'
import { ALL_FIELDS, STATUS, hasCoords } from '../fields.js'
import { db } from '../db.js'
import { getBilder } from '../store.js'
import { qml, projekt, EBENE, QGIS_VERSION } from './qgisStil.js'
import { dateiBasis, today } from './export.js'

const SRS = 4326

const sicher = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').trim().slice(0, 60)

function sqlTyp(f) {
  if (f.type === 'number') return 'REAL'
  if (f.type === 'rating') return 'INTEGER'
  if (f.type === 'date') return 'DATE'
  return 'TEXT'
}

// GeoPackage-Geometrie: Kopf "GP" + Version + Flags + SRS-ID, danach WKB-Punkt (little endian)
function gpkgPunkt(lon, lat) {
  const buf = new ArrayBuffer(8 + 21)
  const v = new DataView(buf)
  v.setUint8(0, 0x47) // G
  v.setUint8(1, 0x50) // P
  v.setUint8(2, 0) // Version
  v.setUint8(3, 0b00000001) // little endian, kein Envelope
  v.setInt32(4, SRS, true)
  v.setUint8(8, 1) // WKB little endian
  v.setUint32(9, 1, true) // Point
  v.setFloat64(13, lon, true)
  v.setFloat64(21, lat, true)
  return new Uint8Array(buf)
}

async function sqlite() {
  const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([
    import('sql.js'),
    import('sql.js/dist/sql-wasm.wasm?url'),
  ])
  return initSqlJs({ locateFile: () => wasmUrl })
}

// Auswahlwerte je Katalog (Anzeigetexte) für die Auswahllisten in QGIS
async function katalogWerte() {
  const out = { STATUS: STATUS.map((s) => s.label) }
  const alle = await db.katalog.toArray()
  alle.sort((a, b) => (a.sort || 0) - (b.sort || 0))
  for (const e of alle) (out[e.katalog] ||= []).push(e.wert)
  return out
}

function wert(f, b, label) {
  const v = b[f.key]
  if (v == null || v === '') return null
  if (f.type === 'kat') return label(f.katalog, v) || v
  if (f.type === 'katMulti') return (v || []).map((k) => label(f.katalog, k)).join(', ') || null
  if (f.type === 'status') return STATUS.find((s) => s.key === v)?.label || v
  if (f.type === 'number') return typeof v === 'number' ? v : Number(v) || null
  if (f.type === 'rating') return Number(v) || null
  return String(v)
}

const LIESMICH = (n, ohne, fehlend) => `Burgen-Export für QGIS
======================

Inhalt
  Burgen.gpkg   Datenbank (GeoPackage) mit ${n} Burgen
  Burgen.qgz    QGIS-Projekt mit OpenStreetMap-Hintergrund
  bilder/       Fotos, je Burg ein Ordner

So öffnen
  1. Den ganzen Ordner entpacken – wohin, ist egal. Die Dateien müssen nur zusammenbleiben.
  2. Entweder Burgen.qgz doppelklicken (öffnet QGIS mit Karte),
     oder Burgen.gpkg in ein beliebiges QGIS-Projekt ziehen.

Was eingerichtet ist (in der Datenbank gespeichert)
  - Beschriftung mit dem Burgnamen, Symbol
  - Deutsche Feldnamen, Formular mit Reitern wie in der App
  - Auswahllisten für Burgtyp, Zustand, Land usw.
  - Fotos: Reiter "Bilder" im Objektformular (Identifizieren-Werkzeug → Objekt anklicken)
  - Kartentipp mit Name und Hauptbild (Ansicht → Kartenhinweise anzeigen)

Die Bildpfade sind relativ zum Ordner der Datenbank gespeichert (z. B. bilder/B-…/01.jpg).
${ohne ? `\nHinweis: ${ohne} Burg(en) ohne Koordinaten sind enthalten, erscheinen aber nicht auf der Karte.\n` : ''}${fehlend ? `\nHinweis: ${fehlend} Bild(er) waren auf diesem Gerät noch nicht geladen und fehlen im Export.\n` : ''}
Erstellt mit Burgen-Erfassung, QGIS-Stil für QGIS ${QGIS_VERSION.replace(/\.0$/, '')} und neuer.
`

// onFortschritt(text) für die Anzeige
export async function erzeugeGeopackageZip(list, label, onFortschritt = () => {}) {
  onFortschritt('Lade SQLite …')
  const SQL = await sqlite()
  const gdb = new SQL.Database()
  const kataloge = await katalogWerte()

  const bildSpalten = []
  for (let i = 1; i <= 4; i++) bildSpalten.push({ key: `bild${i}`, type: 'text' }, { key: `bild${i}_text`, type: 'text' })
  const felder = [{ key: 'id', type: 'text' }, ...ALL_FIELDS, ...bildSpalten, { key: 'erstellt', type: 'text' }, { key: 'geaendert', type: 'text' }]
  const spalten = felder.map((f) => f.key)

  const jetzt = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  const punkte = list.filter(hasCoords).map((b) => [Number(b.lon), Number(b.lat)])
  const minmax = punkte.length
    ? [Math.min(...punkte.map((p) => p[0])), Math.min(...punkte.map((p) => p[1])), Math.max(...punkte.map((p) => p[0])), Math.max(...punkte.map((p) => p[1]))]
    : [null, null, null, null]

  // ---------- GeoPackage-Grundgerüst ----------
  gdb.run(`PRAGMA application_id = 1196444487; PRAGMA user_version = 10400;`)
  gdb.run(`
    CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT NOT NULL, srs_id INTEGER NOT NULL PRIMARY KEY, organization TEXT NOT NULL,
      organization_coordsys_id INTEGER NOT NULL, definition TEXT NOT NULL, description TEXT);
    CREATE TABLE gpkg_contents (table_name TEXT NOT NULL PRIMARY KEY, data_type TEXT NOT NULL, identifier TEXT UNIQUE, description TEXT DEFAULT '',
      last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE,
      srs_id INTEGER, CONSTRAINT fk_gc_r_srs_id FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id));
    CREATE TABLE gpkg_geometry_columns (table_name TEXT NOT NULL, column_name TEXT NOT NULL, geometry_type_name TEXT NOT NULL,
      srs_id INTEGER NOT NULL, z TINYINT NOT NULL, m TINYINT NOT NULL, CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name),
      CONSTRAINT fk_gc_tn FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name),
      CONSTRAINT fk_gc_srs FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys (srs_id));
  `)
  const srs = gdb.prepare('INSERT INTO gpkg_spatial_ref_sys VALUES (?,?,?,?,?,?)')
  srs.run(['Undefined cartesian SRS', -1, 'NONE', -1, 'undefined', 'undefined cartesian coordinate reference system'])
  srs.run(['Undefined geographic SRS', 0, 'NONE', 0, 'undefined', 'undefined geographic coordinate reference system'])
  srs.run(['WGS 84 geodetic', 4326, 'EPSG', 4326,
    'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AXIS["Latitude",NORTH],AXIS["Longitude",EAST],AUTHORITY["EPSG","4326"]]',
    'longitude/latitude coordinates in decimal degrees on the WGS 84 spheroid'])
  srs.free()

  // ---------- Tabelle burgen ----------
  const spaltenSql = felder.map((f) => `"${f.key}" ${f.key === 'id' ? 'TEXT NOT NULL UNIQUE' : sqlTyp(f)}`).join(', ')
  gdb.run(`CREATE TABLE "${EBENE}" (fid INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, geom POINT, ${spaltenSql});`)
  gdb.run(`INSERT INTO gpkg_contents (table_name, data_type, identifier, description, last_change, min_x, min_y, max_x, max_y, srs_id)
    VALUES (?, 'features', 'Burgen', 'Burgen-Erfassung', ?, ?, ?, ?, ?, ${SRS})`, [EBENE, jetzt, ...minmax])
  gdb.run(`INSERT INTO gpkg_geometry_columns VALUES (?, 'geom', 'POINT', ${SRS}, 0, 0)`, [EBENE])

  const ins = gdb.prepare(`INSERT INTO "${EBENE}" (geom, ${spalten.map((k) => `"${k}"`).join(', ')}) VALUES (?, ${spalten.map(() => '?').join(', ')})`)
  const dateien = {} // Pfad im ZIP → Uint8Array
  let fehlend = 0
  let nr = 0
  for (const b of list) {
    nr++
    onFortschritt(`Burg ${nr} von ${list.length}: ${b.name || b.id}`)
    const bilder = await getBilder(b.id)
    const ordner = `bilder/${sicher(`${b.id}_${b.name || ''}`)}`
    const bildWerte = {}
    for (const bi of bilder.slice(0, 4)) {
      if (!bi.blob) {
        fehlend++
        continue
      }
      const pfad = `${ordner}/${bi.dateiname || String(bi.pos).padStart(2, '0') + '.jpg'}`
      dateien[pfad] = new Uint8Array(await bi.blob.arrayBuffer())
      bildWerte[`bild${bi.pos}`] = pfad
      bildWerte[`bild${bi.pos}_text`] = bi.caption || null
    }
    const werte = felder.map((f) => {
      if (f.key in bildWerte) return bildWerte[f.key]
      if (f.key.startsWith('bild')) return null
      if (f.key === 'id' || f.key === 'erstellt' || f.key === 'geaendert') return b[f.key] || null
      return wert(f, b, label)
    })
    ins.run([hasCoords(b) ? gpkgPunkt(Number(b.lon), Number(b.lat)) : null, ...werte])
  }
  ins.free()

  // ---------- Stil als Standard in der Datenbank ----------
  gdb.run(`CREATE TABLE layer_styles (id INTEGER PRIMARY KEY AUTOINCREMENT, f_table_catalog TEXT(256), f_table_schema TEXT(256),
    f_table_name TEXT(256), f_geometry_column TEXT(256), styleName TEXT(30), styleQML TEXT, styleSLD TEXT, useAsDefault BOOLEAN,
    description TEXT, owner TEXT(30), ui TEXT(30), update_time DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));`)
  gdb.run(`INSERT INTO layer_styles (f_table_catalog, f_table_schema, f_table_name, f_geometry_column, styleName, styleQML, styleSLD, useAsDefault, description, owner)
    VALUES ('', '', ?, 'geom', 'Burgen', ?, '', 1, 'Stil aus der Burgen-Erfassung', '')`, [EBENE, qml(spalten, kataloge)])

  onFortschritt('Schreibe Datenbank …')
  const gpkg = gdb.export()
  gdb.close()

  const proj = projekt({ gpkgName: 'Burgen.gpkg', spalten, kataloge, punkte })
  const qgz = zipSync({ 'Burgen.qgs': strToU8(proj) })

  const basis = list.length === 1 ? `${dateiBasis(list)}_QGIS` : `Burgen_QGIS_${today()}`
  const inhalt = {
    [`${basis}/Burgen.gpkg`]: [gpkg, { level: 6 }],
    [`${basis}/Burgen.qgz`]: [qgz, { level: 0 }],
    [`${basis}/LIESMICH.txt`]: strToU8(LIESMICH(list.length, list.length - punkte.length, fehlend)),
  }
  for (const [pfad, daten] of Object.entries(dateien)) inhalt[`${basis}/${pfad}`] = [daten, { level: 0 }] // JPEG ist schon komprimiert

  onFortschritt('Packe ZIP …')
  const zipDaten = await new Promise((res, rej) => zipAsync(inhalt, (err, d) => (err ? rej(err) : res(d))))
  return { blob: new Blob([zipDaten], { type: 'application/zip' }), name: `${basis}.zip`, fehlend, ohne: list.length - punkte.length, bilder: Object.keys(dateien).length }
}

// Erzeugen und herunterladen; gibt Kennzahlen für einen Hinweis zurück
export async function exportQgis(list, label, onFortschritt) {
  const { download } = await import('./export.js')
  const r = await erzeugeGeopackageZip(list, label, onFortschritt)
  download(r.name, r.blob)
  return r
}
