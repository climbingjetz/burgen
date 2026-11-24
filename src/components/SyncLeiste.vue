<script setup>
// Statusleiste unter der Kopfzeile: zeigt immer, was gerade im Hintergrund passiert.
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { syncState, jetztHochladen } from '../sync.js'
import { mb } from '../utils/format.js'

const router = useRouter()
const online = ref(navigator.onLine)
const setOnline = () => (online.value = navigator.onLine)
onMounted(() => {
  window.addEventListener('online', setOnline)
  window.addEventListener('offline', setOnline)
})
onBeforeUnmount(() => {
  window.removeEventListener('online', setOnline)
  window.removeEventListener('offline', setOnline)
})

// kurz "alles in der Cloud" zeigen, nachdem etwas übertragen wurde
const fertig = ref(false)
let timer
watch(
  () => syncState.laeuft,
  (l, vorher) => {
    if (vorher && !l && !syncState.offen && !syncState.fehler) {
      fertig.value = true
      clearTimeout(timer)
      timer = setTimeout(() => (fertig.value = false), 3000)
    }
  },
)

const B = syncState.bild
const wartetText = computed(() => {
  const teile = []
  if (syncState.offenDaten) teile.push(`${syncState.offenDaten} Burg${syncState.offenDaten > 1 ? 'en' : ''}`)
  if (syncState.bilderHoch) teile.push(`${syncState.bilderHoch} Bild${syncState.bilderHoch > 1 ? 'er' : ''} (${mb(syncState.bytesHoch)})`)
  if (syncState.offenSonst && !teile.length) teile.push(`${syncState.offenSonst} Änderung${syncState.offenSonst > 1 ? 'en' : ''}`)
  return teile.join(' + ')
})

const zustand = computed(() => {
  if (!syncState.verbunden) return null
  if (syncState.laeuft) return 'laeuft'
  if (syncState.brauchtAnmeldung && syncState.offen) return 'anmeldung'
  if (syncState.offen && !online.value) return 'offline'
  if (syncState.fehler && syncState.offen) return 'fehler'
  if (syncState.offen) return 'wartet'
  if (syncState.bilderRunter) return 'runter'
  if (fertig.value) return 'fertig'
  return null
})

// Höhe für klebende Seitenköpfe bereitstellen
watch(zustand, (z) => document.documentElement.style.setProperty('--leiste-h', z ? '38px' : '0px'), { immediate: true })

const balken = computed(() => {
  if (syncState.phase !== 'bilder' || !B.gesamt) return null
  if (B.bytesGesamt) return Math.min(100, Math.round((B.bytesFertig / B.bytesGesamt) * 100))
  return Math.round((B.fertig / B.gesamt) * 100)
})

const knopfBusy = ref(false)
async function hochladen() {
  knopfBusy.value = true
  try {
    await jetztHochladen()
  } catch (e) {
    syncState.fehler = e.message
  } finally {
    knopfBusy.value = false
  }
}
</script>

<template>
  <div v-if="zustand" class="sync-leiste" :class="zustand" @click.self="router.push('/daten')">
    <template v-if="zustand === 'laeuft'">
      <span class="spin">🔄</span>
      <span class="text" @click="router.push('/daten')">
        {{ syncState.aktuell || 'Abgleich läuft …' }}
        <template v-if="syncState.phase === 'bilder' && B.gesamt">
          · {{ B.prozent }} % <span class="leise">({{ Math.min(B.fertig + 1, B.gesamt) }}/{{ B.gesamt }})</span>
        </template>
      </span>
      <span v-if="balken != null" class="balken"><span :style="{ width: balken + '%' }"></span></span>
    </template>

    <template v-else-if="zustand === 'anmeldung'">
      <span>🔑</span>
      <span class="text">Anmeldung nötig · {{ wartetText }} warten</span>
      <button class="btn small" :disabled="knopfBusy" @click="hochladen">Anmelden &amp; hochladen</button>
    </template>

    <template v-else-if="zustand === 'offline'">
      <span>📴</span>
      <span class="text">Offline – {{ wartetText }} sicher auf dem Gerät, Upload folgt automatisch</span>
    </template>

    <template v-else-if="zustand === 'fehler'">
      <span>⚠</span>
      <span class="text" @click="router.push('/daten')">{{ syncState.fehler }}</span>
      <button class="btn small" :disabled="knopfBusy" @click="hochladen">Erneut</button>
    </template>

    <template v-else-if="zustand === 'wartet'">
      <span>⏳</span>
      <span class="text" @click="router.push('/daten')">
        <template v-if="syncState.wartet">{{ syncState.wartet }} · {{ wartetText }} warten</template>
        <template v-else>{{ wartetText }} noch nicht in der Cloud</template>
      </span>
      <button class="btn small" :disabled="knopfBusy" @click="hochladen">{{ syncState.wartet ? 'Trotzdem jetzt' : 'Jetzt hochladen' }}</button>
    </template>

    <template v-else-if="zustand === 'runter'">
      <span>⬇</span>
      <span class="text">{{ syncState.bilderRunter }} Bild(er) aus der Cloud noch nicht auf diesem Gerät<template v-if="syncState.wartet"> – {{ syncState.wartet }}</template></span>
      <button class="btn small" :disabled="knopfBusy" @click="hochladen">Jetzt laden</button>
    </template>

    <template v-else-if="zustand === 'fertig'">
      <span>☁</span><span class="text">Alles in der Cloud ✓</span>
    </template>
  </div>
</template>
