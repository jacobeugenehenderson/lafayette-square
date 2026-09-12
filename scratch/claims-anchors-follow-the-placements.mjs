#!/usr/bin/env node
/**
 * claims-anchors-follow-the-placements.mjs
 *
 * `tree-anchors.json` is index-parallel to `trees.json`, and the runtime's gate is
 * ALL-OR-NOTHING: one wrong `placementKey` discards EVERY anchor and the whole town's
 * canopy drops off the drawn ground onto the smooth terrain field, announced by a
 * console line and nothing else (`InstancedTrees.jsx`). A plausible-looking map — the
 * outcome `CLAUDE.md` Layer 0 q2 names as worse than a failure.
 *
 * Two ways that happens, so this check has two halves:
 *
 *   A. THE POUR'S STEP ORDER — anchors are sampled off `ground.bin` AND indexed by
 *      `trees.json`, so the step is downstream of both. It sat immediately after
 *      `bake-ground`, ~130 lines above the step that WRITES `trees.json`, so every pour
 *      anchored the PREVIOUS census: a one-pour lag that self-healed on the next pour
 *      and NEVER healed under `?force=1`. (Measured on LS 2026-09-08: 5,144 anchors
 *      against 5,099 placements. Fixed the same day.)
 *
 *   B. THE SHIPPED SLABS — every baked scene's anchors must actually key to its own
 *      placements. This is the town-#2 half: it runs over whatever is on disk, so a
 *      town nobody has looked at is checked by the same command.
 *
 * ⭐ Both halves READ the source rather than restating it — the order comes out of
 * serve.js, the key out of the artifacts — so this cannot go stale the way a number in
 * a doc does (`CLAUDE.md` "PRUNE AS YOU GO" rule 1).
 *
 *   node scratch/claims-anchors-follow-the-placements.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
let failed = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
const ok  = (m) => console.log(`  ✅ ${m}`)

// ── A. The pour's step order, read out of serve.js ──────────────────────────
console.log('\nA. Bake-chain order (cartograph/serve.js)')
{
  const src = readFileSync(join(REPO, 'cartograph', 'serve.js'), 'utf8')
  const steps = [...src.matchAll(/runIfDirty\(\s*'([\w-]+)'/g)].map(m => m[1])
  const at = (name) => steps.indexOf(name)
  const need = ['ground', 'trees', 'tree-anchors', 'ground-ao']
  const missing = need.filter(n => at(n) < 0)
  if (missing.length) {
    bad(`serve.js has no runIfDirty step named ${missing.join(', ')} — the chain was renamed or removed; this check needs updating with it`)
  } else {
    console.log(`     order: ${steps.join(' → ')}`)
    // Anchors sample ground.bin …
    at('tree-anchors') > at('ground')
      ? ok("'tree-anchors' runs after 'ground' (it samples that mesh)")
      : bad("'tree-anchors' runs BEFORE 'ground' — anchors would be sampled off the previous ground mesh")
    // … and are indexed by trees.json. THIS is the half that was wrong.
    at('tree-anchors') > at('trees')
      ? ok("'tree-anchors' runs after 'trees' (it is index-parallel to that file)")
      : bad("'tree-anchors' runs BEFORE 'trees' — every pour anchors the PREVIOUS census, " +
            "and under ?force=1 it never catches up. Move the step below the tree bake.")
    at('ground-ao') > at('trees')
      ? ok("'ground-ao' runs after 'trees' (it burns their contact shadows)")
      : bad("'ground-ao' runs BEFORE 'trees' — shadows would be burnt for the previous canopy")
  }
}

// ── B. Every baked slab on disk ─────────────────────────────────────────────
console.log('\nB. Shipped slabs — do the anchors key to their own placements?')
{
  const bakedDir = join(REPO, 'public', 'baked')
  const scenes = existsSync(bakedDir)
    ? readdirSync(bakedDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort()
    : []
  if (!scenes.length) bad(`no scenes under ${bakedDir}`)
  for (const scene of scenes) {
    const tPath = join(bakedDir, scene, 'trees.json')
    const aPath = join(bakedDir, scene, 'tree-anchors.json')
    if (!existsSync(tPath)) { console.log(`  ·  ${scene}: no trees.json — honest zero, skipped`); continue }
    const trees = JSON.parse(readFileSync(tPath, 'utf8')).instances || []
    if (!existsSync(aPath)) {
      bad(`${scene}: ${trees.length} placements but NO tree-anchors.json — every trunk seats on the smooth field`)
      continue
    }
    const doc = JSON.parse(readFileSync(aPath, 'utf8'))
    // The runtime's own key, recomputed here — same FNV-1a over the placement
    // coordinates in order (`bake-tree-anchors.js` / `InstancedTrees.jsx`).
    let h = 2166136261 >>> 0
    for (const t of trees) {
      const k = `${t.x.toFixed(3)},${t.z.toFixed(3)}`
      for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
    }
    const key = h.toString(16).padStart(8, '0')
    const anchors = doc.anchors || []
    if (!doc.placementKey) {
      bad(`${scene}: tree-anchors.json has no placementKey (v1) — the runtime falls back to the length ` +
          `gate, which cannot see a reordered re-pour. Re-bake: node cartograph/bake-tree-anchors.js --look=${scene} --scene=${scene}`)
    } else if (doc.placementKey !== key) {
      bad(`${scene}: placementKey ${doc.placementKey} ≠ ${key} (${anchors.length} anchors vs ${trees.length} placements) — ` +
          `ALL anchors discarded at runtime; the whole canopy floats. ` +
          `Re-bake: node cartograph/bake-tree-anchors.js --look=${scene} --scene=${scene}`)
    } else if (anchors.length !== trees.length) {
      bad(`${scene}: placementKey matches but ${anchors.length} anchors vs ${trees.length} placements — the key is lying`)
    } else {
      ok(`${scene}: ${trees.length} placements, key ${key}`)
    }
  }
}

console.log(failed ? `\n⛔ ${failed} failure(s)\n` : '\n✅ anchors follow the placements\n')
process.exit(failed ? 1 : 0)
