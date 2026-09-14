#!/usr/bin/env node
// ⛔⛔ DOES ①②③ READ THE OPERATOR'S AUTHORING? — the dual-state gate, `CLAUDE.md` Layer 0 q3.
//
// WHY THIS EXISTS. Seven of the eight ①②③ probes in `scratch/` call
// `buildTileGround(rb, { grout: 'proto' })` with NO `blockCustoms` — authoring switched OFF —
// and `claims-proto-stack-disjoint.mjs`'s own header asserts the opposite ("WITH the scene's
// authored state loaded"). That is `ROADMAP A05`'s defect (`litmus-curb-parallel.mjs:77`)
// reproduced in the new stack: it fails WORST on the most heavily authored town and looks
// CLEANEST on a fresh pour — blind exactly where the map is most worked-on.
//
// ⛔ BUT AN UNPASSED ARGUMENT IS NOT YET A DEFECT. It is only one if the answer MOVES. So this
// runs the SAME construction in both states and reports the delta. Both outcomes are findings:
//   delta ≠ 0 → the seven probes measured the un-authored map; every ②③ number is void.
//   delta = 0 → authoring does not reach ②③ at all, which is worse and is its own ticket.
//
// It also asks the sharper question the aggregate cannot: of the authored slots that exist,
// how many does ①'s identity stamp actually RESOLVE (`bcOf(skelId, side, segOrd)`)? An
// unresolved slot is an override the operator made that the proto stack cannot see.
//
// ⛔ Look→scene comes from `public/looks/index.json`, never from the directory name (`A11`).
// ▶ node checks/claims-proto-stack-reads-authoring.mjs [scene ...]
import { feed, buildProto, feedScenes } from '../scratch/_proto-feed.mjs'

const scenes = feedScenes()
const signedArea = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return a / 2 }
// ⭐ NET signed area, never gross |area| — a band is a compound path and its holes must
// subtract. `claims-proto-stack-disjoint`'s own comment records the 127× lie the gross form told.
const net = (rings) => (rings || []).reduce((t, r) => t + (r?.length >= 3 ? signedArea(r) : 0), 0)
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : 'n/a')

let failed = false
for (const scene of scenes) {
  const f = feed(scene)
  if (!f) { failed = true; continue }
  const { blockCustoms: bc, curbWidth, look, slots } = f


  console.log(`\n${'='.repeat(78)}\n${scene}  (look '${look}', curbWidth ${curbWidth} m)`)
  console.log(`   authoring on disk: ${Object.keys(bc || {}).length} street(s), ${slots} slot(s)`)

  const A = buildProto(f)                 // AUTHORED — the state the operator is looking at
  const B = buildProto(f, { bare: true })  // BARE — what the blind probes measured

  const bands = ['curb', 'treelawn', 'sidewalk', 'lu']
  const rowsA = A.protoBands || {}, rowsB = B.protoBands || {}

  console.log(`\n   ${'artifact'.padEnd(22)} ${'AUTHORED'.padStart(16)} ${'BARE (7 probes)'.padStart(16)} ${'Δ'.padStart(14)}`)
  const line = (name, a, b, unit = '') => {
    const d = a - b
    const mark = Math.abs(d) > 1e-6 ? ' ⛔' : ''
    console.log(`   ${name.padEnd(22)} ${f2(a).padStart(16)} ${f2(b).padStart(16)} ${f2(d).padStart(14)}${unit}${mark}`)
  }
  line('proto rings', (A.proto || []).length, (B.proto || []).length)
  line('curb rings (②)', (A.protoCurb || []).length, (B.protoCurb || []).length)
  line('curb area m² (②)', Math.abs(net(A.protoCurb)), Math.abs(net(B.protoCurb)))
  for (const k of bands) {
    line(`${k} rings (③)`, (rowsA[k] || []).length, (rowsB[k] || []).length)
    line(`${k} area m² (③)`, Math.abs(net(rowsA[k])), Math.abs(net(rowsB[k])))
  }
  line('blocks capped', A.protoStackCollapse?.total ?? NaN, B.protoStackCollapse?.total ?? NaN)
  line('blocks too narrow', A.protoStackCollapse?.tooNarrow ?? NaN, B.protoStackCollapse?.tooNarrow ?? NaN)

  // ── THE SHARPER QUESTION: does ①'s identity stamp RESOLVE the operator's slots? ──────────
  // ⛔ Counted off ①'s own owners, so this is the proto stack's view of the authoring, not the
  // design file's view of itself. An authored slot ① cannot address is an override that is
  // inert in this construction — which is `A15`/`A17`'s question asked on the new substrate.
  const owners = A.protoOwners || null
  if (owners) {
    const seen = new Set()
    for (const o of owners) if (o) seen.add(`${o.skelId}|${o.side}|${o.segOrd}`)
    let resolved = 0
    for (const [skelId, sides] of Object.entries(bc || {}))
      for (const [side, ords] of Object.entries(sides || {}))
        for (const ord of Object.keys(ords || {}))
          if (seen.has(`${skelId}|${side}|${ord}`)) resolved++
    console.log(`\n   authored slots addressable by ①'s stamps: ${resolved} of ${slots}`)
    if (resolved < slots) console.log(`   ⛔ ${slots - resolved} authored slot(s) name an identity ① does not carry — inert in ②③.`)
  } else {
    console.log(`\n   ⚠️ owners not exposed on the build result — slot resolution NOT measured (not "zero").`)
  }

  const moved = ['curb', 'treelawn', 'sidewalk', 'lu'].some(k => Math.abs(net(rowsA[k]) - net(rowsB[k])) > 1e-6) ||
                Math.abs(net(A.protoCurb) - net(B.protoCurb)) > 1e-6
  if (moved) {
    console.log(`\n   ⛔ VERDICT: authoring MOVES ②③ on this scene. The seven probes that pass no`)
    console.log(`      blockCustoms measured the UN-AUTHORED map. Their numbers are void.`)
    failed = true
  } else {
    console.log(`\n   ⛔ VERDICT: authoring changes NOTHING in ②③ on this scene. That is not a pass —`)
    console.log(`      the operator's overrides do not reach the construction. Its own ticket.`)
    failed = true
  }
}

console.log(`\n${failed ? '⛔ FAIL' : '✅ PASS'} — re-run this; do not quote its digits.`)
process.exit(failed ? 1 : 0)
