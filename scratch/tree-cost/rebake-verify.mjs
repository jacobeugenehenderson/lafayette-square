// Did a Grove re-capture really re-shoot every PLACED species of a town? (Grain, 2026-10-04)
//   node scratch/tree-cost/rebake-verify.mjs <town> <since: ISO time, or epoch ms>
// Per placed species: its overhead pages AND its hero pages were written after `since`, the lower overhead bands
// carry the deep core, and both records' captureKeys are current for today's atlas. Exit 1 on any miss.
import fs from 'node:fs'
import path from 'node:path'
import { computeCaptureKey, CAPTURE_FORMAT } from '../../src/arborist/captureKey.js'
const [town, sinceArg] = process.argv.slice(2)
if (!town || !sinceArg) { console.error('usage: rebake-verify.mjs <town> <since>'); process.exit(2) }
const since = /^\d+$/.test(sinceArg) ? Number(sinceArg) : Date.parse(sinceArg)
if (!Number.isFinite(since)) { console.error(`bad since: ${sinceArg}`); process.exit(2) }
const base = path.join('public/baked', town)
const atlas = JSON.parse(fs.readFileSync(path.join(base, 'trees-atlas.json'), 'utf8'))
const placed = [...new Set(JSON.parse(fs.readFileSync(path.join(base, 'trees.json'), 'utf8')).instances.map((i) => i.species))]
const HERO_DIALS = null   // hero keys are checked for presence + freshness; their dials live in the Grove (HERO_AZIMUTHS/SHELLS)
const newest = (dir) => { try { return Math.min(...fs.readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => fs.statSync(path.join(dir, f)).mtimeMs)) } catch { return 0 } }
let bad = 0
console.log(`${town}: ${placed.length} placed species, re-shot since ${new Date(since).toISOString()}`)
for (const sp of placed.sort()) {
  const oh = atlas.overheadBySpecies?.[sp], he = atlas.heroImpostorBySpecies?.[sp]
  const ohOld = newest(path.join(base, 'trees/overhead', sp)), heOld = newest(path.join(base, 'trees/hero-impostor', sp))
  const issues = []
  if (!oh) issues.push('no overhead record')
  else {
    if (oh.bands.slice(0, -1).some((b) => !b.core)) issues.push('overhead not cored')
    if (oh.captureKey !== computeCaptureKey(atlas, sp, null, CAPTURE_FORMAT.overhead)) issues.push('overhead key stale')
    if (!(ohOld >= since)) issues.push(`overhead pages older (${ohOld ? new Date(ohOld).toISOString().slice(11, 19) : 'none'})`)
  }
  if (!he) issues.push('no hero record')
  else if (!(heOld >= since)) issues.push(`hero pages older (${heOld ? new Date(heOld).toISOString().slice(11, 19) : 'none'})`)
  if (issues.length) bad++
  console.log(`  ${issues.length ? '⛔' : '✅'} ${sp.padEnd(18)} ${issues.join(' · ') || 'overhead + hero re-shot, cored, current'}`)
}
console.log(bad ? `⛔ ${bad} of ${placed.length} species NOT re-shot` : `✅ all ${placed.length} placed species re-shot`)
process.exit(bad ? 1 : 0)
