<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { syncState, synchronisiere, zaehleOffen, driveRemote } from '../sync.js'
import { getClientId, setClientId, istVerbunden, hatGueltigesToken, anmelden, abmelden, ladeGoogle } from '../google/auth.js'
import { exportBackup, importBackup, listBurgen } from '../store.js'
import { download, exportiere, today } from '../utils/export.js'
import { useKatalog } from '../composables/useKatalog.js'
import { toast } from '../composables/toast.js'

const { label, reload } = useKatalog()
const speicher = ref(null)
const dauerhaft = ref(null)
const anzahl = ref(0)
const busy = ref(false)

onMounted(async () => {
  anzahl.value = (await listBurgen()).length
  if (navigator.storage?.estimate) {
    const e = await navigator.storage.estimate()
    speicher.value = { genutzt: e.usage, frei: e.quota }
  }
  if (navigator.storage?.persisted) dauerhaft.value = await navigator.storage.persisted()
})

const mb = (b) => (b / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' MB'

async function sichern() {
  busy.value = true
  try {
    const data = await exportBackup()
    download(`burgen-sicherung_${today()}.json`, JSON.stringify(data), 'application/json')
    localStorage.setItem('letzteSicherung', new Date().toISOString())
    toast('Sicherung erstellt ✓')
  } finally {
    busy.value = false
  }
}

async function wiederherstellen(e) {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file) return
  if (!confirm('Achtung: Alle aktuellen Daten in dieser App werden durch die Sicherung ersetzt. Fortfahren?')) return
  busy.value = true
  try {
    await importBackup(JSON.parse(await file.text()))
    await reload()
    anzahl.value = (await listBurgen()).length
    toast('Sicherung wiederhergestellt ✓')
  } catch (err) {
    alert('Wiederherstellen fehlgeschlagen: ' + err.message)
  } finally {
    busy.value = false
  }
}

async function exportAlle(fmt) {
  const list = await listBurgen()
  if (!list.length) return toast('Keine Daten vorhanden.')
  const ohne = exportiere(fmt, list, label)
  if (ohne) toast(`${ohne} Burg(en) ohne Koordinaten wurden ausgelassen.`, 4000)
}

const letzte = localStorage.getItem('letzteSicherung')

// ---------- Google Drive ----------
const origin = location.origin
const clientId = ref(getClientId())
const clientIdEingabe = ref(clientId.value)
const clientIdBearbeiten = ref(false)
const verbunden = ref(istVerbunden())
const email = ref(localStorage.getItem('google.email') || '')
const links = ref({})
const online = ref(navigator.onLine)
const onOnline = () => (online.value = navigator.onLine)
window.addEventListener('online', onOnline)
window.addEventListener('offline', onOnline)
onBeforeUnmount(() => {
  window.removeEventListener('online', onOnline)
  window.removeEventListener('offline', onOnline)
})

onMounted(async () => {
  zaehleOffen()
  if (clientId.value && navigator.onLine) ladeGoogle().catch(() => {}) // vorladen, damit das Popup nicht blockiert wird
  if (verbunden.value) links.value = (await driveRemote()).links
})

function clientIdSpeichern() {
  if (!/\.apps\.googleusercontent\.com$/.test(clientIdEingabe.value)) {
    return alert('Das sieht nicht wie eine Client-ID aus. Sie endet auf „.apps.googleusercontent.com“.')
  }
  if (clientId.value && clientId.value !== clientIdEingabe.value) {
    abmelden()
    localStorage.removeItem('google.ids')
    verbunden.value = false
  }
  setClientId(clientIdEingabe.value)
  clientId.value = clientIdEingabe.value
  clientIdBearbeiten.value = false
  ladeGoogle().catch(() => {})
}

async function jetztSync() {
  try {
    const remote = await driveRemote()
    if (!hatGueltigesToken()) await anmelden()
    verbunden.value = true
    if (!email.value) {
      const u = await remote.benutzer()
      email.value = u?.emailAddress || ''
      localStorage.setItem('google.email', email.value)
    }
    const stat = await synchronisiere(remote)
    links.value = remote.links
    if (stat) toast('Abgleich abgeschlossen ✓')
    anzahl.value = (await listBurgen()).length
  } catch (e) {
    syncState.fehler = e.message
  }
}

function trennen() {
  if (!confirm('Von Google abmelden? Die Daten in Drive und hier im Browser bleiben erhalten.')) return
  abmelden()
  verbunden.value = false
  email.value = ''
}
</script>

<template>
  <div class="page">
    <div class="page-head"><h1>Daten</h1></div>

    <section class="card">
      <h2>Export aller {{ anzahl }} Burgen</h2>
      <div class="row">
        <button class="btn" @click="exportAlle('csv')">CSV</button>
        <button class="btn" @click="exportAlle('gpx')">GPX</button>
        <button class="btn" @click="exportAlle('geojson')">GeoJSON</button>
      </div>
      <p class="hint">
        <strong>QGIS:</strong> GeoJSON einfach ins Kartenfenster ziehen. CSV über
        <em>Layer → Layer hinzufügen → Getrennte Texte</em>, X-Feld <code>lon</code>, Y-Feld <code>lat</code>, KBS EPSG:4326.
      </p>
    </section>

    <section class="card">
      <h2>Datensicherung</h2>
      <p>
        Zusätzlich zu Google Drive kannst du hier eine komplette Sicherungsdatei herunterladen – sie enthält alle Burgen,
        Bilder und Kataloge und lässt sich jederzeit wieder einspielen.
      </p>
      <div class="row">
        <button class="btn primary" :disabled="busy" @click="sichern">⬇ Sicherung herunterladen</button>
        <label class="btn" :class="{ disabled: busy }">
          ⬆ Sicherung einspielen
          <input type="file" accept=".json,application/json" hidden @change="wiederherstellen" />
        </label>
      </div>
      <p class="hint">Letzte Sicherung: {{ letzte ? new Date(letzte).toLocaleString('de-DE') : 'noch nie' }}</p>
    </section>

    <section class="card">
      <h2>Speicher</h2>
      <p v-if="speicher">Belegt: {{ mb(speicher.genutzt) }} von {{ mb(speicher.frei) }} verfügbar.</p>
      <p v-if="dauerhaft !== null">
        Dauerhafte Speicherung: <strong>{{ dauerhaft ? 'aktiv' : 'nicht gewährt' }}</strong>
        <span v-if="!dauerhaft" class="hint"> – der Browser könnte die Daten bei Speichermangel löschen. Installiere die App auf dem Startbildschirm, dann wird es meist gewährt.</span>
      </p>
    </section>

    <section class="card">
      <h2>Google Drive</h2>

      <template v-if="!clientId || clientIdBearbeiten">
        <p>
          Für den Abgleich braucht die App eine kostenlose <strong>OAuth-Client-ID</strong> aus der Google Cloud Console.
          Die Schritt-für-Schritt-Anleitung steht in <code>GOOGLE-EINRICHTUNG.md</code> im Projektordner.
        </p>
        <form class="row nowrap" @submit.prevent="clientIdSpeichern">
          <input v-model.trim="clientIdEingabe" placeholder="123456789-abc….apps.googleusercontent.com" />
          <button class="btn primary" type="submit">Speichern</button>
        </form>
        <p class="hint">Diese Adresse muss in der Cloud Console als „Autorisierter JavaScript-Ursprung“ eingetragen sein: <code>{{ origin }}</code></p>
      </template>

      <template v-else>
        <div class="google-status">
          <span class="punkt" :class="{ an: verbunden }"></span>
          <span v-if="verbunden">Verbunden{{ email ? ` als ${email}` : '' }}</span>
          <span v-else>Nicht angemeldet</span>
        </div>

        <div class="row">
          <button class="btn primary" :disabled="syncState.laeuft || !online" @click="jetztSync">
            {{ syncState.laeuft ? '🔄 Abgleich läuft …' : verbunden ? '🔄 Jetzt abgleichen' : '🔑 Mit Google anmelden & abgleichen' }}
          </button>
          <a v-if="links.ordner" :href="links.ordner" target="_blank" rel="noopener" class="btn">📁 Ordner in Drive</a>
          <a v-if="links.tabelle" :href="links.tabelle" target="_blank" rel="noopener" class="btn">📊 Tabelle</a>
        </div>

        <p class="hint">
          <template v-if="!online">Offline – der Abgleich startet, sobald wieder Netz da ist und du hier tippst.<br /></template>
          Letzter Abgleich: {{ syncState.letzter ? new Date(syncState.letzter).toLocaleString('de-DE') : 'noch nie' }}
          · Offene Änderungen: <strong>{{ syncState.offen }}</strong>
        </p>
        <p v-if="syncState.fehler" class="fehler">{{ syncState.fehler }}</p>
        <ul v-if="syncState.log.length" class="sync-log">
          <li v-for="(z, i) in syncState.log" :key="i">{{ z }}</li>
        </ul>

        <p class="hint">
          Nach der Anmeldung gleicht die App nach jedem Speichern automatisch ab. Die Anmeldung gilt etwa eine Stunde,
          danach hier erneut auf „Jetzt abgleichen“ tippen.
        </p>
        <div class="row">
          <button v-if="verbunden" class="btn small" @click="trennen">Abmelden</button>
          <button class="btn small" @click="clientIdBearbeiten = true">Client-ID ändern</button>
        </div>
      </template>
    </section>
  </div>
</template>
