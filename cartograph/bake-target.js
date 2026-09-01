/**
 * bake-target.js — the ONE bake-target guard. Call it before any write.
 *
 * ⛔⛔ WHY THIS FILE EXISTS, AND WHY IT IS SHARED RATHER THAN COPIED.
 *
 * A baker writes `public/baked/<look>/…`. If `<look>` has no `public/looks/<look>/`
 * directory, the bake still "succeeds" — it just pours into a PHANTOM directory that
 * nothing reads. Every eval taken off it then reads a stale ghost surface, and the
 * operator is told the bake worked. That is `CLAUDE.md` Layer 0 question 2 exactly: a
 * failure wearing a success's clothes, in the one place it must never happen.
 *
 * ⭐ THE PHANTOM IS NOT HYPOTHETICAL — IT IS SITTING IN THE REPO. `public/baked/default/`
 * exists because every baker defaulted to `look = 'default'`, which came from misreading
 * `public/looks/index.json`'s opening `"default": "lafayette-square"` — a pointer naming
 * WHICH look is default — as a look literally NAMED "default". `SLAB-CONTRACT.md §376`:
 * the file was *"LS's census under a fossil name,"* and *"'cross-look' was that fossil
 * rationalized after the fact."* A filename became a doctrine; the doctrine was then
 * cited as a design decision. That is why the fix is a required argument and a loud
 * refusal, not a better default — any default at all re-opens the same hole.
 *
 * ⚠️ The guards below were written twice before, inline in `bake-ground.js` (2026-06-01
 * and 2026-07-21), each after a session was lost to the failure it catches. Four other
 * bakers never got them. Copying the rule a third time is how it stays 1-of-5 correct —
 * so it lives here, once, and every look-writing baker calls it.
 */
import { existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Refuse a bake that would write somewhere nothing reads, or the wrong installation.
 *
 * @param {string} tool  the caller's name, for the error prefix (e.g. 'bake-lamps')
 * @param {string} look  the look being written to — REQUIRED, no default anywhere
 * @param {string} [scene] the scene supplying geometry; when given, must match the
 *                 look's declared scene in public/looks/index.json
 * @throws {Error} loudly, BEFORE any write
 */
export function assertBakeTarget(tool, look, scene) {
  // (0) Missing target. Previously every baker silently substituted 'default' here.
  if (!look || typeof look !== 'string') {
    throw new Error(
      `[${tool}] no --look given. Refusing to guess: the old default was 'default', ` +
      `which is not a look — it wrote the phantom public/baked/default/ that nothing ` +
      `reads. Pass --look=<id> (e.g. --look=lafayette-square).`
    )
  }

  // (1) Phantom-look guard (2026-06-01, hoisted from bake-ground.js). The app reads
  // baked/<INSTANCE.lookId>. A bake into a look with no looks/<look>/ produces a
  // directory NOTHING reads. serve.js always passes an existing --look, so this
  // catches operator/agent CLI mistakes — the failure mode that cost a whole session.
  if (!existsSync(join(ROOT, 'public', 'looks', look))) {
    throw new Error(
      `[${tool}] no such look: public/looks/${look}/ does not exist. ` +
      `Baking it would write a phantom baked/${look}/ that nothing reads. ` +
      `Pass --look=lafayette-square (the real LS surface) or --look=toy.`
    )
  }

  // (2) SCENE≠LOOK cross-write guard (2026-07-21, hoisted from bake-ground.js). A look
  // declares its canonical scene in public/looks/index.json ({id, scene}). Baking
  // scene-X geometry into a look whose declared scene is Y silently poured HPDM's
  // ground/shape into public/baked/lafayette-square/ (committed in 25f50930, caught
  // only by eye). serve.js DERIVES scene from the look, so its endpoint is safe — this
  // catches a CLI/agent bake with mismatched --look/--scene.
  if (scene) {
    let declared
    try {
      const idxRaw = JSON.parse(readFileSync(join(ROOT, 'public', 'looks', 'index.json'), 'utf-8'))
      declared = (Array.isArray(idxRaw) ? idxRaw : (idxRaw.looks || [])).find(l => l.id === look)?.scene
    } catch { /* a bad/absent index is not this guard's business; (1) already passed */ }
    if (declared && declared !== scene) {
      throw new Error(
        `[${tool}] SCENE≠LOOK: refusing to bake scene '${scene}' geometry into look ` +
        `'${look}' (its declared scene is '${declared}'). This is the cross-write that ` +
        `poured HPDM into public/baked/lafayette-square/. Pass --scene=${declared} to bake ` +
        `this look's own geometry, or target the look whose scene is '${scene}'.`
      )
    }
  }
}
