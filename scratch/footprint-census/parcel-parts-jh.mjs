// parcel-parts-jh.mjs — which multipart part does the in-memory HEAD clip lose that the emitted clean/map.json `parcel`
// layer does not, on one town (default jacksonheights)? Per part lost at HEAD: the emitted entries over it, their area there,
// whether each equals a ring the in-memory HEAD emits, how many emitted rings do, and the layer sizes. Read-only.
//   node --max-old-space-size=800 scratch/footprint-census/parcel-parts-jh.mjs [town]
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import clipperLib from 'clipper-lib'
import { readSources } from '../../cartograph/sources.js'
import { parcelParts } from '../../cartograph/parcelParts.js'
const ROOT = new URL('../../', import.meta.url).pathname, town = process.argv[2] || 'jacksonheights'
const { Clipper, Paths, IntPoint, PolyType, ClipType, PolyFillType } = clipperLib
const SRC = execSync('git show HEAD~1:cartograph/derive.js', { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }), SCALE = Number(SRC.match(/^const SCALE = (\d+)$/m)[1])
const body = SRC.match(/function clipParcelsToRoundedBlocks\(parcels, roundedBlocks, classify\) \{[\s\S]*?\n\}\n/)[0]
const toClipper = (x, z) => new IntPoint(Math.round(x * SCALE), Math.round(z * SCALE)), pathFromClipper = (p) => p.map(q => ({ x: q.X / SCALE, z: q.Y / SCALE }))
const oldClip = new Function('Clipper', 'Paths', 'IntPoint', 'PolyType', 'ClipType', 'PolyFillType', 'toClipper', 'pathFromClipper', 'SCALE', `${body}; return clipParcelsToRoundedBlocks`)(Clipper, Paths, IntPoint, PolyType, ClipType, PolyFillType, toClipper, pathFromClipper, SCALE)
const toC = (r) => r.map(p => ({ X: Math.round((p.x ?? p[0]) * SCALE), Y: Math.round((p.z ?? p[1]) * SCALE) }))
const area = (P) => Math.abs(P.reduce((a, p) => a + Clipper.Area(p), 0)) / (SCALE * SCALE)
const meet = (a, b) => { const c = new Clipper(); c.AddPaths(a, PolyType.ptSubject, true); c.AddPaths(b, PolyType.ptClip, true); const o = new Paths(); c.Execute(ClipType.ctIntersection, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero); return o }
const mp = join(ROOT, 'cartograph/data', town, 'clean/map.json'), L = JSON.parse(readFileSync(mp, 'utf8')), layers = L.layers || L, B = layers.block.map(e => toC(e.ring))
const wells = readSources(town).parcels, parcels = wells.flatMap(w => Object.entries(JSON.parse(readFileSync(join(ROOT, 'cartograph/data', town, 'raw', w.file), 'utf8')).parcels || {}).map(([k, p]) => ({ k, ...p })))
console.log(`${town}: map.json ${statSync(mp).mtime.toISOString()} · raw wells ${wells.map(w => `${w.file} ${statSync(join(ROOT, 'cartograph/data', town, 'raw', w.file)).mtime.toISOString()}`).join(', ')}`)
const was = parcels.map(p => oldClip([p], B, () => null)), emitted = layers.parcel
console.log(`raw parcels ${parcels.length} · in-memory HEAD rings ${was.flat().length} · emitted rings ${emitted.length}`)
const key = (r) => JSON.stringify(r.map(q => [Math.round(q.x * SCALE), Math.round(q.z * SCALE)])), memKeys = new Map(); was.forEach((rs, i) => rs.forEach(e => memKeys.set(key(e.ring), parcels[i].k)))
const EM = emitted.map(e => toC(e.ring)), MEM = was.flat().map(e => toC(e.ring))
console.log(`emitted rings identical to an in-memory HEAD ring: ${emitted.filter(e => memKeys.has(key(e.ring))).length} of ${emitted.length}`)
for (const p of parcels) { const parts = parcelParts(p.rings); if (parts.length < 2) continue
  parts.forEach(({ outer }, k) => { const inB = meet([toC(outer)], B); if (!(area(inB) > 0)) return
    const lostMem = !(area(meet(inB, MEM)) > 0), lostEm = !(area(meet(inB, EM)) > 0); if (!lostMem && !lostEm) return
    const over = lostMem && !lostEm ? EM.map((e, i) => [i, area(meet(inB, [e]))]).filter(([, a]) => a > 0).map(([i, a]) => ({ i, m2: +a.toFixed(2), use: emitted[i].use, fromMemoryParcel: memKeys.get(key(emitted[i].ring)) ?? null })) : null
    console.log(JSON.stringify({ parcel: p.k, handle: p.handle, address: p.address, part: `${k + 1} of ${parts.length}`, blockM2: +area(inB).toFixed(2), lostInMemoryHEAD: lostMem, lostInEmitted: lostEm, emittedOver: over })) }) }
