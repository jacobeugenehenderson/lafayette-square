#!/usr/bin/env node
// CLAIM — A FACE PINCHED ALONG ITS OWN EDGE IS TWO FACES (Boz's ruling B, 2026-10-27). ①'s land difference runs with
// ioPreserveCollinear and without StrictlySimple, so where the water lies ALONG a frame edge for a stretch with a land pocket
// either side of it, Clipper hands back ONE outer ring: both pockets joined by a zero-width double-back along the frame, and
// absorbInk refuses it ("face 1 absorbs into 2 outer boundaries"; PTown's east edge, 2026-10-27). `tileGround.js#faceLobes`
// splits such a ring into its lobes, labels positional, before anything reads it; `tileGround.js#ringRetraces` then asserts
// that no block ring runs back over one of its own edges.
//   (1) PLANTED: PTown's two east-edge pockets (their coast vertices, translated to a 400 m bb), the water along the frame
//       between them: the mint gives TWO pocket faces of the pockets' own areas, each painting one outer.
//   (2) faceLobes on that ring's own shape: a ring whose frame edge is retraced the other way comes back as its two lobes, the
//       zero-area retraces dropped, every lobe's labels its own edges' (the frame edge __boundary__, the rest __water__).
//   (3) faceLobes on a ring neither pinched nor retraced returns null: the mint keeps it as the boolean returned it.
//   MUTANT (always run): the split removed → the plant REFUSES, by the assert's name (the retrace is caught at the mint, before
//   absorbInk), or the row proves nothing.
//   node checks/claims-a-pinched-face-is-two-faces.mjs
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { ROOT } from './_scenes.mjs'

let red = 0
const row = (ok, s) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${s}`) }
const sa = (r) => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0) / 2
const quiet = (f) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return f() } finally { console.log = l; console.warn = w } }
const st = (id, pts) => ({ skelId: id, name: id, points: pts, highway: 'residential', caps: { start: { degree: 1 }, end: { degree: 1 } } })

// PTown's east edge (protopolygon water ring 0, 2026-10-27), less (8631.394, 6650): the frame at x = 200
const X = 200, T = ([x, z]) => [+(x - 8631.394).toFixed(3), +(z - 6650).toFixed(3)]
const A = [[X, -60.534], ...[[8814.989, 6593.973], [8813.387, 6595.062], [8812.615, 6597.102], [8813.951, 6600.101], [8816.995, 6600.837], [8822.664, 6600.104]].map(T), [X, -52.671]]
const B = [[X, 38.295], ...[[8824.983, 6689.92], [8822.717, 6691.97], [8822.085, 6693.981], [8822.686, 6696.984], [8824.983, 6698.875]].map(T), [X, 48.182]]
const box = [[X, 150], [68.606, 150], [68.606, -150], [X, -150]]
let water = [...A, ...B, ...box]; if (sa(water) < 0) water.reverse()
const plant = (mod) => quiet(() => mod.mintProtopolygon({ streets: [st('w', [[-170, 0], [-70, 0]])], bb: { x0: -200, x1: 200, z0: -200, z1: 200 },
  boundary: Array.from({ length: 64 }, (_, i) => [280 * Math.cos(i / 32 * Math.PI), 280 * Math.sin(i / 32 * Math.PI)]), coast: [water], coastArcs: [A, B, box] }))
const pocketsOf = (MP) => MP.blocks.map((b, k) => ({ b, k })).filter(({ b }) => b.every(p => p[0] > 150 && p[1] > -70 && p[1] < 60))
const WANT = [138.459, 77.763]

const live = await import('../src/lib/tileGround.js')
{ let MP = null, why = ''; try { MP = plant(live) } catch (e) { why = String(e.message) }
  const P = MP ? pocketsOf(MP) : [], areas = P.map(({ b }) => +Math.abs(sa(b)).toFixed(3)).sort((p, q) => q - p)
  const painted = P.map(({ k }) => MP.paint?.[k]?.outer?.length >= 3)
  row(P.length === 2 && areas.every((a, i) => Math.abs(a - WANT[i]) < 1e-3) && painted.every(Boolean),
    `(1) PTown's east-edge pockets, the water along the frame between them: ${MP ? `${P.length} pocket face(s) [${areas.join(', ')} m²], each painting one outer: [${painted}]` : `REFUSED (${why.slice(0, 120)})`}`) }
// (2) the ring the boolean returns there: the frame edge down past both pockets, the lower pocket, the retrace up the frame, the upper
{ const ring = [[X, 48.177], [X, -60.529], ...A.slice(1, -1), [X, -52.676], [X, -52.671], [X, 38.29], [X, 38.3], ...B.slice(1, -1)]
  const labels = ring.map((_, i) => i === 0 ? '__boundary__' : '__water__')
  const L = live.faceLobes(ring, labels), lobes = L?.lobes || []
  const frameEdges = lobes.map(o => o.labels.filter((l, i) => { const p = o.ring[i], q = o.ring[(i + 1) % o.ring.length]; return p[0] === X && q[0] === X && l === '__boundary__' }).length)
  row(!!L && lobes.length === 2 && L.retraces === 3 && frameEdges.every(n => n === 1) && lobes.every(o => o.labels.filter(l => l === '__boundary__').length === 1) && lobes.every(o => !live.ringRetraces(o.ring).length) && live.ringRetraces(ring).length === 3,
    `(2) faceLobes on that ring (its frame edge retraced the other way over ${live.ringRetraces(ring).map(o => o.m.toFixed(3)).join(' + ')} m): ${L ? `${lobes.length} lobe(s) [${lobes.map(o => Math.abs(sa(o.ring)).toFixed(3)).join(', ')} m²], ${L.retraces} zero-area retrace(s) dropped, each lobe's one frame edge __boundary__ [${frameEdges}]` : 'NOT split'}`) }
// (3) a ring neither pinched nor retraced is not touched
{ const sq = [[0, 0], [10, 0], [10, 5], [10, 10], [0, 10]]
  row(live.faceLobes(sq, sq.map(() => 0)) === null && !live.ringRetraces(sq).length, `(3) a plain ring (a collinear vertex, no pinch): faceLobes ${live.faceLobes(sq, sq.map(() => 0)) === null ? 'returns null — kept as it was' : 'SPLIT IT'}`) }
// MUTANT: the split removed, in one modified tileGround.js in its own temp dir (imports pointed at the live src/lib)
{ const src = readFileSync(join(ROOT, 'src/lib/tileGround.js'), 'utf8'), ANCHOR = 'const L = (rg?.length >= 3 && lb) ? faceLobes(rg, lb) : null'
  if (src.split(ANCHOR).length !== 2) row(false, 'mutant: the split call is not in tileGround.js once — re-aim the anchor')
  else { const dir = mkdtempSync(join(tmpdir(), 'lobes-')), LIB = join(ROOT, 'src/lib')
    try { writeFileSync(join(dir, 'tileGround.js'), src.replace(ANCHOR, 'const L = null')
        .replace(/from \x27(\.{1,2}\/[^\x27]+)\x27/g, (_, r) => `from "${pathToFileURL(join(LIB, r)).href}"`).replace(/from \x27clipper-lib\x27/g, `from "${import.meta.resolve('clipper-lib')}"`))
      const M = await import(pathToFileURL(join(dir, 'tileGround.js')).href)
      let why = null; try { plant(M) } catch (e) { why = String(e.message) }
      const byAssert = !!why && /retrace their own edge/.test(why)
      row(byAssert, `mutant: the split removed → ${why ? (byAssert ? 'REFUSED by the assert (a block ring retraces its own edge), RED as it must be' : `refused, but not by the assert (${why.slice(0, 100)})`) : 'MINTED — the plant proves nothing'}`)
    } finally { rmSync(dir, { recursive: true, force: true }) } } }
console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ a pinched face is two faces')
process.exit(red ? 1 : 0)
