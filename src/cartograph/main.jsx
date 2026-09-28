// ⛔ FIRST: places the boot town before any app module is evaluated (placeBootTown.js).
import '../placeBootTown.js'
import React from 'react'
import ReactDOM from 'react-dom/client'
import '../index.css'
import './cartograph.css'
import CartographApp from './CartographApp.jsx'

ReactDOM.createRoot(document.getElementById('cartograph-root')).render(
  <React.StrictMode>
    <CartographApp />
  </React.StrictMode>,
)
