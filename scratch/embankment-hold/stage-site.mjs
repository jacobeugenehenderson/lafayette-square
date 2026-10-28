// READ-ONLY: at which stage does a coast violation near (x, z) first appear? Runs bake-coast (temp copy, write=false) with
// snapshots after the open/close + cut, after simplify, after settle and after toResolution, and asks ringViolations of
// every ring within R of the site at each.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
const ROOT = new URL('../../', import.meta.url).pathname, HOME = join(ROOT, 'cartograph/bake-coast.mjs')
const [scene, xs, zs, rs = '5'] = process.argv.slice(2), X = +xs, Z = +zs, R = +rs
let src = readFileSync(HOME, 'utf8')
const ins = (anchor, code) => { if (!src.includes(anchor)) throw new Error('anchor gone: ' + anchor.slice(0, 60)); src = src.replace(anchor, anchor + code) }
const snap = (name, expr) => `\n  ;(globalThis.__snap ||= []).push(['${name}', ${expr}])\n`
ins("  const heldCutM2 = emb.paths.length ? areaM2(opened2) - areaM2(water) : 0", snap('open/close + cut', 'water.map(fromPath)'))
ins("  const simple = bodies.map(bd => ({ outer: simplifyRing(bd.outer, R, fine / 2, onRing), holes: bd.holes.map(h => simplifyRing(h, R, fine / 2, onRing)) }))", snap('simplify', 'simple.flatMap(bd => [bd.outer, ...bd.holes]).map(r => r.slice())'))
ins("  for (const bd of simple) { bd.outer = r3(wound(bd.outer, 1)); bd.holes = bd.holes.map(h => r3(wound(h, -1))) }", snap('settle (+ r3)', 'simple.flatMap(bd => [bd.outer, ...bd.holes]).map(r => r.slice())'))
ins("    let i = 0; for (const bd of simple) { bd.outer = res.rings[i++]; bd.holes = bd.holes.map(() => res.rings[i++]) }", snap('toResolution', 'simple.flatMap(bd => [bd.outer, ...bd.holes]).map(r => r.slice())'))
src = src.replace('  if (bad.length) throw new Error(`⛔ bake-coast: ${scene} — ${bad.length} place(s)', '  if (false) throw new Error(`⛔ bake-coast: ${scene} — ${bad.length} place(s)')
const abs = (spec) => spec.startsWith('.') ? pathToFileURL(join(dirname(HOME), spec)).href : spec.includes(':') ? spec : import.meta.resolve(spec)
const out = join(mkdtempSync(join(tmpdir(), 'coast-stage-')), 'bake-coast.mjs')
writeFileSync(out, src.replace(/from '([^']+)'/g, (_, s) => `from '${abs(s)}'`))
const M = await import(pathToFileURL(out).href)
const CF = await import(ROOT + 'cartograph/coastFile.mjs'), { outlineCorner, INK_EPS } = await import(ROOT + 'src/lib/tileGround.js')
const acuteAt = (o, p, q) => outlineCorner(o, [{ to: p }, { to: q }], INK_EPS).bad
await M.bakeCoast({ scene, write: false })
for (const [name, rings] of globalThis.__snap) {
  const near = rings.filter(r => r.some(p => Math.hypot(p[0] - X, p[1] - Z) < R))
  const v = near.flatMap(r => CF.ringViolations(r, acuteAt, 2 * INK_EPS).filter(x => Math.hypot(x.at[0] - X, x.at[1] - Z) < R))
  const verts = near.flatMap(r => r.filter(p => Math.hypot(p[0] - X, p[1] - Z) < 1.5))
  console.log(`${name}: ${near.length} ring(s) near · violations ${v.length} (${[...new Set(v.map(x => x.kind))].map(k => k + ' ' + v.filter(x => x.kind === k).length).join(', ')}) · vertices within 1.5 m: ${verts.map(p => `(${p.map(c => (+c).toFixed(3)).join(', ')})`).join(' ')}`) }
