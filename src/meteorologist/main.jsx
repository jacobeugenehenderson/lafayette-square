import { createRoot } from 'react-dom/client'
import '../tokens/design.css'
import MeteorologistApp from './MeteorologistApp.jsx'

createRoot(document.getElementById('meteorologist-root')).render(<MeteorologistApp />)
