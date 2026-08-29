#!/usr/bin/env node
/**
 * claims-every-declared-page-ships — a page the manifest DECLARES must reach the
 * deploy, and the deploy is an `actions/checkout`.
 *
 * ⭐ THE CLASS, which has now bitten twice in two days on two different mechanisms:
 *   • 2026-08-29 `a3b258b6` — six `maple_silver` pages were declared and UNTRACKED.
 *   • 2026-08-29 (this)     — the KTX2 pool was declared and GITIGNORED.
 * Both are the same defect wearing different clothes: the file is on the operator's
 * disk, so every local surface renders and every eye-gate passes, and the deployed
 * canopy is full of holes. ⛔ EXISTS-ON-DISK IS NOT THE TEST. Shipping is.
 *
 * ⛔ It fails LOUDLY per look and names the pages, because the runtime's own failure
 * here is a blank layer — `impostorTexture.js` reports a dead page and leaves it
 * empty, which reads as "thin canopy", not as "broken".
 *
 * ⭐ Nothing here is enumerated. The look list is the filesystem, the page list is
 * whatever each manifest declares, and the loader's branch rule is READ OUT OF
 * `impostorTexture.js` — so a look nobody has looked at is covered on its first pour,
 * and the check cannot go green off a rule that has since moved.
 *
 *   node scratch/claims-every-declared-page-ships.mjs
 *   exit 0 = every declared page ships · exit 2 = drift
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..')
const BAKED = path.join(ROOT, 'public/baked')

// ── The rule this check models, read from the source rather than restated. ────
// `impostorTexture.js` decides its loader on the page EXTENSION. If that ever stops
// being true, every VRAM number below is measuring the wrong thing, so pin it.
const LOADER_SRC = readFileSync(path.join(ROOT, 'src/components/impostorTexture.js'), 'utf8')
if (!/\/\\\.ktx2\(\$\|\\\?\)\/i\.test\(url\)/.test(LOADER_SRC.replace(/\s+/g, ''))
    && !/ktx2[($|\\?)]*\/i\.test\(url\)/.test(LOADER_SRC)) {
  console.error('⛔ PIN BROKEN — impostorTexture.js no longer branches on a .ktx2 extension.')
  console.error('   This check assumes the manifest extension picks the loader. Re-read it before trusting any result below.')
  process.exit(2)
}

// Bytes-per-pixel once resident. PNG is a FILE format: it decompresses to raw RGBA
// on upload. A transcoded page lands in a 4×4 block format and stays there.
const BPP = { '.png': 4, '.ktx2': 1 }
const MIP = 1.333   // the full chain

function pngDims(p) {
  const b = readFileSync(p, { start: 0, end: 32 })
  if (b.slice(1, 4).toString() !== 'PNG') return null
  return [b.readUInt32BE(16), b.readUInt32BE(20)]
}

// Everything git will hand a deploy. A declared page outside this set does not ship,
// whether it is ignored, untracked, or simply never added.
const tracked = new Set(
  execFileSync('git', ['ls-files', '--', 'public/baked'], { cwd: ROOT, maxBuffer: 64 << 20 })
    .toString().split('\n').filter(Boolean),
)

function* declaredPages(m) {
  for (const rec of Object.values(m.heroImpostorBySpecies || {})) for (const l of rec.layers || []) { yield l.albedo; yield l.ao }
  for (const rec of Object.values(m.overheadBySpecies || {})) for (const b of rec.bands || []) { yield b.albedo; yield b.ao }
}

const looks = readdirSync(BAKED).filter(d => statSync(path.join(BAKED, d)).isDirectory()).sort()
let failed = 0
console.log('A page the manifest declares must reach the deploy\n')

for (const look of looks) {
  const atlasPath = path.join(BAKED, look, 'trees-atlas.json')
  if (!existsSync(atlasPath)) continue
  let m
  try { m = JSON.parse(readFileSync(atlasPath, 'utf8')) }
  catch (e) { console.log(`  ⛔ ${look.padEnd(24)} trees-atlas.json is unreadable — ${e.message}`); failed++; continue }

  const pages = [...new Set([...declaredPages(m)].filter(Boolean))]
  if (!pages.length) { console.log(`  ·  ${look.padEnd(24)} declares no impostor pages`); continue }

  const gone = [], wontShip = []
  let vram = 0, byExt = {}
  for (const url of pages) {
    const rel = path.join('public/baked', look, url.replace(/^\//, ''))
    const abs = path.join(ROOT, rel)
    const ext = path.extname(url).toLowerCase()
    byExt[ext] = (byExt[ext] || 0) + 1
    if (!existsSync(abs)) { gone.push(url); continue }
    if (!tracked.has(rel)) wontShip.push(url)
    // A .ktx2 keeps its own dimensions in its header; the PNG it was made from is
    // the honest source for pixel count and is still on disk beside it.
    const png = ext === '.ktx2' ? abs.replace(/\.ktx2$/i, '.png') : abs
    const d = existsSync(png) ? pngDims(png) : null
    if (d) vram += d[0] * d[1] * (BPP[ext] ?? 4) * MIP
  }

  const mb = (vram / 1e6).toFixed(0)
  const mix = Object.entries(byExt).map(([e, n]) => `${n}${e}`).join(' + ')
  if (gone.length || wontShip.length) {
    failed++
    console.log(`  ⛔ ${look.padEnd(24)} ${pages.length} declared (${mix}) — ${mb} MB resident`)
    if (gone.length) {
      console.log(`       ${gone.length} declared page(s) MISSING ON DISK — the manifest points at nothing:`)
      for (const u of gone.slice(0, 6)) console.log(`         ${u}`)
      if (gone.length > 6) console.log(`         … and ${gone.length - 6} more (not truncated silently: that is the count)`)
    }
    if (wontShip.length) {
      console.log(`       ${wontShip.length} declared page(s) ON DISK BUT NOT IN GIT — they 404 on every deployed build,`)
      console.log(`       and every local surface renders them, which is why this survives an eye-gate:`)
      for (const u of wontShip.slice(0, 6)) console.log(`         ${u}`)
      if (wontShip.length > 6) console.log(`         … and ${wontShip.length - 6} more (not truncated silently: that is the count)`)
      console.log(`       ▶ git add public/baked/${look}/trees — and check .gitignore is not the reason`)
    }
  } else {
    console.log(`  ✅ ${look.padEnd(24)} ${pages.length} declared (${mix}) — all ship — ${mb} MB resident`)
  }

  // Not a failure: PNG is a first-class branch and a look that has never been packed
  // legitimately declares it. But the cost is the difference between an embed that
  // runs on a phone and one the browser kills, so it may not go unsaid.
  if (byExt['.png']) {
    const asKtx = (vram - (vram * 0)) // recompute honestly below
    let heavy = 0
    for (const url of pages) {
      if (path.extname(url).toLowerCase() !== '.png') continue
      const abs = path.join(ROOT, 'public/baked', look, url.replace(/^\//, ''))
      const d = existsSync(abs) ? pngDims(abs) : null
      if (d) heavy += d[0] * d[1] * 3 * MIP   // the 4 bytes it costs now vs the 1 it would
    }
    console.log(`     ⭐ ${byExt['.png']} page(s) still PNG — ${(heavy / 1e6).toFixed(0)} MB of resident memory that`)
    console.log(`        transcoding would return.  ▶ node arborist/pack-impostor-ktx2.mjs --look=${look}`)
    void asKtx
  }
}

// ── The same class, wearing geometry ─────────────────────────────────────────
// ⛔ A PAGE-ONLY CHECK LIES BY OMISSION, and it lied the first time it was run: it
// printed "all ship" for lafayette-square while four `quercus_alba` GLBs the Grove
// resolves sat untracked. Identical defect — declared, on disk, absent from the
// deploy — so it belongs in the same instrument, not a second one nobody runs.
// ⛔ lod0 is EXCLUDED BY DESIGN (.gitignore) and `bakedGlbUrl` defaults to lod1; the
// exclusion is named here rather than silently skipped, because a quiet skip is how
// the diorama shipped blank on 2026-08-28.
console.log('\nThe same rule, for the geometry a look declares  (lod0 excluded by design — it is not published)\n')

for (const look of looks) {
  const dir = path.join(BAKED, look)
  const atlasPath = path.join(dir, 'trees-atlas.json')
  const treesPath = path.join(dir, 'trees.json')
  if (!existsSync(atlasPath)) continue

  const want = new Set()
  if (existsSync(treesPath)) {
    try {
      const t = JSON.parse(readFileSync(treesPath, 'utf8'))
      for (const i of t.instances || []) {
        if (i.url) want.add(i.url)
        for (const u of Object.values(i.lods || {})) want.add(u)
      }
    } catch { /* an unreadable slab is the freshness check's business, not this one */ }
  }
  // Every species the Grove will try to render a baked specimen for — the surface
  // that turns one missing file into "the Grove is broken".
  // ⛔ THE SPECIES IS THE KEY, NOT A FIELD. `overheadBySpecies[sp]` carries
  // {heightM, canopyRadiusM, captureKey, bands} and NO `species` — reading `rec.species`
  // here covered exactly nothing and printed ✅ over the four untracked `quercus_alba`
  // GLBs that prompted this section. Read the key.
  // ⛔ And do not GUESS the variant id: the Grove resolves whichever variant a tile
  // holds (`quercus_alba` ships skeleton-1 and skeleton-2). Take what the species
  // directory actually contains, so a second variant cannot slip through unchecked.
  try {
    const m = JSON.parse(readFileSync(atlasPath, 'utf8'))
    const declaredSpecies = new Set([
      ...Object.keys(m.overheadBySpecies || {}),
      ...Object.keys(m.heroImpostorBySpecies || {}),
    ])
    for (const sp of declaredSpecies) {
      const spDir = path.join(dir, 'trees', sp)
      if (!existsSync(spDir)) continue
      for (const f of readdirSync(spDir)) if (f.endsWith('.glb')) want.add(`/trees/${sp}/${f}`)
    }
  } catch { /* reported above */ }

  const refs = [...want].filter(u => u && !/-lod0\.glb$/i.test(u))
  if (!refs.length) { continue }
  const gone = [], wontShip = []
  for (const url of refs) {
    const rel = path.join('public/baked', look, url.replace(/^\//, ''))
    if (!existsSync(path.join(ROOT, rel))) gone.push(url)
    else if (!tracked.has(rel)) wontShip.push(url)
  }
  if (gone.length || wontShip.length) {
    failed++
    console.log(`  ⛔ ${look.padEnd(24)} ${refs.length} referenced`)
    for (const [label, list] of [['MISSING ON DISK', gone], ['ON DISK BUT NOT IN GIT — 404 on every deployed build', wontShip]]) {
      if (!list.length) continue
      console.log(`       ${list.length} ${label}:`)
      for (const u of list.slice(0, 6)) console.log(`         ${u}`)
      if (list.length > 6) console.log(`         … and ${list.length - 6} more (not truncated silently: that is the count)`)
    }
  } else {
    console.log(`  ✅ ${look.padEnd(24)} ${refs.length} referenced — all ship`)
  }
}

console.log()
if (failed) {
  console.log(`⛔ ${failed} look(s) declare something the deploy cannot serve.`)
  process.exit(2)
}
console.log('✅ every declared page and referenced GLB exists and is tracked — the deploy can serve all of them.')
