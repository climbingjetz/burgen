import { ref } from 'vue'
import { db } from '../db.js'

const entries = ref([])

export async function loadKatalog() {
  entries.value = await db.katalog.toArray()
}

const bySort = (a, b) => (a.sort || 0) - (b.sort || 0) || a.wert.localeCompare(b.wert, 'de')

export function useKatalog() {
  // Auswählbare Werte: aktive Einträge plus die bereits gesetzten (auch wenn inzwischen inaktiv)
  function options(katalog, parent, keep = []) {
    return entries.value
      .filter((e) => e.katalog === katalog)
      .filter((e) => e.aktiv || keep.includes(e.schluessel))
      .filter((e) => !parent || !e.parent || e.parent === parent)
      .sort(bySort)
  }

  function all(katalog) {
    return entries.value.filter((e) => e.katalog === katalog).sort(bySort)
  }

  function label(katalog, key) {
    if (!key) return ''
    const e = entries.value.find((x) => x.katalog === katalog && x.schluessel === key)
    return e ? e.wert : key
  }

  return { entries, options, all, label, reload: loadKatalog }
}
