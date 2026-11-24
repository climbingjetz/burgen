<script setup>
import { ref, watch, nextTick } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { SECTIONS, emptyBurg } from '../fields.js'
import { getBurg, getBilder, saveBurg, deleteBurg, newId } from '../store.js'
import { useKatalog } from '../composables/useKatalog.js'
import { toast } from '../composables/toast.js'
import { exportiere } from '../utils/export.js'
import { autoSync } from '../sync.js'
import KatSelect from '../components/KatSelect.vue'
import GpsButton from '../components/GpsButton.vue'
import MapPicker from '../components/MapPicker.vue'
import BilderEditor from '../components/BilderEditor.vue'
import FeldEingabe from '../components/FeldEingabe.vue'
import CloudChip from '../components/CloudChip.vue'
import { useQgisExport } from '../composables/useQgisExport.js'

const route = useRoute()
const router = useRouter()
const { entries, label } = useKatalog()

const burg = ref(null)
const bilder = ref([])
const istNeu = ref(false)
const dirty = ref(false)
const fehler = ref('')
const bildBusy = ref(false)
const speichert = ref(false)
let bereit = false

async function load() {
  bereit = false
  fehler.value = ''
  if (route.params.id === 'neu') {
    burg.value = emptyBurg(await newId())
    bilder.value = []
    istNeu.value = true
  } else {
    const b = await getBurg(route.params.id)
    if (!b) return router.replace('/')
    burg.value = { ...emptyBurg(b.id), ...b }
    bilder.value = await getBilder(b.id)
    istNeu.value = false
  }
  dirty.value = false
  await nextTick()
  bereit = true
}
watch(() => route.params.id, (id) => id && load(), { immediate: true })
watch([burg, bilder], () => bereit && (dirty.value = true), { deep: true })

// Region zurücksetzen, wenn sie nicht zum gewählten Land passt
watch(
  () => burg.value?.land,
  (land) => {
    if (!bereit || !land || !burg.value.region) return
    const r = entries.value.find((e) => e.katalog === 'REGION' && e.schluessel === burg.value.region)
    if (r?.parent && r.parent !== land) burg.value.region = ''
  },
)

onBeforeRouteLeave(() => {
  if (dirty.value && !confirm('Es gibt ungespeicherte Änderungen. Wirklich verlassen?')) return false
})

async function speichern() {
  if (!burg.value.name?.trim()) {
    fehler.value = 'Bitte einen Namen eingeben.'
    window.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  if (bildBusy.value) return toast('Bitte warten – das Foto wird noch verarbeitet.')
  speichert.value = true
  let rec
  try {
    rec = await saveBurg(burg.value, bilder.value)
  } catch (e) {
    speichert.value = false
    return alert('Speichern fehlgeschlagen: ' + e.message)
  }
  speichert.value = false
  dirty.value = false
  toast('Auf dem Gerät gespeichert ✓')
  autoSync() // läuft im Hintergrund weiter – Fortschritt in der Statusleiste
  if (istNeu.value) router.replace(`/burg/${rec.id}`)
  else await load()
}

async function loeschen() {
  if (!confirm(`„${burg.value.name || burg.value.id}“ mit allen Bildern endgültig löschen?`)) return
  await deleteBurg(burg.value.id)
  dirty.value = false
  toast('Gelöscht')
  autoSync()
  router.replace('/')
}

function gpsUebernehmen(p) {
  Object.assign(burg.value, {
    lat: p.lat, lon: p.lon,
    hoehe: p.hoehe ?? burg.value.hoehe,
    genauigkeit: p.genauigkeit,
    koordQuelle: 'gps',
    gpsZeit: p.zeit,
  })
}

function kartePick(p) {
  Object.assign(burg.value, { lat: p.lat, lon: p.lon, genauigkeit: null, koordQuelle: 'karte', gpsZeit: new Date().toISOString() })
}

function fotoGps(b) {
  if (burg.value.lat != null && burg.value.lat !== '' && !confirm('Vorhandene Koordinaten durch die des Fotos ersetzen?')) return
  Object.assign(burg.value, {
    lat: b.lat, lon: b.lon,
    hoehe: b.hoehe ?? burg.value.hoehe,
    genauigkeit: null,
    koordQuelle: 'foto',
    gpsZeit: b.datum,
  })
}

function exp(fmt) {
  const ohne = exportiere(fmt, [burg.value], label)
  if (ohne) toast('Diese Burg hat noch keine Koordinaten.')
}

const { qgisText, qgisExport } = useQgisExport()
function qgis() {
  if (dirty.value || istNeu.value) return toast('Bitte zuerst speichern – exportiert wird der gespeicherte Stand.')
  qgisExport([burg.value], label)
}

const pdfBusy = ref(false)
async function pdf() {
  pdfBusy.value = true
  try {
    const { exportPdf } = await import('../utils/pdf.js')
    await exportPdf([burg.value], label, { bilder: { [burg.value.id]: bilder.value } })
  } catch (e) {
    alert('PDF konnte nicht erstellt werden: ' + e.message)
  } finally {
    pdfBusy.value = false
  }
}

const zeit = (iso) => (iso ? new Date(iso).toLocaleString('de-DE') : '–')
</script>

<template>
  <div v-if="burg" class="page edit">
    <div class="page-head sticky">
      <router-link to="/" class="btn small">← Liste</router-link>
      <h1 class="ellipsis">{{ istNeu ? 'Neue Burg' : burg.name || burg.id }}</h1>
      <button v-if="dirty || istNeu" class="btn primary" :disabled="bildBusy || speichert" @click="speichern">
        {{ bildBusy ? '⏳ Foto …' : speichert ? '⏳ Speichert …' : '💾 Speichern' }}
      </button>
      <button v-else class="btn gespeichert" disabled title="Alle Änderungen sind auf diesem Gerät gespeichert">✓ Gespeichert</button>
    </div>
    <p v-if="!istNeu" class="cloud-hinweis"><CloudChip :id="burg.id" /></p>

    <p v-if="fehler" class="fehler card">{{ fehler }}</p>

    <template v-for="s in SECTIONS" :key="s.title">
      <!-- Geodaten -->
      <section v-if="s.special === 'geo'" class="card">
        <h2>{{ s.title }}</h2>
        <GpsButton @take="gpsUebernehmen" />
        <div class="grid">
          <div class="field">
            <span>Breitengrad (lat)</span>
            <input v-model.number="burg.lat" type="number" step="0.000001" min="-90" max="90" placeholder="z. B. 48.323456" />
          </div>
          <div class="field">
            <span>Längengrad (lon)</span>
            <input v-model.number="burg.lon" type="number" step="0.000001" min="-180" max="180" placeholder="z. B. 8.967123" />
          </div>
          <div class="field">
            <span>Höhe ü. NN (m)</span>
            <input v-model.number="burg.hoehe" type="number" />
          </div>
          <div class="field">
            <span>GPS-Genauigkeit (m)</span>
            <input v-model.number="burg.genauigkeit" type="number" />
          </div>
          <div class="field">
            <span>Koordinatenquelle</span>
            <KatSelect v-model="burg.koordQuelle" katalog="KOORDQUELLE" />
          </div>
          <div class="field">
            <span>Zeitpunkt</span>
            <input :value="zeit(burg.gpsZeit)" readonly />
          </div>
        </div>
        <MapPicker :lat="burg.lat" :lon="burg.lon" @pick="kartePick" />
        <p class="hint">In die Karte klicken oder die Markierung ziehen, um die Position zu setzen. Oben rechts lässt sich auf Luftbild umschalten.</p>
      </section>

      <!-- Bilder -->
      <section v-else-if="s.special === 'bilder'" class="card">
        <h2>{{ s.title }}</h2>
        <BilderEditor v-model="bilder" @busy="bildBusy = $event" @gps="fotoGps" />
      </section>

      <!-- normale Feldgruppen -->
      <section v-else class="card">
        <h2>{{ s.title }}</h2>
        <div class="grid">
          <div
            v-for="f in s.fields"
            :key="f.key"
            class="field"
            :class="{ wide: f.type === 'textarea' || f.type === 'katMulti' }"
          >
            <span>{{ f.label }}<b v-if="f.required" class="req">*</b></span>
            <FeldEingabe :f="f" :burg="burg" />
          </div>
        </div>
      </section>
    </template>

    <section class="card">
      <h2>Export &amp; Verwaltung</h2>
      <div class="row">
        <button class="btn primary" :disabled="pdfBusy" @click="pdf">📄 {{ pdfBusy ? 'PDF wird erstellt …' : 'PDF-Datenblatt' }}</button>
        <button class="btn" @click="exp('gpx')">GPX</button>
        <button class="btn" @click="exp('csv')">CSV</button>
        <button class="btn" @click="exp('geojson')">GeoJSON</button>
        <button class="btn" :disabled="!!qgisText" title="GeoPackage mit Bildern und fertigem QGIS-Stil als ZIP" @click="qgis">{{ qgisText ? '⏳ ' + qgisText : '🗺 QGIS (ZIP)' }}</button>
        <span class="spacer"></span>
        <button v-if="!istNeu" class="btn danger" @click="loeschen">🗑 Löschen</button>
      </div>
      <p class="hint">
        ID {{ burg.id }} · erstellt {{ zeit(burg.erstellt) }} · geändert {{ zeit(burg.geaendert) }} · Version {{ burg.version }}
      </p>
    </section>
  </div>
</template>
