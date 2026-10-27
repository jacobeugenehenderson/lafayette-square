/**
 * A SLAB STEP RUNS IN A STAGE AND PUBLISHES ONLY WHEN IT SUCCEEDS (Boz, 2026-10-27). The Bake used to copy a town's new
 * terrain into `public/baked/<look>/` before the ground bake ran; when the ground then refused, the slab was left with a
 * new terrain over the old ground, a mix the player refuses by name (and an older player draws wrong, silently). Twice
 * on Huron in one day, restored by hand.
 *
 * ⭐ So the terrain and the ground are published TOGETHER: the step writes into a stage directory, and only after it exits
 * cleanly are its outputs and the files that ride with it (the terrain) copied into the slab. A failed step leaves the
 * slab byte-identical; the stage is removed either way.
 *   stagedSlabStep({ lookDir, look, seed, publish, carry, step, stageRoot }) → the names it changed in the slab
 *     seed     names copied slab → stage first: what the step READS from its out dir (the prior ground.json, the median)
 *     publish  names copied stage → slab after success; one the step did not write keeps the slab's own
 *     carry    [[name, bytes]] published in the same commit (the terrain, from the town's clean/)
 *     step     async (stageDir) → runs the step with its output pointed at the stage; a throw is a failed step
 *   publishSlab({ lookDir, look, files, stageRoot }) — the commit. Every changed file is written in the STAGE tree
 *     (`<look>.commit/`) and renamed across into the slab, so nothing temporary ever sits in the slab for the uploader
 *     to ship (a stage on another volume fails the rename with EXDEV, loudly). ⛔ A TORN COMMIT IS LOUD: a journal
 *     (`<look>.journal.json`: the look and the names) is written before the first rename and deleted after the last.
 *     A journal left behind means the slab holds part of a commit, so the next step for that look refuses by name, and
 *     so does this module on import: the operator re-bakes that look's ground, then deletes the journal.
 * ▶ node checks/claims-a-failed-bake-leaves-the-slab.mjs
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const STAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '.bake-stage')
const journalOf = (stageRoot, look) => join(stageRoot, `${look}.journal.json`)

/** ⛔ Throws, naming each, when a commit was torn: its journal is still in the stage tree. */
export function refuseTornCommit(stageRoot = STAGE_ROOT, look = null) {
  const torn = !existsSync(stageRoot) ? [] : readdirSync(stageRoot).filter(f => f.endsWith('.journal.json') && (!look || f === `${look}.journal.json`))
  if (!torn.length) return
  const said = torn.map(f => { try { const j = JSON.parse(readFileSync(join(stageRoot, f), 'utf-8')); return `${j.look} (${j.names.join(', ')})` } catch { return f } })
  throw new Error(`[slabStage] ⛔ a slab commit was torn part-way: ${said.join('; ')} — that slab holds part of a commit. `
    + `▶ re-bake that look's ground (⌥-click Bake), then delete ${torn.map(f => join(stageRoot, f)).join(', ')}`)
}
refuseTornCommit()

/** [[name, bytes]] → lookDir, only the ones whose bytes differ, through the stage tree and a journal. → the names written. */
export function publishSlab({ lookDir, look, files, stageRoot = STAGE_ROOT }) {
  refuseTornCommit(stageRoot, look)
  const changed = files.filter(([name, bytes]) => {
    const to = join(lookDir, name)
    return !(existsSync(to) && readFileSync(to).equals(bytes))
  })
  if (!changed.length) return []
  const commitDir = join(stageRoot, `${look}.commit`), journal = journalOf(stageRoot, look)
  rmSync(commitDir, { recursive: true, force: true })
  mkdirSync(commitDir, { recursive: true }); mkdirSync(lookDir, { recursive: true })
  for (const [name, bytes] of changed) writeFileSync(join(commitDir, name), bytes)
  writeFileSync(journal, JSON.stringify({ look, lookDir, names: changed.map(([name]) => name), at: new Date().toISOString() }))
  for (const [name] of changed) renameSync(join(commitDir, name), join(lookDir, name))
  rmSync(journal)
  rmSync(commitDir, { recursive: true, force: true })
  return changed.map(([name]) => name)
}

export async function stagedSlabStep({ lookDir, look, seed = [], publish, carry = [], step, stageRoot = STAGE_ROOT }) {
  refuseTornCommit(stageRoot, look)
  const stageDir = join(stageRoot, look)
  rmSync(stageDir, { recursive: true, force: true })   // a stage left by a killed server is never read
  mkdirSync(stageDir, { recursive: true })
  try {
    for (const name of seed) if (existsSync(join(lookDir, name))) copyFileSync(join(lookDir, name), join(stageDir, name))
    await step(stageDir)
    const out = publish.filter(name => existsSync(join(stageDir, name))).map(name => [name, readFileSync(join(stageDir, name))])
    return publishSlab({ lookDir, look, files: [...carry, ...out], stageRoot })
  } finally {
    rmSync(stageDir, { recursive: true, force: true })
  }
}
