// ⛔ FIRST: places the boot town before any app module is evaluated (placeBootTown.js) — imported in that order inside the
// boot, so a page that names no town says so ON SCREEN, with a town to open (bootOrRefuse.js), not a black canvas.
import { bootOrRefuse } from '../bootOrRefuse.js'
import '../index.css'

const root = document.getElementById('meteorologist-root')
bootOrRefuse(root, 'The Meteorologist', async () => {
  await import('../placeBootTown.js')
  const [{ createRoot }, { default: MeteorologistApp }] = await Promise.all([import('react-dom/client'), import('./MeteorologistApp.jsx')])
  createRoot(root).render(<MeteorologistApp />)
})
