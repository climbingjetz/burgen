<script setup>
// Zeigt je Burg, ob sie vollständig in der Cloud liegt.
import { computed } from 'vue'
import { syncState, cloud } from '../sync.js'

const props = defineProps({
  id: { type: String, required: true },
  kurz: Boolean, // für die Liste: nur Symbol + knapper Text
})

const z = computed(() => {
  if (!syncState.verbunden) return null
  const c = cloud[props.id]
  if (!c) return null
  const jetzt = syncState.laeuft && syncState.aktuellId === props.id
  if (jetzt && syncState.phase === 'bilder') return { cls: 'laeuft', ico: '🔄', text: `wird hochgeladen · ${syncState.bild.prozent} %`, kurz: `${syncState.bild.prozent} %` }
  if (jetzt) return { cls: 'laeuft', ico: '🔄', text: 'wird abgeglichen …', kurz: '…' }
  if (c.daten || c.hoch) {
    const teile = []
    if (c.daten) teile.push('Daten')
    if (c.hoch) teile.push(`${c.hoch} Bild${c.hoch > 1 ? 'er' : ''}`)
    return { cls: 'offen', ico: '⏳', text: `Noch nicht vollständig in der Cloud: ${teile.join(' + ')} fehlen`, kurz: c.hoch ? `${c.hoch} 📷` : 'offen' }
  }
  if (c.runter) return { cls: 'runter', ico: '⬇', text: `${c.runter} Bild(er) noch nicht auf diesem Gerät`, kurz: `${c.runter} ⬇` }
  return { cls: 'ok', ico: '☁', text: 'Vollständig in der Cloud', kurz: '' }
})
</script>

<template>
  <span v-if="z" class="cloud-chip" :class="[z.cls, { kurz }]" :title="z.text">
    <span>{{ z.ico }}</span><span v-if="!kurz || z.kurz">{{ kurz ? z.kurz : z.text }}</span>
  </span>
</template>
