#!/usr/bin/env node
/**
 * claims-preview-phone-runs-production-passes — Preview mounts, for every tier, the post-FX passes production mounts
 * for that tier's profile. Its toggles can only take a pass OUT.
 *
 * ⛔ THE CLASS: an inspection surface that measures something the target never ships. Until 2026-10-04 Preview's
 * `inspect` installed the whole desktop pipeline on every tier (9 passes) while a production phone ran 3, and it
 * ignored the gates (the hero ladder mounted with DoF off). Every Preview phone number described a desktop render.
 *
 * READS THE SOURCE: asks `renderPipeline.jsx#mountedPasses` (the one function the installer uses) for every surface of
 * every town's deployment (`cartograph/data/<map>/deployment.json`, laid on the profile by `qualityProfile.js#surfaceQuality`;
 * inclusion is the profile's `includesPass`), plus a town with none (`{ authored: false }`), under Preview's own default toggles (`PreviewApp.jsx#DEFAULT_LAYERS`, parsed, not
 * copied), against the same call with no inspection, with the DoF gate both ways. A toggle-OFF must remove only that
 * pass (and a resource nothing mounted reads).
 *
 * Run: node checks/claims-preview-phone-runs-production-passes.mjs   (exit 1 on a mismatch or a blind check)
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createServer } from 'vite'

const ROOT = new URL('..', import.meta.url).pathname
const vite = await createServer({ root: ROOT, server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } })
const fails = []
let compared = 0
try {
  const { mountedPasses, POSTFX_PIPELINE } = await vite.ssrLoadModule('/src/components/renderPipeline.jsx')
  const { surfaceQuality } = await vite.ssrLoadModule('/src/lib/qualityProfile.js')
  const { SURFACES, readDeployment } = await vite.ssrLoadModule('/src/lib/deployment.js')
  const { readdirSync, existsSync } = await import('node:fs')
  const towns = readdirSync(join(ROOT, 'cartograph/data')).filter((t) => existsSync(join(ROOT, 'cartograph/data', t, 'deployment.json')))
  const deployments = [['(none authored)', { authored: false }],
    ...towns.map((t) => [t, readDeployment(JSON.parse(readFileSync(join(ROOT, 'cartograph/data', t, 'deployment.json'), 'utf8')), t)])]

  // Preview's own "all on": the DEFAULT_LAYERS literal, evaluated as written.
  const src = readFileSync(join(ROOT, 'src/preview/PreviewApp.jsx'), 'utf8')
  const lit = src.match(/const\s+DEFAULT_LAYERS\s*=\s*(\{[\s\S]*?\n\})/)
  if (!lit) throw new Error('PreviewApp.jsx has no DEFAULT_LAYERS literal — cannot read Preview\'s default toggles')
  const toggles = Function(`return (${lit[1]})`)()

  const ids = (list) => list.map((e) => e.id).join(',')
  const profiles = deployments.flatMap(([t, d]) => SURFACES.map((s) => ({ ...surfaceQuality(s, d), id: `${t}/${s}` })))
  if (!profiles.length || !POSTFX_PIPELINE.length) throw new Error('no profiles or no passes — nothing to compare')

  // The profile's switches name real passes — a misspelt id would silently keep a pass on.
  const known = new Set(POSTFX_PIPELINE.map((e) => e.id))
  for (const q of profiles) for (const id of q.postFxOff || []) if (!known.has(id)) fails.push(`${q.id}: postFxOff names "${id}", which is no pass in POSTFX_PIPELINE`)

  for (const q of profiles) {
    for (const dofOn of [true, false]) {
      const ships = mountedPasses({ quality: q, dofOn })
      const preview = mountedPasses({ quality: q, dofOn, inspect: { toggles } })
      compared++
      if (ids(ships) !== ids(preview)) fails.push(`${q.id} (dof ${dofOn ? 'on' : 'off'}): production mounts [${ids(ships)}], Preview's defaults mount [${ids(preview)}]`)
      else console.log(`   ${q.id.padEnd(30)} dof ${dofOn ? 'on ' : 'off'}: ${ships.length} passes [${ids(ships)}]`)

      // Every toggle can only remove: OFF never adds a pass, and never removes one the toggle doesn't own.
      for (const e of ships) {
        const off = mountedPasses({ quality: q, dofOn, inspect: { toggles: { ...toggles, [e.id]: false } } })
        const added = off.filter((x) => !ships.includes(x))
        const lost = ships.filter((x) => !off.includes(x) && x !== e && !x.dependsOn)
        compared++
        if (added.length || lost.length) fails.push(`${q.id}: toggling ${e.id} off added [${ids(added)}] / removed [${ids(lost)}]`)
      }
      // ...and turning on a pass the tier does not ship never mounts it.
      const forced = mountedPasses({ quality: q, dofOn, inspect: { toggles: Object.fromEntries(POSTFX_PIPELINE.map((e) => [e.id, true])) } })
      compared++
      if (ids(forced) !== ids(ships)) fails.push(`${q.id} (dof ${dofOn ? 'on' : 'off'}): every toggle on mounts [${ids(forced)}], the tier ships [${ids(ships)}]`)
    }
  }
} catch (e) {
  console.error(`⛔ could not run: ${e.message}`)
  await vite.close()
  process.exit(2)
}
await vite.close()

if (compared === 0) { console.error('⛔ BLIND: compared nothing'); process.exit(1) }
if (fails.length) {
  console.error(`\n⛔ Preview does not mount what ships (${fails.length}):`)
  for (const f of fails) console.error(`   ${f}`)
  process.exit(1)
}
console.log(`\n✅ Preview mounts what each profile ships (${compared} comparisons)`)
process.exit(0)   // the SSR-loaded renderer modules keep handles open
