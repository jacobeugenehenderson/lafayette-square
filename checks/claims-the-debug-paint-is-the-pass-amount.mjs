#!/usr/bin/env node
// CLAIM — THE DoF DEBUG PAINT IS THE BLUR AMOUNT (Boz's ruling, 2026-10-28: "a debug view that lies about the blur is how
// this hunt lost an afternoon"). The paint (window.__dofDebug) was a branch inside RomanceDoF, and passes ran after it:
// read off the canvas, PTown's foreground at blur 0.2 painted red 0–15. As an Effect it is no better: postprocessing merges
// and SORTS effects (depth first, so grain ran over it), and N8AO's pass draws to the screen after every Effect. Now
// (src/components/DofDebug.jsx, src/components/renderPipeline.jsx):
//   (1) the dofDebug entry is the LAST of POSTFX_PIPELINE and an OVERLAY: the installer mounts it beside the composer,
//       never in it, and DofDebug draws one frame priority AFTER the composer's (COMPOSER_PRIORITY, passed to both);
//   (2) RomanceDoF paints no debug (no uDebug), and DofDebug's fragment is the blur law itself (`${DOF_BLUR_GLSL}`), fed
//       from _dofRefs every field the law reads;
//   (3) mounted (mountedPasses, every town's every surface, DoF both ways): it mounts exactly when DoF does.
// The browser receipt (canvas red/255 against the law at the same pixels) is in the commit.
//   MUTANTS (always run): the overlay flag dropped → (1) RED · drawn at the composer's own priority → (1) RED · a uDebug
//   branch back in RomanceDoF → (2) RED · the law copied instead of shared → (2) RED.
//   node checks/claims-the-debug-paint-is-the-pass-amount.mjs
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createServer } from 'vite'

const ROOT = new URL('..', import.meta.url).pathname
let red = 0
const row = (ok, s) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${s}`) }
const PIPE = readFileSync(join(ROOT, 'src/components/renderPipeline.jsx'), 'utf8'), DOF = readFileSync(join(ROOT, 'src/components/RomanceDoF.jsx'), 'utf8')
const DBG = readFileSync(join(ROOT, 'src/components/DofDebug.jsx'), 'utf8')

const judgeOrder = (s, d) => { const a = s.indexOf('export const POSTFX_PIPELINE = ['), b = a < 0 ? -1 : s.indexOf('\n]\n', a)
  const ids = a < 0 || b < 0 ? [] : [...s.slice(a, b).matchAll(/^\s*\{\s*id: '([^']+)', pass: (\w+)([^\n]*)/gm)].map(m => [m[1], m[2], m[3]])
  const last = ids.at(-1) || [], inst = /<EffectComposer key=\{key\} ref=\{composer\} renderPriority=\{COMPOSER_PRIORITY\}>/.test(s) && /mounted\.filter\(\(e\) => !e\.overlay\)/.test(s)
    && /mounted\.filter\(\(e\) => e\.overlay\)[^\n]*composer=\{composer\} after=\{COMPOSER_PRIORITY\}/.test(s)
  const after = /\}, after \+ 1\)/.test(d)
  return { ids, inst, after, ok: last[0] === 'dofDebug' && last[1] === 'DofDebug' && /overlay: true/.test(last[2]) && ids.filter(([, p]) => p === 'DofDebug').length === 1 && inst && after } }
const judgeLaw = (s, d) => {
  const main = s.slice(s.indexOf('const fragment = '), s.indexOf('// Module-level refs'))
  const frag = d.slice(d.indexOf('const frag = '), d.indexOf('export function DofDebug')), upd = d.slice(d.indexOf('useFrame(('))
  const fed = ['near', 'far', 'focusDist', 'tanHalf', 'upView', 'maxBlur', 'heroBlur', 'zone', 'ramp'].filter(k => !upd.includes(`_dofRefs.${k}.current`))
  return { fed, ok: !/uDebug/.test(main) && /\$\{DOF_BLUR_GLSL\}/.test(frag) && !/float blurAmount\(/.test(frag) && /logarithmicDepthBuffer/.test(upd) && /inputBuffer\?\.depthTexture/.test(upd) && !fed.length } }

{ const J = judgeOrder(PIPE, DBG); row(J.ok, `(1) POSTFX_PIPELINE ends with the DofDebug overlay (${J.ids.map(([i]) => i).join(' → ')}) · mounted beside the composer: ${J.inst} · drawn after its priority: ${J.after}`) }
{ const J = judgeLaw(DOF, DBG); row(J.ok, `(2) RomanceDoF paints no debug; DofDebug is DOF_BLUR_GLSL fed from _dofRefs${J.fed.length ? ` — not fed: ${J.fed.join(', ')}` : ''}: ${J.ok}`) }

const vite = await createServer({ root: ROOT, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } })
try {
  const { mountedPasses } = await vite.ssrLoadModule('/src/components/renderPipeline.jsx')
  const { surfaceQuality } = await vite.ssrLoadModule('/src/lib/qualityProfile.js')
  const { SURFACES, readDeployment } = await vite.ssrLoadModule('/src/lib/deployment.js')
  const towns = readdirSync(join(ROOT, 'cartograph/data')).filter(t => existsSync(join(ROOT, 'cartograph/data', t, 'deployment.json')))
  const bad = [], seen = { withDof: 0, without: 0 }
  for (const t of towns) { const d = readDeployment(JSON.parse(readFileSync(join(ROOT, 'cartograph/data', t, 'deployment.json'), 'utf8')), t)
    for (const s of SURFACES) for (const dofOn of [true, false]) { const ids = mountedPasses({ quality: surfaceQuality(s, d), dofOn }).map(e => e.id)
      const dof = ids.includes('dof'), dbg = ids.includes('dofDebug'); seen[dof ? 'withDof' : 'without']++
      if (dof !== dbg) bad.push(`${t}/${s} dof ${dofOn ? 'on' : 'off'}: [${ids.join(',')}]`) } }
  row(towns.length > 0 && !bad.length && seen.withDof > 0 && seen.without > 0, `(3) mounted with DoF and only then: ${towns.length} towns · ${seen.withDof} mounts with DoF, ${seen.without} without${bad.length ? ` — ${bad.slice(0, 4).join(' · ')}` : ''}`)
} finally { await vite.close() }

// MUTANTS: the source text, edited
for (const [name, base, edit, judge] of [
  ['the overlay flag dropped', PIPE, (s) => s.replace("dependsOn: ['dof'], overlay: true }", "dependsOn: ['dof'] }"), (s) => judgeOrder(s, DBG).ok],
  ['drawn at the composer\'s own priority', DBG, (s) => s.replace('}, after + 1)', '}, after)'), (s) => judgeOrder(PIPE, s).ok],
  ['a uDebug branch back in RomanceDoF', DOF, (s) => s.replace('  uniform float uLogDepth;    // 1.0 when logarithmicDepthBuffer is active\n', '  uniform float uLogDepth;    // 1.0 when logarithmicDepthBuffer is active\n  uniform float uDebug;\n'), (s) => judgeLaw(s, DBG).ok],
  ['the law copied instead of shared', DBG, (s) => s.replace('  varying vec2 vUv;\n  void main()', '  float blurAmount(float d, vec2 uv) { return 0.0; }\n  varying vec2 vUv;\n  void main()'), (s) => judgeLaw(DOF, s).ok],
]) { const m = edit(base)
  if (m === base) { row(false, `mutant (${name}): its anchor is not in the source — re-aim it`); continue }
  row(!judge(m), `mutant: ${name} → ${judge(m) ? 'still GREEN — the row proves nothing' : 'RED as it must be'}`) }
console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ the debug paint is the pass amount')
process.exit(red ? 1 : 0)
