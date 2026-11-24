import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router.js'
import { initStore } from './store.js'
import { loadKatalog } from './composables/useKatalog.js'
import './style.css'

async function start() {
  await initStore()
  await loadKatalog()
  createApp(App).use(router).mount('#app')
}

start().catch((e) => {
  document.getElementById('app').innerHTML = `<p style="padding:1rem;color:#a00">Fehler beim Start: ${e.message}</p>`
  console.error(e)
})
