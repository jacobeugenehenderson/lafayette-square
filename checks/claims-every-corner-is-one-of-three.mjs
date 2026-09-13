#!/usr/bin/env node
// ⭐⭐⭐ EVERY CORNER RENDERS AS ONE OF THE THREE SANCTIONED SPECS — OR IT IS A DEFECT.
// ▶ SECTION_DUMP=1 node scratch/claims-every-corner-is-one-of-three.mjs [scene ...]
//
// `SECTION §6.1`, in Jacob's words. There are THREE and they fall out of ONE rule; a fourth thing is
// always a defect, never a new case:
//   SW↔SW  both walks at the curb   → "the corner is just a continuous stripe around the outer band"
//   TL↔TL  both walks set back      → "the sidewalk wraps around, but there is an added ADA pad to
//                                      get the pedestrian to the street"
//   SW↔TL  mixed                    → the RAMP (Jacob's "slope joiner", renamed 2026-09-07)
//
// ⭐⭐ THE ACCEPTANCE IS WHAT ALL THREE SHARE, NOT THREE SEPARATE TESTS. Whichever spec a corner is,
// the drawn walk must be (A) ONE PIECE through the corner — `PIPELINE` step 6, "a seam between two
// bands is not constructible" — and (B) TOUCHING THE CURB, which is `§6.1` step 3 and absolute: the
// street edge of a corner is the ADA ramp, concrete, ALWAYS. A corner failing either is the FOURTH
// thing: the two legs' own arrangements butting, "two depth ranges that do not overlap".
//
// ⛔ IT READS THE PAINT, NOT THE PLAN. The config is classified from ③'s own resolved arrangement
// (`SECTION_DUMP=1`) and the verdict is taken by SAMPLING THE DRAWN POLYGONS. A check that asks the
// construction what it intended cannot see it fail to draw it — that is the "instrument reads the
// INTENTION, not the ACHIEVEMENT" defect this corpus has now hit twice (`RIBBONS §1`).
// ⛔ AND IT SAMPLES ALONG THE INWARD NORMAL, never in a fixed-width box — `9f43a99a`: a box 1.5 m
// deep cannot reach a set-back walk and reports a correct cross-section as a hole.
import { feed, buildProto } from './_proto-feed.mjs'
import { sectionPassProtoTile, sectionDump } from '../src/lib/tileGround.js'
import { intersectRings } from '../src/lib/buildBlockGeometryV2.js'

// ⛔⛔ "ONE PIECE" IS A CONNECTEDNESS QUESTION AND MUST NOT BE ASKED ALONG A RAY. A ray that crosses
// a JOG — the band stepping sideways where two cross-sections meet — reads walk, gap, walk, and the
// INK IS CONTIGUOUS. `c9a0d783` measured that distinction and it is where the whole population
// lives: at the joints it examined, 98.6% TOUCH and exactly one was a genuine gap. An earlier draft
// of this check used a ray and would have reported every jog as a broken corner.
// ⇒ Clip the drawn walk to a disc around the corner and COUNT THE PIECES. Radius is the band's own
// reach (`cw + lim`), derived from the corner being probed — not a chosen distance.
const disc = (c, r, seg = 24) => { const p = []; for (let i = 0; i < seg; i++) { const t = 2 * Math.PI * i / seg; p.push([c[0] + Math.cos(t) * r, c[1] + Math.sin(t) * r]) } return p }
const SAr = (g) => { let a = 0; for (let i = 0; i < g.length; i++) { const j = (i + 1) % g.length; a += g[i][0] * g[j][1] - g[j][0] * g[i][1] } return a / 2 }
const pieces = (rings, c, r) => intersectRings(rings, [disc(c, r)]).filter(g => SAr(g) > 0.01).length

if (!sectionDump.on) {
  console.log('⛔ NOT RUN — this check reads ③\'s own resolution and will not reconstruct it.')
  console.log('   ▶ SECTION_DUMP=1 node scratch/claims-every-corner-is-one-of-three.mjs [scene ...]')
  process.exit(1)
}
const scenes = process.argv.slice(2).filter(a => !a.startsWith('--'))
if (!scenes.length) scenes.push('lafayette-square', 'hipointe-demun')
const LIST = process.argv.includes('--list')

const inRing = (rg, x, y) => { let c = false
  for (let i = 0, j = rg.length - 1; i < rg.length; j = i++) { const [a, b] = rg[i], [e, d] = rg[j]
    if ((b > y) !== (d > y) && x < (e - a) * (y - b) / (d - b) + a) c = !c } return c }
const hit = (rings, x, y) => { let n = 0; for (const rg of rings || []) if (inRing(rg, x, y)) n++; return n % 2 === 1 }

let failures = 0
for (const scene of scenes) {
  const f = feed(scene); if (!f) { failures++; continue }
  const T = buildProto(f, { protoArtifact: true }).protoShapeTiles
  const tally = { 'SW↔SW': 0, 'TL↔TL': 0, 'SW↔TL': 0 }
  const broke = { 'not one piece': 0, 'not at the curb': 0, 'no walk at all': 0, 'grass on the ADA pad': 0 }
  let corners = 0, ok = 0, openField = 0, outsideClip = 0
  const bad = []
  for (const [ti, st] of T.entries()) {
    const rings = (st.iaFull || []).filter(r => r?.length >= 3)
    sectionDump.rows.length = 0
    const out = sectionPassProtoTile(st, f.curbWidth, { outer: 'LU', inner: 'SW' }, f.blockCustoms)
    if (out.openField) continue                       // all-LU to centre is a MATERIAL state, not a corner
    const walk = out.Wacc || []
    const lawn = out.tlByLu[Object.keys(out.tlByLu)[0]] || []
    const by = new Map(); for (const r of sectionDump.rows) by.set(`${r.ri}|${r.i}`, r)
    for (let ri = 0; ri < rings.length; ri++) {
      const rg = rings[ri], n = rg.length, corner = (st.iaCorner || [])[ri] || []
      for (let q = 0; q < n; q++) {
        if (!corner[q]) continue
        const A = by.get(`${ri}|${(q - 1 + n) % n}`), B = by.get(`${ri}|${q}`)
        if (!A || !B) continue
        // ⛔⛔ THE OPEN FIELD IS NOT A CORNER SPEC AND MUST NOT BE SCORED AS ONE. Both strips LU is
        // a MATERIAL state (`SECTION §3.1`) — there is no sidewalk on either leg, so there is no
        // walk to carry round and nothing the three specs describe. An earlier run of this check
        // swept it into the mixed bucket and then reported it as "no walk at all", which is the
        // instrument manufacturing a defect out of a legitimate authored state (Layer 0 q3).
        const aW = A.outWalk || A.inWalk, bW = B.outWalk || B.inWalk
        if (!aW && !bW) { openField++; continue }
        corners++
        const cfg = (A.inWalk && B.inWalk) ? 'TL↔TL' : (A.outWalk && B.outWalk) ? 'SW↔SW' : 'SW↔TL'
        tally[cfg]++
        const cw = B.cw, lim = B.lim
        // sample a fan of rays through the corner, each along its own INWARD normal
        // ⛔ A RAY IS STRUCK FROM A POINT ALONG EACH EDGE, NEVER FROM THE CORNER VERTEX ITSELF.
        // At a vertex the two normals straddle the turn and a ray struck there leaves the block on
        // the convex side, so the probe reads empty ground and calls a correct corner a hole. The
        // foot is placed a curb-width in from the vertex — derived from the geometry being probed,
        // not a chosen distance — and clamped to the edge so a short eased edge cannot overshoot.
        const V = rg[q]
        const rays = []
        for (const e of [(q - 1 + n) % n, q]) {
          const a = rg[e], b = rg[(e + 1) % n]
          const d = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(d[0], d[1]) || 1
          const t = Math.min(0.5, (B.cw + 0.05) / L)
          const foot = e === q ? [a[0] + d[0] * t, a[1] + d[1] * t] : [b[0] - d[0] * t, b[1] - d[1] * t]
          let nv = [-d[1] / L, d[0] / L]
          if (!hit(st.iA || rings, foot[0] + nv[0] * 0.05, foot[1] + nv[1] * 0.05)) nv = [d[1] / L, -d[0] / L]
          rays.push({ nv, foot })
        }
        // ⛔⛔ A CORNER OUTSIDE THE TILE'S CUT RING IS NOT DRAWN, AND SCORING IT IS THE INSTRUMENT
        // MANUFACTURING A DEFECT. `iaFull` is the UNCUT contour — that is the whole point of it, it
        // answers "what depth HERE" with the per-point correspondence intact — but the paint is
        // `inBlock(...)`, intersected with the CUT `iA` after the disc was stamped. Beyond the rim
        // there is legitimately no walk. ⭐ `ARCHITECTURE §"The compound shape"`: the rim is an EDGE
        // OF THE DRAWING, never an absence — so this is EXCLUDED AND COUNTED, never silently skipped.
        // ⛔ Tested at the ray FEET, not at the corner vertex: a vertex can sit a hair outside the
        // cut ring while both of its legs are drawn (measured on tile 110, whose corners are correct).
        if (!rays.some(({ nv, foot }) => hit(st.iA || [], foot[0] + nv[0] * (cw + 0.05), foot[1] + nv[1] * (cw + 0.05)))) {
          corners--; tally[cfg]--; outsideClip++; continue
        }
        // (B) AT THE CURB — `§6.1` step 3, absolute for all three specs
        const atCurb = rays.every(({ nv, foot }) => hit(walk, foot[0] + nv[0] * (cw + 0.05), foot[1] + nv[1] * (cw + 0.05)))
        // (A) ONE PIECE — the drawn walk, clipped to the corner's own reach, is a SINGLE component.
        const np = pieces(walk, V, cw + Math.max(0.2, lim))
        const anyWalk = np > 0, gap = np > 1
        // ⛔⛔ AND THE TEST THAT ACTUALLY DISCRIMINATES — without it this gate is passed for free by
        // the one config that needs no construction. *(Jacob, 2026-09-07: "the only correct blocks
        // as far as I can see are sw <> sw, so basically the 0 state." The gate read 87.7% while the
        // eye said one config in three. `2db0c777` recorded this family of counter rewarding exactly
        // that.)* SW↔SW is a continuous stripe around the outer band and has nothing to build; the
        // other two must BUILD a pad that reaches the street, and the grass must stop for it
        // (`§6.1` step 3, and `SECTION §6.1`: TL↔TL is "the walk wraps, plus an added ADA pad to get
        // the pedestrian to the street"). ⇒ where the lawn is the OUTER strip, grass at the kerb
        // inside the corner means the pad was not built — or was built and painted over.
        // ⛔ SAMPLED DOWN THE PAD'S WHOLE DEPTH, NOT AT THE KERB LINE. A first version tested one
        // point at `cw + 0.05` and caught 74 of the 827 corners the standalone measurement found —
        // the grass sits ACROSS the pad, not necessarily on its outermost millimetre. A gate that
        // detects a fourteenth of its own defect is a gate that will report the next one fixed.
        const grassOnPad = ((A.inWalk && !A.outWalk) || (B.inWalk && !B.outWalk))
          && rays.some(({ nv, foot }) => { for (let k = 1; k <= 20; k++) {
                const dd = cw + (k / 20) * Math.max(0.2, lim)
                if (hit(lawn, foot[0] + nv[0] * dd, foot[1] + nv[1] * dd)) return true } return false })
        if (grassOnPad) { broke['grass on the ADA pad']++; bad.push({ ti, ri, q, cfg, why: 'grass on the ADA pad', V }) }
        else if (!anyWalk) { broke['no walk at all']++; bad.push({ ti, ri, q, cfg, why: 'no walk at all', V }) }
        else if (!atCurb) { broke['not at the curb']++; bad.push({ ti, ri, q, cfg, why: 'not at the curb', V }) }
        else if (gap) { broke['not one piece']++; bad.push({ ti, ri, q, cfg, why: 'not one piece', V }) }
        else ok++
      }
    }
  }
  const pct = corners ? (100 * ok / corners) : 0
  console.log(`\n══ ${scene} · every corner as one of the three ══`)
  console.log(`  corners                     ${corners}${(openField || outsideClip) ? `   (+ ${openField} OPEN FIELD, + ${outsideClip} outside the disc clip — neither is a corner spec)` : ''}`)
  console.log(`  spec they resolve to        ${Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
  console.log(`  ✅ renders as its spec      ${ok}  (${pct.toFixed(1)}%)`)
  for (const [k, v] of Object.entries(broke)) if (v) console.log(`  ⛔ ${k.padEnd(26)}${v}`)
  if (LIST) for (const b of bad.slice(0, 25)) console.log(`     tile ${String(b.ti).padStart(4)} v${String(b.q).padStart(3)} ${b.cfg}  ${b.why}  at (${b.V[0].toFixed(1)},${b.V[1].toFixed(1)})`)
  if (ok !== corners) { failures++; console.log(`  ⛔ FAIL — ${corners - ok} corner(s) render as a FOURTH thing.`) }
  else console.log(`  ✅ 100%.`)
}
// ⚠️ NOT AN EYE VERDICT. A corner can pass all of this and still look wrong; `SECTION §6.2` — verify
// corner changes on a render. This says only that the walk is one piece and reaches the street.
process.exit(failures ? 1 : 0)
