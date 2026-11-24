<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { L, addBaseLayers } from '../leaflet.js'

const props = defineProps({
  lat: { type: [Number, String], default: null },
  lon: { type: [Number, String], default: null },
  height: { type: String, default: '300px' },
})
const emit = defineEmits(['pick'])
const el = ref(null)
let map, marker

const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v))
const round = (v) => +v.toFixed(6)
const pick = (ll) => emit('pick', { lat: round(ll.lat), lon: round(ll.lng) })

function update(center) {
  const lat = num(props.lat), lon = num(props.lon)
  if (lat == null || lon == null) {
    marker?.remove()
    marker = null
    return
  }
  if (!marker) {
    marker = L.marker([lat, lon], { draggable: true }).addTo(map)
    marker.on('dragend', () => pick(marker.getLatLng()))
    if (center) map.setView([lat, lon], Math.max(map.getZoom(), 15))
  } else {
    marker.setLatLng([lat, lon])
    if (!map.getBounds().contains([lat, lon])) map.panTo([lat, lon])
  }
}

onMounted(() => {
  map = L.map(el.value)
  addBaseLayers(map)
  const lat = num(props.lat), lon = num(props.lon)
  if (lat != null && lon != null) map.setView([lat, lon], 15)
  else map.setView([50.5, 10.5], 5)
  map.on('click', (e) => pick(e.latlng))
  update(false)
})

watch(() => [props.lat, props.lon], () => update(true))
onBeforeUnmount(() => map?.remove())
</script>

<template>
  <div ref="el" class="map" :style="{ height }"></div>
</template>
