// claims-every-ground-surface-takes-the-lamp.mjs — DOES A LAMP LIGHT WHATEVER GROUND IT STANDS OVER?
//
// ⭐ THE RULE (Jacob, 2026-09-26): "Light needs to reach sidewalks, treelawns, LU, asphalt, curbs,
// everything. Currently there are gaps." No surface class may draw without the lamp term.
// ⛔ The gaps it was written against (measured 2026-09-26): grass/sand/crop mixed the pool into their
// ALBEDO (the night's light multiplied it to nothing), the park gravel read an LS-only lightmap.
//
// For every baked town with a poolmap, every ground group is sent through the MAP'S OWN dispatch
// (src/lib/groundMaterials.js groundMaterialFor), its REAL material is built with the real factory,
// its onBeforeCompile is run over three's standard shader, and the compiled fragment must carry the
// ground-lamp chunk (src/lib/groundLamp.js GROUND_LAMP_MARKER) AFTER lighting — after
// `#include <dithering_fragment>`. Water is a MIRROR, not a lit surface: it does not take the pool, it
// reflects the lamp HEADS (waterMaterial.js LAYER 4). Asserted below: the compiled water fragment runs the
// lamp loop in its emissive, and WaterSurface binds it to the same lampGlow values and lamp list.
// ⭐ MUTATION-TESTED EVERY RUN: one factory is rebuilt with the chunk stripped and must FAIL here.
//
//   node checks/claims-every-ground-surface-takes-the-lamp.mjs [town]
// Read-only. Exit 1 on a surface without the lamp, or a blind check; 2 if it could not run.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createServer } from 'vite'
import { ROOT, scenes } from './_scenes.mjs'

const vite = await createServer({ root: ROOT, server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } })
let exit = 0
try {
  const THREE = await vite.ssrLoadModule('three')
  const { groundMaterialFor } = await vite.ssrLoadModule('/src/lib/groundMaterials.js')
  const { GROUND_LAMP_MARKER } = await vite.ssrLoadModule('/src/lib/groundLamp.js')
  const { makeGroundSurfaceMaterial } = await vite.ssrLoadModule('/src/components/grassMaterial.js')
  const { makeGravelPathMaterial } = await vite.ssrLoadModule('/src/components/gravelPathMaterial.js')
  const { makeFadeGroundMaterial } = await vite.ssrLoadModule('/src/components/fadeGroundMaterial.js')
  const { SURFACES, resolveClassTable } = await vite.ssrLoadModule('/cartograph/surfaces.mjs')
  const { groundColor } = await vite.ssrLoadModule('/src/components/groundColorState.js')

  const tex = new THREE.Texture()
  groundColor.fxMapUniform.value = tex                     // what BakedGround publishes for the gravel
  const pool = { map: tex, min: [0, 0], span: [1, 1], scale: 3 }
  const defaults = (s) => Object.fromEntries(Object.entries(SURFACES[s].params)
    .filter(([, p]) => p.source === 'authored').map(([k, p]) => [k, p.default]))

  /** Compile a material's hook over three's standard shader; return the fragment source. */
  const compile = (mat) => {
    const sh = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} }
    mat.onBeforeCompile(sh, null)
    return sh.fragmentShader
  }
  const lampAfterLight = (frag) => {
    const d = frag.indexOf('#include <dithering_fragment>'), m = frag.indexOf(GROUND_LAMP_MARKER)
    return m >= 0 && d >= 0 && m > d
  }
  const build = { surface: (s) => makeGroundSurfaceMaterial({ surface: s, poolMap: tex, poolMin: [0, 0], poolSpan: [1, 1], poolScale: 3, surfaceParams: defaults(s) }).material,
                  gravel: () => makeGravelPathMaterial({}).material,
                  fade: () => makeFadeGroundMaterial({ color: '#888888', pool }) }

  let checked = 0, bad = 0
  const seen = new Map()   // one compile per (kind, surface)
  for (const town of scenes('public/baked/<scene>/ground.json')) {
    const m = JSON.parse(readFileSync(join(ROOT, 'public/baked', town, 'ground.json'), 'utf8'))
    if (!m.poolmap) { console.log(`   ${town}: no poolmap in ground.json — no lamp map to apply (run bake-ground-ao); not checked`); continue }
    let sceneJson = {}
    try { sceneJson = JSON.parse(readFileSync(join(ROOT, 'public/baked', town, 'scene.json'), 'utf8')) } catch {}
    const table = resolveClassTable(sceneJson?.surfaces?.classes, () => {})
    const miss = [], water = []
    for (const g of m.groups) {
      const d = groundMaterialFor(g, table, { hasFieldAxis: g.fieldByteOffset != null })
      if (d.kind === 'water') { water.push(g.id); continue }
      const k = d.kind + ':' + (d.surface || '')
      if (!seen.has(k)) seen.set(k, lampAfterLight(compile(d.kind === 'surface' ? build.surface(d.surface) : build[d.kind]())))
      checked++
      if (!seen.get(k)) miss.push(`${g.kind}:${g.id} (${k})`)
    }
    if (miss.length) { bad += miss.length; console.log(`⛔ ${town}: ${miss.length} ground group(s) draw WITHOUT the lamp: ${miss.join(', ')}`) }
    else console.log(`✅ ${town}: every ground group takes the lamp after lighting${water.length ? ` · water reflects it (asserted below): ${water.join(', ')}` : ''}`)
  }
  console.log(`   materials compiled: ${[...seen].map(([k, ok]) => `${k}${ok ? '' : ' ⛔'}`).join(' · ')}`)

  // ⭐ WATER — the reflection, asserted, not exempted. The compiled fragment must loop over the lamp heads
  // after the emissive include, and the one water mesh (WaterSurface) must drive it from lampGlow's pool
  // strength + colour and the lamp list StreetLights publishes.
  const { makeWaterMaterial } = await vite.ssrLoadModule('/src/components/waterMaterial.js')
  const reflects = (frag) => { const e = frag.indexOf('#include <emissivemap_fragment>'), l = frag.indexOf('uLamps[i]'); return e >= 0 && l > e }
  const wFrag = compile(makeWaterMaterial({ extentDiag: 1000 }).material)
  const ws = readFileSync(join(ROOT, 'src/components/WaterSurface.jsx'), 'utf8')
  const binds = ['lampGlow.poolUniform', 'lampGlow.colorUniform', 'lampHeads.xz', 'uLamps', 'uLampN'].filter(k => !ws.includes(k))
  const waterOk = reflects(wFrag) && !binds.length
  console.log(waterOk ? '✅ water reflects the lamp heads, driven by the same lampGlow values and lamp list'
    : `⛔ water: ${reflects(wFrag) ? '' : 'no lamp loop in the compiled fragment · '}${binds.length ? `WaterSurface does not bind ${binds.join(', ')}` : ''}`)
  if (!waterOk) bad++
  const wBlind = reflects(wFrag.split('uLamps[i]').join(''))
  console.log(wBlind ? '⛔ BLIND: a water fragment with its lamp loop stripped still passed' : '   mutation (lamp loop stripped from the water) caught ✓')

  // The mutation: a factory whose chunk is stripped must be seen.
  const stripped = build.fade(); const hook = stripped.onBeforeCompile
  stripped.onBeforeCompile = (sh, r) => { hook(sh, r); sh.fragmentShader = sh.fragmentShader.split(GROUND_LAMP_MARKER).join('') }
  const blind = lampAfterLight(compile(stripped))
  console.log(blind ? '⛔ BLIND: a material with the lamp chunk stripped still passed' : '   mutation (lamp chunk stripped from the flat material) caught ✓')
  exit = bad || blind || wBlind ? 1 : checked ? 0 : 2
  console.log(exit === 0 ? '\n✅ PASS' : exit === 2 ? '\n⚠️ nothing checked' : `\n⛔ FAIL`)
} catch (e) { console.error('⛔ could not run:', e.message); exit = 2 } finally { await vite.close() }
process.exit(exit)
