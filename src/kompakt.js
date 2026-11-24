// Konfiguration des Kompaktmodus (Feld-Erfassung): welche Felder in welcher Reihenfolge,
// Katalogfelder als Kacheln oder Liste, Werte für die nächste Burg merken.
// Wird lokal gespeichert und über Google Drive zwischen den Geräten abgeglichen.
import { reactive } from 'vue'
import { ALL_FIELDS, GEO_FIELDS } from './fields.js'

export const SONDERFELDER = [
  { key: '_gps', label: 'Position (GPS & Karte)', type: 'sonder' },
  { key: '_fotos', label: 'Fotos', type: 'sonder' },
  { key: '_dateien', label: 'Dateien (Notiz, Sprachnotiz, Video …)', type: 'sonder' },
]

const geoKeys = new Set(GEO_FIELDS.map((f) => f.key))
export const WAEHLBAR = [...SONDERFELDER, ...ALL_FIELDS.filter((f) => !geoKeys.has(f.key))]
export const feldDef = (key) => WAEHLBAR.find((f) => f.key === key)

export const STANDARD = {
  felder: [
    { key: '_gps' },
    { key: 'name' },
    { key: '_fotos' },
    { key: 'art', kacheln: true },
    { key: 'zustand', kacheln: true },
    { key: 'notizen' },
    { key: 'land', merken: true },
    { key: 'region', merken: true },
  ],
  startAufHandy: true,
}

const kopie = (o) => JSON.parse(JSON.stringify(o))

function laden() {
  try {
    const c = JSON.parse(localStorage.getItem('kompakt.config') || 'null')
    if (c?.felder) return { ...kopie(STANDARD), ...c, felder: c.felder.filter((f) => feldDef(f.key)) }
  } catch {
    /* ungültig → Standard */
  }
  return kopie(STANDARD)
}

export const kompakt = reactive(laden())

export const kompaktStand = () => localStorage.getItem('kompakt.geaendert') || ''

export function kompaktSpeichern(config, stand = new Date().toISOString()) {
  const c = kopie(config)
  localStorage.setItem('kompakt.config', JSON.stringify(c))
  localStorage.setItem('kompakt.geaendert', stand)
  Object.assign(kompakt, c)
}

export const kompaktStandard = () => kopie(STANDARD)

// Gemerkte Werte für die nächste Erfassung
export const vorbelegung = () => JSON.parse(localStorage.getItem('kompakt.vorbelegung') || '{"land":"DE"}')
export const vorbelegungSpeichern = (werte) => localStorage.setItem('kompakt.vorbelegung', JSON.stringify(werte))

export const istHandy = () => window.matchMedia('(max-width: 760px)').matches
