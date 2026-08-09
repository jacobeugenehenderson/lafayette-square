#!/usr/bin/env node
/**
 * "WHICH DECLINES ACTUALLY LEAVE A HOLE?" — A10 / D1b, the mode split.
 *
 * WHY THIS EXISTS (2026-08-08). D1 counted 2,143 declining corners in four
 * modes and every doc since has treated that as one number. It is not one
 * defect. `SECTION §7` says an unhonoured takeover *"falls to `luRemainder` and
 * RENDERS AS LAND USE — the gap is ribbon painted green"* — but that is only
 * true when the released wedge is actually left UNCLAIMED. The construction
 * says so itself at `tileGround.js:3641`: *"leg-sector COVERS the corner wedge
 * (bandRem empty → the bent pad can't build)"*. So a `bandRem-empty` decline
 * leaves NO hole; the legs already paved it, in the legs' own materials.
 *
 * ⭐ THAT IS TWO DIFFERENT DEFECTS SHARING A COUNTER, which is POLYGON-FIRST §5
 * RULE 3 exactly — *"if a check's failures need a taxonomy to explain, it is
 * really N checks; split it."* This is the split:
 *
 *   ⛔ HOLE      the released wedge is unclaimed → it flows to `luRemainder` and
 *                paints as land use. A visible green notch in the sidewalk.
 *   ⚠️ MISPAINT  the wedge IS claimed, by the legs rather than by an ADA corner
 *                pad. The ribbon is continuous; the MATERIAL is wrong (doctrine
 *                §6.9.1: sidewalk only at the corner). Looks fine. Reads fine on
 *                a proxy render. Only the eye at close range catches it.
 *
 * ⛔ WHY THIS MATTERS FOR THE CURE, not just the tally: a cure aimed at the
 * dominant MODE is aimed at the wrong defect if that mode is a mispaint. The
 * hole is what the operator reported; the mispaint is a separate, quieter
 * ticket. Sizing A10 off the combined number sizes it wrong.
 *
 * HOW IT MEASURES — no re-derivation. The unclaimed wedge is literally
 * `differenceRings(bandRem, cornerClaimed)` at `tileGround.js:1669`, the
 * expression whose result flows into `luRemainder`. Rather than rebuild that
 * from the outside (a detector that re-derives can disagree with the
 * construction — the `litmus-curb-parallel` failure), this copies the source,
 * injects ONE probe statement at that exact line, and reads the construction's
 * own polygons. ⛔ Nothing under `src/` is written. The probe is inert: with the
 * env flag off the copy is byte-equivalent in behaviour, and `--verify-inert`
 * proves the FILL output is identical armed and disarmed.
 *
 * Per declining corner, inside a disc of radius `c.trim + cw + c.T + 1` centred
 * on the corner. ⭐ `c.trim` is load-bearing and was missing on the first pass:
 * at a junction the block's band is set BACK from the node by asphalt-half-width
 * + R, so a disc sized only to the ped depth misses the ribbon entirely — and it
 * misses it worst on the WIDEST streets, i.e. exactly the big intersections. It
 * showed up as 51 corners with real depth and no band in reach (LS), which is
 * why the unmeasurable class is emitted loudly rather than folded in.
 *   unclaimed / band  → the share of the local band left to land use.
 * A corner is a HOLE if that share clears --hole-tol (default 2%, so numerical
 * slivers do not get promoted to defects); MISPAINT otherwise.
 *
 * ⛔ Runs with each scene's AUTHORED state loaded (CLAUDE.md Layer 0 q3), and
 * says so per scene — a scene with no customs is labelled, never called clean.
 *
 * Usage:
 *   node scratch/claims-decline-fate.mjs                  # every baked scene
 *   node scratch/claims-decline-fate.mjs lafayette-square # one scene
 *   node scratch/claims-decline-fate.mjs --verify-inert   # prove the probe changes nothing
 *   node scratch/claims-decline-fate.mjs --rows           # every hole, named
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'

const ROOT   = new URL('..', import.meta.url).pathname
const BAKED  = join(ROOT, 'public/baked')
const LOOKS  = join(ROOT, 'public/looks')
const SRCDIR = join(ROOT, 'src/lib')
const TMP    = join(ROOT, 'scratch/.d2-mutants')

const argv = process.argv.slice(2)
const has  = (f) => argv.includes(`--${f}`)
const opt  = (f) => { const i = argv.indexOf(`--${f}`); return i < 0 ? null : argv[i + 1] }
const ONLY = argv.find(a => !a.startsWith('--') && a !== opt('hole-tol'))
const ROWS = has('rows')
const HOLE_TOL = Number(opt('hole-tol') ?? 0.02)

// ── the probe: ONE statement, at the line the wedge is decided ──────────────
// Anchored on the expression itself, so if that construction is rewritten the
// anchor fails loudly instead of measuring a line that no longer means this.
const ANCHOR = 'let luRemainder = unionRings([...iW, ...luExtra, ...differenceRings(bandRem, cornerClaimed)])'
const PROBE = `
    if (globalThis.__declineFate) {
      const __un = differenceRings(bandRem, cornerClaimed)
      const __A = (rs) => (rs || []).reduce((s, r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1] } return s + a / 2 }, 0)
      for (const [__ck, __c] of cornerT) {
        const __d = [circlePoly(__c.p[0], __c.p[1], (__c.trim || 0) + cw + __c.T + 1)]
        globalThis.__declineFate.push({
          k: __ck, T: __c.T,
          unclaimed: __A(intersectRings(__un, __d)), band: __A(intersectRings(fullBand, __d)),
          tileBand: __A(fullBand), tileBandRings: fullBand.length,
        })
      }
    }`

const src = readFileSync(join(SRCDIR, 'tileGround.js'), 'utf8')
const hits = src.split(ANCHOR).length - 1
if (hits !== 1) {
  console.error(`⛔ the probe anchor matched ${hits} time(s), expected exactly 1.`)
  console.error(`   \`${ANCHOR.slice(0, 60)}…\``)
  console.error(`   The construction has moved. This probe measures the fate of the released wedge at`)
  console.error(`   the exact line that decides it; anchored anywhere else it would measure something`)
  console.error(`   else and say nothing about it. Re-anchor before trusting any output.`)
  process.exit(2)
}
mkdirSync(TMP, { recursive: true })
const probed = join(TMP, 'tileGround.declineFate.mjs')
writeFileSync(probed, src.replace(ANCHOR, ANCHOR + PROBE)
  .replace(/(from\s*['"])(\.[^'"]*)(['"])/g, (_, a, s, z) => a + resolve(SRCDIR, s) + z))

process.env.CORNER_DUMP = '1'
const { sectionPassTile, cornerDump } = await import(probed)
if (!cornerDump?.on) { console.error('⛔ CORNER_DUMP is not armed — nothing measured.'); process.exit(2) }

const STRIP_MAT = { outer: 'LU', inner: 'SW' }
const BUILT = new Set(['BUILT', 'built-empty-concrete'])

const scenes = (ONLY ? [ONLY] : readdirSync(BAKED).filter(d => statSync(join(BAKED, d)).isDirectory()))
  .filter(s => existsSync(join(BAKED, s, 'shape.json'))).sort()
if (!scenes.length) { console.error('⛔ no baked scene found — nothing measured.'); process.exit(2) }

// ── --verify-inert: the probe must not change the FILL ──────────────────────
if (has('verify-inert')) {
  const clean = join(TMP, 'tileGround.clean.mjs')
  writeFileSync(clean, src.replace(/(from\s*['"])(\.[^'"]*)(['"])/g, (_, a, s, z) => a + resolve(SRCDIR, s) + z))
  const { sectionPassTile: pure } = await import(clean)
  let bad = 0, n = 0
  for (const scene of scenes) {
    const raw = JSON.parse(readFileSync(join(BAKED, scene, 'shape.json'), 'utf8'))
    const tiles = Array.isArray(raw) ? raw : (raw.tiles || [])
    const d = JSON.parse(readFileSync(join(LOOKS, scene, 'design.json'), 'utf8'))
    for (const st of tiles) {
      globalThis.__declineFate = []           // armed
      const a = JSON.stringify(sectionPassTile(st, d.curbWidth, STRIP_MAT, d.blockCustoms || null))
      globalThis.__declineFate = null         // disarmed
      const b = JSON.stringify(pure(st, d.curbWidth, STRIP_MAT, d.blockCustoms || null))
      n++; if (a !== b) bad++
    }
  }
  console.log(bad ? `⛔ THE PROBE IS NOT INERT — ${bad} of ${n} tiles differ. Every number it produces is suspect.`
                  : `✅ probe is INERT — ${n} tiles, FILL output byte-identical armed and disarmed.`)
  process.exit(bad ? 1 : 0)
}

// ── measure ─────────────────────────────────────────────────────────────────
console.log('\nDECLINE FATE — of every corner the takeover DECLINES, does it leave a HOLE or a MISPAINT?\n')
console.log('⛔ HOLE     the released wedge is unclaimed → paints as land use. A green notch.')
console.log('⚠️ MISPAINT the legs claimed the wedge. Ribbon continuous, MATERIAL wrong. Looks fine.\n')
console.log(`(a corner counts as HOLE when >${(HOLE_TOL * 100).toFixed(0)}% of its local band went to land use)\n`)

const table = []
for (const scene of scenes) {
  const raw = JSON.parse(readFileSync(join(BAKED, scene, 'shape.json'), 'utf8'))
  const tiles = Array.isArray(raw) ? raw : (raw.tiles || [])
  const dp = join(LOOKS, scene, 'design.json')
  if (!existsSync(dp)) { console.log(`⛔ ${scene} NOT CHECKED — no design.json; the authored state cannot be loaded.\n`); continue }
  const design = JSON.parse(readFileSync(dp, 'utf8'))
  const cw = design.curbWidth
  if (!Number.isFinite(cw)) { console.log(`⛔ ${scene} NOT CHECKED — design.json has no numeric curbWidth.\n`); continue }
  let slots = 0
  for (const s in (design.blockCustoms || {})) for (const sd in design.blockCustoms[s]) slots += Object.keys(design.blockCustoms[s][sd]).length

  const byMode = new Map()
  const holes = []
  const offT = []
  for (const [ti, st] of tiles.entries()) {
    cornerDump.rows.length = 0
    globalThis.__declineFate = []
    let ok = true
    try { sectionPassTile(st, cw, STRIP_MAT, design.blockCustoms || null) } catch (e) { ok = false }
    const fate = new Map(globalThis.__declineFate.map(r => [r.k, r]))
    globalThis.__declineFate = null
    if (!ok) { // ⛔ never a skip
      const m = byMode.get('PROBE-ERROR') || { hole: 0, mispaint: 0, unknown: 0 }
      m.unknown++; byMode.set('PROBE-ERROR', m); cornerDump.rows.length = 0; continue
    }
    for (const r of cornerDump.rows) {
      if (BUILT.has(r.reason)) continue
      const f = fate.get(r.k)
      const m = byMode.get(r.reason) || { hole: 0, mispaint: 0, noband: 0, offband: 0, unknown: 0 }
      // ⭐ THE THIRD CLASS, found by following RULE 2's loud unmeasurables (2026-08-08):
      // on a tile with NO ped cross-section at all — TLmax+SWmax = 0, so
      // `fullBand = iC − iW` is EMPTY — there is no ribbon for the corner to take
      // over. Declining there is CORRECT BEHAVIOUR, not a defect of any kind, and
      // counting it as one inflates A10 with blocks that have no sidewalk.
      if (!f) m.unknown++
      else if (!f.tileBandRings || !(Math.abs(f.tileBand) > 0)) m.noband++
      else if (!(Math.abs(f.band) > 0)) { m.offband++; offT.push(f.T) }   // tile HAS a band, this corner is nowhere near it
      else if (Math.abs(f.unclaimed) / Math.abs(f.band) > HOLE_TOL) {
        m.hole++
        holes.push({ tile: ti, k: r.k, reason: r.reason, share: Math.abs(f.unclaimed) / Math.abs(f.band), m2: Math.abs(f.unclaimed), skel: r.skel || [] })
      } else m.mispaint++
      byMode.set(r.reason, m)
    }
    cornerDump.rows.length = 0
  }

  const K = ['hole', 'mispaint', 'noband', 'offband', 'unknown']
  const tot = [...byMode.values()].reduce((a, m) => { for (const k of K) a[k] += m[k]; return a }, Object.fromEntries(K.map(k => [k, 0])))
  const declines = K.reduce((s, k) => s + tot[k], 0)
  table.push({ scene, ...tot, declines, slots })

  console.log(`── ${scene} ──  ${tiles.length} tiles · ${slots} authored override slot(s)` +
              (slots ? '' : '  ⚠️ none authored — this is the bare-defaults map, not a clean bill'))
  if (offT.length) console.log(`   [off-band T: zero=${offT.filter(t=>!(t>0)).length} nonzero=${offT.filter(t=>t>0).length}]`)
  console.log(`   declines ${declines}   ⛔ HOLE ${tot.hole}   ⚠️ MISPAINT ${tot.mispaint}   · NO-BAND ${tot.noband}` +
              (tot.offband ? `   ⛔ OFF-BAND ${tot.offband}` : '') + (tot.unknown ? `   ⛔ UNCLASSIFIED ${tot.unknown}` : ''))
  for (const [mode, m] of [...byMode].sort((a, b) => (b[1].hole + b[1].mispaint) - (a[1].hole + a[1].mispaint))) {
    console.log(`      ${mode.padEnd(34)} hole ${String(m.hole).padStart(4)}   mispaint ${String(m.mispaint).padStart(4)}   no-band ${String(m.noband).padStart(4)}` +
                (m.offband ? `   off-band ${m.offband}` : '') + (m.unknown ? `   unclassified ${m.unknown}` : ''))
  }
  if (ROWS) for (const x of holes.sort((a, b) => b.m2 - a.m2).slice(0, 25))
    console.log(`      ⛔ tile ${String(x.tile).padStart(4)}  ${x.reason.padEnd(30)} ${(100 * x.share).toFixed(0).padStart(3)}% of local band · ${x.m2.toFixed(1)} m²  ${x.skel.join(' + ')}`)
  console.log('')
}

console.log('══ HOW MUCH OF THE DECLINE COUNT IS ACTUALLY A HOLE? ══\n')
const w = Math.max(...table.map(t => t.scene.length), 12)
console.log('scene'.padEnd(w) + '  declines  NO-BAND    HOLE  MISPAINT   real defects   authoring')
for (const t of table) {
  const real = t.hole + t.mispaint
  console.log(`${t.scene.padEnd(w)}  ${String(t.declines).padStart(8)}  ${String(t.noband).padStart(7)}  ${String(t.hole).padStart(6)}  ${String(t.mispaint).padStart(8)}  ` +
              `${String(real).padStart(13)}   ${t.slots ? `${t.slots} slot(s)` : 'none authored'}`)
}
console.log('\n⭐ NO-BAND is not a defect: the tile carries no ped cross-section, so there is no ribbon to take over.')
console.log('   It is the bulk of the raw decline count. Sizing A10 off that count sizes it off blocks with no sidewalk.')

const unk = table.reduce((s, t) => s + t.unknown + t.offband, 0)
if (unk) console.log(`\n⛔ ${unk} decline(s) could not be classified (no local band, or the tile threw) — their own class, never folded into a magnitude.`)
console.log(`\n⚠️  MISPAINT is not "fine" — it is doctrine §6.9.1 violated quietly. It is a SEPARATE ticket from A10's hole,`)
console.log(`   and sizing the cure off the combined decline count sizes it off two different defects.`)
process.exit(unk ? 1 : 0)
