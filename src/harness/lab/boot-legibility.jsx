// ⛔ FIRST: places the boot town before any other module is evaluated (placeBootTown.js) — imported in that order inside the
// boot, so a page that names no town says so ON SCREEN, with a town to open (bootOrRefuse.js), not a black canvas.
// ./legibility.jsx renders itself when it is evaluated.
import { bootOrRefuse } from '../../bootOrRefuse.js'

bootOrRefuse(document.getElementById('root'), 'The Legibility Lab', async () => {
  await import('../../placeBootTown.js')
  await import('./legibility.jsx')
})
