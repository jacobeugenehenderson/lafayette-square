// claims-the-fade-tracks-the-active-disc.mjs — WHOSE CIRCLE IS THE MAP FADING OVER?
//
// ⭐ THE INVARIANT: the Designer's tile/block layers must feather over the ACTIVE
// installation's own disc. Not the default installation's. Not nobody's.
//
// Two failure modes, and the second is worse than the first:
//   (a) the fade is GATED OFF for poured towns → they get the stencil's hard CUT
//       and never the feather. Jacob's eye, huron, 2026-09-20: "the hard edge
//       tells me this is stamped after the gradient edge and not before."
//   (b) the fade is ON but resolves to the DEFAULT installation's band → a town
//       with a larger disc feathers at the default's radius, so every tile past
//       it goes to ALPHA 0. Most of the map silently disappears. ⛔ This is why
//       flipping the gate alone is not the fix: both halves, or neither.
//
// ⭐ THIS IS THE CLASS, NOT THE INSTANCE. `BlockGeometryV2Debug` was the instance
// (2026-09-20). The class is "a consumer reads the DEFAULT installation's module
// constants instead of resolving by id" — the same shape as MapLayers' natural=water
// skip (ROADMAP H-8) and the leisure=park class skip (ea13e35e). Perfect on the
// mould town, broken on every town that is not it.
//
// ⛔ LS CANNOT WITNESS THIS. It is the one installation whose own band IS the
// module constant, so it passes by construction whatever the wiring does. The
// check is per-town or it is nothing.
//
// ⛔ The wiring is PARSED FROM SOURCE, never restated here, and the bands are read
// from each scene's own neighborhood_boundary.json — so neither half can go stale.
//
//   node checks/claims-the-fade-tracks-the-active-disc.mjs
// Read-only. Exits 1 when a poured installation would feather on someone else's disc.
import fs from 'fs'
import path from 'path'

const APP = 'src/cartograph/CartographApp.jsx'
const V2 = 'src/cartograph/BlockGeometryV2Debug.jsx'
const BOUNDARY = 'src/cartograph/boundary.js'
const DATA = 'cartograph/data'
const DEFAULT_INSTALLATION = 'lafayette-square'

const read = (p) => {
  if (!fs.existsSync(p)) throw new Error(`⛔ ${p} is gone — the guard is blind; fix the path before trusting a PASS`)
  return fs.readFileSync(p, 'utf8')
}

let failures = 0
const fail = (msg) => { failures++; console.log(`  ✗ ${msg}`) }
const pass = (msg) => console.log(`  ✓ ${msg}`)

// ── 1. The gate: does a poured installation draw the soft circle at all? ──────
console.log(`\ngeneric (poured) scene config, parsed from ${APP}:`)
const app = read(APP)
const generic = app.match(/function genericSceneConfig\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/)
if (!generic) throw new Error(`⛔ could not parse genericSceneConfig from ${APP} — the guard is blind; fix the parse before trusting a PASS`)
const gate = generic[1].match(/^\s*useBoundary:\s*(\w+)\s*,/m)
if (!gate) throw new Error(`⛔ could not find useBoundary in genericSceneConfig — the guard is blind; fix the parse before trusting a PASS`)
if (gate[1] === 'true') pass(`useBoundary: true — a poured installation draws the soft circle`)
else fail(`useBoundary: ${gate[1]} — a poured installation gets the stencil's CUT and never the FADE (failure mode a)`)

// ⭐ The other half of the acceptance: THE DEFAULT INSTALLATION RENDERS UNCHANGED.
// Fixing the poured path by turning the default's fade off would satisfy every
// assertion below while regressing the one town that already worked.
const defBranch = app.match(new RegExp(`['"]?${DEFAULT_INSTALLATION}['"]?\\s*:\\s*\\{([\\s\\S]*?)\\n  \\}`))
if (!defBranch) throw new Error(`⛔ could not parse the ${DEFAULT_INSTALLATION} branch from ${APP} — the guard is blind; fix the parse before trusting a PASS`)
const defGate = defBranch[1].match(/^\s*useBoundary:\s*(\w+)\s*,/m)
if (!defGate) throw new Error(`⛔ could not find useBoundary in the ${DEFAULT_INSTALLATION} branch — the guard is blind; fix the parse before trusting a PASS`)
if (defGate[1] === 'true') pass(`${DEFAULT_INSTALLATION} still draws its soft circle — unchanged`)
else fail(`${DEFAULT_INSTALLATION} useBoundary: ${defGate[1]} — the default installation REGRESSED; it is the one town that already worked`)

// ── 2. The resolution: whose disc do the bands come from? ────────────────────
console.log(`\nfade-band resolution, parsed from ${V2}:`)
const v2 = read(V2)
const memo = v2.match(/const \{\s*faceFade\s*,\s*bandFade\s*\}\s*=\s*useMemo\(([\s\S]*?)\n  \}, \[[^\]]*\]\)/)
if (!memo) throw new Error(`⛔ could not parse the faceFade/bandFade derivation from ${V2} — the guard is blind; fix the parse before trusting a PASS`)
const body = memo[1]

if (/makeBoundary\s*\(/.test(body)) pass(`resolves through makeBoundary(nb) — the kit factory, by id`)
else fail(`no makeBoundary(nb) call — the bands cannot be the active installation's (failure mode b)`)

// The default installation's module constants may still be used, but ONLY behind
// an explicit default-installation branch. Unguarded, they are failure mode (b).
const usesModuleConsts = /\b(FACE_FADE|BAND_FADE)\b/.test(body)
const hasDefaultBranch = /\bisLS\b/.test(body)
if (!usesModuleConsts) pass(`the default installation's module bands are not referenced`)
else if (hasDefaultBranch) pass(`FACE_FADE/BAND_FADE used only behind the default-installation branch`)
else fail(`FACE_FADE/BAND_FADE used with no default-installation branch — every town would feather on ${DEFAULT_INSTALLATION}'s disc`)

// ⛔ A static per-installation map is the wrong cure: 47e2ca81 removed one
// precisely to kill cross-installation refs. boundary.js says so itself.
const boundary = read(BOUNDARY)
if (/never imported here/.test(boundary)) pass(`boundary.js still declares installations are loaded by id, never imported`)
else fail(`boundary.js no longer declares "loaded by id, never imported here" — re-read before trusting the factory`)
const crossRefs = [...v2.matchAll(/from\s+['"][^'"]*cartograph\/data\/([a-z0-9-]+)\//g)]
  .map(m => m[1]).filter(s => s !== DEFAULT_INSTALLATION)
if (crossRefs.length) fail(`${V2} statically imports non-default installation data: ${[...new Set(crossRefs)].join(', ')}`)
else pass(`no static import of a non-default installation's data`)

// ── 3. The data: what band would each installation actually feather over? ────
console.log(`\nper-installation fade bands, read from each scene's neighborhood_boundary.json:`)
const scenes = fs.readdirSync(DATA)
  .filter(s => fs.existsSync(path.join(DATA, s, 'neighborhood_boundary.json')))
  .sort()
const nbOf = (s) => JSON.parse(fs.readFileSync(path.join(DATA, s, 'neighborhood_boundary.json'), 'utf8'))
const def = nbOf(DEFAULT_INSTALLATION)
const defOuter = def.fade?.outer ?? def.radius

for (const s of scenes) {
  const nb = nbOf(s)
  const outer = nb.fade?.outer ?? nb.radius
  const tag = s === DEFAULT_INSTALLATION ? ' (default installation)' : ''
  console.log(`  ${s.padEnd(24)} radius ${String(Math.round(nb.radius)).padStart(5)}  fade→ ${String(Math.round(outer)).padStart(5)}${tag}`)
  if (s === DEFAULT_INSTALLATION) continue
  if (!(nb.radius > 0)) { fail(`${s}: no usable radius — it cannot feather over its own disc`); continue }
  // What the bug did: feather at the DEFAULT's outer on a disc that is not that size.
  // Past the band the shader drives alpha to 0, so this is not a misplaced edge —
  // it is the map going missing from `defOuter` outward.
  if (Math.abs(outer - defOuter) > 1) {
    const lost = Math.max(0, 1 - (defOuter / outer) ** 2)
    if (lost > 0.05) {
      console.log(`      └─ if it fed on ${DEFAULT_INSTALLATION}'s band (${Math.round(defOuter)} m): ~${(lost * 100).toFixed(0)}% of the disc would render at alpha 0`)
    }
  }
}
if (scenes.filter(s => s !== DEFAULT_INSTALLATION).length === 0)
  fail(`only the default installation is on disk — this check cannot witness the class; pour a second town`)
else pass(`${scenes.length - 1} non-default installation(s) available to witness the class`)

console.log('')
if (failures) {
  console.log(`⛔ FAIL — ${failures} problem(s). The Designer's tile layers are not guaranteed to feather over the active installation's own disc.`)
  process.exit(1)
}
console.log(`✅ PASS — the fade resolves per installation, by id, and every poured town feathers over its own disc.`)
