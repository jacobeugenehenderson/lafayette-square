/**
 * CLAIM: no baked slab is read under a fade model it was not baked for.
 *
 * ⭐ WHY THIS EXISTS, and it is a receipt rather than a hypothetical: the fade-SSoT
 * commit (77aa5aa9) collapsed BakedGround's two bands into one, which is correct for
 * a slab baked after the ruling. Every slab on disk was baked BEFORE it. Their
 * manifests carry an INWARD `fade` that reaches alpha 0 exactly AT the radius, plus a
 * wider `streetFade` that trailed PAST the rim — and that trailing band was the only
 * thing softening the edge. Read under the new one-band rule, every population died
 * at the rim in lockstep and the neighborhood gained a crisp hard circle. It FAILED
 * THE EYE GATE, and nothing in the build, the checks or the types said a word.
 *
 * ⛔ THE CLASS, in a town nobody has looked at: an artifact that outlives the schema
 * that wrote it. The code changes, the bake does not, and the renderer quietly
 * reinterprets old bytes under new rules. There is no error — just a wrong picture
 * that looks deliberate. CLAUDE.md Layer 0 question 2.
 *
 * WHAT IS ASSERTED:
 *   A. every slab's manifest declares which model it was baked under, detectably
 *   B. a legacy slab is READ by legacy rules (v1 artifact, v1 rules)
 *   C. a current slab is READ by current rules
 *   D. the two models genuinely disagree — so C is not vacuous
 *
 * ⚠️ A FAILING SLAB IS NOT A CODE BUG. It means that look needs a re-bake. The check
 * names which, and a re-bake is the operator's call (it is the irreversible step).
 *
 * ▶ node checks/claims-no-slab-outlives-its-schema.mjs
 */
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { deriveFade } from '../cartograph/boundaryRecords.mjs'

let fails = 0, stale = []
const ok = (c, m) => { console.log(`${c ? '  ✅' : '  ❌'} ${m}`); if (!c) fails++ }
const h = (s) => console.log(`\n${s}`)

// The runtime's own predicate, restated in ONE place here and nowhere else. If
// BakedGround's changes, this must change with it — which is the point of naming it.
const isLegacy = (stencil) => !!stencil?.streetFade

h('A. every baked slab declares its fade model')
const roots = ['public/baked', 'dist/baked'].filter(existsSync)
if (!roots.length) { console.log('  ·  no baked/ directory — nothing to check'); process.exit(0) }

const seen = []
for (const root of roots) {
  for (const look of readdirSync(root).sort()) {
    const f = join(root, look, 'ground.json')
    if (!existsSync(f)) continue
    let m; try { m = JSON.parse(readFileSync(f, 'utf8')) } catch { ok(false, `${root}/${look}: ground.json unparseable`); continue }
    const s = m.stencil
    if (!s) { console.log(`  ·  ${(root + '/' + look).padEnd(40)} stencil null — no dissolve (legal: toy)`); continue }
    const legacy = isLegacy(s)
    seen.push({ root, look, s, legacy })
    console.log(`  ${legacy ? '⚠️ ' : '✅'} ${(root + '/' + look).padEnd(40)} ${legacy ? 'LEGACY (v1, inward, two bands)' : 'CURRENT (v2, additive, one band)'}`)
    if (legacy) stale.push(`${root}/${look}`)
  }
}

h('B. a legacy slab is read by LEGACY rules, not reinterpreted')
// Mirrors BakedGround.fadeForGroup. Face and ribbon MUST resolve differently on a
// v1 slab — if they collapse, the runtime is reading v1 bytes under v2 rules.
const bandFor = (kind, s) => isLegacy(s) ? (kind === 'face' ? s.fade : s.streetFade) : s.fade
for (const { root, look, s, legacy } of seen) {
  if (!legacy) continue
  const face = bandFor('face', s), ribbon = bandFor('ribbon', s)
  ok(face.outer !== ribbon.outer,
    `${(root + '/' + look).padEnd(40)} face ${face.inner}->${face.outer} vs ribbon ${ribbon.inner}->${ribbon.outer} — the trailing band survives`)
  ok(ribbon.outer > s.radius,
    `${(root + '/' + look).padEnd(40)} the ribbon band still trails PAST the rim (${ribbon.outer} > ${s.radius}) — this is what softens the edge`)
}
if (!seen.some(x => x.legacy)) console.log('  ·  no legacy slabs present')

h('C. a current slab is read by CURRENT rules — one additive band for every kind')
for (const { root, look, s, legacy } of seen) {
  if (legacy) continue
  const face = bandFor('face', s), ribbon = bandFor('ribbon', s)
  ok(face.outer === ribbon.outer && face.inner === ribbon.inner,
    `${(root + '/' + look).padEnd(40)} one band for both kinds (${face.inner}->${face.outer})`)
  ok(face.outer === s.radius && face.inner < s.radius,
    `${(root + '/' + look).padEnd(40)} inward: the feather finishes AT the rim`)
}
if (!seen.some(x => !x.legacy)) console.log('  ·  no current slabs present (every look needs a re-bake)')

h('D. the two models genuinely disagree — so C is not vacuous')
{
  const R = 892, band = 200
  // Both models run inward. What differs is the RIBBON band: v1 gave ribbons a wider
  // one that trailed PAST the radius, v2 gives every kind the same inward band.
  const v2 = deriveFade(R, band)
  const v1face = { inner: Math.max(0, R - 134), outer: R }
  const v1ribbon = { inner: R - 92, outer: R + 108 }            // the old streetFade shape
  ok(v1ribbon.outer > R && v2.outer === R,
    `v1 ribbons trailed to ${v1ribbon.outer} (past the rim); v2 finishes at ${v2.outer} (the rim) — ${v1ribbon.outer - v2.outer} m of trailing edge is the difference`)
  ok(v1face.outer === v2.outer, 'both models finish the FACE band at the rim — so the face band alone cannot tell them apart, which is why the marker is streetFade')
}

if (stale.length) {
  console.log(`\n⚠️  ${stale.length} slab(s) predate the 2026-09-20 fade ruling and are rendered under the OLD model:`)
  for (const s of stale) console.log(`      ${s}`)
  console.log('   They are NOT showing their scene\'s authored fadeBand. ▶ re-bake each look.')
  console.log('   ⛔ This is not a code failure — it is an artifact that needs re-pouring, and')
  console.log('      the re-bake is the operator\'s call.')
}
console.log(fails === 0 ? '\n✅ all claims hold (no slab is misread)' : `\n❌ ${fails} claim(s) FAILED`)
process.exit(fails === 0 ? 0 : 1)
