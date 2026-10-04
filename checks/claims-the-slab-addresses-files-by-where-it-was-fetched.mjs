#!/usr/bin/env node
/**
 * claims-the-slab-addresses-files-by-where-it-was-fetched — every slab file is named from the look it was fetched
 * under, never from the `look` stamped inside a slab JSON; and a stamp that disagrees is refused, loudly.
 *
 * ⛔ THE CLASS: `slabFetch(m.look, m.bin)` — a file's address read off the file before it. A slab folder moved or
 * copied to a new name keeps its old stamp, so its files are fetched from the OLD folder (or 404) while the page
 * says it drew the new town. HPDM, 2026-10-04: its slab moved to `hipointedemun`, and BakedGround / SlabBuildings
 * broke until it was re-baked, with nothing naming why.
 *
 * READS THE SOURCE: every call to the slab resolver in src/ (`slabUrl` · `slabFetch` · `suspendSlabUrl`) is found and
 * its look argument read; one that is a `.look` member is the defect. Then `slabUrl.js#slabStamped` is run: it must
 * return a matching JSON and throw on a mismatched or missing stamp.
 *
 * Run: node checks/claims-the-slab-addresses-files-by-where-it-was-fetched.mjs   (exit 1 on a defect or a blind check)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createServer } from 'vite'

const ROOT = new URL('..', import.meta.url).pathname
const SRC = join(ROOT, 'src')
const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(jsx?|mjs)$/.test(e)) out.push(p)
  }
  return out
}
// Comments blanked (not deleted) so prose that quotes the defect is not read as code.
const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length))

const fails = []
let calls = 0
for (const f of walk(SRC)) {
  if (f.endsWith('/lib/slabUrl.js')) continue                       // the resolver's own definitions
  const src = strip(readFileSync(f, 'utf8'))
  const re = /\b(slabUrl|slabFetch|suspendSlabUrl)\s*\(\s*([^,)]*)/g
  let m
  while ((m = re.exec(src)) !== null) {
    calls++
    if (/\.look\b/.test(m[2])) {
      const line = src.slice(0, m.index).split('\n').length
      fails.push(`${relative(ROOT, f)}:${line}  ${m[1]}(${m[2].trim()}, …) — addressed by a slab's stamp, not by where it was fetched`)
    }
  }
}

const vite = await createServer({ root: ROOT, server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } })
try {
  const { slabStamped } = await vite.ssrLoadModule('/src/lib/slabUrl.js')
  const json = { look: 'town-a' }
  if (slabStamped('town-a', json, 'ground.json') !== json) fails.push('slabStamped does not return the JSON whose stamp matches')
  for (const [why, j] of [['another town', { look: 'town-b' }], ['no stamp', {}], ['no JSON', null]]) {
    let threw = false
    try { slabStamped('town-a', j, 'ground.json') } catch { threw = true }
    if (!threw) fails.push(`slabStamped accepts a slab with ${why} under "town-a"`)
  }
} catch (e) {
  console.error(`⛔ could not run: ${e.message}`)
  process.exit(2)
}

console.log(`${calls} slab-resolver call(s) read`)
if (calls === 0) { console.error('⛔ BLIND: found no slab-resolver calls — the resolver was renamed; re-aim this check'); process.exit(1) }
if (fails.length) {
  console.error(`\n⛔ (${fails.length}):`)
  for (const f of fails) console.error(`   ${f}`)
  process.exit(1)
}
console.log('\n✅ every slab file is addressed by the look it was fetched under, and a mismatched stamp is refused')
process.exit(0)   // the SSR server keeps handles open
