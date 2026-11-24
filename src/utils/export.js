import { ALL_FIELDS, STATUS, hasCoords } from '../fields.js'

// Exportwert eines Feldes: Katalogschlüssel werden in den Anzeigetext übersetzt.
function val(f, b, label) {
  const v = b[f.key]
  if (v == null || v === '') return ''
  if (f.type === 'kat') return label(f.katalog, v)
  if (f.type === 'katMulti') return (v || []).map((k) => label(f.katalog, k)).join('; ')
  if (f.type === 'status') return STATUS.find((s) => s.key === v)?.label || v
  if (f.type === 'rating') return v || ''
  return v
}

const COLS = [{ key: 'id' }, ...ALL_FIELDS, { key: 'erstellt' }, { key: 'geaendert' }]

export function toCSV(list, label) {
  const esc = (s) => `"${String(s).replace(/"/g, '""')}"`
  const lines = [COLS.map((c) => c.key).join(',')]
  for (const b of list) {
    lines.push(COLS.map((c) => { const v = val(c, b, label); return typeof v === 'number' ? String(v) : esc(v) }).join(','))
  }
  return '﻿' + lines.join('\r\n') + '\r\n'
}

const xml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function toGPX(list, label) {
  const wpts = list.filter(hasCoords).map((b) => {
    const desc = [
      label('ART', b.art), label('ZUSTAND', b.zustand),
      [b.gemeinde, label('REGION', b.region), label('LAND', b.land)].filter(Boolean).join(', '),
      b.id,
    ].filter(Boolean).join(' · ')
    return [
      `  <wpt lat="${b.lat}" lon="${b.lon}">`,
      typeof b.hoehe === 'number' ? `    <ele>${b.hoehe}</ele>` : '',
      `    <name>${xml(b.name)}</name>`,
      `    <desc>${xml(desc)}</desc>`,
      b.website ? `    <link href="${xml(b.website)}"><text>Website</text></link>` : '',
      b.art ? `    <type>${xml(label('ART', b.art))}</type>` : '',
      `  </wpt>`,
    ].filter(Boolean).join('\n')
  })
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Burgen-Erfassung" xmlns="http://www.topografix.com/GPX/1/1">',
    `  <metadata><name>Burgen</name><time>${new Date().toISOString()}</time></metadata>`,
    ...wpts,
    '</gpx>',
    '',
  ].join('\n')
}

export function toGeoJSON(list, label) {
  return JSON.stringify(
    {
      type: 'FeatureCollection',
      features: list.filter(hasCoords).map((b) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: typeof b.hoehe === 'number' ? [b.lon, b.lat, b.hoehe] : [b.lon, b.lat] },
        properties: Object.fromEntries(COLS.map((c) => [c.key, val(c, b, label)])),
      })),
    },
    null,
    2,
  )
}

export function download(filename, content, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

const FORMATS = {
  csv: { ext: 'csv', mime: 'text/csv;charset=utf-8', fn: toCSV },
  gpx: { ext: 'gpx', mime: 'application/gpx+xml', fn: toGPX },
  geojson: { ext: 'geojson', mime: 'application/geo+json', fn: toGeoJSON },
}

export const today = () => new Date().toISOString().slice(0, 10)

export function dateiBasis(list) {
  if (list.length === 1) {
    const b = list[0]
    return `${b.id}_${(b.name || 'burg').replace(/[^\wäöüÄÖÜß-]+/g, '_')}`
  }
  return `burgen_${today()}`
}

// Gibt die Anzahl der Datensätze zurück, die mangels Koordinaten fehlen
export function exportiere(format, list, label) {
  const f = FORMATS[format]
  download(`${dateiBasis(list)}.${f.ext}`, f.fn(list, label), f.mime)
  return format === 'csv' ? 0 : list.filter((b) => !hasCoords(b)).length
}
