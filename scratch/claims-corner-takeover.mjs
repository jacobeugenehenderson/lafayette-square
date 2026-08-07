#!/usr/bin/env node
/**
 * "WHERE DOES THE CORNER RIBBON'S TAKEOVER DECLINE?" — A10 / D1, the population.
 *
 * WHY THIS EXISTS (2026-08-07). Corner doctrine 4 (AASHTO/ADA, settled
 * 2026-05-18 — `_archive/RIBBONS-history-2026-06-12.md §6.9`) says:
 *   "Both legs stop at tA/tB; the corner ribbon takes over; legs resume."
 * ⭐ The doctrine does NOT say "if a fillet can be found." In `sectionPassTile`
 * the STEP-OVER is unconditional (`legTrim` pulls the legs back for every corner
 * that bids) but the STEP-BACK is gated three ways. When a gate declines, the
 * band the legs released is claimed by nobody, falls through to `luRemainder`
 * and RENDERS AS LAND USE — so the defect is a MISLABEL, not a hole (SECTION §7),
 * and no area/coverage measure can see it. The only way to observe it is to ask
 * the construction itself, at the gate.
 *
 * WHAT IT COUNTS — one row per corner that BID (an entry landed in `cornerT`):
 *   ✅ BUILT                  — the pad was built and carries concrete.
 *   ⚠️ built-empty-concrete   — pad built, but all of it went to the inner LU
 *                               ring: a takeover honoured in name only. Its own
 *                               row, never folded into BUILT.
 *   ⛔ tile-gate:*            — `bandRem.length && cornerT.size && fillets.length`
 *                               (tileGround.js:1566). Whole tile declines at once.
 *   ⛔ zero-depth             — `c.T <= 1e-6` (:1569).
 *   ⛔ no-fillet-in-range     — nearest fillet apex farther than
 *                               `best.r + c.trim + 1` (:1575). The sharp-corner
 *                               skip — but it is a DISTANCE test, not a test of
 *                               whether the corner is sharp.
 *   ⛔ empty-pad              — a FOURTH decline the three named gates miss
 *                               (:1583): sector ∩ band came back empty.
 *   ⛔ PROBE-ERROR            — the tile threw. Loud, never a silent pass.
 *
 * ⚠️ DUAL-STATE, always (CLAUDE.md Layer 0 q3): once with the scene's authored
 * `blockCustoms` loaded and once with bare defaults. The override IS the product;
 * a measurement taken with authoring off is measuring a different map, and it is
 * wrong in the kit's signature shape — worst on the most authored town. Every row
 * records which state produced it. Scenes whose look carries ZERO override slots
 * are reported as such: for them the two states are the same map by construction,
 * and an identical result there is NOT evidence that authoring is irrelevant.
 *
 * ⭐ THE HEADLINE IS THE CROSS-TOWN TABLE, not the LS count. LS is mid-range on
 * every distribution measured so far (carved producer share 7%→75%, LS 42%), so a
 * decline MODE present in another town and absent from LS is exactly what a
 * kit-level probe exists to catch — it is invisible on the mould.
 *
 * ⛔ Read-only. Reads `public/baked/<scene>/shape.json` + `public/looks/<scene>/
 *    design.json`. Writes nothing. Runs `sectionPassTile` — the REAL construction
 *    — under `CORNER_DUMP=1`, the existing corner debug channel (README "Corners"
 *    row). Nothing here re-derives the gates.
 *
 * Usage:
 *   node scratch/claims-corner-takeover.mjs                  # every baked scene
 *   node scratch/claims-corner-takeover.mjs lafayette-square # one scene
 *   node scratch/claims-corner-takeover.mjs --rows           # dump every row
 */
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'

process.env.CORNER_DUMP = '1'          // must precede the import — the flag is read at module init
const ROOT = new URL('..', import.meta.url).pathname
const { sectionPassTile, cornerDump } = await import(join(ROOT, 'src/lib/tileGround.js'))

if (!cornerDump?.on) {
  console.error('⛔ CORNER_DUMP is not armed — tileGround.js did not pick up the flag. Nothing measured.')
  process.exit(2)
}

const BAKED = join(ROOT, 'public/baked')
const LOOKS = join(ROOT, 'public/looks')
const STRIP_MAT = { outer: 'LU', inner: 'SW' }   // sectionOpen's default

// Every reason the dump can emit. Declared here so a reason the probe has never
// seen still gets a column — an unclassified row is a loud failure, not a gap.
const BUILT = ['BUILT', 'built-empty-concrete']
const DECLINES = ['tile-gate:bandRem-empty', 'tile-gate:no-fillets', 'tile-gate:bandRem-empty+no-fillets',
                  'zero-depth', 'no-fillet-in-range', 'empty-pad', 'PROBE-ERROR']

const readScene = (scene) => {
  const raw = JSON.parse(readFileSync(join(BAKED, scene, 'shape.json'), 'utf8'))
  const tiles = Array.isArray(raw) ? raw : (raw.tiles || [])   // toy freezes a bare array
  const look = join(LOOKS, scene, 'design.json')
  const design = existsSync(look) ? JSON.parse(readFileSync(look, 'utf8')) : null
  // An override slot is only ever READ if its key matches a frozen run's
  // identity: sectionPassTile does `blockCustoms[run.skelId][run.side][run.segOrd]`
  // and nothing else. A slot that matches no run in THIS bake is dead — the
  // authored state is then vacuous, and "authored == defaults" says nothing
  // about authoring. Count both, always print both.
  const ids = new Set()
  for (const t of tiles) for (const r of (t.runs || [])) ids.add(`${r.skelId}|${r.side}|${r.segOrd}`)
  let slots = 0, readable = 0
  const bc = design?.blockCustoms || {}
  const deadStreets = new Set()
  for (const s in bc) for (const side in bc[s]) for (const so in bc[s][side]) {
    slots++
    if (ids.has(`${s}|${side}|${so}`)) readable++; else deadStreets.add(s)
  }
  return { tiles, design, customs: design?.blockCustoms || null, customSlots: slots, readable, deadStreets: [...deadStreets] }
}

const measure = (tiles, cw, blockCustoms) => {
  const rows = []
  const fill = []          // cheap FILL fingerprint — proves the state reached the construction
  for (const [ti, st] of tiles.entries()) {
    cornerDump.rows.length = 0
    try {
      const r = sectionPassTile(st, cw, STRIP_MAT, blockCustoms)
      fill.push(JSON.stringify(r.Wacc).length, Object.keys(r.tlByLu).length, Object.keys(r.luByLu).length)
    } catch (err) {
      rows.push({ tile: ti, reason: 'PROBE-ERROR', skel: [], p: null, err: String(err?.message || err) })
      continue
    }
    for (const r of cornerDump.rows) rows.push({ ...r, tile: ti })
    cornerDump.rows.length = 0
  }
  return { rows, fill: fill.join(',') }
}

const tally = (rows) => {
  const t = {}
  for (const r of rows) t[r.reason] = (t[r.reason] || 0) + 1
  return t
}

// ── run ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const showRows = argv.includes('--rows')
const only = argv.find(a => !a.startsWith('--'))
const scenes = (only ? [only] : readdirSync(BAKED))
  .filter(s => existsSync(join(BAKED, s, 'shape.json')))
  .sort()

if (!scenes.length) {
  console.error(`⛔ no baked shape.json found${only ? ` for scene "${only}"` : ''} — nothing to check.`)
  process.exit(2)
}

console.log('CORNER TAKEOVER — of every corner that BIDS, where is the pad declined?\n')
console.log('Doctrine §6.9.4: both legs stop at tA/tB, the corner ribbon takes over.')
console.log('Step over is unconditional; step back is gated. These are the gates.\n')

const table = []          // one entry per (scene, state) that was actually measured
const notChecked = []

for (const scene of scenes) {
  let sc
  try { sc = readScene(scene) } catch (e) {
    notChecked.push({ scene, why: `shape.json unreadable — ${e.message}` }); continue
  }
  if (!sc.tiles.length) { notChecked.push({ scene, why: `shape.json carries 0 tiles` }); continue }
  if (!sc.design) { notChecked.push({ scene, why: `no public/looks/${scene}/design.json — the AUTHORED state cannot be loaded` }); continue }
  const cw = sc.design.curbWidth
  if (!Number.isFinite(cw)) { notChecked.push({ scene, why: `design.json has no numeric curbWidth` }); continue }

  console.log(`── ${scene} ──  ${sc.tiles.length} tiles · cw=${cw} · ${sc.customSlots} authored override slot(s), ${sc.readable} readable by this bake`)
  if (!sc.customSlots) {
    console.log(`   ⚠️  ZERO authored overrides: 'authored' and 'defaults' are the SAME MAP here.`)
    console.log(`      An identical result on this scene is not evidence about authoring.`)
  } else if (!sc.readable) {
    console.log(`   ⛔ ALL ${sc.customSlots} override slots key to runs this bake does not contain — the`)
    console.log(`      authored state is DEAD, never read. Streets: ${sc.deadStreets.slice(0, 6).join(', ')}${sc.deadStreets.length > 6 ? ' …' : ''}`)
  } else if (sc.readable < sc.customSlots) {
    console.log(`   ⚠️  ${sc.customSlots - sc.readable} of ${sc.customSlots} override slots key to runs this bake does not contain (never read).`)
  }

  const fillByState = {}
  for (const [state, blockCustoms] of [['authored', sc.customs], ['defaults', null]]) {
    const { rows, fill } = measure(sc.tiles, cw, blockCustoms)
    fillByState[state] = fill
    const t = tally(rows)
    const bid = rows.length
    const built = BUILT.reduce((s, k) => s + (t[k] || 0), 0)
    const declined = bid - built
    const unknown = Object.keys(t).filter(k => !BUILT.includes(k) && !DECLINES.includes(k))
    table.push({ scene, state, bid, built, declined, t, customSlots: sc.customSlots })

    console.log(`   ${state.padEnd(8)} bids ${String(bid).padStart(5)} · pads built ${String(t.BUILT || 0).padStart(5)}` +
                ` · declined ${String(declined).padStart(5)} (${bid ? (100 * declined / bid).toFixed(1) : '0.0'}%)`)
    const parts = [...BUILT.slice(1), ...DECLINES].filter(k => t[k]).map(k => `${k}=${t[k]}`)
    if (parts.length) console.log(`            ${parts.join('  ')}`)
    if (unknown.length) console.log(`            ⛔ UNCLASSIFIED reason(s): ${unknown.join(', ')} — the probe does not know this gate.`)
    if (t['PROBE-ERROR']) {
      const e = rows.find(r => r.reason === 'PROBE-ERROR')
      console.log(`            ⛔ tile threw: ${e.err}`)
    }
    if (showRows) for (const r of rows) {
      if (BUILT.includes(r.reason)) continue
      console.log(`      tile ${String(r.tile).padStart(4)}  ${r.reason.padEnd(28)}` +
                  `${r.p ? `(${r.p[0].toFixed(1)}, ${r.p[1].toFixed(1)})` : '—'}  T=${r.T?.toFixed?.(2) ?? '—'} legs=${r.legs ?? '—'}  ${(r.skel || []).join(' + ')}`)
    }
  }
  // ⭐ The state-sensitivity verdict. Without it, "authored == defaults" reads as
  // "authoring does not move the corners" — when the true cause may be that the
  // authored state never reached the construction at all.
  const moved = fillByState.authored !== fillByState.defaults
  for (const r of table) if (r.scene === scene) { r.moved = moved; r.readable = sc.readable }
  if (sc.customSlots && moved) console.log(`   ✅ the authored state DID move this scene's FILL — the two rows above are a real comparison.`)
  else if (sc.customSlots) console.log(`   ⚠️  the authored state did NOT move this scene's FILL at all (overrides carry no Section field, or are dead) — the comparison above is VACUOUS.`)
  console.log()
}

for (const n of notChecked) {
  console.log(`⚠️  ${n.scene} — NOT CHECKED: ${n.why}`)
  console.log(`     Read nothing into its absence; re-bake or author the look first.\n`)
}

// ── the cross-town table — the headline ────────────────────────────────────
const REASONS = [...BUILT.slice(1), ...DECLINES]
const seen = REASONS.filter(r => table.some(row => row.t[r]))
const w = Math.max(...table.map(r => r.scene.length + r.state.length + 3), 18)

console.log('\n══ CROSS-TOWN DECLINE DISTRIBUTION ══')
console.log('⭐ The headline is this table, not the LS count. A mode present in another')
console.log('   town and absent from LS is invisible on the mould the kit was cast around.\n')
const SHORT = { 'tile-gate:bandRem-empty': 'gate:band', 'tile-gate:no-fillets': 'gate:fill',
                'tile-gate:bandRem-empty+no-fillets': 'gate:both', 'no-fillet-in-range': 'noFillet',
                'empty-pad': 'emptyPad', 'built-empty-concrete': 'noConcrete', 'PROBE-ERROR': 'THREW' }
const col = (r) => SHORT[r] || r
console.log('scene/state'.padEnd(w) + '  bids  built  decl%  ' + seen.map(r => col(r).padStart(11)).join('') + '   authoring')
for (const r of table) {
  console.log(`${(r.scene + ' / ' + r.state).padEnd(w)}  ${String(r.bid).padStart(4)}  ${String(r.built).padStart(5)}` +
    `  ${(r.bid ? (100 * r.declined / r.bid).toFixed(1) : '0.0').padStart(5)}  ` +
    seen.map(k => String(r.t[k] || 0).padStart(11)).join('') +
    `   ${!r.customSlots ? 'none authored' : r.moved ? 'LIVE' : `INERT (${r.readable}/${r.customSlots} readable)`}`)
}
console.log('\nEach decline as a share of that scene\'s bids — the shape, not the size:')
console.log('scene'.padEnd(w) + '  ' + seen.map(r => col(r).padStart(11)).join(''))
for (const r of table.filter(x => x.state === 'authored')) {
  console.log(`${r.scene.padEnd(w)}  ` + seen.map(k => (r.bid ? (100 * (r.t[k] || 0) / r.bid).toFixed(1) + '%' : '—').padStart(11)).join(''))
}

// A gate that never fires anywhere is either dead or subsumed by an earlier one.
// Either way the cure must not assume it is load-bearing.
const never = DECLINES.filter(r => !table.some(row => row.t[r]))
if (never.length) {
  const bids = table.filter(r => r.state === 'authored').reduce((s, r) => s + r.bid, 0)
  console.log(`\n⚠️  gate(s) that declined ZERO corners across all ${table.length / 2} scene(s) / ${bids} bids: ${never.join(', ')}`)
  console.log(`   Dead or subsumed by an earlier gate — do not treat as load-bearing.`)
}

// ── the direct yes/no ──────────────────────────────────────────────────────
const modesOf = (scene) => new Set(table.filter(r => r.scene === scene).flatMap(r => Object.keys(r.t).filter(k => !BUILT.includes(k) && r.t[k])))
const towns = [...new Set(table.map(r => r.scene))]
const LS = 'lafayette-square'
console.log('\n══ DOES ANY TOWN CARRY A DECLINE MODE LAFAYETTE SQUARE LACKS? ══')
if (!towns.includes(LS)) {
  console.log('⚠️  UNANSWERABLE — lafayette-square was not measured in this run.')
} else {
  const lsModes = modesOf(LS)
  console.log(`   LS declines by: ${[...lsModes].join(', ') || '(none — LS declines nowhere)'}`)
  let anyUnique = false
  for (const town of towns) {
    if (town === LS) continue
    const extra = [...modesOf(town)].filter(m => !lsModes.has(m))
    if (extra.length) {
      anyUnique = true
      console.log(`   ⭐ YES — ${town} carries ${extra.length} mode(s) LS does not: ${extra.join(', ')}`)
      for (const m of extra) {
        const rows = table.filter(r => r.scene === town && r.t[m])
        console.log(`        ${m}: ${rows.map(r => `${r.state}=${r.t[m]}`).join(' · ')}`)
      }
    }
  }
  if (!anyUnique) console.log('   NO — every decline mode seen in another town also fires on LS.')
  const lsOnly = [...lsModes].filter(m => towns.every(t => t === LS || !modesOf(t).has(m)))
  if (lsOnly.length) console.log(`   (LS-only mode(s), for symmetry: ${lsOnly.join(', ')})`)
}

// A run that measured nothing is not a pass.
const totalBids = table.reduce((s, r) => s + r.bid, 0)
const errored = table.some(r => r.t['PROBE-ERROR']) || table.some(r => Object.keys(r.t).some(k => !BUILT.includes(k) && !DECLINES.includes(k)))
console.log(errored ? '\n⛔ FAIL — at least one corner could not be classified, or a tile threw.'
  : totalBids ? '\n✅ every corner that bid was classified; the population above is complete.'
              : '\n⛔ FAIL — 0 corner bids across every scene. Nothing was measured; do not read this as clean.')
process.exit(errored || !totalBids ? 1 : 0)
