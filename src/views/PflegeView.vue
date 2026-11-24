<script setup>
// Datenpflege: Überblick, automatische Sicherung mit Generationen, Datenqualität, Speicher.
import { ref, computed, onMounted } from 'vue'
import { db } from '../db.js'
import { listBurgen, exportBackup, importBackup, saveBurg, getBilder } from '../store.js'
import { STATUS, hasCoords } from '../fields.js'
import { useKatalog } from '../composables/useKatalog.js'
import { toast } from '../composables/toast.js'
import { download, today } from '../utils/export.js'
import { mb } from '../utils/format.js'
import { zaehleOffen, autoSync } from '../sync.js'
import {
  sicherungState, kannOrdner, zielLaden, ordnerWaehlen, aufInternWechseln, freigeben, autoSicherung, generationen,
  sicherungLesen, wiederherstellen, DB_GENERATIONEN, BILD_GENERATIONEN, DB_ABSTAND, BILD_ABSTAND,
} from '../sicherung.js'

const { label, reload } = useKatalog()

// ---------- Überblick ----------
const burgen = ref([])
const zahlen = ref({ bilder: 0, bilderCloud: 0, dateien: 0, dateienLokal: 0, bytesLokal: 0 })
const speicher = ref(null)
const dauerhaft = ref(null)

async function ladeUeberblick() {
  burgen.value = await listBurgen()
  const [bilder, dateien] = await Promise.all([db.bilder.toArray(), db.dateien.toArray()])
  const aktiv = dateien.filter((d) => !d.geloescht)
  zahlen.value = {
    bilder: bilder.length,
    bilderCloud: bilder.filter((b) => b.driveId).length,
    dateien: aktiv.length,
    dateienLokal: aktiv.filter((d) => d.blob).length,
    bytesLokal: aktiv.reduce((s, d) => s + (d.blob?.size || 0), 0),
  }
  bilderJe.value = Object.fromEntries(Object.entries(bilder.reduce((m, b) => ((m[b.burgId] = (m[b.burgId] || 0) + 1), m), {})))
  if (navigator.storage?.estimate) {
    const e = await navigator.storage.estimate()
    speicher.value = { genutzt: e.usage, frei: e.quota }
  }
  if (navigator.storage?.persisted) dauerhaft.value = await navigator.storage.persisted()
}

const nachStatus = computed(() => STATUS.map((s) => ({ ...s, n: burgen.value.filter((b) => b.status === s.key).length })))

// ---------- Automatische Sicherung ----------
const gen = ref(null)
const genFehler = ref('')
async function ladeGenerationen() {
  genFehler.value = ''
  try {
    gen.value = await generationen()
  } catch (e) {
    gen.value = null
    genFehler.value = e.message
  }
}

const zeit = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : 'noch nie')
const naechste = (letzte, abstand) => {
  if (!letzte) return 'beim nächsten Start'
  const t = new Date(letzte).getTime() + abstand
  return t <= Date.now() ? 'jetzt fällig' : new Date(t).toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
}

async function ordner() {
  try {
    await ordnerWaehlen()
    toast('Sicherungsordner gewählt ✓')
    await jetztSichern()
  } catch (e) {
    if (e.name !== 'AbortError') alert('Ordner konnte nicht gewählt werden: ' + e.message)
  }
}

async function intern() {
  if (!confirm('Künftig im internen Speicher der App sichern statt im gewählten Ordner? Die Sicherungen im Ordner bleiben dort liegen.')) return
  await aufInternWechseln()
  await ladeGenerationen()
}

async function erlauben() {
  if (await freigeben()) {
    toast('Zugriff erlaubt ✓')
    await autoSicherung({ interaktiv: true })
    await ladeGenerationen()
  }
}

async function jetztSichern() {
  await autoSicherung({ erzwingen: true, interaktiv: true })
  if (sicherungState.fehler) alert('Sicherung fehlgeschlagen: ' + sicherungState.fehler)
  else toast('Sicherung erstellt ✓')
  await ladeGenerationen()
}

const genName = (n) => {
  const m = /(\d{4})-(\d\d)-(\d\d)(?:_(\d\d)-(\d\d))?/.exec(n)
  return m ? `${m[3]}.${m[2]}.${m[1]}${m[4] ? `, ${m[4]}:${m[5]} Uhr` : ''}` : n
}

const restoreBusy = ref('')
async function zurueck(g) {
  let info
  try {
    info = await sicherungLesen(g.name)
  } catch (e) {
    return alert('Sicherung kann nicht gelesen werden: ' + e.message)
  }
  const text =
    `Stand vom ${genName(g.name)} wiederherstellen?\n\n` +
    `Die Sicherung enthält ${info.burgen.length} Burgen und ${info.bilder.length} Bilder.\n` +
    `Alle Burgen auf diesem Gerät werden durch diesen Stand ersetzt.\n\n` +
    `Danach wird der wiederhergestellte Stand mit Google Drive abgeglichen und gilt dort als neuester Stand. ` +
    `Burgen, die nach der Sicherung angelegt wurden und schon in Drive liegen, kommen dabei wieder dazu.\n\n` +
    `Tipp: Vorher „Jetzt sichern“ – dann lässt sich auch dieser Schritt rückgängig machen.`
  if (!confirm(text)) return
  restoreBusy.value = g.name
  try {
    const r = await wiederherstellen(g.name, { inCloud: true })
    await reload()
    await ladeUeberblick()
    await zaehleOffen()
    toast(`Wiederhergestellt: ${r.burgen} Burgen, ${r.bilder} Bilder${r.fehlen ? ` (${r.fehlen} Bilder fehlen)` : ''}`, 5000)
    autoSync()
  } catch (e) {
    alert('Wiederherstellen fehlgeschlagen: ' + e.message)
  } finally {
    restoreBusy.value = ''
  }
}

// ---------- Sicherungsdatei (manuell) ----------
const busy = ref(false)
const letzteDatei = ref(localStorage.getItem('letzteSicherung'))
async function dateiSichern() {
  busy.value = true
  try {
    download(`burgen-sicherung_${today()}.json`, JSON.stringify(await exportBackup()), 'application/json')
    letzteDatei.value = new Date().toISOString()
    localStorage.setItem('letzteSicherung', letzteDatei.value)
    toast('Sicherungsdatei erstellt ✓')
  } finally {
    busy.value = false
  }
}
async function dateiEinspielen(e) {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file) return
  if (!confirm('Achtung: Alle aktuellen Daten in dieser App werden durch die Sicherungsdatei ersetzt. Fortfahren?')) return
  busy.value = true
  try {
    await importBackup(JSON.parse(await file.text()))
    await reload()
    await ladeUeberblick()
    toast('Sicherung eingespielt ✓')
  } catch (err) {
    alert('Einspielen fehlgeschlagen: ' + err.message)
  } finally {
    busy.value = false
  }
}

// ---------- Datenqualität ----------
const bilderJe = ref({})
const norm = (s) => String(s || '').toLowerCase().replace(/^(burg|ruine|schloss|burgruine|burgstall)\s+/, '').replace(/[^a-z0-9äöüß]/g, '')
function entfernung(a, b) {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const pruefungen = computed(() => {
  const B = burgen.value
  const dubletten = []
  for (let i = 0; i < B.length; i++) {
    for (let j = i + 1; j < B.length; j++) {
      const a = B[i]
      const b = B[j]
      const gleichName = norm(a.name) && norm(a.name) === norm(b.name)
      const nah = hasCoords(a) && hasCoords(b) && entfernung(a, b) < 150
      if (gleichName || nah) dubletten.push({ a, b, grund: gleichName && nah ? 'gleicher Name, < 150 m' : gleichName ? 'gleicher Name' : `${Math.round(entfernung(a, b))} m entfernt` })
    }
  }
  return [
    { key: 'koord', titel: 'Ohne Koordinaten', ico: '📍', liste: B.filter((b) => !hasCoords(b)) },
    { key: 'bild', titel: 'Ohne Bild', ico: '📷', liste: B.filter((b) => !bilderJe.value[b.id]) },
    { key: 'feld', titel: 'Feld-Entwürfe (noch nachzuarbeiten)', ico: '✏️', liste: B.filter((b) => b.status === 'feld'), sammel: true },
    { key: 'art', titel: 'Ohne Burgtyp', ico: '🏰', liste: B.filter((b) => !b.art) },
    { key: 'land', titel: 'Ohne Land / Region', ico: '🗺️', liste: B.filter((b) => !b.land || !b.region) },
    { key: 'ungenau', titel: 'Ungenaue GPS-Position (> 50 m)', ico: '🎯', liste: B.filter((b) => Number(b.genauigkeit) > 50) },
    { key: 'unbenannt', titel: 'Ohne richtigen Namen', ico: '❓', liste: B.filter((b) => !b.name || /^Unbenannt /.test(b.name)) },
    { key: 'dublette', titel: 'Mögliche Doppelerfassungen', ico: '👯', paare: dubletten },
  ]
})
const offen = ref('')
const umfang = (p) => (p.paare ? p.paare.length : p.liste.length)
const sachlich = (b) => [label('ART', b.art), b.gemeinde, label('LAND', b.land)].filter(Boolean).join(' · ')

async function alleVollstaendig(p) {
  if (!confirm(`${p.liste.length} Feld-Entwürfe als „Vollständig“ markieren?`)) return
  for (const b of p.liste) await saveBurg({ ...b, status: 'vollstaendig' }, await getBilder(b.id))
  await ladeUeberblick()
  await zaehleOffen()
  toast('Status geändert ✓')
  autoSync()
}

onMounted(async () => {
  await ladeUeberblick()
  await zielLaden()
  await ladeGenerationen()
})
</script>

<template>
  <div class="page pflege">
    <div class="page-head"><h1>🧰 Datenpflege</h1></div>

    <!-- Überblick -->
    <section class="kacheln-stat">
      <div class="stat"><strong>{{ burgen.length }}</strong><span>Burgen</span></div>
      <div class="stat"><strong>{{ zahlen.bilder }}</strong><span>Bilder</span><small>{{ zahlen.bilderCloud }} in der Cloud</small></div>
      <div class="stat"><strong>{{ zahlen.dateien }}</strong><span>Dateien</span><small>{{ zahlen.dateienLokal }} nur auf dem Gerät</small></div>
      <div class="stat" v-if="speicher"><strong>{{ mb(speicher.genutzt) }}</strong><span>belegt</span><small>von {{ mb(speicher.frei) }}</small></div>
    </section>
    <div class="status-balken" v-if="burgen.length">
      <span v-for="s in nachStatus.filter((x) => x.n)" :key="s.key" class="status" :class="s.key" :style="{ flex: s.n }" :title="`${s.label}: ${s.n}`">
        {{ s.n ? `${s.label} ${s.n}` : '' }}
      </span>
    </div>

    <!-- Sicherung -->
    <section class="card">
      <h2>💾 Automatische Sicherung</h2>
      <div class="sicherung-ziel">
        <template v-if="sicherungState.ziel === 'ordner'">
          <span>📁 Ordner: <strong>{{ sicherungState.ordnerName }}</strong> / Burgen-Sicherung</span>
          <button class="btn small" @click="ordner">Anderen Ordner …</button>
          <button class="btn small" @click="intern">Intern sichern</button>
        </template>
        <template v-else>
          <span>📦 Interner Speicher der App</span>
          <button v-if="kannOrdner()" class="btn small primary" @click="ordner">📁 Ordner auf dem PC wählen …</button>
        </template>
      </div>
      <p v-if="sicherungState.ziel !== 'ordner' && kannOrdner()" class="hint">
        Empfehlung: einen Ordner wählen (z. B. auf einer externen Festplatte oder in einem Cloud-Sync-Ordner).
        Der interne Speicher schützt vor Bedienfehlern, aber nicht vor dem Löschen der Browserdaten.
      </p>
      <p v-else-if="!kannOrdner()" class="hint">
        Dieser Browser kann keine Ordner freigeben (Handy, Firefox, Safari) – gesichert wird deshalb im internen Speicher der App.
        Für eine Sicherung außerhalb: unten „Sicherungsdatei herunterladen“.
      </p>

      <p v-if="sicherungState.brauchtFreigabe" class="card warnung">
        Der Browser braucht deine Erlaubnis, in den Sicherungsordner zu schreiben.
        <button class="btn small primary" @click="erlauben">Zugriff erlauben</button>
      </p>

      <div class="sicherung-plan">
        <div>
          <strong>Datenbank</strong> <span class="hint">2× täglich · {{ DB_GENERATIONEN }} Generationen</span><br />
          Zuletzt: {{ zeit(sicherungState.letzteDb) }} · nächste: {{ naechste(sicherungState.letzteDb, DB_ABSTAND) }}
        </div>
        <div>
          <strong>Bilder</strong> <span class="hint">1× täglich · {{ BILD_GENERATIONEN }} Generationen</span><br />
          Zuletzt: {{ zeit(sicherungState.letzteBilder) }} · nächste: {{ naechste(sicherungState.letzteBilder, BILD_ABSTAND) }}
        </div>
      </div>
      <div class="row">
        <button class="btn primary" :disabled="sicherungState.laeuft" @click="jetztSichern">
          {{ sicherungState.laeuft ? '⏳ ' + (sicherungState.text || 'Sichere …') : '💾 Jetzt sichern' }}
        </button>
      </div>
      <p v-if="sicherungState.fehler" class="fehler">{{ sicherungState.fehler }}</p>

      <h3>Datenbank-Generationen</h3>
      <p v-if="genFehler" class="fehler">{{ genFehler }}</p>
      <p v-else-if="!gen" class="hint">{{ sicherungState.brauchtFreigabe ? 'Erst nach der Freigabe sichtbar.' : 'Wird geladen …' }}</p>
      <p v-else-if="!gen.db.length" class="hint">Noch keine Sicherung vorhanden.</p>
      <ul v-else class="generationen">
        <li v-for="(g, i) in gen.db" :key="g.name">
          <span class="gen-nr">{{ i + 1 }}</span>
          <span class="gen-name">{{ genName(g.name) }} <span class="hint">· {{ mb(g.groesse) }}</span></span>
          <button class="btn small" :disabled="!!restoreBusy" @click="zurueck(g)">{{ restoreBusy === g.name ? '⏳ …' : '↩ Wiederherstellen' }}</button>
        </li>
      </ul>
      <template v-if="gen">
        <h3>Bilder-Generationen</h3>
        <p v-if="!gen.staende.length" class="hint">Noch keine Bildsicherung vorhanden.</p>
        <ul v-else class="generationen">
          <li v-for="(s, i) in gen.staende" :key="s.name">
            <span class="gen-nr">{{ i + 1 }}</span>
            <span class="gen-name">{{ genName(s.name) }} <span class="hint">· {{ s.anzahl }} Bilder</span></span>
          </li>
        </ul>
        <p class="hint">
          Bildspeicher: {{ gen.bilder.dateien }} Dateien, {{ mb(gen.bilder.bytes) }}. Jedes Foto wird nur einmal abgelegt und
          von den Ständen gemeinsam genutzt; gelöscht wird es erst, wenn es in keinem der {{ BILD_GENERATIONEN }} Stände mehr vorkommt.
          Beim Wiederherstellen einer Datenbank-Generation werden die passenden Bilder automatisch mit eingespielt.
        </p>
      </template>
      <p class="hint">
        Gesichert wird, während die App geöffnet ist. Ist eine Sicherung fällig, läuft sie beim nächsten Öffnen.
        Zusatzdateien (Videos usw.) liegen in Google Drive und sind nicht Teil der lokalen Sicherung.
      </p>
    </section>

    <!-- Datenqualität -->
    <section class="card">
      <h2>🔍 Datenqualität</h2>
      <ul class="pruefungen">
        <li v-for="p in pruefungen" :key="p.key" :class="{ ok: !umfang(p), auf: offen === p.key }">
          <button class="pruef-kopf" :disabled="!umfang(p)" @click="offen = offen === p.key ? '' : p.key">
            <span>{{ p.ico }}</span>
            <span class="pruef-titel">{{ p.titel }}</span>
            <span class="pruef-zahl">{{ umfang(p) || '✓' }}</span>
          </button>
          <div v-if="offen === p.key" class="pruef-liste">
            <template v-if="p.paare">
              <div v-for="(d, i) in p.paare" :key="i" class="dublette">
                <router-link :to="`/burg/${d.a.id}`">{{ d.a.name || d.a.id }}</router-link>
                <span class="hint">↔</span>
                <router-link :to="`/burg/${d.b.id}`">{{ d.b.name || d.b.id }}</router-link>
                <span class="hint">({{ d.grund }})</span>
              </div>
            </template>
            <template v-else>
              <router-link v-for="b in p.liste" :key="b.id" :to="`/burg/${b.id}`" class="pruef-eintrag">
                <strong>{{ b.name || b.id }}</strong> <span class="hint">{{ sachlich(b) }}</span>
              </router-link>
              <button v-if="p.sammel" class="btn small" @click="alleVollstaendig(p)">Alle als „Vollständig“ markieren</button>
            </template>
          </div>
        </li>
      </ul>
    </section>

    <!-- Sicherungsdatei -->
    <section class="card">
      <h2>📄 Sicherungsdatei</h2>
      <p>Eine komplette Sicherung (Burgen, Bilder, Kataloge) als einzelne Datei – zum Aufheben, Mitnehmen oder Umziehen auf ein anderes Gerät.</p>
      <div class="row">
        <button class="btn" :disabled="busy" @click="dateiSichern">⬇ Sicherungsdatei herunterladen</button>
        <label class="btn" :class="{ disabled: busy }">
          ⬆ Sicherungsdatei einspielen
          <input type="file" accept=".json,application/json" hidden @change="dateiEinspielen" />
        </label>
      </div>
      <p class="hint">Zuletzt heruntergeladen: {{ letzteDatei ? zeit(letzteDatei) : 'noch nie' }}</p>
    </section>

    <!-- Speicher -->
    <section class="card">
      <h2>📦 Speicher auf diesem Gerät</h2>
      <p v-if="speicher">Belegt: {{ mb(speicher.genutzt) }} von {{ mb(speicher.frei) }} verfügbar.</p>
      <p>Zusatzdateien, die noch auf Drive warten: {{ zahlen.dateienLokal }} ({{ mb(zahlen.bytesLokal) }}).</p>
      <p v-if="dauerhaft !== null">
        Dauerhafte Speicherung: <strong>{{ dauerhaft ? 'aktiv' : 'nicht gewährt' }}</strong>
        <span v-if="!dauerhaft" class="hint"> – der Browser könnte die Daten bei Speichermangel löschen. Installiere die App auf dem Startbildschirm, dann wird es meist gewährt.</span>
      </p>
    </section>
  </div>
</template>
