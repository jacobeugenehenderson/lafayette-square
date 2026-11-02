#!/usr/bin/env node
/**
 * "IS THE HERO'S COVERAGE MASK WHAT THE HERO ADDS TO THE IMAGE, AND IS IT SKIPPED WHEN NOTHING BLURS?" (Boz's ruling,
 * 2026-11-02, from Sigil's read of HeroLadder: the mask is COVERAGE, subtracted from the shared blur; after the PTown
 * measurement: the mask redrew the Light Show's 1.06 M triangles every frame, 21 calls.)
 *
 *   1. focusMeshes (src/lib/focusObject.js), driven on a planted focus node: a mesh marked `userData.coverage === false`
 *      is not drawn into the mask; every other mesh under the node is;
 *   2. the Light Show marks its clear glass, sockets and cords so; its light cores (what it adds to the image) are not;
 *   3. HeroLadder draws the mask only when the most blur reaches a pixel: maxBlur × PYRAMID_LEVELS × LEVEL0_REACH_PX ≥ 1;
 *   4. LEVEL0_REACH_PX is the first level's kernel reach, READ from DownsamplePyramid's own shader: its outermost tap.
 * Usage: node checks/claims-the-hero-mask-is-what-the-hero-adds.mjs [--mutants]
 */
import { importSource, sourceOf } from './_importSource.mjs'

const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

async function verdict({ focus, view, ladder, pyr } = {}) {
  const fails = [], F = (c, m) => { if (!c) fails.push(m) }
  const THREE = await import('three')
  const FO = await importSource('src/lib/focusObject.js', focus ? { transform: focus } : {})
  // 1. a planted focus node: a covering mesh, two marked not to cover, one nested covering mesh
  const scene = new THREE.Scene(), node = new THREE.Group(), g = new THREE.BoxGeometry(), m = new THREE.MeshBasicMaterial()
  node.name = 'focus:monument'; scene.add(node)
  const core = new THREE.Mesh(g, m), glass = new THREE.Mesh(g, m), socket = new THREE.Mesh(g, m), inner = new THREE.Group(), stone = new THREE.Mesh(g, m)
  glass.userData.coverage = false; socket.userData.coverage = false
  node.add(core, glass, socket, inner); inner.add(stone)
  const got = (FO.focusMeshes('monument', { scene }) || []).map(x => x.mesh)
  F(got.includes(core) && got.includes(stone), 'a mesh under the focus node that covers is left out of the mask')
  F(!got.includes(glass) && !got.includes(socket), 'a mesh marked coverage: false is drawn into the mask')
  // 2. the Light Show's marks
  const ls = code(view ? view(sourceOf('src/displays/lightShow/LightShow.jsx')) : sourceOf('src/displays/lightShow/LightShow.jsx'))
  const marked = (name) => new RegExp(`<instancedMesh name="light-show:${name}"[^>]*userData=\\{\\{ coverage: false \\}\\}`).test(ls)
  F(marked('glass') && marked('sockets') && marked('cords'), 'the Light Show\'s glass, sockets or cords are drawn into the hero mask')
  F(!marked('light'), 'the Light Show\'s light cores (what it adds to the image) are left out of the hero mask')
  // 3. the mask only when the blur reaches a pixel
  const hl = code(ladder ? ladder(sourceOf('src/components/HeroLadder.jsx')) : sourceOf('src/components/HeroLadder.jsx'))
  F(/const blurPx = _dofRefs\.maxBlur\.current \* PYRAMID_LEVELS \* LEVEL0_REACH_PX/.test(hl) && /want = !!rect && blurPx >= 1/.test(hl), 'HeroLadder draws the mask when no blur reaches a pixel, or judges it by another rule')
  // 4. the reach, read from the ladder's own shader
  const ps = pyr ? pyr(sourceOf('src/components/DownsamplePyramid.jsx')) : sourceOf('src/components/DownsamplePyramid.jsx')
  const at = ps.indexOf('const downsampleFrag'), frag = at < 0 ? '' : ps.slice(at, ps.indexOf('\n`', at))
  const taps = [...frag.matchAll(/t \* vec2\(\s*(-?[\d.]+),\s*(-?[\d.]+)\)/g)].flatMap(x => [Math.abs(+x[1]), Math.abs(+x[2])])
  const reach = (ps.match(/export const LEVEL0_REACH_PX = ([\d.]+)/) || [])[1]
  F(taps.length >= 13 && Number(reach) === Math.max(...taps), `LEVEL0_REACH_PX (${reach}) is not the first level's outermost tap (${taps.length ? Math.max(...taps) : 'none read'})`)
  return fails
}

const run = async (m) => { try { return await verdict(m) } catch (e) { return [`it threw: ${String(e.message).slice(0, 200)}`] } }
const fails = await run()
if (fails.length) { console.log('⛔ the hero mask is not what the hero adds:\n  · ' + fails.join('\n  · ')); process.exitCode = 1 }
else console.log('✅ the hero mask is what the hero adds: meshes marked as not covering are left out (the Light Show\'s glass, sockets and cords; never its light), and the mask is drawn only when the blur reaches a pixel, by the ladder\'s own reach')

if (process.argv.includes('--mutants')) {
  const mutants = [
    ['the coverage mark ignored', { focus: (s) => s.replace("if (o.isMesh && o.userData?.coverage !== false) out.push(", 'if (o.isMesh) out.push(') }],
    ['the glass drawn into the mask', { view: (s) => s.replace('<instancedMesh name="light-show:glass" ref={glassRef} args={[bulb, glass, count]} frustumCulled={false} userData={{ coverage: false }} />', '<instancedMesh name="light-show:glass" ref={glassRef} args={[bulb, glass, count]} frustumCulled={false} />') }],
    ['the light cores left out', { view: (s) => s.replace('<instancedMesh name="light-show:light" ref={coreRef} args={[bulb, core, count]} frustumCulled={false} />', '<instancedMesh name="light-show:light" ref={coreRef} args={[bulb, core, count]} frustumCulled={false} userData={{ coverage: false }} />') }],
    ['the mask drawn at any blur (the old > 0)', { ladder: (s) => s.replace('want = !!rect && blurPx >= 1', 'want = !!rect && _dofRefs.maxBlur.current > 0') }],
    ['a reach not the kernel\'s', { pyr: (s) => s.replace('export const LEVEL0_REACH_PX = 2', 'export const LEVEL0_REACH_PX = 1') }],
  ]
  let bad = 0
  for (const [name, m] of mutants) { const f = await run(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${f.length ? ` (${f.length})` : ''}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
