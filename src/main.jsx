import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { initLoadAudit } from './lib/loadAudit.js'

if (import.meta.env.DEV) console.log('[LSQ] build', __BUILD_HASH__)

// Startup asset-load profiler — inert unless ?loadAudit is in the URL.
initLoadAudit()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
