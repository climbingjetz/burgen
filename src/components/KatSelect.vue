<script setup>
import { computed } from 'vue'
import { useKatalog } from '../composables/useKatalog.js'

const props = defineProps({
  modelValue: { type: [String, Array], default: '' },
  katalog: { type: String, required: true },
  multi: Boolean,
  tiles: Boolean, // große Kacheln statt Auswahlliste (Feldmodus)
  parent: { type: String, default: '' },
  placeholder: { type: String, default: '– bitte wählen –' },
})
const emit = defineEmits(['update:modelValue'])
const { options } = useKatalog()

const selected = computed(() =>
  props.multi ? props.modelValue || [] : props.modelValue ? [props.modelValue] : [],
)
const opts = computed(() => options(props.katalog, props.parent, selected.value))

function toggle(key) {
  if (props.multi) {
    const v = [...selected.value]
    const i = v.indexOf(key)
    i >= 0 ? v.splice(i, 1) : v.push(key)
    emit('update:modelValue', v)
  } else {
    emit('update:modelValue', props.modelValue === key ? '' : key)
  }
}
</script>

<template>
  <div v-if="multi || tiles" class="chips" :class="{ tiles }">
    <button
      v-for="o in opts"
      :key="o.schluessel"
      type="button"
      class="chip"
      :class="{ on: selected.includes(o.schluessel) }"
      @click="toggle(o.schluessel)"
    >
      {{ o.wert }}
    </button>
  </div>
  <select v-else :value="modelValue || ''" @change="emit('update:modelValue', $event.target.value)">
    <option value="">{{ placeholder }}</option>
    <option v-for="o in opts" :key="o.schluessel" :value="o.schluessel">
      {{ o.wert }}{{ o.aktiv ? '' : ' (inaktiv)' }}
    </option>
  </select>
</template>
