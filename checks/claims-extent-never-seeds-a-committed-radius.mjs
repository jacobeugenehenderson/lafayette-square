#!/usr/bin/env node
// CLAIM — EXTENT NEVER SEEDS A COMMITTED RADIUS (2026-10-28, LS: the page wrote a draft of 1689 m over the applied 892 m, Jacob
// untouched). Two causes, read by symbol (Zob): api.js#fetchNeighborhood returned {} on a failed GET, and the hydration caught it
// and still marked the scene hydrated, which armed the draft autosave; and the radius auto-seed checked neither `committed` nor the
// applied radius. Now a failed load REFUSES by name and never hydrates (no autosave, no seed), and a committed town's draft is its
// own draftRadius, else its applied radius, else a refusal (src/cartograph/extentRadius.js, the page's one copy of both rules).
// The radius is whole metres, one step rule for the handle, the slider and the typed field (CircleHandle.jsx#toRadiusM).
//   (1) THE LOAD, the real function with fetch planted: a 503 refuses naming the scene · a 200 {} (a scene with no file yet, the
//       server's answer) is a fresh draft · a 200 record comes back as written.
//   (2) THE PLANT, LS committed with its GET failing: the load refuses, so the page never hydrates (source: the hydration's catch
//       sets loadError and never setHydratedScene; the autosave and the seed both wait on hydratedScene), and the seed gives
//       nothing unhydrated (seedRadius), where an unguarded seed gave keptFit + 120 = 1689 m.
//   (3) A COMMITTED TOWN, hydrated: its draft is its draftRadius, else its applied 892 m, else a refusal · the seed gives nothing,
//       even at radius 0 · a FRESH scene is still seeded (keptFit + 120).
//   (4) ONE STEP RULE: toRadiusM(891.6) = 892 · the handle, the slider and the field all read it · no step of 10 is left.
//   (5) A COMMITTED TOWN'S OTHER LOADS (Zob): fetchGeography and fetchBoundary refuse a 503 by name and pass a 200 null (a scene
//       with none yet) · the page's committed hydration and its three reloads in onBuild swallow none of them (the search's
//       load of a fresh target may).
//   MUTANTS (always run): {} on !ok restored → (1) RED · the committed guard removed from seedRadius → (3) RED · fetchBoundary's
//   refusal removed → (5) RED.
//   node checks/claims-extent-never-seeds-a-committed-radius.mjs
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { ROOT } from './_scenes.mjs'

let red = 0
const row = (ok, s) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${s}`) }
const realFetch = globalThis.fetch
const load = async (api, res) => { globalThis.fetch = async () => res; try { return { nb: await api.fetchNeighborhood('lafayette-square') } } catch (e) { return { why: String(e.message) } } finally { globalThis.fetch = realFetch } }
const ok = (body) => ({ ok: true, status: 200, json: async () => body })
const judgeLoad = async (api) => { const failed = await load(api, { ok: false, status: 503, json: async () => ({}) }), fresh = await load(api, ok({})), held = await load(api, ok({ committed: true, draftRadius: 892 }))
  return { failed, fresh, held, pass: /'lafayette-square'.*HTTP 503/.test(failed.why || '') && !fresh.why && JSON.stringify(fresh.nb) === '{}' && held.nb?.draftRadius === 892 } }
const sayLoad = (J) => `a 503 ${J.failed.why ? `refuses (${J.failed.why.slice(0, 70)}…)` : `returns ${JSON.stringify(J.failed.nb)}`} · a 200 {} is ${JSON.stringify(J.fresh.nb)} · a 200 record comes back with draftRadius ${J.held.nb?.draftRadius}`
const API = await import('../src/cartograph/api.js'), ER = await import('../src/cartograph/extentRadius.js')
{ const J = await judgeLoad(API); row(J.pass, `(1) the load: ${sayLoad(J)}`) }

// (2) the page's hydration contract, read from the source
{ const s = readFileSync(join(ROOT, 'src/cartograph/ExtentApp.jsx'), 'utf8'), i0 = s.indexOf('const nb = await fetchNeighborhood(scene)'), i1 = s.indexOf('}, [scene])', i0), H = s.slice(i0, i1)
  const noCatch = i0 > 0 && !/fetchNeighborhood\(scene\)\.catch/.test(s), tail = H.slice(H.lastIndexOf('})().catch'))
  const failNoHydrate = /setLoadError/.test(tail) && !/setHydratedScene/.test(tail), hydrateLast = H.indexOf('committedDraftRadius(') > 0 && H.indexOf('setHydratedScene(scene)') > H.indexOf('committedDraftRadius(')
  const save = /if \(hydratedScene !== scene \|\| !scene\) return\s*\n\s*const t = setTimeout\(\(\) => \{ saveNeighborhood/.test(s), seed = /seedRadius\(\{ hydrated: hydratedScene === scene,/.test(s)
  const all = noCatch && failNoHydrate && hydrateLast && save && seed
  row(all, `(2) the page: the load has no catch of its own (${noCatch}) · a failed load shows loadError and never hydrates (${failNoHydrate}) · it hydrates last, after the committed radius (${hydrateLast}) · the autosave waits on hydratedScene (${save}) · the seed asks seedRadius with it (${seed})`)
  const unhydrated = ER.seedRadius({ hydrated: false, committed: false, appliedRadius: 0, radiusM: 0, radiusTouched: false, coverageFit: null, keptFit: { radius: 1569 } })
  row(unhydrated == null, `(2) LS committed, its GET failing: the page never hydrates, and the seed then gives ${unhydrated ?? 'nothing'} (an unguarded seed gave 1569 + 120 = 1689 m)`) }

// (3) a committed town, hydrated; and a fresh one
const judgeSeed = (E) => { const committed = E.seedRadius({ hydrated: true, committed: true, appliedRadius: 892, radiusM: 0, radiusTouched: false, coverageFit: null, keptFit: { radius: 1569 } })
  const fresh = E.seedRadius({ hydrated: true, committed: false, appliedRadius: 0, radiusM: 0, radiusTouched: false, coverageFit: null, keptFit: { radius: 1569 } })
  return { committed, fresh, pass: committed == null && fresh === 1689 } }
{ let refused = null; try { ER.committedDraftRadius({ committed: true }, null, 'lafayette-square') } catch (e) { refused = String(e.message) }
  const d = ER.committedDraftRadius({ committed: true, draftRadius: 1000 }, { radius: 892 }, 'x'), a = ER.committedDraftRadius({ committed: true }, { radius: 892 }, 'x'), n = ER.committedDraftRadius({}, { radius: 892 }, 'x')
  row(d === 1000 && a === 892 && n === null && /is committed, but neither/.test(refused || ''), `(3) a committed town's draft: its draftRadius ${d} · else its applied ${a} · neither → ${refused ? 'refuses by name' : 'NO refusal'} · an uncommitted scene → ${n}`)
  const J = judgeSeed(ER); row(J.pass, `(3) the seed: a committed town (applied 892, radius 0) → ${J.committed ?? 'nothing'} · a fresh scene → ${J.fresh} m`) }

// (4) one step rule
{ const { toRadiusM, RADIUS_STEP_M } = await import('../src/cartograph/CircleHandle.jsx').catch(() => ({}))
  const ch = readFileSync(join(ROOT, 'src/cartograph/CircleHandle.jsx'), 'utf8'), ex = readFileSync(join(ROOT, 'src/cartograph/ExtentApp.jsx'), 'utf8')
  const m = ch.match(/export const RADIUS_STEP_M = (\d+)\n/), step = m ? +m[1] : null, q = step ? Math.round(891.6 / step) * step : null
  const all = step === 1 && q === 892 && /const r = toRadiusM\(Math\.hypot/.test(ch) && /step=\{RADIUS_STEP_M\}\s*\n\s*value=\{radiusM\}/.test(ex) && /<RadiusField /.test(ex) && /type="number" inputMode="numeric" min=\{rMin\} step=\{RADIUS_STEP_M\}/.test(ex) && !/step=\{10\}/.test(ex)
  row(all, `(4) one step rule: RADIUS_STEP_M ${step} m (891.6 → ${q}) · the handle, the slider and the typed field read it · no step of 10 left: ${all}`) }

// (5) a committed town's geography and boundary
const loadGB = async (api) => { const r = {}
  for (const [k, fn] of [['geography', api.fetchGeography], ['boundary', api.fetchBoundary]]) {
    globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => { throw new SyntaxError('Unexpected token <') } })
    try { r[k] = { v: await fn('lafayette-square') } } catch (e) { r[k] = { why: String(e.message) } }
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => null })
    try { r[k].none = await fn('fresh') } catch (e) { r[k].none = `threw ${e.message}` } finally { globalThis.fetch = realFetch } }
  return { r, pass: ['geography', 'boundary'].every(k => new RegExp(`'lafayette-square': its ${k} could not be loaded \\(HTTP 503\\)`).test(r[k].why || '') && r[k].none === null) } }
const sayGB = (J) => ['geography', 'boundary'].map(k => `${k}: a 503 ${J.r[k].why ? `refuses (${J.r[k].why.slice(0, 60)}…)` : 'does NOT refuse'}, a 200 null is ${JSON.stringify(J.r[k].none)}`).join(' · ')
{ const J = await loadGB(API); row(J.pass, `(5) the loads: ${sayGB(J)}`)
  const s = readFileSync(join(ROOT, 'src/cartograph/ExtentApp.jsx'), 'utf8'), ob = s.slice(s.indexOf('const onBuild = async'), s.indexOf('(Re-scope folded into onBuild'))
  const hyd = /nb\.committed\s*\n\s*\? await Promise\.all\(\[fetchGeography\(scene\), fetchBoundary\(scene\)\]\)/.test(s) && /if \(nb\.committed && !\(disk && b\)\) throw/.test(s)
  const swallowed = (ob.match(/fetch(?:Geography|Boundary)\(scene\)\.catch\(/g) || []).length
  row(hyd && swallowed === 0, `(5) the page: a committed hydration's geography and boundary refuse (${hyd}) · onBuild's reloads that swallow a failure: ${swallowed}`) }

// MUTANT 1: {} on !ok restored in api.js
{ const src1 = readFileSync(join(ROOT, 'src/cartograph/api.js'), 'utf8'), ANCHOR1 = "  if (!res.ok) throw new Error(`[Extent] ⛔ '${scene}': its neighborhood could not be loaded"
  if (src1.split(ANCHOR1).length !== 2) row(false, 'mutant ({} on !ok): the anchor is not in api.js once — re-aim it')
  else { const dir1 = mkdtempSync(join(tmpdir(), 'extent-load-'))
    try { writeFileSync(join(dir1, 'api.js'), src1.replace(ANCHOR1, "  if (!res.ok) return {}; if (false) throw new Error(`[Extent] ⛔ '${scene}': its neighborhood could not be loaded"))
      const J = await judgeLoad(await import(pathToFileURL(join(dir1, 'api.js')).href))
      row(!J.pass, `mutant: {} on !ok restored → ${sayLoad(J)} — ${!J.pass ? 'RED as it must be' : 'the row proves nothing'}`)
    } finally { rmSync(dir1, { recursive: true, force: true }) } } }
// MUTANT 2: the committed guard removed from seedRadius
{ const src2 = readFileSync(join(ROOT, 'src/cartograph/extentRadius.js'), 'utf8'), ANCHOR2 = '  if (!hydrated || committed || appliedRadius > 0) return null'
  if (src2.split(ANCHOR2).length !== 2) row(false, 'mutant (the committed guard removed): the anchor is not in extentRadius.js once — re-aim it')
  else { const dir2 = mkdtempSync(join(tmpdir(), 'extent-seed-'))
    try { writeFileSync(join(dir2, 'extentRadius.js'), src2.replace(ANCHOR2, '  if (!hydrated) return null'))
      const J = judgeSeed(await import(pathToFileURL(join(dir2, 'extentRadius.js')).href))
      row(!J.pass, `mutant: the committed guard removed → a committed town (applied 892) is seeded ${J.committed ?? 'nothing'} — ${!J.pass ? 'RED as it must be' : 'the row proves nothing'}`)
    } finally { rmSync(dir2, { recursive: true, force: true }) } } }
// MUTANT 3: fetchBoundary's refusal removed
{ const src3 = readFileSync(join(ROOT, 'src/cartograph/api.js'), 'utf8'), ANCHOR3 = "  if (!res.ok) throw new Error(`[Extent] ⛔ '${scene}': its boundary could not be loaded"
  if (src3.split(ANCHOR3).length !== 2) row(false, 'mutant (fetchBoundary\'s refusal removed): the anchor is not in api.js once — re-aim it')
  else { const dir3 = mkdtempSync(join(tmpdir(), 'extent-gb-'))
    try { writeFileSync(join(dir3, 'api.js'), src3.replace(ANCHOR3, "  if (false) throw new Error(`[Extent] ⛔ '${scene}': its boundary could not be loaded"))
      const J = await loadGB(await import(pathToFileURL(join(dir3, 'api.js')).href))
      row(!J.pass, `mutant: fetchBoundary's refusal removed → ${sayGB(J)} — ${!J.pass ? 'RED as it must be' : 'the row proves nothing'}`)
    } finally { rmSync(dir3, { recursive: true, force: true }) } } }
console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ extent never seeds a committed radius')
process.exit(red ? 1 : 0)
