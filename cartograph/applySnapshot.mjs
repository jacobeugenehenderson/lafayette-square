/**
 * applySnapshot.mjs — WHAT AN EXTENT APPLY CHANGES, snapshotted before and restored on failure.
 *
 * An "apply" is Extent's Bake up to the bake itself: commit-extent (first pour) or rescope
 * (a committed town) writes the disc, then the pour writes map.json and promote-ribbons writes
 * the ribbons artifact. If any of that fails, the town must be left in ONE consistent state.
 * ⛔ Until 2026-09-25 the snapshot covered geography / boundary / neighborhood.json only, so a
 * Bake whose pour failed left the NEW map.json beside the OLD boundary (provincetown: a 5,290 m
 * pour under a 7,065 m disc), and rescope had no rollback at all.
 *
 * A file that did not exist before is recorded as ABSENT, so the restore deletes it rather than
 * keeping a half-pour.  ▶ node checks/claims-a-failed-apply-leaves-one-state.mjs
 */
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { mapDir, mapCleanDir, DEFAULT_MAP } from './config.js'

const REPO_ROOT = join(import.meta.dirname, '..')

/** Where promote-ribbons writes this scene's ribbons — the ONE answer (promote-ribbons reads it too). */
export function promotedRibbonsPath(scene) {
  return scene === DEFAULT_MAP
    ? join(REPO_ROOT, 'src', 'data', 'ribbons.json')
    : join(mapCleanDir(scene), 'ribbons.json')
}

/** Every file an apply writes: the disc and its draft, the frame, and the pour's outputs. */
export function applySnapshotPaths(scene) {
  const dir = mapDir(scene)
  return [
    join(dir, 'geography.json'), join(dir, 'neighborhood_boundary.json'), join(dir, 'neighborhood.json'),
    join(mapCleanDir(scene), 'map.json'), promotedRibbonsPath(scene),
  ]
}

export function snapshotPaths(paths, tag) {
  for (const src of paths) {
    for (const ext of [`.${tag}`, `.${tag}-absent`]) rmSync(src + ext, { force: true })
    if (existsSync(src)) writeFileSync(src + `.${tag}`, readFileSync(src))
    else writeFileSync(src + `.${tag}-absent`, '')
  }
}

/** @returns {boolean} whether anything was restored */
export function restorePaths(paths, tag) {
  let restored = false
  for (const src of paths) {
    const bak = src + `.${tag}`, absent = src + `.${tag}-absent`
    if (existsSync(bak)) { writeFileSync(src, readFileSync(bak)); rmSync(bak, { force: true }); restored = true }
    else if (existsSync(absent)) { rmSync(src, { force: true }); rmSync(absent, { force: true }); restored = true }
  }
  return restored
}

export function clearPaths(paths, tag) {
  for (const src of paths) for (const ext of [`.${tag}`, `.${tag}-absent`]) rmSync(src + ext, { force: true })
}

export const snapshotApply = (scene, tag) => snapshotPaths(applySnapshotPaths(scene), tag)
export const restoreApply = (scene, tag) => restorePaths(applySnapshotPaths(scene), tag)
export const clearApplySnapshot = (scene, tag) => clearPaths(applySnapshotPaths(scene), tag)
