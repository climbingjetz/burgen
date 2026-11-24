<script setup>
import { ref, computed, watch } from 'vue'
import { KATALOGE } from '../fields.js'
import { useKatalog } from '../composables/useKatalog.js'
import { addKatalogEntry, updateKatalogEntry, deleteKatalogEntry, katalogUsage } from '../store.js'
import { toast } from '../composables/toast.js'
import { zaehleOffen } from '../sync.js'
import { onBeforeUnmount } from 'vue'

onBeforeUnmount(zaehleOffen)

const { all, reload } = useKatalog()
const aktKat = ref('ART')
const filterParent = ref('')
const neuWert = ref('')
const neuParent = ref('')
const usage = ref({})

const meta = computed(() => KATALOGE.find((k) => k.key === aktKat.value))
const eltern = computed(() => (meta.value.parent ? all(meta.value.parent) : []))
const liste = computed(() => all(aktKat.value).filter((e) => !filterParent.value || e.parent === filterParent.value))

watch(aktKat, async () => {
  filterParent.value = ''
  neuParent.value = ''
  usage.value = await katalogUsage(aktKat.value)
}, { immediate: true })
watch(filterParent, (p) => (neuParent.value = p))

async function upd(e, changes) {
  if ('wert' in changes && !changes.wert.trim()) return toast('Der Text darf nicht leer sein.')
  await updateKatalogEntry(e.id, changes)
  await reload()
}

async function hinzufuegen() {
  const w = neuWert.value.trim()
  if (!w) return
  if (all(aktKat.value).some((e) => e.wert.toLowerCase() === w.toLowerCase() && (e.parent || '') === (neuParent.value || ''))) {
    return toast('Diesen Wert gibt es schon.')
  }
  await addKatalogEntry(aktKat.value, w, neuParent.value)
  await reload()
  neuWert.value = ''
  toast(`„${w}“ hinzugefügt`)
}

async function loeschen(e) {
  if (usage.value[e.schluessel]) {
    return alert(`„${e.wert}“ wird in ${usage.value[e.schluessel]} Burg(en) verwendet und kann nicht gelöscht werden.\nDeaktiviere den Wert stattdessen – dann erscheint er nicht mehr in der Auswahl.`)
  }
  if (!confirm(`„${e.wert}“ löschen?`)) return
  await deleteKatalogEntry(e.id)
  await reload()
}

async function verschieben(i, d) {
  const a = liste.value[i], b = liste.value[i + d]
  if (!a || !b) return
  // Sortierwerte tauschen (bei Gleichstand neu vergeben)
  const sa = a.sort === b.sort ? b.sort + d : b.sort
  await updateKatalogEntry(a.id, { sort: sa })
  await updateKatalogEntry(b.id, { sort: a.sort })
  await reload()
}

const elternName = (k) => eltern.value.find((e) => e.schluessel === k)?.wert || k
</script>

<template>
  <div class="page">
    <div class="page-head"><h1>Kataloge</h1></div>

    <div class="katalog-layout">
      <nav class="kat-nav card">
        <select v-model="aktKat" class="only-mobile">
          <option v-for="k in KATALOGE" :key="k.key" :value="k.key">{{ k.label }}</option>
        </select>
        <button
          v-for="k in KATALOGE"
          :key="k.key"
          class="kat-tab only-desktop"
          :class="{ on: k.key === aktKat }"
          @click="aktKat = k.key"
        >{{ k.label }}</button>
      </nav>

      <section class="card kat-main">
        <h2>{{ meta.label }}</h2>
        <p class="hint">
          Texte lassen sich direkt ändern – bestehende Burgen zeigen automatisch den neuen Text.
          Nicht mehr benötigte Werte <strong>deaktivieren</strong> statt löschen.
        </p>

        <div v-if="meta.parent" class="row">
          <label class="field inline">
            <span>Filter {{ KATALOGE.find((k) => k.key === meta.parent).label }}:</span>
            <select v-model="filterParent">
              <option value="">alle</option>
              <option v-for="p in eltern" :key="p.schluessel" :value="p.schluessel">{{ p.wert }}</option>
            </select>
          </label>
        </div>

        <form class="row kat-neu" @submit.prevent="hinzufuegen">
          <input v-model="neuWert" placeholder="Neuer Wert …" />
          <select v-if="meta.parent" v-model="neuParent">
            <option value="">(ohne Zuordnung)</option>
            <option v-for="p in eltern" :key="p.schluessel" :value="p.schluessel">{{ p.wert }}</option>
          </select>
          <button class="btn primary" type="submit">+ Hinzufügen</button>
        </form>

        <table class="kat-table">
          <thead>
            <tr>
              <th></th>
              <th>Text</th>
              <th v-if="meta.parent">Gehört zu</th>
              <th title="Anzahl Burgen">Verw.</th>
              <th>Aktiv</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(e, i) in liste" :key="e.id" :class="{ inaktiv: !e.aktiv }">
              <td class="nowrap">
                <button class="icon" :disabled="i === 0" title="nach oben" @click="verschieben(i, -1)">▲</button>
                <button class="icon" :disabled="i === liste.length - 1" title="nach unten" @click="verschieben(i, 1)">▼</button>
              </td>
              <td>
                <input :value="e.wert" @change="upd(e, { wert: $event.target.value.trim() })" />
                <small class="key">{{ e.schluessel }}</small>
              </td>
              <td v-if="meta.parent">
                <select :value="e.parent" @change="upd(e, { parent: $event.target.value })">
                  <option value="">–</option>
                  <option v-for="p in eltern" :key="p.schluessel" :value="p.schluessel">{{ p.wert }}</option>
                </select>
              </td>
              <td class="center">{{ usage[e.schluessel] || '' }}</td>
              <td class="center"><input type="checkbox" :checked="e.aktiv" @change="upd(e, { aktiv: $event.target.checked })" /></td>
              <td><button class="icon" title="Löschen" @click="loeschen(e)">🗑</button></td>
            </tr>
          </tbody>
        </table>
        <p v-if="!liste.length" class="hint">Keine Einträge{{ filterParent ? ` für ${elternName(filterParent)}` : '' }}.</p>
      </section>
    </div>
  </div>
</template>
