// pourSteps.mjs — THE POUR'S THREE STEPS AND THE SKELETON STEP AHEAD OF THEM, DECLARED ONCE, AND THE ONE RECORDER OF WHAT A STEP READ (2026-10-28).
//
// The pour (bake-coast → pipeline → promote-ribbons) was declared three times: in the Bake's own steps, in Extent's re-apply
// (POST /<scene>/rescope) and in its first pour (POST /<scene>/pour). Only the Bake recorded what each step read
// (`bake-reads.json`), so right after Extent's own pour the Bake judged it unrecorded: it re-ran the lidar coast step, and for a
// town whose pour is HELD (a Look's `pour.held`) it stopped to ask about re-promoting (LS, twice on 2026-10-28). The Extent pours
// also ran the pipeline with `--skip-elevation` always, where the Bake reads the town's `pour.elevation`. Now every caller runs
// these steps and records them here, through one function. ▶ checks/claims-the-pour-records-itself-once.mjs
//
// ⭐⭐ ONE PRINCIPLE (Boz's ruling, 2026-11-01): A STEP'S KEY RECORDS EVERY INPUT THAT SHAPES ITS OUTPUT, WHATEVER CARRIES IT — a
// file, a value, or a flag on its command line (pour-code.mjs#pourArgvReads). A GUARD IS NOT KEYED: it shapes nothing, it only
// refuses, so it runs whenever the town is about to be acted on — every Bake run and every Publish (#pourGuardRefusals), never
// only when a step happens to re-run. Its inputs (the authoring, the home Look) are therefore never in a key.
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { importClosure, contentRecord, TOWN_REGISTRY } from './pour-code.mjs'
import { terrainValueReads } from './terrainReads.mjs'
import { COAST_FILE, TOLERANCE_FILE } from './coastFile.mjs'
import { instanceForMap } from '../src/instances/registry.js'
import { homeLookOf } from './homeLook.mjs'
import { mintInputsOf } from './mintInputs.mjs'
import { authoringOf, authoringReKeys, highwayClasses } from './authoredKeys.mjs'
import { mapCleanDir, ribbonsPathOf } from './scene.js'

const HERE = import.meta.dirname, REPO_ROOT = join(HERE, '..')

// ⭐ WHAT EACH STEP READ WHEN IT LAST RAN — `${lookId}:${label}` → { code, data }, each { path: sha1 }, beside the timings.
// A step re-runs when its code (its scripts' import closure) or a declared data input differs by CONTENT (pour-code.mjs
// `contentChanged`), or an output is missing — never on an mtime. ⛔ An unreadable or absent record file is NO record: every
// step is dirty, never clean by default.
export function bakeReadsPath(mapJson) { return join(dirname(mapJson), 'bake-reads.json') }
export function readBakeReads(mapJson) { try { return JSON.parse(readFileSync(bakeReadsPath(mapJson), 'utf-8')) } catch { return {} } }
export function saveBakeRead(mapJson, lookId, label, rec) {
  try { const r = readBakeReads(mapJson); r[`${lookId}:${label}`] = { ...rec, at: new Date().toISOString() }; writeFileSync(bakeReadsPath(mapJson), JSON.stringify(r, null, 1)) }
  catch (e) { console.warn(`[bake] could not record what ${label} read: ${e.message}`) }   // the next bake re-runs it: the safe direction
}

// ⭐ THE TOWN'S RECORD IS DATA, NOT CODE (2026-10-04), AND A STEP KEYS ONLY THE FIELDS IT READS (2026-11-01). A step's code closure
// stops at the town registry; a step that reads the record declares the fields, as a projection, among its inputs:
// `townRecordFor(scene, ['setPiece.buildingId'])` ('*' = the whole record). A step that declares none carries no record, so a
// branding edit re-runs no geometry. ⛔ Until 2026-11-01 every step carried the WHOLE record (stepReads appended it), so any
// edit re-poured the town from its skeleton; one judged step read one field. ▶ node checks/claims-a-step-keys-every-input-that-shapes-it.mjs
/** `rec` projected onto `fields`, in the declared order: a path → its value (a missing one → null, the same on every run). */
export function pickRecord(rec, fields) {
  if (fields.includes('*')) return rec
  return Object.fromEntries(fields.map(f => [f, f.split('.').reduce((o, k) => (o == null ? undefined : o[k]), rec) ?? null]))
}
export const townRecordFor = (scene, fields) => ({ value: `the town record of "${scene}": ${fields.join(', ')}`, fields,
  read: () => { const rec = instanceForMap(scene); return rec ? pickRecord(rec, fields) : null } })

// ⭐ ground.json AS ITS READERS READ IT (2026-10-28, the 10-04 scene.json/bakedAt pattern). bake-ground-ao runs LAST and writes
// its four maps back into ground.json (`lightmap` with the groundKey it was baked against, `colormap`, `poolmap`, `rulemap`);
// bake-ground carries the prior lightmap and drops the other maps when the ground changed. So by FILE, every step that read
// ground.json earlier in the Bake (coast-distance, buildings, lamps, tree-anchors) was stale after any Bake that re-baked the
// ground (LS, 2026-10-28 ~14:25). None of them reads those fields, nor `timings` (bake-ground's wall times, new on every run):
// they read the rest, by value. ▶ checks/claims-no-step-reads-what-a-later-step-writes.mjs (the field list is read off
// bake-ground-ao.js there, so a fifth map it starts writing fails the check rather than re-opening this).
export const GROUND_AO_FIELDS = ['lightmap', 'colormap', 'poolmap', 'rulemap']
export const groundForReaders = (lookDir) => ({
  value: `${join(lookDir, 'ground.json').replace(REPO_ROOT + '/', '')} without the maps bake-ground-ao writes back (${GROUND_AO_FIELDS.join(', ')}) or its timings`,
  read: () => {
    let g
    try { g = JSON.parse(readFileSync(join(lookDir, 'ground.json'), 'utf-8')) } catch { return null }
    for (const k of [...GROUND_AO_FIELDS, 'timings']) delete g[k]
    return g
  },
})

// ⛔ scene.json#bakedAt is the pour's stamp, written by serve.js after every step has run; a step that read scene.json BY FILE
// was stale after every Bake (trees 2026-10-04, revetment-far 2026-10-29). Its readers declare it by value, without the stamp.
// ▶ node checks/claims-no-step-reads-what-a-later-step-writes.mjs
export const sceneForReaders = (sceneDir) => ({
  value: `${join(sceneDir, 'scene.json').replace(REPO_ROOT + '/', '')} without its bakedAt stamp`,
  read: () => {
    let sc
    try { sc = JSON.parse(readFileSync(join(sceneDir, 'scene.json'), 'utf-8')) } catch { return null }
    delete sc.bakedAt
    return sc
  },
})

/** A step's reads: its CODE is its declared scripts' whole import closure, its DATA every other declared input (the record's
 *  fields among them, when it declares any: #townRecordFor). What the Bake judges a step by, and what is recorded after it runs. */
export function stepReads(inputs) {
  const isCode = (f) => typeof f === 'string' && /\.m?js$/.test(f)
  return { code: importClosure(inputs.filter(isCode), { stopAt: [TOWN_REGISTRY] }), data: inputs.filter(f => !isCode(f)) }
}

/** The one recorder: what `label` read, saved for every Look of the scene (the pour's outputs are the town's, not one Look's). */
export function recordStep(mapJson, lookIds, label, inputs) {
  const { code, data } = stepReads(inputs), rec = { code: contentRecord(code), data: contentRecord(data) }
  for (const id of lookIds) saveBakeRead(mapJson, id, label, rec)
}

/**
 * ⭐ THE SKELETON STEP, AHEAD OF THE POUR (2026-10-28, BRIEF-the-bake-re-skeletons-a-stale-town): a committed town's skeleton
 * was made once, at commit, and no button re-made it, so a change to the skeleton's code (the street-class vocabulary) never
 * reached a town (LS refused its pour; the area-highway rule never reached HPDM or Huron). Judged by content like any step: its
 * DATA is raw/osm.json and raw/survey.json, its CODE skeleton.js's import closure (streetClass.js with it) and the runner's,
 * reskeleton.mjs, which refuses by name before a new skeleton re-keys the operator's authoring (authoredKeys.mjs). ⛔ It does not
 * read the extent or the boundary; the authoring the guard reads shapes no output, so it is no input.
 * ⛔ NOT in `pourSteps` below: Extent's re-apply runs those and must never re-skeleton ("no skeleton rebuild, no identity churn").
 * The Bake runs it when stale (serve.js, behind the re-pour question), and Extent's commit and rollback through `runSkeleton`.
 */
export function skeletonStep(scene, paths) {
  return { label: 'skeleton', timeout: 300000, cmd: `node reskeleton.mjs --scene=${scene}`,
    outputs: [paths.skeleton, join(paths.clean, 'street-index.json')],
    inputs: [join(paths.raw, 'osm.json'), join(paths.raw, 'survey.json'), join(HERE, 'skeleton.js'), join(HERE, 'reskeleton.mjs')] }
}
/** Run the skeleton step outside the Bake (Extent's commit, its rollback) and record it, so the next Bake judges it done. */
export async function runSkeleton(step, { scene, mapJson, lookIds, run }) {
  await run(step)
  recordStep(mapJson, lookIds, step.label, step.inputs)
}

/**
 * The pour's steps for `scene`, in order: { label, inputs, outputs, cmd, timeout, judge? }. `paths` is serve.js#mapDataPaths(scene),
 * `ribbons` the scene's own ribbons (scene.js#ribbonsPathOf), `elevation` the town's `pour.elevation` (its Look's design).
 * `judge: 'mtime'` is the pipeline only: its code, data, geography and registry reads are recorded by pipeline.js itself, in
 * map.json, and judged there (the Bake's re-pour question); its authoring inputs re-pour on a newer mtime. It records nothing here.
 */
export function pourSteps(scene, paths, ribbons, { elevation }) {
  const flag = `--scene=${scene}`
  // the town's declared home Look, read from its record BY VALUE and handed to the pipeline (the pour never imports a town module):
  // a town with no record passes nothing, and the pour refuses by name (mintInputs.mjs#townBlockCustoms)
  const hl = homeLookOf(scene), homeLook = hl === undefined ? '' : ` --home-look=${hl ?? ''}`
  return [
    { label: 'coast', timeout: 600000, cmd: `node bake-coast.mjs ${flag}`, outputs: [join(paths.clean, COAST_FILE)],
      inputs: [join(paths.raw, 'elevation.tif'), join(paths.raw, 'elevation-sources.txt'), join(paths.raw, 'elevation'),   // ⚠️ a URL list's TILES are read over the network: not tracked
        join(paths.raw, 'water-datums.json'), join(paths.raw, 'osm.json'), join(paths.raw, 'elevation-flights.json'),
        paths.boundary, paths.geography,
        paths.skeleton, paths.overlay,   // an embankment street's land: its pour measure along the skeleton (structures.mjs#embankmentFootprints)
        { value: 'terrainValueReads', read: () => terrainValueReads(scene) },   // the authored lake level / tide names
        // ⭐ the town's SIGNED residual (Boz, Zob, 2026-10-29): the step's verdict is a product of it, so a signature changed, a key
        // removed or the file deleted re-judges (the step's own tightening writes it DURING the run, and is recorded as it left it)
        join(dirname(paths.clean), TOLERANCE_FILE),
        join(HERE, 'bake-coast.mjs')] },
    // overlay.json + skeleton.json are operator-edited / derived (Survey and Measure write clean/overlay.json); the rest are raw
    { label: 'pipeline', judge: 'mtime', timeout: 600000, cmd: `node pipeline.js ${flag}${homeLook}${elevation === true ? '' : ' --skip-elevation'}`, outputs: [paths.map],
      inputs: [join(paths.raw, 'osm.json'), paths.measurements, paths.centerlines, join(paths.raw, 'elevation.json'), paths.overlay, paths.skeleton, join(REPO_ROOT, 'src', 'data', 'buildings.json')] },
    { label: 'promote-ribbons', timeout: 30000, cmd: `node promote-ribbons.js ${flag} --yes`, outputs: [ribbons],
      inputs: [paths.map, paths.geography, join(HERE, 'promote-ribbons.js')] },
  ]
}

/**
 * ⛔ THE TOWN'S POUR ELEVATION, ONE VALUE OR A REFUSAL (Boz's ruling, 2026-11-01). The pour's outputs are the TOWN's, shared by every
 * Look of it (#recordStep), so a field that shapes them must agree across those Looks. It never picks one (the Extent pour took
 * `looks[0]`, the Bake the Look being baked: two answers whenever they differ). `looks`: the scene's Look ids; `designOf(id)` its
 * design. Zero Looks → false: a scene with no Look yet declares none, so there is nothing to disagree — a neutral default, not a pick.
 */
export function townPourElevation(scene, looks, designOf) {
  if (!looks.length) return false
  const vals = looks.map(id => [id, designOf(id)?.pour?.elevation === true])
  if (new Set(vals.map(([, v]) => v)).size > 1) throw new Error(`[pour] ⛔ ${scene}'s Looks disagree on pour.elevation (${vals.map(([id, v]) => `${id}: ${v}`).join(' · ')}). The pour is the town's, shared by every Look, so one value must hold: set it the same on each, then Bake.`)
  return vals[0][1]
}

/**
 * ⛔ THE POUR'S TWO GUARDS, RUN AT THE QUESTION (Boz's ruling, 2026-11-01: every Bake run and every Publish; not the plan, which only
 * lists). Each reads the town's CURRENT authoring against what is on disk now, and returns refusals by name ([] = none):
 *   · the join guard (chainJoins.mjs#refuseAuthoredReKey): the mint's input rebuilt from the scene's ribbons with the town's
 *     home Look (mintInputsOf, as the pour builds it); any throw is a refusal.
 *   · the skeleton guard (authoredKeys.mjs#authoringReKeys) on the skeleton on disk against itself: an authored key that names no
 *     chain in the skeleton it was authored against (DANGLING) is reachable by authoring alone (Zob's read).
 * `requirePoured`: Publish passes true, so a town with no skeleton or ribbons cannot ship unguarded. A Bake of a town not poured yet
 * passes false: the pour's own guards run when it is made (reskeleton.mjs, the mint).
 */
export function pourGuardRefusals(scene, { requirePoured = false } = {}) {
  const out = [], skPath = join(mapCleanDir(scene), 'skeleton.json'), rbPath = ribbonsPathOf(scene)
  if (!existsSync(skPath) || !existsSync(rbPath)) {
    if (requirePoured) out.push(`${scene} has no ${!existsSync(skPath) ? 'skeleton' : 'ribbons'} on disk, so its authoring cannot be guarded`)
    return out
  }
  try { mintInputsOf(scene, JSON.parse(readFileSync(rbPath, 'utf8')).streets, homeLookOf(scene)) } catch (e) { out.push(e.message) }
  try {
    const sk = JSON.parse(readFileSync(skPath, 'utf8')), R = authoringReKeys(sk, sk, authoringOf(scene), highwayClasses())
    if (R.hits.length) out.push(`[skeleton guard] ⛔ ${scene}: ${R.hits.length} authored key(s) do not hold on the skeleton they were authored against: ${R.hits.join(' ‖ ')}`)
  } catch (e) { out.push(`[skeleton guard] ⛔ ${scene}: ${e.message}`) }
  return out
}

/**
 * Run the pour's steps in order and RECORD each one run (the pipeline records itself in map.json). `run(step)` runs one step's
 * command (serve.js passes runShell); `onLine` sees promote-ribbons' output. → { promoteDiff }, its PROMOTE-DIFF line, or null.
 */
export async function runPour(steps, { scene, mapJson, lookIds, run }) {
  let promoteDiff = null
  for (const st of steps) {
    await run(st, st.label === 'promote-ribbons' ? (l) => { if (l.startsWith('PROMOTE-DIFF ')) promoteDiff = JSON.parse(l.slice(13)) } : null)
    if (st.judge !== 'mtime') recordStep(mapJson, lookIds, st.label, st.inputs)
  }
  return { promoteDiff }
}
