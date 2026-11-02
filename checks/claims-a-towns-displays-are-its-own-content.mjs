#!/usr/bin/env node
/**
 * "DOES ONE TOWN'S DISPLAY SHIP IN EVERY TOWN'S PLAYER?" (Boz's ruling, 2026-10-31: a town's looks are TOWN CONTENT.)
 *
 * The kit's public/ is copied into the one kit-player build every town gets, so a town's drawer of looks under public/
 * would ride into every other town's player (Zob measured 355 files, 636 KB). ⭐ WHAT SHIPS IS WHAT GIT TRACKS under
 * public/: the publisher says so (scripts/publish-kit-bundle.mjs: "every file git tracks under public/"; the retired
 * legacy player's publisher shipped by the same rule). So this reads
 * `git ls-files public`, never the disk: the slab under public/baked (gitignored, published per town by
 * upload-baked-to-r2.mjs) carries the town's OWN displays, and walking it read as a false red (Zob, 2026-11-01). A town's displays live under its own
 * content root (cartograph/data/<town>/content/, served at /content/<town>/, its contentRoot) and nowhere else. So:
 *   1. public/ holds no display files: no path with a `displays` segment, and none naming a town (read from
 *      src/instances, never listed here);
 *   2. every display a town declares has its drawer under that town's own content directory, and the file is there.
 *
 * Usage: node checks/claims-a-towns-displays-are-its-own-content.mjs [--mutants]
 *   --mutants: a drawer planted under public/displays/<town>/ → (1) red; a declared drawer that is not there → (2) red;
 *   and the walk put back on the disk, with an untracked slab display file planted → red (the false red, seen).
 */
import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, relative, basename } from 'node:path'
import { ROOT } from './_scenes.mjs'

const walk = (dir) => existsSync(dir) ? readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p] }) : []
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const towns = readdirSync(join(ROOT, 'src/instances')).filter(f => f.endsWith('.js') && f !== 'registry.js').map(f => {
  const src = code(readFileSync(join(ROOT, 'src/instances', f), 'utf8'))
  const lookId = src.match(/\blookId\s*:\s*["']([^"']+)["']/)?.[1] || basename(f, '.js')
  const drawers = [...src.matchAll(/\bdrawer\s*:\s*["']([^"']+)["']/g)].map(m => m[1])
  return { file: f, lookId, drawers }
})

// What ships under public/: the files git tracks there (both publishers' rule), as paths relative to public/.
const tracked = execFileSync('git', ['ls-files', '-z', '--', 'public'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean).map(p => p.replace(/^public\//, ''))

// `extraPublic`: planted TRACKED paths · `extraUntracked`: planted paths on disk only (the slab) · `disk`: the mutant, the walk back on the disk.
function verdict({ extraPublic = [], extraUntracked = [], extraDrawer, disk = false } = {}) {
  const fails = []
  const pub = (disk ? walk(join(ROOT, 'public')).map(p => relative(join(ROOT, 'public'), p)).concat(extraUntracked) : tracked).concat(extraPublic)
  for (const rel of pub) {
    const segs = rel.split('/')
    if (segs.includes('displays')) fails.push(`public/${rel}: a display file in the kit's public/, so every town's player ships it`)
  }
  for (const t of towns) for (const d of t.drawers.concat(extraDrawer && t.drawers.length ? [extraDrawer] : [])) {
    const at = join(ROOT, 'cartograph/data', t.lookId, 'content', d)
    if (!existsSync(at)) fails.push(`${t.file} declares a drawer "${d}" that is not under its own content (cartograph/data/${t.lookId}/content/${d})`)
  }
  return fails
}

const fails = verdict()
const n = towns.reduce((k, t) => k + t.drawers.length, 0)
if (fails.length) { console.log('⛔ a town\'s display is not its own content:\n  · ' + fails.join('\n  · ')); process.exitCode = 1 }
else console.log(`✅ a town's displays are its own content: public/ holds no display files; ${n} declared drawer${n === 1 ? '' : 's'} under ${n === 1 ? 'its' : 'their'} town's own content`)

if (process.argv.includes('--mutants')) {
  const T = towns.find(t => t.drawers.length) || towns[0]
  const mutants = [
    [`a drawer under public/displays/${T.lookId}/`, { extraPublic: [`displays/${T.lookId}/x/looks.json`] }],
    ['a declared drawer that is not there', { extraDrawer: 'displays/nowhere/looks.json' }],
  ]
  let bad = 0
  for (const [name, m] of mutants) { const f = verdict(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}`); if (!f.length) bad++ }
  // The slab is not public/'s shipped content: an untracked display file under public/baked is no finding, and the walk
  // put back on the disk would call it one.
  const slab = { extraUntracked: [`baked/${T.lookId}/content/displays/x/looks.json`] }
  if (verdict(slab).length) { bad++; console.log('⛔ an untracked slab display file reads as shipped: the check is reading the disk, not git') }
  const onDisk = verdict({ ...slab, disk: true })
  console.log(`${onDisk.length ? '🔴' : '⚪ SURVIVED'} mutant: the walk back on the disk (an untracked slab display file read as shipped)`); if (!onDisk.length) bad++
  if (bad) process.exitCode = 1
}
