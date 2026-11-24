import { createRouter, createWebHashHistory } from 'vue-router'
import ListeView from './views/ListeView.vue'
import { kompakt, istHandy } from './kompakt.js'

export const router = createRouter({
  // Hash-Routing: funktioniert ohne Server-Konfiguration (z. B. GitHub Pages)
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: ListeView },
    { path: '/karte', component: () => import('./views/KarteView.vue') },
    { path: '/feld', component: () => import('./views/FeldView.vue') },
    { path: '/feld/einstellungen', component: () => import('./views/KompaktEinstellungen.vue') },
    { path: '/burg/:id', component: () => import('./views/BurgEdit.vue') },
    { path: '/kataloge', component: () => import('./views/KatalogView.vue') },
    { path: '/pflege', component: () => import('./views/PflegeView.vue') },
    { path: '/daten', component: () => import('./views/DatenView.vue') },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

// Auf dem Handy direkt im Kompaktmodus starten (nur beim Öffnen der App auf der Startseite)
let ersterAufruf = true
router.beforeEach((to) => {
  const erster = ersterAufruf
  ersterAufruf = false
  if (erster && to.path === '/' && kompakt.startAufHandy && istHandy()) return '/feld'
})
