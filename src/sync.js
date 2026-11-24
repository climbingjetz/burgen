// Abgleich zwischen lokaler Datenbank (Browser) und Google Drive.
// Regel: Je Burg gewinnt die zuletzt geänderte Fassung (Feld "geaendert").
// Gelöschte Burgen werden in Drive als "geloescht" markiert und ihr Bilderordner in den Papierkorb gelegt.
import { reactive } from 'vue'
import { db } from './db.js'
import { getBilder, katalogStand, setKatalogStand } from './store.js'
import { loadKatalog } from './composables/useKatalog.js'
import { kompakt, kompaktStand, kompaktSpeichern } from './kompakt.js'

export const syncState = reactive({
  laeuft: false,
  offen: 0,
  letzter: localStorage.getItem('sync.letzter') || '',
  fehler: '',
  log: [],
})

export async function zaehleOffen() {
  const l = syncState.letzter
  const geaendert = l ? await db.burgen.filter((b) => (b.geaendert || '') > l).count() : await db.burgen.count()
  const katalog = katalogStand() > (l || '') ? 1 : 0
  const kompaktOffen = kompaktStand() > (l || '') ? 1 : 0
  syncState.offen = geaendert + (await db.geloescht.count()) + katalog + kompaktOffen
  return syncState.offen
}

const ohne = (obj, ...keys) => {
  const o = { ...obj }
  keys.forEach((k) => delete o[k])
  return o
}

export async function synchronisiere(remote) {
  if (syncState.laeuft) return null
  syncState.laeuft = true
  syncState.fehler = ''
  syncState.log = []
  const log = (t) => syncState.log.push(t)
  const stat = { hoch: 0, runter: 0, geloescht: 0, bilderHoch: 0, bilderRunter: 0 }

  try {
    log('Verbinde mit Google Drive …')
    await remote.init()
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

      // 3) lokal neuer → hochladen
      if (l && (!r || r.geloescht || (l.geaendert || '') > (r.geaendert || ''))) {
        log(`Hochladen: ${l.name}`)
        const ordner = await remote.burgOrdner(l, (r && !r.geloescht && r.driveOrdner) || l.driveOrdner)
        const bilder = await getBilder(id)
        const alt = new Map((remoteBilder.get(id) || []).map((b) => [b.id, b]))
        for (const b of bilder) {
          const rb = alt.get(b.id)
          if (!b.driveId || !rb) {
            b.driveId = await remote.hochladen(b.blob, b.dateiname, ordner)
            await db.bilder.update(b.id, { driveId: b.driveId })
            stat.bilderHoch++
          } else if (rb.dateiname !== b.dateiname) {
            await remote.umbenennen(b.driveId, b.dateiname)
          }
          alt.delete(b.id)
        }
        for (const rest of alt.values()) if (rest.driveId) await remote.papierkorb(rest.driveId)

        if (l.driveOrdner !== ordner) await db.burgen.update(id, { driveOrdner: ordner })
        remoteBurgen.set(id, { ...l, driveOrdner: ordner, geloescht: '' })
        remoteBilder.set(id, bilder.map((b) => ohne(b, 'blob')))
        stat.hoch++
        continue
      }

      // 4) Drive neuer → herunterladen
      if (r && (!l || (r.geaendert || '') > (l.geaendert || ''))) {
        log(`Herunterladen: ${r.name}`)
        const vorhanden = new Map((await getBilder(id)).map((b) => [b.id, b]))
        const neu = []
        for (const rb of (remoteBilder.get(id) || []).sort((a, b) => a.pos - b.pos)) {
          let blob = vorhanden.get(rb.id)?.blob
          if (!blob && rb.driveId) {
            try {
              blob = await remote.herunterladen(rb.driveId)
              stat.bilderRunter++
            } catch (e) {
              log(`⚠ Bild ${rb.dateiname} von ${r.name} fehlt in Drive`)
              continue
            }
          }
          if (blob) neu.push({ ...rb, blob })
        }
        await db.transaction('rw', db.burgen, db.bilder, async () => {
          await db.burgen.put(ohne(r, 'geloescht'))
          await db.bilder.where('burgId').equals(id).delete()
          if (neu.length) await db.bilder.bulkPut(neu)
        })
        stat.runter++
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
    log('Schreibe Tabelle …')
    await remote.speichern({
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

    await db.geloescht.clear()
    syncState.letzter = jetzt
    localStorage.setItem('sync.letzter', jetzt)
    log(`Fertig: ${stat.hoch} hochgeladen, ${stat.runter} heruntergeladen, ${stat.geloescht} gelöscht, ${stat.bilderHoch + stat.bilderRunter} Bilder übertragen.`)
    return stat
  } catch (e) {
    syncState.fehler = e.message
    log('✗ ' + e.message)
    throw e
  } finally {
    syncState.laeuft = false
    await zaehleOffen()
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

// Nach dem Speichern still im Hintergrund abgleichen – nur wenn bereits angemeldet und online
export async function autoSync() {
  await zaehleOffen()
  const { hatGueltigesToken, istVerbunden } = await import('./google/auth.js')
  if (!istVerbunden() || !hatGueltigesToken() || !navigator.onLine || syncState.laeuft) return
  try {
    await synchronisiere(await driveRemote())
  } catch {
    /* Fehler wird in syncState angezeigt */
  }
}
