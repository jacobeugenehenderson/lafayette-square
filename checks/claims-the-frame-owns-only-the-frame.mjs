#!/usr/bin/env node
// CLAIM — ON ①'S BLOCK RINGS, THE FRAME (`__boundary__`) OWNS ONLY EDGES THAT LIE ON THE FRAME. The frame is the bb rectangle
// the land is cut from (`mintProtopolygon`'s difference D), so every edge it owns lies on one of the bb's four lines. An edge
// it owns anywhere else is a STREET edge stamped as rim: no measure, so no curb, and the operator's width never reaches it.
// ⭐ FOUND 2026-10-25 (Splice; Zob read it in source): D walks its clip rings (the ink) backward, so a surviving ink vertex's
// own label named the edge ARRIVING at it, while the frame and minted vertices named the edge LEAVING; the mint's
// un-rotated face reversal fixed the first and shifted the second, so the first street edge after every frame run was
// stamped `__boundary__` (LS 91, HPDM 178, JH 179 edges; JH rikers-island-bridge's merged frontage was one). Invisible
// wherever the disc sits inside the bb; a town whose disc reaches its bb loses that curb.
// ASSERTS, per town, file only: every block-ring edge (outer + holes) labelled `__boundary__` has both ends on one bb line,
// within the lattice's rounding bound (√2/2 of a grid step, src/lib/lattice.js). The bb lines are read off the rings
// themselves: the frame bounds every block, so a frame edge lies at the rings' extreme coordinate on its axis.
//
//   node checks/claims-the-frame-owns-only-the-frame.mjs [scene…] [--ribbons=path] [--mutants]
//
// ⭐ MUTANT (--mutants): a fixture block whose frame-labelled edge leaves the frame goes RED; one on the frame stays GREEN.
import { readFileSync, existsSync } from 'node:fs'
import { ribbonsPathOf } from '../cartograph/scene.js'
import { scenes } from './_scenes.mjs'
import { LATTICE_M } from '../src/lib/lattice.js'

const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const named = process.argv.slice(2).filter(a => !a.startsWith('--'))
const ON = Math.SQRT1_2 * LATTICE_M

/** Frame-labelled edges that do not lie on the frame: { frame, off: [{ at, to, L, before, after }] }. */
function judge(P) {
  const O = P.owners
  const rings = [...P.blocks.map((r, k) => [r, P.blockLabels[k]]), ...(P.blockHoles || []).flatMap((hs, k) => (hs || []).map((h, j) => [h, P.blockHoleLabels?.[k]?.[j]]))]
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (const [r] of rings) for (const p of r) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]) }
  const line = (a, b) => [[0, x0], [0, x1], [1, z0], [1, z1]].some(([ax, v]) => Math.abs(a[ax] - v) <= ON && Math.abs(b[ax] - v) <= ON)
  let frame = 0; const off = []
  for (const [r, L] of rings) {
    if (!L) throw new Error('a block ring carries no labels — NOT CHECKED')
    for (let i = 0; i < r.length; i++) {
      if (O[L[i]]?.skelId !== '__boundary__') continue
      frame++
      const a = r[i], b = r[(i + 1) % r.length]
      if (line(a, b)) continue
      off.push({ at: a, to: b, L: Math.hypot(b[0] - a[0], b[1] - a[1]), before: O[L[(i - 1 + r.length) % r.length]]?.skelId, after: O[L[(i + 1) % r.length]]?.skelId })
    }
  }
  return { frame, off }
}

let red = 0
const list = arg('ribbons') ? named : scenes('cartograph/data/<scene>/clean/ribbons.json', { has: (s) => existsSync(ribbonsPathOf(s)), label: 'ribbons.json' })
for (const scene of list) {
  const path = arg('ribbons') || ribbonsPathOf(scene)
  const P = JSON.parse(readFileSync(path, 'utf8')).protopolygon
  if (!P) { console.log(`⛔ ${scene}: NOT CHECKED — ${path} carries no protopolygon`); red++; continue }
  const { frame, off } = judge(P)
  if (off.length) red++
  console.log(`${off.length ? '⛔' : '✅'} ${scene}: ${frame} frame-labelled edge(s) · ${off.length} NOT on the frame`
    + (off.length ? `\n     first: ${off.slice(0, 3).map(x => `(${x.at.map(v => v.toFixed(3)).join(', ')})→(${x.to.map(v => v.toFixed(3)).join(', ')}) ${x.L.toFixed(2)} m, after ${x.before} · before ${x.after}`).join(' · ')}` : ''))
}

if (process.argv.includes('--mutants')) {
  // the frame is [0,100]²; a block on its south edge (z = 0) between two streets
  const owners = [{ skelId: '__boundary__' }, { skelId: 'a', side: 'left' }, { skelId: 'b', side: 'right' }]
  const fx = (ring, labels) => judge({ owners, blocks: [ring, [[0, 0], [100, 0], [100, 100], [0, 100]]], blockLabels: [labels, [0, 0, 0, 0]] }).off.length
  const blk = [[10, 0], [40, 0], [40, 30], [10, 30]]
  const good = fx(blk, [0, 1, 1, 2])            // (10,0)→(40,0) frame · up a · across a · down b
  const bad = fx(blk, [0, 0, 1, 2])             // the edge leaving the frame run stamped frame
  const ok = good === 0 && bad === 1
  console.log(`   ${ok ? '✅' : '⛔'} mutant fixture · frame edge on the frame → ${good} off · street edge stamped frame → ${bad} off (must be 1, RED)`)
  if (!ok) red++
}

console.log(red ? '\n⛔ RED — ① stamps the frame on an edge that is not the frame (a street edge with no curb), or the fixture failed'
  : '\n✅ GREEN — the frame owns only edges on the frame')
process.exit(red ? 1 : 0)
