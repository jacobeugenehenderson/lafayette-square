/**
 * RENAMING A CHASSIS MUST NOT REPAINT THE TREE.
 *
 * A composition's RNG seed drives which cell of a leaf pack the canopy samples. If the
 * seed is keyed on the chassis IDENTITY, then renaming a chassis — an act that moves no
 * geometry and is explicitly declared as provenance-preserving — silently re-rolls the
 * appearance of every composition that uses it.
 *
 * ⛔ THE DEFECT THIS EXISTS FOR (Jacob's eye, 2026-08-26). The 2026-08-25 rename to forms
 * (`white_oak_a` → `rounded_06`, 154 chassis) did exactly that. White Oak moved off the
 * one green cell of the four-cell `eastern_black_oak` pack onto a red one and shipped
 * autumn leaves in August. The rename was three days and a hundred commits away from the
 * symptom, and nothing connected them.
 *
 * ⭐ THIS RUNS THE REAL GENERATOR — it does not restate the seed formula. Two
 * compositions that differ ONLY in the chassis name, resolving to the SAME GLB on disk,
 * must emit identical leaf UVs. A check that copied the formula could not catch the
 * formula drifting.
 *
 *   node scratch/claims-a-rename-cannot-repaint.mjs
 */
import { readdirSync, existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { generateSingleCompositionGLB, resolveChassisPath, DEFAULTS } from '../arborist/generate-salon.js'

const ROOT = path.join(import.meta.dirname, '..')
const STATE = path.join(ROOT, 'arborist/state')
const PART_INDEX = path.join(ROOT, 'arborist/state/part-index.json')

// generateSingleCompositionGLB returns the GLB bytes. Byte-identity is the strongest
// statement available and needs no interpretation: same asset, same knobs, same tree.
const digest = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16)

let fail = 0

// ── 1. Identity and provenance must resolve to the SAME asset ──────────────────
// This is what makes an asset-keyed seed rename-invariant, and it is a fact about the
// library on disk, not about the seed. Read it, don't assume it.
const parts = JSON.parse(readFileSync(PART_INDEX, 'utf8')).parts || []
let renamed = 0, diverged = 0
for (const p of parts) {
  if (!p.partId || !p.derivedFrom) continue
  let byId, byProv
  try { byId = path.basename(resolveChassisPath(p.partId), '.glb') } catch { continue }
  try { byProv = path.basename(resolveChassisPath(p.derivedFrom), '.glb') } catch { continue }
  renamed++
  if (byId !== byProv) {
    diverged++; fail++
    console.log(`⛔ "${p.partId}" resolves to ${byId} but its derivedFrom "${p.derivedFrom}" resolves to ${byProv}`)
  }
}
console.log(`renamed chassis whose identity and provenance resolve to one asset: ${renamed - diverged}/${renamed}`)

// ── 2. THE BEHAVIOURAL TEST — run the real generator twice ─────────────────────
// Every composition in the library whose chassis was renamed: emit it under its CURRENT
// identity and under its PROVENANCE name. Same asset, same bark, same pack ⇒ the bytes
// that decide appearance must not move.
const byId = new Map(parts.filter(p => p.partId).map(p => [p.partId, p]))
let tested = 0
for (const sp of readdirSync(STATE).sort()) {
  const f = path.join(STATE, sp, 'compositions.json')
  if (!existsSync(f)) continue
  for (const c of (JSON.parse(readFileSync(f, 'utf8')).compositions || [])) {
    const prov = c.derivedFrom || byId.get(c.chassis)?.derivedFrom
    if (!prov || prov === c.chassis) continue
    let asset, provAsset
    try { asset = resolveChassisPath(c.chassis); provAsset = resolveChassisPath(prov) } catch { continue }
    if (asset !== provAsset) continue     // genuinely different geometry — not a rename
    const bark = { ...DEFAULTS.bark, ...(c.bark || {}) }
    const leaves = { ...DEFAULTS.leaves, ...(c.leaves || {}) }
    const a = digest(await generateSingleCompositionGLB({ chassis: c.chassis, bark, leaves, lod: 2 }))
    const b = digest(await generateSingleCompositionGLB({ chassis: prov, bark, leaves, lod: 2 }))
    tested++
    if (a !== b) {
      fail++
      console.log(`⛔ ${sp} slot ${c.slot}: renaming "${prov}" → "${c.chassis}" REPAINTED the tree`)
      console.log(`   as "${c.chassis}": sha ${a}`)
      console.log(`   as "${prov}":      sha ${b}`)
    }
  }
}
console.log(`compositions emitted under both names, byte-stable: ${tested - fail}/${tested}`)

if (fail) {
  console.log(`\n⛔ FAIL — a rename moved a tree's appearance. The composition seed is keyed on`)
  console.log(`   the chassis IDENTITY; it must be keyed on the resolved ASSET, which a rename`)
  console.log(`   does not move (generate-salon#compositionSeed, and its call site).`)
  process.exit(1)
}
console.log('✅ PASS — a rename cannot repaint a tree.')
