// ⛔ FIRST: places the boot town before any app module is evaluated (placeBootTown.js).
import '../placeBootTown.js'
import { createRoot } from 'react-dom/client'
import '../index.css'
import MeteorologistApp from './MeteorologistApp.jsx'

createRoot(document.getElementById('meteorologist-root')).render(<MeteorologistApp />)
