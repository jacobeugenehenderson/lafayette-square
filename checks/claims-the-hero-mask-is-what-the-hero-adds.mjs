#!/usr/bin/env node
/**
 * "IS THE HERO'S COVERAGE MASK WHAT THE HERO ADDS TO THE IMAGE, AND IS IT SKIPPED WHEN NOTHING BLURS?" (Boz's ruling,
 * 2026-11-02, from Sigil's read of HeroLadder: the mask is COVERAGE, subtracted from the shared blur; after the PTown
 * measurement: the mask redrew the Light Show's 1.06 M triangles every frame, 21 calls.)
 *
 *   1. focusMeshes (src/lib/focusObject.js), driven on a planted focus node: a mesh marked `userData.coverage === false`
 *      is not drawn into the mask; every other mesh under the node is;
 *   2. the Light Show marks its clear glass, sockets and cords so; its light cores (what it adds to the image) are not;
 * (A rule to skip the mask when the blur is small was RETRACTED, Zob 2026-11-02: below rung 1 the first level still spreads
 * light its full reach, scaled in amplitude, so a reach × blend-weight test is unsound. Any skip comes from a measured
 * pixel diff against the render-twice noise floor.)
 * Usage: node checks/claims-the-hero-mask-is-what-the-hero-adds.mjs [--mutants]
 */
import { importSource, sourceOf } from './_importSource.mjs'

const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

async function verdict({ focus, view } = {}) {
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
  return fails
}

const run = async (m) => { try { return await verdict(m) } catch (e) { return [`it threw: ${String(e.message).slice(0, 200)}`] } }
const fails = await run()
if (fails.length) { console.log('⛔ the hero mask is not what the hero adds:\n  · ' + fails.join('\n  · ')); process.exitCode = 1 }
else console.log('✅ the hero mask is what the hero adds: meshes marked as not covering are left out (the Light Show\'s glass, sockets and cords; never its light), as the mask is drawn')

if (process.argv.includes('--mutants')) {
  const mutants = [
    ['the coverage mark ignored', { focus: (s) => s.replace("if (o.isMesh && o.userData?.coverage !== false) out.push(", 'if (o.isMesh) out.push(') }],
    ['the glass drawn into the mask', { view: (s) => s.replace('<instancedMesh name="light-show:glass" ref={glassRef} args={[bulb, glass, count]} frustumCulled={false} userData={{ coverage: false }} />', '<instancedMesh name="light-show:glass" ref={glassRef} args={[bulb, glass, count]} frustumCulled={false} />') }],
    ['the light cores left out', { view: (s) => s.replace('<instancedMesh name="light-show:light" ref={coreRef} args={[bulb, core, count]} frustumCulled={false} />', '<instancedMesh name="light-show:light" ref={coreRef} args={[bulb, core, count]} frustumCulled={false} userData={{ coverage: false }} />') }],
  ]
  let bad = 0
  for (const [name, m] of mutants) { const f = await run(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${f.length ? ` (${f.length})` : ''}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
