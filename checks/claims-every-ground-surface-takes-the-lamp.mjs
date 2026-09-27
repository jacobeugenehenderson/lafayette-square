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
// `#include <dithering_fragment>`. Water is Strand's (lamp reflection) and is listed, not asserted.
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
    else console.log(`✅ ${town}: every ground group takes the lamp after lighting${water.length ? ` · water (Strand's): ${water.join(', ')}` : ''}`)
  }
  console.log(`   materials compiled: ${[...seen].map(([k, ok]) => `${k}${ok ? '' : ' ⛔'}`).join(' · ')}`)

  // ⭐ EVERY APP, NOT ONLY BakedGround (2026-09-26: a park-grass mesh outside BakedGround was the hole).
  // A ground surface is built by one of the ground FACTORIES wherever it is mounted; each factory must
  // carry the lamp even when its caller passes NO poolmap (it then binds the shared one). Compiled here
  // in exactly that shape, and every call site in src/ is listed so a new one is seen.
  const bare = { 'makeGroundSurfaceMaterial (no poolmap)': () => makeGroundSurfaceMaterial({ surface: 'grass' }).material,
                 'makeGravelPathMaterial': () => makeGravelPathMaterial({}).material }
  for (const [name, mk] of Object.entries(bare)) {
    const ok = lampAfterLight(compile(mk()))
    if (!ok) bad++
    console.log(`${ok ? '✅' : '⛔'} ${name}: ${ok ? 'carries the lamp without a caller-supplied poolmap' : 'draws WITHOUT the lamp when its caller passes no poolmap'}`)
  }
  const { readdirSync, statSync } = await import('node:fs')
  const FACTORIES = /\b(makeGroundSurfaceMaterial|makeGrassMaterial|makeGravelPathMaterial|makeFadeGroundMaterial)\(/g
  const sites = []
  const walk = (d) => { for (const f of readdirSync(join(ROOT, d))) { const p = join(d, f); if (statSync(join(ROOT, p)).isDirectory()) walk(p); else if (/\.(js|jsx|mjs)$/.test(f)) { const src = readFileSync(join(ROOT, p), 'utf8'); for (const m of src.matchAll(FACTORIES)) if (!/export function/.test(src.slice(Math.max(0, m.index - 20), m.index))) sites.push(`${p}:${m[1]}`) } } }
  walk('src')
  console.log(`   ground-factory call sites in src/ (${sites.length}): ${[...new Set(sites)].join(' · ')}`)

  // The mutation: a factory whose chunk is stripped must be seen.
  const stripped = build.fade(); const hook = stripped.onBeforeCompile
  stripped.onBeforeCompile = (sh, r) => { hook(sh, r); sh.fragmentShader = sh.fragmentShader.split(GROUND_LAMP_MARKER).join('') }
  const blind = lampAfterLight(compile(stripped))
  console.log(blind ? '⛔ BLIND: a material with the lamp chunk stripped still passed' : '   mutation (lamp chunk stripped from the flat material) caught ✓')
  exit = bad || blind ? 1 : checked ? 0 : 2
  console.log(exit === 0 ? '\n✅ PASS' : exit === 2 ? '\n⚠️ nothing checked' : `\n⛔ FAIL`)
} catch (e) { console.error('⛔ could not run:', e.message); exit = 2 } finally { await vite.close() }
process.exit(exit)
