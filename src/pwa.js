// PWA-Helfer: Service Worker registrieren und den Installieren-Hinweis steuern.
//
// Schnittstelle für die Oberfläche (Einbindung des Installieren-Balkens erfolgt in der Shell):
//
//   import { useInstallPrompt } from './pwa'
//   const { canInstall, install, isIOS, dismissed, dismiss } = useInstallPrompt()
//
//   canInstall  boolean   true, sobald der Browser „beforeinstallprompt“ geliefert hat (Android/Chrome/Edge)
//   install()   Promise   öffnet den Installationsdialog des Browsers; löst mit true auf, wenn angenommen,
//                         sonst false. Danach ist canInstall wieder false.
//   isIOS       boolean   iPhone/iPad im Safari, noch nicht als App gestartet. Hier gibt es keinen Dialog,
//                         die Oberfläche zeigt die Anleitung „Teilen → Zum Home-Bildschirm“.
//   dismissed   boolean   true, wenn der Nutzer den Hinweis weggeklickt hat (localStorage
//                         „wochenplan_install_dismissed“); dann den Balken nicht mehr zeigen.
//   dismiss()   void      merkt das Wegklicken und setzt dismissed auf true.
//
// Balken anzeigen, wenn: !dismissed && (canInstall || isIOS). Läuft die App bereits im Standalone-Modus,
// sind canInstall und isIOS beide false.
import { useCallback, useEffect, useState } from 'react'

const DISMISS_KEY = 'wochenplan_install_dismissed'

export function registerSW() {
  try {
    if (!import.meta.env.PROD) return
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    })
  } catch {
    // Registrierung ist optional, Fehler werden bewusst geschluckt
  }
}

function readDismissed() {
  try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
}

function detectIOS() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const iDevice = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
  const standalone = window.navigator.standalone === true
    || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
  return iDevice && !standalone
}

export function useInstallPrompt() {
  const [evt, setEvt] = useState(null)
  const [dismissed, setDismissed] = useState(readDismissed)
  const [isIOS] = useState(detectIOS)

  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setEvt(e) }
    const onInstalled = () => setEvt(null)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = useCallback(async () => {
    if (!evt) return false
    try {
      evt.prompt()
      const choice = await evt.userChoice
      setEvt(null)
      return !!choice && choice.outcome === 'accepted'
    } catch {
      setEvt(null)
      return false
    }
  }, [evt])

  const dismiss = useCallback(() => {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* Speicher nicht verfügbar */ }
    setDismissed(true)
  }, [])

  return { canInstall: !!evt, install, isIOS, dismissed, dismiss }
}
