// hero-tiers-ab.mjs — C4's proof: arborist/bake-trees.js#classifyHeroTiers gives the same tiers and meta before the
// frustum moved to src/preview/heroFrustum.js (09283ca9) and after, on every town's baked hero path, over each town's own
// placed trees (canopy R and centre from a hash of the index, so occlusion is exercised). ▶ node scratch/far-shore/hero-tiers-ab.mjs
import { readFileSync, writeFileSync, unlinkSync, readdirSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
const withExport = (src) => src + '\nexport { classifyHeroTiers as __classify }\n'
const write = (name, src) => { const p = `arborist/${name}`; writeFileSync(p, withExport(src)); return p }
const pNew = write('.ab-new.mjs', readFileSync('arborist/bake-trees.js', 'utf8'))
const pOld = write('.ab-old.mjs', execSync('git show 09283ca9:arborist/bake-trees.js', { encoding: 'utf8', maxBuffer: 1e8 }))
try {
  const N = (await import(pathToFileURL(pNew).href)).__classify, O = (await import(pathToFileURL(pOld).href)).__classify
  let towns = 0, bad = 0
  for (const t of readdirSync('public/baked')) {
    const sp = `public/baked/${t}/scene.json`, tp = `public/baked/${t}/trees.json`
    if (!existsSync(sp) || !existsSync(tp)) continue
    const s = JSON.parse(readFileSync(sp, 'utf8')); if (!s.heroKeyframes?.length) continue
    const inst = JSON.parse(readFileSync(tp, 'utf8')).instances || []
    const h = (i, k) => ((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1
    const canopies = inst.map((c, i) => ({ x: c.x, z: c.z, centerY: 4 + 10 * h(i, 1), R: 2 + 6 * h(i, 2) }))
    const pan = { keyframes: s.heroKeyframes, motion: s.heroMotion }
    const a = O(canopies, pan), b = N(canopies, pan); towns++
    const same = JSON.stringify(a) === JSON.stringify(b)
    if (!same) bad++
    console.log(`  ${same ? '✅' : '⛔'} ${t}: ${canopies.length} canopies · mesh ${b.meta.mesh} / cull ${b.meta.cull} · tiers and meta ${same ? 'identical' : 'DIFFER'}`)
  }
  console.log(towns && !bad ? `✅ ${towns} towns identical` : `⛔ ${bad} of ${towns} differ`)
  process.exitCode = towns && !bad ? 0 : 1
} finally { unlinkSync(pNew); unlinkSync(pOld) }
