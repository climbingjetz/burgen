<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { L, addBaseLayers } from '../leaflet.js'
import { listBurgen } from '../store.js'
import { hasCoords } from '../fields.js'
import { useKatalog } from '../composables/useKatalog.js'
import { toast } from '../composables/toast.js'

const { label } = useKatalog()
const el = ref(null)
const anzahl = ref(0)
let map, ich

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

onMounted(async () => {
  map = L.map(el.value).setView([50.5, 10.5], 6)
  addBaseLayers(map)
  const burgen = (await listBurgen()).filter(hasCoords)
  anzahl.value = burgen.length
  const pts = []
  for (const b of burgen) {
    const info = [label('ART', b.art), label('ZUSTAND', b.zustand)].filter(Boolean).join(' · ')
    L.marker([b.lat, b.lon])
      .addTo(map)
      .bindPopup(`<strong>${esc(b.name)}</strong><br>${esc(info)}<br><a href="#/burg/${encodeURIComponent(b.id)}">Öffnen →</a>`)
    pts.push([b.lat, b.lon])
  }
  if (pts.length === 1) map.setView(pts[0], 14)
  else if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 })

  map.on('locationfound', (e) => {
    ich?.remove()
    ich = L.circle(e.latlng, { radius: e.accuracy, color: '#1d6fa5' }).addTo(map)
  })
  map.on('locationerror', () => toast('Position nicht verfügbar.'))
})

function meinePosition() {
  map.locate({ setView: true, maxZoom: 14, enableHighAccuracy: true })
}

onBeforeUnmount(() => map?.remove())
</script>

<template>
  <div class="karte-page">
    <div ref="el" class="map full"></div>
    <div class="karte-overlay">
      <span>{{ anzahl }} Burgen mit Koordinaten</span>
      <button class="btn small" @click="meinePosition">◎ Meine Position</button>
    </div>
  </div>
</template>
