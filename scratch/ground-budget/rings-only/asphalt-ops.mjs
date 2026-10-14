// asphalt-ops.mjs — the asphalt step of the paint stack, timed in isolation on Brace's dump (Boz's ruling 2026-10-14):
// mine (the mat:asphalt paths) and acc (the union of the layers above it), clipper integer units, as the flatten held them.
// Times, each op REPEATS times on fresh Clipper objects: the flatten's difference (subject EvenOdd − clip NonZero) into a
// PolyTree with StrictlySimple ON (the bake's) and OFF, the same into flat Paths, and the union (acc ∪ mine, NonZero).
// Prints the dump's structure (paths, vertices, outer/hole by orientation, the largest path) and each output's size.
// Reads only. node asphalt-ops.mjs <dump-asphalt.json> [repeats=3]
import { readFileSync } from 'fs'
import { createRequire } from 'module'
const require = createRequire('/Users/jacobhenderson/Desktop/lafayette-square.nosync/package.json')
const C = require('clipper-lib')
const [file, rep = '3'] = process.argv.slice(2), REPEATS = +rep
const d = JSON.parse(readFileSync(file, 'utf8'))
const P = (a) => a.map(q => q.map(([X, Y]) => ({ X, Y })))
const mine = P(d.mine), acc = P(d.acc)
const shape = (name, ps) => { const v = ps.map(q => q.length), outer = ps.filter(q => C.Clipper.Orientation(q)).length
  console.log(`[dump] ${name}: ${ps.length} paths · ${v.reduce((a, b) => a + b, 0)} verts · ${outer} CCW / ${ps.length - outer} CW · largest ${Math.max(0, ...v)} verts`) }
console.log(`[dump] ${d.key} · clipScale ${d.clipScale}`); shape('mine', mine); shape('acc', acc)
const time = (label, f) => { const ms = []; let r
  for (let i = 0; i < REPEATS; i++) { const t = performance.now(); r = f(); ms.push(performance.now() - t) }
  ms.sort((a, b) => a - b); console.log(`[op] ${label.padEnd(44)} median ${(ms[ms.length >> 1] / 1000).toFixed(2)} s · min ${(ms[0] / 1000).toFixed(2)} · ${r}`) }
const countTree = (t) => { let o = 0, h = 0, v = 0; const walk = (n, hole) => { for (const c of n.Childs()) { hole ? h++ : o++; v += c.m_polygon.length; walk(c, !hole) } }; walk(t, false); return `${o} outers · ${h} holes · ${v} verts` }
for (const ss of [true, false]) {
  time(`difference → PolyTree · StrictlySimple ${ss ? 'ON ' : 'OFF'}`, () => { const c = new C.Clipper(); c.StrictlySimple = ss
    c.AddPaths(mine, C.PolyType.ptSubject, true); c.AddPaths(acc, C.PolyType.ptClip, true); const t = new C.PolyTree()
    if (!c.Execute(C.ClipType.ctDifference, t, C.PolyFillType.pftEvenOdd, C.PolyFillType.pftNonZero)) return 'REFUSED'; return countTree(t) })
  time(`difference → Paths    · StrictlySimple ${ss ? 'ON ' : 'OFF'}`, () => { const c = new C.Clipper(); c.StrictlySimple = ss
    c.AddPaths(mine, C.PolyType.ptSubject, true); c.AddPaths(acc, C.PolyType.ptClip, true); const o = new C.Paths()
    if (!c.Execute(C.ClipType.ctDifference, o, C.PolyFillType.pftEvenOdd, C.PolyFillType.pftNonZero)) return 'REFUSED'; return `${o.length} paths · ${o.reduce((n, q) => n + q.length, 0)} verts` })
}
time('union acc ∪ mine → Paths (the bake\'s)', () => { const u = new C.Clipper(); u.AddPaths(acc, C.PolyType.ptSubject, true); u.AddPaths(mine, C.PolyType.ptClip, true)
  const o = new C.Paths(); if (!u.Execute(C.ClipType.ctUnion, o, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero)) return 'REFUSED'; return `${o.length} paths · ${o.reduce((n, q) => n + q.length, 0)} verts` })
