<script setup>
import { computed, onMounted } from 'vue'
import { useGps } from '../composables/useGps.js'

const props = defineProps({ autoStart: Boolean, big: Boolean })
const emit = defineEmits(['take'])
const { aktiv, pos, fehler, start, stop } = useGps()

onMounted(() => props.autoStart && start())

function take() {
  emit('take', { ...pos.value })
  stop()
}

const qualitaet = computed(() => {
  if (!pos.value) return ''
  const g = pos.value.genauigkeit
  return g <= 10 ? 'gut' : g <= 30 ? 'mittel' : 'schlecht'
})
</script>

<template>
  <div class="gps" :class="{ big }">
    <button v-if="!aktiv" type="button" class="btn" :class="{ primary: big }" @click="start">
      📍 Position bestimmen
    </button>
    <template v-else>
      <div class="gps-status" :class="qualitaet">
        <span v-if="!pos" class="pulse">Suche Position …</span>
        <template v-else>
          <strong>±{{ pos.genauigkeit }} m</strong>
          <span>{{ pos.lat }}, {{ pos.lon }}</span>
          <span v-if="pos.hoehe != null">{{ pos.hoehe }} m ü. NN</span>
        </template>
      </div>
      <div class="row">
        <button type="button" class="btn primary" :disabled="!pos" @click="take">Übernehmen</button>
        <button type="button" class="btn" @click="stop">Abbrechen</button>
      </div>
      <p v-if="pos" class="hint">Die Genauigkeit verbessert sich meist nach einigen Sekunden unter freiem Himmel.</p>
    </template>
    <p v-if="fehler" class="fehler">{{ fehler }}</p>
  </div>
</template>
