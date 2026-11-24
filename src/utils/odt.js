// Export als Textdokument im OpenDocument-Format (.odt).
// Öffnet in LibreOffice/OpenOffice Writer (Open Source), Microsoft Word, Google Docs u. a. – und ist dort bearbeitbar.
import { zipSync, strToU8 } from 'fflate'
import { SECTIONS, STATUS, GEO_FIELDS, hasCoords } from '../fields.js'
import { getBilder, getDateien } from '../store.js'
import { coverDataUrl, karteDataUrl, dms, wert } from './pdf.js'
import { dateiBasis, download } from './export.js'
import { mb } from './format.js'

const x = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Text mit Zeilenumbrüchen → mehrere Absätze
const absaetze = (text, stil = 'Text') =>
  String(text)
    .split(/\r?\n/)
    .map((z) => `<text:p text:style-name="${stil}">${x(z)}</text:p>`)
    .join('')

function dataUrlBytes(url) {
  const b64 = url.slice(url.indexOf(',') + 1)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const STYLES = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
 xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.3">
<office:font-face-decls>
 <style:font-face style:name="Liberation Sans" svg:font-family="'Liberation Sans', Arial" style:font-family-generic="swiss"/>
</office:font-face-decls>
<office:styles>
 <style:default-style style:family="paragraph">
  <style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.12cm"/>
  <style:text-properties style:font-name="Liberation Sans" fo:font-size="10pt" fo:language="de" fo:country="DE" fo:color="#2b2420"/>
 </style:default-style>
 <style:style style:name="Standard" style:family="paragraph" style:class="text"/>
 <style:style style:name="Text" style:family="paragraph" style:parent-style-name="Standard">
  <style:paragraph-properties fo:margin-bottom="0.15cm" fo:line-height="125%"/>
 </style:style>
 <style:style style:name="Titel" style:family="paragraph" style:parent-style-name="Standard" style:class="chapter">
  <style:paragraph-properties fo:margin-bottom="0.05cm"/>
  <style:text-properties fo:font-size="22pt" fo:font-weight="bold" fo:color="#7a2e1d"/>
 </style:style>
 <style:style style:name="Untertitel" style:family="paragraph" style:parent-style-name="Standard">
  <style:text-properties fo:font-size="11pt" fo:font-style="italic" fo:color="#7a6e66"/>
 </style:style>
 <style:style style:name="Meta" style:family="paragraph" style:parent-style-name="Standard">
  <style:paragraph-properties fo:margin-bottom="0.35cm" fo:padding-bottom="0.15cm" fo:border-bottom="2.5pt solid #7a2e1d"/>
  <style:text-properties fo:font-size="10.5pt" fo:color="#7a6e66"/>
 </style:style>
 <style:style style:name="Abschnitt" style:family="paragraph" style:parent-style-name="Standard" style:default-outline-level="2" style:class="text">
  <style:paragraph-properties fo:margin-top="0.45cm" fo:margin-bottom="0.15cm" fo:padding-bottom="0.05cm" fo:border-bottom="0.5pt solid #e3d9cc" fo:keep-with-next="always"/>
  <style:text-properties fo:font-size="11pt" fo:font-weight="bold" fo:color="#7a2e1d" fo:text-transform="uppercase" fo:letter-spacing="0.03cm"/>
 </style:style>
 <style:style style:name="Unterueberschrift" style:family="paragraph" style:parent-style-name="Standard">
  <style:paragraph-properties fo:margin-top="0.2cm" fo:margin-bottom="0.05cm" fo:keep-with-next="always"/>
  <style:text-properties fo:font-weight="bold"/>
 </style:style>
 <style:style style:name="Feldname" style:family="paragraph" style:parent-style-name="Standard">
  <style:paragraph-properties fo:margin-bottom="0cm"/>
  <style:text-properties fo:font-size="9pt" fo:color="#7a6e66"/>
 </style:style>
 <style:style style:name="Feldwert" style:family="paragraph" style:parent-style-name="Standard">
  <style:paragraph-properties fo:margin-bottom="0cm"/>
 </style:style>
 <style:style style:name="Bildunterschrift" style:family="paragraph" style:parent-style-name="Standard">
  <style:paragraph-properties fo:margin-top="0.05cm" fo:margin-bottom="0.25cm"/>
  <style:text-properties fo:font-size="8.5pt" fo:font-style="italic" fo:color="#7a6e66"/>
 </style:style>
 <style:style style:name="Bild" style:family="paragraph" style:parent-style-name="Standard">
  <style:paragraph-properties fo:text-align="center" fo:margin-bottom="0cm"/>
 </style:style>
 <style:style style:name="Fusszeile" style:family="paragraph" style:parent-style-name="Standard">
  <style:paragraph-properties fo:text-align="center"/>
  <style:text-properties fo:font-size="8pt" fo:color="#7a6e66"/>
 </style:style>
</office:styles>
<office:automatic-styles>
 <style:page-layout style:name="A4">
  <style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" style:print-orientation="portrait"
   fo:margin-top="1.6cm" fo:margin-bottom="1.4cm" fo:margin-left="2cm" fo:margin-right="2cm"/>
  <style:footer-style><style:header-footer-properties fo:min-height="0.6cm" fo:margin-top="0.3cm"/></style:footer-style>
 </style:page-layout>
</office:automatic-styles>
<office:master-styles>
 <style:master-page style:name="Standard" style:page-layout-name="A4">
  <style:footer><text:p text:style-name="Fusszeile">Burgen-Erfassung · Seite <text:page-number text:select-page="current"/></text:p></style:footer>
 </style:master-page>
</office:master-styles>
</office:document-styles>`

const AUTO = `<office:automatic-styles>
 <style:style style:name="Seitenumbruch" style:family="paragraph" style:parent-style-name="Titel"><style:paragraph-properties fo:break-before="page"/></style:style>
 <style:style style:name="Steckbrief" style:family="table"><style:table-properties style:width="17cm" table:align="left" fo:margin-bottom="0.2cm"/></style:style>
 <style:style style:name="Steckbrief.A" style:family="table-column"><style:table-column-properties style:column-width="5cm"/></style:style>
 <style:style style:name="Steckbrief.B" style:family="table-column"><style:table-column-properties style:column-width="12cm"/></style:style>
 <style:style style:name="Zelle" style:family="table-cell"><style:table-cell-properties fo:padding-top="0.08cm" fo:padding-bottom="0.08cm" fo:padding-left="0.1cm" fo:padding-right="0.1cm" fo:border-bottom="0.5pt solid #e3d9cc" fo:border-top="none" fo:border-left="none" fo:border-right="none"/></style:style>
 <style:style style:name="ZelleName" style:family="table-cell"><style:table-cell-properties fo:background-color="#f6f1e9" fo:padding-top="0.08cm" fo:padding-bottom="0.08cm" fo:padding-left="0.15cm" fo:padding-right="0.1cm" fo:border-bottom="0.5pt solid #e3d9cc" fo:border-top="none" fo:border-left="none" fo:border-right="none"/></style:style>
 <style:style style:name="Galerie" style:family="table"><style:table-properties style:width="17cm" table:align="left"/></style:style>
 <style:style style:name="Galerie.A" style:family="table-column"><style:table-column-properties style:column-width="8.5cm"/></style:style>
 <style:style style:name="GalerieZelle" style:family="table-cell"><style:table-cell-properties fo:padding="0.1cm" fo:border="none"/></style:style>
 <style:style style:name="Rahmen" style:family="graphic"><style:graphic-properties style:vertical-pos="top" style:vertical-rel="baseline" style:horizontal-pos="center" style:horizontal-rel="paragraph" fo:border="none" style:wrap="none"/></style:style>
</office:automatic-styles>`

async function burgOdt(b, label, bilderPakete, nummer) {
  const out = []
  const bild = (bytes, breite, hoehe, ext = 'jpg') => {
    const name = `Pictures/b${bilderPakete.length + 1}.${ext}`
    bilderPakete.push([name, bytes])
    return `<draw:frame draw:style-name="Rahmen" text:anchor-type="as-char" svg:width="${breite}cm" svg:height="${hoehe}cm" draw:z-index="0"><draw:image xlink:href="${name}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>`
  }

  // Kopf
  const ort = [b.gemeinde, label('REGION', b.region), label('LAND', b.land)].filter(Boolean).join(', ')
  const typ = [label('ART', b.art), label('ZUSTAND', b.zustand)].filter(Boolean).join(' · ')
  const status = STATUS.find((s) => s.key === b.status)?.label || ''
  out.push(`<text:h text:style-name="${nummer > 0 ? 'Seitenumbruch' : 'Titel'}" text:outline-level="1">${x(b.name || '(ohne Namen)')}</text:h>`)
  if (b.altNamen) out.push(`<text:p text:style-name="Untertitel">${x(b.altNamen)}</text:p>`)
  out.push(`<text:p text:style-name="Meta">${x([typ, ort, status, b.id].filter(Boolean).join('   |   '))}</text:p>`)

  // Hauptbild
  const bilder = (await getBilder(b.id)).filter((i) => i.blob)
  if (bilder[0]) {
    out.push(`<text:p text:style-name="Bild">${bild(dataUrlBytes(await coverDataUrl(bilder[0].blob, 2)), 17, 8.5)}</text:p>`)
    out.push(`<text:p text:style-name="Bildunterschrift">${x(bilder[0].caption || '')}</text:p>`)
  }

  const tabelle = (zeilen) =>
    `<table:table table:name="T${Math.random().toString(36).slice(2, 8)}" table:style-name="Steckbrief"><table:table-column table:style-name="Steckbrief.A"/><table:table-column table:style-name="Steckbrief.B"/>${zeilen
      .map(([n, v]) => `<table:table-row><table:table-cell table:style-name="ZelleName" office:value-type="string"><text:p text:style-name="Feldname">${x(n)}</text:p></table:table-cell><table:table-cell table:style-name="Zelle" office:value-type="string"><text:p text:style-name="Feldwert">${x(v)}</text:p></table:table-cell></table:table-row>`)
      .join('')}</table:table>`

  for (const s of SECTIONS) {
    if (s.special === 'bilder') continue
    if (s.special === 'geo') {
      if (!hasCoords(b)) continue
      out.push(`<text:h text:style-name="Abschnitt" text:outline-level="2">${x(s.title)}</text:h>`)
      const zeilen = [
        ['Koordinaten (WGS 84)', `${Number(b.lat).toFixed(6)}, ${Number(b.lon).toFixed(6)}`],
        ['Grad/Minuten/Sekunden', `${dms(Number(b.lat), 'N', 'S')}   ${dms(Number(b.lon), 'O', 'W')}`],
      ]
      for (const f of GEO_FIELDS.filter((g) => !['lat', 'lon'].includes(g.key))) {
        const v = wert(f, b, label)
        if (v) zeilen.push([f.label, f.key === 'gpsZeit' ? new Date(v).toLocaleString('de-DE') : v])
      }
      out.push(tabelle(zeilen))
      try {
        const karte = await karteDataUrl(Number(b.lat), Number(b.lon), 15, 900, 520)
        out.push(`<text:p text:style-name="Bild">${bild(dataUrlBytes(karte), 17, 9.82, 'png')}</text:p>`)
        out.push(`<text:p text:style-name="Bildunterschrift">Karte: © OpenStreetMap-Mitwirkende</text:p>`)
      } catch {
        /* offline – ohne Karte */
      }
      continue
    }
    const kurz = []
    const lang = []
    for (const f of s.fields) {
      if (f.key === 'name') continue
      const v = wert(f, b, label)
      if (!v) continue
      if (f.type === 'textarea') lang.push([f.label, v])
      else kurz.push([f.label, v])
    }
    if (!kurz.length && !lang.length) continue
    out.push(`<text:h text:style-name="Abschnitt" text:outline-level="2">${x(s.title)}</text:h>`)
    if (kurz.length) out.push(tabelle(kurz))
    for (const [n, v] of lang) {
      out.push(`<text:p text:style-name="Unterueberschrift">${x(n)}</text:p>`)
      out.push(absaetze(v))
    }
  }

  // weitere Bilder als Galerie, zwei je Zeile
  if (bilder.length > 1) {
    out.push(`<text:h text:style-name="Abschnitt" text:outline-level="2">Bilder</text:h>`)
    const zellen = []
    for (const bi of bilder.slice(1)) {
      zellen.push(`<table:table-cell table:style-name="GalerieZelle" office:value-type="string"><text:p text:style-name="Bild">${bild(dataUrlBytes(await coverDataUrl(bi.blob, 3 / 2, 900)), 8.2, 5.47)}</text:p><text:p text:style-name="Bildunterschrift">${x(bi.caption || '')}</text:p></table:table-cell>`)
    }
    if (zellen.length % 2) zellen.push('<table:table-cell table:style-name="GalerieZelle"><text:p/></table:table-cell>')
    let zeilen = ''
    for (let i = 0; i < zellen.length; i += 2) zeilen += `<table:table-row>${zellen[i]}${zellen[i + 1]}</table:table-row>`
    out.push(`<table:table table:name="G${nummer}" table:style-name="Galerie"><table:table-column table:style-name="Galerie.A" table:number-columns-repeated="2"/>${zeilen}</table:table>`)
  }

  // Zusatzdateien als Liste mit Links
  const dateien = await getDateien(b.id)
  if (dateien.length) {
    out.push(`<text:h text:style-name="Abschnitt" text:outline-level="2">Dateien</text:h>`)
    for (const d of dateien) {
      const name = d.driveId
        ? `<text:a xlink:type="simple" xlink:href="https://drive.google.com/file/d/${x(d.driveId)}/view">${x(d.name)}</text:a>`
        : x(d.name)
      out.push(`<text:p text:style-name="Text">${name} <text:span>(${x(mb(d.groesse))}${d.driveId ? ', in Google Drive' : ', nur auf dem Gerät'})</text:span></text:p>`)
    }
  }

  const geaendert = b.geaendert ? new Date(b.geaendert).toLocaleString('de-DE') : ''
  out.push(`<text:p text:style-name="Fusszeile">Stand: ${x(geaendert)} · erstellt am ${x(new Date().toLocaleDateString('de-DE'))}</text:p>`)
  return out.join('\n')
}

export async function erzeugeOdt(list, label) {
  const bilder = []
  const teile = []
  for (let i = 0; i < list.length; i++) teile.push(await burgOdt(list[i], label, bilder, i))

  const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
 xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
 xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.3">
${AUTO}
<office:body><office:text>
${teile.join('\n')}
</office:text></office:body></office:document-content>`

  const meta = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.3">
<office:meta><meta:generator>Burgen-Erfassung</meta:generator><dc:title>${x(list.length === 1 ? list[0].name : 'Burgen')}</dc:title><meta:creation-date>${new Date().toISOString().slice(0, 19)}</meta:creation-date></office:meta>
</office:document-meta>`

  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">
 <manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.text"/>
 <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
 <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
 <manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>
${bilder.map(([n]) => ` <manifest:file-entry manifest:full-path="${n}" manifest:media-type="${n.endsWith('.png') ? 'image/png' : 'image/jpeg'}"/>`).join('\n')}
</manifest:manifest>`

  // "mimetype" muss als erste Datei unkomprimiert im Archiv stehen
  const dateien = {
    mimetype: [strToU8('application/vnd.oasis.opendocument.text'), { level: 0 }],
    'content.xml': strToU8(content),
    'styles.xml': strToU8(STYLES),
    'meta.xml': strToU8(meta),
    'META-INF/manifest.xml': strToU8(manifest),
  }
  for (const [n, bytes] of bilder) dateien[n] = [bytes, { level: 0 }]
  return new Blob([zipSync(dateien)], { type: 'application/vnd.oasis.opendocument.text' })
}

export async function exportOdt(list, label) {
  download(`${dateiBasis(list)}.odt`, await erzeugeOdt(list, label))
}
