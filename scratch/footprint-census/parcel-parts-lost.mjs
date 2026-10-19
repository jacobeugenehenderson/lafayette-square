import { readFileSync } from 'node:fs'
import clipperLib from 'clipper-lib'
import { readSources } from '/Users/jacobhenderson/Desktop/lafayette-square.nosync/cartograph/sources.js'
import { clipParcelsToRoundedBlocks } from '/Users/jacobhenderson/Desktop/lafayette-square.nosync/cartograph/derive.js'
import { parcelParts } from '/Users/jacobhenderson/Desktop/lafayette-square.nosync/cartograph/parcelParts.js'
const { Clipper, Paths, PolyType, ClipType, PolyFillType } = clipperLib, SCALE = 100, D = '/Users/jacobhenderson/Desktop/lafayette-square.nosync/cartograph/data/provincetown/'
const toC = (r) => r.map(p => ({ X: Math.round((p.x ?? p[0]) * SCALE), Y: Math.round((p.z ?? p[1]) * SCALE) }))
const area = (P) => Math.abs(P.reduce((a, p) => a + Clipper.Area(p), 0)) / (SCALE * SCALE)
const meet = (a, b) => { const c = new Clipper(); c.AddPaths(a, PolyType.ptSubject, true); c.AddPaths(b, PolyType.ptClip, true); const o = new Paths(); c.Execute(ClipType.ctIntersection, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero); return o }
const L = JSON.parse(readFileSync(D + 'clean/map.json', 'utf8')), layers = L.layers || L, B = layers.block.map(e => toC(e.ring))
const parcels = readSources('provincetown').parcels.flatMap(w => Object.values(JSON.parse(readFileSync(D + 'raw/' + w.file, 'utf8')).parcels || {}))
for (const p of parcels) { const parts = parcelParts(p.rings); if (parts.length < 2) continue
  const E = clipParcelsToRoundedBlocks([p], B, () => null).map(e => toC(e.ring))
  parts.forEach(({ outer }, k) => { const inB = meet([toC(outer)], B); if (!(area(inB) > 0) || area(meet(inB, E)) > 0) return
    const blocks = B.map((b, i) => [i, area(meet([toC(outer)], [b]))]).filter(([, a]) => a > 0)
    const vm = outer.reduce((s, q) => [s[0] + q[0] / outer.length, s[1] + q[1] / outer.length], [0, 0])
    const tp = Clipper.PointInPolygon({ X: Math.round(vm[0] * SCALE), Y: Math.round(vm[1] * SCALE) }, toC(outer))
    console.log(JSON.stringify({ handle: p.handle, address: p.address, parts: parts.length, part: k + 1, partArea: area([toC(outer)]).toFixed(1), inBlocks: area(inB).toFixed(2), blocks: blocks.map(([i, a]) => `${i}:${a.toFixed(2)}`), vertexMean: vm.map(v => v.toFixed(2)), vertexMeanInPart: tp, centroid: p.centroid, emitted: E.length })) }) }
