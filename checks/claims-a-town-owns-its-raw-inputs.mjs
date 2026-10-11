// claims-a-town-owns-its-raw-inputs.mjs — DOES ANY TOWN READ ANOTHER TOWN'S RAW INPUT?
//
// ⭐ THE INVARIANT (Jacob, 2026-10-10: "towns don't share things"): everything under a town's `raw/` lives in that town's
// own folder — no symlink, and no file that is the same file (same inode) as another town's.
//
// ⛔ WHY. Hi-Pointe–DeMun's terrain was LS's `raw/elevation.tif`, reached by a SYMLINK into LS's folder (found
// 2026-10-10, BRIEF-the-ground-knows-its-height §4). The data happened to cover HPDM — a 1°×1° USGS tile — but the
// INPUT was LS's: replace LS's tile and HPDM's ground moves, and nothing in HPDM's folder says so. That is the
// palimpsest shape `ORIENTATION` warns of (pouring one town silently rewriting another), arriving through the filesystem.
// ⭐ The check covers every raw input, not just the elevation: the class is "a town's input resolves outside the town".
//
// ⭐ MUTATION TEST: `--selftest` builds two towns in a temp dir, one with a symlink into the other and one with a hard
// link to the other's file, and must go RED on both, then GREEN with neither.
//
//   node checks/claims-a-town-owns-its-raw-inputs.mjs [--root=<data dir>] [--selftest]
// Read-only (the selftest writes only to its own temp dir). Exits 1 on any shared or linked input.
import { readdirSync, lstatSync, statSync, realpathSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, symlinkSync, linkSync, rmSync } from 'fs'
import { join, relative, sep } from 'path'
import { tmpdir } from 'os'

function audit(root) {
  const bad = [], seen = new Map()   // `${dev}:${ino}` → first path
  const towns = readdirSync(root).filter(t => !t.startsWith('.') && !t.startsWith('_') && existsSync(join(root, t, 'raw')) && statSync(join(root, t)).isDirectory())
  for (const town of towns) {
    const home = realpathSync(join(root, town))
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name), l = lstatSync(p)
        if (l.isSymbolicLink()) {
          let to = '(dangling)'; try { to = realpathSync(p) } catch {}
          bad.push(`${town}: ${relative(root, p)} is a SYMLINK → ${to.startsWith(home + sep) ? relative(root, to) + ' (inside the town, but a link)' : to}`)
          continue
        }
        if (l.isDirectory()) { walk(p); continue }
        const key = `${l.dev}:${l.ino}`
        if (seen.has(key)) bad.push(`${town}: ${relative(root, p)} is the SAME FILE as ${seen.get(key)} (a hard link)`)
        else seen.set(key, relative(root, p))
      }
    }
    walk(join(root, town, 'raw'))
  }
  return { towns, bad }
}

if (process.argv.includes('--selftest')) {
  const T = mkdtempSync(join(tmpdir(), 'raw-owns-'))
  try {
    for (const t of ['a', 'b']) mkdirSync(join(T, t, 'raw'), { recursive: true })
    writeFileSync(join(T, 'a', 'raw', 'elevation.tif'), 'x')
    const clean = audit(T)
    symlinkSync('../../a/raw/elevation.tif', join(T, 'b', 'raw', 'elevation.tif'))
    const sym = audit(T)
    rmSync(join(T, 'b', 'raw', 'elevation.tif'))
    linkSync(join(T, 'a', 'raw', 'elevation.tif'), join(T, 'b', 'raw', 'elevation.tif'))
    const hard = audit(T)
    const ok = clean.bad.length === 0 && sym.bad.length === 1 && hard.bad.length === 1
    console.log(`selftest: clean ${clean.bad.length} · symlink ${sym.bad.length} · hard link ${hard.bad.length} → ${ok ? '✅ the check goes red on both and green without them' : '⛔ the check is blind'}`)
    process.exit(ok ? 0 : 1)
  } finally { rmSync(T, { recursive: true, force: true }) }
}

const root = process.argv.find(a => a.startsWith('--root='))?.slice(7) || new URL('../cartograph/data', import.meta.url).pathname
const { towns, bad } = audit(root)
if (bad.length) {
  console.error(`⛔ ${bad.length} raw input(s) a town does not own (${towns.length} towns):`)
  for (const b of bad) console.error(`   ${b}`)
  process.exit(1)
}
console.log(`✅ every raw input of ${towns.length} towns lives in its own town's folder (${towns.join(', ')})`)
