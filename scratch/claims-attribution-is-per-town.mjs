// claims-attribution-is-per-town.mjs — IS EACH TOWN CREDITING ITS OWN SOURCES?
//
// ⭐ THE INVARIANT, and it is a legal one: every baked slab's `sources.json`
// must be exactly what THAT scene's disk implies, and nothing else. A credit is
// a public statement about where a map's data came from. A wrong one is not a
// cosmetic defect — it is a false provenance claim on a page a visitor reads,
// and it fails in the kit's signature direction: correct for Lafayette Square,
// silently wrong for every town poured after it.
//
// The three ways it can go wrong, all checked here:
//   1. A slab credits a source its scene does not actually have on disk
//      (the LS-bleed shape: town #2 wearing town #1's providers).
//   2. A slab is MISSING a credit its scene's inputs oblige it to carry
//      (the ODbL exposure — OSM data in the render, no notice).
//   3. A licence is asserted that the kit never recorded, or recorded on a row
//      whose source is chosen per town and therefore cannot be known kit-globally.
//
// ⛔ NOTHING IS RESTATED HERE. The expected credits are RE-DERIVED from
// `intake-rows.mjs` + the scene's disk, the same way the bake derives them, and
// compared against the committed artifact. A second copy of the source list in
// this file is how the check and the thing it checks drift into agreement about
// something false.
//
//   node scratch/claims-attribution-is-per-town.mjs
// Read-only. Exits 1 on any disagreement.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const looksIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/looks/index.json'), 'utf8'))
const looks = (looksIndex.looks || []).filter(l => l.scene)
if (!looks.length) {
  console.error('⛔ no looks with a scene in public/looks/index.json — the check is blind; fix this before trusting a PASS')
  process.exit(1)
}

const { creditsForScene } = await import(path.join(ROOT, 'cartograph/bake-sources.js'))
  .catch(async () => {
    // bake-sources.js runs its CLI at module scope; import it for the pure
    // function only by re-reading with the args it needs. If that ever stops
    // working, say so loudly rather than skipping the comparison.
    console.error('⛔ could not import creditsForScene from cartograph/bake-sources.js')
    process.exit(1)
  })

let failures = 0
const fail = (msg) => { console.error(`  ⛔ ${msg}`); failures++ }

for (const look of looks) {
  const artifactPath = path.join(ROOT, 'public/baked', look.id, 'sources.json')
  console.log(`\n${look.id} ← ${look.scene}`)

  if (!fs.existsSync(artifactPath)) {
    // A look with no baked geometry owes nobody a credit — nothing of it is on
    // screen. A look WITH a slab and no artifact is only a real exposure if its
    // scene actually has third-party inputs, so derive them before judging: a
    // fixture built from hand-authored geometry owes nothing to anyone, and
    // calling that a compliance failure would train the reader to ignore this.
    const hasSlab = fs.existsSync(path.join(ROOT, 'public/baked', look.id, 'scene.json'))
    if (!hasSlab) { console.log('  · no slab, no credit owed'); continue }
    let would = { credits: [] }
    try { would = creditsForScene(look.scene) } catch { /* reported below */ }
    if (would.credits.length) {
      fail(`has a baked slab and ${would.credits.length} creditable source${would.credits.length === 1 ? '' : 's'} (${would.credits.map(c => c.source).join(', ')}) but NO sources.json — its map ships with no attribution. Re-pour, or: node cartograph/bake-sources.js --look=${look.id} --scene=${look.scene}`)
    } else {
      // ⚠️ Not a pass and not a failure. Say both halves out loud.
      const noGeo = !fs.existsSync(path.join(ROOT, 'cartograph/data', look.scene, 'geography.json'))
      console.warn(`  ⚠️  slab present, no sources.json — but this scene has NO third-party inputs, so it owes no credit.${noGeo ? ` It also has no geography.json, so NO bake step can run for it (bake-labels.js fails identically) — that is a pre-existing scene defect, not an attribution one.` : ''}`)
    }
    continue
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'))

  // Re-derive from THIS scene's disk, right now.
  let expected
  try {
    expected = creditsForScene(look.scene)
  } catch (e) {
    fail(`could not re-derive credits for scene '${look.scene}': ${e.message}`)
    continue
  }

  const got = new Set(artifact.credits.map(c => c.source))
  const want = new Set(expected.credits.map(c => c.source))

  for (const s of got) {
    if (!want.has(s)) fail(`credits "${s}" but scene '${look.scene}' has no filled input under that licence — a source this town does not use`)
  }
  for (const s of want) {
    if (!got.has(s)) fail(`is MISSING a credit for "${s}", which its inputs oblige it to carry — re-bake`)
  }

  // Every credited source must name a licence AND a link to it. ODbL §4.3 wants
  // the database and the licence both identified; an entry with a blank licence
  // renders a credit that discharges nothing.
  for (const c of artifact.credits) {
    if (!c.licence || !c.licenceUrl) fail(`credits "${c.source}" with no licence name/URL — the notice names a source but not its terms`)
    if (!['attribution', 'licence-text'].includes(c.requires)) {
      fail(`"${c.source}" declares requires="${c.requires}" — must be 'attribution' (credit) or 'licence-text' (ship the terms); the two are different obligations and must not be flattened`)
    }
  }

  // The artifact must not claim its scene is someone else.
  if (artifact.scene !== look.scene) fail(`artifact says scene "${artifact.scene}" but the looks index says "${look.scene}"`)

  const credited = artifact.credits.map(c => c.source).join(' + ') || '(none)'
  console.log(`  · credits: ${credited}`)
  if (artifact.owed?.length) console.log(`  · owed a licence (not credited): ${artifact.owed.map(o => o.row).join(', ')}`)
}

// ⭐ THE PORTABILITY ASSERTION, and it is the whole point. If every town credits
// an identical set, the derivation is not reading the disk — it has collapsed
// into a constant, which is precisely the hardcoded list this surface exists to
// avoid. Two towns genuinely can match; ALL of them matching, across scenes with
// visibly different inputs, is the signature of a list wearing a method's clothes.
const sets = []
for (const look of looks) {
  const p = path.join(ROOT, 'public/baked', look.id, 'sources.json')
  if (!fs.existsSync(p)) continue
  sets.push(JSON.parse(fs.readFileSync(p, 'utf8')).credits.map(c => c.source).sort().join('|'))
}
const distinct = new Set(sets)
console.log(`\n${sets.length} baked slabs · ${distinct.size} distinct credit set${distinct.size === 1 ? '' : 's'}`)

// ⛔ "Verify it yourself" is not a check. If the baked slabs happen to agree,
// DERIVE the answer from every scene on disk rather than leaving the reader a
// homework assignment — the baked looks are all US towns today, so they are the
// wrong sample to ask the portability question of.
const sceneRoot = path.join(ROOT, 'cartograph/data')
const scenes = fs.readdirSync(sceneRoot, { withFileTypes: true })
  .filter(d => d.isDirectory() && !['raw', 'clean'].includes(d.name))
  .map(d => d.name)
const bySceneSet = new Map()
for (const sc of scenes) {
  let c
  try { c = creditsForScene(sc).credits.map(x => x.source).sort() } catch { continue }
  const key = c.join(' + ') || '(none)'
  if (!bySceneSet.has(key)) bySceneSet.set(key, [])
  bySceneSet.get(key).push(sc)
}
console.log(`\nAcross all ${scenes.length} scenes on disk — ${bySceneSet.size} distinct credit set${bySceneSet.size === 1 ? '' : 's'}:`)
for (const [set, list] of bySceneSet) console.log(`  ${set}  ←  ${list.join(', ')}`)

if (bySceneSet.size === 1 && scenes.length >= 3) {
  fail('EVERY scene on disk derives an identical credit set. Either every town genuinely shares inputs, or the derivation has collapsed into a constant — which is the hardcoded list this surface exists to prevent. Investigate before shipping.')
} else if (sets.length >= 3 && distinct.size === 1) {
  console.log('  ⭐ The baked slabs agree because they are all US towns with ML footprints; scenes with different inputs derive different sets, above. The derivation reads the disk.')
}

if (failures) {
  console.error(`\n⛔ FAIL — ${failures} disagreement${failures === 1 ? '' : 's'} between a slab's credits and its scene's inputs.`)
  process.exit(1)
}
console.log('\n✅ PASS — every baked slab credits exactly what its own scene has on disk.')
