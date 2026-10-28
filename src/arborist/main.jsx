// ⛔ FIRST: places the boot town before any app module is evaluated (placeBootTown.js) — imported in that order inside the
// boot, so a page that names no town says so ON SCREEN, with a town to open (bootOrRefuse.js), not a black canvas.
import { bootOrRefuse } from '../bootOrRefuse.js'

const root = document.getElementById('arborist-root')
bootOrRefuse(root, 'The Arborist', async () => {
  await import('../placeBootTown.js')
  const [{ createRoot }, { default: ArboristApp }] = await Promise.all([import('react-dom/client'), import('./ArboristApp.jsx')])
  createRoot(root).render(<ArboristApp />)
})
