// Umwandlung zwischen App-Datensätzen und Tabellenzeilen im Google Sheet.
// Spalten werden über die Kopfzeile zugeordnet – neue Felder werden einfach angehängt.
import { ALL_FIELDS } from '../fields.js'

const TYP = Object.fromEntries(ALL_FIELDS.map((f) => [f.key, f.type]))

export const BURG_COLS = ['id', ...ALL_FIELDS.map((f) => f.key), 'driveOrdner', 'erstellt', 'geaendert', 'version', 'geloescht']
export const BILD_COLS = ['id', 'burgId', 'pos', 'dateiname', 'driveId', 'caption', 'datum', 'lat', 'lon', 'hoehe']
export const KAT_COLS = ['katalog', 'schluessel', 'wert', 'sort', 'aktiv', 'parent']

const zelle = (v) => (v == null ? '' : Array.isArray(v) ? v.join('|') : v)

export function zuZeilen(cols, list) {
  return [cols, ...list.map((o) => cols.map((c) => zelle(o[c])))]
}

function wertLesen(key, v) {
  const t = TYP[key]
  if (t === 'katMulti') return String(v ?? '').split('|').filter(Boolean)
  if (t === 'number' || ['pos', 'version', 'sort', 'lat', 'lon', 'hoehe'].includes(key)) {
    return v === '' || v == null || isNaN(Number(v)) ? null : Number(v)
  }
  if (t === 'rating') return Number(v) || 0
  if (key === 'aktiv') return v === true || v === 'TRUE' || v === 'true' || v === 1
  return v == null ? '' : String(v)
}

export function ausZeilen(values = []) {
  const [kopf, ...zeilen] = values
  if (!kopf) return []
  return zeilen
    .filter((z) => z.some((x) => x !== '' && x != null))
    .map((z) => Object.fromEntries(kopf.map((k, i) => [k, wertLesen(k, z[i])])))
}
