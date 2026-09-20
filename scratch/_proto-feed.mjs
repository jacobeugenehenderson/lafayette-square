// ⛔⛔ THE ONE WAY A PROBE BUILDS ①②③. Import this; never hand-roll the call.
//
// WHY. Seven ①②③ probes each wrote their own `buildTileGround(rb, { grout: 'proto' })` and
// every one of them omitted `blockCustoms` — authoring OFF. `claims-proto-stack-disjoint.mjs`'s
// header even asserted the opposite. That is `ROADMAP A05` reproduced in the new stack, and it
// is invisible in the town you would use to prove the stack works: measured, LS's 22 authored
// streets move the treelawn 3.3% and the curb 21,142 m²; HPDM's 6 move 0.002%.
// ⭐ Seven copies of a call is why one correction cannot hold. One feed, imported — the same
// rule `_substrate-feed.mjs` was written to enforce for the substrate probes.
//
// ⛔ Look → scene comes from `public/looks/index.json`, NEVER the directory name. `A11`: three
// towns carry Lafayette Square's `blockCustoms` because a Look was seeded from LS's, so which
// design file belongs to a scene is a question with a wrong answer available.
// ⛔ NO FALLBACK: a scene with no ribbons or no design file is reported and SKIPPED LOUDLY. It
// never silently borrows another town's.
import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'

// ⛔ ONE OWNER — `checks/_scenes.mjs`. Re-exported here so the 27 forensics that import
//    `ribbonsPath` from this feed keep working; the definition lives in exactly one file.
export { ribbonsPath, ribbonScenes as feedScenes } from '../checks/_scenes.mjs'
import { ribbonsPath } from '../checks/_scenes.mjs'

export const lookFor = (scene) => {
  const idx = JSON.parse(fs.readFileSync('public/looks/index.json', 'utf8'))
  const ls = (idx.looks || []).filter(l => l.scene === scene)
  if (!ls.length) return null
  return (ls.find(l => l.id === scene) || ls[0]).id      // prefer the same-named Look
}

// ⛔ THE CHILLERED GATE IS GONE (2026-09-19), because its two subjects are. It was defended as a
//    named status rather than a skip list, and with real subjects that held. What it could not
//    survive was being COPIED: the same two names were typed into six more files, and three of
//    those copies had grown `altadena`, a live declared town, which then reported "CHILLERED — no
//    number is printed for it" instead of being measured. ⭐ The lesson is the one `_scenes.mjs`
//    already learned at 45 files' expense: a town leaves scope by leaving the look manifest, and
//    a name typed into a source file is a skip list however loudly it announces itself.

// Returns null and prints why — the caller must treat that as a FAILURE, not an empty result.
export function feed(scene) {
  const rp = ribbonsPath(scene)
  if (!fs.existsSync(rp)) { console.log(`⛔ ${scene}: no ribbons at ${rp} — SKIPPED LOUDLY, this scene was NOT checked`); return null }
  const look = lookFor(scene)
  const dp = look && `public/looks/${look}/design.json`
  if (!dp || !fs.existsSync(dp)) { console.log(`⛔ ${scene}: no design.json for look '${look}' — SKIPPED LOUDLY, this scene was NOT checked`); return null }
  const design = JSON.parse(fs.readFileSync(dp, 'utf8'))
  return {
    scene, look,
    ribbons: JSON.parse(fs.readFileSync(rp, 'utf8')),
    blockCustoms: design.blockCustoms || null,
    // ⛔ NO DEFAULT. The curb width is AUTHORED (Jacob, 2026-09-06) — it is a per-Look value in
    // `design.json`, and every downstream distance depends on it: the ped setback, and whether two
    // curbs TOUCH, which is what severs a block. Substituting 0.381 for a scene that authored
    // something else would measure a different map and say nothing — Layer 0 q2. A scene with no
    // authored curb width is a real state; it must be reported, not filled in.
    curbWidth: Number.isFinite(design.curbWidth) ? design.curbWidth
      : (console.log(`⛔ ${scene}: design.json carries NO curbWidth — NOT substituting one; this scene cannot be measured for anything curb-relative`), null),
    slots: Object.values(design.blockCustoms || {}).reduce((n, sides) =>
      n + Object.values(sides || {}).reduce((m, ords) => m + Object.keys(ords || {}).length, 0), 0),
  }
}

// ⭐ `bare: true` is the DELIBERATE un-authored state, for a dual-state gate that reports which
// state produced each row (`A03`'s harness pattern, `A05`'s prescription). It is the only
// legitimate way to reach `blockCustoms: null`, and it has to be asked for by name.
export function buildProto(f, { bare = false, quiet = true, ...rest } = {}) {
  const prev = console.log
  if (quiet) console.log = () => {}
  try {
    return buildTileGround(f.ribbons, {
      grout: 'proto', smooth: 0, curbWidth: f.curbWidth,
      blockCustoms: bare ? null : f.blockCustoms, ...rest,
    })
  } finally { console.log = prev }
}
