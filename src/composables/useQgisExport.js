// Gemeinsame Logik für den Knopf "QGIS (ZIP)"
import { ref } from 'vue'
import { toast } from './toast.js'

export function useQgisExport() {
  const qgisText = ref('') // leer = bereit, sonst Fortschritt

  async function qgisExport(list, label) {
    if (!list.length) return toast('Keine Datensätze zum Exportieren.')
    qgisText.value = 'Vorbereiten …'
    try {
      const { exportQgis } = await import('../utils/geopackage.js')
      const r = await exportQgis(list, label, (t) => (qgisText.value = t))
      const hinweise = []
      if (r.ohne) hinweise.push(`${r.ohne} ohne Koordinaten`)
      if (r.fehlend) hinweise.push(`${r.fehlend} Bild(er) noch nicht auf diesem Gerät`)
      toast(`QGIS-Paket erstellt: ${list.length} Burg(en), ${r.bilder} Bild(er)${hinweise.length ? ' – ' + hinweise.join(', ') : ''}`, 5000)
    } catch (e) {
      alert('QGIS-Export fehlgeschlagen: ' + e.message)
    } finally {
      qgisText.value = ''
    }
  }
  return { qgisText, qgisExport }
}
