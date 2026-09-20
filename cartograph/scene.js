/**
 * scene.js — THE ONE SCENE RESOLVER. Import this; never re-derive it.
 *
 * ⛔⛔ NO SILENT DEFAULT ON ANYTHING THAT WRITES (`BRIEF-ls-bleed-excision` site 11,
 * Class C). `SCENE = env || DEFAULT_SCENE` meant forgetting the variable silently
 * redirected the whole run onto Lafayette Square — no error, no warning. On
 * 2026-07-31 that cost a full day: an agent rebuilt LS repeatedly while the
 * operator worked in `lafayette-square-staging`, and the resulting "no symptom
 * change" was read as the fix failing rather than as the wrong town being built.
 * A fallback turns a failure into a plausible-looking success; for a kit that is
 * the worst available outcome (`CLAUDE.md` Layer 0).
 *
 * READ paths may still resolve to the default (the dev server imports this at
 * module load and must not die), but the choice is now VISIBLE. Anything that
 * WRITES must call `requireExplicitScene()` and refuse.
 *
 * ⭐⭐ WHY THIS IS A SEPARATE FILE FROM `config.js`, AND WHY IT MUST STAY ONE.
 *
 * Two reasons, and both are load-bearing.
 *
 * (1) THE RESOLVER MUST BE SIDE-EFFECT-FREE. `config.js` runs `_loadGeography()` at
 *     module load and `process.exit(2)`s when a named scene has no `geography.json`.
 *     The `toy` scene has none — it is a hand-authored fixture with no real-world
 *     coordinates — so a baker that imported `config.js` merely to ask "what scene?"
 *     would die on `--scene=toy` before `main()` ran, taking out a live bake path
 *     (`public/baked/toy/` is real and fully poured). Asking the scene's NAME must
 *     never force loading its GEOGRAPHY. The exit stays loud in `config.js`, where
 *     geography is actually used; it does not follow the name around.
 *
 * (2) ⛔ THERE MUST BE EXACTLY ONE RESOLVER, BECAUSE THERE ARE TWO CHANNELS.
 *     A scene can be named by `--scene=<id>` OR by `CARTOGRAPH_SCENE`. Every baker
 *     used to hand-roll its own argv loop over a `let scene = 'lafayette-square'`
 *     seed — which read the FLAG and ignored the ENV. Eight of ten bakers never
 *     mentioned `CARTOGRAPH_SCENE` at all. So:
 *
 *         CARTOGRAPH_SCENE=hipointe-demun node bake-ground.js --look=lafayette-square
 *
 *     …named a scene, passed every guard (this file sees the env; `assertBakeTarget`
 *     sees scene==look because the local parser had silently fallen back to LS) —
 *     and rebuilt Lafayette Square while the operator believed they were baking
 *     HiPointe. That is the 2026-07-31 incident above, reachable in 2026-09 by
 *     following `requireExplicitScene()`'s OWN remedy text, which offered both
 *     channels as if they were interchangeable. A guard whose instructions lead
 *     into the failure it exists to prevent is worse than no guard: it certifies it.
 *
 *     ⇒ A writer does not parse `--scene` itself. It imports `SCENE` from here and
 *       calls `requireExplicitScene()`. One resolver, both channels, no seed.
 */
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const DEFAULT_SCENE = 'lafayette-square'

const _sceneArg = (process.argv || []).map(a => /^--scene=(.+)$/.exec(a)).find(Boolean)?.[1]
/** true when the operator actually named the scene (flag or env), false when defaulted. */
export const SCENE_IS_EXPLICIT = !!(_sceneArg || process.env.CARTOGRAPH_SCENE)
export const SCENE = _sceneArg || process.env.CARTOGRAPH_SCENE || DEFAULT_SCENE

/**
 * Refuse to proceed unless the operator named the scene. Call this FIRST in any
 * entry point that writes an artifact — a wrong scene there does not show a wrong
 * map, it overwrites a right one.
 */
export function requireExplicitScene(who = 'this command') {
  if (SCENE_IS_EXPLICIT) return SCENE
  const me = process.argv[1]?.split('/').pop() || '<script>'
  console.error(`
⛔ ${who} refuses to run without an explicit scene.

   It writes artifacts, and defaulting would silently target '${DEFAULT_SCENE}' —
   overwriting Lafayette Square's build with another town's run, or vice versa.

   Name the scene, by EITHER channel — both are read here, by one resolver:
     node ${me} --scene=${DEFAULT_SCENE}
     CARTOGRAPH_SCENE=${DEFAULT_SCENE} node ${me}

   (BRIEF-ls-bleed-excision site 11 · CLAUDE.md Layer 0 — no fallbacks.)
`)
  process.exit(2)
}

if (!SCENE_IS_EXPLICIT) console.warn(`[config] scene not named — defaulting to '${DEFAULT_SCENE}'. Pass --scene=<id> to be explicit.`)

// Paths. Per-scene data lives under cartograph/data/<scene>/. Each scene mirrors
// the same raw/ + clean/ split (raw = ingested inputs; clean = derived /
// operator-edited artifacts). Scripts that operate on a specific scene should call
// sceneRawDir(scene) / sceneCleanDir(scene); the unqualified RAW_DIR / CLEAN_DIR
// aliases resolve to the ACTIVE scene (SCENE).
export const CARTOGRAPH_DIR = __dirname
export function sceneDir(scene)      { return join(__dirname, 'data', scene) }
export function sceneRawDir(scene)   { return join(__dirname, 'data', scene, 'raw') }
export function sceneCleanDir(scene) { return join(__dirname, 'data', scene, 'clean') }
export const RAW_DIR   = sceneRawDir(SCENE)
export const CLEAN_DIR = sceneCleanDir(SCENE)
