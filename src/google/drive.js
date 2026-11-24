// Ablage in Google Drive:
//   Burgen-Erfassung/
//   ├── Burgen-DB        (Google Sheet: Burgen, Bilder, Katalog, Meta)
//   └── Bilder/
//       └── B-20261124-153012_Burg_Hohenzollern/  01.jpg … 04.jpg
import { getToken, tokenVerwerfen, anmelden, hatGueltigesToken } from './auth.js'
import { BURG_COLS, BILD_COLS, KAT_COLS, zuZeilen, ausZeilen } from './tabelle.js'

const DRIVE = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets'
const FOLDER = 'application/vnd.google-apps.folder'
const TABS = ['Burgen', 'Bilder', 'Katalog', 'Meta']

class ApiFehler extends Error {
  constructor(status, msg) {
    super(msg)
    this.status = status
  }
}

// Wird ausgelöst, wenn im Hintergrund eine neue Google-Anmeldung nötig wäre (Popup geht nur nach einem Klick)
export class AnmeldungNoetig extends Error {
  constructor() {
    super('Die Google-Anmeldung ist abgelaufen.')
    this.anmeldung = true
  }
}

// Netzfehler / Zeitüberschreitung – später erneut versuchen
export class NetzFehler extends Error {
  constructor(msg = 'Keine oder zu schwache Netzverbindung.') {
    super(msg)
    this.netz = true
  }
}

// interaktiv = false: kein Anmelde-Popup öffnen (automatischer Abgleich im Hintergrund)
let interaktiv = true
export const setInteraktiv = (v) => (interaktiv = v)

async function tokenHolen() {
  if (!interaktiv && !hatGueltigesToken()) throw new AnmeldungNoetig()
  return getToken()
}

async function neuAnmelden() {
  tokenVerwerfen()
  if (!interaktiv) throw new AnmeldungNoetig()
  await anmelden()
}

const ZEITLIMIT = 60000 // ms für normale Anfragen

async function api(url, opts = {}, erneut = true) {
  const t = await tokenHolen()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ZEITLIMIT)
  let r
  try {
    r = await fetch(url, { ...opts, signal: ctrl.signal, headers: { Authorization: `Bearer ${t}`, ...(opts.headers || {}) } })
  } catch (e) {
    throw new NetzFehler(e.name === 'AbortError' ? 'Zeitüberschreitung – das Netz ist zu langsam.' : 'Keine Verbindung zu Google.')
  } finally {
    clearTimeout(timer)
  }
  if (r.status === 401 && erneut) {
    await neuAnmelden()
    return api(url, opts, false)
  }
  if (!r.ok) {
    let msg = r.statusText
    try {
      msg = (await r.json()).error?.message || msg
    } catch {
      /* kein JSON */
    }
    if (r.status >= 500 || r.status === 429) throw new NetzFehler(`Google ist gerade nicht erreichbar (${r.status}).`)
    throw new ApiFehler(r.status, `Google meldet (${r.status}): ${msg}`)
  }
  return r
}

// Upload mit Fortschrittsanzeige. Bricht ab, wenn 45 s lang nichts mehr übertragen wird.
function xhrUpload(url, body, contentType, token, onProgress) {
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest()
    let stau
    const warte = () => {
      clearTimeout(stau)
      stau = setTimeout(() => x.abort(), 45000)
    }
    x.open('POST', url)
    x.setRequestHeader('Authorization', `Bearer ${token}`)
    x.setRequestHeader('Content-Type', contentType)
    x.upload.onprogress = (e) => {
      warte()
      if (e.lengthComputable) onProgress?.(e.loaded, e.total)
    }
    x.onload = () => {
      clearTimeout(stau)
      res({ status: x.status, text: x.responseText })
    }
    x.onerror = () => {
      clearTimeout(stau)
      rej(new NetzFehler('Verbindung beim Hochladen abgebrochen.'))
    }
    x.onabort = () => rej(new NetzFehler('Hochladen abgebrochen – das Netz ist zu langsam.'))
    warte()
    x.send(body)
  })
}

const json = async (url, opts) => (await api(url, opts)).json()
const jsonBody = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const sicher = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 80)

function spalte(n) {
  let s = ''
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

export class DriveRemote {
  constructor() {
    this.ids = JSON.parse(localStorage.getItem('google.ids') || '{}')
  }

  // false = automatischer Abgleich im Hintergrund, keine Anmelde-Popups
  interaktiv(v) {
    setInteraktiv(v)
  }

  // ---------- Grundfunktionen ----------

  async suche(appWert) {
    const q = `appProperties has { key='burgenApp' and value='${appWert}' } and trashed=false`
    const r = await json(`${DRIVE}?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime)&orderBy=createdTime&pageSize=10`)
    return r.files[0] || null
  }

  async ordnerAnlegen(name, parent, appProperties = {}) {
    return json(`${DRIVE}?fields=id,name`, jsonBody('POST', { name, mimeType: FOLDER, parents: parent ? [parent] : [], appProperties }))
  }

  async umbenennen(id, name) {
    await api(`${DRIVE}/${id}?fields=id`, jsonBody('PATCH', { name }))
  }

  async papierkorb(id) {
    try {
      await api(`${DRIVE}/${id}?fields=id`, jsonBody('PATCH', { trashed: true }))
    } catch (e) {
      if (e.status !== 404) throw e
    }
  }

  async hochladen(blob, name, parent, onProgress, erneut = true) {
    const grenze = 'burgen' + Math.random().toString(36).slice(2)
    const meta = { name, parents: [parent], mimeType: blob.type || 'image/jpeg' }
    const body = new Blob([
      `--${grenze}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${grenze}\r\nContent-Type: ${meta.mimeType}\r\n\r\n`, blob, `\r\n--${grenze}--`,
    ])
    const token = await tokenHolen()
    const r = await xhrUpload(`${UPLOAD}?uploadType=multipart&fields=id`, body, `multipart/related; boundary=${grenze}`, token, onProgress)
    if (r.status === 401 && erneut) {
      await neuAnmelden()
      return this.hochladen(blob, name, parent, onProgress, false)
    }
    if (r.status === 0 || r.status >= 500 || r.status === 429) throw new NetzFehler(`Hochladen fehlgeschlagen (${r.status || 'keine Antwort'}).`)
    if (r.status < 200 || r.status >= 300) {
      let msg = ''
      try {
        msg = JSON.parse(r.text).error?.message || ''
      } catch {
        /* kein JSON */
      }
      throw new ApiFehler(r.status, `Google meldet (${r.status}): ${msg}`)
    }
    return JSON.parse(r.text).id
  }

  async herunterladen(id) {
    return (await api(`${DRIVE}/${id}?alt=media`)).blob()
  }

  async benutzer() {
    const r = await json('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)')
    return r.user
  }

  // ---------- Struktur anlegen / finden ----------

  async init() {
    const ok = async (id) => {
      if (!id) return false
      try {
        const f = await json(`${DRIVE}/${id}?fields=id,trashed`)
        return !f.trashed
      } catch {
        return false
      }
    }
    if ((await ok(this.ids.root)) && (await ok(this.ids.sheet)) && (await ok(this.ids.bilder))) return

    let root = await this.suche('root')
    if (!root) root = await this.ordnerAnlegen('Burgen-Erfassung', null, { burgenApp: 'root' })
    let bilder = await this.suche('bilder')
    if (!bilder) bilder = await this.ordnerAnlegen('Bilder', root.id, { burgenApp: 'bilder' })
    let sheet = await this.suche('db')
    if (!sheet) sheet = await this.tabelleAnlegen(root.id)

    this.ids = { root: root.id, bilder: bilder.id, sheet: sheet.id }
    localStorage.setItem('google.ids', JSON.stringify(this.ids))
  }

  async tabelleAnlegen(parent) {
    const f = await json(`${DRIVE}?fields=id`, jsonBody('POST', {
      name: 'Burgen-DB', mimeType: 'application/vnd.google-apps.spreadsheet', parents: [parent], appProperties: { burgenApp: 'db' },
    }))
    const meta = await json(`${SHEETS}/${f.id}?fields=sheets.properties`)
    const erstes = meta.sheets[0].properties.sheetId
    await api(`${SHEETS}/${f.id}:batchUpdate`, jsonBody('POST', {
      requests: [
        { updateSheetProperties: { properties: { sheetId: erstes, title: 'Burgen', gridProperties: { frozenRowCount: 1, columnCount: 60 } }, fields: 'title,gridProperties.frozenRowCount,gridProperties.columnCount' } },
        ...TABS.slice(1).map((title) => ({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } })),
      ],
    }))
    return f
  }

  get links() {
    return {
      ordner: this.ids.root ? `https://drive.google.com/drive/folders/${this.ids.root}` : '',
      tabelle: this.ids.sheet ? `https://docs.google.com/spreadsheets/d/${this.ids.sheet}` : '',
    }
  }

  // ---------- Tabelle lesen / schreiben ----------

  async laden() {
    const q = TABS.map((t) => `ranges=${encodeURIComponent(t)}`).join('&')
    const r = await json(`${SHEETS}/${this.ids.sheet}/values:batchGet?${q}&valueRenderOption=UNFORMATTED_VALUE`)
    const [burgen, bilder, katalog, meta] = r.valueRanges.map((v) => v.values || [])
    return {
      burgen: ausZeilen(burgen),
      bilder: ausZeilen(bilder),
      katalog: ausZeilen(katalog),
      meta: Object.fromEntries(meta.slice(1).map(([k, v]) => [k, v == null ? '' : String(v)])),
    }
  }

  async speichern({ burgen, bilder, katalog, meta }) {
    const daten = {
      Burgen: zuZeilen(BURG_COLS, burgen),
      Bilder: zuZeilen(BILD_COLS, bilder),
      Katalog: zuZeilen(KAT_COLS, katalog),
      Meta: [['schluessel', 'wert'], ...Object.entries(meta)],
    }
    // Tabellenblätter groß genug machen
    const info = await json(`${SHEETS}/${this.ids.sheet}?fields=sheets.properties`)
    const requests = []
    for (const s of info.sheets) {
      const p = s.properties
      const d = daten[p.title]
      if (!d) continue
      const zeilen = Math.max(p.gridProperties.rowCount, d.length + 100)
      const spalten = Math.max(p.gridProperties.columnCount, d[0].length + 5)
      if (zeilen !== p.gridProperties.rowCount || spalten !== p.gridProperties.columnCount) {
        requests.push({ updateSheetProperties: { properties: { sheetId: p.sheetId, gridProperties: { rowCount: zeilen, columnCount: spalten } }, fields: 'gridProperties.rowCount,gridProperties.columnCount' } })
      }
    }
    if (requests.length) await api(`${SHEETS}/${this.ids.sheet}:batchUpdate`, jsonBody('POST', { requests }))

    // Erst schreiben, dann überzählige alte Zeilen leeren – so gibt es keinen Moment mit leerer Tabelle
    await api(`${SHEETS}/${this.ids.sheet}/values:batchUpdate`, jsonBody('POST', {
      valueInputOption: 'RAW',
      data: Object.entries(daten).map(([tab, values]) => ({ range: `${tab}!A1`, values })),
    }))
    await api(`${SHEETS}/${this.ids.sheet}/values:batchClear`, jsonBody('POST', {
      ranges: Object.entries(daten).map(([tab, v]) => `${tab}!A${v.length + 1}:${spalte(v[0].length)}`),
    }))
  }

  // ---------- Bilderordner je Burg ----------

  async burgOrdner(burg, vorhandeneId) {
    const name = `${burg.id}_${sicher(burg.name)}`
    if (vorhandeneId) {
      try {
        await this.umbenennen(vorhandeneId, name)
        return vorhandeneId
      } catch (e) {
        if (e.status !== 404) throw e
      }
    }
    return (await this.ordnerAnlegen(name, this.ids.bilder, { burgId: burg.id })).id
  }
}
