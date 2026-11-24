// Zentrale Definition des Datenmodells. Formular, Export und Katalog-Verwendung
// werden aus diesen Listen erzeugt – neue Felder nur hier ergänzen.

export const STATUS = [
  { key: 'feld', label: 'Feld-Entwurf' },
  { key: 'vollstaendig', label: 'Vollständig' },
  { key: 'geprueft', label: 'Geprüft' },
]

export const KATALOGE = [
  { key: 'ART', label: 'Burgtyp' },
  { key: 'ZUSTAND', label: 'Erhaltungszustand' },
  { key: 'BAUTEIL', label: 'Bauteile' },
  { key: 'MATERIAL', label: 'Baumaterial' },
  { key: 'STAND', label: 'Bauherrenstand' },
  { key: 'LAND', label: 'Land' },
  { key: 'REGION', label: 'Bundesland / Region', parent: 'LAND' },
  { key: 'JAHRHUNDERT', label: 'Jahrhundert' },
  { key: 'ZERSTOERUNG', label: 'Zerstörungsursache' },
  { key: 'EIGENTUEMER', label: 'Eigentümer' },
  { key: 'NUTZUNG', label: 'Heutige Nutzung' },
  { key: 'ZUGANG', label: 'Zugänglichkeit' },
  { key: 'KOORDQUELLE', label: 'Koordinatenquelle' },
]

export const GEO_FIELDS = [
  { key: 'lat', label: 'Breitengrad', type: 'number' },
  { key: 'lon', label: 'Längengrad', type: 'number' },
  { key: 'hoehe', label: 'Höhe ü. NN (m)', type: 'number' },
  { key: 'genauigkeit', label: 'GPS-Genauigkeit (m)', type: 'number' },
  { key: 'koordQuelle', label: 'Koordinatenquelle', type: 'kat', katalog: 'KOORDQUELLE' },
  { key: 'gpsZeit', label: 'Zeitpunkt Koordinate', type: 'text' },
]

export const SECTIONS = [
  {
    title: 'Identifikation',
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'altNamen', label: 'Alternative Namen', type: 'text' },
      { key: 'status', label: 'Status', type: 'status' },
    ],
  },
  {
    title: 'Typologie & Zustand',
    fields: [
      { key: 'art', label: 'Burgtyp', type: 'kat', katalog: 'ART' },
      { key: 'zustand', label: 'Erhaltungszustand', type: 'kat', katalog: 'ZUSTAND' },
      { key: 'stand', label: 'Bauherrenstand', type: 'kat', katalog: 'STAND' },
      { key: 'bauteile', label: 'Bauteile', type: 'katMulti', katalog: 'BAUTEIL' },
      { key: 'material', label: 'Baumaterial', type: 'katMulti', katalog: 'MATERIAL' },
    ],
  },
  {
    title: 'Lage',
    fields: [
      { key: 'land', label: 'Land', type: 'kat', katalog: 'LAND' },
      { key: 'region', label: 'Bundesland / Region', type: 'kat', katalog: 'REGION', parentField: 'land' },
      { key: 'landkreis', label: 'Landkreis', type: 'text' },
      { key: 'gemeinde', label: 'Gemeinde / Ort', type: 'text' },
      { key: 'ortsteil', label: 'Ortsteil', type: 'text' },
      { key: 'anfahrt', label: 'Anfahrt / Parken', type: 'textarea' },
    ],
  },
  { title: 'Geodaten', special: 'geo' },
  { title: 'Bilder', special: 'bilder' },
  {
    title: 'Geschichte',
    fields: [
      { key: 'jahrhundert', label: 'Entstehung (Jahrhundert)', type: 'kat', katalog: 'JAHRHUNDERT' },
      { key: 'ersterwaehnung', label: 'Ersterwähnung (Jahr)', type: 'number' },
      { key: 'erbauer', label: 'Erbauer / Bauherr', type: 'text' },
      { key: 'zerstoerungJahr', label: 'Zerstörung (Jahr)', type: 'number' },
      { key: 'zerstoerungUrsache', label: 'Zerstörungsursache', type: 'kat', katalog: 'ZERSTOERUNG' },
      { key: 'besitzer', label: 'Wichtige Besitzer', type: 'textarea' },
      { key: 'geschichte', label: 'Geschichte', type: 'textarea' },
    ],
  },
  {
    title: 'Heute & Besuch',
    fields: [
      { key: 'eigentuemer', label: 'Eigentümer', type: 'kat', katalog: 'EIGENTUEMER' },
      { key: 'zugang', label: 'Zugänglichkeit', type: 'kat', katalog: 'ZUGANG' },
      { key: 'nutzung', label: 'Heutige Nutzung', type: 'katMulti', katalog: 'NUTZUNG' },
      { key: 'oeffnungszeiten', label: 'Öffnungszeiten', type: 'text' },
      { key: 'eintritt', label: 'Eintritt', type: 'text' },
      { key: 'website', label: 'Website', type: 'url' },
      { key: 'besuchsdatum', label: 'Besuchsdatum', type: 'date' },
      { key: 'bewertung', label: 'Eigene Bewertung', type: 'rating' },
    ],
  },
  {
    title: 'Notizen & Quellen',
    fields: [
      { key: 'notizen', label: 'Notizen', type: 'textarea' },
      { key: 'quellen', label: 'Quellen / Literatur', type: 'textarea' },
      { key: 'tags', label: 'Schlagworte', type: 'text' },
    ],
  },
]

export const ALL_FIELDS = SECTIONS.flatMap((s) => (s.special === 'geo' ? GEO_FIELDS : s.fields || []))

export function emptyBurg(id) {
  const b = { id, erstellt: '', geaendert: '', version: 0 }
  for (const f of ALL_FIELDS) {
    if (f.type === 'katMulti') b[f.key] = []
    else if (f.type === 'number') b[f.key] = null
    else if (f.type === 'rating') b[f.key] = 0
    else b[f.key] = ''
  }
  b.status = 'vollstaendig'
  return b
}

export function hasCoords(b) {
  return typeof b.lat === 'number' && typeof b.lon === 'number' && !isNaN(b.lat) && !isNaN(b.lon)
}
