// heightAt and its owner along a segment at a fine step (Brace, 2026-10-13).  ramp-probe.mjs <dump> x0 z0 x1 z1 stepM
import { readFileSync } from 'fs'
const R = new URL('../../', import.meta.url).pathname
const [dir, ...n] = process.argv.slice(2), [x0, z0, x1, z1, st] = n.map(Number)
const { loadSceneTerrain } = await import(R + 'cartograph/terrainLoad.js')
const { buildDeformer } = await import(R + 'cartograph/groundDeformer.mjs')
const meta = JSON.parse(readFileSync(dir + '/meta.json', 'utf8')), T = loadSceneTerrain(meta.scene)
const D = buildDeformer({ ...JSON.parse(readFileSync(dir + '/deform.json', 'utf8')), raw: T.getElevationRaw })
const len = Math.hypot(x1 - x0, z1 - z0); let prev = null, maxG = 0, maxAt = null
for (let s = 0; s <= len + 1e-9; s += st) { const x = x0 + (x1 - x0) * s / len, z = z0 + (z1 - z0) * s / len, h = D.heightAt(x, z), ex = D.explain(x, z)
  if (prev) { const g = Math.abs(h - prev.h) / st; if (g > maxG) { maxG = g; maxAt = [x, z] } }
  if (!prev || ex.station?.join() !== prev.st || Math.round(s / st) % 10 === 0) console.log(`  s ${s.toFixed(2)} h ${h.toFixed(3)} owner ${D.ownerAt(x, z)} station (${ex.station?.map(v => v.toFixed(2))}) H ${ex.H?.toFixed(3)} d ${ex.d?.toFixed(2)}`)
  prev = { h, st: ex.station?.join() } }
console.log(`max |dh/ds| ${maxG.toFixed(2)} (${(100 * maxG).toFixed(0)}%) at (${maxAt.map(v => v.toFixed(2))})`)
