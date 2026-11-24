<script setup>
import { onMounted } from 'vue'
import { toastText } from './composables/toast.js'
import { syncState, autoSync, starteAutomatik } from './sync.js'
import SyncLeiste from './components/SyncLeiste.vue'
import { sicherungState, starteSicherungsplan } from './sicherung.js'

// Beim Start: offene Änderungen zählen, – falls noch angemeldet – abgleichen
// und bei besserem Netz / Rückkehr in die App automatisch weitermachen
onMounted(() => {
  autoSync()
  starteAutomatik()
  starteSicherungsplan() // lokale Sicherung: Datenbank 2×, Bilder 1× täglich
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
      <router-link to="/pflege" class="nav-daten">
        <span class="ico">{{ sicherungState.laeuft ? '⏳' : '🧰' }}</span><span>Pflege</span>
        <span v-if="sicherungState.brauchtFreigabe || sicherungState.fehler" class="nav-badge" title="Sicherung braucht Aufmerksamkeit">!</span>
      </router-link>
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
