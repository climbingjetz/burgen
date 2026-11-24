// Google-Anmeldung über Google Identity Services (nur im Browser, kein eigener Server).
// Berechtigung "drive.file": Die App sieht ausschließlich Dateien, die sie selbst angelegt hat.
const SCOPE = 'https://www.googleapis.com/auth/drive.file'

let token = null
let ablauf = 0

export const getClientId = () => localStorage.getItem('google.clientId') || import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
export const setClientId = (id) => localStorage.setItem('google.clientId', id.trim())
export const istVerbunden = () => localStorage.getItem('google.verbunden') === '1'

let gisPromise
export function ladeGoogle() {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  gisPromise ||= new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = res
    s.onerror = () => {
      gisPromise = null
      rej(new Error('Google-Anmeldung konnte nicht geladen werden – bist du online?'))
    }
    document.head.appendChild(s)
  })
  return gisPromise
}

function tokenAusSitzung() {
  if (token) return
  try {
    const t = JSON.parse(sessionStorage.getItem('google.token') || 'null')
    if (t) ({ token, ablauf } = { token: t.token, ablauf: t.ablauf })
  } catch {
    /* ignorieren */
  }
}

export function hatGueltigesToken() {
  tokenAusSitzung()
  return !!token && Date.now() < ablauf
}

// Muss beim ersten Mal aus einem Klick heraus aufgerufen werden (Popup)
export async function anmelden() {
  await ladeGoogle()
  const clientId = getClientId()
  if (!clientId) throw new Error('Es ist noch keine Google-Client-ID hinterlegt.')
  return new Promise((res, rej) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      login_hint: localStorage.getItem('google.email') || undefined,
      callback: (r) => {
        if (r.error) return rej(new Error(r.error_description || r.error))
        token = r.access_token
        ablauf = Date.now() + (Number(r.expires_in || 3600) - 120) * 1000
        sessionStorage.setItem('google.token', JSON.stringify({ token, ablauf }))
        localStorage.setItem('google.verbunden', '1')
        res(token)
      },
      error_callback: (e) =>
        rej(new Error(e?.type === 'popup_closed' ? 'Das Anmeldefenster wurde geschlossen.' :
          e?.type === 'popup_failed_to_open' ? 'Das Anmeldefenster wurde blockiert – bitte Popups für diese Seite erlauben.' :
          e?.message || 'Anmeldung fehlgeschlagen.')),
    })
    client.requestAccessToken({ prompt: istVerbunden() ? '' : 'consent' })
  })
}

export async function getToken() {
  return hatGueltigesToken() ? token : anmelden()
}

export function tokenVerwerfen() {
  token = null
  ablauf = 0
  sessionStorage.removeItem('google.token')
}

export function abmelden() {
  if (token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token, () => {})
  tokenVerwerfen()
  localStorage.removeItem('google.verbunden')
  localStorage.removeItem('google.email')
}
