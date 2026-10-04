#!/usr/bin/env node
/**
 * "DOES EACH SURFACE SHIP WHAT ITS TOWN'S DEPLOYMENT SAYS, THROUGH ONE FUNCTION, AND CAN ONLY PREVIEW'S DEPLOYMENT
 * CONTROLS WRITE IT?" — Phase 2 F (BRIEF-phase2-F-preview-deployment-authoring.md §1, §2, Checks).
 *
 * Fails when:
 *   1. a town's cartograph/data/<map>/deployment.json does not parse (src/lib/deployment.js#readDeployment), or names a
 *      pass that is no pass in renderPipeline.jsx#POSTFX_PIPELINE (a misspelt id would silently keep a pass on);
 *   2. a town's baked manifest does not carry `deployment`, or carries one that is not its deployment.json (a stale
 *      manifest ships yesterday's policy), or a town with no file is not `{ authored: false }`;
 *   3. anything but qualityProfile.js#surfaceQuality reads a policy (`surfacePolicy(`): two readers can disagree;
 *   4. Preview resolves a surface's profile other than through surfaceQuality, or the Ward's player calls deviceQuality
 *      without the manifest's deployment (then the Ward and Preview apply different policies);
 *   5. ⛔ an INSPECTION path can reach the file: the deployment save is called from anywhere but
 *      src/preview/DeploymentPanel.jsx, or that panel touches Preview's inspection store (`preview.layers`, setLayer,
 *      measureToggle). "Deployment decisions must not masquerade as inspection toggles" (spec).
 * ⭐ READS THE SOURCE and the files on disk; restates nothing. A self-test proves each detector can fire.
 *
 *   node checks/claims-deployment-has-one-authority.mjs
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createServer } from 'vite'

const ROOT = new URL('..', import.meta.url).pathname
const WARD = process.env.WARD_DIR || join(ROOT, '../dev.nosync/theward')
const fails = []
const SAVE = /\/maps\/[^\n]*\/deployment\b/
const PANEL = 'src/preview/DeploymentPanel.jsx'
const INSPECTION = /preview\.layers|\bsetLayer\b|\bmeasureToggle\b/

const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(join(d, e.name))) : /\.(jsx?|mjs)$/.test(e.name) ? [join(d, e.name)] : [])
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')

// ── detectors (pure, self-tested) ──
const readsPolicy = (rel, src) => rel !== 'src/lib/qualityProfile.js' && rel !== 'src/lib/deployment.js' && /\bsurfacePolicy\s*\(/.test(code(src))
const callsSave = (rel, src) => rel !== PANEL && SAVE.test(code(src))
const panelTouchesInspection = (src) => INSPECTION.test(code(src))
const wardCallsBare = (src) => /\bdeviceQuality\s*\(\s*\)/.test(code(src))
;(function selfTest() {
  const t = [
    [readsPolicy('src/x.js', 'surfacePolicy(d, "desktop")'), true], [readsPolicy('src/lib/qualityProfile.js', 'surfacePolicy(d, s)'), false],
    [callsSave('src/preview/PreviewApp.jsx', "fetch('/api/cartograph/maps/x/deployment')"), true], [callsSave(PANEL, "fetch('/api/cartograph/maps/x/deployment')"), false],
    [panelTouchesInspection("localStorage.getItem('preview.layers.v3')"), true], [panelTouchesInspection('// setLayer is not here'), false],
    [wardCallsBare('deviceQuality()'), true], [wardCallsBare('deviceQuality(manifest.deployment)'), false],
  ]
  t.forEach(([got, want], i) => { if (got !== want) { console.error(`⛔ SELF-TEST ${i}: a detector is blind or over-eager`); process.exit(2) } })
})()

// ── 1 + 2: the files, and the manifests that freeze them ──
const vite = await createServer({ root: ROOT, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } })
try {
  const { POSTFX_PIPELINE } = await vite.ssrLoadModule('/src/components/renderPipeline.jsx')
  const { readDeployment } = await vite.ssrLoadModule('/src/lib/deployment.js')
  const passes = new Set(POSTFX_PIPELINE.map((e) => e.id))
  const towns = readdirSync(join(ROOT, 'cartograph/data')).filter((t) => existsSync(join(ROOT, 'cartograph/data', t, 'town-id.json')))
  if (!towns.length) fails.push('no towns found (cartograph/data/*/town-id.json): the check is blind')
  for (const t of towns) {
    const f = join(ROOT, 'cartograph/data', t, 'deployment.json')
    let want = { authored: false }
    if (existsSync(f)) {
      try {
        want = readDeployment(JSON.parse(readFileSync(f, 'utf8')), relative(ROOT, f))
        for (const [s, p] of Object.entries(want.surfaces)) for (const id of p.postFxOff || []) if (!passes.has(id)) fails.push(`${t}: ${s}.postFxOff names "${id}", no pass in POSTFX_PIPELINE`)
      } catch (e) { fails.push(e.message); continue }
    }
    const mp = join(ROOT, 'public/baked', t, 'manifest.json')
    if (!existsSync(mp)) { console.log(`   ${t}: no baked manifest on disk (not poured here)`); continue }
    const got = JSON.parse(readFileSync(mp, 'utf8')).deployment
    if (got === undefined) fails.push(`${t}: its manifest carries no deployment — re-run node cartograph/bake-manifest.mjs --town=${t}`)
    else if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(`${t}: the manifest's deployment is not deployment.json's (stale): re-run the manifest step`)
    else console.log(`   ${t}: manifest.deployment = deployment.json${want.authored ? '' : ' (none authored)'}`)
  }
} catch (e) { fails.push(`could not load the renderer: ${e.message}`) }
await vite.close()

// ── 3 + 5: who reads a policy, who can write the file ──
for (const abs of walk(join(ROOT, 'src'))) {
  const rel = relative(ROOT, abs)
  const src = readFileSync(abs, 'utf8')
  if (readsPolicy(rel, src)) fails.push(`${rel} reads a deployment policy itself (surfacePolicy): only qualityProfile.js#surfaceQuality may`)
  if (callsSave(rel, src)) fails.push(`${rel} calls the deployment save: only ${PANEL} may`)
}
const panelP = join(ROOT, PANEL)
if (!existsSync(panelP)) fails.push(`${PANEL} is missing: nothing authors deployment`)
else {
  const p = readFileSync(panelP, 'utf8')
  if (!SAVE.test(code(p))) fails.push(`${PANEL} never calls the deployment save: the controls write nothing`)
  if (panelTouchesInspection(p)) fails.push(`${PANEL} touches Preview's inspection store: an inspection toggle could reach deployment.json`)
}

// ── 4: one function on both sides ──
const preview = readFileSync(join(ROOT, 'src/preview/PreviewApp.jsx'), 'utf8')
if (!/\bsurfaceQuality\s*\(/.test(code(preview))) fails.push('PreviewApp.jsx does not resolve its surfaces through surfaceQuality')
if (/QUALITY_PROFILES\.(desktop|phone)\b/.test(code(preview))) fails.push('PreviewApp.jsx reads a bare profile (QUALITY.*) for a surface: its policy is skipped')
if (!existsSync(WARD)) fails.push(`the Ward is not at ${WARD} (set WARD_DIR): side 2 is blind`)
else {
  const wardFiles = walk(join(WARD, 'src')).map((a) => [relative(WARD, a), readFileSync(a, 'utf8')])
  const callers = wardFiles.filter(([, s]) => /\bdeviceQuality\s*\(/.test(code(s)))
  if (!callers.length) fails.push('the Ward never calls deviceQuality: it applies no deployment')
  for (const [r, s] of callers) if (wardCallsBare(s)) fails.push(`theward/${r} calls deviceQuality() without manifest.deployment`)
}

if (fails.length) { console.error(`⛔ deployment authority (${fails.length}):\n   ${fails.join('\n   ')}`); process.exit(1) }
console.log('✅ deployment has one authority: every town\'s file parses and names real passes, every manifest carries it, one function applies it in Preview and the Ward, and only the deployment panel writes it')
process.exit(0)
