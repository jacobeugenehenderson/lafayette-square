#!/usr/bin/env node
/**
 * claims-the-wind-field-extent-is-the-towns — the wind sheet covers the scene's OWN disc (the stencil), or a NAMED
 * specimen extent, at a resolution that is a per-surface rung; never a constant size (CLAUDE.md Layer 0, Class D:
 * the shadow frustum shipped ±900 — LS's radius — and every bigger town lost its shadows past it).
 *
 * READS THE SOURCE, then RUNS it:
 *   · WindSheet.jsx sizes its render targets from windSheetLayout's `size` only (no literal), and its extent is the
 *     stencil (onSceneStencil) or the `extent` prop; Town mounts it with extent="town".
 *   · every quality profile carries windTexelsPerCorrelation (the rung).
 *   · windSheetLayout is RUN: the size follows the radius (two towns, two sizes, in proportion), the disc's centre
 *     moves the origin, and a missing extent or rung THROWS.
 * Mutation-tested 2026-10-04: hard-coding `span = 1800` in windSheetLayout → red ("does not follow the radius");
 * `new THREE.WebGLRenderTarget(512, 512` in WindSheet.jsx → red.
 *
 * Run: node checks/claims-the-wind-field-extent-is-the-towns.mjs   (exit 1 on a defect or a blind check)
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createServer } from 'vite'

const ROOT = new URL('..', import.meta.url).pathname
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const read = (p) => strip(readFileSync(join(ROOT, p), 'utf8'))
const fails = []

const sheet = read('src/components/WindSheet.jsx')
const rts = sheet.match(/new THREE\.WebGLRenderTarget\(([^,]+),\s*([^,]+),/g) || []
if (!rts.length) fails.push('WindSheet.jsx allocates no render target — re-aim this check')
for (const r of rts) if (!/\(\s*L\.size\s*,\s*L\.size\s*,/.test(r)) fails.push(`WindSheet.jsx sizes a render target with something other than windSheetLayout's size: ${r}`)
if (!/windSheetLayout\(\s*extentRef\.current\s*,\s*quality\.windTexelsPerCorrelation/.test(sheet)) fails.push('WindSheet.jsx does not size the sheet from its extent and the quality rung (windSheetLayout(extentRef.current, quality.windTexelsPerCorrelation, …))')
if (!/onSceneStencil\(/.test(sheet)) fails.push('WindSheet.jsx does not read the town\'s stencil (onSceneStencil)')
const assigns = sheet.match(/extentRef\.current\s*=\s*[^\n;]+/g) || []
for (const a of assigns) if (!/=\s*s\s*$/.test(a.trim())) fails.push(`WindSheet.jsx sets its extent from something other than the stencil callback: ${a.trim()}`)
if (!/useRef\(\s*extent === 'town' \? null : extent\s*\)/.test(sheet)) fails.push('WindSheet.jsx\'s extent does not start as the named prop (or null for a town)')
if (!/<WindSheet extent="town"\s*\/>/.test(read('src/components/Town.jsx'))) fails.push('Town.jsx does not mount <WindSheet extent="town" />')
const qp = read('src/lib/qualityProfile.js')
const profiles = (qp.match(/\bid:\s*'[^']+'/g) || []).length
const rungs = (qp.match(/windTexelsPerCorrelation:\s*\d+/g) || []).length
if (!profiles) fails.push('qualityProfile.js has no profiles — re-aim this check')
else if (rungs !== profiles) fails.push(`qualityProfile.js: ${rungs} of ${profiles} profiles carry windTexelsPerCorrelation`)

const vite = await createServer({ root: ROOT, server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } })
try {
  const { windSheetLayout, WIND_CORRELATION_M } = await vite.ssrLoadModule('/src/lib/windSheet.js')
  const rung = 12, m = WIND_CORRELATION_M / rung
  const a = windSheetLayout({ center: [0, 0], radius: 892 }, rung)
  const b = windSheetLayout({ center: [0, 0], radius: 2400 }, rung)
  const want = (r) => Math.ceil((2 * r + 2 * m) / m)
  if (a.size !== want(892) || b.size !== want(2400)) fails.push(`windSheetLayout does not follow the radius: 892 m → ${a.size}² (want ${want(892)}), 2400 m → ${b.size}² (want ${want(2400)})`)
  if (Math.abs(a.mPerTexel - m) > 1e-9) fails.push(`windSheetLayout's m/texel ${a.mPerTexel} is not the correlation length over the rung (${m})`)
  const c = windSheetLayout({ center: [500, -300], radius: 892 }, rung)
  if (Math.abs(c.origin[0] - a.origin[0] - 500) > 1e-6 || Math.abs(c.origin[1] - a.origin[1] + 300) > 1e-6) fails.push('windSheetLayout ignores the disc\'s centre')
  for (const [what, call] of [['no extent', () => windSheetLayout(null, rung)], ['no rung', () => windSheetLayout({ center: [0, 0], radius: 892 }, undefined)],
    ['over the device limit', () => windSheetLayout({ center: [0, 0], radius: 892 }, rung, 64)]]) {
    let threw = false
    try { call() } catch { threw = true }
    if (!threw) fails.push(`windSheetLayout with ${what} returned a layout — it must throw (no default size)`)
  }
  console.log(`  LS-sized disc (892 m) → ${a.size}² at ${a.mPerTexel.toFixed(2)} m/texel · a 2400 m disc → ${b.size}²`)
} catch (e) {
  console.error(`⛔ could not run: ${e.message}`)
  process.exit(2)
}

if (fails.length) {
  console.error(`\n⛔ (${fails.length}):`)
  for (const f of fails) console.error(`   ${f}`)
  process.exit(1)
}
console.log('\n✅ the wind sheet covers the town\'s own disc (or a named specimen extent), sized by the surface\'s rung')
process.exit(0)   // the SSR server keeps handles open
