// footprint-well.mjs — WHERE a town's footprint geometry comes from: the ONE answer every reader asks
// (pipeline's union, derive's JR classify, Extent's footprint layer and fetch count, reproject-raw, the pour's
// data reads). BRIEF-nyc-adapter §3.2a, step 3.
//   undeclared → Microsoft's ML footprints, raw/msbf.json — the kit's generic global well, and SAID (`label`)
//   declared   → the town's state well (cartograph/sources.js#readBuildingSources), raw/<well.file>
// ⛔ No fallback between them: a declared well whose file is absent is absent — the reader decides what that means,
// and none of them reaches for msbf.json instead.
import { join } from 'path'
import { mapDir } from './config.js'
import { readBuildingSources } from './sources.js'

export function footprintWell(scene) {
  const d = readBuildingSources(scene)
  const raw = join(mapDir(scene), 'raw')
  if (d.state === 'declared') {
    return { path: join(raw, d.well.file), file: d.well.file, wellId: d.well.id, declared: true, well: d.well,
             label: `${d.well.id} (declared${d.well.fromState ? `, ${d.well.fromState}` : ''})` }
  }
  return { path: join(raw, 'msbf.json'), file: 'msbf.json', wellId: 'msbf', declared: false, well: null,
           label: 'MSBF (no building well declared)' }
}
