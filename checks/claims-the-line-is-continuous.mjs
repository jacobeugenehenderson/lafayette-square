// claims-the-line-is-continuous.mjs — THE LINE'S HEIGHT IS A CONTINUOUS FUNCTION OF THE POINT ASKED.
//
// The class (HPDM's sweep bake, Boz 2026-10-17): `lineHeight.mjs#heightAt` answered with the NEAREST segment's height, and on
// the inside of a bend the nearest segment flips across the bisector — so a point moved 2 mm and the street's height moved
// 3 cm (berthold-avenue-3), and ② and the road, which ask the line at their own points, stepped with it. Any town with a
// bending street has it.
// ⭐ READ, NOT RESTATED: the line is the town's own (`lineHeights` over ribbons.json, at the window bake-ground uses:
//   design.json#groundLineSigmaM, else one terrain grid step). Around every vertex where an at-grade chain turns, points on
//   arcs across the INSIDE of the bend (the wedge between the two segments' normals, and as wide again on each side) at radii
//   ¼, ½, 1, 2 and 4 × the shorter leg ask heightAt; a JUMP is two neighbouring samples whose heights differ by more than their
//   own spacing (steeper than 1:1), and the step SURVIVES REFINEMENT: the interval is bisected 20 times toward its larger half,
//   and at least half the step is still there (a ramp's step shrinks with the spacing; a discontinuity's never does — a narrow
//   wedge at a near-straight vertex packs the samples so tight that a steep ramp passes 1:1). Gate: 0 LOCAL jumps.
// ⛔ THE SCOPE IS WHERE THE ANSWER IS LOCAL: a jump whose two samples are both nearest to one of V's own two legs, and no
//   farther from the chain than half of that leg and of each leg beside it (lineHeight's own half-leg bound). Farther — a chain
//   that doubles back, a point past a short leg's half, or beyond the shorter leg (2 and 4 × it) — the nearest point can lie on
//   legs that do not meet (the offset's swallowtail), which no local lookup resolves. Those are COUNTED and printed, never gated.
// ⭐ MUTATION TEST: `--selftest` runs the same rows against a lineHeight with the bare nearest-segment answer planted back
//   (written to the OS temp dir) and expects RED.
//   node checks/claims-the-line-is-continuous.mjs [scene…] [--selftest]
import { ROOT, scenes } from './_scenes.mjs'
import { join } from 'node:path'
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { loadSceneTerrain } from '../cartograph/terrainLoad.js'
import { readBakeDesign } from '../cartograph/lookDesign.mjs'

const HOME = join(ROOT, 'cartograph/lineHeight.mjs'), SELF = process.argv.includes('--selftest')
const mutant = () => { const src = readFileSync(HOME, 'utf8'), from = '    for (const [i, j] of [[L, L + 1], [L - 1, L]]) {'
  if (src.split(from).length !== 2) throw new Error('selftest: lineHeight.mjs no longer tries the wedge at `[[L, L + 1], [L - 1, L]]` — re-aim the mutation')
  const f = join(mkdtempSync(join(tmpdir(), 'line-continuous-')), 'lineHeight.mjs')
  writeFileSync(f, src.replace(from, '    for (const [i, j] of []) {')); return pathToFileURL(f).href }
const { lineHeights } = await import(SELF ? mutant() : pathToFileURL(HOME).href)

// the leg (P[j] → P[j + 1]) nearest q, and whether q is LOCAL to it: no farther from the chain than half of that leg and of
// each leg beside it (the lookup's own half-leg bound; farther, a foot can fall past a short leg's half — the swallowtail)
const legLen = (P, j) => j < 0 || j + 1 >= P.length ? Infinity : Math.hypot(P[j + 1][0] - P[j][0], P[j + 1][1] - P[j][1])
const nearestLeg = (P, q) => { let best = Infinity, j0 = -1
  for (let j = 0; j + 1 < P.length; j++) { const a = P[j], b = P[j + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz
    const w = L2 > 0 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / L2)) : 0, d = (q[0] - a[0] - w * dx) ** 2 + (q[1] - a[1] - w * dz) ** 2
    if (d < best) { best = d; j0 = j } }
  return { j: j0, local: Math.sqrt(best) <= 0.5 * Math.min(legLen(P, j0 - 1), legLen(P, j0), legLen(P, j0 + 1)) } }
const judge = (scene) => {
  const rib = join(ROOT, `cartograph/data/${scene}/clean/ribbons.json`), T = loadSceneTerrain(scene)
  if (!T) return { scene, refused: 'no terrain — the line has no height to be continuous in' }
  const design = readBakeDesign(scene, scene, 'claims-the-line-is-continuous')
  const sigma = Number.isFinite(design.groundLineSigmaM) && design.groundLineSigmaM > 0 ? design.groundLineSigmaM : T.stepM
  if (!(sigma > 0)) return { scene, refused: 'no line window (design.json groundLineSigmaM, or the terrain grid step)' }
  const streets = JSON.parse(readFileSync(rib, 'utf8')).streets, LH = lineHeights({ streets, raw: T.getElevationRaw, sigma })
  let verts = 0; const gated = [], far = { jumps: 0, verts: 0 }
  for (const st of streets || []) { if (!(st?.points?.length >= 3) || st.gradeSeparated) continue
    const id = st.skelId ?? st.name, P = st.points
    for (let i = 1; i + 1 < P.length; i++) {
      const d1 = [P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]], d2 = [P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]], l1 = Math.hypot(...d1), l2 = Math.hypot(...d2)
      const cr = d1[0] * d2[1] - d1[1] * d2[0], th = Math.atan2(Math.abs(cr), d1[0] * d2[0] + d1[1] * d2[1])
      if (!(l1 > 0 && l2 > 0) || !(th > 1e-6) || th > Math.PI / 2) continue
      verts++
      // the inside of the bend: the bisector of the two inward normals (left of travel for a left turn, right for a right)
      const s = Math.sign(cr), n1 = [-s * d1[1] / l1, s * d1[0] / l1], n2 = [-s * d2[1] / l2, s * d2[0] / l2], mid = Math.atan2(n1[1] + n2[1], n1[0] + n2[0])
      const half = 1.5 * th, N = 120, leg = Math.min(l1, l2)
      for (const f of [0.25, 0.5, 1, 2, 4]) {
        const r = f * leg, sp = r * (2 * half / N); let prev = null, pp = null, jumps = 0, worst = 0, nonlocal = 0
        const at = (a) => [P[i][0] + r * Math.cos(a), P[i][1] + r * Math.sin(a)]
        // does the step between angles a0 and a1 survive 20 bisections toward its larger half?
        const survives = (a0, a1, h0, h1) => { const s0 = Math.abs(h1 - h0)
          for (let n = 0; n < 20; n++) { const am = (a0 + a1) / 2, hm = LH.heightAt(id, at(am)); if (hm == null) return false
            if (Math.abs(hm - h0) >= Math.abs(h1 - hm)) { a1 = am; h1 = hm } else { a0 = am; h0 = hm } }
          return Math.abs(h1 - h0) >= 0.5 * s0 }
        let pa = null
        for (let k = 0; k <= N; k++) { const a = mid - half + 2 * half * k / N, p = at(a), h = LH.heightAt(id, p)
          if (prev != null && h != null && Math.abs(h - prev) > sp && survives(pa, a, prev, h)) { if ([pp, p].every(q => { const l = nearestLeg(P, q); return l.local && (l.j === i - 1 || l.j === i) })) { jumps++; worst = Math.max(worst, Math.abs(h - prev)) } else nonlocal++ }
          prev = h; pp = p; pa = a }
        if (jumps) gated.push({ id, at: P[i], r, jumps, worst, turn: th * 180 / Math.PI })
        if (nonlocal) { far.jumps += nonlocal; far.verts++ } } } }
  return { scene, verts, gated, far, sigma }
}

const towns = scenes('cartograph/data/<scene>/clean/ribbons.json').filter(s => existsSync(join(ROOT, `cartograph/data/${s}/clean/ribbons.json`)))
// a town whose line refuses to build is a failure to check, said so — never a pass
const R = (SELF ? towns.slice(0, 1) : towns).map(t => { try { return judge(t) } catch (e) { return { scene: t, refused: `the line refused to build: ${e.message}` } } })
let bad = 0
for (const r of R) {
  if (r.refused) { console.log(`  ⛔   ${r.scene}: NOT CHECKED — ${r.refused}`); bad++; continue }
  const g = r.gated.sort((a, b) => b.worst - a.worst), j = g.reduce((s, x) => s + x.jumps, 0)
  console.log(`  ${g.length ? '⛔' : '✅'}   ${r.scene}: ${r.verts} turning vertices (σ ${r.sigma.toFixed(2)} m) · local: ${j} jump(s) at ${g.length} vertex/vertices${g.length ? `, worst ${g[0].worst.toFixed(3)} m` : ''} · not local, not gated (another leg nearer, or farther than a leg's half): ${r.far.jumps} jump(s) at ${r.far.verts} vertex/vertices`)
  for (const x of g.slice(0, 5)) console.log(`          ${x.id} at (${x.at.map(v => v.toFixed(1)).join(', ')}) · turn ${x.turn.toFixed(1)}° · r ${x.r.toFixed(2)} m · ${x.jumps} jump(s), worst ${x.worst.toFixed(3)} m`)
  if (g.length) bad++
}
if (SELF) { const caught = R.some(r => r.gated?.length)
  console.log(caught ? '✅ selftest: the bare nearest-segment answer jumps on the inside of a bend (RED)' : '⛔ selftest: the check does not catch the nearest-segment jump'); process.exit(caught ? 0 : 1) }
console.log(bad ? `⛔ ${bad} town(s) whose line jumps, or that cannot be judged` : '✅ the line is a continuous function of the point'); process.exit(bad ? 1 : 0)
