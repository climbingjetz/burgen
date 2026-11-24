import { ref } from 'vue'

export const toastText = ref('')
let timer

export function toast(text, ms = 2500) {
  toastText.value = text
  clearTimeout(timer)
  timer = setTimeout(() => (toastText.value = ''), ms)
}
