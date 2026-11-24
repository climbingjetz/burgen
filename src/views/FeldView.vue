<script setup>
// Kompaktmodus: schnelle Ersterfassung im Gelände. Aufbau gemäß kompakt.js (konfigurierbar).
import { ref, computed } from 'vue'
import { emptyBurg } from '../fields.js'
import { newId, saveBurg } from '../store.js'
import { toast } from '../composables/toast.js'
import { autoSync } from '../sync.js'
import { kompakt, feldDef, vorbelegung, vorbelegungSpeichern } from '../kompakt.js'
import GpsButton from '../components/GpsButton.vue'
import BilderEditor from '../components/BilderEditor.vue'
import MapPicker from '../components/MapPicker.vue'
import FeldEingabe from '../components/FeldEingabe.vue'
import CloudChip from '../components/CloudChip.vue'

const eintraege = computed(() => kompakt.felder.map((e) => ({ ...e, def: feldDef(e.key) })).filter((e) => e.def))
const hatGps = computed(() => kompakt.felder.some((e) => e.key === '_gps'))

function neueBurg() {
  const b = { ...emptyBurg(''), status: 'feld' }
  const v = vorbelegung()
  for (const e of kompakt.felder) if (e.merken && v[e.key] !== undefined) b[e.key] = v[e.key]
  return b
}

const form = ref(neueBurg())
const bilder = ref([])
const runde = ref(0) // erzwingt neuen GPS-Start nach dem Speichern
const zuletzt = ref(null)
const speichert = ref(false)
const bildBusy = ref(false)

function gps(p) {
  Object.assign(form.value, { lat: p.lat, lon: p.lon, hoehe: p.hoehe, genauigkeit: p.genauigkeit, koordQuelle: 'gps', gpsZeit: p.zeit })
}
function karte(p) {
  Object.assign(form.value, { lat: p.lat, lon: p.lon, genauigkeit: null, koordQuelle: 'karte', gpsZeit: new Date().toISOString() })
}
function fotoGps(b) {
  Object.assign(form.value, { lat: b.lat, lon: b.lon, hoehe: b.hoehe, genauigkeit: null, koordQuelle: 'foto', gpsZeit: b.datum })
}

async function speichern() {
  if (bildBusy.value) return toast('Bitte warten – das Foto wird noch verarbeitet.')
  if (hatGps.value && form.value.lat == null && !confirm('Es wurde noch keine Position übernommen. Trotzdem speichern?')) return
  speichert.value = true
  try {
    const id = await newId()
    const name = (form.value.name || '').trim() || `Unbenannt ${new Date().toLocaleString('de-DE')}`
    const rec = await saveBurg(
      { ...form.value, id, name, besuchsdatum: form.value.besuchsdatum || new Date().toISOString().slice(0, 10) },
      bilder.value,
    )
    // gemerkte Felder für die nächste Burg vorbelegen
    const v = vorbelegung()
    for (const e of kompakt.felder) if (e.merken) v[e.key] = rec[e.key]
    vorbelegungSpeichern(v)

    zuletzt.value = rec
    form.value = neueBurg()
    bilder.value = []
    runde.value++
    window.scrollTo({ top: 0, behavior: 'smooth' })
    toast('Auf dem Gerät gespeichert ✓')
    autoSync() // läuft im Hintergrund – Fortschritt in der Statusleiste
  } finally {
    speichert.value = false
  }
}
</script>

<template>
  <div class="page feld">
    <div class="page-head">
      <h1>📍 Kompakt-Erfassung</h1>
      <router-link to="/feld/einstellungen" class="btn small" title="Kompaktmodus einrichten">⚙ Felder</router-link>
    </div>

    <div v-if="zuletzt" class="card erfolg">
      ✓ „{{ zuletzt.name }}“ ist auf dem Gerät gespeichert.
      <router-link :to="`/burg/${zuletzt.id}`">Weiter bearbeiten →</router-link>
      <div class="cloud-hinweis"><CloudChip :id="zuletzt.id" /></div>
    </div>

    <p v-if="!eintraege.length" class="card leer">
      Im Kompaktmodus sind keine Felder ausgewählt.
      <router-link to="/feld/einstellungen">Jetzt einrichten →</router-link>
    </p>

    <template v-for="e in eintraege" :key="e.key">
      <section v-if="e.key === '_gps'" class="card">
        <h2>Position</h2>
        <GpsButton :key="runde" auto-start big @take="gps" />
        <div v-if="form.lat != null" class="gps-ok">
          ✓ {{ form.lat }}, {{ form.lon }}
          <span v-if="form.genauigkeit != null">(±{{ form.genauigkeit }} m)</span>
          <span v-if="form.hoehe != null">· {{ form.hoehe }} m</span>
        </div>
        <MapPicker v-if="form.lat != null" :lat="form.lat" :lon="form.lon" height="220px" @pick="karte" />
      </section>

      <section v-else-if="e.key === '_fotos'" class="card">
        <h2>Fotos</h2>
        <BilderEditor v-model="bilder" big @busy="bildBusy = $event" @gps="fotoGps" />
      </section>

      <section v-else class="card">
        <h2>{{ e.def.label }}</h2>
        <FeldEingabe :f="e.def" :burg="form" :kacheln="!!e.kacheln" gross />
      </section>
    </template>

    <p v-if="!hatGps" class="hint">Hinweis: Die Position ist im Kompaktmodus ausgeblendet.</p>

    <div class="feld-save">
      <button class="btn primary big" :disabled="speichert || bildBusy" @click="speichern">
        {{ bildBusy ? '⏳ Foto wird verarbeitet …' : speichert ? '⏳ Speichert …' : '💾 Speichern & nächste Burg' }}
      </button>
    </div>
  </div>
</template>
