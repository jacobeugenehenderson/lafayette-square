#!/usr/bin/env node
/**
 * "CAN THE OPERATOR PICK A HERO THAT ISN'T THERE?" — A11/A00, the authoring-UI surface.
 *
 * WHY THIS EXISTS (2026-09-19, agent Kiln, found retiring EXTENT-DESIGN §6 step 4's
 * name-imports). `SurveyorPanel` built its hero-subject list from a static
 * `import … from '../data/landmarks.json'` — Lafayette Square's 87 businesses,
 * offered as the hero subject of EVERY town. Square One Brewery, in Huron.
 * §2.1 is exactly this: that file is at once "the shared default" and "LS's own data".
 *
 * ⭐ AND THE SAME LINE CARRIED A SECOND, WIDER BUG. The option emitted the LISTING's
 * id (`lmk-001`), but `heroSubject.js` resolves `landmark` through `slabIndex.byId`,
 * and that Map is built from `manifest.buildings` — `bldg-NNNN` / `msbf-N`
 * (`SlabBuildings.jsx`). It has never held an `lmk-*`. So every landmark hero
 * resolved to `FALLBACK_HERO_SUBJECT = [400,45,-100]` — LS's hero target — in every
 * town INCLUDING LS. A picker that silently frames the wrong thing is Layer 0 q2:
 * the operator sees a camera move and never learns it aimed at nothing.
 *
 * ⛔ SO THIS ASSERTS THE PROPERTY, NOT THE PATCH: every hero subject a town can
 * OFFER must resolve in THAT TOWN'S OWN slab. That is true for town #5 without
 * anyone having looked at it, and it fails loudly for a town whose content and slab
 * disagree — which is the real defect either way.
 *
 * ⭐ READS THE SOURCE: the per-look content paths are parsed out of
 * `src/data/loadInstanceData.js`'s MANIFESTS, never restated here.
 *
 * ⛔ READ-ONLY.
 *
 * MUTATION TEST (a check only ever seen to pass is not evidence):
 *   restore `import landmarksData from '../data/landmarks.json'` in SurveyorPanel ⇒ red
 *   point any listing's building_id at 'nope' ⇒ red, naming the town and the listing
 *
 * Usage: node checks/claims-hero-subject-resolves-in-its-own-slab.mjs
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const ROOT   = new URL('..', import.meta.url).pathname
const PUBLIC = join(ROOT, 'public')
const MANIFEST_SRC = readFileSync(join(ROOT, 'src/data/loadInstanceData.js'), 'utf8')
const PANEL_SRC    = readFileSync(join(ROOT, 'src/cartograph/SurveyorPanel.jsx'), 'utf8')
const HERO_SRC     = readFileSync(join(ROOT, 'src/lib/heroSubject.js'), 'utf8')

const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null } }

// ── lift each look's `landmarks:` thunk path out of MANIFESTS ───────────────
function landmarkPaths() {
  const out = new Map()
  const mi = MANIFEST_SRC.search(/^const MANIFESTS = \{/m)
  if (mi < 0) return null
  // walk top-level `  '<id>': {` / `  <id>: {` blocks
  const re = /^\s{2}'?([a-z0-9][a-z0-9-]*)'?:\s*\{/gm
  let m
  while ((m = re.exec(MANIFEST_SRC))) {
    if (m.index < mi) continue
    const block = MANIFEST_SRC.slice(m.index, MANIFEST_SRC.indexOf('\n  },', m.index))
    const lm = block.match(/landmarks:\s*\(\)\s*=>\s*import\('([^']+)'\)/)
    if (lm) out.set(m[1], lm[1])
  }
  return out
}

const paths = landmarkPaths()
if (!paths) { console.error('⛔ FAIL — src/data/loadInstanceData.js no longer declares MANIFESTS.'); process.exit(2) }

const idx = readJson(join(PUBLIC, 'looks/index.json')) || { looks: [] }
const sceneOf = new Map((idx.looks || []).map(l => [l.id, l.scene]))

function slabIds(scene) {
  const b = readJson(join(PUBLIC, 'baked', scene, 'buildings.json'))
  if (!b || !Array.isArray(b.buildings)) return null
  return new Set(b.buildings.map(x => (typeof x === 'string' ? x : x?.id)))
}
function listingsFor(relPath) {
  // thunk paths are relative to src/data/
  const abs = join(ROOT, 'src/data', relPath)
  const raw = readJson(abs)
  if (!raw) return null
  const items = Array.isArray(raw) ? raw : (raw.landmarks || raw.listings || [])
  return Array.isArray(items) ? items : null
}

let pass = 0, fail = 0
const check = (label, fn) => {
  try { const why = fn(); if (why) { console.log(`  ⛔ FAIL  ${label}\n           ${why}`); fail++ } else { console.log(`  ✅ pass  ${label}`); pass++ } }
  catch (err) { console.log(`  ⛔ THREW ${label}\n           ${err.message}`); fail++ }
}

console.log(`\nHERO SUBJECT — can a town offer a hero it does not contain?\nlooks with a landmarks manifest: ${[...paths.keys()].join(', ') || '(none)'}\n`)

check('the hero picker does not statically import a shared src/data/* artifact', () => {
  const m = PANEL_SRC.match(/^import .* from '\.\.\/data\/[\w-]+\.json'/m)
  return m ? `SurveyorPanel.jsx still has \`${m[0]}\` — that file is LS's own data as well as "the default", so every town is offered LS's` : null
})

check('the resolver still keys landmarks on the SLAB id (if this moves, the rule below moves)', () => (
  /subject\.kind === 'building' \|\| subject\.kind === 'landmark'/.test(HERO_SRC) && /slabIndex\.byId/.test(HERO_SRC)
    ? null
    : 'heroSubject.js no longer resolves landmark/building through slabIndex.byId — re-derive what the offered id must be'
))

check('every look with landmarks has a manifest entry of its OWN (none inherits another town\'s)', () => {
  const bad = []
  for (const [lookId, p] of paths) {
    const scene = sceneOf.get(lookId)
    if (!scene) { bad.push(`${lookId}: manifest entry but no scene in index.json`); continue }
    // the path must live under this look's own data, or be LS's shared root for LS itself
    if (!p.includes(`/${scene}/`) && lookId !== 'lafayette-square') {
      bad.push(`${lookId} → ${p} (not under its own scene dir)`)
    }
  }
  return bad.length ? bad.join('\n           ') : null
})

let measured = 0
check('every landmark a town can OFFER resolves in that town\'s OWN slab', () => {
  const bad = []
  for (const [lookId, p] of paths) {
    const scene = sceneOf.get(lookId) || lookId
    const items = listingsFor(p)
    const slab = slabIds(scene)
    if (!items) { bad.push(`${lookId}: NOT MEASURED — no listings readable at ${p}`); continue }
    if (!slab)  { bad.push(`${lookId}: NOT MEASURED — no public/baked/${scene}/buildings.json to resolve against`); continue }
    // Only OFFERED entries are in scope: the panel filters to those with a building_id + name.
    const offered = items.filter(l => l && l.building_id && l.name)
    const miss = offered.filter(l => !slab.has(l.building_id))
    measured++
    if (miss.length) {
      bad.push(`${lookId}: ${miss.length}/${offered.length} offered landmark(s) are not in its slab ` +
               `(e.g. "${miss[0].name}" → ${miss[0].building_id}) — each would frame FALLBACK_HERO_SUBJECT`)
    }
  }
  return bad.length ? bad.join('\n           ') : null
})

check('the rule was actually measured against at least one town', () => (
  measured ? null : 'NOT MEASURED — no town had both listings and a slab; this asserts nothing'
))

check('no town is offered a landmark that belongs to a DIFFERENT town\'s slab', () => {
  const slabs = new Map()
  for (const [lookId] of paths) {
    const scene = sceneOf.get(lookId) || lookId
    const s = slabIds(scene); if (s) slabs.set(lookId, s)
  }
  const bad = []
  for (const [lookId, p] of paths) {
    const items = listingsFor(p); const own = slabs.get(lookId)
    if (!items || !own) continue
    for (const l of items.filter(x => x && x.building_id && x.name)) {
      if (own.has(l.building_id)) continue
      const elsewhere = [...slabs].filter(([o, s]) => o !== lookId && s.has(l.building_id)).map(([o]) => o)
      if (elsewhere.length) bad.push(`${lookId} offers "${l.name}" (${l.building_id}) — that id lives in ${elsewhere.join(', ')}`)
    }
  }
  return bad.length ? bad.join('\n           ') : null
})

console.log(`\n${fail ? '⛔' : '✅'} ${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
