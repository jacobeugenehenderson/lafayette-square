// ⛔ FIRST: places the boot town before any app module is evaluated (placeBootTown.js).
import '../placeBootTown.js'
import React from 'react'
import ReactDOM from 'react-dom/client'
import PreviewApp from './PreviewApp.jsx'
import '../index.css'

ReactDOM.createRoot(document.getElementById('preview-root')).render(
  <React.StrictMode>
    <PreviewApp />
  </React.StrictMode>,
)
