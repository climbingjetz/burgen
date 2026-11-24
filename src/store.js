// Speicherschicht. Alle Zugriffe der Oberfläche laufen über diese Funktionen,
// damit später Google Sheets/Drive angebunden werden kann, ohne die Views zu ändern.
import { db } from './db.js'
import { seedEntries, slug } from './katalogSeed.js'
import { ALL_FIELDS } from './fields.js'

export async function initStore() {
  if ((await db.katalog.count()) === 0) await db.katalog.bulkAdd(seedEntries())
  // Browser bitten, die Daten nicht automatisch zu löschen
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {})
}

const pad = (n) => String(n).padStart(2, '0')

// Lesbare, sortierbare ID, z. B. B-20261124-153012
export async function newId() {
  let d = new Date()
  for (;;) {
    const id = `B-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
    if (!(await db.burgen.get(id))) return id
    d = new Date(d.getTime() + 1000)
  }
}

const rid = () => Math.random().toString(36).slice(2, 10)
const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v))

// ---------- Burgen ----------

export const listBurgen = () => db.burgen.orderBy('name').toArray()
export const getBurg = (id) => db.burgen.get(id)

export async function getBilder(burgId) {
  const list = await db.bilder.where('burgId').equals(burgId).toArray()
  return list.sort((a, b) => a.pos - b.pos)
}

// Hauptbilder für die Liste (Bilder, die noch aus Drive geladen werden, haben noch keinen blob)
export const getHauptbilder = () => db.bilder.filter((b) => b.pos === 1 && !!b.blob).toArray()

export async function saveBurg(burg, bilder = []) {
  const now = new Date().toISOString()
  const rec = JSON.parse(JSON.stringify(burg)) // reaktive Proxys entfernen
  for (const f of ALL_FIELDS) if (f.type === 'number') rec[f.key] = num(rec[f.key])
  rec.name = (rec.name || '').trim()
  rec.erstellt = rec.erstellt || now
  rec.geaendert = now
  rec.version = (rec.version || 0) + 1

  const imgs = bilder.map((b, i) => ({
    id: b.id || `${rec.id}-${rid()}`,
    burgId: rec.id,
    pos: i + 1,
    dateiname: `${pad(i + 1)}.jpg`,
    blob: b.blob,
    driveId: b.driveId || '',
    caption: b.caption || '',
    datum: b.datum || '',
    lat: b.lat ?? null,
    lon: b.lon ?? null,
    hoehe: b.hoehe ?? null,
  }))

  await db.transaction('rw', db.burgen, db.bilder, async () => {
    // Läuft gerade ein Upload, kann ein Bild inzwischen eine driveId bekommen haben – nicht verlieren
    const vorher = new Map((await db.bilder.where('burgId').equals(rec.id).toArray()).map((b) => [b.id, b]))
    for (const b of imgs) {
      const v = vorher.get(b.id)
      if (!b.driveId && v?.driveId) b.driveId = v.driveId
      if (!b.blob && v?.blob) b.blob = v.blob // inzwischen aus Drive geladen
      if (!b.blob) b.blob = null
    }
    const alt = await db.burgen.get(rec.id)
    if (alt?.cloudStand) rec.cloudStand = alt.cloudStand
    if (alt?.driveOrdner && !rec.driveOrdner) rec.driveOrdner = alt.driveOrdner
    await db.burgen.put(rec)
    await db.bilder.where('burgId').equals(rec.id).delete()
    if (imgs.length) await db.bilder.bulkPut(imgs)
  })
  return rec
}

export async function deleteBurg(id) {
  await db.transaction('rw', db.burgen, db.bilder, db.geloescht, async () => {
    const b = await db.burgen.get(id)
    // Grabstein für den Abgleich – nur nötig, wenn die Burg schon in Drive liegen kann
    if (b) await db.geloescht.put({ id, zeit: new Date().toISOString(), driveOrdner: b.driveOrdner || '' })
    await db.burgen.delete(id)
    await db.bilder.where('burgId').equals(id).delete()
  })
}

// ---------- Kataloge ----------

// Zeitstempel der letzten Katalogänderung (entscheidet beim Abgleich, welche Seite gewinnt)
export const katalogStand = () => localStorage.getItem('katalog.geaendert') || ''
export const setKatalogStand = (iso) => localStorage.setItem('katalog.geaendert', iso)
const katalogGeaendert = () => setKatalogStand(new Date().toISOString())

export async function addKatalogEntry(katalog, wert, parent = '') {
  katalogGeaendert()
  const existing = await db.katalog.where('katalog').equals(katalog).toArray()
  let schluessel = slug(wert)
  const base = schluessel
  for (let i = 2; existing.some((e) => e.schluessel === schluessel); i++) schluessel = `${base}-${i}`
  const sort = existing.reduce((m, e) => Math.max(m, e.sort || 0), 0) + 10
  return db.katalog.add({ katalog, schluessel, wert: wert.trim(), sort, aktiv: true, parent })
}

export const updateKatalogEntry = (id, changes) => (katalogGeaendert(), db.katalog.update(id, changes))
export const deleteKatalogEntry = (id) => (katalogGeaendert(), db.katalog.delete(id))

// Wie oft wird jeder Schlüssel eines Katalogs in den Burgen verwendet?
export async function katalogUsage(katalog) {
  const fields = ALL_FIELDS.filter((f) => f.katalog === katalog)
  const count = {}
  const add = (k) => k && (count[k] = (count[k] || 0) + 1)
  await db.burgen.each((b) => {
    for (const f of fields) {
      const v = b[f.key]
      if (Array.isArray(v)) v.forEach(add)
      else add(v)
    }
  })
  return count
}

// ---------- Datensicherung ----------

const blobToDataUrl = (blob) =>
  new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result)
    r.onerror = rej
    r.readAsDataURL(blob)
  })

export async function exportBackup() {
  const [burgen, katalog, bilder] = await Promise.all([db.burgen.toArray(), db.katalog.toArray(), db.bilder.toArray()])
  const bilderOut = []
  for (const b of bilder) {
    const { blob, ...rest } = b
    if (blob) bilderOut.push({ ...rest, data: await blobToDataUrl(blob) })
  }
  return { format: 'burgen-sicherung', version: 1, exportiert: new Date().toISOString(), burgen, katalog, bilder: bilderOut }
}

export async function importBackup(data) {
  if (data?.format !== 'burgen-sicherung') throw new Error('Das ist keine Burgen-Sicherungsdatei.')
  const bilder = []
  for (const b of data.bilder || []) {
    const { data: url, ...rest } = b
    bilder.push({ ...rest, blob: await (await fetch(url)).blob() })
  }
  await db.transaction('rw', db.burgen, db.bilder, db.katalog, db.geloescht, async () => {
    await Promise.all([db.burgen.clear(), db.bilder.clear(), db.katalog.clear(), db.geloescht.clear()])
    await db.katalog.bulkAdd(data.katalog.map(({ id, ...e }) => e))
    await db.burgen.bulkAdd(data.burgen)
    await db.bilder.bulkAdd(bilder)
  })
}
