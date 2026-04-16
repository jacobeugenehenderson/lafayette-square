import React from 'react'
import ReactDOM from 'react-dom/client'
import StageApp from './StageApp.jsx'
import '../index.css'

ReactDOM.createRoot(document.getElementById('stage-root')).render(
  <React.StrictMode>
    <StageApp />
  </React.StrictMode>,
)
