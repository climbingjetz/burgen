import { ref, onBeforeUnmount } from 'vue'

// Beobachtet die GPS-Position und merkt sich die genaueste Messung.
export function useGps() {
  const aktiv = ref(false)
  const pos = ref(null)
  const fehler = ref('')
  let watchId = null

  function start() {
    fehler.value = ''
    pos.value = null
    if (!('geolocation' in navigator)) {
      fehler.value = 'Dieser Browser unterstützt keine Standortbestimmung.'
      return
    }
    if (!window.isSecureContext) {
      fehler.value = 'GPS funktioniert nur über https:// oder localhost.'
      return
    }
    aktiv.value = true
    watchId = navigator.geolocation.watchPosition(
      (p) => {
        const c = p.coords
        const neu = {
          lat: +c.latitude.toFixed(6),
          lon: +c.longitude.toFixed(6),
          hoehe: c.altitude != null ? Math.round(c.altitude) : null,
          genauigkeit: Math.round(c.accuracy),
          zeit: new Date(p.timestamp).toISOString(),
        }
        if (!pos.value || neu.genauigkeit <= pos.value.genauigkeit) pos.value = neu
      },
      (e) => {
        if (e.code === 3) return // Zeitüberschreitung: weiter warten
        fehler.value =
          e.code === 1
            ? 'Zugriff auf den Standort verweigert. Bitte in den Browser-Einstellungen erlauben.'
            : 'Position nicht verfügbar. Unter freiem Himmel erneut versuchen.'
        stop()
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
    )
  }

  function stop() {
    if (watchId != null) navigator.geolocation.clearWatch(watchId)
    watchId = null
    aktiv.value = false
  }

  onBeforeUnmount(stop)
  return { aktiv, pos, fehler, start, stop }
}
