#!/usr/bin/env node
/**
 * claims-a-failed-apply-leaves-one-state.mjs
 *
 * ⛔ THE CLASS: Extent's Bake failing half-way and leaving the town in TWO states, silently.
 * Provincetown, 2026-09-25: the Bake applied a 5,290 m disc, the pour's promote refused
 * (no --yes on the route), the rollback restored the 7,065 m boundary but NOT map.json, the
 * error rendered in a section hidden for any town with data, and the Designer camera had been
 * shifted by −discCenter on a retracted "the frame re-centers" premise.
 *
 * Asserts:
 *   apply/restore-is-exact   BEHAVIOUR — snapshot a scene's apply files (one absent), simulate a
 *                            pour that rewrites them all and creates the absent one, restore:
 *                            every file byte-identical, the new one gone.
 *   apply/covers-the-pour    applySnapshotPaths includes map.json and the promoted ribbons.
 *   apply/commit-rollback-rescope   serve.js snapshots on commit + rescope and restores on both.
 *   promote/gesture-not-silent      the pour's ONE promote-ribbons step (cartograph/pourSteps.mjs, which every route runs)
 *                                   passes --yes, serve.js declares none of its own, and --yes prints PROMOTE-DIFF.
 *   extent/error-beside-bake        onBuild's failure goes to bakeResult (rendered by Extent's save
 *                                   button, naming the step), not seedError.
 *   extent/camera-unchanged-by-failure   no −discCenter translate; a failure restores the prior camera.
 *
 *     node checks/claims-a-failed-apply-leaves-one-state.mjs [--self-test]
 */
import { readFileSync, writeFileSync, mkdtempSync, existsSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const snap = await import(join(ROOT, 'cartograph', 'applySnapshot.mjs'))

function loadSources() {
  return {
    serve: read('cartograph/serve.js'), promote: read('cartograph/promote-ribbons.js'), pour: read('cartograph/pourSteps.mjs'),
    extent: read('src/cartograph/ExtentApp.jsx'), module: read('cartograph/applySnapshot.mjs'),
    // The behaviour under test: the module's own functions, swappable by a mutation.
    snapshotPaths: snap.snapshotPaths, restorePaths: snap.restorePaths,
  }
}

function behaviour(S) {
  const dir = mkdtempSync(join(tmpdir(), 'apply-'))
  try {
    const names = ['geography.json', 'neighborhood_boundary.json', 'neighborhood.json', 'map.json', 'ribbons.json']
    const paths = names.map(n => join(dir, n))
    const before = {}
    paths.forEach((p, i) => { if (i !== 4) { writeFileSync(p, `before-${i}`); before[p] = `before-${i}` } })  // ribbons absent
    S.snapshotPaths(paths, 'prebak')
    for (const p of paths) writeFileSync(p, 'AFTER-A-HALF-POUR')
    S.restorePaths(paths, 'prebak')
    const wrong = paths.filter(p => before[p] != null ? (!existsSync(p) || readFileSync(p, 'utf8') !== before[p]) : existsSync(p))
    return wrong.map(p => p.split('/').pop())
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

function run(S) {
  const out = []
  const assert = (name, ok, detail) => out.push({ name, ok: !!ok, detail })
  const wrong = behaviour(S)
  assert('apply/restore-is-exact', wrong.length === 0, `after snapshot → half-pour → restore, these did not return to their prior state: ${wrong.join(', ')}`)
  const pathsFn = /export function applySnapshotPaths[\s\S]*?\n}/.exec(S.module)?.[0] || ''
  assert('apply/covers-the-pour', /'map\.json'/.test(pathsFn) && /ribbonsPathOf\(scene\)/.test(pathsFn) && /neighborhood_boundary\.json/.test(pathsFn),
    'applySnapshotPaths no longer covers map.json, the promoted ribbons and the boundary')
  assert('apply/commit-rollback-rescope',
    /snapshotApply\(scene, 'prebak'\)/.test(S.serve) && /restoreApply\(scene, 'prebak'\)/.test(S.serve) &&
    /snapshotApply\(scene, 'prebak-rescope'\)/.test(S.serve) && /restoreApply\(scene, 'prebak-rescope'\)/.test(S.serve),
    'serve.js no longer snapshots + restores on commit-extent / rollback / rescope')
  // the pour's steps are declared ONCE (pourSteps.mjs) and every route runs them, so the one promote-ribbons call is the gesture
  const promoteCalls = [...S.pour.matchAll(/node promote-ribbons\.js[^`'"]*/g)].map(m => m[0]), ownCalls = [...S.serve.matchAll(/node promote-ribbons\.js/g)].length
  assert('promote/gesture-not-silent',
    promoteCalls.length === 1 && promoteCalls.every(c => /--yes/.test(c)) && ownCalls === 0 && /PROMOTE-DIFF /.test(S.promote) && /moved\.length && operatorGesture/.test(S.promote),
    `the pour's promote-ribbons step is not declared once with --yes (${promoteCalls.join(' | ') || 'none'}; serve.js declares ${ownCalls} of its own), or --yes no longer prints PROMOTE-DIFF`)
  const onBuild = S.extent.slice(S.extent.indexOf('const onBuild = async'), S.extent.indexOf('(Re-scope folded into onBuild'))
  assert('extent/error-beside-bake',
    /setBakeResult\([^\n]*\{ error: \{ at: step/.test(onBuild) && !/setSeedError\(`Pour failed/.test(onBuild) && /Saving stopped at “\{bakeResult\.error\.at\}”/.test(S.extent),
    'a failed save no longer reports beside its button with the step name')
  assert('extent/camera-unchanged-by-failure',
    !/authoredCam\.x - discCenter\.x/.test(onBuild) && /localStorage\.setItem\('cartograph-camera', priorCam\)/.test(onBuild),
    'onBuild translates the camera by −discCenter again, or no longer restores the prior camera on failure')
  return out
}

const MUTATIONS = [
  { name: 'apply/restore-is-exact', apply: (S) => ({ ...S, snapshotPaths: (paths, tag) => S.snapshotPaths(paths.filter(p => !p.endsWith('map.json')), tag) }) },
  { name: 'apply/covers-the-pour', apply: (S) => ({ ...S, module: S.module.replace("join(mapCleanDir(scene), 'map.json'), ", '') }) },
  { name: 'apply/commit-rollback-rescope', apply: (S) => ({ ...S, serve: S.serve.replace("restoreApply(scene, 'prebak-rescope')", 'false') }) },
  { name: 'promote/gesture-not-silent', apply: (S) => ({ ...S, pour: S.pour.replace('cmd: `node promote-ribbons.js ${flag} --yes`', 'cmd: `node promote-ribbons.js ${flag}`') }) },
  { name: 'extent/error-beside-bake', apply: (S) => ({ ...S, extent: S.extent.replace('setBakeResult(e.cancelled ? { cancelled: { at: step', 'setSeedError(e.cancelled ? { cancelled: { at: step') }) },
  { name: 'extent/camera-unchanged-by-failure', apply: (S) => ({ ...S, extent: S.extent.replace('? { x: authoredCam.x, z: authoredCam.z, zoom: authoredCam.zoom }', '? { x: authoredCam.x - discCenter.x, z: authoredCam.z - discCenter.z, zoom: authoredCam.zoom }') }) },
]

const S = loadSources()
if (process.argv.includes('--self-test')) {
  const red = run(S).filter(r => !r.ok)
  if (red.length) { for (const r of red) console.log(`⛔ baseline red: ${r.name} — ${r.detail}`); process.exit(1) }
  let bad = 0
  for (const m of MUTATIONS) {
    const hit = run(m.apply(S)).find(r => r.name === m.name)
    if (!hit || hit.ok) { console.log(`  ⛔ ${m.name} — defect planted and the check STAYED GREEN`); bad++ }
    else console.log(`  ✓ ${m.name} — went red`)
  }
  console.log(bad ? `\n⛔ ${bad} mutation(s) did not fail.` : '\n✅ every mutation produced its named failure.')
  process.exit(bad ? 1 : 0)
}
const res = run(S)
for (const r of res) console.log(`${r.ok ? '  ✓' : '  ✗'} ${r.name}${r.ok ? '' : ` — ${r.detail}`}`)
const failed = res.filter(r => !r.ok)
console.log(`\n${res.length - failed.length}/${res.length} green`)
process.exit(failed.length ? 1 : 0)
