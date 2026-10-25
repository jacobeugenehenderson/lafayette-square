/**
 * scene.js — THE ONE SCENE RESOLVER. Import this; never re-derive it.
 *
 * ⛔⛔ NO SILENT DEFAULT ON ANYTHING THAT WRITES (`BRIEF-ls-bleed-excision` site 11,
 * Class C). `SCENE = env || DEFAULT_MAP` meant forgetting the variable silently
 * redirected the whole run onto Lafayette Square — no error, no warning. On
 * 2026-07-31 that cost a full day: an agent rebuilt LS repeatedly while the
 * operator worked in `lafayette-square-staging`, and the resulting "no symptom
 * change" was read as the fix failing rather than as the wrong town being built.
 * A fallback turns a failure into a plausible-looking success; for a kit that is
 * the worst available outcome (`CLAUDE.md` Layer 0).
 *
 * ⛔⛔ AND NO DEFAULT AT ALL, ON ANY PATH (Jacob, 2026-10-21: "LS is only the fallback because it was first and we
 * didn't conceive it against a generic backdrop"; standing order 2026-09-28, `BRIEF-no-default-town`). With no scene
 * named, `SCENE` is null and so are `RAW_DIR` / `CLEAN_DIR`: a multi-town reader (the dev servers, a library, a check)
 * imports this and names its town per call; anything that WRITES calls `requireExplicitMap()` and refuses.
 *
 * ⭐⭐ WHY THIS IS A SEPARATE FILE FROM `config.js`, AND WHY IT MUST STAY ONE.
 *
 * Two reasons, and both are load-bearing.
 *
 * (1) THE RESOLVER MUST BE SIDE-EFFECT-FREE. `config.js` runs `_loadGeography()` at
 *     module load and `process.exit(2)`s when a named scene has no `geography.json`.
 *     A baker that imported `config.js` merely to ask "what scene?" would die on a
 *     scene without geography before `main()` ran. Asking the scene's NAME must
 *     never force loading its GEOGRAPHY. The exit stays loud in `config.js`, where
 *     geography is actually used; it does not follow the name around.
 *
 * (2) ⛔ THERE MUST BE EXACTLY ONE RESOLVER, BECAUSE THERE ARE TWO CHANNELS.
 *     A scene can be named by `--scene=<id>` OR by `CARTOGRAPH_SCENE`. Every baker
 *     used to hand-roll its own argv loop over a `let scene = 'lafayette-square'`
 *     seed — which read the FLAG and ignored the ENV. Eight of ten bakers never
 *     mentioned `CARTOGRAPH_SCENE` at all. So:
 *
 *         CARTOGRAPH_SCENE=hipointedemun node bake-ground.js --look=lafayette-square
 *
 *     …named a scene, passed every guard (this file sees the env; `assertBakeTarget`
 *     sees scene==look because the local parser had silently fallen back to LS) —
 *     and rebuilt Lafayette Square while the operator believed they were baking
 *     HiPointe. That is the 2026-07-31 incident above, reachable in 2026-09 by
 *     following `requireExplicitMap()`'s OWN remedy text, which offered both
 *     channels as if they were interchangeable. A guard whose instructions lead
 *     into the failure it exists to prevent is worse than no guard: it certifies it.
 *
 *     ⇒ A writer does not parse `--scene` itself. It imports `SCENE` from here and
 *       calls `requireExplicitMap()`. One resolver, both channels, no seed.
 */
import { dirname, join, isAbsolute, normalize } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, readdirSync } from 'fs'
import { designPath, readTownDesign } from './lookDesign.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

const _sceneArg = (process.argv || []).map(a => /^--scene=(.+)$/.exec(a)).find(Boolean)?.[1]
/** true when the operator actually named the scene (flag or env), false when defaulted. */
export const SCENE_IS_EXPLICIT = !!(_sceneArg || process.env.CARTOGRAPH_SCENE)
export const SCENE = _sceneArg || process.env.CARTOGRAPH_SCENE || null

/**
 * Refuse to proceed unless the operator named the scene. Call this FIRST in any
 * entry point that writes an artifact — a wrong scene there does not show a wrong
 * map, it overwrites a right one.
 */
export function requireExplicitMap(who = 'this command') {
  if (SCENE_IS_EXPLICIT) return SCENE
  const me = process.argv[1]?.split('/').pop() || '<script>'
  console.error(`
⛔ ${who} refuses to run without an explicit scene.

   It writes artifacts, and there is no default town to write them into.
   Towns: ${townsOnDisk().join(' · ') || '(none under cartograph/data/)'}

   Name the scene, by EITHER channel — both are read here, by one resolver:
     node ${me} --scene=<town>
     CARTOGRAPH_SCENE=<town> node ${me}

   (BRIEF-ls-bleed-excision site 11 · CLAUDE.md Layer 0 — no fallbacks.)
`)
  process.exit(2)
}

// The towns on disk, for the refusal above: what an operator may name. Read, never typed.
function townsOnDisk() {
  try { return readdirSync(join(__dirname, 'data'), { withFileTypes: true }).filter(d => d.isDirectory() && existsSync(join(__dirname, 'data', d.name, 'geography.json'))).map(d => d.name).sort() } catch { return [] }
}

// Paths. Per-scene data lives under cartograph/data/<scene>/. Each scene mirrors
// the same raw/ + clean/ split (raw = ingested inputs; clean = derived /
// operator-edited artifacts). Scripts that operate on a specific scene should call
// mapRawDir(scene) / mapCleanDir(scene); the unqualified RAW_DIR / CLEAN_DIR
// aliases resolve to the ACTIVE scene (SCENE).
export const CARTOGRAPH_DIR = __dirname
export function mapDir(scene)      { return join(__dirname, 'data', scene) }
export function mapRawDir(scene)   { return join(__dirname, 'data', scene, 'raw') }
export function mapCleanDir(scene) { return join(__dirname, 'data', scene, 'clean') }
/**
 * WHERE A TOWN DECLARES ITS PROMOTED RIBBONS LIVE, or null: `pour.ribbons` in its home Look's design.json — a repo-relative
 * path, for a town whose ribbons are COMMITTED where a shipped build imports them (Lafayette Square's production player
 * reads src/data/ribbons.json). The declaration replaced a test of the town's NAME (G2(b), 2026-10-07). A town with no
 * home Look, or none declared, declares nothing. ⛔ A declaration that is not a plain path inside the repo, or names a file
 * that does not exist, THROWS — clean/ is only ever the path of a town that declares nothing.
 */
export function declaredRibbonsOf(scene) { return declaredPourPath(scene, 'ribbons', 'declaredRibbonsOf') }

/**
 * WHERE A TOWN DECLARES A CURATED BUILDING SET, or null: `pour.buildings` in its home Look's design.json — a repo-relative
 * path to a hand-enriched set (footprints with materials, stories, addresses) the pour takes INSTEAD of its footprint
 * wells (Lafayette Square: src/data/buildings.json). The declaration replaced a test of the DEFAULT map's name
 * (pipeline.js, 2026-10-21). Same rules as `pour.ribbons`: not a plain in-repo path, or declared and absent, THROWS.
 */
export function declaredBuildingsOf(scene) { return declaredPourPath(scene, 'buildings', 'declaredBuildingsOf') }

function declaredPourPath(scene, key, who) {
  if (!scene) throw new Error(`${who}: no scene`)
  if (!existsSync(designPath(scene))) return null
  const d = readTownDesign(scene, who).pour?.[key]
  if (d == null) return null
  if (typeof d !== 'string' || !d || isAbsolute(d) || normalize(d).startsWith('..')) throw new Error(`[scene] ⛔ "${scene}" declares pour.${key} ${JSON.stringify(d)} — a repo-relative path inside the repo`)
  // ⛔ DECLARED AND ABSENT IS A FAILURE, never a quiet drop to the town's own wells: those are for a town that declares nothing.
  if (!existsSync(join(__dirname, '..', normalize(d)))) throw new Error(`[scene] ⛔ "${scene}" declares its ${key} at ${d}, and there is no such file — refusing to read or publish another path in its place`)
  return normalize(d)
}

/**
 * WHERE A TOWN'S RIBBONS LIVE — the ONE answer (bake-ground, bake-labels, serve, applySnapshot, promote-ribbons, the
 * checks via checks/_scenes.mjs): the town's DECLARED path (declaredRibbonsOf), else `data/<scene>/clean/ribbons.json`.
 * ⛔ No fallback: a town whose file is missing is told so by its caller — never handed another town's.
 */
export function ribbonsPathOf(scene) {
  if (!scene) throw new Error('ribbonsPathOf: no scene')
  const declared = declaredRibbonsOf(scene)
  return declared ? join(__dirname, '..', declared) : join(mapCleanDir(scene), 'ribbons.json')
}
// null with no scene named: a reader that joins onto it without naming its town fails at that line, never in another town's dir
export const RAW_DIR   = SCENE ? mapRawDir(SCENE) : null
export const CLEAN_DIR = SCENE ? mapCleanDir(SCENE) : null
