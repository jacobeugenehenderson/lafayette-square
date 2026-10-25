#!/usr/bin/env node
// CLAIM — A WATER RING'S WINDING NEVER DECIDES WHAT IS LAND. The mint closes the land as frame − (ink ∪ water) in one boolean
// (`tileGround.js#mintProtopolygon`), and the clip set unions by nonzero fill: a lake wound AGAINST the ink cancelled it where
// they overlap (+1 − 1 = 0), so the street ink inside the water came back as LAND faces. Found on a planted lake by the
// absorption smoke (Ferrule, 2026-10-25); none of today's coasts is wound against the ink (Zob: Huron, PTown, JH), but a
// town nobody has looked at need not be. The mint now winds each water ring to the ink outers' sign where it enters the clip.
//   (1) PLANTED: the same coast and streets — two streets running past the shore into the lake — minted with the lake
//       counter-clockwise and clockwise: the same faces, the same land area, and no face whose every edge is street ink.
//   (2) SOURCE: the mint orients the water rings before they enter the clip set (read, so a deleted line is RED).
//   MUTANT (always run): the clockwise lake minted through a copy of the mint with that line removed must come back with
//   land faces the counter-clockwise one does not have — or (1) proves nothing.
//   node checks/claims-a-clockwise-lake-keeps-its-water.mjs
import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ROOT } from './_scenes.mjs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'

let red = 0
const row = (ok, s) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${s}`) }
const st = (id, pts) => ({ skelId: id, name: id, points: pts, highway: 'residential', caps: { start: { degree: 1 }, end: { degree: 1 } } })
const streets = [st('a', [[-100, 0], [-100, -150]]), st('b', [[100, 0], [100, -150]]), st('c', [[-150, 0], [-100, 0], [100, 0], [150, 0]])]
streets[0].caps.start.degree = 3; streets[1].caps.start.degree = 3
const arc = [[-200, -100], [0, -104], [200, -100]], ccw = [...arc, [200, -200], [-200, -200]].reverse(), cw = [...ccw].reverse()
const boundary = Array.from({ length: 48 }, (_, i) => [190 * Math.cos(i / 48 * 2 * Math.PI), 190 * Math.sin(i / 48 * 2 * Math.PI)])
const area = (r) => Math.abs(r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0) / 2)
const quiet = async (f) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await f() } finally { console.log = l; console.warn = w } }
const mint = (mod, lake) => quiet(() => mod.mintProtopolygon({ streets, boundary, bb: { x0: -200, x1: 200, z0: -200, z1: 200 }, coast: [lake], coastArcs: [arc] }))
const summary = (MP) => ({ n: MP.blocks.length, land: MP.blocks.reduce((t, b, k) => t + area(b) - (MP.blockHoles[k] || []).reduce((u, h) => u + area(h), 0), 0),
  inkOnly: MP.blocks.filter((b, k) => MP.blockLabels[k].every(l => { const o = MP.owners[l]; return o && !o.water && !o.boundary && o.skelId !== '__boundary__' })).length })

const live = await import('../src/lib/tileGround.js')
const A = summary(await mint(live, ccw)), B = summary(await mint(live, cw))
row(A.n === B.n && Math.abs(A.land - B.land) < 1e-6 && B.inkOnly === A.inkOnly,
  `(1) the lake counter-clockwise: ${A.n} face(s), ${A.land.toFixed(2)} m² of land · clockwise: ${B.n} face(s), ${B.land.toFixed(2)} m² — the same`)
const src = readFileSync(join(ROOT, 'src/lib/tileGround.js'), 'utf8')
const LINE = /const w = r\.map\(p => \[p\[0\], p\[1\]\]\); if \(Math\.sign\(signedArea\(w\)\) !== inkSign\) w\.reverse\(\)/
row(LINE.test(src), '(2) the mint winds each water ring to the ink before it enters the clip set')
// the mutant: the same mint with the orientation removed, from a copy of src/lib (its sibling imports resolve there)
{ const dir = mkdtempSync(join(tmpdir(), 'cw-lake-'))
  try {
    cpSync(join(ROOT, 'src'), join(dir, 'src'), { recursive: true }); symlinkSync(dirname(dirname(createRequire(import.meta.url).resolve('clipper-lib'))), join(dir, 'node_modules'))   // the node_modules this repo resolves from
    writeFileSync(join(dir, 'src/lib/tileGround.js'), src.replace(LINE, 'const w = r.map(p => [p[0], p[1]])'))
    const mut = await import(join(dir, 'src/lib/tileGround.js'))
    let M = null, refused = null; try { M = summary(await mint(mut, cw)) } catch (e) { refused = String(e.message).split('\n')[0].slice(0, 140) }
    const ok = !!refused || M.n !== A.n || Math.abs(M.land - A.land) > 1e-6
    row(ok, `mutant: without the winding, the clockwise lake ${refused ? `is REFUSED by the pour (${refused})` : `gives ${M.n} face(s), ${M.land.toFixed(2)} m²`} — must not match ${A.n} face(s), ${A.land.toFixed(2)} m²`)
  } finally { rmSync(dir, { recursive: true, force: true }) } }
console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ a water ring\'s winding never decides what is land')
process.exit(red ? 1 : 0)
