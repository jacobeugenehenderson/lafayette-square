/**
 * A SLAB STEP RUNS IN A STAGE AND PUBLISHES ONLY WHEN IT SUCCEEDS (Boz, 2026-10-27). The Bake used to copy a town's new
 * terrain into `public/baked/<look>/` before the ground bake ran; when the ground then refused, the slab was left with a
 * new terrain over the old ground, a mix the player refuses by name (and an older player draws wrong, silently). Twice
 * on Huron in one day, restored by hand.
 *
 * ⭐ So the terrain and the ground are published TOGETHER: the step writes into a stage directory, and only after it exits
 * cleanly are its outputs and the files that ride with it (the terrain) copied into the slab. A failed step leaves the
 * slab byte-identical; the stage is removed either way.
 *   stagedSlabStep({ lookDir, stageDir, seed, publish, carry, step }) → the names it changed in the slab
 *     seed     names copied slab → stage first: what the step READS from its out dir (the prior ground.json, the median)
 *     publish  names copied stage → slab after success; one the step did not write keeps the slab's own
 *     carry    [[name, bytes]] published in the same commit (the terrain, from the town's clean/)
 *     step     async (stageDir) → runs the step with its output pointed at the stage; a throw is a failed step
 *   publishSlab(lookDir, files) — the commit: every changed file is written beside its target first and then renamed over
 *     it, so a commit stopped part-way leaves no torn file, only a slab that has not yet received every rename.
 * ▶ node checks/claims-a-failed-bake-leaves-the-slab.mjs
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'

/** [[name, bytes]] → lookDir, only the ones whose bytes differ. Returns the names written. */
export function publishSlab(lookDir, files) {
  const changed = files.filter(([name, bytes]) => {
    const to = join(lookDir, name)
    return !(existsSync(to) && readFileSync(to).equals(bytes))
  })
  if (!changed.length) return []
  mkdirSync(lookDir, { recursive: true })
  for (const [name, bytes] of changed) writeFileSync(join(lookDir, `${name}.staged`), bytes)
  for (const [name] of changed) renameSync(join(lookDir, `${name}.staged`), join(lookDir, name))
  return changed.map(([name]) => name)
}

export async function stagedSlabStep({ lookDir, stageDir, seed = [], publish, carry = [], step }) {
  rmSync(stageDir, { recursive: true, force: true })   // a stage left by a killed server is never read
  mkdirSync(stageDir, { recursive: true })
  try {
    for (const name of seed) if (existsSync(join(lookDir, name))) copyFileSync(join(lookDir, name), join(stageDir, name))
    await step(stageDir)
    const out = publish.filter(name => existsSync(join(stageDir, name))).map(name => [name, readFileSync(join(stageDir, name))])
    return publishSlab(lookDir, [...carry, ...out])
  } finally {
    rmSync(stageDir, { recursive: true, force: true })
  }
}
