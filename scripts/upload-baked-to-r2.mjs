#!/usr/bin/env node
/**
 * upload-baked-to-r2.mjs — push the baked slab to R2.
 *
 *   node scripts/upload-baked-to-r2.mjs --dry-run          # every look, plan only
 *   node scripts/upload-baked-to-r2.mjs --look=altadena    # one look, upload
 *   node scripts/upload-baked-to-r2.mjs                    # every look, upload
 *
 * Keys mirror the on-disk tree exactly — `public/baked/<look>/x` → `baked/<look>/x`
 * — so the runtime's `${ASSET_BASE}baked/<look>/…` join is a pure substitution and
 * pouring town #2 needs no code change and no entry in any table.
 *
 * ⛔⛔ THE EXCLUSIONS BELOW ARE LOAD-BEARING AND THIS FILE IS NOW THEIR ONLY HOME.
 * Today they are enforced by `.gitignore` (an untracked file cannot reach a deploy,
 * because the deploy is an `actions/checkout`). Once the baked tree is gitignored
 * wholesale, those per-file rules stop discriminating anything — every rule matches
 * an already-ignored path — and the decision they encode would be silently lost.
 * A naive `sync public/baked → bucket` re-uploads 353.3 MB per town that no visitor
 * ever fetches. Measured:
 *   find public/baked -name '*-lod0.glb' -exec stat -f%z {} + | awk '{s+=$1} END{printf "%.1f MB / %d files\n", s/1048576, NR}'
 *
 * ⛔ NO FALLBACK. A failed put is a hard, non-zero exit naming the key. A partially
 * uploaded slab that reports success is the worst outcome available here: the map
 * renders and the canopy does not, and nobody is told (`CLAUDE.md` Layer 0, q2).
 */
import { readdirSync, statSync } from 'node:fs'
import { join, relative, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const BAKED_ROOT = join(REPO_ROOT, 'public/baked')

/** The bucket. Override with R2_BUCKET for a staging/scratch bucket. */
const BUCKET = process.env.R2_BUCKET || 'theward-assets'

/**
 * Files that are PRODUCED by the bake but deliberately NOT PUBLISHED.
 * Each entry names the rule it inherits and why — do not add one without both.
 */
const EXCLUDE = [
  {
    // .gitignore:280-288. `InstancedTrees#lodForRole` can return ONLY lod1/lod1far;
    // the camera-distance LOD swap was retired under role-at-bake, so lod0 is never
    // requested. 353.3 MB on LS alone; at 100 towns, ~20 GB nobody fetches.
    test: (p) => /-lod0\.glb$/.test(p),
    why: '.gitignore:287 — lod0 is never requested by the runtime',
  },
  {
    // .gitignore:242. Diagnostic atlas contact sheets for the operator's eye.
    test: (p) => /\/trees-atlas-[^/]*-viz\.png$/.test(p),
    why: '.gitignore:242 — atlas viz sheets are a diagnostic, not payload',
  },
]

const MIME = {
  '.json': 'application/json', '.bin': 'application/octet-stream',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ktx2': 'image/ktx2',
  '.svg': 'image/svg+xml', '.txt': 'text/plain',
}

/**
 * ⚠️ Cache-Control is deliberately SHORT, and must stay short until every baked URL
 * carries a version token. 38.3 MB of the LS slab carries none in a production build
 * — both atlas PNGs, all 360 KTX2 impostor pages, terrain/ground maps — because
 * `bakeLastMs` is an authoring prop, undefined in prod. `immutable` on those pins a
 * stale canopy at a URL nothing can change. R2 serves ETags, so this costs
 * revalidations, not re-downloads. See plans/r2-asset-offload.md §3.5.
 */
const CACHE_CONTROL = 'public, max-age=300, must-revalidate'

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = join(dir, e.name)
  return e.isDirectory() ? walk(p) : e.isFile() ? [p] : []
})

function plan({ look }) {
  let looks
  try {
    looks = readdirSync(BAKED_ROOT, { withFileTypes: true })
      .filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    throw new Error(`no baked tree at ${BAKED_ROOT} — nothing to upload`)
  }
  if (look) {
    if (!looks.includes(look)) throw new Error(`no such look "${look}" — have: ${looks.join(', ')}`)
    looks = [look]
  }
  if (!looks.length) throw new Error('public/baked/ has no looks in it — refusing to "succeed" at uploading nothing')

  const files = [], skipped = []
  for (const l of looks) {
    for (const abs of walk(join(BAKED_ROOT, l))) {
      const rel = relative(REPO_ROOT, abs).split('\\').join('/')   // public/baked/<look>/…
      const key = rel.replace(/^public\//, '')                     // baked/<look>/…
      const ex = EXCLUDE.find((e) => e.test('/' + key))
      if (ex) { skipped.push({ key, bytes: statSync(abs).size, why: ex.why }); continue }
      files.push({ abs, key, bytes: statSync(abs).size })
    }
  }
  return { looks, files, skipped }
}

const mb = (b) => (b / 1048576).toFixed(1) + ' MB'

async function put({ abs, key }) {
  const args = ['wrangler', 'r2', 'object', 'put', `${BUCKET}/${key}`,
    '--file', abs, '--remote',
    '--content-type', MIME[extname(key).toLowerCase()] || 'application/octet-stream',
    '--cache-control', CACHE_CONTROL]
  await execFileAsync('npx', args, { cwd: REPO_ROOT, maxBuffer: 1 << 24 })
}

async function main() {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes('--dry-run')
  const look = argv.find((a) => a.startsWith('--look='))?.split('=')[1]
  const conc = Number(argv.find((a) => a.startsWith('--concurrency='))?.split('=')[1] || 8)

  const { looks, files, skipped } = plan({ look })
  const total = files.reduce((s, f) => s + f.bytes, 0)
  const skipBytes = skipped.reduce((s, f) => s + f.bytes, 0)

  console.log(`bucket   ${BUCKET}`)
  console.log(`looks    ${looks.join(', ')}`)
  console.log(`upload   ${files.length} files, ${mb(total)}`)
  console.log(`skip     ${skipped.length} files, ${mb(skipBytes)} (not published — by rule, see EXCLUDE)`)
  for (const e of EXCLUDE) {
    const n = skipped.filter((s) => s.why === e.why)
    if (n.length) console.log(`           ${n.length} × ${e.why} — ${mb(n.reduce((s, f) => s + f.bytes, 0))}`)
  }
  console.log(`cache    ${CACHE_CONTROL}`)

  if (dryRun) { console.log('\n--dry-run: nothing uploaded.'); return }

  let done = 0
  const failures = []
  const queue = [...files]
  await Promise.all(Array.from({ length: Math.max(1, conc) }, async () => {
    for (let f = queue.pop(); f; f = queue.pop()) {
      try { await put(f) } catch (err) { failures.push({ key: f.key, err: err.stderr || err.message }) }
      if (++done % 50 === 0 || done === files.length) {
        process.stdout.write(`\r  ${done}/${files.length}`)
      }
    }
  }))
  process.stdout.write('\n')

  // ⛔ Loud. A partial slab must never exit 0.
  if (failures.length) {
    console.error(`\n⛔ ${failures.length} of ${files.length} objects FAILED — the slab in R2 is INCOMPLETE.`)
    for (const f of failures.slice(0, 20)) console.error(`   ${f.key}\n     ${String(f.err).trim().split('\n')[0]}`)
    if (failures.length > 20) console.error(`   …and ${failures.length - 20} more`)
    process.exit(1)
  }
  console.log(`\n✅ ${files.length} objects, ${mb(total)} → ${BUCKET}`)
}

main().catch((err) => { console.error(`⛔ ${err.message}`); process.exit(1) })
