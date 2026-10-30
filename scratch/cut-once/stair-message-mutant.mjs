// THE STAIRCASE REFUSAL NAMES ITS CAUSE (Zob's ruling (B), 2026-10-29): PTown's MacMillan crop (checks/fixtures/ptown-macmillan-sliver-
// 2026-10-27.json) through the take-out with cand3.mjs as its open/close, live and under setStairNamesSkipped (the message names the cut's
// skipped edges, as before): live names the jog, (211.139, 71.050) with 1.0 / 2.8 mm, the known refusal's identity; the mutant names an
// edge 4.8 m away, so the identity no longer matches, RED. node scratch/cut-once/stair-message-mutant.mjs
import fs from 'fs'
import { pathToFileURL, fileURLToPath } from 'url'
import { join, dirname } from 'path'
const here = dirname(fileURLToPath(import.meta.url)), C = join(here, '../../cartograph'), tmp = join(here, '.structures-c3.tmp.mjs')
fs.writeFileSync(tmp, fs.readFileSync(join(C, 'structures.mjs'), 'utf8').replace('import { openCloseCutOnce,', 'import { openCloseProvenance as openCloseCutOnce,')
  .replace("from './openClose.mjs'", `from "${pathToFileURL(join(here, 'cand3.mjs')).href}"`).replace(/from '(\.{1,2}\/[^']+)'/g, (_, r) => `from "${pathToFileURL(join(C, r)).href}"`))
try {
  const S = await import(pathToFileURL(tmp).href), C3 = await import('./cand3.mjs'), mx = JSON.parse(fs.readFileSync(join(here, '../../checks/fixtures/ptown-macmillan-sliver-2026-10-27.json'), 'utf8'))
  const signed = (r) => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0)
  const why = () => { try { S.waterWithoutDecks(mx.water.map(r => signed(r) > 0 ? r : [...r].reverse()), [], [mx.deck], mx.stepM); return null } catch (e) { return String(e.message) } }
  const idOf = (m) => { const at = /edge\(s\) \d+ \((-?\d+\.\d+), (-?\d+\.\d+)\)/.exec(m || ''); return { site: at ? `${at[1]}, ${at[2]}` : null, lengths: [...(m || '').matchAll(/, (\d+\.\d) mm/g)].map(x => x[1]).join(' / ') } }
  const KNOWN = { site: '211.139, 71.050', lengths: '1.0 / 2.8' }, same = (id) => id.site === KNOWN.site && id.lengths === KNOWN.lengths
  const live = idOf(why()); C3.setStairNamesSkipped(true); const mut = idOf(why()); C3.setStairNamesSkipped(false)
  console.log(`LIVE: ${JSON.stringify(live)} ${same(live) ? 'matches the known refusal' : 'DOES NOT match'} · MUTANT (skipped edges named): ${JSON.stringify(mut)} ${same(mut) ? 'MATCHES (blind)' : 'no longer matches, RED as it must be'}`)
} finally { fs.rmSync(tmp, { force: true }) }
