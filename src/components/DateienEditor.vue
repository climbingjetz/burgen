<script setup>
// Zusatzdateien einer Burg: Notizen, Sprachaufnahmen, Videos, Dokumente …
// Mit burgId: Dateien werden sofort gespeichert (Burg-Formular).
// Ohne burgId (v-model): Dateien werden gesammelt und beim Speichern der Burg angelegt (Kompaktmodus).
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { getDateien, addDatei, updateDatei, deleteDatei } from '../store.js'
import { syncState, zaehleOffen, autoSync } from '../sync.js'
import { mb } from '../utils/format.js'
import { toast } from '../composables/toast.js'

const props = defineProps({
  burgId: { type: String, default: '' },
  modelValue: { type: Array, default: null },
  big: Boolean,
})
const emit = defineEmits(['update:modelValue'])

const liste = ref([])
const sammeln = computed(() => !props.burgId)

async function laden() {
  if (props.burgId) liste.value = await getDateien(props.burgId)
  else liste.value = props.modelValue || []
}
onMounted(laden)
watch(() => props.burgId, laden)
watch(() => props.modelValue, () => sammeln.value && laden())
// nach einem Abgleich (Datei hochgeladen / von anderem Gerät) neu laden
watch(() => syncState.laeuft, (l) => !l && props.burgId && laden())
watch(() => syncState.dateienHoch, () => props.burgId && laden())

async function neu(blob, name, notiz = '') {
  if (sammeln.value) {
    emit('update:modelValue', [...(props.modelValue || []), { id: 'neu-' + Math.random().toString(36).slice(2), blob, name, notiz, typ: blob.type, groesse: blob.size, erstellt: new Date().toISOString() }])
    return
  }
  await addDatei(props.burgId, blob, name, notiz)
  await laden()
  await zaehleOffen()
  autoSync()
}

async function dateienGewaehlt(e) {
  const files = [...e.target.files]
  e.target.value = ''
  for (const f of files) await neu(f, f.name)
  if (files.length) toast(`${files.length} Datei(en) auf dem Gerät gespeichert ✓`)
}

// ---------- Notiz ----------
const notizOffen = ref(false)
const notizText = ref('')
const stempel = () => new Date().toLocaleString('sv-SE').slice(0, 16).replace(' ', '_').replace(':', '-')
async function notizSpeichern() {
  if (!notizText.value.trim()) return (notizOffen.value = false)
  await neu(new Blob([notizText.value], { type: 'text/plain;charset=utf-8' }), `Notiz_${stempel()}.txt`)
  notizText.value = ''
  notizOffen.value = false
  toast('Notiz gespeichert ✓')
}

// ---------- Sprachaufnahme ----------
const aufnahme = ref(null) // { rec, start }
const sekunden = ref(0)
let uhr
const kannAufnehmen = !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder)
async function aufnahmeStart() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const rec = new MediaRecorder(stream)
    const teile = []
    rec.ondataavailable = (e) => e.data.size && teile.push(e.data)
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop())
      const typ = rec.mimeType || 'audio/webm'
      const ext = typ.includes('mp4') ? 'm4a' : typ.includes('ogg') ? 'ogg' : 'webm'
      await neu(new Blob(teile, { type: typ }), `Sprachnotiz_${stempel()}.${ext}`)
      toast('Sprachnotiz gespeichert ✓')
    }
    rec.start()
    aufnahme.value = { rec }
    sekunden.value = 0
    uhr = setInterval(() => sekunden.value++, 1000)
  } catch (e) {
    alert('Mikrofon nicht verfügbar: ' + (e.message || e.name))
  }
}
function aufnahmeStopp() {
  clearInterval(uhr)
  aufnahme.value?.rec.stop()
  aufnahme.value = null
}
onBeforeUnmount(() => aufnahme.value && aufnahmeStopp())

// ---------- Anzeige ----------
function symbol(d) {
  const t = d.typ || ''
  if (t.startsWith('image/')) return '🖼️'
  if (t.startsWith('video/')) return '🎬'
  if (t.startsWith('audio/')) return '🎤'
  if (t.startsWith('text/')) return '📝'
  if (t.includes('pdf')) return '📕'
  return '📄'
}
function status(d) {
  if (sammeln.value) return { cls: 'offen', text: 'wird mit der Burg gespeichert' }
  if (d.driveId) return { cls: 'ok', text: d.blob ? '☁ in Drive' : '☁ in Drive' }
  if (syncState.laeuft && syncState.aktuell.endsWith(d.name)) return { cls: 'laeuft', text: `🔄 ${syncState.bild.prozent} %` }
  if (d.blob) return { cls: 'offen', text: '⏳ nur auf diesem Gerät' }
  return { cls: 'runter', text: '⏳ wird von einem anderen Gerät hochgeladen' }
}

const urls = new Map()
onBeforeUnmount(() => urls.forEach((u) => URL.revokeObjectURL(u)))
function oeffnen(d) {
  if (d.blob) {
    if (!urls.has(d.id)) urls.set(d.id, URL.createObjectURL(d.blob))
    window.open(urls.get(d.id), '_blank')
  } else if (d.driveId) {
    window.open(`https://drive.google.com/file/d/${d.driveId}/view`, '_blank', 'noopener')
  }
}

async function umbenennen(d) {
  const name = prompt('Neuer Dateiname:', d.name)
  if (!name || name === d.name) return
  if (sammeln.value) {
    emit('update:modelValue', props.modelValue.map((x) => (x.id === d.id ? { ...x, name } : x)))
    return
  }
  await updateDatei(d.id, { name: name.replace(/[\\/:*?"<>|]+/g, '_') })
  await laden()
  await zaehleOffen()
  autoSync()
}

async function entfernen(d) {
  if (!confirm(`„${d.name}“ löschen?${d.driveId ? ' Sie wird auch in Google Drive in den Papierkorb gelegt.' : ''}`)) return
  if (sammeln.value) {
    emit('update:modelValue', props.modelValue.filter((x) => x.id !== d.id))
    return
  }
  await deleteDatei(d.id)
  await laden()
  await zaehleOffen()
  autoSync()
}

const datum = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '')
</script>

<template>
  <div class="dateien">
    <ul v-if="liste.length" class="datei-liste">
      <li v-for="d in liste" :key="d.id">
        <span class="datei-ico">{{ symbol(d) }}</span>
        <button type="button" class="datei-name" :disabled="!d.blob && !d.driveId" @click="oeffnen(d)">
          <strong>{{ d.name }}</strong>
          <span class="hint">{{ mb(d.groesse) }} · {{ datum(d.erstellt) }}</span>
        </button>
        <span class="datei-status" :class="status(d).cls">{{ status(d).text }}</span>
        <span class="datei-tools">
          <button type="button" title="Umbenennen" @click="umbenennen(d)">✎</button>
          <button type="button" title="Löschen" @click="entfernen(d)">✕</button>
        </span>
      </li>
    </ul>
    <p v-else class="hint">Noch keine Dateien. Hier kannst du Notizen, Sprachaufnahmen, Videos, PDFs und andere Dateien ablegen.</p>

    <div v-if="notizOffen" class="notiz-neu">
      <textarea v-model="notizText" rows="5" placeholder="Notiz …" autofocus></textarea>
      <div class="row">
        <button type="button" class="btn primary" @click="notizSpeichern">Notiz speichern</button>
        <button type="button" class="btn" @click="notizOffen = false">Abbrechen</button>
      </div>
    </div>

    <div class="row datei-add">
      <button type="button" class="btn" :class="{ big }" @click="notizOffen = true">📝 Notiz</button>
      <button v-if="kannAufnehmen && !aufnahme" type="button" class="btn" :class="{ big }" @click="aufnahmeStart">🎤 Sprachnotiz</button>
      <button v-if="aufnahme" type="button" class="btn primary pulse" :class="{ big }" @click="aufnahmeStopp">
        ⏹ Aufnahme beenden ({{ Math.floor(sekunden / 60) }}:{{ String(sekunden % 60).padStart(2, '0') }})
      </button>
      <label class="btn" :class="{ big }">
        🎥 Video
        <input type="file" accept="video/*" capture="environment" hidden @change="dateienGewaehlt" />
      </label>
      <label class="btn" :class="{ big }">
        📎 Datei
        <input type="file" multiple hidden @change="dateienGewaehlt" />
      </label>
    </div>
    <p v-if="!sammeln" class="hint">
      Dateien werden zuerst auf dem Gerät gespeichert, dann nach Google Drive hochgeladen (Ordner der Burg → „Dateien“)
      und danach auf dem Gerät freigegeben. Zum Öffnen wird dann die Drive-Ansicht genutzt.
    </p>
  </div>
</template>
