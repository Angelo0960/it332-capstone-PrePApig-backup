import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

window.__PREPAPIG_INSTALL_PROMPT__ = null
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  window.__PREPAPIG_INSTALL_PROMPT__ = event
  window.dispatchEvent(new Event('prepapig:install-prompt-available'))
})
window.addEventListener('appinstalled', () => {
  window.__PREPAPIG_INSTALL_PROMPT__ = null
  window.dispatchEvent(new Event('prepapig:appinstalled'))
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
      console.error('PWA service worker registration failed:', error)
    })
  })
}