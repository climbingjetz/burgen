// PDF-Datenblatt (A4) für eine oder mehrere Burgen.
// pdfmake wird erst beim ersten Export nachgeladen (ca. 1 MB inkl. Schrift).
import { SECTIONS, STATUS, hasCoords } from '../fields.js'
import { getBilder } from '../store.js'
import { dateiBasis } from './export.js'

const ACCENT = '#7a2e1d'
const MUTED = '#7a6e66'
const LINE = '#e3d9cc'
const SOFT = '#f6f1e9'
const PAGE_W = 595.28 - 2 * 40 // A4 abzüglich Rand

let pdfMakePromise
async function loadPdfMake() {
  pdfMakePromise ||= (async () => {
    const pdfMake = (await import('pdfmake/build/pdfmake')).default
    const vfs = (await import('pdfmake/build/vfs_fonts')).default
    pdfMake.addVirtualFileSystem(vfs)
    return pdfMake
  })()
  return pdfMakePromise
}

// ---------- Bild-Hilfen ----------

// Schneidet ein Bild auf das gewünschte Seitenverhältnis zu (wie CSS object-fit: cover)
async function coverDataUrl(blob, ratio, maxW = 1400) {
  const img = await createImageBitmap(blob)
  let sw = img.width, sh = img.height, sx = 0, sy = 0
  if (sw / sh > ratio) { sw = sh * ratio; sx = (img.width - sw) / 2 } else { sh = sw / ratio; sy = (img.height - sh) / 2 }
  const w = Math.min(maxW, Math.round(sw))
  const c = document.createElement('canvas')
  c.width = w
  c.height = Math.round(w / ratio)
  c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height)
  img.close?.()
  return c.toDataURL('image/jpeg', 0.85)
}

// Statischer Kartenausschnitt aus OpenStreetMap-Kacheln mit Markierung
async function karteDataUrl(lat, lon, zoom = 15, w = 600, h = 400) {
  const n = 2 ** zoom
  const xf = ((lon + 180) / 360) * n
  const yf = ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n
  const px = xf * 256, py = yf * 256
  const left = px - w / 2, top = py - h / 2
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  const load = (x, y) =>
    new Promise((res, rej) => {
      const i = new Image()
      i.crossOrigin = 'anonymous'
      i.onload = () => res(i)
      i.onerror = rej
      i.src = `https://tile.openstreetmap.org/${zoom}/${((x % n) + n) % n}/${y}.png`
    })
  const jobs = []
  for (let x = Math.floor(left / 256); x <= Math.floor((left + w) / 256); x++) {
    for (let y = Math.floor(top / 256); y <= Math.floor((top + h) / 256); y++) {
      jobs.push(load(x, y).then((i) => g.drawImage(i, x * 256 - left, y * 256 - top)))
    }
  }
  await Promise.all(jobs)
  // Markierung
  g.beginPath()
  g.arc(w / 2, h / 2, 11, 0, Math.PI * 2)
  g.fillStyle = ACCENT
  g.fill()
  g.lineWidth = 4
  g.strokeStyle = '#fff'
  g.stroke()
  return c.toDataURL('image/png')
}

// ---------- Text-Hilfen ----------

function dms(v, pos, neg) {
  const a = Math.abs(v)
  const d = Math.floor(a)
  const m = Math.floor((a - d) * 60)
  const s = ((a - d - m / 60) * 3600).toFixed(1).replace('.', ',')
  return `${d}° ${m}' ${s}" ${v >= 0 ? pos : neg}`
}

const deDatum = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d) ? iso : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function wert(f, b, label) {
  const v = b[f.key]
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) return ''
  switch (f.type) {
    case 'kat': return label(f.katalog, v)
    case 'katMulti': return v.map((k) => label(f.katalog, k)).join(', ')
    case 'status': return STATUS.find((s) => s.key === v)?.label || v
    case 'date': return deDatum(v)
    case 'rating': return v ? `${v} von 5` : ''
    default: return String(v)
  }
}

const sectionTitle = (text) => ({
  stack: [
    { text: text.toUpperCase(), style: 'sectionTitle' },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: PAGE_W, y2: 0, lineWidth: 0.6, lineColor: LINE }] },
  ],
  margin: [0, 14, 0, 6],
})

// Kurze Felder werden als Steckbrief-Tabelle ausgegeben, lange Texte als Absätze
const LANGTEXT = ['textarea']
const OHNE = ['name', 'altNamen', 'status']

// ---------- Aufbau einer Burg ----------

async function burgInhalt(b, label, { mitKarte, bilder: vorgabe }) {
  const bilder = (vorgabe?.[b.id] ?? (await getBilder(b.id))).filter((x) => x.blob)
  const out = []

  // Kopf
  const ort = [b.gemeinde, label('REGION', b.region), label('LAND', b.land)].filter(Boolean).join(', ')
  const typ = [label('ART', b.art), label('ZUSTAND', b.zustand)].filter(Boolean).join(' · ')
  out.push({
    table: {
      widths: ['*', 'auto'],
      body: [[
        {
          stack: [
            { text: b.name || '(ohne Namen)', style: 'title' },
            b.altNamen ? { text: b.altNamen, style: 'subtitle' } : null,
            { text: [typ, ort].filter(Boolean).join('   |   '), style: 'meta', margin: [0, 4, 0, 0] },
          ].filter(Boolean),
        },
        {
          stack: [
            { text: b.id, style: 'idText' },
            { text: STATUS.find((s) => s.key === b.status)?.label || '', style: 'status' },
          ],
          alignment: 'right',
        },
      ]],
    },
    layout: {
      fillColor: () => SOFT,
      hLineWidth: (i) => (i === 1 ? 3 : 0),
      hLineColor: () => ACCENT,
      vLineWidth: () => 0,
      paddingLeft: () => 12, paddingRight: () => 12, paddingTop: () => 10, paddingBottom: () => 10,
    },
    margin: [0, 0, 0, 12],
  })

  // Hauptbild
  if (bilder[0]) {
    out.push({ image: await coverDataUrl(bilder[0].blob, 2), width: PAGE_W, margin: [0, 0, 0, 2] })
    if (bilder[0].caption) out.push({ text: bilder[0].caption, style: 'caption' })
  }

  // Steckbrief (kurze Felder) – je Abschnitt eine Zwischenzeile
  const rows = []
  for (const s of SECTIONS) {
    if (s.special || !s.fields) continue
    const felder = s.fields
      .filter((f) => !LANGTEXT.includes(f.type) && !OHNE.includes(f.key))
      .map((f) => [f.label, wert(f, b, label)])
      .filter(([, v]) => v)
    if (!felder.length) continue
    rows.push([{ text: s.title, style: 'tableGroup', colSpan: 2 }, ''])
    for (const [k, v] of felder) rows.push([{ text: k, style: 'key' }, { text: v, style: 'val' }])
  }
  const steckbrief = rows.length
    ? {
        table: { widths: [105, '*'], body: rows },
        layout: {
          hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0 : 0.5),
          hLineColor: () => LINE,
          vLineWidth: () => 0,
          paddingTop: () => 3, paddingBottom: () => 3, paddingLeft: () => 2,
        },
      }
    : { text: 'Keine weiteren Angaben.', style: 'muted' }

  // Geodaten-Spalte
  const geo = []
  if (hasCoords(b)) {
    if (mitKarte) {
      try {
        geo.push({ image: await karteDataUrl(b.lat, b.lon), width: 200 })
        geo.push({ text: '© OpenStreetMap-Mitwirkende', style: 'attribution' })
      } catch {
        /* offline – Karte weglassen */
      }
    }
    const zeilen = [
      ['Breite', `${b.lat.toFixed(6)}°`],
      ['Länge', `${b.lon.toFixed(6)}°`],
      ['', `${dms(b.lat, 'N', 'S')}\n${dms(b.lon, 'O', 'W')}`],
      ['Höhe', b.hoehe != null ? `${b.hoehe} m ü. NN` : ''],
      ['Genauigkeit', b.genauigkeit != null ? `± ${b.genauigkeit} m` : ''],
      ['Quelle', label('KOORDQUELLE', b.koordQuelle)],
      ['Erfasst', deDatum(b.gpsZeit)],
    ].filter(([, v]) => v)
    geo.push({
      table: { widths: [55, '*'], body: zeilen.map(([k, v]) => [{ text: k, style: 'key' }, { text: v, style: 'val' }]) },
      layout: 'noBorders',
      margin: [0, 6, 0, 0],
    })
  } else {
    geo.push({ text: 'Keine Koordinaten erfasst.', style: 'muted' })
  }

  out.push(sectionTitle('Steckbrief'))
  out.push({
    columns: [
      { width: '*', stack: [steckbrief] },
      { width: 200, stack: [{ text: 'Lage', style: 'tableGroup', margin: [0, 0, 0, 4] }, ...geo] },
    ],
    columnGap: 18,
  })

  // Lange Texte
  for (const s of SECTIONS) {
    if (s.special || !s.fields) continue
    for (const f of s.fields.filter((f) => LANGTEXT.includes(f.type))) {
      const v = (b[f.key] || '').trim()
      if (!v) continue
      out.push(sectionTitle(f.label))
      out.push({ text: v, style: 'body' })
    }
  }

  // Galerie
  if (bilder.length > 1) {
    const w = (PAGE_W - 2 * 10) / 3
    const cols = []
    for (const bi of bilder.slice(1)) {
      cols.push({
        width: w,
        stack: [
          { image: await coverDataUrl(bi.blob, 3 / 2, 700), width: w },
          { text: [bi.caption, deDatum(bi.datum)].filter(Boolean).join(' · '), style: 'caption' },
        ],
      })
    }
    // Überschrift und Bilder zusammenhalten (kein Seitenumbruch dazwischen)
    out.push({ stack: [sectionTitle('Bilder'), { columns: cols, columnGap: 10 }], unbreakable: true })
  }

  return out
}

// ---------- Öffentliche Funktion ----------

// bilder: optional { burgId: [...] } – z. B. noch nicht gespeicherte Bilder aus dem Formular
export async function erzeugePdf(list, label, { mitKarte = true, bilder } = {}) {
  const pdfMake = await loadPdfMake()
  const content = []
  for (let i = 0; i < list.length; i++) {
    const teil = await burgInhalt(list[i], label, { mitKarte, bilder })
    if (i > 0) teil[0].pageBreak = 'before'
    content.push(...teil)
  }
  const erstellt = new Date().toLocaleDateString('de-DE')

  const doc = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    info: { title: list.length === 1 ? list[0].name : 'Burgen', creator: 'Burgen-Erfassung' },
    content,
    footer: (page, pages) => ({
      columns: [
        { text: `Burgen-Erfassung · erstellt ${erstellt}`, style: 'footer' },
        { text: `Seite ${page} / ${pages}`, style: 'footer', alignment: 'right' },
      ],
      margin: [40, 18, 40, 0],
    }),
    defaultStyle: { font: 'Roboto', fontSize: 9.5, lineHeight: 1.25, color: '#2b2420' },
    styles: {
      title: { fontSize: 22, bold: true, color: ACCENT },
      subtitle: { fontSize: 11, italics: true, color: MUTED },
      meta: { fontSize: 10, color: '#2b2420' },
      idText: { fontSize: 8, color: MUTED },
      status: { fontSize: 9, bold: true, color: ACCENT, margin: [0, 3, 0, 0] },
      sectionTitle: { fontSize: 9, bold: true, color: ACCENT, characterSpacing: 1, margin: [0, 0, 0, 3] },
      tableGroup: { fontSize: 9, bold: true, color: ACCENT, margin: [0, 4, 0, 0] },
      key: { fontSize: 8.5, color: MUTED },
      val: { fontSize: 9.5 },
      body: { fontSize: 10, lineHeight: 1.35, alignment: 'justify' },
      caption: { fontSize: 8, italics: true, color: MUTED, margin: [0, 2, 0, 6] },
      attribution: { fontSize: 6, color: MUTED, alignment: 'right' },
      muted: { color: MUTED, italics: true },
      footer: { fontSize: 7.5, color: MUTED },
    },
  }

  return pdfMake.createPdf(doc)
}

export async function exportPdf(list, label, opts) {
  const pdf = await erzeugePdf(list, label, opts)
  await pdf.download(`${dateiBasis(list)}.pdf`)
}
