<script setup>
import { ref, computed } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { kompakt, kompaktSpeichern, kompaktStandard, WAEHLBAR, feldDef } from '../kompakt.js'
import { autoSync } from '../sync.js'
import { toast } from '../composables/toast.js'

// Arbeitskopie – wird erst mit "Speichern" übernommen
const conf = ref(JSON.parse(JSON.stringify(kompakt)))
const geaendert = ref(false)
const merke = () => (geaendert.value = true)

const gewaehlt = computed(() => conf.value.felder.map((e) => ({ ...e, def: feldDef(e.key) })))
const verfuegbar = computed(() => WAEHLBAR.filter((f) => !conf.value.felder.some((e) => e.key === f.key)))

function hinzu(f) {
  conf.value.felder.push({ key: f.key, kacheln: false, merken: false })
  merke()
}
function weg(i) {
  conf.value.felder.splice(i, 1)
  merke()
}
function schieben(i, d) {
  const a = conf.value.felder
  const j = i + d
  if (j < 0 || j >= a.length) return
  ;[a[i], a[j]] = [a[j], a[i]]
  merke()
}
function setze(i, key, wert) {
  conf.value.felder[i][key] = wert
  merke()
}

function speichern() {
  kompaktSpeichern(conf.value)
  geaendert.value = false
  toast('Kompaktmodus gespeichert ✓')
  autoSync()
}

function standard() {
  if (!confirm('Kompaktmodus auf die Standardeinstellung zurücksetzen?')) return
  conf.value = kompaktStandard()
  merke()
}

onBeforeRouteLeave(() => {
  if (geaendert.value && !confirm('Änderungen am Kompaktmodus verwerfen?')) return false
})

const typText = { sonder: '', text: 'Text', textarea: 'Langtext', number: 'Zahl', date: 'Datum', url: 'Link', kat: 'Auswahl', katMulti: 'Mehrfachauswahl', status: 'Auswahl', rating: 'Sterne' }
</script>

<template>
  <div class="page">
    <div class="page-head sticky">
      <router-link to="/feld" class="btn small">← Zurück</router-link>
      <h1 class="ellipsis">Kompaktmodus einrichten</h1>
      <button class="btn primary" :disabled="!geaendert" @click="speichern">💾 Speichern</button>
    </div>

    <section class="card">
      <h2>Felder im Kompaktmodus</h2>
      <p class="hint">
        Reihenfolge mit ▲▼ ändern. <strong>Kacheln</strong>: Auswahl als große Schaltflächen statt Liste.
        <strong>Merken</strong>: Der zuletzt eingegebene Wert wird bei der nächsten Burg vorbelegt (z. B. Land, Region).
      </p>
      <ul class="kompakt-liste">
        <li v-for="(e, i) in gewaehlt" :key="e.key">
          <div class="kompakt-pos">
            <button class="icon" :disabled="i === 0" title="nach oben" @click="schieben(i, -1)">▲</button>
            <button class="icon" :disabled="i === gewaehlt.length - 1" title="nach unten" @click="schieben(i, 1)">▼</button>
          </div>
          <div class="kompakt-name">
            <strong>{{ e.def?.label || e.key }}</strong>
            <small class="hint">{{ typText[e.def?.type] }}</small>
          </div>
          <div class="kompakt-opt">
            <label v-if="e.def?.type === 'kat'" class="check">
              <input type="checkbox" :checked="e.kacheln" @change="setze(i, 'kacheln', $event.target.checked)" /> Kacheln
            </label>
            <label v-if="e.def?.type !== 'sonder'" class="check">
              <input type="checkbox" :checked="e.merken" @change="setze(i, 'merken', $event.target.checked)" /> Merken
            </label>
          </div>
          <button class="icon" title="Entfernen" @click="weg(i)">✕</button>
        </li>
      </ul>
      <p v-if="!gewaehlt.length" class="hint">Noch keine Felder ausgewählt.</p>
    </section>

    <section class="card">
      <h2>Weitere Felder hinzufügen</h2>
      <div class="chips">
        <button v-for="f in verfuegbar" :key="f.key" class="chip" @click="hinzu(f)">+ {{ f.label }}</button>
      </div>
    </section>

    <section class="card">
      <h2>Verhalten</h2>
      <label class="check">
        <input v-model="conf.startAufHandy" type="checkbox" @change="merke" />
        Auf dem Handy direkt im Kompaktmodus starten
      </label>
      <p class="hint">Neue Burgen aus dem Kompaktmodus erhalten den Status „Feld-Entwurf“ und lassen sich später am PC vervollständigen.</p>
      <div class="row">
        <button class="btn small" @click="standard">Auf Standard zurücksetzen</button>
      </div>
    </section>
  </div>
</template>
