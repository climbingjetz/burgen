<script setup>
import { onMounted } from 'vue'
import { toastText } from './composables/toast.js'
import { syncState, autoSync, starteAutomatik } from './sync.js'
import SyncLeiste from './components/SyncLeiste.vue'

// Beim Start: offene Änderungen zählen, – falls noch angemeldet – abgleichen
// und bei besserem Netz / Rückkehr in die App automatisch weitermachen
onMounted(() => {
  autoSync()
  starteAutomatik()
})
</script>

<template>
  <header class="topbar">
    <router-link to="/" class="brand">🏰 Burgen</router-link>
    <nav class="mainnav">
      <router-link to="/"><span class="ico">📋</span><span>Liste</span></router-link>
      <router-link to="/karte"><span class="ico">🗺️</span><span>Karte</span></router-link>
      <router-link to="/feld" class="nav-feld"><span class="ico">📍</span><span>Feld</span></router-link>
      <router-link to="/kataloge"><span class="ico">🗂️</span><span>Kataloge</span></router-link>
      <router-link to="/daten" class="nav-daten">
        <span class="ico">{{ syncState.laeuft ? '🔄' : '💾' }}</span><span>Daten</span>
        <span v-if="syncState.offen && !syncState.laeuft" class="nav-badge" :title="`${syncState.offen} Änderung(en) / Bild(er) noch nicht in Google Drive`">{{ syncState.offen }}</span>
      </router-link>
    </nav>
  </header>
  <SyncLeiste />
  <main>
    <router-view />
  </main>
  <transition name="fade">
    <div v-if="toastText" class="toast">{{ toastText }}</div>
  </transition>
</template>
