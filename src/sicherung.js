// Automatische lokale Datensicherung – zusätzlich zu Google Drive.
//
//   Datenbank: 2× täglich (alle 12 h), 10 Generationen   → datenbank/burgen-db_JJJJ-MM-TT_HH-MM.json
//   Bilder:    1× täglich,             4 Generationen    → bilder-staende/stand_JJJJ-MM-TT.json + bilder/<id>.jpg
//
// Bilder werden nur einmal abgelegt und von den Ständen referenziert (sonst läge jedes Foto 4× auf der Platte).
// Ein Bild wird erst gelöscht, wenn keiner der 4 aufbewahrten Stände es mehr braucht.
//
// Ziel: am PC (Chrome/Edge) ein selbst gewählter Ordner. Wo Browser keine Ordner freigeben (Handy, Firefox, Safari),
// ein getrennter, interner Speicherbereich der App (Origin Private File System).
// Gesichert wird, solange die App geöffnet ist; ist eine Sicherung fällig, läuft sie beim nächsten Öffnen.
import { reactive } from 'vue'
import { db } from './db.js'
import { katalogStand, setKatalogStand } from './store.js'
import { loadKatalog } from './composables/useKatalog.js'
import { kompakt, kompaktStand, kompaktSpeichern } from './kompakt.js'

export const DB_ABSTAND = 12 * 3600 * 1000
export const DB_GENERATIONEN = 10
export const BILD_ABSTAND = 24 * 3600 * 1000
export const BILD_GENERATIONEN = 4

export const sicherungState = reactive({
  laeuft: false,
  text: '',
  ziel: '', // 'ordner' | 'intern'
  ordnerName: '',
  brauchtFreigabe: false,
  letzteDb: localStorage.getItem('sicherung.db') || '',
  letzteBilder: localStorage.getItem('sicherung.bilder') || '',
  fehler: '',
})

export const kannOrdner = () => typeof window.showDirectoryPicker === 'function'

const pad = (n) => String(n).padStart(2, '0')
const stempel = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`

// ---------- Ziel ----------

async function gespeicherterOrdner() {
  return (await db.einstellungen.get('sicherungOrdner'))?.value || null
}

export async function zielLaden() {
  const h = await gespeicherterOrdner()
  sicherungState.ziel = h ? 'ordner' : 'intern'
  sicherungState.ordnerName = h?.name || ''
  if (h) sicherungState.brauchtFreigabe = (await h.queryPermission({ mode: 'readwrite' })) !== 'granted'
  else sicherungState.brauchtFreigabe = false
}

// Muss aus einem Klick heraus aufgerufen werden
export async function ordnerWaehlen() {
  const h = await window.showDirectoryPicker({ id: 'burgen-sicherung', mode: 'readwrite', startIn: 'documents' })
  await db.einstellungen.put({ key: 'sicherungOrdner', value: h })
  await zielLaden()
  return h
}

export async function aufInternWechseln() {
  await db.einstellungen.delete('sicherungOrdner')
  await zielLaden()
}

// Freigabe erneuern (Browser fragen nach einem Neustart manchmal nach) – aus einem Klick heraus
export async function freigeben() {
  const h = await gespeicherterOrdner()
  if (!h) return true
  const ok = (await h.requestPermission({ mode: 'readwrite' })) === 'granted'
  sicherungState.brauchtFreigabe = !ok
  return ok
}

async function wurzel(interaktiv = false) {
  const h = await gespeicherterOrdner()
  if (h) {
    let p = await h.queryPermission({ mode: 'readwrite' })
    if (p !== 'granted' && interaktiv) p = await h.requestPermission({ mode: 'readwrite' })
    if (p !== 'granted') {
      sicherungState.brauchtFreigabe = true
      return null
    }
    sicherungState.brauchtFreigabe = false
    return h.getDirectoryHandle('Burgen-Sicherung', { create: true })
  }
  const opfs = await navigator.storage.getDirectory()
  return opfs.getDirectoryHandle('Burgen-Sicherung', { create: true })
}

const unter = (dir, name) => dir.getDirectoryHandle(name, { create: true })

async function schreiben(dir, name, daten) {
  const f = await dir.getFileHandle(name, { create: true })
  const w = await f.createWritable()
  await w.write(daten)
  await w.close()
}

async function lesen(dir, name) {
  return (await dir.getFileHandle(name)).getFile()
}

async function namen(dir) {
  const out = []
  for await (const [name, h] of dir.entries()) if (h.kind === 'file') out.push(name)
  return out.sort()
}

// ---------- Sicherung Datenbank ----------

export async function sichereDatenbank(interaktiv = false) {
  const root = await wurzel(interaktiv)
  if (!root) return false
  const dir = await unter(root, 'datenbank')
  const [burgen, bilder, katalog, dateien] = await Promise.all([db.burgen.toArray(), db.bilder.toArray(), db.katalog.toArray(), db.dateien.toArray()])
  const daten = {
    format: 'burgen-sicherung-auto',
    version: 2,
    erstellt: new Date().toISOString(),
    geraet: navigator.userAgent,
    burgen,
    bilder: bilder.map(({ blob, ...b }) => ({ ...b, lokal: !!blob })), // Bildinhalte liegen in der Bildsicherung
    dateien: dateien.filter((d) => !d.geloescht).map(({ blob, uploadUrl, ...d }) => d),
    katalog: katalog.map(({ id, ...k }) => k),
    katalogGeaendert: katalogStand(),
    kompakt: { felder: kompakt.felder, startAufHandy: kompakt.startAufHandy, geaendert: kompaktStand() },
  }
  await schreiben(dir, `burgen-db_${stempel()}.json`, JSON.stringify(daten))
  // nur die neuesten 10 behalten
  const alle = (await namen(dir)).filter((n) => n.startsWith('burgen-db_'))
  for (const alt of alle.slice(0, Math.max(0, alle.length - DB_GENERATIONEN))) await dir.removeEntry(alt)
  const jetzt = new Date().toISOString()
  sicherungState.letzteDb = jetzt
  localStorage.setItem('sicherung.db', jetzt)
  return true
}

// ---------- Sicherung Bilder ----------

export async function sichereBilder(interaktiv = false, onFortschritt = () => {}) {
  const root = await wurzel(interaktiv)
  if (!root) return false
  const bdir = await unter(root, 'bilder')
  const sdir = await unter(root, 'bilder-staende')
  const vorhanden = new Set(await namen(bdir))
  const bilder = await db.bilder.toArray()
  let neu = 0
  let i = 0
  for (const b of bilder) {
    i++
    const datei = `${b.id}.jpg`
    if (!b.blob || vorhanden.has(datei)) continue
    onFortschritt(`Bild ${i} von ${bilder.length}`)
    await schreiben(bdir, datei, b.blob)
    vorhanden.add(datei)
    neu++
  }
  const stand = bilder.filter((b) => vorhanden.has(`${b.id}.jpg`)).map(({ blob, ...b }) => ({ ...b, datei: `${b.id}.jpg` }))
  const tag = stempel().slice(0, 10)
  await schreiben(sdir, `stand_${tag}.json`, JSON.stringify({ erstellt: new Date().toISOString(), bilder: stand }))

  // nur 4 Stände behalten, nicht mehr benötigte Bilddateien löschen
  const staende = (await namen(sdir)).filter((n) => n.startsWith('stand_'))
  for (const alt of staende.slice(0, Math.max(0, staende.length - BILD_GENERATIONEN))) await sdir.removeEntry(alt)
  const gebraucht = new Set()
  for (const n of (await namen(sdir)).filter((x) => x.startsWith('stand_'))) {
    try {
      const s = JSON.parse(await (await lesen(sdir, n)).text())
      s.bilder.forEach((b) => gebraucht.add(b.datei))
    } catch {
      /* defekter Stand – ignorieren */
    }
  }
  let entfernt = 0
  for (const n of vorhanden) {
    if (!gebraucht.has(n)) {
      await bdir.removeEntry(n)
      entfernt++
    }
  }
  const jetzt = new Date().toISOString()
  sicherungState.letzteBilder = jetzt
  localStorage.setItem('sicherung.bilder', jetzt)
  return { neu, entfernt, gesamt: stand.length }
}

// ---------- Planung ----------

const faellig = (letzte, abstand) => !letzte || Date.now() - new Date(letzte).getTime() >= abstand - 60000

export async function autoSicherung({ erzwingen = false, interaktiv = false } = {}) {
  if (sicherungState.laeuft) return
  if (!navigator.storage?.getDirectory && !kannOrdner()) return
  await zielLaden()
  const dbFaellig = erzwingen || faellig(sicherungState.letzteDb, DB_ABSTAND)
  const bildFaellig = erzwingen || faellig(sicherungState.letzteBilder, BILD_ABSTAND)
  if (!dbFaellig && !bildFaellig) return
  if ((await db.burgen.count()) === 0 && !erzwingen) return
  sicherungState.laeuft = true
  sicherungState.fehler = ''
  try {
    if (dbFaellig) {
      sicherungState.text = 'Sichere Datenbank …'
      await sichereDatenbank(interaktiv)
    }
    if (bildFaellig && !sicherungState.brauchtFreigabe) {
      sicherungState.text = 'Sichere Bilder …'
      await sichereBilder(interaktiv, (t) => (sicherungState.text = `Sichere Bilder: ${t}`))
    }
  } catch (e) {
    sicherungState.fehler = e.message || String(e)
  } finally {
    sicherungState.laeuft = false
    sicherungState.text = ''
  }
}

let gestartet = false
export function starteSicherungsplan() {
  if (gestartet) return
  gestartet = true
  setTimeout(() => autoSicherung(), 5000) // kurz nach dem Start, damit die App zuerst bedienbar ist
  setInterval(() => !document.hidden && autoSicherung(), 10 * 60 * 1000)
  document.addEventListener('visibilitychange', () => !document.hidden && autoSicherung())
}

// ---------- Übersicht & Wiederherstellen ----------

export async function generationen() {
  const root = await wurzel(false)
  if (!root) return null
  const dir = await unter(root, 'datenbank')
  const sdir = await unter(root, 'bilder-staende')
  const bdir = await unter(root, 'bilder')
  const dbListe = []
  for (const n of (await namen(dir)).filter((x) => x.startsWith('burgen-db_')).reverse()) {
    const f = await lesen(dir, n)
    dbListe.push({ name: n, groesse: f.size, zeit: f.lastModified })
  }
  const staende = []
  for (const n of (await namen(sdir)).filter((x) => x.startsWith('stand_')).reverse()) {
    const f = await lesen(sdir, n)
    let anzahl = 0
    try {
      anzahl = JSON.parse(await f.text()).bilder.length
    } catch {
      /* ignorieren */
    }
    staende.push({ name: n, anzahl, zeit: f.lastModified })
  }
  let bytes = 0
  let dateien = 0
  for await (const [, h] of bdir.entries()) {
    if (h.kind !== 'file') continue
    bytes += (await h.getFile()).size
    dateien++
  }
  return { db: dbListe, staende, bilder: { dateien, bytes } }
}

// Liest eine DB-Sicherung; liefert eine kurze Übersicht für die Rückfrage
export async function sicherungLesen(name) {
  const root = await wurzel(true)
  if (!root) throw new Error('Kein Zugriff auf den Sicherungsordner.')
  const dir = await unter(root, 'datenbank')
  return JSON.parse(await (await lesen(dir, name)).text())
}

// Stellt eine Datenbank-Sicherung wieder her. Bilder kommen aus der Bildsicherung,
// fehlende Bilder, die in Drive liegen, werden beim nächsten Abgleich nachgeladen.
// inCloud = true: der wiederhergestellte Stand gilt als neuester und wird beim Abgleich nach Drive übertragen.
export async function wiederherstellen(name, { inCloud = true } = {}) {
  const root = await wurzel(true)
  if (!root) throw new Error('Kein Zugriff auf den Sicherungsordner.')
  const d = await sicherungLesen(name)
  if (d.format !== 'burgen-sicherung-auto') throw new Error('Unbekanntes Sicherungsformat.')
  const bdir = await unter(root, 'bilder')
  const bilder = []
  let fehlen = 0
  for (const b of d.bilder) {
    const { lokal, ...rest } = b
    let blob = null
    try {
      blob = await lesen(bdir, `${b.id}.jpg`)
      blob = new Blob([await blob.arrayBuffer()], { type: 'image/jpeg' })
    } catch {
      blob = null
    }
    if (blob || b.driveId) bilder.push({ ...rest, blob })
    else fehlen++
  }
  const jetzt = new Date().toISOString()
  const burgen = d.burgen.map((b) => (inCloud ? { ...b, geaendert: jetzt } : b))
  const dateien = (d.dateien || []).filter((x) => x.driveId).map((x) => ({ ...x, blob: null, uploadUrl: '' }))
  // Dateien, die gerade nur auf diesem Gerät liegen (noch nicht in Drive), nicht verlieren
  const ids = new Set(burgen.map((b) => b.id))
  for (const x of await db.dateien.toArray()) if (x.blob && !x.driveId && !x.geloescht && ids.has(x.burgId) && !dateien.some((y) => y.id === x.id)) dateien.push(x)
  await db.transaction('rw', db.burgen, db.bilder, db.katalog, db.dateien, db.geloescht, async () => {
    await Promise.all([db.burgen.clear(), db.bilder.clear(), db.katalog.clear(), db.dateien.clear(), db.geloescht.clear()])
    await db.burgen.bulkPut(burgen)
    await db.bilder.bulkPut(bilder)
    await db.katalog.bulkAdd(d.katalog)
    await db.dateien.bulkPut(dateien)
  })
  setKatalogStand(inCloud ? jetzt : d.katalogGeaendert || jetzt)
  if (d.kompakt?.felder) kompaktSpeichern({ felder: d.kompakt.felder, startAufHandy: d.kompakt.startAufHandy }, inCloud ? jetzt : d.kompakt.geaendert || jetzt)
  await loadKatalog()
  return { burgen: burgen.length, bilder: bilder.length, fehlen }
}
