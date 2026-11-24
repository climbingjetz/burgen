<script setup>
const props = defineProps({ modelValue: { type: Number, default: 0 } })
const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <span class="stars">
    <button
      v-for="n in 5"
      :key="n"
      type="button"
      :class="{ on: n <= (modelValue || 0) }"
      :title="`${n} von 5`"
      @click="emit('update:modelValue', props.modelValue === n ? 0 : n)"
    >★</button>
  </span>
</template>
