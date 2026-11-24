<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { listBurgen, getHauptbilder } from '../store.js'
import { STATUS, hasCoords } from '../fields.js'
import { useKatalog } from '../composables/useKatalog.js'
import { exportiere } from '../utils/export.js'
import { toast } from '../composables/toast.js'
import KatSelect from '../components/KatSelect.vue'

const { label } = useKatalog()
const burgen = ref([])
const thumbs = ref({})
const geladen = ref(false)
const q = ref('')
const fStatus = ref('')
const fArt = ref('')
const fLand = ref('')
const auswahl = ref([])

onMounted(async () => {
  burgen.value = await listBurgen()
  const map = {}
  for (const b of await getHauptbilder()) map[b.burgId] = URL.createObjectURL(b.blob)
  thumbs.value = map
  geladen.value = true
})
onBeforeUnmount(() => Object.values(thumbs.value).forEach((u) => URL.revokeObjectURL(u)))

const gefiltert = computed(() => {
  const s = q.value.trim().toLowerCase()
  return burgen.value.filter(
    (b) =>
      (!s || [b.name, b.altNamen, b.gemeinde, b.landkreis, b.tags, b.id].join(' ').toLowerCase().includes(s)) &&
      (!fStatus.value || b.status === fStatus.value) &&
      (!fArt.value || b.art === fArt.value) &&
      (!fLand.value || b.land === fLand.value),
  )
})

const exportListe = computed(() =>
  auswahl.value.length ? gefiltert.value.filter((b) => auswahl.value.includes(b.id)) : gefiltert.value,
)

const alleGewaehlt = computed(
  () => gefiltert.value.length > 0 && gefiltert.value.every((b) => auswahl.value.includes(b.id)),
)
function alleUmschalten() {
  auswahl.value = alleGewaehlt.value ? [] : gefiltert.value.map((b) => b.id)
}

function exp(fmt) {
  if (!exportListe.value.length) return toast('Keine Datensätze zum Exportieren.')
  const ohne = exportiere(fmt, exportListe.value, label)
  if (ohne) toast(`${ohne} Burg(en) ohne Koordinaten wurden ausgelassen.`, 4000)
}

const pdfBusy = ref(false)
async function pdf() {
  const list = exportListe.value
  if (!list.length) return toast('Keine Datensätze zum Exportieren.')
  if (list.length > 25 && !confirm(`PDF mit ${list.length} Burgen erstellen? Das kann etwas dauern.`)) return
  pdfBusy.value = true
  try {
    const { exportPdf } = await import('../utils/pdf.js')
    await exportPdf(list, label)
  } catch (e) {
    alert('PDF konnte nicht erstellt werden: ' + e.message)
  } finally {
    pdfBusy.value = false
  }
}

const statusLabel = (k) => STATUS.find((s) => s.key === k)?.label || k
const ort = (b) => [b.gemeinde, label('REGION', b.region), label('LAND', b.land)].filter(Boolean).join(', ')
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>Burgen <small v-if="geladen">({{ gefiltert.length }}<template v-if="gefiltert.length !== burgen.length"> von {{ burgen.length }}</template>)</small></h1>
      <div class="row">
        <router-link to="/feld" class="btn">📍 Feld-Erfassung</router-link>
        <router-link to="/burg/neu" class="btn primary">+ Neue Burg</router-link>
      </div>
    </div>

    <div class="filter card">
      <input v-model="q" type="search" placeholder="Suchen: Name, Ort, Schlagwort …" />
      <KatSelect v-model="fArt" katalog="ART" placeholder="Alle Burgtypen" />
      <KatSelect v-model="fLand" katalog="LAND" placeholder="Alle Länder" />
      <select v-model="fStatus">
        <option value="">Alle Status</option>
        <option v-for="s in STATUS" :key="s.key" :value="s.key">{{ s.label }}</option>
      </select>
    </div>

    <div v-if="burgen.length" class="exportbar">
      <label class="check"><input type="checkbox" :checked="alleGewaehlt" @change="alleUmschalten" /> alle</label>
      <span class="hint">
        Export: {{ auswahl.length ? `${exportListe.length} ausgewählte` : `alle ${exportListe.length} angezeigten` }}
      </span>
      <button class="btn small" :disabled="pdfBusy" @click="pdf">{{ pdfBusy ? 'PDF …' : 'PDF' }}</button>
      <button class="btn small" @click="exp('csv')">CSV</button>
      <button class="btn small" @click="exp('gpx')">GPX</button>
      <button class="btn small" @click="exp('geojson')">GeoJSON</button>
    </div>

    <p v-if="geladen && !burgen.length" class="leer card">
      Noch keine Burgen erfasst. Leg mit <strong>+ Neue Burg</strong> los oder nutze im Gelände die
      <strong>Feld-Erfassung</strong>.
    </p>

    <ul class="burgliste">
      <li v-for="b in gefiltert" :key="b.id" class="burg-item">
        <input v-model="auswahl" type="checkbox" :value="b.id" class="sel" />
        <router-link :to="`/burg/${b.id}`" class="burg-link">
          <div class="thumb">
            <img v-if="thumbs[b.id]" :src="thumbs[b.id]" alt="" loading="lazy" />
            <span v-else>🏰</span>
          </div>
          <div class="burg-info">
            <strong>{{ b.name || '(ohne Namen)' }}</strong>
            <span>{{ [label('ART', b.art), label('ZUSTAND', b.zustand)].filter(Boolean).join(' · ') }}</span>
            <span class="hint">{{ ort(b) }}</span>
          </div>
          <div class="burg-meta">
            <span class="status" :class="b.status">{{ statusLabel(b.status) }}</span>
            <span v-if="!hasCoords(b)" class="warn" title="Keine Koordinaten">⚠ GPS</span>
          </div>
        </router-link>
      </li>
    </ul>
  </div>
</template>
