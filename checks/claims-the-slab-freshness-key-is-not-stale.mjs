/**
 * NO SLAB ARTIFACT MAY BE NEWER THAN THE KEY THAT BUSTS IT.
 *
 * ⛔ THE DEFECT (Jacob, 2026-08-28: "everything shows in the Stage, disappears on the
 * Preview"). `scene.json#bakedAt` is the cache-bust key for the WHOLE slab — every cold
 * consumer appends it to every fetch:
 *     const cacheBust = bakeLastMs ?? scene?.bakedAt ?? null      // InstancedTrees, BakedGround
 *     fetch(url + '?t=' + cacheBust)
 * But it was written ONLY by `bake-scene.js`, i.e. only when the `scene` step was dirty. A
 * pour that rewrote ground and trees and skipped `scene` left the key PINNED, so browsers
 * kept serving the previous slab from cache under a URL that never changed — permanently,
 * through any number of reloads and re-bakes.
 *
 * ⭐ WHY IT LOOKED LIKE "PREVIEW IS BROKEN". Stage passes an explicit `bakeLastMs` and is
 * immune. Preview and PRODUCTION fall back to this field. So the operator sees a correct
 * map everywhere they author and a wrong one at the publish gate — and the bake, which
 * stamped the looks index on the very next line, knew all along.
 *
 * ⭐ WHY THIS IS THE CHECK. It compares mtimes against one number. No thresholds, no
 * look-specific knowledge, no operator who has already looked at the map: if a pour ever
 * again advances an artifact without advancing the key, this fails in every town, loudly,
 * BEFORE the slab is published.
 *
 * ⚠️ WHAT THIS CHECK CAN AND CANNOT SEE. It compares mtimes, which is the only freshness
 * signal the slab carries — there is no content hash. A `git checkout` rewrites mtimes, so a
 * fresh clone (or a branch switch that touches baked files) will report stale keys that are
 * not really stale. ⛔ Do NOT "fix" that by loosening the comparison: the failure mode this
 * guards is invisible and permanent, and a false alarm costs one re-bake. Re-bake and re-run;
 * if it still fails, it is real.
 *
 *   node scratch/claims-the-slab-freshness-key-is-not-stale.mjs [look ...]
 */
import { readdirSync, existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..')
const BAKED = path.join(ROOT, 'public/baked')

// ⛔ READ the consumers' rule rather than restating it — if the fallback chain moves, this
// check is modelling something that no longer exists and must say so instead of passing.
const CONSUMERS = [
  'src/components/InstancedTrees.jsx',
  'src/components/BakedGround.jsx',
]
const RULE = /cacheBust\s*=\s*bakeLastMs\s*\?\?\s*scene\?\.bakedAt\s*\?\?\s*null/
const drifted = CONSUMERS.filter(f => !RULE.test(readFileSync(path.join(ROOT, f), 'utf8')))
if (drifted.length) {
  console.error(`⛔ PIN DRIFT — the cache-bust rule this check models has moved:`)
  for (const f of drifted) console.error(`     · ${f} no longer reads \`bakeLastMs ?? scene?.bakedAt ?? null\``)
  process.exit(2)
}

const looks = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(BAKED).filter(d => existsSync(path.join(BAKED, d, 'scene.json')))

let failed = 0
console.log(`No slab artifact may be newer than the key that busts it — ${looks.length} look(s)\n`)

for (const look of looks) {
  const dir = path.join(BAKED, look)
  const scenePath = path.join(dir, 'scene.json')
  const bakedAt = JSON.parse(readFileSync(scenePath, 'utf8')).bakedAt
  if (bakedAt == null) {
    failed++
    console.error(`  ⛔ ${look.padEnd(24)} scene.json has NO bakedAt — cacheBust resolves to null and every ` +
      `cold consumer SKIPS ITS FETCH ENTIRELY (\`if (cacheBust == null) return\`). Nothing renders.`)
    continue
  }

  // Every artifact the key busts. Directories are walked; the slab is flat plus trees/.
  const stale = []
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) { walk(p); continue }
      const mt = statSync(p).mtimeMs
      if (mt > bakedAt + 1000) stale.push([path.relative(dir, p), mt])
    }
  }
  walk(dir)

  if (!stale.length) {
    console.log(`  ✅ ${look.padEnd(24)} key ${new Date(bakedAt).toISOString()} is at or ahead of every artifact`)
    continue
  }
  failed++
  stale.sort((a, b) => b[1] - a[1])
  console.error(`  ⛔ ${look.padEnd(24)} ${stale.length} artifact(s) NEWER than the cache-bust key ` +
    `(${new Date(bakedAt).toISOString()}) — cold consumers (Preview, production) will serve the ` +
    `PREVIOUS slab from cache, and no reload dislodges it:`)
  for (const [rel, mt] of stale.slice(0, 8)) {
    console.error(`       ${new Date(mt).toISOString()}  ${rel}`)
  }
  if (stale.length > 8) console.error(`       … and ${stale.length - 8} more (not truncated silently: that is the count)`)
  console.error(`       fix: re-bake this look — the pour now stamps scene.json#bakedAt unconditionally.`)
}

console.log()
if (failed) { console.error(`⛔ ${failed} look(s) publish behind a stale cache-bust key.`); process.exit(1) }
console.log(`✅ every look's freshness key is ahead of its artifacts.`)
