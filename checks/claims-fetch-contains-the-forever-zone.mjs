#!/usr/bin/env node
// ⛔⛔ DOES THE HARD FETCH ACTUALLY CONTAIN THE DISC + ITS FOREVER ZONE, ON EVERY SIDE?
//
// WHY. Jacob's eye, 2026-09-06: "the rest of the streets show around the disc, just these on
// the N side." Measured on LS: the raw fetch's north edge is 907 m from origin and the disc
// radius is 892 — 15 m of margin, against 200–900 m on the other sides. Nothing downstream
// trimmed it (derived ribbons reach FURTHER north than raw), so the defect is upstream of the
// clip, the caps and ① alike: THERE IS NO DATA THERE TO DRAW.
//
// ⭐ THE CLASS, AND WHY THIS IS A CHECK AND NOT AN LS PATCH. `EXTENT-DESIGN §3.3` /
// [[project_extent_disc_centroid_radius_bb_model]]: bb = radius + ~20–25%, the "forever
// safety zone", sized so the operator may move the centroid and grow the radius FOREVER with
// no re-pour. A fetch that does not contain that zone has already spent the operator's future
// edits, and it does so SILENTLY — the map just quietly has less town on one side, which is
// invisible unless you happen to look at that side. `pipeline.js:150` records the same
// sentence about the clip: "The forever zone was not forever."
//
// ⛔ NO FALLBACK: a scene with no boundary or no centerlines is named LOUDLY and skipped; it
// is never scored as passing. ⛔ Measured on the RAW fetch, which is what the freeze bought —
// not on derived ribbons, which can reach further than their input and would mask the hole.
// ⛔ The margin is reported PER SIDE. A pooled bb area or a mean radius hides a one-sided
// hole, which is precisely the shape of the live defect.
// ▶ node checks/claims-fetch-contains-the-forever-zone.mjs [scene ...]
import fs from 'fs'

const ZONE = 0.20                       // the FLOOR of the ~20–25% forever zone; failing this is unambiguous
// ⛔ Scenes come from the Look index, NEVER the directory name (`A11`) — a bare readdir names
// `raw/` and `clean/` as scenes and prints two real towns as skips.
const scenes = process.argv.slice(2)
if (!scenes.length) scenes.push(...new Set(JSON.parse(fs.readFileSync('public/looks/index.json', 'utf8')).looks.map(l => l.scene)))

// ⭐ WHICH INPUT, AND IT IS STAMPED ON EVERY ROW. The subject is the HARD FETCH — what the
// freeze bought. Only LS keeps `raw/centerlines.json`; the others keep `clean/ribbons.json`.
// ⛔ That is NOT a silent fallback: measured on LS, the derived ribbons reach FURTHER than
// their raw input on every side (north -945 vs -907), so `clean` is a strictly LENIENT proxy.
// A scene that FAILS on `clean` fails a fortiori on its fetch; a scene that PASSES on `clean`
// has NOT been cleared, and the row says so. The substitution is named, never assumed away.
const inputFor = (base) => {
  for (const [rel, kind, strict] of [['raw/centerlines.json', 'raw fetch', true], ['clean/ribbons.json', 'derived (LENIENT proxy)', false]])
    if (fs.existsSync(`${base}/${rel}`)) return { path: `${base}/${rel}`, kind, strict }
  return null
}

let failed = false
for (const scene of scenes) {
  const base = `cartograph/data/${scene}`
  const nbP = `${base}/neighborhood_boundary.json`
  if (!fs.existsSync(nbP)) { console.log(`⛔ ${scene}: no neighborhood_boundary.json — SKIPPED LOUDLY, NOT checked`); failed = true; continue }
  const inp = inputFor(base)
  if (!inp) { console.log(`⛔ ${scene}: no centerline or ribbon input — SKIPPED LOUDLY, NOT checked`); failed = true; continue }
  const nb = JSON.parse(fs.readFileSync(nbP, 'utf8'))
  const R = nb.radius, cx = nb.center?.x ?? 0, cz = nb.center?.z ?? 0
  if (!Number.isFinite(R)) { console.log(`⛔ ${scene}: boundary carries no radius — NOT checked`); failed = true; continue }
  const raw = JSON.parse(fs.readFileSync(inp.path, 'utf8'))
  const streets = Array.isArray(raw) ? raw : (raw.streets || Object.values(raw).find(Array.isArray) || [])
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, n = 0
  for (const s of streets) for (const p of (s.points || [])) {
    if (!Number.isFinite(p?.[0]) || !Number.isFinite(p?.[1])) continue
    x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); n++
  }
  if (!n) { console.log(`⛔ ${scene}: ${inp.path} carries no points — NOT checked`); failed = true; continue }

  const need = R * (1 + ZONE)
  // screen convention: -z is north (verified against the disc/frame comparison this check was written for)
  const sides = [['north', cz - z0], ['south', z1 - cz], ['west', cx - x0], ['east', x1 - cx]]
  console.log(`\n${'='.repeat(70)}\n${scene} — disc R ${R.toFixed(0)} m at (${cx.toFixed(0)}, ${cz.toFixed(0)}); forever zone needs ${need.toFixed(0)} m per side`)
  console.log(`   input: ${inp.path}  —  ${inp.kind}`)
  console.log(`   ${'side'.padEnd(8)} ${'fetched'.padStart(9)} ${'× R'.padStart(7)} ${'vs zone'.padStart(10)}`)
  let bad = 0
  for (const [name, d] of sides) {
    const short = need - d
    const mark = d < R ? '  ⛔⛔ INSIDE THE DISC — the rim itself is unfetched here'
      : short > 0 ? `  ⛔ ${short.toFixed(0)} m short of the forever zone` : ''
    if (short > 0) bad++
    console.log(`   ${name.padEnd(8)} ${d.toFixed(0).padStart(9)} ${(d / R).toFixed(2).padStart(7)} ${(short > 0 ? '-' + short.toFixed(0) : '+' + (-short).toFixed(0)).padStart(10)}${mark}`)
  }
  if (bad) { console.log(`   ⛔ ${bad} of 4 sides do not hold the forever zone. The operator cannot grow or move here without a re-pour, and the shortfall is SILENT on screen.`); failed = true }
  else if (inp.strict) console.log('   ✅ all four sides hold the disc + the forever zone.')
  else { console.log('   ⚠️ all four sides pass ON THE LENIENT PROXY — this scene is NOT cleared. Its hard fetch was not measured, because it is not in the repo.'); }
}

console.log(`\n${failed ? '⛔ FAIL' : '✅ PASS'} — re-run this; do not quote its digits.`)
process.exit(failed ? 1 : 0)
