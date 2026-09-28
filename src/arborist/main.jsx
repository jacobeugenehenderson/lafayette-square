// ⛔ FIRST: places the boot town before any app module is evaluated (placeBootTown.js).
import '../placeBootTown.js'
import { createRoot } from 'react-dom/client'
import ArboristApp from './ArboristApp.jsx'

createRoot(document.getElementById('arborist-root')).render(<ArboristApp />)
