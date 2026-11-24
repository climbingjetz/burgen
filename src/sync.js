// Abgleich zwischen lokaler Datenbank (Browser) und Google Drive.
// Regel: Je Burg gewinnt die zuletzt geänderte Fassung (Feld "geaendert").
// Gelöschte Burgen werden in Drive als "geloescht" markiert und ihr Bilderordner in den Papierkorb gelegt.
//
// Ablauf in zwei Phasen, damit schlechtes Netz nichts kaputt macht:
//   1. Daten  – Tabelle (klein, schnell). Danach sind alle Texte/Koordinaten in der Cloud.
//   2. Bilder – einzeln, mit Fortschritt. Jedes fertige Bild wird sofort lokal vermerkt;
//               bricht das Netz ab, geht es beim nächsten Versuch mit dem nächsten Bild weiter.
//               Bilder werden nur bei ausreichendem Netz übertragen (Einstellung unter "Daten").
//
// Lokale Zusatzfelder (werden nicht in die Tabelle geschrieben):
//   burg.cloudStand  – "geaendert"-Stand, der zuletzt vollständig in der Tabelle gelandet ist
//   bild.driveId     – leer = Bild ist noch nicht in Drive
//   bild.blob = null – Bild liegt in Drive, ist auf diesem Gerät aber noch nicht heruntergeladen
import { reactive, ref } from 'vue'
import { db } from './db.js'
import { getBilder, katalogStand, setKatalogStand } from './store.js'
import { loadKatalog } from './composables/useKatalog.js'
import { kompakt, kompaktStand, kompaktSpeichern } from './kompakt.js'

export const syncState = reactive({
  laeuft: false,
  phase: '', // 'daten' | 'bilder'
  aktuell: '', // was gerade passiert, z. B. "Burg Eltz – Bild 2 von 3"
  aktuellId: '', // Burg, an der gerade gearbeitet wird
  bild: { fertig: 0, gesamt: 0, prozent: 0, bytesFertig: 0, bytesGesamt: 0 },
  offen: 0, // Summe für das Abzeichen in der Navigation
  offenDaten: 0, // Burgen, deren Daten noch nicht in der Cloud sind
  offenSonst: 0, // Löschungen, Kataloge, Kompakt-Einstellungen
  bilderHoch: 0,
  bytesHoch: 0,
  bilderRunter: 0,
  wartet: '', // Grund, warum Bilder gerade nicht übertragen werden
  pauseBis: 0,
  brauchtAnmeldung: false,
  verbunden: localStorage.getItem('google.verbunden') === '1',
  letzter: localStorage.getItem('sync.letzter') || '',
  fehler: '',
  log: [],
})

// Cloud-Zustand je Burg: { daten: bool (Daten fehlen in der Cloud), hoch: n, runter: n }
export const cloud = reactive({})

// ---------- Netz-Regel für Bilder ----------

export const NETZ_REGELN = [
  { key: 'gut', label: 'Nur bei gutem Netz (empfohlen)', hint: 'Kein Upload bei 2G/3G oder Datensparmodus' },
  { key: 'wlan', label: 'Nur im WLAN', hint: 'Spart mobiles Datenvolumen' },
  { key: 'immer', label: 'Immer', hint: 'Auch bei schwachem Mobilfunk' },
]
export const netzRegel = ref(localStorage.getItem('sync.bilderNetz') || 'gut')
export function setNetzRegel(k) {
  netzRegel.value = k
  localStorage.setItem('sync.bilderNetz', k)
  syncState.pauseBis = 0
  pauseStufe = 0
}

const TYPEN = { wifi: 'WLAN', ethernet: 'Kabel', cellular: 'Mobilfunk', bluetooth: 'Bluetooth', none: 'kein Netz' }

// Was der Browser über die Verbindung verrät (Android/Chrome: viel, iPhone/Safari: fast nichts)
export function netzInfo() {
  const c = navigator.connection
  if (!navigator.onLine) return { online: false, text: 'offline' }
  if (!c) return { online: true, text: 'online (Netzqualität nicht ermittelbar)' }
  const teile = [TYPEN[c.type] || '', c.effectiveType ? c.effectiveType.toUpperCase() : '', c.downlink ? `≈ ${c.downlink} Mbit/s` : '']
  if (c.saveData) teile.push('Datensparmodus')
  return { online: true, typ: c.type, eff: c.effectiveType, text: teile.filter(Boolean).join(' · ') || 'online' }
}

export function bilderErlaubt() {
  if (!navigator.onLine) return { ok: false, grund: 'offline' }
  const c = navigator.connection
  if (netzRegel.value === 'immer' || !c) return { ok: true }
  if (netzRegel.value === 'wlan') {
    if (c.type && !['wifi', 'ethernet'].includes(c.type)) return { ok: false, grund: 'wartet auf WLAN' }
    return { ok: true }
  }
  if (c.saveData) return { ok: false, grund: 'Datensparmodus ist an' }
  if (['slow-2g', '2g', '3g'].includes(c.effectiveType)) return { ok: false, grund: `Netz zu schwach (${c.effectiveType.toUpperCase()})` }
  return { ok: true }
}

// Nach einem Netzabbruch wird mit wachsendem Abstand neu versucht
const PAUSEN = [1, 2, 5, 10, 15] // Minuten
let pauseStufe = 0
function pausieren() {
  const min = PAUSEN[Math.min(pauseStufe, PAUSEN.length - 1)]
  pauseStufe++
  syncState.pauseBis = Date.now() + min * 60000
  const uhr = new Date(syncState.pauseBis).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  syncState.wartet = `Netz zu schwach – neuer Versuch um ${uhr}`
}

// ---------- Zählen ----------

export async function zaehleOffen() {
  const [burgen, bilder] = await Promise.all([db.burgen.toArray(), db.bilder.toArray()])
  const neu = {}
  for (const b of burgen) neu[b.id] = { daten: b.cloudStand !== b.geaendert, hoch: 0, runter: 0 }
  let bytes = 0
  let hoch = 0
  let runter = 0
  for (const b of bilder) {
    const c = neu[b.burgId]
    if (!c) continue
    if (b.blob && !b.driveId) {
      c.hoch++
      hoch++
      bytes += b.blob.size || 0
    } else if (!b.blob && b.driveId) {
      c.runter++
      runter++
    }
  }
  for (const k of Object.keys(cloud)) if (!neu[k]) delete cloud[k]
  Object.assign(cloud, neu)

  const l = syncState.letzter
  syncState.offenDaten = Object.values(neu).filter((c) => c.daten).length
  syncState.offenSonst = (await db.geloescht.count()) + (katalogStand() > (l || '') ? 1 : 0) + (kompaktStand() > (l || '') ? 1 : 0)
  syncState.bilderHoch = hoch
  syncState.bytesHoch = bytes
  syncState.bilderRunter = runter
  syncState.offen = syncState.offenDaten + syncState.offenSonst + hoch
  syncState.verbunden = localStorage.getItem('google.verbunden') === '1'
  if (!hoch && !runter) syncState.wartet = ''
  return syncState.offen
}

export const hatArbeit = () => syncState.offen > 0 || syncState.bilderRunter > 0

const ohne = (obj, ...keys) => {
  const o = { ...obj }
  keys.forEach((k) => delete o[k])
  return o
}

// ---------- Abgleich ----------

// auto: im Hintergrund (kein Anmelde-Popup); erzwingen: Bilder auch bei schwachem Netz übertragen
export async function synchronisiere(remote, { auto = false, erzwingen = false } = {}) {
  if (syncState.laeuft) return null
  syncState.laeuft = true
  syncState.phase = 'daten'
  syncState.aktuell = 'Verbinde mit Google Drive …'
  syncState.aktuellId = ''
  syncState.fehler = ''
  syncState.log = []
  Object.assign(syncState.bild, { fertig: 0, gesamt: 0, prozent: 0, bytesFertig: 0, bytesGesamt: 0 })
  const log = (t) => syncState.log.push(t)
  const stat = { hoch: 0, runter: 0, geloescht: 0, bilderHoch: 0, bilderRunter: 0 }
  remote.interaktiv?.(!auto)

  try {
    log('Verbinde mit Google Drive …')
    await remote.init()
    syncState.aktuell = 'Lade Tabelle …'
    log('Lade Tabelle …')
    const R = await remote.laden()

    const remoteBurgen = new Map(R.burgen.map((b) => [b.id, b]))
    const remoteBilder = new Map()
    for (const b of R.bilder) {
      if (!remoteBilder.has(b.burgId)) remoteBilder.set(b.burgId, [])
      remoteBilder.get(b.burgId).push(b)
    }
    const lokal = new Map((await db.burgen.toArray()).map((b) => [b.id, b]))
    const graeber = new Map((await db.geloescht.toArray()).map((g) => [g.id, g]))
    const ids = new Set([...remoteBurgen.keys(), ...lokal.keys(), ...graeber.keys()])

    for (const id of ids) {
      const l = lokal.get(id)
      const r = remoteBurgen.get(id)
      const grab = graeber.get(id)

      // 1) lokal gelöscht
      if (grab && !l) {
        if (r && !r.geloescht) {
          syncState.aktuell = `Lösche in Drive: ${r.name}`
          const ordner = r.driveOrdner || grab.driveOrdner
          if (ordner) await remote.papierkorb(ordner)
          remoteBurgen.set(id, { id, name: r.name, geloescht: grab.zeit, geaendert: grab.zeit })
          remoteBilder.delete(id)
          stat.geloescht++
          log(`Gelöscht in Drive: ${r.name}`)
        }
        continue
      }

      // 2) in Drive gelöscht (und lokal seitdem nicht geändert)
      if (r?.geloescht && (!l || (l.geaendert || '') <= r.geloescht)) {
        if (l) {
          await db.transaction('rw', db.burgen, db.bilder, async () => {
            await db.burgen.delete(id)
            await db.bilder.where('burgId').equals(id).delete()
          })
          stat.geloescht++
          log(`Lokal gelöscht: ${l.name}`)
        }
        continue
      }

      // 3) lokal neuer → Daten hochladen (Bilder folgen in Phase 2)
      if (l && (!r || r.geloescht || (l.geaendert || '') > (r.geaendert || ''))) {
        syncState.aktuell = `Daten: ${l.name}`
        syncState.aktuellId = id
        log(`Hochladen: ${l.name}`)
        const ordner = await remote.burgOrdner(l, (r && !r.geloescht && r.driveOrdner) || l.driveOrdner)
        // sofort merken – sonst entstünde nach einem Abbruch ein zweiter Ordner
        if (l.driveOrdner !== ordner) await db.burgen.update(id, { driveOrdner: ordner })
        const bilder = await getBilder(id)
        const alt = new Map((remoteBilder.get(id) || []).map((b) => [b.id, b]))
        for (const b of bilder) {
          const rb = alt.get(b.id)
          if (b.driveId && (!rb || rb.dateiname !== b.dateiname)) {
            try {
              await remote.umbenennen(b.driveId, b.dateiname)
            } catch (e) {
              if (e.status !== 404) throw e
              b.driveId = '' // Datei fehlt in Drive → neu hochladen
              await db.bilder.update(b.id, { driveId: '' })
            }
          }
          alt.delete(b.id)
        }
        const behalten = new Set(bilder.map((b) => b.driveId).filter(Boolean))
        for (const rest of alt.values()) if (rest.driveId && !behalten.has(rest.driveId)) await remote.papierkorb(rest.driveId)

        remoteBurgen.set(id, { ...ohne(l, 'cloudStand'), driveOrdner: ordner, geloescht: '' })
        remoteBilder.set(id, bilder.map((b) => ohne(b, 'blob')))
        stat.hoch++
        continue
      }

      // 4) Drive neuer → Daten übernehmen, fehlende Bilder als Platzhalter (werden in Phase 2 geladen)
      if (r && (!l || (r.geaendert || '') > (l.geaendert || ''))) {
        log(`Herunterladen: ${r.name}`)
        const vorhanden = new Map((await getBilder(id)).map((b) => [b.id, b]))
        const remoteRows = (remoteBilder.get(id) || []).sort((a, b) => a.pos - b.pos)
        const neu = remoteRows
          .filter((rb) => rb.driveId || vorhanden.get(rb.id)?.blob)
          .map((rb) => ({ ...rb, blob: vorhanden.get(rb.id)?.blob || null }))
        // Bilder, die auf diesem Gerät aufgenommen, aber noch nicht hochgeladen wurden, nicht verwerfen
        const remoteIds = new Set(remoteRows.map((b) => b.id))
        const eigene = [...vorhanden.values()].filter((b) => b.blob && !b.driveId && !remoteIds.has(b.id))
        const rec = { ...ohne(r, 'geloescht'), cloudStand: r.geaendert }
        if (eigene.length) {
          for (const b of eigene.slice(0, Math.max(0, 4 - neu.length))) neu.push(b)
          neu.forEach((b, i) => Object.assign(b, { pos: i + 1, dateiname: `${String(i + 1).padStart(2, '0')}.jpg` }))
          rec.geaendert = new Date().toISOString() // zusammengeführte Fassung muss wieder hoch
          log(`⚠ ${r.name}: in Drive geändert – eigene, noch nicht hochgeladene Bilder wurden behalten`)
        }
        await db.transaction('rw', db.burgen, db.bilder, async () => {
          await db.burgen.put(rec)
          await db.bilder.where('burgId').equals(id).delete()
          if (neu.length) await db.bilder.bulkPut(neu)
        })
        stat.runter++
        continue
      }

      // 5) gleicher Stand → Bild-Kennungen ergänzen (z. B. nachträglich hochgeladene Bilder)
      if (l && r) {
        const rows = remoteBilder.get(id) || []
        const lokB = new Map((await getBilder(id)).map((b) => [b.id, b]))
        for (const row of rows) {
          const lb = lokB.get(row.id)
          if (!row.driveId && lb?.driveId) row.driveId = lb.driveId
          else if (row.driveId && !lb) await db.bilder.put({ ...row, blob: null })
          else if (row.driveId && lb && !lb.driveId && !lb.blob) await db.bilder.update(lb.id, { driveId: row.driveId })
        }
      }
    }

    // Kataloge: die zuletzt geänderte Seite gewinnt komplett
    const lokalStand = katalogStand()
    const remoteStand = R.meta.katalogGeaendert || ''
    let katalog
    if (!R.katalog.length || lokalStand > remoteStand) {
      katalog = (await db.katalog.toArray()).map((k) => ohne(k, 'id'))
      if (!lokalStand) setKatalogStand(new Date().toISOString())
      if (R.katalog.length) log('Kataloge hochgeladen')
    } else if (remoteStand > lokalStand) {
      katalog = R.katalog
      await db.transaction('rw', db.katalog, async () => {
        await db.katalog.clear()
        await db.katalog.bulkAdd(R.katalog.map((k) => ({ ...k, parent: k.parent || '' })))
      })
      setKatalogStand(remoteStand)
      await loadKatalog()
      log('Kataloge aus Drive übernommen')
    } else {
      katalog = R.katalog
    }

    // Kompaktmodus-Einstellungen: neuere Seite gewinnt
    const kLokal = kompaktStand()
    const kRemote = R.meta.kompaktGeaendert || ''
    if (kRemote > kLokal && R.meta.kompaktConfig) {
      try {
        kompaktSpeichern(JSON.parse(R.meta.kompaktConfig), kRemote)
        log('Kompaktmodus-Einstellungen aus Drive übernommen')
      } catch {
        log('⚠ Kompaktmodus-Einstellungen in Drive sind ungültig')
      }
    }
    const kStand = kompaktStand()

    const jetzt = new Date().toISOString()
    const schreibeTabelle = () =>
      remote.speichern({
        burgen: [...remoteBurgen.values()].sort((a, b) => String(a.name).localeCompare(String(b.name), 'de')),
        bilder: [...remoteBilder.values()].flat().sort((a, b) => a.burgId.localeCompare(b.burgId) || a.pos - b.pos),
        katalog,
        meta: {
          katalogGeaendert: katalogStand(),
          kompaktGeaendert: kStand || kRemote,
          kompaktConfig: kStand ? JSON.stringify({ felder: kompakt.felder, startAufHandy: kompakt.startAufHandy }) : R.meta.kompaktConfig || '',
          letzterAbgleich: jetzt,
          format: '1',
        },
      })

    syncState.aktuell = 'Schreibe Tabelle …'
    syncState.aktuellId = ''
    log('Schreibe Tabelle …')
    await schreibeTabelle()

    // vermerken, welcher Stand jeder Burg jetzt in der Cloud ist
    for (const [id, r] of remoteBurgen) {
      if (r.geloescht) continue
      const l = await db.burgen.get(id)
      if (l && l.geaendert === r.geaendert && l.cloudStand !== r.geaendert) await db.burgen.update(id, { cloudStand: r.geaendert })
    }
    await db.geloescht.clear()
    syncState.letzter = jetzt
    localStorage.setItem('sync.letzter', jetzt)
    syncState.brauchtAnmeldung = false
    await zaehleOffen()

    // ---------- Phase 2: Bilder ----------
    const hoch = (await db.bilder.toArray()).filter((b) => b.blob && !b.driveId && remoteBurgen.has(b.burgId))
    const runter = (await db.bilder.toArray()).filter((b) => !b.blob && b.driveId)
    if (hoch.length || runter.length) {
      const regel = bilderErlaubt()
      const pausiert = syncState.pauseBis > Date.now()
      if (!erzwingen && (!regel.ok || pausiert)) {
        if (!regel.ok) syncState.wartet = regel.grund
        log(`Bilder warten: ${regel.ok ? syncState.wartet : regel.grund}`)
      } else {
        syncState.wartet = ''
        syncState.phase = 'bilder'
        await bilderUebertragen(remote, hoch, runter, remoteBilder, schreibeTabelle, stat, log)
      }
    }

    log(`Fertig: ${stat.hoch} hochgeladen, ${stat.runter} heruntergeladen, ${stat.geloescht} gelöscht, ${stat.bilderHoch + stat.bilderRunter} Bilder übertragen.`)
    return stat
  } catch (e) {
    if (e.anmeldung) {
      syncState.brauchtAnmeldung = true
      syncState.fehler = 'Google-Anmeldung abgelaufen – bitte neu anmelden.'
    } else if (e.netz) {
      pausieren()
      syncState.fehler = auto ? '' : e.message
    } else {
      syncState.fehler = e.message
    }
    log('✗ ' + e.message)
    throw e
  } finally {
    remote.interaktiv?.(true)
    syncState.laeuft = false
    syncState.phase = ''
    syncState.aktuell = ''
    syncState.aktuellId = ''
    await zaehleOffen()
    if (nochmal) {
      nochmal = false
      setTimeout(() => autoSync(), 300)
    }
  }
}

async function bilderUebertragen(remote, hoch, runter, remoteBilder, schreibeTabelle, stat, log) {
  hoch.sort((a, b) => a.burgId.localeCompare(b.burgId) || a.pos - b.pos)
  const B = syncState.bild
  B.gesamt = hoch.length + runter.length
  B.bytesGesamt = hoch.reduce((s, b) => s + (b.blob.size || 0), 0)
  let tabelleNeu = false
  try {
    for (const b of hoch) {
      const burg = await db.burgen.get(b.burgId)
      const aktuell = await db.bilder.get(b.id)
      if (!burg || !aktuell?.blob || aktuell.driveId) {
        B.fertig++
        continue
      }
      const anzahl = hoch.filter((x) => x.burgId === b.burgId).length
      const nr = hoch.filter((x) => x.burgId === b.burgId).indexOf(b) + 1
      syncState.aktuell = `${burg.name} – Bild ${nr} von ${anzahl}`
      syncState.aktuellId = burg.id
      B.prozent = 0
      let ordner = burg.driveOrdner
      if (!ordner) {
        ordner = await remote.burgOrdner(burg)
        await db.burgen.update(burg.id, { driveOrdner: ordner })
      }
      const basis = B.bytesFertig
      const groesse = aktuell.blob.size || 1
      const driveId = await remote.hochladen(aktuell.blob, aktuell.dateiname, ordner, (geladen, gesamt) => {
        B.prozent = Math.round((geladen / gesamt) * 100)
        B.bytesFertig = basis + Math.round((geladen / gesamt) * groesse)
      })
      B.bytesFertig = basis + groesse
      // Bild könnte während des Uploads gelöscht oder ersetzt worden sein
      if (await db.bilder.get(b.id)) await db.bilder.update(b.id, { driveId })
      else await remote.papierkorb(driveId)
      const row = (remoteBilder.get(b.burgId) || []).find((x) => x.id === b.id)
      if (row) {
        row.driveId = driveId
        tabelleNeu = true
      }
      B.fertig++
      stat.bilderHoch++
      await zaehleOffen()
    }
    for (const b of runter) {
      const burg = await db.burgen.get(b.burgId)
      syncState.aktuell = `Lade Bild: ${burg?.name || b.burgId}`
      syncState.aktuellId = b.burgId
      B.prozent = 0
      try {
        const blob = await remote.herunterladen(b.driveId)
        const cur = await db.bilder.get(b.id)
        if (cur && !cur.blob) await db.bilder.update(b.id, { blob })
        stat.bilderRunter++
      } catch (e) {
        if (e.netz || e.anmeldung) throw e
        log(`⚠ Bild ${b.dateiname} von ${burg?.name || b.burgId} fehlt in Drive`)
      }
      B.fertig++
      await zaehleOffen()
    }
    pauseStufe = 0
    syncState.pauseBis = 0
  } finally {
    if (tabelleNeu) {
      syncState.aktuell = 'Schreibe Tabelle …'
      try {
        await schreibeTabelle()
      } catch {
        log('⚠ Tabelle konnte nicht aktualisiert werden – wird beim nächsten Abgleich nachgeholt')
      }
    }
  }
}

// ---------- automatischer Abgleich ----------

let remoteInstanz
export async function driveRemote() {
  if (!remoteInstanz) {
    const { DriveRemote } = await import('./google/drive.js')
    remoteInstanz = new DriveRemote()
  }
  return remoteInstanz
}

let nochmal = false

// Still im Hintergrund abgleichen – nur wenn angemeldet und online. Läuft schon einer, danach erneut.
export async function autoSync({ erzwingen = false } = {}) {
  await zaehleOffen()
  if (!syncState.verbunden || !navigator.onLine) return
  if (syncState.laeuft) {
    nochmal = true
    return
  }
  const { hatGueltigesToken } = await import('./google/auth.js')
  if (!hatGueltigesToken()) {
    if (hatArbeit()) syncState.brauchtAnmeldung = true
    return
  }
  try {
    await synchronisiere(await driveRemote(), { auto: true, erzwingen })
  } catch {
    /* Fehler wird in syncState angezeigt */
  }
}

// Bei Klick: ggf. neu anmelden (Popup erlaubt) und sofort alles übertragen
export async function jetztHochladen() {
  const { anmelden, hatGueltigesToken } = await import('./google/auth.js')
  if (!hatGueltigesToken()) await anmelden()
  syncState.brauchtAnmeldung = false
  syncState.pauseBis = 0
  pauseStufe = 0
  if (syncState.laeuft) return
  return synchronisiere(await driveRemote(), { erzwingen: true })
}

// Wiederholt automatisch, sobald Netz da ist / besser wird / die App wieder sichtbar ist
let gestartet = false
export function starteAutomatik() {
  if (gestartet) return
  gestartet = true
  const versuch = () => {
    if (!hatArbeit() || syncState.laeuft || document.hidden) return
    if (syncState.pauseBis > Date.now()) return
    // nur Bilder offen, aber Netz reicht nicht → gar nicht erst verbinden
    if (!syncState.offenDaten && !syncState.offenSonst && !bilderErlaubt().ok) return
    autoSync()
  }
  window.addEventListener('online', () => {
    syncState.pauseBis = 0
    versuch()
  })
  window.addEventListener('offline', () => zaehleOffen())
  navigator.connection?.addEventListener?.('change', () => {
    if (bilderErlaubt().ok) syncState.pauseBis = 0
    versuch()
  })
  document.addEventListener('visibilitychange', () => !document.hidden && versuch())
  setInterval(versuch, 60000)
}
