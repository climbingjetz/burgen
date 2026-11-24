<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'
import { processImage } from '../utils/image.js'
import { syncState } from '../sync.js'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  max: { type: Number, default: 4 },
  big: Boolean, // Feldmodus: große Buttons, keine Bildunterschrift
})
const emit = defineEmits(['update:modelValue', 'gps', 'busy'])
const busy = ref(false)
watch(busy, (v) => emit('busy', v))
const fehler = ref('')

const urls = new Map()
function url(b) {
  if (!b.blob) return '' // liegt nur in Drive, wird noch geladen
  if (!urls.has(b.blob)) urls.set(b.blob, URL.createObjectURL(b.blob))
  return urls.get(b.blob)
}
onBeforeUnmount(() => urls.forEach((u) => URL.revokeObjectURL(u)))

const set = (list) => emit('update:modelValue', list)

async function add(e) {
  const files = [...e.target.files]
  e.target.value = ''
  const frei = props.max - props.modelValue.length
  fehler.value = files.length > frei ? `Maximal ${props.max} Bilder – ${files.length - frei} wurde(n) ignoriert.` : ''
  busy.value = true
  const neu = [...props.modelValue]
  try {
    for (const f of files.slice(0, frei)) neu.push(await processImage(f))
  } catch (err) {
    fehler.value = err.message
  }
  busy.value = false
  set(neu)
}

function move(i, d) {
  const a = [...props.modelValue]
  const j = i + d
  if (j < 0 || j >= a.length) return
  ;[a[i], a[j]] = [a[j], a[i]]
  set(a)
}

function remove(i) {
  if (!confirm('Bild entfernen?')) return
  const a = [...props.modelValue]
  a.splice(i, 1)
  set(a)
}

function caption(i, v) {
  const a = [...props.modelValue]
  a[i] = { ...a[i], caption: v }
  set(a)
}
</script>

<template>
  <div class="bilder">
    <div v-if="modelValue.length" class="bild-grid">
      <figure v-for="(b, i) in modelValue" :key="b.id || url(b)" class="bild">
        <div class="bild-img">
          <img v-if="b.blob" :src="url(b)" alt="" />
          <div v-else class="bild-platzhalter">☁ liegt in der Cloud,<br />wird noch geladen</div>
          <span v-if="syncState.verbunden && b.blob" class="bild-wolke" :title="b.driveId ? 'In der Cloud' : 'Noch nicht hochgeladen'">{{ b.driveId ? '☁' : '⏳' }}</span>
          <span v-if="i === 0" class="badge">Hauptbild</span>
          <span v-if="b.lat != null" class="badge gps-badge" title="Foto enthält GPS-Daten">GPS</span>
        </div>
        <div class="bild-tools">
          <button type="button" :disabled="i === 0" title="nach vorne" @click="move(i, -1)">◀</button>
          <button type="button" :disabled="i === modelValue.length - 1" title="nach hinten" @click="move(i, 1)">▶</button>
          <button v-if="b.lat != null" type="button" title="Koordinaten aus diesem Foto übernehmen" @click="emit('gps', b)">📍</button>
          <button type="button" title="Bild entfernen" @click="remove(i)">✕</button>
        </div>
        <input v-if="!big" :value="b.caption" placeholder="Bildunterschrift" @input="caption(i, $event.target.value)" />
      </figure>
    </div>
    <div v-if="modelValue.length < max" class="row bild-add">
      <label class="btn" :class="{ primary: big }">
        📷 Foto aufnehmen
        <input type="file" accept="image/*" capture="environment" hidden @change="add" />
      </label>
      <label class="btn">
        🖼️ Bild wählen
        <input type="file" accept="image/*" multiple hidden @change="add" />
      </label>
      <span class="hint">{{ modelValue.length }} / {{ max }}</span>
    </div>
    <p v-if="busy" class="hint pulse">⏳ Bild wird verarbeitet …</p>
    <p v-if="fehler" class="fehler">{{ fehler }}</p>
  </div>
</template>
