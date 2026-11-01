#!/usr/bin/env node

// ⛔ DECLARED NON-SCENE-KEYED WRITER — checks/claims-writers-name-the-scene.mjs reads this
// marker and will FAIL if it is absent from a writer that is reachable as a CLI entry point.
// A writer is guilty until this line says otherwise, with a reason.
// @scene-independent: THE DEV SERVER. It must BOOT without a scene and derives the scene
//     PER REQUEST from the look being operated on — then passes it explicitly to every step
//     it spawns (--scene= or CARTOGRAPH_SCENE on all 14 invocations). Requiring a scene at
//     startup would make the server unstartable. Its spawn sites are the reason the guard
//     works at all; do not guard serve.js itself.
import { createServer } from 'http'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, renameSync, realpathSync } from 'fs'
import { join, dirname, relative } from 'path'
import { spawn } from 'child_process'
import { mapRawDir, mapCleanDir, ribbonsPathOf, declaredRibbonsOf } from './config.js'
import { readDeployment } from '../src/lib/deployment.js'
import { slugifyName, isNumericId } from '../src/lib/sceneSlug.js'
import { registryReadChanged } from '../src/cartograph/streetProfiles.js'
import { curbedMinWidthOf, REGISTRY_PATH } from './curbedMinWidthOf.mjs'
import { labelMajor } from '../src/cartograph/streetClass.js'
import { pourCodeClosure, pourCodeChanged, geographyReadChanged, contentChanged, pourDataReads, pourArgvReads, judgeStale } from './pour-code.mjs'
import { treeBakeInputsForMap, treeLibraryFiles } from './tree-bake-inputs.mjs'
import { terrainValueReads } from './terrainReads.mjs'
import { COAST_FILE } from './coastFile.mjs'
import { pendingPathOf, tolerancePathOf, recordIdentity, coastReadsOf } from './bake-coast.mjs'   // the coast's residual record: one home
import { pourSteps, skeletonStep, runSkeleton, stepReads, recordStep, readBakeReads, runPour, groundForReaders, sceneForReaders, townPourElevation, pourGuardRefusals } from './pourSteps.mjs'
import { readBakeDesign, SEED_STRIPPED_FIELDS } from './lookDesign.mjs'
import { productionDomainFor, askOperations } from './operations-domain.mjs'
import { lookIdFor, isDeclaredOnly, planJoin, executeJoin } from './scene-address.mjs'
import { buildingIdOf } from './membership.mjs'
import { footprintWell } from './footprint-well.mjs'
import { intakeStatusForMap, addAltSource, hasElevationInput, pourPolicyFor } from './intake-rows.mjs'
import { readSources, declaredParcelPaths, declaredAddressPointPaths, sourcesPath, readCroplandSources, readAddressPointSources, readTreeSources, declaredTreeWellPaths } from './sources.js'
import { snapshotApply, restoreApply, clearApplySnapshot } from './applySnapshot.mjs'
import { unionFootprints } from './building-union.mjs'
import { writeIfChanged } from './io.js'
import { splitBoundary, composeBoundary, makeDiscRecord, assertDiscInBox } from './boundaryRecords.mjs'
import tzLookup from 'tz-lookup'
import { commitExtentRecords, flattenBoundaryPath, sameJson } from './commitExtent.mjs'
import { SHARE_IMAGE_RELS, shareImageRel } from '../src/lib/shareCard.js'
import { freshUrl } from '../src/lib/freshUrl.js'
import { HASHED, manifestPath, servedRel } from '../src/lib/slabNames.js'
import { TOD_SLOT_IDS } from '../src/lib/todSlots.js'
import { parcelParts } from './parcelParts.js'
import { stagedSlabStep, publishSlab, refuseTornCommit } from './slabStage.mjs'
import { slabAnchorRefusals } from './anchorGate.mjs'

// Promise wrapper around spawn with shell: true. Matches execSync's
// command-string semantics + timeout option, but the event loop keeps
// serving other requests while the child runs — so `/api/cartograph/*`
// requests don't pend during a long bake.
// `opts.onLine(line)` — stream the child's output line by line (it is still echoed to this terminal);
// `opts.onChild(child)` — hand the child out so an operator's Cancel can stop it.
// ⭐ A REFUSAL REACHES THE OPERATOR WHOLE (Zob's H1 on the re-skeleton, 2026-10-28): a step that refuses prints a `⛔` line saying
// why and what to do next, and the error used to be only "Command failed (code=1…)", while the Bake's lastLine is cut at 240
// characters. So the LAST `⛔` line a command printed leads its error, uncut. `carryRefusal`: pipe the output for it where no
// onLine is passed (Extent's commit and rollback). ▶ checks/claims-the-bake-re-skeletons-a-stale-town.mjs row (5)
function runShell(cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    const piped = !!(opts.onLine || opts.carryRefusal)
    let refusal = null
    const child = spawn(cmd, {
      shell: true,
      stdio: piped ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      cwd: opts.cwd,
      env: opts.env,
    })
    opts.onChild?.(child)
    if (piped) {
      const line = (l) => { if (l.includes('⛔')) refusal = l.replace(/\x1b\[[0-9;]*m/g, '').trim(); opts.onLine?.(l) }
      for (const [src, sink] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
        let buf = ''
        src.on('data', (d) => { sink.write(d); buf += d; const parts = buf.split('\n'); buf = parts.pop(); for (const l of parts) if (l.trim()) line(l) })
        src.on('end', () => { if (buf.trim()) line(buf) })
      }
    }
    let timer = null
    if (opts.timeout) {
      timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error(`Command timed out after ${opts.timeout}ms: ${cmd}`))
      }, opts.timeout)
    }
    child.on('error', (err) => {
      if (timer) clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`${refusal ? `${refusal} — ` : ''}Command failed (code=${code}, signal=${signal}): ${cmd}`))
    })
  })
}

// ⭐ A STOPPED COAST STEP'S PIECES, as Stage's card shows them (Boz's GO, Zob's ruling, 2026-10-29): the pending record the step left
// (bake-coast.mjs#residualRecord), only while its reads are the coast step's reads NOW. A stale or absent one → null: the stop is then
// an ordinary failure, never a question about pieces nobody can see any more. → { scene, identity, n, m2, pieces: [{ path, key, side,
// m2, at }] }
const sameReads = (a, b) => !!a && !!b && Object.keys({ ...a, ...b }).every(f => a[f] === b[f])
function coastResidualAsk(scene) {
  const f = pendingPathOf(scene); if (!existsSync(f)) return null
  let rec; try { rec = JSON.parse(readFileSync(f, 'utf-8')) } catch { return null }
  if (!sameReads(rec.reads, coastReadsOf(scene))) return null
  // a piece the town has already signed says so (its key in coast-tolerance.json): the stop is for the others
  const tol = existsSync(tolerancePathOf(scene)) ? JSON.parse(readFileSync(tolerancePathOf(scene), 'utf-8')) : null
  const signed = new Set(['water', 'decks'].flatMap(path => (tol?.[path]?.sites || []).map(w => `${path}:${w.key}`)))
  const pieces = ['water', 'decks'].flatMap(path => (rec[path]?.sites || []).map(w => ({ path, ...w, signed: signed.has(`${path}:${w.key}`) })))
  return { scene, identity: recordIdentity(rec), n: pieces.length, m2: +pieces.reduce((t, w) => t + w.m2, 0).toFixed(4), pieces, signedAt: tol?.signedAt ?? null }
}

// ⭐⭐ BAKE PROGRESS — the operator sees the bake, step by step, and can stop it.
// Jacob, 2026-09-24: "It's just awkward UX to literally grab the package, go into the office and close the door,
// and leave the customer at the counter wondering what just happened." And the same night a 5-minute wall-clock
// kill (a constant sized for LS — BRIEF-ls-bleed-excision §1 Class D) SIGKILLed provincetown's ground bake and the
// operator saw only "500". So:
//   · NO WALL-CLOCK KILL on a bake step. A no-progress watchdog was considered and rejected: a single Clipper boolean
//     can legitimately print nothing for minutes, so there is no honest silence span to key on. The operator's
//     Cancel is the control, and it names the step it stopped.
//   · every step runs through `runStep` (or is marked by `markStep`), which records state, elapsed time, the last
//     output line, and a real fraction where the step prints `[progress] <what> <i>/<n>` for its own work count;
//   · the step LIST is read from this file's own bake route (`bakePlan`), never a hand copy — so a step added to the
//     route appears in the modal (checks/claims-bake-progress-shows-the-route.mjs);
//   · an estimate is shown only from THIS town's own previous run of that step (`bake-timings.json` beside its map).
const _bakeProgress = new Map()          // lookId → { lookId, scene, startedAt, finishedAt, steps, current, cancel, child }
let _bakePlan = null
function bakePlan() {
  if (_bakePlan) return _bakePlan
  const src = readFileSync(import.meta.filename, 'utf-8')
  const a = src.indexOf("path.match(/^\\/looks\\/([^/]+)\\/bake$/)"), b = src.indexOf('_bakesInFlight.delete(id)', a)
  const body = a >= 0 && b > a ? src.slice(a, b) : ''
  const labels = []
  for (const m of body.matchAll(/(?:runIfDirty\(|runStep\(P, |markStep\(P, )'([\w-]+)'/g)) if (!labels.includes(m[1])) labels.push(m[1])
  return (_bakePlan = labels)
}
function markStep(P, label, state, extra = {}) {
  let st = P.steps.find(x => x.label === label)
  if (!st) { st = { label, state: 'waiting' }; P.steps.push(st) }
  Object.assign(st, { state }, extra)
  return st
}
async function runStep(P, label, cmd, opts = {}) {
  if (P.plan) return   // a PLAN (GET /looks/<id>/bake) runs nothing: runIfDirty has already recorded why the step would run
  if (P.cancel) throw new Error(`cancelled by operator before step "${label}"`)
  const { timeout, ...rest } = opts        // ⛔ no wall-clock kill on a bake step (see above)
  const st = markStep(P, label, 'running', { t0: Date.now(), lastLine: null, frac: null, sub: null })
  P.current = label
  try {
    await runShell(cmd, { ...rest, onChild: (c) => { P.child = c }, onLine: (ln) => {
      st.lastLine = ln.replace(/\x1b\[[0-9;]*m/g, '').slice(0, 240)
      const m = /\[progress\]\s+(.*?)\s*(\d+)\s*\/\s*(\d+)/.exec(ln)
      if (m && +m[3] > 0) { st.frac = +m[2] / +m[3]; st.sub = `${m[1]} ${m[2]}/${m[3]}`.trim() }
    } })
  } catch (e) {
    const why = P.cancel ? `cancelled by operator at step "${label}"` : `step "${label}" failed: ${e.message}`
    markStep(P, label, P.cancel ? 'cancelled' : 'failed', { t1: Date.now(), error: why })
    throw new Error(why)
  } finally { P.child = null; P.current = null }
  markStep(P, label, 'done', { t1: Date.now() })
}
function bakeTimingsPath(mapJson) { return join(dirname(mapJson), 'bake-timings.json') }
function readBakeTimings(mapJson) { try { return JSON.parse(readFileSync(bakeTimingsPath(mapJson), 'utf-8')) } catch { return {} } }
function saveBakeTiming(mapJson, lookId, label, ms) {
  try { const t = readBakeTimings(mapJson); t[`${lookId}:${label}`] = { ms, at: new Date().toISOString() }; writeFileSync(bakeTimingsPath(mapJson), JSON.stringify(t, null, 1)) }
  catch (e) { console.warn(`[bake] could not record the ${label} timing: ${e.message}`) }
}
// What each step read when it last ran (`bake-reads.json`) and the pour's steps: ONE home, cartograph/pourSteps.mjs.

// Like runShell, but CAPTURES stdout/stderr and RESOLVES with the exit code
// instead of rejecting on non-zero — so git callers can inspect the result
// (e.g. "nothing to commit" is code 1, not an exception). Used by the Publish
// ceremony endpoints below.
function runCapture(cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, { shell: true, cwd: opts.cwd, env: opts.env })
    let stdout = '', stderr = ''
    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })
    let timer = null
    if (opts.timeout) timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`Command timed out after ${opts.timeout}ms: ${cmd}`))
    }, opts.timeout)
    child.on('error', (err) => { if (timer) clearTimeout(timer); reject(err) })
    child.on('close', (code) => { if (timer) clearTimeout(timer); resolve({ code, stdout, stderr }) })
  })
}

// ── Publish ceremony (DEV-ONLY) ────────────────────────────────────────────
// Preview's "Publish to Staging" / "Promote to Prod" buttons call the git
// endpoints below. They ship the baked slab the canon way — staging (its own
// URL) → verify → prod — per PREVIEW.md §0.2 (Preview is the publish gate) +
// OPERATIONS §Save→ship (strategy B). serve.js runs ONLY under `npm run dev`,
// never in the CI/prod build, so these endpoints simply don't exist in a
// deployed context — the live app can't reach them.
// Must match `staging.yml`'s trigger branch, or the Publish→staging push lands
// where no workflow watches. Repointed to the trunk 2026-07-08 (26a62407);
// this constant lagged until 2026-07-11. (Per-scene parameterization: PUBLISH.md §0.5.)
// ⛔ READ `.github/workflows/staging.yml`, NEVER MEMORY — this constant has been stale
// before and it fails SILENTLY: the publish panel pushed HEAD to a branch nothing
// deploys, reported success, and staging never moved. `curb-offset-draw` last saw a
// commit on 2026-08-02 while the workflow had moved to `land-use-derivation`.
// ▶ node checks/claims-the-publish-gate-pushes-where-staging-deploys.mjs
const STAGING_BRANCH = 'land-use-derivation'
// Where the baked slab is actually served from. Must match the VITE_ASSET_BASE the
// deployed builds use (.github/workflows/*.yml → repo variable).
const ASSET_BASE_URL = process.env.ASSET_BASE || 'https://assets.theward.online/'
// ⛔ ONE BUCKET, TWO KEY SPACES (2026-09-03). This used to read "one bucket serves every
// environment, per PREVIEW.md §0.2" — true until the prefix split, and the reason
// `/deployed` reported prod's slab under staging's name. ⛔ KEEP IN STEP WITH
// `scripts/upload-baked-to-r2.mjs`'s ENV_PREFIX; the two drifting apart means the panel
// measures a key space nothing writes. ▶ node checks/claims-the-slab-envs-do-not-collide.mjs
const ASSET_ENV_PREFIX = { prod: '', staging: 'staging/' }
// ⛔ THE ONE STAGING HOST FOR EVERY TOWN, and it is a HOST, not an answer: the address of
// a particular pour is `siteUrlsForLook()` below, never this constant on its own.
// ⭐ It is kit-level on purpose (ruled 2026-09-21). It was
// `jacobeugenehenderson.github.io/lafayette-square-staging/`, which is wrong twice over —
// a person's account name AND a town's name, and neither is the product. The Ward is the
// kit-level term; Lafayette Square is installation #1.
// ▶ served by `workers/staging-sites`, one Worker for every town.
const STAGING_SITE_BASE = 'https://staging.theward.online/'

/**
 * The pour a slab key space serves — `bakedAt` of the scene.json its MANIFEST names (`src/lib/slabNames.js`). ⛔ Never the
 * plain `scene.json` key: once a town is content-named its plain keys are a transition artefact the retirement sweep deletes
 * (`scripts/sweep-retired-slab-keys.mjs`), and the manifest is the one file whose name never changes.
 * `base` ends in '/' and holds `baked/…` (an env prefix of the bucket, or a town's own domain).
 * → { bakedAt, named }, or { bakedAt: null, why } when there is no manifest (not published). Anything else answering is thrown.
 */
async function servedPour(base, look) {
  const m = await fetch(freshUrl(`${base}${manifestPath(look)}`))
  if (m.status === 404) return { bakedAt: null, named: false, why: 'no manifest.json' }
  if (!m.ok) throw new Error(`${base}${manifestPath(look)} answered ${m.status}`)
  const manifest = await m.json()
  if (manifest.names != null && manifest.names !== HASHED) throw new Error(`${base}${manifestPath(look)} names its files "${manifest.names}" — the one scheme is "${HASHED}"`)
  const named = manifest.names === HASHED
  const rel = servedRel(manifest, 'scene.json', named)
  const sc = await fetch(freshUrl(`${base}baked/${look}/${rel}`))
  if (!sc.ok) throw new Error(`${base}baked/${look}/${rel} answered ${sc.status} — its manifest names a scene the bucket does not serve`)
  return { bakedAt: (await sc.json()).bakedAt ?? null, named }
}

/**
 * ⭐ THE INSTRUMENT FOR PRODUCTION (BRIEF-production-sites "Can the instrument see it?"): ask the
 * town's own domain which town it names and which pour it serves. Read off the SERVED page and
 * slab, never off what Promote believes it wrote.
 */
async function proveProduction(domain, look, bakedAt, pinned = {}) {
  try {
    const page = await fetch(freshUrl(`https://${domain}/`))
    const html = await page.text()
    if (!page.ok) return { ok: false, why: `https://${domain}/ answered ${page.status}: ${html.slice(0, 160).trim()}` }
    const named = (html.match(/<meta name="ward-look" content="([^"]+)"/) || [])[1] || null
    if (named !== look) return { ok: false, why: `https://${domain}/ names town "${named}", not "${look}"` }
    // ⭐ A Ward town must serve the Ward build it was pinned to, told where ITS kit bundle is.
    if (pinned.player === 'ward') {
      const build = (html.match(/<meta name="ward-build" content="([0-9a-f]+)"/) || [])[1] || null
      if (build !== pinned.ward) return { ok: false, why: `https://${domain}/ serves Ward build ${build}, not ${pinned.ward}` }
      const kitBase = (html.match(/<meta name="ward-kit-base" content="([^"]+)"/) || [])[1] || null
      if (kitBase !== `https://${domain}/kit/${pinned.kit}/`) return { ok: false, why: `https://${domain}/ names kit base ${kitBase}, not its pinned kit ${pinned.kit}` }
      const kit = await fetch(freshUrl(`${kitBase}manifest.json`))
      if (!kit.ok) return { ok: false, why: `its kit bundle answered ${kit.status}` }
    }
    const pour = await servedPour(`https://${domain}/`, look)
    if (pour.why) return { ok: false, why: `its slab has ${pour.why}` }
    const served = pour.bakedAt
    if (bakedAt != null && String(served) !== String(bakedAt)) return { ok: false, why: `it serves the pour of ${served}, not ${bakedAt}` }
    return { ok: true, look: named, bakedAt: served }
  } catch (e) {
    return { ok: false, why: `https://${domain}/ could not be reached: ${e.message}` }
  }
}

/**
 * ⛔⛔ THE ADDRESS IS DERIVED FROM THE LOOK — NEVER PRINTED FROM A CONSTANT.
 *
 * `STAGING_SITE_URL` / `PROD_SITE_URL` were module constants, so the Publish panel
 * reported the SAME two addresses whatever town you shipped — a truthful "published ✓"
 * handing back an address that belongs to another town (`CLAUDE.md` Layer 0 q2, H-18 ③).
 *
 * ⭐ THE STAGING ADDRESS BELONGS TO THE WARD: `staging.theward.online/<map>/`.
 * ⭐ THE PRODUCTION ADDRESS BELONGS TO THE TOWN, AND ITS ONE HOME IS OPERATIONS (2026-09-26):
 * asked, never held here (`cartograph/operations-domain.mjs`). ⛔ Anything short of "owned, and
 * its zone active" is `{ url: null, why }`, and the panel prints the reason.
 */
async function siteUrlsForLook(lookId) {
  const entry = readLooksIndex().looks.find(l => l.id === lookId)
  const mapId = entry?.scene || null
  const noTown = `look '${lookId}' declares no scene, so there is no town to address`

  // ⭐ THE MAP IS THE PATH, AND THAT IS THE ADDRESS A PARTNER IS GIVEN — no query string,
  // because it is an address rather than an invocation. A LOOK that is not its map's own
  // name still needs naming, so it keeps `?look=`; the common case does not.
  const staging = mapId
    ? { url: `${STAGING_SITE_BASE}${mapId}/${lookId === mapId ? '' : `?look=${encodeURIComponent(lookId)}`}` }
    : { url: null, why: noTown }

  let prod
  if (!mapId) prod = { url: null, why: noTown }
  else {
    const d = await productionDomainFor(mapId)
    prod = d.domain ? { url: `https://${d.domain}/`, domain: d.domain } : { url: null, why: d.why }
  }
  return { staging, prod, mapId }
}
// The coherent slab set a publish commits (SLAB-CONTRACT §9): the per-look
// bundle + its source design + the registry + shared derived geometry/trees.
// SCOPED git pathspecs — a publish NEVER sweeps unrelated dirty files (e.g.
// in-flight authoring code under src/cartograph or src/components).
function slabPathspecs(id) {
  // ⭐ A town's COMMITTED ribbons ride ITS OWN Look's publish (declaredRibbonsOf — the town's pour.ribbons): every other
  // town's are generated and gitignored. ⛔ It listed src/data/ribbons.json for EVERY Look — Lafayette Square's ribbons
  // on a Huron publish, by name (G2(b), 2026-10-07).
  const scene = readLooksIndex().looks.find((l) => l.id === id)?.scene
  const ribbons = scene ? declaredRibbonsOf(scene) : null
  return [
    // ⛔ `public/baked/${id}` is DELIBERATELY ABSENT (2026-09-01). The baked tree
    // now lives in R2 and is gitignored; a publish uploads it (the upload step of
    // POST /looks/<id>/publish) rather than committing it. Re-adding it here would stage
    // an ignored path — `git add` would match nothing, `git status --porcelain`
    // would report nothing, and because design.json/index.json keep specs.length
    // non-zero the `if (!specs.length) throw` guard below would NOT fire: the
    // Publish button would return { ok: true } having shipped no slab at all.
    // That is the exact silent success this whole arc exists to prevent.
    `public/looks/${id}/design.json`,
    `public/looks/index.json`,
    ...(ribbons ? [ribbons] : []),
  ]
}

// Per-look bake lock. A double-click on the Stage button would otherwise
// kick off two simultaneous bakes against the same `public/baked/<id>/`
// directory; the second loses races against the first's writes.
const _bakesInFlight = new Set()

// Per-scene file resolver. Every scene resolves through here. The raw/ +
// clean/ split inside each scene matches the existing LS layout (raw = OSM
// ingestion / authored input; clean = derived).
// ⭐ THE POUR OUTSIDE THE BAKE (Extent's re-apply and its first pour) runs the Bake's own steps (pourSteps.mjs) and RECORDS each one
// it runs, under every Look of the scene, so the next Bake judges them done (2026-10-28: LS's Extent Bake asked to re-pour right
// after its own pour). The pipeline's elevation is the town's own `pour.elevation`, agreed across its Looks or refused, read as the
// Bake reads it (pourSteps.mjs#townPourElevation).
function extentPour(scene) {
  const looks = readLooksIndex().looks.filter(l => l.scene === scene).map(l => l.id)
  const elevation = townPourElevation(scene, looks, (lid) => readBakeDesign(lid, scene, `extent pour ${scene}`))
  return { steps: pourSteps(scene, mapDataPaths(scene), ribbonsPathOf(scene), { elevation }), looks }
}
function runExtentPour(scene, { cwd, env }) {
  const pour = extentPour(scene)
  return runPour(pour.steps, { scene, mapJson: mapDataPaths(scene).map, lookIds: pour.looks,
    run: (st, onLine) => runShell(st.cmd, { cwd, env, timeout: st.timeout, ...(onLine && { onLine }) }) })
}
// the skeleton step outside the Bake (Extent's commit and rollback): the same step, recorded under every Look of the scene
function runExtentSkeleton(scene, { cwd, env }) {
  const step = skeletonStep(scene, mapDataPaths(scene))
  return runSkeleton(step, { scene, mapJson: mapDataPaths(scene).map, lookIds: extentPour(scene).looks,
    run: (st) => runShell(st.cmd, { cwd, env, timeout: st.timeout, carryRefusal: true }) })
}
function mapDataPaths(scene) {
  const raw = mapRawDir(scene)
  const clean = mapCleanDir(scene)
  return {
    raw, clean,
    markers:      join(clean, 'marker_strokes.json'),
    measurements: join(raw,   'measurements.json'),
    centerlines:  join(raw,   'centerlines.json'),
    skeleton:     join(clean, 'skeleton.json'),
    overlay:      join(clean, 'overlay.json'),
    map:          join(clean, 'map.json'),
    ribbons:      ribbonsPathOf(scene),   // ⛔ the ONE answer (scene.js): a town's DECLARED pour.ribbons, else clean/ (LS: src/data/ribbons.json)
    // Per-installation fixed-truth, at the scene root (clean/.. = data/<scene>).
    geography:    join(clean, '..', 'geography.json'),
    boundary:     join(clean, '..', 'neighborhood_boundary.json'),
  }
}


// mtime-based dirty check used by the bake chain. Returns true if any output
// is missing or any input is newer than the oldest output. Missing inputs
// are treated as mtime=0 (won't force a rebuild on their own); missing
// outputs always force a rebuild. Both inputs and outputs lists may include
// .js source paths so script edits invalidate downstream artifacts.
/**
 * ⛔⛔ THE NEWEST mtime UNDER A PATH — A DIRECTORY DOES NOT CARRY ITS CHILDREN'S.
 *
 * `statSync('src').mtimeMs` changes only when an entry is added to or removed from `src`
 * ITSELF; editing `src/components/SidePanel.jsx` does not move it. So handing a directory
 * to a plain mtime gate makes every edit inside it invisible.
 *
 * Instance, 2026-09-21: the Publish button's player step used `needsRebuild([... 'src'], [stamp])`
 * and therefore SKIPPED the rebuild after four files under `src/` changed — the operator
 * pressed Publish, it thought for a while, reported success, and staging kept serving the
 * previous build including the crash he had just asked to have fixed. A publish that
 * reports success and ships nothing is the exact defect the publish panel exists to
 * prevent. (`arborist/serve.js#maxMtimeOf` already walked; this side did not.)
 * ⛔ Unreadable ⇒ Infinity ⇒ dirty. Never skip on a stat we could not take.
 */
function newestMtime(p) {
  let st
  try { st = statSync(p) } catch { return Infinity }
  if (!st.isDirectory()) return st.mtimeMs
  let max = st.mtimeMs
  for (const e of readdirSync(p)) {
    const m = newestMtime(join(p, e))
    if (m > max) max = m
  }
  return max
}

/**
 * ⛔ THE PLAYER'S SOURCES — ONE LIST, and `scripts/publish-player-to-staging.mjs` carries
 * the same one. The status read asks "is the published player behind these?"; the publish
 * step asks "must I rebuild from these?" Two lists would make the button lie.
 */
const PLAYER_SRC = ['src', 'index.html', 'vite.config.js', 'package.json']
const playerSrcPaths = (root) => PLAYER_SRC.map((p) => join(root, p))

/**
 * ⭐ IS STAGING'S PLAYER BEHIND THE SOURCE? — ONE ANSWER, read by the status (the button's label) and by Publish (whether
 * it rebuilds). Read off the published artifact: its build marker records the newest source mtime that build was made
 * from. It replaced a local `.player-published` stamp Publish kept for itself, so the label and the act can no longer
 * disagree (2026-10-05, BRIEF-publish-is-the-upload).
 * ⛔ NO MARKER ⇒ STALE. An unstamped player was published before this existed, or there is none, or the bucket is
 * unreachable; the honest answer to each is "not known to be current".
 */
async function stagingPlayerState(root) {
  try {
    const r = await fetch(freshUrl(`${ASSET_BASE_URL}staging/player/build.json`))
    if (!r.ok) return { published: false, stale: true, why: `no build marker at staging/player/build.json (HTTP ${r.status})` }
    const m = await r.json()
    const localSrc = Math.max(...playerSrcPaths(root).map(newestMtime))
    const stale = !(m.srcMtimeMs > 0) || localSrc > m.srcMtimeMs
    return { published: true, stale, builtAt: m.builtAt ?? null,
      why: stale ? 'the player on staging was built before your latest source change' : null }
  } catch (e) { return { published: false, stale: true, why: `staging's player could not be read: ${e.message}` } }
}

/**
 * ⭐ DOES THIS ENVIRONMENT CARRY THE TOWN'S DEPLOYMENT? Preview's deployment panel autosaves `deployment.json`; Publish
 * freezes it into the manifest and ships it, and Promote copies that manifest to production. Compared with the manifest
 * the environment SERVES, never the local one, because the local one is rewritten by every bake and says nothing about
 * what a visitor gets. ⭐ `bakedAt` cannot answer this: a deployment-only Publish re-freezes the manifest without a bake,
 * so two environments can share a `bakedAt` and differ in what they ship. `null` = could not be read (not "shipped").
 */
async function deploymentShipped(map, look, env) {
  const fileP = join(import.meta.dirname, 'data', map, 'deployment.json')
  const local = existsSync(fileP) ? readDeployment(JSON.parse(readFileSync(fileP, 'utf8')), `cartograph/data/${map}/deployment.json`) : { authored: false }
  try {
    const r = await fetch(freshUrl(`${ASSET_BASE_URL}${ASSET_ENV_PREFIX[env]}baked/${look}/manifest.json`))
    if (!r.ok) return { shipped: false }
    const served = (await r.json()).deployment ?? null
    return { shipped: JSON.stringify(served) === JSON.stringify(local) }
  } catch { return { shipped: null } }
}

// ⭐ The pour's code closure, its content record and the geography it read live in `pour-code.mjs` — pipeline.js
// stamps the record, this file compares it, and one module means the two can never disagree about what counts.

function needsRebuild(inputs, outputs) {
  const outMtimes = outputs.map(o => existsSync(o) ? statSync(o).mtimeMs : 0)
  if (outMtimes.some(t => t === 0)) return true
  const minOut = Math.min(...outMtimes)
  // ⛔ `newestMtime`, not `statSync` — an input may be a DIRECTORY, and a directory's own
  // mtime says nothing about the files under it. See the header above.
  const inMtimes = inputs.map(i => existsSync(i) ? newestMtime(i) : 0)
  const maxIn = inMtimes.length ? Math.max(...inMtimes) : 0
  return maxIn > minOut
}
// ── Extent editor: OSM label extraction ─────────────────────────────────────
// One label per named street, from raw/osm.json's ground.highway (coords carry
// the scene's local x/z). Mirrors src/lib/streetLabels.js's placement (longest
// way per name → arclength-midpoint + local angle normalized to read L→R), but
// scene-agnostic and PRE-skeleton. `major` = the vocabulary's major label tier
// (streetClass.js `labelMajor`). Cached by file mtime (the 18 MB parse runs once per fetch).
const _osmLabelCache = new Map()   // scene → { mtime, labels }
function computeLabelsFromOsm(osm) {
  const feats = (osm.ground && osm.ground.highway) || []
  const byName = new Map()
  for (const f of feats) {
    const name = f.tags && f.tags.name
    const coords = f.coords
    if (!name || !coords || coords.length < 2) continue
    const segLens = []
    let total = 0
    for (let i = 0; i < coords.length - 1; i++) {
      const L = Math.hypot(coords[i + 1].x - coords[i].x, coords[i + 1].z - coords[i].z)
      segLens.push(L); total += L
    }
    if (total === 0) continue
    const prev = byName.get(name)
    if (prev && prev._total >= total) continue
    let acc = 0, si = 0
    const half = total / 2
    for (; si < segLens.length - 1; si++) { if (acc + segLens[si] >= half) break; acc += segLens[si] }
    const t = segLens[si] > 0 ? (half - acc) / segLens[si] : 0
    const a = coords[si], b = coords[si + 1]
    let angle = Math.atan2(b.z - a.z, b.x - a.x)
    if (angle > Math.PI / 2) angle -= Math.PI
    if (angle < -Math.PI / 2) angle += Math.PI
    // Return the midpoint as lon/lat (frame-independent). The baked x/z here may
    // be in a STALE projection (fetched before a re-center), so the client
    // re-projects lon/lat through the LIVE geography — the same frame the aerial
    // uses — guaranteeing labels sit on their roads. Angle is translation-
    // invariant so the metric value is safe to pass through.
    byName.set(name, {
      name,
      lon: a.lon + (b.lon - a.lon) * t,
      lat: a.lat + (b.lat - a.lat) * t,
      angle,
      major: labelMajor(f.tags),
      cls: f.tags.highway,
      _total: total,
    })
  }
  return [...byName.values()].map(({ _total, ...l }) => l)
}
// The curbed minimum width per scene, re-read when the town's raw OSM (its state vote) or the registry changes. A missing
// osm.json is not cached: curbedMinWidthOf labels the state unknown, and a later fetch must be seen.
const _cmwCache = new Map()   // scene → { key, value }
function curbedMinWidthCached(scene) {
  const osmP = join(mapRawDir(scene), 'osm.json')
  if (!existsSync(osmP)) return curbedMinWidthOf(scene)
  const key = `${statSync(osmP).mtimeMs}|${statSync(REGISTRY_PATH).mtimeMs}`
  const hit = _cmwCache.get(scene)
  if (hit?.key === key) return hit.value
  const value = curbedMinWidthOf(scene)
  _cmwCache.set(scene, { key, value })
  return value
}

function getOsmLabels(scene) {
  const p = join(mapRawDir(scene), 'osm.json')
  if (!existsSync(p)) return []
  const mtime = statSync(p).mtimeMs
  const cached = _osmLabelCache.get(scene)
  if (cached && cached.mtime === mtime) return cached.labels
  const labels = computeLabelsFromOsm(JSON.parse(readFileSync(p, 'utf-8')))
  _osmLabelCache.set(scene, { mtime, labels })
  return labels
}

// ── Extent editor: boundary corners from named sides (the REAL path) ─────────
// The corner between two consecutive boundary streets is a typed skeleton
// JUNCTION both streets pass through — the protocol's own intersection, not an
// ad-hoc raw-OSM segment crossing. Marks are not needed: the operator names the
// sides in order (reading them off the labeled aerial); the tool finds the
// junction where each consecutive pair meets, clusters near-duplicates, and
// returns the polygon + its area-weighted centroid (the neighborhood's
// geographic center) + a circumscribing radius. A pair that shares no junction
// returns no corner → the polygon won't close → the operator fixes the list by
// eye. Reads the CURRENT-frame skeleton (reproject-raw + skeleton must be fresh).
// A name the skeleton made up for an UNNAMED way ("primary_link 2", "residential
// 7") is an id, not a place — noise for a boundary picker or a label. The
// skeleton stamps `synthetic: true` on those streets; this reads that flag and
// nothing else, so a REAL name (Forest Park Parkway) is never dropped by class.
const isSynthetic = (s) => s.synthetic === true
const _streetLookupCache = new Map()   // scene → { mtime, skel }
// The street lookup the boundary picker reads: names, geometry, junctions.
//
// Prefers the real skeleton when it exists (post-Bake) and falls back to the
// pre-Bake street index (`skeleton.js --index`). Both carry {streets[{name,
// corridor, highway, points}], junctions[{x,z,degree,kind}]}, which is all any
// caller here uses — street-names, streets-geom, and the corner resolver.
//
// ⛔ This is the ONLY thing allowed to read the index. It is a lookup table, not a
// frame; nothing downstream of the Wall may consume it, and nothing may derive
// geometry from it.
function getStreetLookup(scene) {
  const dir = mapCleanDir(scene)
  let p = join(dir, 'skeleton.json')
  if (!existsSync(p)) {
    p = join(dir, 'street-index.json')
    if (!existsSync(p)) return null
  }
  const mtime = statSync(p).mtimeMs
  const cached = _streetLookupCache.get(scene)
  if (cached && cached.mtime === mtime && cached.path === p) return cached.skel
  const skel = JSON.parse(readFileSync(p, 'utf8'))
  // ⛔ A skeleton from before `synthetic` was stamped would show its made-up
  // names in the picker. Say so, loudly, once per load — the fix is a re-run.
  const stale = (skel.streets || []).filter(s => !s.synthetic && s.highway && new RegExp(`^${s.highway} \\d+$`).test(s.name || '')).length
  if (stale) console.warn(`⛔ [${scene}] ${stale} skeleton-made street name(s) lack \`synthetic\` — stale ${p.split('/').pop()}; run skeleton.js --scene=${scene}`)
  _streetLookupCache.set(scene, { mtime, path: p, skel })
  return skel
}
function distPointToChains(j, chains) {
  let best = Infinity
  for (const s of chains) {
    const pts = s.points
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1]
      const dx = b.x - a.x, dz = b.z - a.z
      const len2 = dx * dx + dz * dz || 1
      let t = ((j.x - a.x) * dx + (j.z - a.z) * dz) / len2
      t = Math.max(0, Math.min(1, t))
      const d = Math.hypot(j.x - (a.x + t * dx), j.z - (a.z + t * dz))
      if (d < best) best = d
    }
  }
  return best
}
const CORNER_EPS = 12       // a junction is "on" a street if within this (m)
const CORNER_CLUSTER = 45   // merge junctions closer than this into one corner
// Cardinal (8-way) of an offset in the DATA frame — +x = EAST, +z = SOUTH
// (config.js: x=(lon−lon0)·k east+, z=(lat0−lat)·k south+). So North = −z.
function cardinalOf(dx, dz) {
  const deg = (Math.atan2(-dz, dx) * 180 / Math.PI + 360) % 360   // 0°=E, 90°=N
  return ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'][Math.round(deg / 45) % 8]
}

// The HEALED boundary-street process — ORDER-INDEPENDENT visual selection.
// The operator clicks the real boundary streets on the aerial (any order, N of
// them, not 4 cardinal slots). We assemble the perimeter ring from the junctions
// the selected streets share: a corner is a degree≥3 junction that TWO selected
// streets both touch; two streets are adjacent if they share a corner; a clean
// perimeter is a single cycle where every street has exactly two boundary
// neighbours. Returns the polygon + per-street `connected` + the `gaps` (streets
// that don't yet close), so the operator sees exactly what to fix. This sidesteps
// the name-unreliability the perimeter doctrine warns about — selection is on the
// hydrated geometry, not typed names driving geometry.
function computeBoundaryFromSelection(scene, names) {
  const skel = getStreetLookup(scene)
  if (!skel) return { error: `no skeleton.json for scene '${scene}'` }
  const r2 = (v) => Math.round(v * 100) / 100
  const uniq = [...new Set((names || []).map(n => (n || '').trim()).filter(Boolean))]
  const chainsOf = (nm) => skel.streets.filter(s => (s.name === nm || s.corridor === nm) && s.points && s.points.length >= 2)
  const junctions = skel.junctions.filter(j => j.degree >= 3)
  // Per selected street: the junctions it touches (a corner candidate is a junction
  // two streets share). Precomputed once so pairwise adjacency is set-intersection.
  const info = uniq.map(nm => {
    const chains = chainsOf(nm)
    const touched = new Set()
    for (let ji = 0; ji < junctions.length; ji++) if (distPointToChains(junctions[ji], chains) < CORNER_EPS) touched.add(ji)
    return { name: nm, touched, polylines: chains.map(c => c.points.map(p => [r2(p.x), r2(p.z)])) }
  })
  const byName = new Map(info.map(s => [s.name, s]))
  // The corner between two streets = the junction they share NEAREST the framed
  // center (origin) — two long arterials can cross twice; the boundary corner is
  // the one that bounds the neighborhood.
  const cornerBetween = (a, b) => {
    const A = byName.get(a), B = byName.get(b)
    if (!A || !B) return null
    let best = null
    for (const ji of A.touched) {
      if (!B.touched.has(ji)) continue
      const j = junctions[ji], d2 = j.x * j.x + j.z * j.z
      if (!best || d2 < best.d2) best = { d2, pt: { x: r2(j.x), z: r2(j.z) } }
    }
    return best ? best.pt : null
  }
  const adj = new Map(uniq.map(n => [n, []]))
  for (let i = 0; i < uniq.length; i++) for (let k = i + 1; k < uniq.length; k++) {
    if (cornerBetween(uniq[i], uniq[k])) { adj.get(uniq[i]).push(uniq[k]); adj.get(uniq[k]).push(uniq[i]) }
  }
  // Gaps: streets not sitting on exactly two boundary neighbours (a clean ring is
  // degree-2 everywhere). 0 or 1 → dangling; 3+ → an interior street was picked.
  const gaps = uniq.filter(n => adj.get(n).length !== 2)
  // Walk the ring (order-independent): from any street, follow un-visited neighbours.
  let ordered = uniq
  if (uniq.length >= 3 && gaps.length === 0) {
    const visited = new Set(); const walk = []
    let prev = null, cur = uniq[0]
    while (cur && !visited.has(cur)) {
      walk.push(cur); visited.add(cur)
      const nbrs = adj.get(cur).filter(n => n !== prev)
      prev = cur
      cur = nbrs.find(n => !visited.has(n))
    }
    if (walk.length === uniq.length) ordered = walk   // a single clean cycle
  }
  const closed = uniq.length >= 3 && gaps.length === 0 && ordered.length === uniq.length
    && !!cornerBetween(ordered[ordered.length - 1], ordered[0])
  const corners = []
  if (closed) for (let i = 0; i < ordered.length; i++) {
    const c = cornerBetween(ordered[i], ordered[(i + 1) % ordered.length])
    if (c) corners.push(c)
  }
  // Area-weighted centroid + circumscribing radius (same construction as the sides path).
  let centroid = null
  if (corners.length >= 3) {
    let Ar = 0, cx = 0, cz = 0
    for (let i = 0; i < corners.length; i++) {
      const p = corners[i], q = corners[(i + 1) % corners.length]
      const cr = p.x * q.z - q.x * p.z
      Ar += cr; cx += (p.x + q.x) * cr; cz += (p.z + q.z) * cr
    }
    Ar *= 0.5
    if (Math.abs(Ar) > 1) centroid = { x: r2(cx / (6 * Ar)), z: r2(cz / (6 * Ar)) }
  }
  if (!centroid && corners.length) {
    let cx = 0, cz = 0; for (const c of corners) { cx += c.x; cz += c.z }
    centroid = { x: r2(cx / corners.length), z: r2(cz / corners.length) }
  }
  let radius = 0
  if (centroid) for (const c of corners) radius = Math.max(radius, Math.hypot(c.x - centroid.x, c.z - centroid.z))
  const streets = info.map(s => {
    let direction = null
    if (centroid && s.polylines.length) {
      let sx = 0, sz = 0, n = 0
      for (const pl of s.polylines) for (const [x, z] of pl) { sx += x; sz += z; n++ }
      if (n) direction = cardinalOf(sx / n - centroid.x, sz / n - centroid.z)
    }
    return { name: s.name, polylines: s.polylines, direction, connected: adj.get(s.name).length === 2 }
  })
  return { corners, centroid, radius: Math.round(radius), ordered, gaps, streets, closed, source: 'selected' }
}

// All named streets' polylines for the clickable boundary-selection layer — one
// entry per chain (corridor-collapsed name), synthetic-highway names dropped.
function streetsGeomFor(scene) {
  const skel = getStreetLookup(scene)
  if (!skel) return { streets: [] }
  const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary'])
  const r2 = (v) => Math.round(v * 100) / 100
  const streets = []
  for (const s of skel.streets) {
    if (!s.name || isSynthetic(s) || !s.points || s.points.length < 2) continue
    streets.push({ name: s.corridor || s.name, major: MAJOR.has(s.highway || ''), points: s.points.map(p => [r2(p.x), r2(p.z)]) })
  }
  return { streets }
}

// Aerial labels for the Extent view — sourced from the SKELETON (welded chains,
// corridor-collapsed) so a directional corridor shows ONE label ("Big Bend
// Boulevard") instead of North/South separately. One label per corridor/street
// at the longest chain's arclength-midpoint + local angle (normalized to read
// L→R). Coords are the skeleton's current-frame x/z (reproject-raw keeps them
// aligned to the live geography / aerial). `major` = arterial class.
function skeletonLabelsFor(scene) {
  const skel = getStreetLookup(scene)
  if (!skel) return []
  const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary'])
  const groups = new Map()   // label → { chains, major }
  for (const s of skel.streets) {
    if (!s.name || !s.points || s.points.length < 2) continue
    const hw = s.highway || ''
    if (isSynthetic(s)) continue
    const label = s.corridor || s.name
    let g = groups.get(label)
    if (!g) { g = { chains: [], major: false }; groups.set(label, g) }
    g.chains.push(s)
    if (MAJOR.has(hw)) g.major = true
  }
  const labels = []
  for (const [label, g] of groups) {
    let best = null
    for (const s of g.chains) {
      const pts = s.points, segLens = []
      let total = 0
      for (let i = 0; i < pts.length - 1; i++) {
        const L = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z)
        segLens.push(L); total += L
      }
      if (total === 0 || (best && total <= best.total)) continue
      let acc = 0, si = 0
      const half = total / 2
      for (; si < segLens.length - 1; si++) { if (acc + segLens[si] >= half) break; acc += segLens[si] }
      const t = segLens[si] > 0 ? (half - acc) / segLens[si] : 0
      const a = pts[si], b = pts[si + 1]
      let angle = Math.atan2(b.z - a.z, b.x - a.x)
      if (angle > Math.PI / 2) angle -= Math.PI
      if (angle < -Math.PI / 2) angle += Math.PI
      best = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, angle, total }
    }
    if (best) labels.push({
      name: label,
      x: Math.round(best.x * 100) / 100,
      z: Math.round(best.z * 100) / 100,
      angle: Math.round(best.angle * 1000) / 1000,
      major: g.major,
    })
  }
  return labels
}

// ── Extent editor: ZIP seed (intake head) ───────────────────────────────────
// zip → centroid (geocode) → provisional geography.json → fetch.js → skeleton.js.
// The cold-start for a new hood; also the re-scope for an existing one. A fresh
// fetch projects x/z through the just-written geography, so no reproject-raw is
// needed here (that lever is for a re-center WITHOUT a re-fetch, §11).
const _seedsInFlight = new Set()
// Frame-then-fetch: the operator frames the neighborhood on the (global) aerial;
// we fetch over EXACTLY that bbox, centered on it. Guarantee: a street visible in
// the framed view falls in the bbox → is fetched → is nameable. Center = bbox
// midpoint; a re-center within this bbox later = reproject-raw + skeleton (no
// re-fetch), growing beyond it needs a re-fetch (§11).
function writeGeographyFromBbox(scene, bbox) {
  const r5 = (v) => Math.round(v * 1e5) / 1e5
  const lat = (bbox.minLat + bbox.maxLat) / 2, lon = (bbox.minLon + bbox.maxLon) / 2
  const lonToMeters = Math.round(111320 * Math.cos((lat * Math.PI) / 180))
  const latToMeters = 111000
  const geo = {
    _comment: `Provisional — the operator FRAMED this extent on the aerial; fetched over exactly this bbox (frame-then-fetch: a street visible in-frame is in the data). Re-center to the boundary-polygon centroid on commit. ⚠️ timezone is a Central-US default — set per location when tz lookup lands.`,
    lat: r5(lat), lon: r5(lon),
    timezone: 'America/Chicago',
    lonToMeters, latToMeters,
    bbox: { minLat: r5(bbox.minLat), maxLat: r5(bbox.maxLat), minLon: r5(bbox.minLon), maxLon: r5(bbox.maxLon) },
  }
  const p = mapDataPaths(scene).geography
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(geo, null, 2))
  return geo
}

// Best-effort record count of a fetched artifact — so fetch-extent can report a
// per-source "buildings ✓ 6,340". Robust to the various shapes (raw array /
// {elements} / {buildings} / {parcels} / {features}); 0 if absent or unreadable.
function countJson(p) {
  try {
    if (!existsSync(p)) return 0
    const j = JSON.parse(readFileSync(p, 'utf8'))
    if (Array.isArray(j)) return j.length
    for (const k of ['elements', 'buildings', 'parcels', 'features']) if (Array.isArray(j[k])) return j[k].length
    return 0
  } catch { return 0 }
}

// ── Extent editor: place-name geocode (Nominatim) ───────────────────────────
// The search box that replaces the ZIP field (a hood spans several ZIPs; a ZIP
// spans several hoods — ZIP is the wrong seed). The operator types one or more
// anchors joined by '+', each an independent geocode; we UNION their bounding
// boxes into a framing bbox. It only has to get CLOSE — the boundary streets (or
// the operator's eye) do the real defining — so a coarse union that CONTAINS the
// area is the goal, not precision. Composite hoods (HiPointe + De Mun) are
// literally searched as the sum of their parts. A SINGLE anchor that resolves to
// a real boundary relation (a place with an OFFICIAL boundary — a town, a CDP, a
// named neighborhood) ALSO returns that polygon as the best-guess extent (§0.0):
// Altadena / Provincetown / LS do the lifting, and the operator overrides by
// naming streets. Nominatim etiquette: a descriptive UA + spaced requests.
// Split an operator's seed into anchors. '+' always splits. A comma splits only
// where it is unambiguous: every comma-separated part must look like a whole anchor
// on its own — a postal code, or a name short enough to have no internal qualifier.
// ⛔ "Huron, Erie County, Ohio" must NOT become three anchors; "44839, 44870" must.
function splitAnchors(q) {
  const byPlus = q.split('+').map(t => t.trim()).filter(Boolean)
  const out = []
  for (const part of byPlus) {
    const pieces = part.split(',').map(t => t.trim()).filter(Boolean)
    const allStandalone = pieces.length > 1 && pieces.every(t => /^[A-Za-z]?\d{4,6}$/.test(t) || /^[\p{L}\d .'\-–]{2,28}$/u.test(t))
    const anyPostal = pieces.some(t => /^[A-Za-z]?\d{4,6}$/.test(t))
    // A list of postcodes is unambiguous. A list of bare words is not — "Huron, Ohio"
    // is one place, not two — so only split on comma when a postal code is involved.
    if (allStandalone && anyPostal) out.push(...pieces)
    else out.push(part)
  }
  return out
}

// The largest outer ring of a Polygon/MultiPolygon, or null.
function outerRing(g) {
  if (!g) return null
  if (g.type === 'Polygon') return g.coordinates[0]
  if (g.type === 'MultiPolygon') return g.coordinates.map(pp => pp[0]).sort((A, B) => B.length - A.length)[0]
  return null
}

async function geocodePlace(q) {
  // ⭐ COMMA IS THE RULED SEPARATOR — `EXCAVATION-DIARY §0.3`, "The seed — place name
  // OR comma-separated postal codes… Union them, pad, square, fetch light." The code
  // shipped '+' and the operator reached for commas, because the spec says commas.
  // Both are accepted: '+' keeps every existing query working, and a comma inside a
  // single anchor ("Huron, Erie County, Ohio") still has to survive — so a comma only
  // splits when BOTH sides look like standalone anchors (a bare postcode, or a short
  // name with no internal comma). Anything ambiguous stays one anchor.
  const anchors = splitAnchors(String(q || ''))
  if (!anchors.length) throw new Error('empty search')
  const UA = 'cartograph/1.0 (neighborhood pour; jacob@jacobhenderson.studio)'
  const out = []
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity
  let official = null
  // ⭐ THE TINT — the coverage the operator actually asked for, one shape per anchor,
  // unioned by the client and drawn as a wash. `§0.3`: "Union them, pad, square, fetch
  // light." It is what the padded square is built around, and what the disc radius
  // first circumscribes, so the square centres the circle by construction.
  // ⛔ Distinct from `official`: coverage is ALWAYS returned and is never adoptable;
  // official is the single-anchor administrative ring you can promote to a boundary.
  // A postcode gives no polygon (Nominatim returns a Point), so its coverage is its
  // BOX — honest about being coarse rather than inventing a shape.
  const coverage = []
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i]
    if (i > 0) await new Promise(r => setTimeout(r, 500))
    let r = null
    try {
      const u = `https://nominatim.openstreetmap.org/search?format=json&limit=1&polygon_geojson=1&q=${encodeURIComponent(a)}`
      const resp = await fetch(u, { headers: { 'User-Agent': UA } })
      const j = await resp.json()
      r = Array.isArray(j) && j[0] ? j[0] : null
    } catch { r = null }
    if (!r || !r.boundingbox) { out.push({ q: a, ok: false }); continue }
    let [s, n, w, e] = r.boundingbox.map(Number)
    // A point-like result (POI/address) has a razor-thin bbox — pad to ~1.2 km so
    // it still frames a neighborhood-scale area.
    if ((n - s) * 111000 < 200) {
      const lat = Number(r.lat), lon = Number(r.lon)
      const dLat = 600 / 111000, dLon = 600 / (111320 * Math.cos(lat * Math.PI / 180))
      s = lat - dLat; n = lat + dLat; w = lon - dLon; e = lon + dLon
    }
    minLat = Math.min(minLat, s); maxLat = Math.max(maxLat, n)
    minLon = Math.min(minLon, w); maxLon = Math.max(maxLon, e)
    out.push({ q: a, ok: true, displayName: r.display_name, cls: r.class, kind: r.type })
    // Coverage for THIS anchor: its real outline when it has one, else its box.
    const cov = outerRing(r.geojson)
    coverage.push(cov && cov.length >= 3
      ? { shape: 'ring', ring: cov, q: a, cls: r.class, kind: r.type }
      : { shape: 'box', ring: [[w, s], [e, s], [e, n], [w, n]], q: a, cls: r.class, kind: r.type })
    // Official boundary — only for a SINGLE anchor (a composite has no one clean
    // polygon). Take the largest outer ring of a Polygon/MultiPolygon boundary.
    //
    // ⚠️ The gate accepts TWO shapes of answer, and must accept no more:
    //   boundary=*        — an administrative unit (European city districts, US
    //                       municipalities). Księży Młyn, Centrum, Altadena.
    //   place=neighbourhood|suburb|quarter|borough|city_district|town|village|city
    //                     — how neighborhoods are ACTUALLY tagged in the US, as a
    //                       way/relation rather than an admin boundary.
    //
    // It used to accept only `boundary`, which silently discarded the second case:
    // Park Slope returns class=place/type=neighbourhood with a clean 13-point
    // Polygon and we threw it away — i.e. we were blindest exactly where US towns
    // live. (2026-07-20)
    //
    // ⛔ Do NOT widen further to "any geojson". DeMun has no gazetteer entry, so the
    // search falls through to `leisure=park` "DeMun Park" — accepting that would
    // hand the operator a PARK as their neighborhood boundary, confidently and
    // wrongly. A bad polygon is worse than none; `cls`/`kind` ride along so the UI
    // can say what actually matched.
    const PLACE_KINDS = new Set(['neighbourhood', 'neighborhood', 'suburb', 'quarter', 'borough', 'city_district', 'town', 'village', 'city', 'hamlet'])
    const ringable = r.class === 'boundary' || (r.class === 'place' && PLACE_KINDS.has(r.type))
    if (anchors.length === 1 && ringable && r.geojson) {
      const ring = outerRing(r.geojson)
      if (ring && ring.length >= 3) {
        let Ar = 0, cx = 0, cy = 0
        for (let k = 0; k < ring.length; k++) {
          const [x1, y1] = ring[k], [x2, y2] = ring[(k + 1) % ring.length]
          const cr = x1 * y2 - x2 * y1; Ar += cr; cx += (x1 + x2) * cr; cy += (y1 + y2) * cr
        }
        Ar *= 0.5
        const centroidLL = Math.abs(Ar) > 1e-12
          ? { lon: cx / (6 * Ar), lat: cy / (6 * Ar) }
          : { lon: (w + e) / 2, lat: (s + n) / 2 }
        official = { ring, centroidLL, displayName: r.display_name }
      }
    }
  }
  if (!isFinite(minLat)) throw new Error('no anchor matched')
  return { bbox: { minLat, maxLat, minLon, maxLon }, anchors: out, official, coverage }
}

// One street's geometry (its chains, corridor-aware) for the Extent dropdown
// HOVER preview — the operator sees exactly where a candidate lies before
// selecting it (Clayton Road vs Clayton Avenue), so they never have to guess.
function streetGeom(scene, name) {
  const skel = getStreetLookup(scene)
  if (!skel || !name) return { polylines: [] }
  const r2 = (v) => Math.round(v * 100) / 100
  const chains = skel.streets.filter(s => (s.name === name || s.corridor === name) && s.points && s.points.length >= 2)
  return { polylines: chains.map(c => c.points.map(p => [r2(p.x), r2(p.z)])) }
}

// Read `neighborhood_boundary.json` as its THREE RECORDS — disc / membership /
// exclusions (`EXTENT-DESIGN §5.1`, `boundaryRecords.mjs`). Both write routes start
// from this instead of constructing a fresh object, which is what stopped the disc
// clobbering LS's authored fade set: preservation is the structure, not a branch.
// → null when the scene has no boundary yet (a first pour). ⛔ A boundary that
// EXISTS but does not parse or is missing a field THROWS, naming it — the old code
// swallowed that into "first pour" and wrote defaults over it.
function readBoundaryRecords(scene) {
  const p = mapDataPaths(scene).boundary
  if (!existsSync(p)) return null
  return splitBoundary(JSON.parse(readFileSync(p, 'utf8')), `${scene}/neighborhood_boundary.json`)
}

// Street names for the Extent dropdown — sourced from the skeleton (welded,
// corridor-collapsed) so a directional corridor shows as ONE entry ("Big Bend
// Boulevard", not North/South separately). Grouped major (arterials) / minor,
// each A→Z; synthetic motorway/link names excluded (not boundary streets).
function streetNamesFor(scene) {
  const skel = getStreetLookup(scene)
  if (!skel) return { major: [], minor: [] }
  const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary'])
  const byLabel = new Map()   // label → isMajor (a corridor is major if any member is)
  for (const s of skel.streets) {
    if (!s.name) continue
    const hw = s.highway || ''
    if (isSynthetic(s)) continue
    const label = s.corridor || s.name
    byLabel.set(label, (byLabel.get(label) || false) || MAJOR.has(hw))
  }
  const major = [], minor = []
  for (const [label, isMajor] of byLabel) (isMajor ? major : minor).push(label)
  const az = (a, b) => a.localeCompare(b)
  return { major: major.sort(az), minor: minor.sort(az) }
}

// Building footprints for the Extent tool's live overlay + roster editor — every
// Building footprints for the Extent overlay — the RAW full MSBF fetch, tagged
// `msbf-<id>` (the id space the pour bakes + buildingOverrides key on), in the
// current frame (x/z, reproject-raw keeps them aligned to the aerial). Extent is the
// AUTHORING surface: it must show EVERY fetched building so the operator can add OR
// subtract any of them — the culled slab (map.json) can only ever subtract and is
// frozen at the last bake, so it's wrong here (it's what the Designer reads
// downstream). mtime-cached — the big parse runs once, not per request.
const _footprintCache = new Map()   // scene → { mtime, payload }
function buildingFootprintsFor(scene) {
  // Prefer MSBF (the id-space the US pour bakes on); fall back to OSM buildings
  // so the authoring overlay is DETERMINISTIC everywhere. The MSBF mirror is
  // US-only (fetch-msbf aborts off-continent → no msbf.json), but fetch.js
  // ALWAYS writes OSM buildings into osm.json. What the operator sees while
  // framing == what pours (Jacob, 2026-07-18: no indeterminance). The pour's
  // buildingSource fallthrough (pipeline.js curated→msbf→'osm') mirrors this.
  const msbfPath = footprintWell(scene).path      // the town's footprint geometry well (footprint-well.mjs)
  const osmPath  = join(mapRawDir(scene), 'osm.json')
  const src = existsSync(msbfPath) ? msbfPath : (existsSync(osmPath) ? osmPath : null)
  if (!src) return { buildings: [] }
  const mtime = statSync(src).mtimeMs
  const cached = _footprintCache.get(scene)
  if (cached && cached.mtime === mtime && cached.src === src) return cached.payload
  const raw = JSON.parse(readFileSync(src, 'utf-8'))
  // ⭐ The SAME union the pour uses (building-union.mjs), so Extent shows every building the
  // pour will: MSBF where it has one, plus what only OSM mapped.
  if (src === msbfPath && existsSync(osmPath)) {
    raw.buildings = unionFootprints(raw.buildings || [], JSON.parse(readFileSync(osmPath, 'utf-8')).buildings || []).buildings
  }
  const buildings = []
  for (const b of (raw.buildings || [])) {
    const ring = (b.coords || []).map(c => [c.x, c.z])
    if (ring.length < 3) continue
    // The one minter (membership.mjs#buildingIdOf) — the id the pour bakes and buildingOverrides key on.
    const id = buildingIdOf(b)
    if (id != null) buildings.push({ id, ring })
  }
  const payload = { buildings }
  _footprintCache.set(scene, { mtime, src, payload })
  return payload
}

// Looks: each Look is a styling snapshot — a complete material palette plus
// the per-Look bake bundle (ground.json + bin + lightmap + buildings + lamps
// + scene snapshot) under public/baked/<id>/. design.json (authoring state)
// lives under public/looks/<id>/. index.json tracks names + order; the
// default Look is the project's 0-state and can't be deleted.
//
// ⛔⛔ THE 0-STATE IS THE KIT, NOT A TOWN. It was 'lafayette-square' — so every
// new Look seeded from LS, and `index.default` doubled as "the town we fall back
// to". A00: "falling back to a generic is fine; falling back to Lafayette Square
// is the thing that must never happen." The default is now 'kit-default', whose
// design.json is `{}` and whose entry carries NO `scene` — it is not a town and
// cannot be baked (the bake refuses a Look with no scene, below).
// ⭐ `{}` is deliberate: every channel then resolves from the store's own
// DESIGN_FIELDS descriptors, so the 0-state cannot drift from the kit defaults.
// Writing the defaults into the file would restate the source and go stale.
const PUBLIC_DIR = join(import.meta.dirname, '..', 'public')
const LOOKS_DIR = join(PUBLIC_DIR, 'looks')
const LOOKS_INDEX = join(LOOKS_DIR, 'index.json')
// The kit's 0-state Look id. ⛔ Not a town — see the block above.
const DEFAULT_LOOK_ID = 'kit-default'
const PORT = Number(process.env.CARTO_PORT) || 3333

// ── Looks helpers ──────────────────────────────────────────────────────────
function readJsonOrNull(path) {
  try { return JSON.parse(readFileSync(path, 'utf-8')) } catch { return null }
}
function writeJson(path, obj) {
  // Content-aware: skip the write (and the mtime bump) when bytes match.
  // Critical for the bake chain's incremental dirty-skip — a "save with
  // no changes" must NOT invalidate downstream artifacts.
  writeIfChanged(path, JSON.stringify(obj, null, 2))
}
function lookDir(id) { return join(LOOKS_DIR, id) }
function lookDesignPath(id) { return join(lookDir(id), 'design.json') }
// ⛔⛔ ABSENT AND CORRUPT ARE NOT THE SAME ANSWER, AND `readJsonOrNull(p) || {}`
// gave them the same one. Both produced `{}`, which used to be merely vague —
// but the kit 0-state's design.json IS `{}` now, so an unreadable file renders
// as THE PRISTINE KIT DEFAULT: a plausible-looking success, which for a kit is
// the worst outcome available (CLAUDE.md Layer 0 q2). Worse, the client then
// autosaves that empty state back over the operator's real authoring, and the
// `trees` merge below silently drops Arborist's roster on the same path.
// ⭐ Absent ⇒ `{}` and that is honest — a Look genuinely has no design until its
// first autosave. Present-but-unparseable ⇒ THROW, loudly, naming the file.
function readLookDesign(id) {
  const p = lookDesignPath(id)
  if (!existsSync(p)) return {}
  try { return JSON.parse(readFileSync(p, 'utf-8')) }
  catch (err) {
    const e = new Error(`design.json for look "${id}" exists but could not be parsed (${err.message}). ` +
      `⛔ Refusing to report it as an empty design: that is indistinguishable from the kit default ` +
      `and the next autosave would overwrite whatever is really in the file. Fix or move ${p}.`)
    e.statusCode = 500
    throw e
  }
}
// Wrap a handler so a readLookDesign throw becomes a loud HTTP error, never {}.
function orFail(res, fn) {
  try { return fn() } catch (err) {
    console.error(`[looks] ${err.message}`)
    res.writeHead(err.statusCode || 500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: err.message }))
    return undefined
  }
}
// ⛔⛔ THE SAME ABSENT-VS-CORRUPT TRAP AS readLookDesign, ONE LAYER UP, AND THIS
// ONE DESTROYS THE REGISTRY. `readJsonOrNull(LOOKS_INDEX) || {...}` answered an
// UNPARSEABLE index.json with "no Looks exist, and the default is the kit" —
// whereupon the very next saveLooksIndex() (any create, delete, rename or bake)
// WRITES THAT BACK, erasing every Look registration on disk. Silent, total, and
// it looks exactly like a fresh install.
// ⭐ Absent ⇒ the first-boot skeleton, which is honest: there genuinely are no
// Looks yet. Present but
// unparseable ⇒ refuse, and say which file, because the recovery is to fix that
// file — never to let the server rebuild it from nothing.
function readLooksIndex() {
  if (!existsSync(LOOKS_INDEX)) return { default: DEFAULT_LOOK_ID, looks: [] }
  try {
    const idx = JSON.parse(readFileSync(LOOKS_INDEX, 'utf-8'))
    if (!idx || !Array.isArray(idx.looks)) throw new Error('no `looks` array')
    return idx
  } catch (err) {
    const e = new Error(`${LOOKS_INDEX} exists but is not a usable Looks index (${err.message}). ` +
      `⛔ Refusing to treat it as empty: the next write would overwrite it and every Look ` +
      `registration would be lost. Fix or restore that file.`)
    e.statusCode = 500
    throw e
  }
}
function saveLooksIndex(idx) { writeJson(LOOKS_INDEX, idx) }
// A Look's id: cartograph/scene-address.mjs#lookIdFor — the same slug as a scene id (src/lib/sceneSlug.js),
// so a town's Look and its scene agree, or the town's stated web address (BRIEF-nyc-adapter §3.0).

// ── ⛔ Scene-keyed authoring may not cross a scene boundary (A11, 2026-08-07) ──
// A Look is seeded from another Look (POST /looks). Most of a design.json is
// STYLE and is meant to travel — palettes, exposure, bloom, label typography.
// But some fields are keyed by the SCENE's own identities: `blockCustoms` is
// keyed `[skelId][side][segOrd]` (SECTION §3.2), the corner-radius maps by
// junction coordinate + skelId, `blockLandUse` by blockKey. Those keys are
// NAMES, and a name is portable — `park-avenue-1|right|0` is a well-formed key
// in Altadena and in Łódź. Nothing downstream asks whether the run it names
// belongs to this town.
//
// The damage this caused: the Pour calls createLook({name: scene, scene}) with
// no fromLookId (ExtentApp.jsx), so the seed falls to the DEFAULT Look —
// Lafayette Square. Altadena, Księży Młyn and Śródmieście each shipped with a
// byte-identical copy of LS's authored street widths in their own design.json
// (proven: each town's blockCustoms hashes equal to LS's at that town's own
// creation commit). Inert only because no LS street name happened to exist in
// those bakes; `park-avenue` and `kennett-place` are ordinary American street
// names, so the first town that has one gets LS's measured widths applied to it
// silently, and the operator sees a plausible map. CLAUDE.md Layer 0 q2.
//
// ⭐ The strip list is a DECLARATION, and a declaration goes stale — the next
// scene-keyed field added would travel silently. So the strip is paired with a
// guard that REFUSES rather than trusting the list: after stripping, any
// surviving object key that parses to a street name in the SEED scene's own
// bake means an undeclared scene-keyed field, and creation fails loudly with
// the field named. Fixing it is one entry here.
const SCENE_KEYED_DESIGN_FIELDS = [
  'blockCustoms',                  // [skelId][side][segOrd] — Survey widths + Section depths/materials
  'cornerRadiusOverrides',         // junction key
  'cornerCornerRadiusOverrides',   // "x,z|skelId:end|skelId:end"
  'blockLandUse',                  // blockKey
  'browseFrame',                   // {center:[x,z], altitude} — a PLACE in the seed scene's frame
]

// Street names (skelId) a scene's frozen bake actually contains. Read from
// runs[] — the same field sectionPass resolves against, so this cannot disagree
// with the construction about what exists. null when the scene has no bake.
function bakedStreetNames(scene) {
  const raw = readJsonOrNull(join(PUBLIC_DIR, 'baked', scene, 'shape.json'))
  if (!raw) return null
  const tiles = raw.tiles
  if (!Array.isArray(tiles)) throw new Error(`baked/${scene}/shape.json has no .tiles array — not a {tiles, highway} freeze`)
  const names = new Set()
  for (const t of tiles) for (const r of (t.runs || [])) names.add(String(r.skelId))
  return names
}

// Recursively collect object keys whose `|`/`:`/`,`-separated tokens name a
// street in `names`. No per-field key grammar, so a field added later is
// covered without editing this walker.
function sceneKeyedResidue(node, names, path = [], out = [], seen = new Set()) {
  if (!node || typeof node !== 'object' || seen.has(node)) return out
  seen.add(node)
  if (Array.isArray(node)) { for (const v of node) sceneKeyedResidue(v, names, path, out, seen); return out }
  for (const k in node) {
    for (const tok of String(k).split(/[|:,]/)) {
      const t = tok.trim()
      if (t && names.has(t)) { out.push({ field: path[0] || k, key: k, street: t }); break }
    }
    sceneKeyedResidue(node[k], names, [...path, k], out, seen)
  }
  return out
}

// Returns { design, stripped } — the seed design safe to write into a Look
// bound to `newScene`. Throws (→ 400/409) when residue survives the strip.
function seedDesignForScene(seedDesign, seedScene, newScene) {
  if (!seedDesign) return { design: {}, stripped: [] }
  if (seedScene && newScene && seedScene === newScene) return { design: seedDesign, stripped: [] }
  const design = { ...seedDesign }
  const stripped = []
  // ⛔ The town's fields and its places never cross towns (lookDesign.mjs#SEED_STRIPPED_FIELDS), with the street-keyed
  // list above; whatever survives is checked for residue below.
  for (const f of new Set([...SCENE_KEYED_DESIGN_FIELDS, ...SEED_STRIPPED_FIELDS])) {
    if (design[f] == null) continue
    const n = typeof design[f] === 'object' ? Object.keys(design[f]).length : 1
    if (n) stripped.push(`${f} (${n})`)
    delete design[f]
  }
  const seedNames = seedScene ? bakedStreetNames(seedScene) : null
  if (seedNames?.size) {
    const residue = sceneKeyedResidue(design, seedNames)
    if (residue.length) {
      const fields = [...new Set(residue.map(r => r.field))]
      const err = new Error(
        `⛔ REFUSING to seed a Look for scene "${newScene}" from scene "${seedScene}": ` +
        `${residue.length} key(s) in ${fields.join(', ')} name streets that belong to "${seedScene}" ` +
        `(e.g. "${residue[0].key}" → ${residue[0].street}). That field is scene-keyed and is not declared. ` +
        `Add it to SCENE_KEYED_DESIGN_FIELDS in serve.js, or pass a scene matching the seed Look.`)
      err.statusCode = 409
      throw err
    }
  }
  return { design, stripped }
}


// Idempotent migration: stamp `scene` on any pre-existing Look entry that
// lacks it. ⛔ Never assigns one: a Look with no scene is named, and its consumers refuse.
// Runs every boot but only writes if something needed stamping.
function backfillLookScenesOnBoot() {
  const idx = readJsonOrNull(LOOKS_INDEX)
  if (!idx || !Array.isArray(idx.looks)) return
  let changed = false
  for (const entry of idx.looks) {
    // ⛔ Was: `entry.scene = DEFAULT_MAP` — a Look with no scene was silently
    // ASSIGNED Lafayette Square, and the wrong value then PERSISTED, so the bleed
    // outlived the request (BRIEF-ls-bleed-excision site 13). Leave it unset and
    // let the consumer refuse; a Look whose town we don't know is not an LS Look.
    // ⛔ The kit 0-state has no scene BY DESIGN — it is not a town. Warning on it
    // every boot would train the operator to ignore this line, which is the one
    // line that matters when a REAL Look has lost its scene.
    if (!entry.scene && entry.id !== idx.default) {
      console.warn(`[looks] '${entry.id}' has no scene — left unset (its consumers refuse; no town is assumed)`)
    }
  }
  if (changed) {
    saveLooksIndex(idx)
    console.log(`[looks] backfilled scene field on ${idx.looks.length} entr${idx.looks.length === 1 ? 'y' : 'ies'}`)
  }
}
backfillLookScenesOnBoot()




// GET /<scene>/analyze — what is under that town's marker strokes: the parcels and blocks they overlap.
function strokeBBox(strokes) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const stroke of strokes) {
    for (const p of stroke) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.z < minZ) minZ = p.z
      if (p.z > maxZ) maxZ = p.z
    }
  }
  return { minX, maxX, minZ, maxZ }
}

function analyzeMarkers(scene) {
  const { markers, clean } = mapDataPaths(scene)
  if (!existsSync(markers)) return { scene, strokes: 0, message: 'No marker strokes' }
  const strokes = JSON.parse(readFileSync(markers, 'utf-8'))
  if (!strokes.length) return { strokes: 0, message: 'No marker strokes' }

  const bbox = strokeBBox(strokes)
  const result = { scene, strokes: strokes.length, bbox }

  // Find parcels overlapping the marker bbox — from the scene's DECLARED wells.
  // ⛔ This read `scripts/raw/stl_parcels.json`, which has not existed since LS's copy
  // moved into its scene dir (2026-07-13), so the parcel half silently did nothing.
  const parcelFiles = declaredParcelPaths(scene).filter(existsSync)
  if (parcelFiles.length) {
    const overlapping = []
    for (const p of parcelFiles.flatMap(f => Object.values(JSON.parse(readFileSync(f, 'utf-8')).parcels || {}))) {
      // every part of the parcel (`parcelParts`): a multipart parcel's rings[0] is one part of several
      const pts = parcelParts(p.rings, p.address).flatMap(q => q.outer)
      if (!pts.length) continue
      const xs = pts.map(pt => pt[0]), zs = pts.map(pt => pt[1])
      const pMinX = Math.min(...xs), pMaxX = Math.max(...xs)
      const pMinZ = Math.min(...zs), pMaxZ = Math.max(...zs)
      // BBox overlap test
      if (pMaxX < bbox.minX || pMinX > bbox.maxX || pMaxZ < bbox.minZ || pMinZ > bbox.maxZ) continue
      overlapping.push({
        address: (p.address || '').trim(),
        bounds: { minX: +pMinX.toFixed(1), maxX: +pMaxX.toFixed(1), minZ: +pMinZ.toFixed(1), maxZ: +pMaxZ.toFixed(1) },
        centroid: { x: +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1), z: +(zs.reduce((a, b) => a + b, 0) / zs.length).toFixed(1) },
        vertexCount: pts.length,
      })
    }
    result.parcels = overlapping
    result.parcelCount = overlapping.length
  }

  // Find blocks overlapping the marker bbox
  const mapFile = join(clean, 'map.json')
  if (existsSync(mapFile)) {
    const map = JSON.parse(readFileSync(mapFile, 'utf-8'))
    const blocks = map.layers?.block || []
    const overlappingBlocks = []
    for (let i = 0; i < blocks.length; i++) {
      const ring = blocks[i].ring
      const xs = ring.map(p => p.x), zs = ring.map(p => p.z)
      const bMinX = Math.min(...xs), bMaxX = Math.max(...xs)
      const bMinZ = Math.min(...zs), bMaxZ = Math.max(...zs)
      if (bMaxX < bbox.minX || bMinX > bbox.maxX || bMaxZ < bbox.minZ || bMinZ > bbox.maxZ) continue
      overlappingBlocks.push({
        index: i,
        bounds: { minX: +bMinX.toFixed(1), maxX: +bMaxX.toFixed(1), minZ: +bMinZ.toFixed(1), maxZ: +bMaxZ.toFixed(1) }
      })
    }
    result.blocks = overlappingBlocks
    result.blockCount = overlappingBlocks.length
  }

  return result

}

createServer(async (req, res) => {
 // ⛔ TOP-LEVEL CATCH. This handler is `async`, so anything that throws inside it
 // became an unhandled rejection and the request simply HUNG — which is how a
 // loud refusal (readLooksIndex / readLookDesign) would have presented to the
 // operator: as a spinner, indistinguishable from a slow bake. A refusal has to
 // ARRIVE to be a refusal. ⭐ The body below is deliberately NOT re-indented, so
 // this stays a two-line diff that can be reviewed rather than re-read.
 try {
  // Strip query string for route matching. Clients add cache-busting
  // ?t=... that would otherwise miss exact-equality checks.
  const path = (req.url || '').split('?')[0]

  // GET /<scene>/analyze — report what's under that town's marker strokes (FEATURES § The Marker).
  const analyzeMatch = req.method === 'GET' && path.match(/^\/([a-z0-9][a-z0-9-]*)\/analyze$/)
  if (analyzeMatch) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(analyzeMarkers(analyzeMatch[1]), null, 2))
    return
  }

  // ── Per-scene data routes ──────────────────────────────────────────────
  // Canonical: /<scene>/<verb> (e.g. /lafayettesquare/centerlines, /huron/overlay).
  // Legacy: /<verb> with no scene prefix resolves to the default scene; this
  // alias exists so older clients keep working through Phase 0c's store
  // migration. Once every caller is scene-aware we can retire it.
  //
  // Verbs split by allowed methods to match the prior per-route behavior
  // exactly: skeleton is GET-only (derived artifact), the rest accept POST
  // for autosave. Empty-payload defaults match the boot-time inits.
  const READ_VERBS = ['markers', 'measurements', 'skeleton', 'centerlines', 'overlay', 'ribbons', 'map', 'geography', 'boundary']
  const WRITE_VERBS = ['markers', 'measurements', 'centerlines', 'overlay']
  // An operator's own file not written yet IS empty: nothing has been authored. ⛔ A DERIVED artifact (skeleton, ribbons, map,
  // geography, boundary) that is missing is never answered as an empty town: it is a 404 naming the town, the artifact and the
  // path (Boz, 2026-10-28: LS's Survey crashed on an EMPTY ribbons served 200 for a file that lives at its declared path).
  const EMPTY = {
    markers:      '[]',
    measurements: '{"measurements":[]}',
    centerlines:  '{"streets":[]}',
    overlay:      '{"version":1,"streets":{}}',
  }
  // Reserved top-level prefixes that must NOT be mistaken for scene names.
  const RESERVED_PREFIXES = new Set(['looks'])
  const sceneRouteMatch = path.match(/^\/(?:([a-z0-9][a-z0-9-]*)\/)?(markers|measurements|skeleton|centerlines|overlay|ribbons|map|geography|boundary)$/)
  if (sceneRouteMatch && !RESERVED_PREFIXES.has(sceneRouteMatch[1])) {
    const scene = sceneRouteMatch[1]
    // ⛔ A scene-less /<verb> names no town, and there is no default to read: refuse, and say how to name one.
    if (!scene) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: `/${sceneRouteMatch[2]} names no town — ask /<scene>/${sceneRouteMatch[2]}` })); return }
    const verb = sceneRouteMatch[2]
    const paths = mapDataPaths(scene)
    const filePath = paths[verb]

    if (req.method === 'GET' && READ_VERBS.includes(verb)) {
      if (!existsSync(filePath)) {
        if (!(verb in EMPTY)) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: verb === 'skeleton' ? `skeleton.json not found for scene '${scene}' — run skeleton.js` : `${scene} has no ${verb} at ${relative(join(import.meta.dirname, ".."), filePath)} — it is derived (pour the town), and a missing one is never served as an empty town` }))
          return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(EMPTY[verb])
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(readFileSync(filePath))
      return
    }

    if (req.method === 'POST' && WRITE_VERBS.includes(verb)) {
      let body = ''
      req.on('data', c => body += c)
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body)
          mkdirSync(dirname(filePath), { recursive: true })
          // Content-aware: a save-with-no-changes must not bump mtime,
          // or the bake chain treats every downstream artifact as stale.
          writeIfChanged(filePath, JSON.stringify(parsed, null, 2))
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end('{"ok":true}')
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err.message }))
        }
      })
      return
    }
  }

  // ── The INTAKE manifest (read-only) ──────────────────────────────────────
  // GET /<scene>/intake — every declared render-side input for this scene,
  // filled or not, with its status computed FROM DISK on every request.
  //
  // ⛔ Status is never persisted. A stored status goes stale and then lies; the
  // whole point of the manifest is that a pour can no longer complete
  // "successfully" while silently missing its inputs.
  //
  // The panel is a COLLECTION CHECKLIST — it lists what this town could have,
  // including what it doesn't have yet. The RENDER is what hides missing
  // things. Opposite behaviours, never conflated (`BRIEF §5.5`).
  const intakeMatch = path.match(/^\/([a-z0-9][a-z0-9-]*)\/intake$/)
  if (req.method === 'GET' && intakeMatch && !RESERVED_PREFIXES.has(intakeMatch[1])) {
    const scene = intakeMatch[1]
    try {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify(intakeStatusForMap(scene)))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

  // POST /<scene>/intake/source — record a source the operator found.
  // ⭐ Stored against the scene's JURISDICTION, not the scene: a well found for
  // one Łódź hood is a fact about Łódź and belongs to the next one too.
  const addSrcMatch = path.match(/^\/([a-z0-9][a-z0-9-]*)\/intake\/source$/)
  if (req.method === 'POST' && addSrcMatch && !RESERVED_PREFIXES.has(addSrcMatch[1])) {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        const { row, name } = JSON.parse(body)
        if (!row || !name) throw new Error('row and name are required')
        const list = addAltSource(addSrcMatch[1], row, String(name).slice(0, 200))
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, sources: list }))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // ── The SHAPE freeze (the Data Wall, autosaved) ──────────────────────────
  // POST /<scene>/shape — write the frozen SHAPE artifact (the per-tile
  // curb/corner silhouette Section opens). The client autosaves this on
  // Survey-exit (`ORIENTATION §3 (the Wall)`) with the live `protoShapeTiles` it just rendered,
  // so the freeze always tracks the eye-gated Survey shape WITHOUT the heavy
  // slab bake. Lands at public/baked/<scene>/shape.json — exactly where the
  // Section surface fetches it. Scene-keyed; reserved prefixes excluded.
  const shapeMatch = path.match(/^\/([a-z0-9][a-z0-9-]*)\/shape$/)
  if (req.method === 'POST' && shapeMatch && !RESERVED_PREFIXES.has(shapeMatch[1])) {
    const scene = shapeMatch[1]
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        JSON.parse(body)   // validate — never persist non-JSON as the freeze
        const dir = join(PUBLIC_DIR, 'baked', scene)
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, 'shape.json'), body)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end('{"ok":true}')
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // GET /<scene>/curbed-min-width — the minimum curbed width (the nose) for Survey's live build, from the SAME function the
  // bake calls (`curbedMinWidthOf`), so Survey and the bake cannot read it from different places. ⛔ An error is a 500 with
  // the reason; the live build refuses without it (`buildTileGround`), never draws on a default.
  const cmwMatch = path.match(/^\/([a-z0-9][a-z0-9-]*)\/curbed-min-width$/)
  if (req.method === 'GET' && cmwMatch && !RESERVED_PREFIXES.has(cmwMatch[1])) {
    try {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(curbedMinWidthCached(cmwMatch[1])))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

  // ── Extent editor: OSM street labels ────────────────────────────────────
  // GET /<scene>/osm-labels — the label set for the Neighborhood Perimeter
  // Builder (Cartograph step 0). Extracted PRE-skeleton from raw/osm.json's
  // ground.highway (coords already in the scene's local frame), so labels are
  // available the moment a hood is fetched — before any pipeline runs. One
  // label per named street (longest way's arclength-midpoint + local angle);
  // `major` flags the arterial classes the operator frames boundaries on. The
  // payload is a few KB even though raw OSM is ~18 MB; cached by file mtime so
  // the 18 MB parse happens once per fetch, not per request.
  const osmLabelsMatch = path.match(/^\/([a-z0-9][a-z0-9-]*)\/osm-labels$/)
  if (req.method === 'GET' && osmLabelsMatch && !RESERVED_PREFIXES.has(osmLabelsMatch[1])) {
    const scene = osmLabelsMatch[1]
    try {
      const labels = getOsmLabels(scene)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ labels: labels || [] }))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message, labels: [] }))
    }
    return
  }

  // GET /<scene>/street-names — { major, minor } for the Extent side dropdown
  // (skeleton-sourced, corridor-collapsed, alphabetized).
  const namesMatch = path.match(/^\/([a-z0-9][a-z0-9-]*)\/street-names$/)
  if (req.method === 'GET' && namesMatch && !RESERVED_PREFIXES.has(namesMatch[1])) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(streetNamesFor(namesMatch[1])))
    return
  }

  // GET /<scene>/streets — all named street polylines for the clickable boundary layer.
  const streetsMatch = path.match(/^\/([a-z0-9][a-z0-9-]*)\/streets$/)
  if (req.method === 'GET' && streetsMatch && !RESERVED_PREFIXES.has(streetsMatch[1])) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(streetsGeomFor(streetsMatch[1])))
    return
  }

  // POST /<scene>/boundary-from-streets — body { names:[...] } → the ORDER-INDEPENDENT
  // perimeter polygon (the healed boundary-street process; visual multi-segment selection).
  const bfsMatch = path.match(/^\/([a-z0-9][a-z0-9-]*)\/boundary-from-streets$/)
  if (req.method === 'POST' && bfsMatch && !RESERVED_PREFIXES.has(bfsMatch[1])) {
    const scene = bfsMatch[1]
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        const { names } = JSON.parse(body || '{}')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(computeBoundaryFromSelection(scene, Array.isArray(names) ? names : [])))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // GET /<scene>/building-footprints — current-frame footprint rings for the
  // Extent overlay + roster editor (one merged geometry client-side).
  const bldgFpMatch = path.match(/^\/([a-z0-9][a-z0-9-]*)\/building-footprints$/)
  if (req.method === 'GET' && bldgFpMatch && !RESERVED_PREFIXES.has(bldgFpMatch[1])) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(buildingFootprintsFor(bldgFpMatch[1])))
    return
  }

  // GET/POST /<scene>/building-overrides — per-scene building membership overrides
  // { activate: [msbf-id…], hide: [msbf-id…] }. `activate` forces an outside-polygon
  // building IN; `hide` forces an inside one OUT. Layers OVER the geometric default
  // (centroid in the boundary polygon) — feedback_effective_payload_layering — so it
  // survives radius/polygon edits; the bake applies it. Never merged into the ledger.
  const bldgOvMatch = path.match(/^\/([a-z0-9][a-z0-9-]*)\/building-overrides$/)
  if (bldgOvMatch && !RESERVED_PREFIXES.has(bldgOvMatch[1])) {
    const scene = bldgOvMatch[1]
    const ovPath = join(mapCleanDir(scene), '..', 'building-overrides.json')
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(existsSync(ovPath) ? readFileSync(ovPath) : '{"activate":[],"hide":[]}')
      return
    }
    if (req.method === 'POST') {
      let body = ''
      req.on('data', c => body += c)
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}')
          const activate = Array.isArray(parsed.activate) ? parsed.activate : []
          const hide = Array.isArray(parsed.hide) ? parsed.hide : []
          // ⛔ An EMPTY set where no file exists IS the absence (GET serves exactly that): write nothing and create no
          // folder. Writing it made a mere OPEN of a town — even a search's provisional one — leave a file and a folder.
          if (!activate.length && !hide.length && !existsSync(ovPath)) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true,"wrote":false}'); return }
          mkdirSync(dirname(ovPath), { recursive: true })
          writeIfChanged(ovPath, JSON.stringify({ activate, hide }, null, 2))
          res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}')
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: err.message }))
        }
      })
      return
    }
  }

  // GET /scenes — the neighborhoods that EXIST (scene data dirs), for the Extent
  // hub: open any of them, not just the ones with a baked Look (the Look pulldown
  // can't reach a fetched-but-unpoured hood like Altadena). Reports name/committed/
  // hasData so the hub can label + sort them. Scene-independent.
  if (req.method === 'GET' && path === '/scenes') {
    const dataDir = join(import.meta.dirname, 'data')
    const scenes = []
    try {
      for (const id of readdirSync(dataDir)) {
        if (id.startsWith('_') || id.startsWith('.')) continue
        let st; try { st = statSync(join(dataDir, id)) } catch { continue }
        if (!st.isDirectory()) continue
        const hasData = existsSync(join(dataDir, id, 'geography.json'))
        let name = '', committed = false
        const nbP = join(dataDir, id, 'neighborhood.json')
        if (existsSync(nbP)) { try { const nb = JSON.parse(readFileSync(nbP, 'utf8')); name = nb.name || ''; committed = !!nb.committed } catch { /* ignore */ } }
        scenes.push({ id, name, committed, hasData })
      }
    } catch { /* ignore */ }
    scenes.sort((a, b) => (b.committed - a.committed) || a.id.localeCompare(b.id))
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ scenes }))
    return
  }

  // GET /address/<name> — what Operations says about a town's WEB ADDRESS (BRIEF-nyc-adapter §3.0).
  // ⭐ Operations owns the address: a town's name is the part of its Ward's Domain before the dot. Extent's
  // address field shows this beside itself. Three answers, each said as itself:
  //   found       — { asked, found: true, ward, domain, owned, zoneStatus, zoneCheckedAt }
  //   not found   — { asked, found: false, note } — NOT an error: the pour proceeds; only Promote cannot ship
  //   not asked   — { asked: false, why } — ⛔ never reported as "none"
  const addressMatch = path.match(/^\/address\/([^/]+)$/)
  if (req.method === 'GET' && addressMatch) {
    const name = decodeURIComponent(addressMatch[1])
    const send = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)) }
    askOperations(name).then((r) => {
      if (!r.asked) return send({ asked: false, why: r.why })
      const a = r.answer || {}
      if (a.error) return send({ asked: true, found: false, note: a.error })
      send({ asked: true, found: true, ward: a.ward ?? null, domain: a.domain ?? null, owned: !!a.owned,
             zoneStatus: a.zoneStatus ?? null, zoneCheckedAt: a.zoneCheckedAt ?? null })
    }).catch((e) => send({ asked: false, why: e.message }))
    return
  }

  // POST /geocode — body { q } → { bbox, anchors, official }. The Extent search
  // box: '+'-joined anchors unioned to a framing bbox (frames the aerial; the
  // carve-out reads the viewport, not this bbox). A single named place also
  // returns its official boundary as the best-guess extent. Scene-independent.
  if (req.method === 'POST' && path === '/geocode') {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', async () => {
      try {
        const { q } = JSON.parse(body || '{}')
        const geocoded = await geocodePlace(q)
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(geocoded))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // POST /<scene>/fetch-extent — body { bbox:{minLat,maxLat,minLon,maxLon} } →
  // write geography.json (centered on the framed bbox) → the FULL bundle: OSM +
  // skeleton (required backbone → nameable streets) + MSBF buildings + assessor
  // parcels, each fetched best-effort and reported per-source so a fresh drop-in
  // lands the whole bundle with no hand-CLI. Long-running (a fresh OSM fetch);
  // the client awaits with a spinner. Guarded per scene.
  const fetchExtentMatch = path.match(/^\/([a-z0-9][a-z0-9-]*)\/fetch-extent$/)
  if (req.method === 'POST' && fetchExtentMatch && !RESERVED_PREFIXES.has(fetchExtentMatch[1])) {
    const scene = fetchExtentMatch[1]
    if (isNumericId(scene)) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: `'${scene}' is a number — name the neighborhood first; a scene is named after the place, never a ZIP.` }))
      return
    }
    let body = ''
    req.on('data', c => body += c)
    req.on('end', async () => {
      if (_seedsInFlight.has(scene)) {
        res.writeHead(409, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'a fetch is already running for this scene' }))
        return
      }
      _seedsInFlight.add(scene)
      try {
        const { bbox } = JSON.parse(body || '{}')
        const ok = bbox && ['minLat', 'maxLat', 'minLon', 'maxLon'].every(k => Number.isFinite(bbox[k]))
          && bbox.maxLat > bbox.minLat && bbox.maxLon > bbox.minLon
        if (!ok) throw new Error('need a valid bbox {minLat,maxLat,minLon,maxLon}')
        // Area guard — a neighborhood fetch is bounded. An unbounded frame (e.g.
        // "Cape Cod" → a 63×70 km region with no official boundary) asks Overpass
        // for thousands of km²; it rejects the oversized query and fetch.js dies
        // with a swallowed code=1. Refuse it up front with an actionable message
        // instead. LS ≈ 10 km²; a large CDP (Altadena r=4483) ≈ 63 km²; the cap
        // is generous enough for a real hood, tight enough to catch a whole region.
        const midLat = (bbox.minLat + bbox.maxLat) / 2
        const latKm = (bbox.maxLat - bbox.minLat) * 111.0
        const lonKm = (bbox.maxLon - bbox.minLon) * 111.32 * Math.cos((midLat * Math.PI) / 180)
        const areaKm2 = latKm * lonKm
        // Keep in sync with `MAX_FETCH_KM2` in src/cartograph/ExtentApp.jsx.
        // ⛔ AREA IS THE WRONG UNIT for this bound: it stands in for LOAD, and water carries no geometry — Provincetown's ZIP envelope is 312 km², mostly Cape Cod Bay (Jacob, 2026-09-24, raised 200 → 400). The kit-correct bound is what the fetch RETURNS (features / bytes); filed on ROADMAP by Boz.
        const MAX_FETCH_KM2 = 400
        if (areaKm2 > MAX_FETCH_KM2) {
          throw new Error(`Framed area is ${Math.round(areaKm2)} km² — too large to fetch as one neighborhood (max ${MAX_FETCH_KM2} km²). Search a specific neighborhood, or frame a smaller area.`)
        }
        // Relocation guard — a fetch-extent NEVER moves an existing installation to
        // a different city. If this scene already has a geography.json and the new
        // bbox center is >50 km from its current center, refuse: that's authoring a
        // DIFFERENT place into an existing scene (the LS→Altadena clobber). A
        // legitimate re-frame/re-scope of the SAME hood moves metres, never 50 km.
        // The Extent tool now authors per-search scenes, so this is defense-in-depth.
        const geoPath = mapDataPaths(scene).geography
        if (existsSync(geoPath)) {
          try {
            const cur = JSON.parse(readFileSync(geoPath, 'utf8'))
            if (Number.isFinite(cur.lat) && Number.isFinite(cur.lon)) {
              const newLat = midLat, newLon = (bbox.minLon + bbox.maxLon) / 2
              const dKm = Math.hypot((newLat - cur.lat) * 111, (newLon - cur.lon) * 111.32 * Math.cos((midLat * Math.PI) / 180))
              if (dKm > 50) {
                throw new Error(`Refusing to relocate the existing '${scene}' installation ${Math.round(dKm)} km to a different place. Author a new neighborhood in its own scene instead of overwriting '${scene}'.`)
              }
            }
          } catch (e) { if (/Refusing to relocate/.test(e.message)) throw e /* else: unreadable geo, allow */ }
        }
        const geo = writeGeographyFromBbox(scene, bbox)
        const here = import.meta.dirname
        const env = { ...process.env, CARTOGRAPH_SCENE: scene }
        const raw = mapRawDir(scene)
        mkdirSync(raw, { recursive: true })
        mkdirSync(mapCleanDir(scene), { recursive: true })
        const lastLine = (r) => (r.stderr || r.stdout || '').trim().split('\n').filter(Boolean).pop() || 'failed'
        const sources = {}
        // ── OSM (REQUIRED backbone: streets → skeleton → nameable) ──
        // runCapture (not runShell) so a failure surfaces fetch.js's OWN last line
        // — the real reason (Overpass rate-limit, oversized query, network) — to
        // the client, instead of runShell's generic "Command failed (code=1)".
        const osmR = await runCapture('node fetch.js', { cwd: here, env, timeout: 240000 })
        if (osmR.code !== 0) throw new Error(`OSM fetch failed — ${lastLine(osmR)}`)
        // INDEX, not the skeleton — "the Skeleton is The First Bake", and this is a
        // fetch. The picker needs names/geometry/junctions before Bake; it does not
        // need a frame. `--index` stops before simplification and writes a lookup
        // table. The real skeleton is built by Bake (commit-extent), once.
        const skelR = await runCapture('node skeleton.js --index', { cwd: here, env, timeout: 120000 })
        if (skelR.code !== 0) throw new Error(`street index build failed — ${lastLine(skelR)}`)
        _streetLookupCache.delete(scene)
        sources.osm = { ok: true, count: countJson(join(raw, 'osm.json')) }
        // ── Buildings — the town's footprint well (footprint-well.mjs): its DECLARED well (NYC's, keyed by BIN) when it
        //    has one, else Microsoft's ML footprints (any region). ⛔ Never both — a declared well replaces MSBF.
        const bR = await runCapture(footprintWell(scene).declared ? 'node fetch-buildings.mjs' : 'node fetch-msbf.js', { cwd: here, env, timeout: 240000 })
        sources.buildings = bR.code === 0
          ? { ok: true, count: countJson(footprintWell(scene).path), well: footprintWell(scene).label }
          : { ok: false, error: lastLine(bR) }
        // ── Parcels — the TOWN'S DECLARED wells (`sources.json`), never a named city's.
        //    ⛔ This ran the two St. Louis python scripts until 2026-09-24, so every other
        //    town fetched nothing and printed "St. Louis City/County only".
        //    Three outcomes, each said differently: fetched · declared-none (an honest
        //    zero, with the town's reason) · UNDECLARED (nobody has confirmed a well yet —
        //    the normal state of a fresh town, and it must not read as "no assessor").
        const decl = readSources(scene)
        if (!decl.declared) {
          sources.parcels = { ok: false, count: 0, undeclared: true,
            note: 'parcels not declared yet — confirm this town\'s assessor well into sources.json' }
        } else if (!decl.parcels.length) {
          sources.parcels = { ok: true, count: 0, declaredNone: decl.absentReason }
        } else {
          const pR = await runCapture('node fetch-parcels.mjs', { cwd: here, env, timeout: 300000 })
          const pCount = declaredParcelPaths(scene).reduce((n, p) => n + countJson(p), 0)
          sources.parcels = pR.code === 0
            ? { ok: true, count: pCount }
            : { ok: false, count: pCount, error: lastLine(pR) }
        }
        // ── Elevation — the 1 m lidar DEM tile list (Jacob, 2026-09-23: "Terrain and
        //    lidar needs to be added to the fetch pour").
        //    ⛔⛔ THIS IS THE STEP THAT DID NOT EXIST, AND ITS ABSENCE IS WHY PROVINCETOWN
        //    BAKED FLAT. huron has relief only because a human once ran the National Map
        //    products API by hand and pasted the result into raw/elevation-sources.txt.
        //    Nobody did that for a DUNE TOWN, the pour said nothing, and the only record
        //    was "terrain (no elevation.tif — flat)" in a skipped array. ⭐ Acquisition is
        //    not elective just because the consumer tolerates its absence.
        //    ⭐ NOTHING IS DOWNLOADED — this writes the tile list bake-terrain range-reads.
        //    Three outcomes, each said differently, the same shape parcels uses above:
        //      0 → found, and the count is the tiles it will read
        //      1 → VERIFIED-ABSENT: searched the whole ladder, this town has no lidar.
        //          ⛔ An honest zero, NOT a failure — fetch-dem has already written the
        //          town's own intake.json mark, so the panel shows it as a state.
        //      other → a real error, and it stays loud.
        const dR = await runCapture('node fetch-dem.mjs --scene=' + scene, { cwd: here, env, timeout: 300000 })
        const demList = join(raw, 'elevation-sources.txt')
        const demTiles = existsSync(demList)
          ? readFileSync(demList, 'utf8').split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).length
          : 0
        sources.elevation = dR.code === 0
          ? { ok: true, count: demTiles }
          : dR.code === 1
            ? { ok: true, count: 0, verifiedAbsent: true,
                note: 'no lidar DEM covers this town — searched the whole ladder and recorded it. ⛔ This town bakes FLAT; that is now a decision on the record, not a default.' }
            : { ok: false, count: demTiles, error: lastLine(dR) }
        // ── Bathymetry — the floor under the town's water (BRIEF-bathymetry; fetch-bathymetry.mjs). Nothing
        //    downloaded: the tile list bake-terrain range-reads. 0 = found · 1 = none on the BUILT rungs, which is
        //    NOT verified-absent (the file names the rungs never asked); the bed then stays the profile, said.
        const bathR = await runCapture('node fetch-bathymetry.mjs --scene=' + scene, { cwd: here, env, timeout: 300000 })
        const bathyList = join(raw, 'bathymetry-sources.txt')
        const bathyTiles = existsSync(bathyList)
          ? readFileSync(bathyList, 'utf8').split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).length
          : 0
        sources.bathymetry = bathR.code === 0 ? { ok: true, count: bathyTiles }
          : bathR.code === 1 ? { ok: true, count: 0, note: 'no bathymetry on the built rungs — the bed under the water is the profile; see raw/bathymetry-sources.txt' }
          : { ok: false, count: bathyTiles, error: lastLine(bathR) }
        // ── Water datums — where the water stands (BRIEF-bathymetry: a low and a high tide, or a lake's level).
        //    0 = written · 1 = no datum for this town (said; a coastal town's terrain then refuses) · other = error.
        const wdR = await runCapture('node fetch-water-datums.mjs --scene=' + scene, { cwd: here, env, timeout: 900000 })
        sources.waterDatums = wdR.code === 0 ? { ok: true, count: 1 }
          : wdR.code === 1 ? { ok: true, count: 0, note: 'no tide datum or lake gauge for this town — a coastal town\'s terrain refuses until one is named' }
          : { ok: false, count: 0, error: lastLine(wdR) }
        // ── When the lidar flew, and the geoid it was delivered on (fetch-lidar-flights.mjs): the lidar's heights are put on
        //    the water record's basis by it, so it is fetched for every town with a water record (bake-coast refuses without).
        if (sources.waterDatums.count) {
          const lfR = await runCapture('node fetch-lidar-flights.mjs --scene=' + scene, { cwd: here, env, timeout: 300000 })
          sources.lidarFlights = lfR.code === 0 ? { ok: true, count: 1 } : { ok: false, count: 0, error: lastLine(lfR) }
        }
        // ── Every other DECLARED well the kit can fetch (sources.json). ⛔ A declaration is a promise the fetch keeps:
        //    jacksonheights declared cropland, Extent never acquired it, and the first pour died at "Pouring map"
        //    (cdl-2024.tif absent). Undeclared / declared-none is SAID, never run and never read as "none".
        //    cdl.mjs reads the town's OSM bbox, so this runs after the OSM fetch above.
        const declaredStep = async (state, absentReason, cmd, countOf, timeout) => {
          if (state === 'undeclared') return { ok: false, count: 0, undeclared: true, note: 'not declared yet — confirm the well into sources.json' }
          if (state === 'none') return { ok: true, count: 0, declaredNone: absentReason }
          const r = await runCapture(cmd, { cwd: here, env, timeout })
          return r.code === 0 ? { ok: true, count: countOf() } : { ok: false, count: countOf(), error: lastLine(r) }
        }
        const crop = readCroplandSources(scene)
        sources.cropland = await declaredStep(crop.state, crop.absentReason, 'node cdl.mjs',
          () => crop.sources.filter(s => existsSync(join(raw, `cdl-${s.year}.tif`))).length, 300000)
        const apDecl = readAddressPointSources(scene)
        sources.addressPoints = await declaredStep(apDecl.state, apDecl.absentReason, 'node fetch-address-points.mjs',
          () => declaredAddressPointPaths(scene).reduce((n, p) => n + (existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')).points || []).length : 0), 0), 300000)
        const trDecl = readTreeSources(scene)
        sources.trees = await declaredStep(trDecl.state, trDecl.absentReason, 'node fetch-trees.mjs',
          () => declaredTreeWellPaths(scene).reduce((n, p) => n + (existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')).trees || []).length : 0), 0), 300000)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, center: { lat: geo.lat, lon: geo.lon }, bbox: geo.bbox, sources }))
        // ⭐ A fetched town gets its OWN instance module, or it boots wearing Lafayette Square
        // (src/instance.js). Scaffolded AFTER the response on purpose: writing src/instances/*.js
        // restarts this server (it imports the registry), so doing it mid-request would kill the
        // fetch. The mark is left for the operator; checks/claims-every-town-has-a-mark.mjs stays
        // red until one is authored. A scaffold that refuses (e.g. an unnamed town) says why here.
        if (!existsSync(join(import.meta.dirname, '..', 'src', 'instances', `${scene}.js`))) {
          setTimeout(() => {
            runCapture(`node scaffold-instance.mjs --scene=${scene}`, { cwd: here, env, timeout: 30000 })
              .then(r => console.log(`[fetch-extent] ${scene}: instance module — ${(r.stdout || r.stderr || '').trim().split('\n').pop()}`))
              .catch(e => console.warn(`[fetch-extent] ${scene}: could not scaffold its instance module — ${e.message}`))
          }, 250)
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      } finally {
        _seedsInFlight.delete(scene)
      }
    })
    return
  }

  // GET /<scene>/skeleton-labels — corridor-collapsed aerial labels for Extent.
  const skLabelsMatch = path.match(/^\/([a-z0-9][a-z0-9-]*)\/skeleton-labels$/)
  if (req.method === 'GET' && skLabelsMatch && !RESERVED_PREFIXES.has(skLabelsMatch[1])) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ labels: skeletonLabelsFor(skLabelsMatch[1]) }))
    return
  }

  // POST /<scene>/street-geom — body { name } → { polylines } for the dropdown
  // hover-preview (see which street a candidate is before selecting it).
  const geomMatch = path.match(/^\/([a-z0-9][a-z0-9-]*)\/street-geom$/)
  if (req.method === 'POST' && geomMatch && !RESERVED_PREFIXES.has(geomMatch[1])) {
    const scene = geomMatch[1]
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        const { name } = JSON.parse(body || '{}')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(streetGeom(scene, name)))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message, polylines: [] }))
      }
    })
    return
  }

  // GET/POST /<scene>/neighborhood — the extent DRAFT + descriptive metadata
  // (name/blurb/border streets/radius). Auto-saved from the Extent panel; loaded
  // on open to restore the operator's selections across reloads.
  // DELETE /<scene> — discard an UNCOMMITTED scene.
  //
  // ⭐ THE LINE IS `committed`, NOT "has data" (2026-09-19). It used to refuse any
  // scene carrying raw/ or clean/ artifacts, on the reasoning that a fetched hood
  // must never be one click from deletion. But a fetch is not a commitment: the
  // operator searched a ZIP, pulled 31 MB, saw it was the wrong framing, and started
  // over — and `44839` then sat in the picker FOREVER, un-discardable, wearing the
  // same name as the real hood. There was no way out of it through the tool at all.
  //
  // `neighborhood.json.committed` is the marker that already distinguishes them and
  // that `GET /scenes` already returns (it is the ✓ in the picker). A committed hood
  // is a neighborhood and is never discardable here. An uncommitted one is a DRAFT,
  // however much data it pulled, and the operator must be able to throw it away.
  //
  // ⛔ The protection is not weakened, it is aimed correctly: what it guards is the
  // COMMITMENT, which is the thing that cost work, not the fetch, which cost minutes.
  // POST /<scene>/rename — body { to } → move an UNCOMMITTED draft to the id its
  // NAME slugs to. The Extent panel calls this at Fetch, when the operator's name
  // no longer matches the provisional id the search gave the draft. A scene is
  // named after the place, never the search text (Jacob: "Naming the scene from
  // the ZIP isn't acceptable"). ⛔ Refused, loudly: a committed hood (its id is
  // load-bearing — Looks, bakes and the registry key off it), a target that is
  // not a clean non-numeric slug, and a target that already exists.
  const renameMatch = path.match(/^\/([a-z0-9][a-z0-9-]*)\/rename$/)
  if (req.method === 'POST' && renameMatch && !RESERVED_PREFIXES.has(renameMatch[1])) {
    const scene = renameMatch[1]
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      const fail = (code, error) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error })) }
      try {
        const to = String(JSON.parse(body || '{}').to || '')
        if (!to || to !== slugifyName(to) || isNumericId(to) || RESERVED_PREFIXES.has(to)) {
          return fail(400, `'${to}' is not a scene id — it must be the slug of a place name (letters, not a ZIP).`)
        }
        const src = join(mapCleanDir(scene), '..')
        const dst = join(mapCleanDir(to), '..')
        if (!existsSync(src)) return fail(404, `no scene '${scene}' to rename`)
        const nb = join(src, 'neighborhood.json')
        let committed = false
        if (existsSync(nb)) {
          try { committed = !!JSON.parse(readFileSync(nb, 'utf8')).committed }
          catch { return fail(409, `'${scene}' has an unreadable neighborhood.json — refusing to rename a scene whose committed state cannot be read.`) }
        }
        if (committed) return fail(409, `'${scene}' is a committed neighborhood — its id cannot change here.`)
        // ⭐ A town may be DECLARED before it is fetched (OPERATIONS "Declare the well"): its folder holds
        // its declarations (sources.json) and nothing fetched or drafted — no geography.json, no
        // neighborhood.json. The draft JOINS that folder, entry by entry; ⛔ any name both hold as a FILE
        // refuses the whole move before anything moves. Any other existing folder is a neighborhood.
        const declaredOnly = isDeclaredOnly(dst)
        if (existsSync(dst) && !declaredOnly) return fail(409, `A neighborhood '${to}' already exists — open it from the picker, or choose another name.`)
        const idx = readLooksIndex()
        if ((idx.looks || []).some(l => l.scene === scene || l.id === to || l.scene === to)) {
          return fail(409, `A Look already uses '${scene}' or '${to}' — renaming a scene with a Look is not supported here.`)
        }
        if (declaredOnly) {
          const J = planJoin(src, dst), { moves, clash } = J
          if (clash.length) return fail(409, `'${to}' is declared but not fetched, and the draft '${scene}' holds the same file(s): ${clash.join(', ')} — refusing to overwrite either.`)
          executeJoin(src, J)
          console.log(`[scenes] draft '${scene}' joined declared '${to}' (${moves.length} entr${moves.length === 1 ? 'y' : 'ies'})`)
        } else {
          renameSync(src, dst)
          console.log(`[scenes] renamed draft '${scene}' → '${to}'`)
        }
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, id: to }))
      } catch (err) { fail(400, err.message) }
    })
    return
  }

  const dropMatch = path.match(/^\/([a-z0-9][a-z0-9-]*)$/)
  if (req.method === 'DELETE' && dropMatch && !RESERVED_PREFIXES.has(dropMatch[1])) {
    const scene = dropMatch[1]
    try {
      const dir = join(mapCleanDir(scene), '..')
      // ⛔ Read the marker; an unreadable neighborhood.json is NOT "uncommitted".
      // Absent means never committed (a draft). Present-but-unparseable means we do
      // not know, and refusing to delete on "we do not know" is the only safe answer.
      const nbPath = join(dir, 'neighborhood.json')
      let committed = false, unreadable = false
      if (existsSync(nbPath)) {
        try { committed = !!JSON.parse(readFileSync(nbPath, 'utf8')).committed }
        catch { unreadable = true }
      }
      if (committed || unreadable) {
        res.writeHead(409, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: unreadable
          ? `'${scene}' has an unreadable neighborhood.json — refusing to discard a scene whose committed state cannot be read. Fix or move that file first.`
          : `'${scene}' is a committed neighborhood — it cannot be discarded from the picker.` }))
        return
      }
      rmSync(dir, { recursive: true, force: true })
      console.log(`[scenes] discarded draft '${scene}'`)
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}')
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

  const nbdMatch = path.match(/^\/([a-z0-9][a-z0-9-]*)\/neighborhood$/)
  if (nbdMatch && !RESERVED_PREFIXES.has(nbdMatch[1])) {
    const scene = nbdMatch[1]
    // ⛔ A numeric id is a ZIP, not a place: never create a scene under one.
    if (req.method === 'POST' && isNumericId(scene)) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: `'${scene}' is a number — a scene is named after the place, never a ZIP.` }))
      return
    }
    const nPath = join(mapCleanDir(scene), '..', 'neighborhood.json')
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(existsSync(nPath) ? readFileSync(nPath) : '{}')
      return
    }
    if (req.method === 'POST') {
      let body = ''
      req.on('data', c => body += c)
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}')
          mkdirSync(dirname(nPath), { recursive: true })
          // MERGE onto the existing record — a draft autosave carries only the
          // fields it touches (sides/radius/name/blurb) and must NOT drop the
          // committed flag, derived timezone, or borderStreets that commit wrote.
          const prior = existsSync(nPath) ? (() => { try { return JSON.parse(readFileSync(nPath, 'utf8')) } catch { return {} } })() : {}
          writeIfChanged(nPath, JSON.stringify({ ...prior, ...parsed }, null, 2))
          res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}')
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: err.message }))
        }
      })
      return
    }
  }

  // POST /<scene>/commit-extent — the deliberate finalize. The FRAME NEVER MOVES (no re-centre, no reproject): the hood
  // centre is stored off-origin on the disc; skeleton.js runs in the frozen frame; the records are written through
  // commitExtent.mjs (each only when its value changed). Body { center:{lat,lon}, radius, name, blurb, exclusions,
  // polygon, polygonSource }. Long-running; guarded.
  const commitMatch = path.match(/^\/([a-z0-9][a-z0-9-]*)\/commit-extent$/)
  if (req.method === 'POST' && commitMatch && !RESERVED_PREFIXES.has(commitMatch[1])) {
    const scene = commitMatch[1]
    let body = ''
    req.on('data', c => body += c)
    req.on('end', async () => {
      if (_seedsInFlight.has(scene)) {
        res.writeHead(409, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'busy' })); return
      }
      _seedsInFlight.add(scene)
      try {
        const { center, radius, name, blurb, exclusions, polygon, polygonSource } = JSON.parse(body || '{}')
        if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lon)) throw new Error('need center {lat,lon}')
        if (!Number.isFinite(radius) || radius <= 0) throw new Error('need a positive radius')
        const geoPath = mapDataPaths(scene).geography
        // ── (Re-center guard REMOVED 2026-07-23 — EXTENT-DESIGN §3.3) ────────
        // It refused a committed hood whose `center` moved >5 m, to stop the FRAME
        // from shifting (which orphans blockCustoms). Under the never-move model
        // the frame origin is FROZEN at the fetch center and the hood center is
        // stored OFF-ORIGIN on the disc — so there is no frame move to guard, and
        // `center` legitimately differs from the origin on any off-centre hood.
        // (Jacob, 2026-07-23.)
        // Snapshot the pre-commit frame so a failure mid-Pour can roll back.
        // Consumed by /rollback-extent when onBuild throws before the bake lands.
        // Stale .prebak from a prior run is cleared first so only one exists.
        snapshotApply(scene, 'prebak')
        const geo = JSON.parse(readFileSync(geoPath, 'utf8'))
        // ⭐ NEVER MOVE THE FRAME ORIGIN (EXTENT-DESIGN §3.3): the hood centre is stored OFF-ORIGIN on the disc; no
        // reproject, ever. ⭐ AND A COMMIT CARRIES EVERY KEY IT DOES NOT OWN (commitExtent.mjs): it rebuilt
        // neighborhood.json from fixed fields, dropping `sides` (the live extent mechanism) and `_note`, and overwrote
        // geography's `_comment`. Each record is written only when its VALUE changed, so a re-commit of unchanged
        // inputs leaves every file byte-identical (▶ node checks/claims-a-recommit-changes-nothing.mjs).
        let timezone = null
        try { timezone = tzLookup(center.lat, center.lon) } catch { /* keep prior tz */ }
        const nPath = join(mapCleanDir(scene), '..', 'neighborhood.json')
        const priorNeighborhood = existsSync(nPath) ? JSON.parse(readFileSync(nPath, 'utf8')) : null
        const priorRecs = readBoundaryRecords(scene)
        const rec = commitExtentRecords({ geo, prev: { neighborhood: priorNeighborhood, boundaryRecords: priorRecs },
          body: { center, radius, name, blurb, exclusions, polygon, polygonSource }, timezone, scene })
        // ⛔ The disc must lie inside the data that was fetched (EXTENT-DESIGN §4) — refused BEFORE anything is written.
        assertDiscInBox(geo, rec.discCenter, radius, `[commit-extent] ${scene}`)
        const here = import.meta.dirname
        const env = { ...process.env, CARTOGRAPH_SCENE: scene }
        // No reproject-raw — the origin didn't move. Still bake the real skeleton (the hard fetch's job) in the frozen frame,
        // through the Bake's own skeleton step and recorder, so the next Bake judges it done. ⛔ BEFORE THE FIRST WRITE (Zob's H2):
        // it may refuse (it would re-key the authoring), and a refusal after geography.json is written left two states, with no
        // rollback (the client sets committedThisRun only on success). It reads no geography value (skeleton.js takes only
        // RAW_DIR, CLEAN_DIR and requireExplicitMap from config.js), so the commit's records may follow it.
        await runExtentSkeleton(scene, { cwd: here, env })
        if (!sameJson(rec.geography, geo)) writeFileSync(geoPath, JSON.stringify(rec.geography, null, 2))
        _streetLookupCache.delete(scene)
        // The boundary: `boundary` = the 256-gon RENDER DISC derived from `radius` ("how much world do we draw");
        // `polygon` = MEMBERSHIP ("what is IN the neighborhood"), first-class and PRESERVED when none is supplied.
        // Membership is (polygon ∪ activate) − (exclusions ∪ hide); the disc only where no polygon is authored.
        if (rec.membership && Array.isArray(polygon) && polygon.length >= 3) console.log(`[commit-extent] ${scene}: inclusion polygon ${rec.membership.polygon.length} pts (source=${rec.membership.polygonSource})`)
        else if (rec.membership) console.log(`[commit-extent] ${scene}: preserved existing inclusion polygon (${rec.membership.polygon.length} pts) — none supplied`)
        const bPath = mapDataPaths(scene).boundary
        const priorBoundary = existsSync(bPath) ? JSON.parse(readFileSync(bPath, 'utf8')) : null
        if (!sameJson(rec.boundary, priorBoundary)) writeFileSync(bPath, JSON.stringify(rec.boundary, null, 2))
        // Persist the editable exclusion loops AND the inclusion polygon (both lon/lat) so reopening a committed hood
        // returns them fully editable — the "keep fixing across sessions" contract. Every other key is carried.
        if (!sameJson(rec.neighborhood, priorNeighborhood)) writeFileSync(nPath, JSON.stringify(rec.neighborhood, null, 2))
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, center: { lat: geo.lat, lon: geo.lon }, radius: Math.round(radius) }))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: err.message }))
      } finally {
        _seedsInFlight.delete(scene)
      }
    })
    return
  }

  // POST /<scene>/pour — the one-click pour: pipeline.js (derive → map.json,
  // clipped to the committed boundary) → promote-ribbons.js (→ clean/ribbons.json
  // the Designer renders). Long-running (the derive stage); guarded per scene.
  const pourMatch = path.match(/^\/([a-z0-9][a-z0-9-]*)\/pour$/)
  if (req.method === 'POST' && pourMatch && !RESERVED_PREFIXES.has(pourMatch[1])) {
    const scene = pourMatch[1]
    if (_seedsInFlight.has(scene)) {
      res.writeHead(409, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'busy' })); return
    }
    _seedsInFlight.add(scene)
    ;(async () => {
      try {
        const here = import.meta.dirname
        const env = { ...process.env, CARTOGRAPH_SCENE: scene }
        // the Bake's own steps, each recorded (pourSteps.mjs). promote-ribbons runs with --yes: the Bake that called this IS the
        // operator's decision, and the change is RETURNED, not hidden.
        const { promoteDiff } = await runExtentPour(scene, { cwd: here, env })
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, promoteDiff }))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: err.message }))
      } finally {
        _seedsInFlight.delete(scene)
      }
    })()
    return
  }

  // POST /<scene>/rollback-extent — undo a failed commit (§6 atomicity). commit
  // re-centers geography + reprojects raw destructively; if the ensuing Pour/bake
  // throws, the scene is left re-centered + committed but slab-less. This restores
  // geography/boundary/neighborhood from the .prebak snapshots commit made, then
  // re-projects raw + re-derives skeleton back to the restored frame.
  const rollbackMatch = path.match(/^\/([a-z0-9][a-z0-9-]*)\/rollback-extent$/)
  if (req.method === 'POST' && rollbackMatch && !RESERVED_PREFIXES.has(rollbackMatch[1])) {
    const scene = rollbackMatch[1]
    if (_seedsInFlight.has(scene)) { res.writeHead(409, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'busy' })); return }
    _seedsInFlight.add(scene)
    ;(async () => {
      try {
        const restored = restoreApply(scene, 'prebak')
        if (restored) {
          const here = import.meta.dirname
          const env = { ...process.env, CARTOGRAPH_SCENE: scene }
          await runShell('node reproject-raw.js', { cwd: here, env, timeout: 60000 })
          await runExtentSkeleton(scene, { cwd: here, env })
          _streetLookupCache.delete(scene)
        }
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, restored }))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: err.message }))
      } finally { _seedsInFlight.delete(scene) }
    })()
    return
  }

  // POST /<scene>/rescope — live radius re-scope (§4, the §11 living boundary):
  // rewrite neighborhood_boundary.json with a new radius circle — PRESERVING the
  // membership polygon (streets/official boundary unchanged) — then re-clip
  // (pipeline) + ribbons. No re-name, no re-center, no skeleton; the client then
  // re-bakes. Body { radius }. Long-running (the derive stage); guarded per scene.
  const rescopeMatch = path.match(/^\/([a-z0-9][a-z0-9-]*)\/rescope$/)
  if (req.method === 'POST' && rescopeMatch && !RESERVED_PREFIXES.has(rescopeMatch[1])) {
    const scene = rescopeMatch[1]
    let body = ''
    req.on('data', c => body += c)
    req.on('end', async () => {
      if (_seedsInFlight.has(scene)) { res.writeHead(409, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'busy' })); return }
      _seedsInFlight.add(scene)
      let rescopeSnapshotted = false
      try {
        const { radius, exclusions, dropPolygon = false, polygon, polygonSource, center } = JSON.parse(body || '{}')
        if (!Number.isFinite(radius) || radius <= 0) throw new Error('need a positive radius')
        const bPath = mapDataPaths(scene).boundary
        if (!existsSync(bPath)) throw new Error('no committed boundary to re-scope — Pour first')
        const prev = JSON.parse(readFileSync(bPath, 'utf8'))
        // ⭐ PRESERVE THE DISC CENTER (D4 residual, fixed 2026-07-23). This called
        // the disc constructor with no center, which defaults to [0,0] — so
        // every radius edit on a committed hood silently SNAPPED THE DISC BACK TO
        // THE ORIGIN, discarding an authored off-origin center. That is the whole
        // reason a hand-placed disc kept "reverting" to [0,0]: not the commit path
        // (fixed in d82c5e60), but this one — the path a committed hood's Bake takes,
        // i.e. every subsequent edit.
        //
        // Rescope is the LIGHT re-apply and by definition never re-centers, so the
        // center is a preserved field like polygon/exclusions below, not an input.
        // A boundary with no `center` is REFUSED by `makeDiscRecord` (BRIEF-the-disc-is-one-source §1b: never the origin
        // by default; every town on disk carries one). (R10 two centers, EXTENT-DESIGN
        // §3.3: the FRAME origin is frozen forever; the DISC center is free to roam
        // the forever zone — moving the disc must never move the frame.)
        //
        // ⭐ AND it may now be SET explicitly (`center: [x,z]`, local frame). Without
        // this, a committed hood's disc center could never be changed at all: rescope
        // preserved it, and the only path that WROTE one was `commit-extent` — the
        // heavy re-center, which is exactly what the re-center guard forbids on a
        // committed hood. That left the authored-off-origin disc unreachable after
        // the first pour (the CenterHandle is still gated to `!committed`,
        // `ExtentApp.jsx` — un-gating it is the remaining half).
        //
        // Moving the DISC is not moving the FRAME: this rewrites only
        // neighborhood_boundary.json's center + ring, never geography.json, so no
        // reprojection, no skeleton rebuild, no identity churn (R10).
        const discCenter = Array.isArray(center) && center.length === 2 && center.every(Number.isFinite)
          ? center
          : prev.center
        if (Array.isArray(center) && discCenter !== prev.center) {
          console.log(`[rescope] ${scene}: disc center ${JSON.stringify(prev.center)} → ${JSON.stringify(discCenter)} (frame origin untouched)`)
        }
        // ⭐ THREE RECORDS (EXTENT-DESIGN §5.1). (The edge's fade is not here — it is the Look's.)
        // ⛔ The disc must lie inside the data that was fetched (EXTENT-DESIGN §4) — refused before anything is written.
        assertDiscInBox(JSON.parse(readFileSync(mapDataPaths(scene).geography, 'utf8')), discCenter, radius, `[rescope] ${scene}`)
        const priorRecs = splitBoundary(prev, `${scene}/neighborhood_boundary.json`)
        const disc = makeDiscRecord({
          radius, center: discCenter,
          where: `${scene}/neighborhood_boundary.json`,
        })
        let membership = priorRecs.membership   // preserved unless a gesture says otherwise
        let excl = priorRecs.exclusions
        // The LIGHT re-apply — re-clip + re-bake in the committed frame, no re-center.
        if (Array.isArray(exclusions)) {
          // EXCLUDER model: membership = inside-circle − exclusions.
          //
          // ⚠️ THIS BRANCH USED TO DROP THE INCLUSION POLYGON UNCONDITIONALLY, and
          // ExtentApp always sends an exclusions array — so ANY extent edit silently
          // deleted an authored boundary, even with zero loops. That is destructive:
          // hipointedemun is the EXEMPLAR hood (4 authored boundary streets + hand-
          // activated edge buildings) and was one Bake away from becoming a bare circle.
          //
          // The original reason for the drop was Altadena's stale 628-pt snap-route
          // ring clipping to the OLD boundary. That reason has expired: Altadena now
          // carries NO polygon. So preserving is strictly protective today.
          // (⚠️ this comment read "hipointedemun is the only scene with one" as of
          // 2026-07-20; centrum has carried an 815-pt polygon since — the guard now
          // protects more than one hood. Corrected 2026-07-21.)
          //
          // The polygon is the INTENDED membership mechanism, not a legacy artifact —
          // it is what the boundary-street process produces. Dropping it is now an
          // EXPLICIT act (`dropPolygon: true`), never a side effect of editing extent.
          const geo = JSON.parse(readFileSync(mapDataPaths(scene).geography, 'utf8'))
          const flatExcl = exclusions.map(loop => flattenBoundaryPath(loop, geo)).filter(poly => Array.isArray(poly) && poly.length >= 3)
          excl = flatExcl.length ? flatExcl : null
          if (dropPolygon) {
            if (membership) console.log(`[rescope] ${scene}: DROPPING inclusion polygon (${membership.polygon.length} pts) — explicitly requested`)
            membership = null
          } else if (Array.isArray(polygon) && polygon.length >= 3) {
            // A NEW inclusion polygon supplied by the operator. Rescope is the path a
            // COMMITTED hood's Bake takes, so without this the boundary could only ever
            // be authored on a hood's very first pour — and an existing hood (Księży
            // Młyn) could never adopt one at all. lon/lat in, flattened to the committed
            // frame, same as commit-extent.
            const geoR = JSON.parse(readFileSync(mapDataPaths(scene).geography, 'utf8'))
            const flat = flattenBoundaryPath({ closed: true, anchors: polygon }, geoR)
            if (!Array.isArray(flat) || flat.length < 3) throw new Error('inclusion polygon flattened to fewer than 3 points')
            membership = { polygon: flat, polygonSource: polygonSource || 'authored' }
            console.log(`[rescope] ${scene}: NEW inclusion polygon ${flat.length} pts (source=${membership.polygonSource})`)
          } else if (membership) {
            console.log(`[rescope] ${scene}: preserved inclusion polygon (${membership.polygon.length} pts)`)
          }
        }
        // (No `else` — the legacy radius-only rescope preserved the prior membership
        // shape by hand. Records make that the default, so the branch is now empty.)
        const boundary = composeBoundary({
          disc, membership, exclusions: excl,
          carry: priorRecs.carry, keyOrder: priorRecs.keyOrder,
        })
        // Snapshot EVERYTHING this apply changes (boundary, draft, and the pour's outputs), and
        // restore it if the pour fails — one consistent state either way (applySnapshotPaths).
        snapshotApply(scene, 'prebak-rescope')
        rescopeSnapshotted = true
        writeFileSync(bPath, JSON.stringify(boundary, null, 2))
        const nPath = join(mapCleanDir(scene), '..', 'neighborhood.json')
        if (existsSync(nPath)) {
          try { const nb = JSON.parse(readFileSync(nPath, 'utf8')); nb.draftRadius = Math.round(radius); delete nb.radius; if (Array.isArray(exclusions)) nb.exclusions = exclusions; writeFileSync(nPath, JSON.stringify(nb, null, 2)) } catch { /* leave nb */ }
        }
        const here = import.meta.dirname
        const env = { ...process.env, CARTOGRAPH_SCENE: scene }
        const { promoteDiff } = await runExtentPour(scene, { cwd: here, env })   // the Bake's own steps, each recorded (the mint reads clean/coast.json)
        clearApplySnapshot(scene, 'prebak-rescope')
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, radius: Math.round(radius), promoteDiff }))
      } catch (err) {
        // ⛔ A failed rescope RESTORES — it used to leave the new boundary beside old pour outputs.
        const restored = rescopeSnapshotted ? restoreApply(scene, 'prebak-rescope') : false
        res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: err.message, restored }))
      } finally { _seedsInFlight.delete(scene) }
    })
    return
  }

  // ── Looks ───────────────────────────────────────────────────────────────
  // Each Look is a styling snapshot: design.json (material palette + shader
  // params) + the per-Look bake bundle (public/baked/<id>/). The default
  // Look is the project's 0-state and can't be deleted.

  // GET /tree — the repo tree this server reads and writes (its realpath). A check that edits a file and then asks this
  // server must be asking the server of ITS tree; it compares this with its own root and refuses otherwise.
  // ▶ checks/claims-a-stage-entry-knows-its-slab-age.mjs
  if (req.method === 'GET' && path === '/tree') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ root: realpathSync(join(import.meta.dirname, '..')) }))
    return
  }

  // GET /looks — list of {id, name, createdAt} + the default id.
  if (req.method === 'GET' && path === '/looks') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(readLooksIndex()))
    return
  }

  // GET /looks/<id>/design — the Look's autosaved design block.
  // Returns {} (not 404) for an existing Look without a design yet, so the
  // client can hydrate without a special-case error path.
  let m
  // GET /maps/<map>/deployment — what each surface ships (src/lib/deployment.js): the town's deployment.json (`file`,
  // null when it has none) and whether staging's manifest carries it (`shipped`: true · false · null = unreadable), so
  // Preview can say whether the next Publish still has to carry an edit. ⛔ Town-keyed, not Look-keyed: deployment is per town.
  // POST /maps/<map>/deployment — Preview's deployment panel autosaves the whole file. Checked (readDeployment) before
  // it is written; nothing else is touched: the next Publish freezes it into the manifest and ships it.
  if ((m = path.match(/^\/maps\/([^/]+)\/deployment$/)) && (req.method === 'GET' || req.method === 'POST')) {
    const map = m[1]
    const dir = join(import.meta.dirname, 'data', map)
    if (!/^[a-z0-9-]+$/.test(map) || !existsSync(join(dir, 'town-id.json'))) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: `"${map}" is no town (no cartograph/data/${map}/town-id.json)` }))
      return
    }
    const file = join(dir, 'deployment.json')
    if (req.method === 'GET') {
      const body = orFail(res, () => ({ file: existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null }))
      if (body === undefined) return
      try { body.shipped = (await deploymentShipped(map, map, 'staging')).shipped } catch (e) { body.shipped = null; body.why = e.message }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(body))
      return
    }
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body)
        readDeployment(parsed, `the deployment posted for "${map}"`)
        writeJson(file, { surfaces: parsed.surfaces })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end('{"ok":true}')
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  if (req.method === 'GET' && (m = path.match(/^\/looks\/([^/]+)\/design$/))) {
    const id = m[1]
    const idx = readLooksIndex()
    if (!idx.looks.some(l => l.id === id)) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unknown look' }))
      return
    }
    const design = orFail(res, () => readLookDesign(id))
    if (design === undefined) return
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(design))
    return
  }

  // POST /looks/<id>/design — autosave write. Body: design block JSON.
  // Preserves keys Cartograph doesn't author (notably `trees`, written
  // by Arborist) so a Cartograph autosave can't clobber Arborist's
  // roster. Co-authoring across apps relies on this merge.
  if (req.method === 'POST' && (m = path.match(/^\/looks\/([^/]+)\/design$/))) {
    const id = m[1]
    const idx = readLooksIndex()
    if (!idx.looks.some(l => l.id === id)) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unknown look' }))
      return
    }
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body)
        // ⛔ Throws rather than merging into `{}` — an unreadable file here would
        // silently drop Arborist's `trees` and then persist the loss.
        const existing = readLookDesign(id)
        // Preserve keys another endpoint owns (read-merge-write behind Stage's back) if the incoming
        // payload omits them: the Arborist's `trees`, the Grove's `groveThreshold`, and the keys authored in the
        // file (no Stage control) and read by the bakes — `water` (the town's water level and bed values) and `pour`.
        // ▶ checks/claims-autosave-keeps-what-bakes-read.mjs
        const merged = { ...parsed }
        for (const k of ['trees', 'groveThreshold', 'water', 'pour']) {
          if (!(k in parsed) && k in existing) merged[k] = existing[k]
        }
        mkdirSync(lookDir(id), { recursive: true })
        writeJson(lookDesignPath(id), merged)
        // Touch updatedAt so clients can show "last edited" if they want.
        const idx2 = readLooksIndex()
        const entry = idx2.looks.find(l => l.id === id)
        if (entry) { entry.updatedAt = Date.now(); saveLooksIndex(idx2) }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end('{"ok":true}')
      } catch (err) {
        // 500 for an unreadable existing design (readLookDesign), 400 for a bad
        // payload — the caller must be able to tell "your body was wrong" from
        // "the file on disk is damaged; do not retry, you will overwrite it".
        if (err.statusCode) console.error(`[looks] ${err.message}`)
        res.writeHead(err.statusCode || 400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // GET /looks/<id>/trees — Arborist's tree roster for this Look.
  // Returns [] when the Look hasn't been curated yet.
  if (req.method === 'GET' && (m = path.match(/^\/looks\/([^/]+)\/trees$/))) {
    const id = m[1]
    const idx = readLooksIndex()
    if (!idx.looks.some(l => l.id === id)) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unknown look' }))
      return
    }
    const design = orFail(res, () => readLookDesign(id))
    if (design === undefined) return
    const trees = Array.isArray(design.trees) ? design.trees : []
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ trees }))
    return
  }

  // POST /looks/<id>/trees — replace this Look's tree roster. Body:
  // { trees: [{species, variantId}, …] }. Read-merge-write so a
  // concurrent Cartograph autosave can't drop the trees field.
  if (req.method === 'POST' && (m = path.match(/^\/looks\/([^/]+)\/trees$/))) {
    const id = m[1]
    const idx = readLooksIndex()
    if (!idx.looks.some(l => l.id === id)) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unknown look' }))
      return
    }
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}')
        const trees = Array.isArray(parsed.trees) ? parsed.trees : []
        // Normalize: drop entries missing species or variantId.
        const clean = trees
          .filter(t => t && t.species && (t.variantId != null))
          .map(t => ({ species: String(t.species), variantId: Number(t.variantId) }))
        // ⛔ Throws rather than `{}` — this is a read-merge-write, so an unreadable
        // file would spread into an EMPTY object and write the whole design.json
        // down to just `trees`, destroying every other channel silently.
        const existing = readLookDesign(id)
        const merged = { ...existing, trees: clean }
        mkdirSync(lookDir(id), { recursive: true })
        writeJson(lookDesignPath(id), merged)
        const idx2 = readLooksIndex()
        const entry = idx2.looks.find(l => l.id === id)
        if (entry) { entry.updatedAt = Date.now(); saveLooksIndex(idx2) }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, count: clean.length }))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // GET /looks/<id>/grove-threshold — the Grove build-eligibility perf lever:
  // { topN, pinned:[species] }. topN = the bar (top-N species by census count
  // build; the rest substitute to a same-category built neighbour at runtime);
  // pinned = species kept IN even below the bar. Absent → { topN:null, pinned:[] }
  // (null = no cut, every species eligible — today's behaviour).
  if (req.method === 'GET' && (m = path.match(/^\/looks\/([^/]+)\/grove-threshold$/))) {
    const id = m[1]
    const design = orFail(res, () => readLookDesign(id))
    if (design === undefined) return
    const gt = design.groveThreshold || { topN: null, meshTopN: null, pinned: [], withheld: [] }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(gt))
    return
  }

  // POST /looks/<id>/grove-threshold — read-merge-write the bar state into
  // design.json (targeted, so it can't clobber `trees` or the Cartograph design).
  if (req.method === 'POST' && (m = path.match(/^\/looks\/([^/]+)\/grove-threshold$/))) {
    const id = m[1]
    const idx = readLooksIndex()
    if (!idx.looks.some(l => l.id === id)) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unknown look' }))
      return
    }
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}')
        const topN = Number.isFinite(parsed.topN) ? Math.max(0, Math.floor(parsed.topN)) : null
        const list = (v) => Array.isArray(v) ? [...new Set(v.filter(Boolean).map(String))] : []
        const pinned = list(parsed.pinned)
        // ⛔ WITHHELD WINS. "We have this model and it is not good enough to go out" is a
        // judgement no ranking overrides, so a species in both lists is withheld — and the
        // server enforces that rather than trusting the client to keep them disjoint.
        const withheld = list(parsed.withheld)
        const pinnedClean = pinned.filter(s => !withheld.includes(s))
        // ⛔ Same read-merge-write hazard as the trees writer above.
        const existing = readLookDesign(id)
        // ⛔ THE MESH BAR IS NESTED INSIDE THE IMPOSTOR BAR and the server enforces it.
        // A mesh species still needs an impostor — only its TALLEST placements keep
        // geometry, the rest of that same species render as impostors — so meshTopN above
        // topN is not a preference, it is incoherent.
        let meshTopN = Number.isFinite(parsed.meshTopN) ? Math.max(0, Math.floor(parsed.meshTopN)) : null
        if (meshTopN != null && topN != null && meshTopN > topN) meshTopN = topN
        const merged = { ...existing, groveThreshold: { topN, meshTopN, pinned: pinnedClean, withheld } }
        mkdirSync(lookDir(id), { recursive: true })
        writeJson(lookDesignPath(id), merged)
        const idx2 = readLooksIndex()
        const entry = idx2.looks.find(l => l.id === id)
        if (entry) { entry.updatedAt = Date.now(); saveLooksIndex(idx2) }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, groveThreshold: merged.groveThreshold }))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // POST /looks/<id>/bake — re-bake this Look's bundle (ground / buildings
  // / lamps / scene / trees / ground-ao) from its design.json. Steps run
  // via `runShell` (async spawn) so other API requests keep flowing during
  // the bake. Per-look lock rejects concurrent bakes against the same Look.
  // ⭐ GET /looks/<id>/bake — THE SAME ROUTE AS A PLAN: "is this slab older than what the bake reads, and why?"
  // It walks this exact body with `P.plan` set, so every decision below (the re-pour question, each step's
  // content record, a missing output) is asked the one way; nothing runs and nothing is written, and the answer
  // is `{ stale: [{ step, why }] }`. ⛔ There is no second staleness model: Stage's entry reads this.
  // ▶ node checks/claims-a-stage-entry-knows-its-slab-age.mjs
  if ((req.method === 'POST' || req.method === 'GET') && (m = path.match(/^\/looks\/([^/]+)\/bake$/))) {
    const id = m[1]
    const planning = req.method === 'GET'
    const idx = readLooksIndex()
    if (!idx.looks.some(l => l.id === id)) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unknown look' }))
      return
    }
    if (_bakesInFlight.has(id)) {
      res.writeHead(409, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'bake already in progress for this look', lookId: id }))
      return
    }
    if (!planning) _bakesInFlight.add(id)
    const P = { lookId: id, startedAt: Date.now(), finishedAt: null, steps: bakePlan().map(label => ({ label, state: 'waiting' })), current: null, cancel: null, child: null,
                plan: planning ? { stale: [] } : null }
    if (!planning) _bakeProgress.set(id, P)
    try {
      const t0 = Date.now()
      // Full bake chain — every step the operator might forget rolled into
      // the Bake button so "edit, bake, see" actually works:
      //
      //   1. pipeline.js + promote-ribbons.js — re-derive map.json + ribbons
      //      from the latest measurements/overlay/centerlines edits.
      //   2. cartograph bakes — ground / buildings / lamps / scene from
      //      the freshly-derived map.json.
      //   3. arborist tree bake — public/baked/<scene>/trees.json placements;
      //      reads map.json for forbidden-surface polygons.
      //   4. ground-ao bake last — slowest (~25 sec), benefits from
      //      stable upstream geometry.
      //
      // Each step is incremental: skipped when all outputs are newer than
      // every declared input (including its own .js source). Pass
      // `?force=1` on the bake URL to force a full rebuild.
      //
      // bake-svg.js is intentionally NOT run here — it's demoted to a
      // CLI-only QA artifact (human-readable / diffable); the runtime
      // consumes ground.json + ground.bin + ground.lightmap exclusively.
      const force = /[?&]force=1\b/.test(req.url || '')
      const repourConfirmed = /[?&]repour=1\b/.test(req.url || '')
      const REPO_ROOT = join(import.meta.dirname, '..')
      const here = import.meta.dirname
      // Bake inputs come from the active Look's scene. A Look without an
      // explicit scene is REFUSED (409) — see the block below; it does NOT
      // fall back. (This comment said "fall back to the default" until
      // 2026-08-02, contradicting the code six lines down.)
      const bakeLookEntry = idx.looks.find(l => l.id === id)
      // ⛔⛔ Was: `|| DEFAULT_MAP` — a bake whose Look carried no scene BAKED OVER
      // Lafayette Square (BRIEF-ls-bleed-excision site 14). This is the destructive
      // end of the class and the mechanism behind ORIENTATION's palimpsest warning;
      // it already fired once, 2026-07-23. Nothing that WRITES may fall back.
      const bakeScene = bakeLookEntry?.scene
      if (!bakeScene) {
        const msg = `refusing to bake: look '${bakeLookEntry?.id ?? '?'}' has no scene, and there is no default town to bake into.`
        console.error('[bake] ⛔ ' + msg)
        res.writeHead(409, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: msg }))
        return
      }
      const bakePaths = mapDataPaths(bakeScene)
      // every file the pour runs — the ① mint included. ⛔ `references/registry.json` is NOT watched by mtime: the
      // research DB is edited constantly (rulings, questions) and a prompt the operator learns to click through stops
      // warning. It is judged by CONTENT below — only the entries this town's last pour READ (`registryRead`).
      // ⭐ The town modules (src/instances/*) are NOT in it: the pour reads them only as a geography VALUE, recorded
      // and compared as `geographyRead` (pour-code.mjs) — so a favicon or a domain edit asks no town to re-pour.
      const PIPELINE_SRC = pourCodeClosure()
      const MAP_JSON   = bakePaths.map
      // The scene's OWN ribbons: LS's live in the runtime bundle, every other
      // town's in its clean/ (promote-ribbons.js's rule). ⛔ Comparing a poured
      // town's map.json against LS's bundle would skip or force it on LS's clock.
      const RIBBONS    = ribbonsPathOf(bakeScene)   // the one answer (scene.js)
      const DESIGN    = join(REPO_ROOT, 'public', 'looks', id, 'design.json')
      // The TOWN's design fields (cartograph/lookDesign.mjs#TOWN_DESIGN_FIELDS) are read from the town's home Look for
      // every Look of it, so a step that reads them declares this file. Declared because it is READ.
      const SCENE_DESIGN = join(REPO_ROOT, 'public', 'looks', bakeScene, 'design.json')
      const LOOK_DIR  = join(REPO_ROOT, 'public', 'baked', id)
      refuseTornCommit(undefined, id)   // ⛔ a torn slab commit (slabStage.mjs's journal) stops this look's Bake, by name
      const sceneFlag = `--scene=${bakeScene}`
      const ranSteps = []
      const skipped = []
      // a step skipped as clean (or not applicable) is MARKED — the modal shows it, never leaves it waiting
      const skip = (text) => { skipped.push(text); for (const l of text.split(/ [(—]/)[0].split(' + ')) markStep(P, l.trim(), 'skipped', { why: text }) }
      P.scene = bakeScene
      const timings = readBakeTimings(MAP_JSON)
      for (const st of P.steps) { const t = timings[`${id}:${st.label}`]; if (t) st.est = t.ms }
      const ran = (label) => { if (P.plan) return; ranSteps.push(label); const st = P.steps.find(x => x.label === label); if (st?.t0 && st?.t1) saveBakeTiming(MAP_JSON, id, label, st.t1 - st.t0) }
      // ⭐ BY CONTENT (Boz's rulings, 2026-09-26; BRIEF-dirty-graph §5). A step's CODE is its declared scripts' whole
      // import closure; its DATA is every other declared input. Both are compared with what it read when it last ran
      // (`bake-reads.json`), so a change to a helper it imports re-runs it, and a date that moved alone does not.
      // ⛔ `judge: 'mtime'` is the POUR only: its code, geography, registry and other data reads are judged by content
      // above (map.json's records, behind the question); its authoring inputs re-pour on a newer mtime, unasked.
      const bakeReads = readBakeReads(MAP_JSON)
      // `absentOk`: outputs a step may legitimately not write (revetment on a town with no shore). Missing after a
      // recorded run is that step's answer, not a stale slab; missing with no record still runs it.
      // `stage`: the step writes into a stage (`--out-dir=`) and its outputs reach the slab only when it succeeds
      // (slabStage.mjs#stagedSlabStep); `stage.published` is then the names it changed.
      // `force: false` holds one step out of `?force=1`; `asks`: the step runs only behind the re-pour question (a stale one, not
      // confirmed, returns { ask: why } for the caller's 428, and a plan lists it `repour: true`). Returns { stale: why } when a plan
      // lists it.
      const runIfDirty = async (label, inputs, outputs, cmd, { judge, absentOk = [], requires = [], stage, force: forceThis = force, asks = false, ...opts } = {}) => {
        // ⛔ A REQUIRED INPUT THAT IS MISSING REFUSES THE BAKE, BY NAME (2026-10-28: LS's Bake called 15/15 clean with its grove's
        // atlas absent, because a missing input hashes to null both times and null === null). `requires`: [{ path, why }]. Only the
        // inputs a step cannot run without: an optional one (the coast's water datums, inland) stays an ordinary input.
        // ⭐ In the PLAN (GET …/bake: Stage's slab age, the stale bar, Publish's staleness) it is a named BLOCKER entry, never a
        // throw: a town whose grove is not baked still gets its list (Zob's read, 2026-10-28). Only a RUN refuses.
        const absent = requires.filter(r => !existsSync(r.path))
        if (absent.length) { const why = absent.map(r => `${r.why} (${r.path.replace(REPO_ROOT + '/', '')} is missing)`)
          if (P.plan) { P.plan.stale.push({ step: label, blocker: true, why }); return }
          throw new Error(`[bake] ⛔ ${label}: ${why.join(' · ')}`) }
        if (judge === 'mtime') {
          if (!forceThis && !needsRebuild(inputs, outputs)) { skip(label); return }
          if (P.plan) { P.plan.stale.push({ step: label, why: ['an authoring input is newer than its output'] }); return }
          await runStep(P, label, cmd, opts); ran(label); return
        }
        const { code, data } = stepReads(inputs, bakeScene)   // the step's import closure, its data and the town's record (pourSteps.mjs)
        const was = bakeReads[`${id}:${label}`], who = `step "${label}"`
        const why = was ? [...contentChanged(was.code, code, who), ...contentChanged(was.data, data, who)] : contentChanged(undefined, [], who)
        const missing = outputs.filter(o => !existsSync(o) && !(was && absentOk.includes(o)))
        if (!forceThis && !why.length && !missing.length) { skip(label); return }
        const stale = [...why, ...missing.map(o => `${o.replace(REPO_ROOT + '/', '')} missing`)]
        if (P.plan) { P.plan.stale.push({ step: label, ...(asks && { repour: true }), why: stale }); return { stale } }
        if (asks && !repourConfirmed) return { ask: stale }
        console.log(`[bake] ${label}: ${stale.slice(0, 5).join(', ')}`)
        if (stage) stage.published = await stagedSlabStep({ ...stage, step: (dir) => runStep(P, label, `${cmd} --out-dir="${dir}"`, opts) })
        else await runStep(P, label, cmd, opts)
        // recorded AFTER the run: an input that is also an output (ground-ao's ground.json) is recorded as it left it
        recordStep(MAP_JSON, [id], label, inputs, bakeScene)   // the one recorder (pourSteps.mjs), as Extent's pours record
        ran(label)
      }
      // Bake only ACTIVATED content: a hidden layer (layerVis=false) doesn't get
      // its (often heavy) sub-bake run at all — the operator's visibility is a
      // bake lever, not just a render toggle. Mirrors the ground-bake group prune.
      // Render already mount-gates hidden decorations off the scene.json snapshot,
      // so a stale artifact (if one exists from when it was last shown) is never
      // fetched; re-showing flips design.json → the sub-bake is dirty → re-runs.
      // The Look's design.json, parsed ONCE — layerVis gates the sub-bakes below,
      // and design.landscape.source gates the landscape step (a20619cc). ⛔ Missing or
      // unparseable REFUSES the bake (lookDesign.mjs): it used to become {}, and every
      // consumer quietly baked its default. A plan (GET) refuses the same way.
      const bakeDesign = readBakeDesign(id, bakeScene, 'bake')
      const bakeLayerVis = bakeDesign.layerVis || {}
      const layerOn = (layerId) => bakeLayerVis[layerId] !== false

      // pipeline.js + promote-ribbons.js run for EVERY town poured from OSM —
      // skeleton.json is a pipeline input, so a re-skeleton reaches Survey
      // through this Bake. (Until 2026-09-23 this ran on LS only, and Huron's
      // A19 roads sat in skeleton.json and never reached the ribbons.) A town
      // with no raw/osm.json has nothing to derive.
      // ▶ node checks/claims-ribbons-are-not-older-than-the-skeleton.mjs
      const hasOsm = existsSync(join(bakePaths.raw, 'osm.json'))
      // ⚠️ OWED, not settled: a poured town runs the pipeline exactly as the Pour
      // does (`--skip-elevation`); only LS reads its elevation cache here. Without
      // the flag a town with no cache FETCHES from USGS — never inside a Bake.
      // Whether poured towns should carry pipeline elevation is its own decision.
      // ⭐ the pour's three steps, declared ONCE (pourSteps.mjs): the Bake, Extent's re-apply and its first pour all run and record these
      // ⛔ the town's elevation is ONE value across its Looks, or the Bake refuses by name (pourSteps.mjs#townPourElevation); a plan lists it
      let townElevation
      try { townElevation = townPourElevation(bakeScene, idx.looks.filter(l => l.scene === bakeScene).map(l => l.id), (lid) => readBakeDesign(lid, bakeScene, 'bake')) }
      catch (e) { if (!P.plan) throw e; P.plan.stale.push({ step: 'pipeline', blocker: true, why: [e.message] }); townElevation = false }
      const POUR = Object.fromEntries(pourSteps(bakeScene, bakePaths, RIBBONS, { elevation: townElevation }).map(st => [st.label, st]))
      // ⛔ THE POUR'S GUARDS RUN ON EVERY BAKE RUN (pourSteps.mjs#pourGuardRefusals; Boz's ruling 2026-11-01), not only when a step
      // re-runs: the authoring they read is in no key. Not on the plan, which only lists.
      if (!P.plan) { const g = pourGuardRefusals(bakeScene); if (g.length) throw new Error(`[bake] ⛔ ${bakeScene}'s authoring is refused before anything runs: ${g.join(' ‖ ')}`) }
      if (hasOsm) {
        // ⭐ THE SKELETON BEFORE EVERYTHING (BRIEF-the-bake-re-skeletons-a-stale-town, 2026-10-28): a committed town's skeleton is
        // re-made when what it is made of changed (its code, the street-class vocabulary included, or raw OSM / the survey), never
        // on `force` (Extent's Bake forces every step, and its re-apply must not re-skeleton) and never unasked: it renumbers the
        // network, so it stops at the re-pour question, naming the skeleton, and a GET plan lists it ahead of the pour. Its run
        // refuses by name before a new skeleton re-keys the operator's authoring (reskeleton.mjs).
        // not-inputs: overlay.json (the guard: passes or throws, shapes no output) · design.json (the guard, the same) · index.json (the guard reads which Looks are the town's)
        // not-inputs: geography.json (config.js loads it at import; the skeleton reads only the scene's dirs, no projection) · ribbons.json (scene.js names it; never opened here)
        POUR.skeleton = skeletonStep(bakeScene, bakePaths)
        const skel = await runIfDirty('skeleton', POUR.skeleton.inputs, POUR.skeleton.outputs, POUR.skeleton.cmd, { cwd: here, timeout: POUR.skeleton.timeout, force: false, asks: true })
        if (skel?.ask) {
          res.writeHead(428, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ lookId: id, repour: { scene: bakeScene, files: skel.ask.map(w => `the skeleton (re-made first, then the pour) → ${w}`) } }))
          return
        }
        // ⭐ THE COAST BEFORE THE POUR (BRIEF-the-shore-is-one-line step 1; Boz, 2026-10-25). bake-coast traces where the
        // lidar meets high water and writes clean/coast.json, which the mint reads as data (pour-code.mjs#pourDataReads),
        // so a coast that moved re-pours through the confirm below and one that did not re-pours nothing. Its own step,
        // judged by content: the lidar is read over the network, and an authoring re-pour must not read it again.
        // ⭐ A STOP ON THE COAST'S OPEN/CLOSE RESIDUAL IS A QUESTION (Boz's GO, 2026-10-29): the step left its pieces (coastResidualAsk), so
        // the Bake answers 428 with them, as the re-pour asks; Stage's card lists each, frames it, and accepts them in one press (the
        // accept route below). Any other failure of the step is a failure
        try { await runIfDirty('coast', POUR.coast.inputs, POUR.coast.outputs, POUR.coast.cmd, { cwd: here, timeout: POUR.coast.timeout }) } catch (e) {
          const ask = P.cancel ? null : coastResidualAsk(bakeScene)
          if (!ask) throw e
          res.writeHead(428, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ lookId: id, coastResidual: ask }))
          return
        }
        // ⛔⛔ A CODE CHANGE RE-POURS THE TOWN — SAY SO BEFORE DOING IT (Boz's ruling (d), 2026-09-24). The pour's code
        // inputs are its import closure, so a change to the ① mint, the coastline or the section builder makes every
        // poured town's next Bake a RE-POUR. That is correct, and it is also how a town gets poured by accident (LS,
        // whose H-3 pour is held). So a Bake that would re-pour because CODE changed stops and names the files, and
        // runs only when the request carries `repour=1` (BakeModal's confirm). An authoring edit (overlay, skeleton,
        // measurements) still re-pours without asking — that is the ordinary edit-bake-see loop. A town with no
        // map.json yet is a first pour, not a re-pour.
        // ⭐ ALL BY CONTENT, never mtime — the code the last pour ran (`map.json.codeRead`, a hash per file), the
        // geography it projected with (`geographyRead`) and the registry entries it read (`registryRead`), each
        // compared with now. A checkout or rebase that rewrites mtimes changes none of them, so it asks nothing.
        // ⛔ No record (a map.json poured before it existed, or unreadable) is DIRTY, never clean by default.
        // ⛔ A STALE JUDGE REFUSES (pour-code.mjs#judgeStale): this server judges with the code it loaded at start. If the repo's
        // judge has changed since, every answer below is the old judge's, so the Bake stops and says to restart.
        const staleJudges = judgeStale()
        if (staleJudges.length) {
          res.writeHead(503, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ lookId: id, error: `this server is judging with old code: ${staleJudges.join(', ')} changed since it started. Restart cartograph/serve.js, then Bake.` }))
          return
        }
        let lastPour
        if (existsSync(MAP_JSON)) { try { lastPour = JSON.parse(readFileSync(MAP_JSON, 'utf-8')) } catch { lastPour = {} } }
        const regChanged = lastPour ? (() => {
          let reg
          try { reg = JSON.parse(readFileSync(join(REPO_ROOT, 'references', 'registry.json'), 'utf-8')) } catch { return ['(references/registry.json unreadable)'] }
          return registryReadChanged(lastPour.registryRead, reg)
        })() : []
        const geoChanged = lastPour ? geographyReadChanged(lastPour.geographyRead, bakeScene) : null
        const codeChanged = lastPour ? pourCodeChanged(lastPour.codeRead, PIPELINE_SRC) : []
        // ⭐ the pour's other DATA reads (`pourDataReads`, stamped as map.json.dataRead) — the operator was never told
        // these drive the pour, so a re-pour they cause asks first, naming them (Boz's ruling Q1, 2026-09-26)
        const dataChanged = lastPour ? contentChanged(lastPour.dataRead, pourDataReads(bakeScene), 'the pour') : []
        // ⭐ what the pour was GIVEN that shapes it (map.json.argvRead, pour-code.mjs#pourArgvReads): the same question
        const argvChanged = lastPour ? contentChanged(lastPour.argvRead, pourArgvReads({ elevation: townElevation }), 'the pour') : []
        const codeNewer = [...codeChanged,
                           ...dataChanged.map(p => `${p} — the pour reads it`),
                           ...argvChanged.map(p => `${p} — the pour is given it`),
                           ...(geoChanged ? [`geography → ${geoChanged}`] : []),
                           ...regChanged.map(i => `references/registry.json → ${i}`)]
        // ⛔ LS is HELD (no LS re-pour, and nothing rewrites its committed runtime files unasked — Boz's ruling Q3).
        // promote-ribbons writes LS's src/data/ribbons.json; with no record of what it last read it would run, so ask.
        const lsAsks = bakeDesign.pour?.held && !bakeReads[`${id}:promote-ribbons`]
          ? [`${relative(REPO_ROOT, RIBBONS)} → promote-ribbons has no record yet, so this Bake would re-promote ${bakeScene}'s committed ribbons (its pour is held: ${bakeDesign.pour.held})`] : []
        // a plan cannot know whether the re-made skeleton differs, so a stale skeleton lists the pour after it
        const afterSkel = skel?.stale ? [`${relative(REPO_ROOT, POUR.skeleton.outputs[0])} → re-made by the skeleton step first; the pour re-runs if it changed`] : []
        if (P.plan && (codeNewer.length || lsAsks.length || afterSkel.length)) P.plan.stale.push({ step: 'pipeline', repour: true, why: [...codeNewer, ...lsAsks, ...afterSkel] })
        else if ((codeNewer.length || lsAsks.length) && !repourConfirmed) {
          res.writeHead(428, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ lookId: id, repour: { scene: bakeScene, files: [...codeNewer, ...lsAsks] } }))
          return
        }
        // a code, geography or registry change leaves the authoring inputs' mtimes alone, so it re-pours explicitly;
        // otherwise the pour re-runs only when an AUTHORING input (overlay, skeleton, measurements …) is newer
        if (codeNewer.length) { await runStep(P, 'pipeline', POUR.pipeline.cmd, { cwd: here, timeout: POUR.pipeline.timeout }); ran('pipeline') }
        else await runIfDirty('pipeline', POUR.pipeline.inputs, POUR.pipeline.outputs, POUR.pipeline.cmd, { cwd: here, timeout: POUR.pipeline.timeout, judge: 'mtime' })
        await runIfDirty('promote-ribbons', POUR['promote-ribbons'].inputs, POUR['promote-ribbons'].outputs, POUR['promote-ribbons'].cmd, { cwd: here, timeout: POUR['promote-ribbons'].timeout })   // the Bake is the decision; the diff streams into this step's output
      } else {
        skip(`pipeline + promote-ribbons (${bakeScene} has no raw/osm.json to derive from)`)
      }
      // terrain — the installation's own heightfield (clean/terrain.*), lifted
      // at runtime. Bake from the scene's elevation.tif when present + stale, so
      // bake-ground's adaptive refine (next) samples the right relief; then copy
      // it into this Look's slab so the runtime fetches terrain by lookId, like
      // ground.bin. A scene with no elevation.tif has no terrain → renders flat.
      const ELEVATION_TIF      = join(bakePaths.raw,   'elevation.tif')
      const SCENE_TERRAIN_JSON = join(bakePaths.clean, 'terrain.json')
      const SCENE_TERRAIN_BIN  = join(bakePaths.clean, 'terrain.bin')
      // ⛔⛔ ASK THE ROW, NOT THE FILENAME. This used to be `existsSync(ELEVATION_TIF)`, so a
      // town whose DEM is a URL LIST (`raw/elevation-sources.txt`, what fetch-dem.mjs writes
      // and what bake-terrain range-reads) was skipped as flat — while the intake panel showed
      // the very same row FILLED. Three readers, two answers, and the operator saw a poured
      // town rather than a missing input. `hasElevationInput` is now the single answer.
      const ELEVATION_LIST = join(bakePaths.raw, 'elevation-sources.txt')
      // ⛔ `mapDataPaths` exposes raw/ and clean/, not the scene dir — so derive it once,
      // explicitly, rather than through a `?? fallback` that reads as a safety net while
      // actually being the only path taken.
      const SCENE_DIR = join(bakePaths.raw, '..')
      // ⛔⛔ AND NOW THE POUR ACTUALLY ENFORCES IT. The elevation row has declared
      // `ABSENT.FALSE_MAP` (then called REFUSES) since 2026-09-23, and until this line
      // NOTHING read it: the comment below used to say "Until the pour enforces that, say so
      // loudly here" beside a `skip(...)` that let the bake carry on. A policy in a data
      // table that no code consults is a note, not a policy — and Provincetown baked flat
      // with one line in a skipped array, which is the exact failure the constant was
      // invented to prevent.
      // ⭐ `pourPolicyFor` is the single decider and it honours the kit's OWN third state:
      // a town that has recorded `verifiedAbsent` pours flat deliberately — searched,
      // nothing exists, a decision with a date — while a town nobody has looked at STOPS.
      const elevPolicy = pourPolicyFor('elevation', bakeScene)
      if (!elevPolicy.allow) {
        // ⛔ A FAILED STEP, not a skip. The operator sees which step stopped the bake and
        // exactly what to run; a skipped line is what hid this for two days.
        const why = `step "terrain" refuses: ${elevPolicy.why}`
        markStep(P, 'terrain', 'failed', { t1: Date.now(), error: why })
        throw new Error(`${why}\n   ▶ ${elevPolicy.fix || 'acquire the input for this town'}\n   ⭐ Or, if this town genuinely has no lidar, record it: fetch-dem writes verified-absent when it finds no coverage, and the pour then proceeds on that record.`)
      }
      if (elevPolicy.onTheRecord) skip(`terrain — ${elevPolicy.onTheRecord}`)
      if (hasElevationInput(SCENE_DIR)) {
        // ⛔⛔ THE WATER IS AN INPUT TO THE TERRAIN, AND IT USED NOT TO BE — which cost
        // Provincetown its datum. `bake-terrain` does not merely resample a DEM: it DERIVES
        // THE DATUM, asking `coastRings` where the water is and taking the sea as y = 0 when
        // there is a coast (`datumKind = wd ? 'water' : 'local minimum'`). So the heightfield
        // depends on the SHORELINE as much as on the raster.
        // ⭐ MEASURED 2026-09-24: Provincetown's terrain baked at 17:48, hours before its
        // coast closed, and fell to `datum: "local minimum"` with baseElev −2.13 — y = 0 the
        // lowest hole in the envelope rather than the sea. The coast then closed and the
        // slab gained 122 km of shoreline, but NOTHING in this input list had changed, so
        // the terrain was clean and never re-baked. Every height-above-water in that town
        // was measured from the wrong zero, and the only reason anyone noticed is that
        // bake-revetment now refuses a slab whose terrain disagrees with it.
        // ⛔ AND THE INPUT IS THE CODE, NOT JUST THE DATA. raw/osm.json did NOT change that
        // day — `coastline.mjs` did (fb750ec8, the closed-ring arc). A town's shore can move
        // because the kit learned to read a shape it could not read before, and that is
        // exactly the case a data-only list misses.
        // ⭐ So the step declares its SCRIPT and runIfDirty hashes that script's whole import closure
        // (coastline.mjs included, and anything it grows later) — never a hand list.
        await runIfDirty('terrain',
          [ELEVATION_TIF, ELEVATION_LIST, join(bakePaths.raw, 'elevation'),   // ⚠️ a URL list's TILES are read over the network: not tracked
           join(bakePaths.raw, 'bathymetry-sources.txt'),   // the real floor under the water (fetch-bathymetry.mjs); same caveat
           join(bakePaths.raw, 'water-datums.json'),        // where the water stands: tide datums or the lake's levels (fetch-water-datums.mjs)
           join(bakePaths.raw, 'elevation-flights.json'),   // the lidar's geoid, onto the record's basis (fetch-lidar-flights.mjs)
           bakePaths.boundary, bakePaths.geography,
           join(bakePaths.raw, 'osm.json'),
           join(bakePaths.clean, COAST_FILE),                // the datum: coast.json `flattened` (ruling B), found before any line
           MAP_JSON,                                          // the water: ①'s frozen face (coastFile.mjs#waterFace)
           // the coast bed reads design.water from every Look of this town and three registry findings — declared as
           // the VALUES read, so a slider or a research edit elsewhere in those files re-bakes nothing (Strand, 3ab2b794)
           { value: 'terrainValueReads', read: () => terrainValueReads(bakeScene) },
           join(here, 'bake-terrain.js')],
          [SCENE_TERRAIN_JSON, SCENE_TERRAIN_BIN],
          `node bake-terrain.js ${sceneFlag}`,
          { cwd: here, timeout: 300000 })
      }
      // ⭐ No `else` any more: the only way to reach here without an input is
      // `elevPolicy.onTheRecord`, which was already reported above. An unrecorded absence
      // threw before the branch.

      // terrain-slab: the scene terrain is owed to this Look's slab (the runtime fetches /baked/<look>/terrain.* by lookId)
      // when its BYTES differ from the slab's copy. ⛔ It is NOT written here: it is published in the same commit as the
      // ground (slabStage.mjs), so a ground that refuses leaves the slab's terrain and ground as they were, never a new
      // terrain over an old ground (Huron, twice, 2026-10-27). A ground the Bake skips was baked on this terrain, so the
      // terrain is then published alone, below.
      // ▶ node checks/claims-a-failed-bake-leaves-the-slab.mjs
      const terrainOwed = existsSync(SCENE_TERRAIN_JSON) && existsSync(SCENE_TERRAIN_BIN)
        ? [['terrain.json', readFileSync(SCENE_TERRAIN_JSON)], ['terrain.bin', readFileSync(SCENE_TERRAIN_BIN)]]
          .filter(([name, bytes]) => !(existsSync(join(LOOK_DIR, name)) && readFileSync(join(LOOK_DIR, name)).equals(bytes)))
        : []
      if (P.plan && terrainOwed.length) P.plan.stale.push({ step: 'terrain-slab', why: ["the town's terrain differs from this Look's copy"] })
      else if (terrainOwed.length) markStep(P, 'terrain-slab', 'waiting', { why: 'published with the ground, once it succeeds' })
      else skip('terrain-slab')
      const terrainPublished = (names) => { if (names.some(n => n.startsWith('terrain.'))) { markStep(P, 'terrain-slab', 'done'); ranSteps.push('terrain-slab') } }
      // the ground's stage: it reads its prior ground.json (the lightmap it carries) from its out dir
      const groundStage = { lookDir: LOOK_DIR, look: id, seed: ['ground.json'], publish: ['ground.json', 'ground.bin', 'shape.json'], carry: terrainOwed }
      // not-inputs: index.json (guard: assertBakeTarget passes or throws; shapes no output) · shape.json (its own output, written beside ground.json)
      await runIfDirty('ground',
        [MAP_JSON, DESIGN, SCENE_DESIGN, RIBBONS, bakePaths.boundary, join(bakePaths.raw, 'survey.json'),
         join(bakePaths.clean, 'park-polygon.json'), join(REPO_ROOT, 'src', 'data', bakeScene, 'park_water.json'),
         join(here, 'bake-ground.js'), SCENE_TERRAIN_JSON, SCENE_TERRAIN_BIN],
        [join(LOOK_DIR, 'ground.json'), join(LOOK_DIR, 'ground.bin')],
        `node bake-ground.js --look=${id} ${sceneFlag}`,
        { cwd: here, timeout: 300000, stage: groundStage })
      if (groundStage.published) terrainPublished(groundStage.published)
      else if (terrainOwed.length && !P.plan) terrainPublished(publishSlab({ lookDir: LOOK_DIR, look: id, files: terrainOwed }))
      // Shore revetment — reads the shoreline (`__water__` runs) out of the
      // shape.json the ground bake just wrote, so a pour that moves the shore
      // re-stones it; a stale revetment is stone keyed to a shore that moved.
      // A town whose terrain datum is not water exits "nothing to build".
      if (hasOsm) {
        await runIfDirty('revetment',
          // ⭐ MAP_JSON: the drawn water decides where the shore is (2026-09-26).
          [join(LOOK_DIR, 'shape.json'), join(bakePaths.raw, 'osm.json'), MAP_JSON, bakePaths.boundary, SCENE_TERRAIN_JSON, SCENE_TERRAIN_BIN,
           join(here, '..', 'references', 'registry.json'),   // the toe berm's size (bake-revetment.js#toeBerm, f-cem-toe-berm-size)
           join(here, 'bake-revetment.js')],
          [join(LOOK_DIR, 'revetment.json')],
          `node bake-revetment.js --look=${id} ${sceneFlag}`,
          // a town with no shore gets no revetment.json, and the runtime reads that 404 as "none" (SlabRevetment.jsx)
          { cwd: here, timeout: 120000, absentOk: [join(LOOK_DIR, 'revetment.json')] })
      }
      // Context channel: metres from every terrain texel to the nearest shoreline run
      // (BRIEF-surface-lab §3). Always writes context.json — a coastless town gets a named
      // absence — so it is never dirty forever.
      // not-inputs: context.coastDist.bin (its own output, written only) · outer-coast.json (its own output, written only)
      // not-inputs: ground.json (read by VALUE, pourSteps.mjs#groundForReaders: without the maps bake-ground-ao writes back, or its timings; this audit reports that UNKNOWN)
      await runIfDirty('coast-distance',
        // The registry, the surfaces table and the town's OSM (its state) feed the RESOLVED params.
        [join(LOOK_DIR, 'shape.json'), SCENE_TERRAIN_JSON, SCENE_TERRAIN_BIN, MAP_JSON, join(here, 'bake-coast-distance.js'),
          join(here, 'surfaces.mjs'), join(here, '..', 'references', 'registry.json'), join(bakePaths.raw, 'osm.json'),
          // the water past the rim (bake-coast-distance.js#bakeOuterCoast): the stencil's centre and radius, and the frame
          groundForReaders(LOOK_DIR), bakePaths.geography],
        [join(LOOK_DIR, 'context.json')],
        `node bake-coast-distance.js --look=${id} ${sceneFlag}`,
        { cwd: here })
      if (layerOn('building')) {
        // not-inputs: index.json (guard: assertBakeTarget passes or throws; shapes no output)
        // not-inputs: ground.json (read by VALUE, pourSteps.mjs#groundForReaders: without the maps bake-ground-ao writes back, or its timings; this audit reports that UNKNOWN)
        await runIfDirty('buildings',
          [MAP_JSON, DESIGN, SCENE_DESIGN, SCENE_TERRAIN_JSON, SCENE_TERRAIN_BIN,   // ⭐ the terrain: Huron's buildings at y=0
           join(SCENE_DIR, 'buildings.json'), bakePaths.boundary, join(SCENE_DIR, 'building-overrides.json'),
           join(bakePaths.raw, 'osm.json'),   // the addresses: OSM twins' addr:* and address points (building-address.mjs)
           // …and the town's declared E-911 address points, with its parcels as their join (address-points.mjs)
           ...declaredAddressPointPaths(bakeScene), ...declaredParcelPaths(bakeScene), sourcesPath(bakeScene),
           join(here, 'bake-buildings.js'), join(here, 'building-address.mjs'), join(here, 'address-points.mjs'),
           groundForReaders(LOOK_DIR), join(LOOK_DIR, 'ground.bin'),   // each building's groundY is sampled off the drawn ground (a raised kerb)
           join(SCENE_DIR, 'clean', 'skeleton.json')],   // the named streets each building fronts, for its neon faces (bake-buildings.js)
          [join(LOOK_DIR, 'buildings.json'), join(LOOK_DIR, 'buildings.bin')],
          `node bake-buildings.js --look=${id} ${sceneFlag}`,
          { cwd: here, timeout: 300000 })
      } else {
        skip('buildings (layer hidden)')
      }
      // Landscape backdrop — the §10 THIRD hero kind: a brought DEM mesh (the
      // mountain range) baked into the look's slab as a native-PBR GLB + a
      // manifest (geo-anchored placement defaults). Only when the scene carries
      // terrain/sangabriel.obj. Unbaked = unshipped. (The renderer is piece 3 —
      // src/components — a separate lane; this only produces the asset + knobs.)
      // The landscape backdrop (the mountain MODEL) is a STAGE INTAKE — a 3D asset
      // the operator uploads deliberately per-Look — NOT Cartograph pour data. It must
      // NEVER be auto-detected from the scene's data dir: a stray terrain/sangabriel.obj
      // sitting in data/<scene>/ silently baked the San Gabriel mountains into Altadena's
      // slab (2026-07-14, "oops I accidentally loaded the mountains"). Assets now live
      // OUT of the pour path, in cartograph/_landscape-intake/<scene>/. Baking is gated on
      // an EXPLICIT Look opt-in (design.landscape.source → an intake asset), never file
      // presence. Until the Stage upload flow sets that, the pour emits no landscape.
      const landscapeSource = bakeDesign?.landscape?.source
      if (landscapeSource) {
        const LANDSCAPE_OBJ = join(REPO_ROOT, landscapeSource)
        if (existsSync(LANDSCAPE_OBJ)) {
          // not-inputs: sangabriel.obj (the script's default name; the Bake always passes --source) · index.json (guard: assertBakeTarget passes or throws; shapes no output)
          await runIfDirty('landscape',
            [LANDSCAPE_OBJ, join(dirname(LANDSCAPE_OBJ), 'meta.json'), join(dirname(LANDSCAPE_OBJ), 'heights.f32'),
             bakePaths.geography, join(here, 'bake-landscape.js')],
            [join(LOOK_DIR, 'landscape', 'landscape.json'), join(LOOK_DIR, 'landscape', 'sangabriel.glb')],
            `node bake-landscape.js --look=${id} --source=${landscapeSource} ${sceneFlag}`,
            { cwd: here, timeout: 180000 })
        } else {
          skip(`landscape (design.landscape.source missing on disk: ${landscapeSource})`)
        }
      } else {
        skip('landscape (Stage-intake only — never auto-detected from pour data)')
      }
      // content — the content-join (bake-content.js): spatially joins the raw
      // sources (OSM POIs · assessor parcels · NR survey) onto the just-baked
      // building set → content/{roster,listings}.json, so content MEMBERSHIP ==
      // slab membership by construction (0 orphans). Runs AFTER buildings (needs
      // the baked id set). A town that declares its listings hand-curated (meta.baseSource, LS) gets its roster
      // only: bake-content reads its listings.json and never writes it. Hand-authoring survives via the committed
      // override sidecars (listings.overrides.json).
      {
        const SCENE_BAKED_BUILDINGS = join(REPO_ROOT, 'public', 'baked', bakeScene, 'buildings.json')
        const CONTENT_DIR = join(bakePaths.raw, '..', 'content')
        // not-inputs: listing-identity.json (its own output: the id registry it maintains)
        await runIfDirty('content',
          [SCENE_BAKED_BUILDINGS, MAP_JSON,
           join(bakePaths.raw, 'osm.json'), ...declaredParcelPaths(bakeScene), sourcesPath(bakeScene),
           join(CONTENT_DIR, 'nr-inventory.json'), join(CONTENT_DIR, 'county-land-use-codes.csv'),
           join(CONTENT_DIR, 'listings.overrides.json'), join(CONTENT_DIR, 'roster.overrides.json'),
           join(CONTENT_DIR, 'events.json'), join(bakePaths.raw, 'overture-places.json'), bakePaths.geography,
           join(here, 'bake-content.js')],
          [join(CONTENT_DIR, 'roster.json'), join(CONTENT_DIR, 'listings.json')],
          `node bake-content.js ${sceneFlag}`,
          { cwd: here, timeout: 180000 })
      }
      if (layerOn('lamp')) {
        // lamps = surveyed (raw/osm.json pois + osm_street_lamps.json) ∪ derived (clean/derived_lamps.json) ∪ authored;
        // each stamped osm|derived|authored — ROADMAP H-17. The derived set is its own step, after the ground (it reads
        // shape.json) and the pour (skeleton.json); it THROWS when a town has lamp-eligible streets and none gets one.
        await runIfDirty('derived-lamps',
          [join(REPO_ROOT, 'public', 'baked', bakeScene, 'shape.json'), bakePaths.skeleton, MAP_JSON, SCENE_DESIGN,
           join(bakePaths.raw, 'osm.json'), join(bakePaths.raw, 'osm_street_lamps.json'), join(here, 'lamp-spacing-prior.json'),
           bakePaths.geography, join(SCENE_DIR, 'lu-policy.json'),   // traced 2026-09-27
           join(here, 'derive-lamps.mjs')],
          [join(bakePaths.clean, 'derived_lamps.json')],
          `node derive-lamps.mjs ${sceneFlag}`,
          { cwd: here })
        // not-inputs: index.json (guard: assertBakeTarget passes or throws; shapes no output)
        // not-inputs: ground.json (read by VALUE, pourSteps.mjs#groundForReaders: without the maps bake-ground-ao writes back, or its timings; this audit reports that UNKNOWN)
        await runIfDirty('lamps',
          // traced today (2026-09-26) ∪ Wick's H-17 list (surveyed POIs, derived lamps, the zone tester) — declared ahead
          // of Wick's bake-lamps change so the step already re-runs when those land
          [join(bakePaths.raw, 'osm.json'), join(bakePaths.raw, 'osm_street_lamps.json'), join(bakePaths.clean, 'derived_lamps.json'),
           join(SCENE_DIR, 'authored_lamps.json'), bakePaths.geography, bakePaths.boundary,
           groundForReaders(LOOK_DIR), join(LOOK_DIR, 'ground.bin'), join(LOOK_DIR, 'shape.json'), MAP_JSON, DESIGN,
           SCENE_TERRAIN_JSON, SCENE_TERRAIN_BIN, SCENE_DESIGN, join(SCENE_DIR, 'lu-policy.json'), join(here, 'lamp-spacing-prior.json'),
           join(here, 'bake-lamps.js')],
          [join(LOOK_DIR, 'lamps.json')],
          `node bake-lamps.js --look=${id} ${sceneFlag}`,
          { cwd: here, timeout: 30000 })
      } else {
        skip('lamps (layer hidden)')
      }
      await runIfDirty('scene',
        [DESIGN, join(here, 'bake-scene.js')],
        [join(LOOK_DIR, 'scene.json')],
        `node bake-scene.js --look=${id} ${sceneFlag}`,
        { cwd: here, timeout: 30000 })
      // Sources — this town's ATTRIBUTION, read off which inputs are actually on
      // its disk (`bake-sources.js`). The public app is static: `/api/cartograph`
      // is a Vite dev proxy and does not exist in production, so a visitor-facing
      // credit can only reach them through the slab.
      //
      // ⛔ NOT under runIfDirty. Its inputs are ~20 scene files plus the row
      // definitions; a dirty-graph that listed them incompletely would SKIP the
      // step exactly when an input had just been acquired, and ship the previous
      // town-state's credit. It reads file stats and costs milliseconds — always
      // running it is both cheaper and honest. It prints what is still owed.
      await runStep(P, 'sources', `node bake-sources.js --look=${id} ${sceneFlag}`, { cwd: here })
      ran('sources')
      // Street labels — bake the SCENE's own names (from its ribbons + boundary)
      // into the slab so the player reads baked/<look>/labels.json per-scene,
      // not a static LS ribbons import (src/lib/streetLabels.js reader).
      await runIfDirty('labels',
        [RIBBONS, bakePaths.boundary, DESIGN, join(here, 'bake-labels.js')],
        [join(LOOK_DIR, 'labels.json')],
        `node bake-labels.js ${sceneFlag} --look=${id}`,
        { cwd: here, timeout: 30000 })
      // Trees: TWO axes. The census is the SCENE's (this neighbourhood's real
      // trees); the atlas + UV-rewritten GLBs are the LOOK's (baked by the
      // Arborist's bake-look). Only the census side is resolved here, and it
      // goes through the shared helper so this pour and the Grove's
      // ship-to-slab bake the same neighbourhood from the same inputs to the
      // same path — one answer, not two that drift
      // (`cartograph/tree-bake-inputs.mjs`). No census on disk → honest zero.
      if (layerOn('tree')) {
        const treeInputs = treeBakeInputsForMap(bakeScene)
        if (!treeInputs) {
          skip(`trees (no census on disk for scene '${bakeScene}' — honest zero)`)
        } else {
          const flags = [
            // ⛔ `--scene=`, NOT `--scene `. cartograph/scene.js parses the EQUALS form only.
            // ⭐ The space form does not error — it goes UNPARSED and falls through to
            // DEFAULT_MAP, 'lafayette-square'. So this line worked on exactly one town,
            // by accident, and every other town hit requireExplicitMap()'s refusal:
            // huron's Publish-to-Staging died code=2 here, 2026-09-21. The guard is why
            // that was loud instead of huron's census overwriting LS's.
            // ▶ node checks/claims-scene-flag-is-the-equals-form.mjs
            `--scene=${treeInputs.scene}`,
            treeInputs.placements && `--placements ${treeInputs.placements.join(',')}`,
            treeInputs.speciesMapPath && `--species-map ${treeInputs.speciesMapPath}`,
            treeInputs.forbiddenMapPath && `--forbidden-map ${treeInputs.forbiddenMapPath}`,
            // The FROZEN-curb mask + hood dissolve. Without these the one-button
            // pour silently under-bakes on the legacy paint-layer mask (which
            // can't see the road) — the Salon path forwards them via the spread,
            // this hand-built flag string used to drop them. (HANDOFF Move 3.)
            treeInputs.zoneShapePath && `--zone-shape ${treeInputs.zoneShapePath}`,
            treeInputs.boundaryPath && `--boundary ${treeInputs.boundaryPath}`,
            `--output ${treeInputs.output}`,
          ].filter(Boolean).join(' ')
          // not-inputs: derived_trees.json (a name in bake-trees.js#CANONICAL_TREE_WELLS, the wells a census row may cite; the wells it opens arrive in treeInputs.inputs) · scene.json (declared above as a VALUE, without bakedAt, which this audit reports UNKNOWN) · trees.json (its own output, `--output`)
          await runIfDirty('trees',
            // the traced reads (2026-09-26): the census inputs, the tree LIBRARY as one set, and the town's baked
            // lamps / atlas / scene (hero keyframes) — keyed by SCENE, as bake-trees opens them (Class D row 10)
            [...treeInputs.inputs, ...treeLibraryFiles(), SCENE_DESIGN, bakePaths.geography,
             join(REPO_ROOT, 'public', 'baked', bakeScene, 'lamps.json'), join(REPO_ROOT, 'public', 'baked', bakeScene, 'trees-atlas.json'),
             // ⛔ scene.json by VALUE, without `bakedAt` (pourSteps.mjs#sceneForReaders): the bake re-stamps it at its very end
             sceneForReaders(join(REPO_ROOT, 'public', 'baked', bakeScene)),
             join(SCENE_DIR, 'lu-policy.json'), join(bakePaths.raw, 'osm.json'),
             join(REPO_ROOT, 'arborist', 'bake-trees.js')],
            [join(REPO_ROOT, treeInputs.output)],
            `node arborist/bake-trees.js ${flags}`,
            { cwd: REPO_ROOT, timeout: 90000,
              requires: [{ path: join(REPO_ROOT, 'public', 'baked', bakeScene, 'trees-atlas.json'), why: 'the grove is not baked for this Look: bake it in the Arborist' }] })
        }
      } else {
        skip('trees (layer hidden)')
      }
      // ⛔⛔ TREE ANCHORS — AND THE ORDER IS THE WHOLE POINT (wired 2026-08-28; ORDER FIXED 2026-09-08).
      // Anchors are index-parallel to `trees.json`, sampled off `ground.bin`, so this step
      // is downstream of BOTH — it must run after the tree bake, not after the ground bake.
      // ⛔ It used to sit immediately after `ground`, ~130 lines above the step that WRITES
      // `trees.json`, so every pour anchored the PREVIOUS census: a one-pour lag that
      // self-healed on the next pour and NEVER healed under `?force=1` (which rebuilds both
      // every time). Measured on LS 2026-09-08: 5,144 anchors against 5,099 placements.
      // ⭐ The consumer's gate is ALL-OR-NOTHING — one bad `placementKey` or count discards
      // EVERY anchor and the whole scene drops onto the smooth terrain field instead of the
      // drawn ground (`InstancedTrees.jsx:670-700`), announced by a console warning and
      // nothing else. So the lag was a plausible-looking map, which is the outcome Layer 0
      // q2 names as worse than a failure. (`ARCHITECTURE.md §"Ground conformance"` calls
      // this ordering load-bearing; that line now describes the code.)
      // ⚠️ Keep this BEFORE `ground-ao` — that step reads `trees.json` too, and the pour
      // stays in one topological order rather than two.
      // ⛔ Both flags are passed explicitly: bake-tree-anchors refuses without them (it once defaulted BOTH look and
      // scene to Lafayette Square, so an omitted flag wrote LS's trunk heights into another town's slab — the A00
      // class, fixed 2026-07-15).
      // not-inputs: index.json (guard: assertBakeTarget passes or throws; shapes no output)
      // not-inputs: ground.json (read by VALUE, pourSteps.mjs#groundForReaders: without the maps bake-ground-ao writes back, or its timings; this audit reports that UNKNOWN)
      await runIfDirty('tree-anchors',
        [groundForReaders(LOOK_DIR), join(LOOK_DIR, 'ground.bin'), join(LOOK_DIR, 'trees.json'),
         SCENE_TERRAIN_JSON, SCENE_TERRAIN_BIN, SCENE_DESIGN, bakePaths.geography,
         join(here, 'bake-tree-anchors.js')],
        [join(LOOK_DIR, 'tree-anchors.json')],
        `node bake-tree-anchors.js --look=${id} ${sceneFlag}`,
        { cwd: here, timeout: 300000 })
      // The far shore, baked (BRIEF-the-far-shore-is-not-built-at-load): the revetment's far layer and its overhead band,
      // built against the ground the player draws and classed by what the movie sees, so nothing is built at load.
      // After `scene` (the hero keys) and the ground (the drawn ground). A town with no revetment.json writes none.
      // not-inputs: ground.json (read by VALUE, pourSteps.mjs#groundForReaders: without the maps bake-ground-ao writes back, or its timings; this audit reports that UNKNOWN, as tree-anchors)
      // not-inputs: index.json (guard: assertBakeTarget passes or throws; shapes no output)
      // not-inputs: geography.json (scene.js resolves the scene's name; shapes no output)
      // not-inputs: ribbons.json (scene.js resolves the scene's name; shapes no output)
      // not-inputs: design.json (lookDesign.mjs, reached through scene.js; this step reads no authored value)
      // not-inputs: scene.json (read by VALUE, pourSteps.mjs#sceneForReaders: without the bakedAt stamp written below; this audit reports that UNKNOWN, as trees)
      await runIfDirty('revetment-far',
        [groundForReaders(LOOK_DIR), join(LOOK_DIR, 'ground.bin'), join(LOOK_DIR, 'terrain.json'), join(LOOK_DIR, 'terrain.bin'),
         join(LOOK_DIR, 'revetment.json'), sceneForReaders(LOOK_DIR), join(here, 'bake-revetment-far.js')],
        [join(LOOK_DIR, 'revetment-far.json'), join(LOOK_DIR, 'revetment-far.bin'), join(LOOK_DIR, 'revetment-far-unseen.bin')],
        `node bake-revetment-far.js --look=${id} ${sceneFlag}`,
        // ⚠️ ~2 min a coastal town (provincetown 107 s, huron 106 s, the nested lattice, 2026-10-29): it builds every NEAR chunk once for its exact
        // bounds (Boz's ruling (a)). No timeout is passed: runStep has no wall-clock kill; the step reports `[progress]`.
        { cwd: here, absentOk: [join(LOOK_DIR, 'revetment-far.json'), join(LOOK_DIR, 'revetment-far.bin'), join(LOOK_DIR, 'revetment-far-unseen.bin')] })
      // AO bake last — slowest, benefits from updated geometry.
      // ⚠️ lamps.json + trees.json ARE inputs here, not just neighbours in the
      // chain: bake-ground-ao reads both (`bake-ground-ao.js:276/289`) to burn the
      // lamp light-POOLS and the tree/lamp contact shadows into ground.poolmap /
      // ground.lightmap. They were missing from this dirty-list, so a lamps- or
      // trees-only change re-baked the point cloud and left the GROUND still lit
      // for the previous set — new lamps standing in the dark with no pool, and
      // pools glowing where a lamp no longer is. Caught 2026-07-23 re-baking LS
      // after the lamp-well union added 47 park lamps.
      // not-inputs: index.json (guard: assertBakeTarget passes or throws; shapes no output) · ground.poolmap.png (its own output) · ground.colormap.png (its own output) · ground.rulemap.png (its own output)
      await runIfDirty('ground-ao',
        [MAP_JSON, join(SCENE_DIR, 'buildings.json'), join(LOOK_DIR, 'ground.json'), join(LOOK_DIR, 'ground.bin'),
         join(LOOK_DIR, 'lamps.json'), join(LOOK_DIR, 'trees.json'), join(LOOK_DIR, 'trees-atlas.json'),
         join(here, 'bake-ground-ao.js')],
        // it also WRITES ground.json (its four maps, pourSteps.mjs#GROUND_AO_FIELDS): the steps above read that by value
        [join(LOOK_DIR, 'ground.lightmap.png'), join(LOOK_DIR, 'ground.json')],
        `node bake-ground-ao.js --look=${id} ${sceneFlag}`,
        { cwd: here, timeout: 300000,
          // the trees' contact shadows read the grove's atlas: required while the Look shows trees (a hidden layer reads none)
          requires: layerOn('tree') ? [{ path: join(LOOK_DIR, 'trees-atlas.json'), why: 'the grove is not baked for this Look: bake it in the Arborist' }] : [] })
      // the plan ends here: everything below stamps, indexes and ships a pour that ran
      if (P.plan) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, lookId: id, scene: bakeScene, stale: P.plan.stale,
          bakedAt: readLooksIndex().looks.find(l => l.id === id)?.bakedAt ?? null }))
        return
      }
      const ms = Date.now() - t0
      // ⛔ `scene.json#bakedAt` IS THE POUR'S STAMP — the slab's re-read key where an app passes none (the on-disk
      // `?bake=` of `src/lib/slabNames.js#slabPath`) and what the Publish panel compares to say "already published". It
      // is a property of THE POUR, not of the scene layer, so it is stamped here, unconditionally, with the SAME instant
      // the looks index gets. (Its old job, a `?t=` cache-bust seed for remote fetches, is retired: a published file is
      // named by its content — cartograph/_archive/slab-cache-bust-scheme-RETIRED-2026-09-28.md.)
      const stampedAt = Date.now()
      try {
        const scenePath = join(LOOK_DIR, 'scene.json')
        if (existsSync(scenePath)) {
          const sc = JSON.parse(readFileSync(scenePath, 'utf-8'))
          sc.bakedAt = stampedAt
          writeFileSync(scenePath, JSON.stringify(sc, null, 2))
        }
      } catch (e) {
        // ⛔ Loud: an unstamped key means every cold consumer serves a STALE slab from cache
        // and no reload dislodges it. Never swallow this.
        console.error(`[bake] ⛔ could not stamp scene.json#bakedAt for "${id}" — cold consumers ` +
          `(Preview, production) will keep serving the PREVIOUS slab from cache: ${e.message}`)
      }
      const idx2 = readLooksIndex()
      const entry = idx2.looks.find(l => l.id === id)
      if (entry) { entry.bakedAt = stampedAt; saveLooksIndex(idx2) }
      // ⭐ THE MANIFEST IS A BAKE STEP (Jacob, 2026-10-04): Stage authors, Bake freezes, Preview and the Ward read what is
      // frozen. It was hand-run, so the identity a player read was whenever someone last remembered. It runs AFTER the
      // bakedAt stamp, because it hashes scene.json. ⛔ A town with no instance module has no identity to freeze:
      // bake-manifest exits 2 and the bake fails, naming it. (Publish runs it again, so what it accepts from Preview — the
      // deployment — is what it ships: POST /looks/<id>/publish.)
      if (id !== bakeScene) throw new Error(`Look "${id}" is not its town's home Look ("${bakeScene}") — a manifest is one per town, and a second Look's slab has no manifest yet. Refusing to ship a slab without one.`)
      await runStep(P, 'manifest', `node bake-manifest.mjs --town=${id}`, { cwd: here })
      ran('manifest')
      // ⛔⛔ THE BAKE ENDS ON DISK (Jacob, 2026-10-04: "I don't think it makes sense to 'upload' at that step"). It used to
      // upload the slab to staging as its last step, so every bake reached staging and every Publish, which bakes first,
      // uploaded the same slab a second time. Publish is the upload now; it carries the move's comment and its loud failure.
      // ▶ node checks/claims-a-bake-never-uploads.mjs
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, ms, lookId: id, ran: ranSteps, skipped, force }))
    } catch (err) {
      // ⭐ the failing step NAMES itself (runStep), and an operator's Cancel is its own answer, not a 500
      res.writeHead(P.cancel ? 499 : 500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message, ...(P.cancel ? { cancelled: true, step: P.cancel.step } : {}) }))
    } finally {
      P.finishedAt = Date.now()
      if (!planning) _bakesInFlight.delete(id)
    }
    return
  }

  // GET /looks/<id>/bake/status — the running bake's steps (BakeModal polls this)
  // ⭐ THE OPERATOR SIGNS THE COAST'S RESIDUAL IN STAGE (Boz's GO, Zob's ruling, 2026-10-29). POST { identity }: the identity the card
  // showed (coastResidualAsk). It writes coast-tolerance.json FROM the pending record, unchanged (the judge has one home: the coast step),
  // only when that record still has this identity and is read with today's inputs; else it refuses ("the coast changed since you
  // looked"), so a second Bake rewriting the pieces between the card and the press is never signed. The signature is authoring: it is
  // committed here, path-limited, naming the town, the count and m², and that the operator signed it in Stage. The pending record goes.
  // ⛔ No bake-anyway: nothing else writes the tolerance but sign-coast-residual.mjs --accept
  if (req.method === 'POST' && (m = path.match(/^\/looks\/([^/]+)\/coast-residual\/accept$/))) {
    const id = m[1]
    let body = ''
    req.on('data', c => body += c)
    req.on('end', async () => {
      const send = (code, j) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(j)) }
      try {
        const scene = readLooksIndex().looks.find(l => l.id === id)?.scene
        if (!scene) return send(404, { error: `unknown look '${id}', or it has no town` })
        if (_bakesInFlight.has(id)) return send(409, { error: 'a bake is running for this look: accept when it has stopped' })
        const { identity } = JSON.parse(body || '{}'), ask = coastResidualAsk(scene)
        if (!ask || ask.identity !== identity) return send(409, { error: `the coast changed since you looked at these pieces, so they were not signed. Bake again to see the coast as it is now.` })
        const REPO_ROOT = join(import.meta.dirname, '..'), tol = tolerancePathOf(scene), rel = relative(REPO_ROOT, tol)
        const rec = JSON.parse(readFileSync(pendingPathOf(scene), 'utf-8'))
        writeFileSync(tol, JSON.stringify({ ...rec, signedAt: new Date().toISOString(), signedIn: 'Stage' }, null, 1) + '\n')
        rmSync(pendingPathOf(scene), { force: true })
        const say = ['water', 'decks'].map(k => `${k} ${rec[k].n} piece(s), ${rec[k].m2} m²`).join(' · ')
        const add = await runCapture(`git add -- ${rel}`, { cwd: REPO_ROOT })
        if (add.code !== 0) throw new Error(`the signature was written (${rel}) but git add failed: ${add.stderr || add.stdout}`)
        const msg = `${rel}: ${scene} signs its coast's open/close residual (${say}), signed in Stage by the operator. Reaches no register.`
        const commit = await runCapture(`git commit -m ${JSON.stringify(msg)} -- ${rel}`, { cwd: REPO_ROOT })
        if (commit.code !== 0) throw new Error(`the signature was written (${rel}) but git commit failed: ${commit.stderr || commit.stdout}`)
        const sha = (await runCapture(`git rev-parse --short HEAD`, { cwd: REPO_ROOT })).stdout.trim()
        send(200, { ok: true, scene, n: ask.n, m2: ask.m2, committed: sha })
      } catch (err) { send(500, { error: err.message }) }
    })
    return
  }
  if (req.method === 'GET' && (m = path.match(/^\/looks\/([^/]+)\/bake\/status$/))) {
    const P = _bakeProgress.get(m[1])
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(P ? { ...P, child: undefined, running: !P.finishedAt, now: Date.now() } : { running: false, steps: [] }))
    return
  }
  // POST /looks/<id>/bake/cancel — stop the running bake at its current step, and say which
  if (req.method === 'POST' && (m = path.match(/^\/looks\/([^/]+)\/bake\/cancel$/))) {
    const P = _bakeProgress.get(m[1])
    if (!P || P.finishedAt) { res.writeHead(409, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'no bake is running for this Look' })); return }
    P.cancel = { at: Date.now(), step: P.current }
    if (P.child) { try { P.child.kill('SIGTERM') } catch {} }
    console.log(`[bake] ⛔ cancelled by operator at step "${P.current ?? '(between steps)'}" — ${m[1]}`)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, step: P.current }))
    return
  }

  // GET /looks/<id>/publish/status — the Publish panel's state read. Fetches
  // the remote (never trust a stale local ref — OPERATIONS §Save→ship) and
  // reports: unbaked edits? dirty slab files? how far HEAD is ahead of staging
  // and prod. Pure read — no writes.
  if (req.method === 'GET' && (m = path.match(/^\/looks\/([^/]+)\/publish\/status$/))) {
    const id = m[1]
    const REPO_ROOT = join(import.meta.dirname, '..')
    try {
      await runCapture(`git fetch origin --quiet`, { cwd: REPO_ROOT, timeout: 30000 })
      const branch = (await runCapture(`git rev-parse --abbrev-ref HEAD`, { cwd: REPO_ROOT })).stdout.trim()
      const specs = slabPathspecs(id).join(' ')
      // ⛔ never trim the whole output: porcelain lines START with a status column (" M path"), and a leading trim
      // shifted the first line so slice(3) ate its path's first character — "ublic/looks/index.json" (Lintel)
      const dirty = (await runCapture(`git status --porcelain -- ${specs}`, { cwd: REPO_ROOT })).stdout
        .split('\n').filter(Boolean).map(l => l.slice(3))
      // "<behind>\t<ahead>" — commits in the ref but not HEAD, and vice-versa.
      const parse = (s) => { const [b, a] = s.trim().split(/\s+/).map(Number); return { behind: b || 0, ahead: a || 0 } }
      const vsStaging = parse((await runCapture(`git rev-list --left-right --count origin/${STAGING_BRANCH}...HEAD`, { cwd: REPO_ROOT })).stdout)
      let unbaked = false
      try {
        const dMs = statSync(join(REPO_ROOT, `public/looks/${id}/design.json`)).mtimeMs
        const sMs = statSync(join(REPO_ROOT, `public/baked/${id}/scene.json`)).mtimeMs
        unbaked = dMs > sMs
      } catch { /* missing files → leave false */ }
      // ⭐ THE OPERATOR'S QUESTION IS "IS THE SITE SHOWING MY WORK?", AND GIT CANNOT
      // ANSWER IT (Jacob, 2026-08-29: "the user shouldn't know about the git").
      // `bakedAt` can: the panel compares this local stamp against what each live
      // site actually serves (`/deployed`), which is a truer answer than any commit
      // count — it measures the ARTIFACT BEING SERVED, not the state of the repo, so
      // it stays right when a deploy fails, and it survives a page refresh because
      // it is read rather than remembered. The git fields above stay for the panel's
      // own gating; they are not for display.
      let bakedAt = null
      try { bakedAt = JSON.parse(readFileSync(join(REPO_ROOT, `public/baked/${id}/scene.json`), 'utf-8')).bakedAt ?? null } catch { /* leave null */ }

      // ⛔⛔ THE SLAB IS ONLY HALF THE ANSWER. `bakedAt` measures the MAP DATA; since the
      // Publish button also ships the shared player, a code-only change leaves `bakedAt`
      // untouched and the panel could not tell whether staging carried the operator's fix
      // (Jacob, 2026-09-21: "it's hard to tell"). This is the other half, read off the
      // published artifact rather than remembered here: the build marker records the
      // newest source mtime that build was made from (stagingPlayerState).
      const player = await stagingPlayerState(REPO_ROOT)
      // ⭐ AND THE DEPLOYMENT, which ships in the slab's manifest: a toggle edit makes the slab stale on staging even when
      // no bake is owed (the bake check reads none of it).
      const scene = readLooksIndex().looks.find(l => l.id === id)?.scene
      const [deployment, prodDeployment] = scene
        ? await Promise.all(['staging', 'prod'].map((env) => deploymentShipped(scene, id, env)))
        : [{ shipped: null }, { shipped: null }]

      // ⭐ PRODUCTION'S PLAYER, the same question one step on: is the build this town has PINNED
      // the one staging now serves? Read off both stamps in the bucket. ⛔ No git here: production
      // no longer ships through a branch, so a commit count cannot answer for it.
      const sites = await siteUrlsForLook(id)
      // ⭐ Which player is the town's staging record's; a Ward town is current when its host record
      // pins the Ward build staging serves now.
      let prodPlayer = { current: false, why: 'no production player pinned for this town yet' }
      if (sites.mapId) {
        try {
          const get = (k) => fetch(freshUrl(`${ASSET_BASE_URL}${k}`)).then(r => r.ok ? r.json() : null)
          const rec = await get(`staging/sites/${sites.mapId}/player.json`)
          // ⛔ BLOCKED, not merely behind: Promote's dry run refuses a town with no record, so the panel says so up front.
          if (!rec) prodPlayer = { current: false, blocked: true, why: 'this town names no player on staging — set it before promoting' }
          else if (rec.player === 'ward') {
            const [host, cur] = await Promise.all([sites.prod?.domain ? get(`hosts/${sites.prod.domain}.json`) : null, get('staging/ward/current.json')])
            const current = !!host && !!cur && host.app === 'ward' && host.ward === cur.sha && host.kit === cur.kit
            prodPlayer = { current, app: 'ward', ward: host?.ward ?? null,
              why: current ? null : 'production does not yet carry the Ward build staging serves' }
          } else {
            const [p, st] = await Promise.all([`player/${sites.mapId}/build.json`, 'staging/player/build.json'].map(get))
            if (p) prodPlayer = { current: !!st && p.builtAt === st.builtAt, app: 'legacy', builtAt: p.builtAt,
              why: st && p.builtAt === st.builtAt ? null : 'production carries an older player than staging' }
          }
        } catch { /* unreachable ⇒ not known to be current */ }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        ok: true, branch, unbaked, dirty, vsStaging, bakedAt, player, prodPlayer, deployment, prodDeployment,
        // ⛔ Per-look, derived. Each side is { url, … } or { url: null, why } — the panel
        // shows the reason instead of a link it cannot honestly offer.
        sites,
      }))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

  // POST /looks/<id>/share — the town's SHARE IMAGES, one per time-of-day slot, captured in Stage from one camera
  // (BRIEF-share-image-by-time-of-day). Written into the town's own slab as `share/<slot>.jpg`, so Publish uploads them
  // and the manifest names them like any other slab file; the site Workers pick the slot it is now in the town
  // (src/lib/shareCard.js). Body: { images: { <slot>: "data:image/jpeg;base64,…" } }.
  // ⛔ All slots or none: a partial set would publish a town whose link has no picture for part of the day.
  if (req.method === 'POST' && (m = path.match(/^\/looks\/([^/]+)\/share$/))) {
    const id = m[1]
    let body = ''
    req.on('data', c => { body += c })
    req.on('end', () => {
      try {
        if (!readLooksIndex().looks.some(l => l.id === id)) throw new Error(`unknown look "${id}"`)
        const { images } = JSON.parse(body || '{}')
        const got = Object.keys(images || {})
        const missing = TOD_SLOT_IDS.filter(s => !got.includes(s)), extra = got.filter(s => !TOD_SLOT_IDS.includes(s))
        if (missing.length || extra.length) throw new Error(`a share set is one image per slot: missing ${missing.join(', ') || 'none'}, unknown ${extra.join(', ') || 'none'} — nothing was written`)
        const bufs = TOD_SLOT_IDS.map(s => {
          const mimg = /^data:image\/jpeg;base64,(.+)$/.exec(images[s] || '')
          if (!mimg) throw new Error(`"${s}" is not a JPEG data URL — nothing was written`)
          return [s, Buffer.from(mimg[1], 'base64')]
        })
        const dir = join(import.meta.dirname, '..', 'public', 'baked', id)
        for (const [s, buf] of bufs) {
          const out = join(dir, shareImageRel(s))
          mkdirSync(dirname(out), { recursive: true })
          writeFileSync(out, buf)
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, files: bufs.map(([s, buf]) => ({ slot: s, path: `public/baked/${id}/${shareImageRel(s)}`, bytes: buf.length })) }))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }


  // GET /looks/<id>/deployed?target=staging|prod — server-side read of the LIVE
  // slab's bakedAt (node fetch → no browser CORS). The Publish panel polls this to
  // answer the operator's real question: "is the site showing my work?"
  //
  // ⛔ IT READS R2, NOT THE SITE (2026-09-01). It used to fetch
  // `<SITE_URL>baked/<id>/scene.json`; since the baked tree left the repo, that path
  // 404s on both sites and this endpoint would return bakedAt:null forever — the panel
  // would poll and never confirm, so a successful publish would look like a hung one.
  // Pointing it at ASSET_BASE is not a workaround: this endpoint's whole design is to
  // measure THE ARTIFACT BEING SERVED rather than the state of the repo, and the
  // artifact being served now comes from the bucket.
  //
  // ⛔⛔ IT IS PER-ENVIRONMENT AGAIN (2026-09-04), AND `target` IS NOW LOAD-BEARING.
  // This block used to accept `target` and DISCARD it, reading the un-prefixed (prod)
  // keys for both rows. Its comment defended that — "staging AND prod NOW RETURN THE
  // SAME VALUE … not a bug and not a lost gate" — on `PREVIEW.md §0.2`'s 2026-06-30
  // ruling that "one bucket serves every environment" and staging is redundant for
  // slab-data. ⭐ THAT DECISION WAS REOPENED ON 2026-09-03 by the staging/prod prefix
  // split: the bucket now has two key spaces, a bake may only write `staging/`, and
  // prod is a deliberate promotion. The old comment even said what to do about it —
  // "do not restore a per-environment gate here without reopening that decision first"
  // — and the decision had already been reopened, one day earlier, in another file.
  // ⛔ The cost of leaving it: the STAGING row reported PRODUCTION's slab, so the two
  // gestures the panel exists to distinguish — "put it up in a sample way" and
  // "overwrite production" — read the same number and could not disagree.
  // ⛔ An unknown target FAILS rather than guessing; guessing here is what shipped a
  // year of staging rows that were quietly about prod.
  if (req.method === 'GET' && (m = path.match(/^\/looks\/([^/]+)\/deployed$/))) {
    const id = m[1]
    const target = (req.url.match(/[?&]target=([^&]+)/) || [])[1]
    if (!ASSET_ENV_PREFIX.hasOwnProperty(target)) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: `target must be one of: ${Object.keys(ASSET_ENV_PREFIX).join(', ')} — got ${JSON.stringify(target ?? null)}` }))
      return
    }
    const base = ASSET_BASE_URL + ASSET_ENV_PREFIX[target]
    try {
      // Through the town's manifest — the one key that survives the retirement of plain names.
      const { bakedAt } = await servedPour(base, id)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, target, bakedAt }))
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, target, bakedAt: null, error: err.message }))
    }
    return
  }

  // POST /looks/<id>/publish — put this Look on its own staging address.
  //
  // ⛔⛔ IT NO LONGER PUSHES A BRANCH (2026-09-21). It used to `git push` the trunk and
  // let `staging.yml` rebuild ONE GitHub Pages site for every town — so publishing Huron
  // reshipped Lafayette Square, and a partner's link could change under them because
  // somebody poured a different town. Ruled out: one address per Map, the Publish button
  // is the unit. Now the button ships to R2, which is where both artifacts already live.
  //
  // ⭐ PUBLISH IS THE UPLOAD (Jacob, 2026-10-04). A bake ends on disk; what the operator adjusts in Preview (the
  // deployment panel: which effects each surface ships) is ACCEPTED here, because the manifest step runs again before the
  // upload and freezes deployment.json into what ships. The panel bakes first only when the bake check says a step is owed.
  //
  // THE TWO ARTIFACTS, AND THEY HAVE DIFFERENT LIFECYCLES:
  //   · the SLAB — this town's, `public/baked/<look>/` → `staging/baked/<look>/`. Uploaded here, then proven in the
  //     bucket, never assumed.
  //   · the PLAYER — the universal build, `staging/player/`, ONE for every town. Rebuilt
  //     only when staging's build is behind the source (stagingPlayerState, the same read the
  //     button's label comes from), because it costs a full vite build. ⚠️ AND IT IS SHARED:
  //     republishing it reaches every town at once. That is correct — it is one product — but
  //     it means a code change is never "just this town".
  //
  // ⛔ The git commit stays. It is the AUTHORING state (design.json, the looks index),
  // which must survive a machine, and it is not what gets served.
  if (req.method === 'POST' && (m = path.match(/^\/looks\/([^/]+)\/publish$/))) {
    const id = m[1]
    const REPO_ROOT = join(import.meta.dirname, '..')
    try {
      await runCapture(`git fetch origin --quiet`, { cwd: REPO_ROOT, timeout: 30000 })
      const branch = (await runCapture(`git rev-parse --abbrev-ref HEAD`, { cwd: REPO_ROOT })).stdout.trim()
      // ⛔ A TOWN WITHOUT ITS SHARE IMAGES DOES NOT PUBLISH: its link would send no picture, silently. Refused by
      // name before anything is committed or uploaded (BRIEF-share-image-by-time-of-day §4.4).
      const noShare = SHARE_IMAGE_RELS.filter(rel => !existsSync(join(REPO_ROOT, 'public', 'baked', id, rel)))
      if (noShare.length) throw new Error(`"${id}" has no share image for ${noShare.length === SHARE_IMAGE_RELS.length ? 'any time of day' : noShare.join(', ')} — press Capture share images in Stage first. Nothing was committed or uploaded.`)
      // ⛔ A SLAB WHOSE TREE OR LAMP ANCHORS DO NOT BELONG TO IT DOES NOT PUBLISH (Boz ruled, 2026-10-29): the player would refuse
      // that town's trees or lamps by name, and a visitor would see none. The player's own verdict, on these files.
      const unanchored = slabAnchorRefusals(join(REPO_ROOT, 'public', 'baked', id), id)
      if (unanchored.length) throw new Error(`"${id}": its ${unanchored.map(u => `${u.what} anchors are refused (${u.why}; ▶ ${u.step})`).join(' · ')}. Nothing was committed or uploaded.`)
      // ⛔ THE POUR'S GUARDS RUN AT PUBLISH TOO (Boz's ruling, 2026-11-01): this is where a town leaves the machine, so authoring that
      // now refuses (a dangling key, a join that re-keys) never ships because no Bake happened to be owed (pourSteps.mjs#pourGuardRefusals).
      const pubScene = readLooksIndex().looks.find(l => l.id === id)?.scene
      if (!pubScene) throw new Error(`Look "${id}" has no scene, so its authoring cannot be guarded. Nothing was committed or uploaded.`)
      const guarded = pourGuardRefusals(pubScene, { requirePoured: true })
      if (guarded.length) throw new Error(`"${id}": its authoring is refused — ${guarded.join(' ‖ ')}. Nothing was committed or uploaded.`)
      // Only pass pathspecs that actually exist — `git commit -- <path>` errors
      // ("pathspec did not match any file(s)") on a spec that matches nothing.
      const specs = slabPathspecs(id).filter(p => existsSync(join(REPO_ROOT, p)))
      if (!specs.length) throw new Error('no slab files found to publish')
      const changed = (await runCapture(`git status --porcelain -- ${specs.join(' ')}`, { cwd: REPO_ROOT })).stdout
        .split('\n').filter(Boolean).map(l => l.slice(3))   // no whole-output trim: see /publish/status above
      let committed = false
      if (changed.length) {
        // Stage first: `git commit -- <paths>` only knows TRACKED files, so a new
        // (untracked) file fails "pathspec did not match any file(s) known to git".
        // `git add` stages new + modified; the scoped
        // pathspecs still mean we never sweep unrelated dirty files. Then commit
        // restricted to the same paths (ignores anything else already staged).
        const add = await runCapture(`git add -- ${specs.join(' ')}`, { cwd: REPO_ROOT })
        if (add.code !== 0) throw new Error(`git add failed: ${add.stderr || add.stdout}`)
        const commit = await runCapture(`git commit -m 'chore(slab): publish ${id} → staging' -- ${specs.join(' ')}`, { cwd: REPO_ROOT })
        if (commit.code !== 0) throw new Error(`git commit failed: ${commit.stderr || commit.stdout}`)
        committed = true
      }
      const site = await siteUrlsForLook(id)
      if (!site.staging.url) throw new Error(site.staging.why)

      // ── 1. THE SLAB: freeze the manifest (it carries the deployment), then ship it.
      const scene = readLooksIndex().looks.find(l => l.id === id)?.scene
      if (scene !== id) throw new Error(`Look "${id}" is not its town's home Look ("${scene ?? 'none'}") — a manifest is one per town, so this Look's slab cannot ship. Nothing was uploaded.`)
      const man = await runCapture(`node bake-manifest.mjs --town=${id}`, { cwd: import.meta.dirname, timeout: 300000 })
      if (man.code !== 0) throw new Error(`the manifest could not be frozen, so nothing was uploaded: ${(man.stderr || man.stdout).trim().split('\n').pop()}`)
      // ⛔⛔ SHIP THE SLAB TO R2 (2026-09-01; moved here from the bake 2026-10-05).
      // public/baked/ is gitignored, so this upload is the ONLY thing that carries
      // a pour to a visitor. If it is skipped, the pour lives nowhere: the map
      // renders from the PREVIOUS slab and nothing says so.
      // ⭐ IT GOES TO STAGING, NOT PRODUCTION (fixed 2026-09-03). The bake's version of this
      // comment used to read "AND IT GOES LIVE IMMEDIATELY, EVERYWHERE… per-environment
      // prefixes are the fix if it ever bites" — it bit. One bucket served staging and prod
      // at the same keys, so a pour reached lafayette-square.com the instant it uploaded: no
      // push, no gate, no preview, and no way back except re-baking a slab that may no longer
      // exist. (Jacob: "the bigger issue is there's no way to preview it before it goes live.")
      // ⛔ PUBLISH MAY ONLY EVER WRITE STAGING, and a bake writes nothing remote at all.
      // Promotion is the separate, deliberate gesture (`--env=prod`), because "I want to see
      // it" and "visitors should see it" are two different decisions.
      // ⭐ UNDER CONTENT NAMES (`--names`): every file at a name that is its bytes, and `manifest.json` LAST — the switch
      // (OPERATIONS "Slab names"). The uploader refuses a manifest that disagrees with the bytes on disk.
      const up = await runCapture(`node scripts/upload-baked-to-r2.mjs --env=staging --look=${id} --names=${HASHED}`, { cwd: REPO_ROOT, timeout: 900000 })
      // ⛔ Loud, and the request FAILS. A 200 here would tell the operator the pour shipped when it reached nothing.
      if (up.code !== 0) {
        console.error(`[publish] ⛔ R2 upload FAILED for "${id}" — the pour is on disk only`)
        throw new Error(`the slab upload failed — staging still serves the previous slab: ${(up.stderr || up.stdout || `exit ${up.code}`).trim().split('\n').pop()}`)
      }
      const r2 = (up.stdout.match(/✅ (\d+) objects, ([\d.]+ MB)/) || [])[0] || 'uploaded'
      console.log(`[publish] R2 ${r2}`)
      // ⛔ ASK, never assume: reporting an address for a slab that is not there is the
      // plausible-looking success this whole panel exists to prevent. ⭐ And ask for THIS POUR (Zob, 2026-10-26): staging is
      // read through its manifest (`servedPour`, the switch) and the scene it names must carry this pour's stamp — a manifest
      // that is merely present could be the previous Publish's.
      const bakedAt = JSON.parse(readFileSync(join(REPO_ROOT, `public/baked/${id}/scene.json`), 'utf-8')).bakedAt ?? null
      if (bakedAt == null) throw new Error(`public/baked/${id}/scene.json carries no bakedAt — this pour has no stamp to prove it landed`)
      const landed = await servedPour(ASSET_BASE_URL + ASSET_ENV_PREFIX.staging, id)
      if (String(landed.bakedAt) !== String(bakedAt)) {
        throw new Error(`the upload reported success but staging does not serve this pour: ${landed.why
          || `it serves the pour of ${landed.bakedAt}, not ${bakedAt}`} (${ASSET_ENV_PREFIX.staging}${manifestPath(id)}).`)
      }

      // ── 2. THE PLAYER, rebuilt only when staging's build is behind the source.
      let playerPublished = false
      if ((await stagingPlayerState(REPO_ROOT)).stale) {
        await runShell('node scripts/publish-player-to-staging.mjs', { cwd: REPO_ROOT, timeout: 1800000 })
        playerPublished = true
      }

      // `bakedAt` (above) is the just-shipped pour's: the UI polls the live artifact for this exact value
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, committed, changed, branch, bakedAt, r2, playerPublished,
        stagingUrl: site.staging.url, staging: site.staging }))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

  // POST /looks/<id>/promote — put this Look on its TOWN'S OWN production domain.
  //
  // ⛔⛔ IT NO LONGER TOUCHES GIT (2026-09-26, BRIEF-production-sites). It used to `git push`
  // this branch to `main`, which deployed ONE site (lafayette-square.com) for every town and was,
  // by then, 648 commits of unreviewed trunk. Now it is per-town, like Publish: shipping
  // Provincetown changes no byte any other town serves.
  //
  // THE ORDER IS THE SAFETY — nothing a visitor can reach changes until step 5:
  //   1. WHERE: the town's domain, asked of Operations (owned, zone active LIVE) — or a refusal.
  //   2. THE SLAB → the prod keys (`baked/<look>/`). ⛔ SLAB BEFORE CODE (`plans/r2-asset-offload.md §5`).
  //   3. THE PLAYER the town's STAGING RECORD names (`staging/sites/<map>/player.json`) — the exact
  //      build that was checked there, byte-verified: `legacy` → `player/<map>/`; `ward` → the Ward
  //      build + its kit bundle, write-once at `ward/<sha>/` + `kit/<sha>/`. ⛔ No record refuses,
  //      and is asked BEFORE step 2, so a refused promote ships nothing.
  //   4. THE ADDRESS → `<domain>` and `www.<domain>` bound to the production Worker
  //      (`scripts/bind-production-domain.mjs`): the first promote of a town binds them, every later
  //      one finds them bound. Until step 5 the domain answers "no town promoted", never another town.
  //   5. THE SWITCH → `hosts/<domain>.json`, which is what the production Worker reads.
  //   6. PROOF → the domain itself is asked which town and which pour it serves. ⛔ A promote that
  //      cannot prove it is reported as NOT live, never as a success.
  if (req.method === 'POST' && (m = path.match(/^\/looks\/([^/]+)\/promote$/))) {
    const id = m[1]
    const REPO_ROOT = join(import.meta.dirname, '..')
    const say = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
    try {
      const site = await siteUrlsForLook(id)
      if (!site.prod.url) throw new Error(`no production address: ${site.prod.why}`)
      const { domain } = site.prod, map = site.mapId

      // Which player, and can it be pinned — asked before anything ships.
      const plan = await runCapture(`node scripts/promote-player-to-prod.mjs --map=${map} --look=${id} --dry-run`, { cwd: REPO_ROOT, timeout: 600000 })
      if (plan.code !== 0) throw new Error(`nothing was shipped: ${(plan.stderr || plan.stdout).trim().split('\n').pop()}`)

      // ⭐ UNDER CONTENT NAMES, as Publish ships staging: the same bytes at the same names, manifest.json last (the switch)
      const up = await runCapture(`node scripts/upload-baked-to-r2.mjs --env=prod --look=${id} --names=${HASHED}`, { cwd: REPO_ROOT, timeout: 900000 })
      if (up.code !== 0) throw new Error(`the slab did not reach production — nothing was switched: ${up.stderr || up.stdout || `exit ${up.code}`}`)
      const r2 = (up.stdout.match(/✅ (\d+) objects, ([\d.]+ MB)/) || [])[0] || 'uploaded'

      const pin = await runCapture(`node scripts/promote-player-to-prod.mjs --map=${map} --look=${id}`, { cwd: REPO_ROOT, timeout: 1800000 })
      if (pin.code !== 0) throw new Error(`the player was not pinned — nothing was switched: ${(pin.stderr || pin.stdout).trim().split('\n').pop()}`)
      const pinned = JSON.parse(pin.stdout.trim().split('\n').pop())

      const bind = await runCapture(`node scripts/bind-production-domain.mjs --domain=${domain}`, { cwd: REPO_ROOT, timeout: 180000 })
      if (bind.code !== 0) throw new Error(`the slab and player are in production, but ${domain} could not be put on the production site — nothing was switched: ${(bind.stderr || bind.stdout).trim().split('\n').pop()}`)

      let bakedAt = null
      try { bakedAt = JSON.parse(readFileSync(join(REPO_ROOT, `public/baked/${id}/scene.json`), 'utf-8')).bakedAt ?? null } catch { /* leave null */ }
      // ⭐ v2: the record names the player (`workers/production-sites/src/route.js#appOf`).
      const record = pinned.player === 'ward'
        ? { v: 2, app: 'ward', map, look: id, domain, ward: pinned.ward, kit: pinned.kit, builtAt: pinned.builtAt, bakedAt, promotedAt: new Date().toISOString() }
        : { v: 2, app: 'legacy', map, look: id, domain, player: pinned.builtAt, bakedAt, promotedAt: new Date().toISOString() }
      const recPath = join(REPO_ROOT, '.promote-host.json')
      writeFileSync(recPath, JSON.stringify(record, null, 2))
      const sw = await runCapture(`npx wrangler r2 object put theward-assets/hosts/${domain}.json --file ${recPath} --remote `
        + `--content-type 'application/json; charset=utf-8' --cache-control no-store`, { cwd: REPO_ROOT, timeout: 120000 })
      rmSync(recPath, { force: true })
      if (sw.code !== 0) throw new Error(`the slab and player are in production but ${domain} was NOT switched to them: ${sw.stderr || sw.stdout}`)

      const proof = await proveProduction(domain, id, bakedAt, pinned)
      const body = { ok: proof.ok, shipped: true, r2, app: pinned.player, player: pinned.builtAt, ward: pinned.ward, kit: pinned.kit, copied: pinned.copied, bakedAt,
        prodUrl: site.prod.url, prod: site.prod, proof }
      if (!proof.ok) body.error = `shipped, but ${domain} is not serving it yet: ${proof.why}`
      say(proof.ok ? 200 : 502, body)
    } catch (err) {
      say(500, { error: err.message })
    }
    return
  }

  // POST /looks — create a new Look. Body: { name, fromLookId?, scene?, id? }.
  // Seeds the new Look's design.json from `fromLookId` (defaults to the
  // currently-active or default Look). The new Look's scene defaults to
  // the seed Look's scene — cloning a Look keeps you in its scene unless
  // the caller explicitly passes a different one. Caller bakes separately.
  if (req.method === 'POST' && path === '/looks') {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        const { name, fromLookId, scene, id: statedId } = JSON.parse(body || '{}')
        if (!name || !String(name).trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'name required' }))
          return
        }
        const idx = readLooksIndex()
        const seedEntry = (fromLookId && idx.looks.find(l => l.id === fromLookId))
          || idx.looks.find(l => l.id === idx.default)
        const seedId = seedEntry ? seedEntry.id : idx.default
        // ⛔⛔ Was: `|| DEFAULT_MAP`. A Look created with no scene — and seeded
        // from a seed that has none either (the kit 0-state has none by design) —
        // was silently BOUND TO LAFAYETTE SQUARE, and the binding then persisted.
        // That is A00's exact defect: an unanswerable question answered with the
        // mould. A Look whose town we cannot name is unbuildable, not an LS Look.
        const newScene = (scene && String(scene).trim()) || (seedEntry && seedEntry.scene) || null
        if (!newScene) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error:
            `refusing to create look "${name}": no scene given and seed ` +
            `"${seedEntry?.id ?? idx.default}" has none to inherit. Pass { scene }.` }))
          return
        }
        // A STATED id (Extent's Pour passes the town's web address, §3.0) is used or refused, never suffixed.
        const L = lookIdFor({ statedId, name, existingIds: idx.looks.map(l => l.id) })
        if (L.error) {
          res.writeHead(L.status, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: L.error }))
          return
        }
        const id = L.id
        const seedScene = seedEntry?.scene || null
        // ⛔ A11 — the seed's STYLE travels, its scene-keyed AUTHORING does not.
        // Throws 409 if an undeclared scene-keyed field survives the strip.
        const { design: seedDesign, stripped } =
          seedDesignForScene(readLookDesign(seedId), seedScene, newScene)
        if (stripped.length) {
          console.log(`[looks] "${id}" (scene ${newScene}) seeded from "${seedId}" (scene ${seedScene}) — ` +
                      `dropped ${seedScene}'s scene-keyed authoring: ${stripped.join(', ')}. Starts at defaults.`)
        }
        mkdirSync(lookDir(id), { recursive: true })
        writeJson(lookDesignPath(id), seedDesign)
        idx.looks.push({ id, name: String(name).trim(), scene: newScene, createdAt: Date.now() })
        saveLooksIndex(idx)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, id, seededFrom: seedId, strippedSceneKeyed: stripped }))
      } catch (err) {
        res.writeHead(err.statusCode || 400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // DELETE /looks/<id> — remove a Look. Forbidden for the default 0-state.
  if (req.method === 'DELETE' && (m = path.match(/^\/looks\/([^/]+)$/))) {
    const id = m[1]
    const idx = readLooksIndex()
    if (id === idx.default) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'cannot delete default look' }))
      return
    }
    if (!idx.looks.some(l => l.id === id)) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unknown look' }))
      return
    }
    try {
      rmSync(lookDir(id), { recursive: true, force: true })
      idx.looks = idx.looks.filter(l => l.id !== id)
      saveLooksIndex(idx)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{"ok":true}')
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
    return
  }


  // ⛔ No route. This used to serve any path out of the DEFAULT town's clean/ dir (and `/` as its preview.html), so an
  // unrouted request read Lafayette Square's files under no town's name. There is no default town: a town's data is
  // asked by /<scene>/<verb>.
  res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: `no route for ${req.method} ${path} — a town's data is /<scene>/<verb>` }))
 } catch (err) {
  console.error(`[serve] ${req.method} ${req.url} — ${err.message}`)
  if (!res.headersSent) res.writeHead(err.statusCode || 500, { 'Content-Type': 'application/json' })
  if (!res.writableEnded) res.end(JSON.stringify({ error: err.message }))
 }
}).listen(PORT, () => {
  console.log(`Cartograph preview → http://localhost:${PORT}`)
})
