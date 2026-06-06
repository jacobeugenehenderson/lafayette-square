// repair-carriageway-measures.js — one-shot D1 data re-derive (Gunter, 2026-06-05).
//
// Re-derives every divided carriageway's overlay measure into the
// anchor='inner-edge' model: outer side carries the carriageway width,
// median-facing (inboard) side pavementHW 0. NO value is hand-edited —
// every change is a deterministic rule over the existing data:
//
//   1. RECLAIM — outer pavementHW <= 0 with inboard > 0 is an impossible
//      road (zero-width carriageway): the width datum is misfiled on the
//      median key because a skeleton weld reversed the chain's point order
//      under the point-order-relative left/right keys (commit 5348fbc did
//      this to lafayette-avenue-6 — the "parcel touches the centerline"
//      defect). Swap the two side sections back; the now-inboard leftover
//      is definitionally junk → zeroed.
//   2. RESIDUE-ZERO — migrate-overlay.js broadcast one name-keyed corridor
//      measure verbatim onto every chain of that name, carriageways
//      included. A corridor half-width on a carriageway's median side
//      floods the gap with asphalt (42/44 LS carriageways). Detection: a
//      side section value-identical to the same data on ≥1 OTHER entry of
//      the same name is broadcast residue, not authoring (operator drags
//      produce unique floats). Residue on the INBOARD side → zeroed.
//      Residue on the OUTER side is kept — it is the only width datum the
//      entry has; the operator refines it with the existing Survey tools.
//   3. Anything else (unique authored values with a real outer width —
//      e.g. Truman's per-chain sections) passes through untouched, and is
//      listed in the audit for the eye pass.
//
// Sides are resolved through ribbons.json's innerSign (recomputed from
// current geometry every bake: +1 → inboard 'right', -1 → 'left' — the
// measure-RIGHT is the (-dz,dx) perp; matches tileGround.isMedianFacing).
//
// Run:   node cartograph/repair-carriageway-measures.js [--root <repoRoot>] [--dry-run]
// Reads: <root>/cartograph/data/<scene>/clean/overlay.json (+ <root>/src/data/ribbons.json)
// Writes: overlay.json in place, after a timestamped backup (the
//         migrate-overlay.js pattern).

import { readFileSync, writeFileSync, copyFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const argv = process.argv.slice(2)
const dryRun = argv.includes('--dry-run')
const rootIdx = argv.indexOf('--root')
const ROOT = rootIdx >= 0 ? argv[rootIdx + 1] : join(dirname(fileURLToPath(import.meta.url)), '..')
const SCENE = process.env.SCENE || 'lafayette-square'

const OVERLAY_PATH = join(ROOT, 'cartograph', 'data', SCENE, 'clean', 'overlay.json')
const RIBBONS_PATH = join(ROOT, 'src', 'data', 'ribbons.json')

const overlay = JSON.parse(readFileSync(OVERLAY_PATH, 'utf-8'))
const ribbons = JSON.parse(readFileSync(RIBBONS_PATH, 'utf-8'))

const entries = overlay.streets || {}
const carriageways = (ribbons.streets || []).filter(s => s.anchor === 'inner-edge' && s.innerSign)

// Residue census: per name, count value-identical pavementHW per side KEY
// across all of that name's overlay entries (spines included — they hold the
// broadcast primary). Per-FIELD, not whole-side: the broadcast pav float is
// verbatim even where the operator later edited the same side's ped fields
// (lafayette-avenue-5's inboard: broadcast pav 10.555… with an edited
// treelawn — whole-side equality misses it and the median stays flooded).
// Exact float equality is the detector: operator drags produce unique floats;
// only a copy repeats one.
const censusByName = new Map() // name → Map('left|<pav>' → count)
for (const [id, e] of Object.entries(entries)) {
  if (!e?.name || !e.measure) continue
  if (!censusByName.has(e.name)) censusByName.set(e.name, new Map())
  const c = censusByName.get(e.name)
  for (const side of ['left', 'right']) {
    const k = `${side}|${e.measure[side]?.pavementHW ?? null}`
    c.set(k, (c.get(k) || 0) + 1)
  }
}
const isResidue = (name, sideName, side) =>
  (censusByName.get(name)?.get(`${sideName}|${side?.pavementHW ?? null}`) || 0) >= 2

const ZERO_SIDE = { pavementHW: 0, treelawn: 0, sidewalk: 0, terminal: 'none' }
const fmt = (s) => s ? `{pav:${(+s.pavementHW || 0).toFixed(2)} tl:${(+s.treelawn || 0).toFixed(2)} sw:${(+s.sidewalk || 0).toFixed(2)}}` : '—'

let changed = 0
const survivors = []
console.log(`Scene ${SCENE} — ${carriageways.length} inner-edge carriageways, ${Object.keys(entries).length} overlay entries${dryRun ? '  [DRY RUN]' : ''}\n`)

for (const cw of carriageways) {
  const e = entries[cw.skelId]
  if (!e?.measure?.left || !e?.measure?.right) continue
  const inbKey = cw.innerSign === +1 ? 'right' : 'left'
  const outKey = inbKey === 'left' ? 'right' : 'left'
  const m = e.measure
  let inb = m[inbKey], out = m[outKey]
  const before = `inb=${fmt(inb)} out=${fmt(out)}`
  const flags = []

  // 1. reclaim a misfiled width
  if (!(out?.pavementHW > 0) && inb?.pavementHW > 0) {
    const t = out; out = inb; inb = t
    inb = { ...ZERO_SIDE }            // post-swap inboard leftover = junk
    flags.push('RECLAIM')
  }
  // 2. broadcast residue on the inboard side → zero
  else if (inb?.pavementHW > 0 && isResidue(e.name, inbKey, inb)) {
    inb = { ...ZERO_SIDE }
    flags.push('RESIDUE-ZERO')
  }

  if (inb?.pavementHW > 0) survivors.push(`${cw.skelId} inboard ${fmt(inb)} (authored — kept)`)

  const next = { ...m, symmetric: false, [inbKey]: inb, [outKey]: out }

  // segmentMeasures: same reclaim per segment (overlay-only → authored;
  // residue rule applies only when the segment side matches the chain's
  // pre-repair residue exactly — same census).
  let nextSm = e.segmentMeasures
  if (e.segmentMeasures) {
    nextSm = {}
    for (const k of Object.keys(e.segmentMeasures)) {
      const sm = e.segmentMeasures[k]
      let sInb = sm?.[inbKey], sOut = sm?.[outKey]
      if (!(sOut?.pavementHW > 0) && sInb?.pavementHW > 0) {
        const t = sOut; sOut = sInb; sInb = t
        sInb = { ...ZERO_SIDE }
        flags.push(`RECLAIM(seg ${k})`)
      } else if (sInb?.pavementHW > 0 && isResidue(e.name, inbKey, sInb)) {
        sInb = { ...ZERO_SIDE }
        flags.push(`RESIDUE-ZERO(seg ${k})`)
      }
      nextSm[k] = { ...sm, symmetric: false, [inbKey]: sInb, [outKey]: sOut }
    }
  }

  const after = `inb=${fmt(inb)} out=${fmt(out)}`
  const did = before !== after || JSON.stringify(nextSm) !== JSON.stringify(e.segmentMeasures)
  if (did) {
    changed++
    if (!dryRun) {
      e.measure = next
      if (nextSm) e.segmentMeasures = nextSm
    }
  }
  console.log(`${cw.skelId.padEnd(40)} ${cw.phase?.role || ''}  ${before}  →  ${after}  ${flags.join(' ') || (did ? 'sym-stamp' : 'unchanged')}`)
}

console.log(`\n${changed} carriageway entries re-derived.`)
if (survivors.length) {
  console.log(`\nInboard pavement > 0 survivors (authored, kept — verify on the live eye):`)
  for (const s of survivors) console.log('  ' + s)
}

if (!dryRun) {
  const backup = OVERLAY_PATH + `.backup-${Date.now()}`
  copyFileSync(OVERLAY_PATH, backup)
  writeFileSync(OVERLAY_PATH, JSON.stringify(overlay, null, 2))
  console.log(`\nBackup: ${backup}`)
  console.log(`Wrote:  ${OVERLAY_PATH}`)
} else {
  console.log('\nDry run — nothing written.')
}
