/**
 * EVERY PLACEMENT THE GROUND SHADOWS MUST RENDER A TREE.
 *
 * The ground's baked FX map stamps a contact-shadow ring (G channel,
 * `ground.poolmap.png` — `groundColorState.js:22`) for EVERY placement in
 * `trees.json`, unconditionally, at bake time. Trees hydrate at runtime. When the
 * two disagree the operator sees rings on bare ground — "circles without trees, we
 * are not hydrating fully" (Jacob, 2026-08-27), which is the same tell
 * `ARCHITECTURE.md §Tree-render reality at LS` records for HPDM: "bare ground with
 * shadow-spots where trees should be."
 *
 * ⛔ THE CLASS. `heroFoundationEnabled` is `!!heroImpostorRecords && …`. A look whose
 * atlas carries NO `heroImpostorBySpecies` boots foundation-OFF, which hands the
 * render to the legacy prominence path, where `heroTier === 'cull'` DROPS placements.
 * That branch is legitimate and documented — the cull is retired "in foundation mode"
 * only. What is NOT legitimate is that it is SILENT: `heroCulled` is reported in an
 * info-level `console.log` among fifteen other fields, while its two lesser siblings
 * (`meshNoRecord`, `legacyRoles`) each get their own ⛔ warn. A town nobody has opened
 * can drop four trees in five and still render a plausible map.
 *
 * ⭐ WHY THIS IS THE CHECK. It needs no species list, no threshold, and no operator who
 * has already looked at the street. It joins two artifacts every pour writes and asserts
 * that what the ground shadows, the runtime renders. It PINS the runtime predicate it
 * models, so it fails loudly when the rule moves instead of testing a stale copy of it.
 *
 * ⛔ An authored `scene.heroImpostor === false` is the OPERATOR'S DECISION, never a
 * defect (CLAUDE.md Layer 0 Q3) — reported as AUTHORED and never failed.
 *
 *   node scratch/claims-every-shadowed-placement-renders.mjs [look ...]
 */
import { readdirSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..')
const BAKED = path.join(ROOT, 'public/baked')
const SRC = path.join(ROOT, 'src/components/InstancedTrees.jsx')

const read = (p) => JSON.parse(readFileSync(p, 'utf8'))
let failed = 0

// ── PIN THE RUNTIME PREDICATE ────────────────────────────────────────────────
// This check models two lines of InstancedTrees.jsx. If either moves, the model is
// stale and every verdict below is worthless — so say so and refuse, rather than
// printing green off a rule that no longer exists.
const src = readFileSync(SRC, 'utf8')
const PINS = [
  { what: 'the foundation gate', re: /heroFoundationEnabled\s*=\s*!!heroImpostorRecords\s*&&\s*scene\?\.heroImpostor\s*!==\s*false/ },
  { what: 'the legacy cull',     re: /if\s*\(\s*inst\.heroTier\s*===\s*'cull'\s*\)\s*\{[^}]*return/ },
  { what: 'the record source',   re: /heroImpostorRecords\s*=\s*useMemo\(\s*\(\)\s*=>\s*atlas\?\.manifest\?\.heroImpostorBySpecies/ },
]
const drifted = PINS.filter(p => !p.re.test(src))
if (drifted.length) {
  console.error(`⛔ PIN DRIFT — this check models InstancedTrees.jsx and the source has moved:`)
  for (const d of drifted) console.error(`     · ${d.what} no longer matches`)
  console.error(`   Re-read ${path.relative(ROOT, SRC)} and update the pins before trusting any verdict below.`)
  process.exit(2)
}

// ── THE JOIN ─────────────────────────────────────────────────────────────────
const looks = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(BAKED).filter(d => existsSync(path.join(BAKED, d, 'trees.json')))

console.log(`Every placement the ground shadows must render a tree — ${looks.length} look(s)\n`)

for (const look of looks) {
  const dir = path.join(BAKED, look)
  const treesPath = path.join(dir, 'trees.json')
  if (!existsSync(treesPath)) { console.log(`  ${look.padEnd(24)} — no trees.json, nothing placed`); continue }

  const trees = read(treesPath)
  const instances = trees.instances || []
  if (!instances.length) { console.log(`  ${look.padEnd(24)} — 0 placements`); continue }

  const atlasPath = path.join(dir, 'trees-atlas.json')
  const atlas = existsSync(atlasPath) ? read(atlasPath) : {}
  const scenePath = path.join(dir, 'scene.json')
  const scene = existsSync(scenePath) ? read(scenePath) : {}

  const hasRecords = !!atlas.heroImpostorBySpecies && Object.keys(atlas.heroImpostorBySpecies).length > 0
  const authoredOff = scene.heroImpostor === false
  const foundationOn = hasRecords && !authoredOff

  const culled = instances.filter(i => i.heroTier === 'cull').length
  const pct = (100 * culled / instances.length).toFixed(1)

  if (foundationOn) {
    console.log(`  ✅ ${look.padEnd(24)} foundation ON (${Object.keys(atlas.heroImpostorBySpecies).length} species) — ` +
      `cull retired; ${instances.length} placements, ${instances.length} rendered`)
    continue
  }
  if (authoredOff) {
    console.log(`  ➖ ${look.padEnd(24)} AUTHORED foundation-off (scene.heroImpostor === false) — ` +
      `the operator's decision; ${culled}/${instances.length} culled by design`)
    continue
  }
  if (culled === 0) {
    console.log(`  ✅ ${look.padEnd(24)} foundation off, but nothing is stamped 'cull' — all ${instances.length} render`)
    continue
  }

  failed++
  console.error(
    `  ⛔ ${look.padEnd(24)} FOUNDATION OFF and CULLING — ${culled} of ${instances.length} placements (${pct}%) ` +
    `never render, and the ground carries a contact-shadow ring for all ${instances.length}.\n` +
    `       cause: this look's trees-atlas.json carries NO 'heroImpostorBySpecies', so heroFoundationEnabled is false\n` +
    `              and the render falls to the legacy prominence path, where heroTier==='cull' drops the placement.\n` +
    `       tell:  circles on bare ground where trees should be.\n` +
    `       fix:   shoot this look's hero impostors in the Grove (browser-GPU; the CLI bake cannot reproduce them),\n` +
    `              then confirm 'heroImpostorBySpecies' is carried by bake-look. Never widen the cull.`
  )
}

console.log()
if (failed) {
  console.error(`⛔ ${failed} look(s) drop placements the ground already shadows.`)
  process.exit(1)
}
console.log(`✅ every look renders what its ground shadows.`)
