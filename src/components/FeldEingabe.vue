<script setup>
// Eingabeelement für ein Feld aus fields.js – genutzt im Formular und im Kompaktmodus.
// "burg" ist das bearbeitete Objekt; das Feld wird direkt darin gesetzt.
import { STATUS } from '../fields.js'
import KatSelect from './KatSelect.vue'
import StarRating from './StarRating.vue'

defineProps({
  f: { type: Object, required: true },
  burg: { type: Object, required: true },
  kacheln: Boolean, // Katalogfelder als große Kacheln (Kompaktmodus)
  gross: Boolean,
})
</script>

<template>
  <input v-if="f.type === 'text'" v-model="burg[f.key]" type="text" :class="{ 'big-input': gross }" />
  <input v-else-if="f.type === 'number'" v-model.number="burg[f.key]" type="number" inputmode="decimal" />
  <input v-else-if="f.type === 'date'" v-model="burg[f.key]" type="date" />
  <div v-else-if="f.type === 'url'" class="row nowrap">
    <input v-model="burg[f.key]" type="url" placeholder="https://" />
    <a v-if="burg[f.key]" :href="burg[f.key]" target="_blank" rel="noopener" class="btn small">↗</a>
  </div>
  <textarea v-else-if="f.type === 'textarea'" v-model="burg[f.key]" :rows="gross ? 3 : 4"></textarea>
  <select v-else-if="f.type === 'status'" v-model="burg[f.key]">
    <option v-for="st in STATUS" :key="st.key" :value="st.key">{{ st.label }}</option>
  </select>
  <KatSelect
    v-else-if="f.type === 'kat'"
    v-model="burg[f.key]"
    :katalog="f.katalog"
    :parent="f.parentField ? burg[f.parentField] : ''"
    :tiles="kacheln"
  />
  <KatSelect v-else-if="f.type === 'katMulti'" v-model="burg[f.key]" :katalog="f.katalog" multi />
  <StarRating v-else-if="f.type === 'rating'" v-model="burg[f.key]" />
</template>
