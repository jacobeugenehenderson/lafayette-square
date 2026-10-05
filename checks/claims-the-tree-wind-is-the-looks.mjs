// claims-the-tree-wind-is-the-looks.mjs — IS EVERY TREE'S WIND LOOK THE LOOK'S, AND DOES THE VISIBLE FLOOR ADD NOTHING IN CALM?
//
// How every tree moves (Jacob, 2026-10-05): an ENDEMIC RUSTLE + the REAL WEATHER, with one visible floor in screen
// pixels — figures held by the Look's `treeWind` channel, no knobs (the Amplitude · Pocket · Frequency triple of
// BRIEF-card-wind-hsb was removed once the look was approved at ×1). Holds:
//   ① no wind amplitude is a bare constant in the tree shaders: the old metre constants appear in no wind expression,
//     and the floors / gains / dials they lived in are gone from src/;
//   ② the visible floor lifts only the GUST: every floor term is multiplied by windGustAt (0 in calm), in the card
//     arithmetic and the mesh arithmetic, and both carriers pass windGustAt — never a constant — as the gust;
//   ③ the approved look holds — the kit figures ARE it — and there are no look knobs (removed 2026-10-05);
//   ④ the channel ships: bake-scene names it, Stage's live channels and <Town>'s overrides carry it, and the trees'
//     driver reads scene.treeWind.
// Static: it reads the source. The live gate (pixels at a gust peak, reading the live uniforms) is
// scratch/tree-cost/wind-px.mjs.
//
// ▶ MUTATION-TEST IT:
//     · treeAtlasMaterial.js TREE_WIND_GLSL: put `0.12 *` back into treeWindCrown's endemic term → ① RED
//     · treeAtlasMaterial.js CARD_WIND_RIGID: pass `1.0` instead of `windGustAt(ovWorldXZ)` → ② RED
//
//   node checks/claims-the-tree-wind-is-the-looks.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8')
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
let red = 0
const bad = (m) => { red++; console.log(`   ⛔ ${m}`) }
const ok = (m) => console.log(`   ✅ ${m}`)
const T = src('src/components/treeAtlasMaterial.js')
const block = (name) => T.match(new RegExp(`const ${name} = [^\`]*\`([\\s\\S]*?)\``))?.[1] ?? null

console.log('① no bare wind amplitude in the tree shaders')
{
  const OLD = ['0.12', '0.035', '0.05', '0.005', '0.012', '0.3', '0.06']
  const twg = block('TREE_WIND_GLSL'), rigid = block('CARD_WIND_RIGID')
  const mesh = T.slice(T.indexOf('// The Look\'s Tree Wind (TREE_WIND_GLSL): x = the steady rustle'), T.indexOf('// Per-instance world-XZ for fragment hue jitter.'))
  if (!twg || !rigid || mesh.length < 100) bad('a wind block is missing — the check and the source have drifted')
  else {
    // The amplitude-bearing lines: the arithmetic itself, the card's lean/flutter assignments, the mesh's rustle/sway.
    const lines = [...strip(twg).split('\n'), ...strip(rigid).split('\n').filter((l) => /\bamp\b|ovFlutAmp|amp2|tw\s*=/.test(l)),
      ...strip(mesh).split('\n').filter((l) => /meshTw|transformed\.xz\s*\+=/.test(l))]
    const hits = lines.filter((l) => OLD.some((c) => new RegExp(`(^|[^\\d.])${c.replace('.', '\\.')}(?![\\d])`).test(l)))
    hits.length ? bad(`a bare wind amplitude is back: ${hits.map((l) => l.trim()).join(' | ')}`) : ok('no old metre constant in any wind expression (cards and mesh)')
  }
  const gone = ['browseWindFloor', 'heroWindFloor', '__setBrowseWindFloor', '__setHeroWindFloor', 'CARD_LEAN_GAIN_M_PER_MPS', 'CARD_FLUTTER_GAIN_M_PER_MPS', 'uWindFloor', 'treeSwayUniforms', 'uRustleAmplitude', 'uTreeWindAmp', 'uTreeWindPocket', 'uTreeWindFreq', 'TREE_WIND_FIELDS']
  const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else if (/\.(jsx?|mjs)$/.test(e.name)) out.push(p) } return out }
  const left = []
  for (const f of walk(path.join(REPO, 'src'))) { const s = strip(fs.readFileSync(f, 'utf8')); for (const g of gone) if (new RegExp(`\\b${g.replace(/[$]/g, '\\$')}\\b`).test(s)) left.push(`${path.relative(REPO, f)}: ${g}`) }
  left.length ? bad(`replaced wind state still referenced: ${left.join(' · ')}`) : ok('the floors, gains, dials and treeSwayUniforms are gone from src/')
}

console.log('② the floor lifts only the gust, and the gust is windGustAt')
{
  const twg = strip(block('TREE_WIND_GLSL') || '')
  ;/float lift\s*=\s*gust \* floorM/.test(twg) ? ok('treeWindCrown: the floor is gust × floorM') : bad('treeWindCrown: the floor is not scaled by the gust')
  ;/gust \* floorM \/ heightM/.test(twg) ? ok('treeWindMesh: the floor is gust × floorM') : bad('treeWindMesh: the floor is not scaled by the gust')
  const rigid = strip(block('CARD_WIND_RIGID') || '')
  ;/treeWindCrown\(\s*ovW\.z,\s*windGustAt\(ovWorldXZ\)/.test(rigid) ? ok('the cards pass windGustAt as the gust') : bad('the cards do not pass windGustAt as the gust — the floor would fire in calm')
  ;/treeWindMesh\(\s*meshW\.z,\s*windGustAt\(instWorld\.xz\)/.test(strip(T)) ? ok('the mesh trees pass windGustAt as the gust') : bad('the mesh trees do not pass windGustAt as the gust — the floor would fire in calm')
}

console.log('③ the approved look holds, and it has no knobs')
{
  const { TREE_WIND_FLAT_DEFAULTS: D } = await import(pathToFileURL(path.join(REPO, 'src/cartograph/skyLightChannels.js')))
  const want = { floorPx: 2, leanRefM: 0.12, leanPerMps: 0.035, flutterRefM: 0.05, flutterPerMps: 0.05, meshRustleM: 0.005, meshSwayPerMps: 0.012, meshLeanShare: 0.3 }
  const off = Object.entries(want).filter(([k, v]) => D[k] !== v)
  off.length ? bad(`kit figures moved off the approved look: ${off.map(([k, v]) => `${k} ${D[k]} ≠ ${v}`).join(', ')}`) : ok('kit figures = the approved look (endemic rustle, weather gains, floor 2 px)')
  const knobs = ['amplitude', 'pocket', 'frequency'].filter((k) => k in D)
  knobs.length ? bad(`look knobs are back in the channel: ${knobs.join(', ')}`) : ok('no Amplitude · Pocket · Frequency in the channel (removed 2026-10-05)')
  const g = block('TREE_WIND_GLSL') || ''
  ;/vec2 endemic = vec2\(uTreeWindLeanRefM, uTreeWindFlutRefM\);/.test(g) && /vec2 weather = vec2\(uTreeWindLeanPerMps, uTreeWindFlutPerMps\) \* felt;/.test(g)
    ? ok('the arithmetic is endemic rustle + real weather, unweighted') : bad('the tree-wind arithmetic is no longer endemic rustle + real weather')
}

console.log('④ the channel ships')
{
  ;/treeWind:\s*design\.treeWind\s*\|\|\s*kitDayChannel\('treeWind'\)/.test(src('cartograph/bake-scene.js')) ? ok('bake-scene emits treeWind') : bad('bake-scene does not name treeWind — an authored wind would reach no viewer')
  ;/'treeWind'/.test(src('src/components/Town.jsx').match(/OVERRIDE_KEYS = \[[\s\S]*?\]/)?.[0] || '') ? ok('<Town> takes a live treeWind override') : bad('<Town> refuses treeWind as an override')
  ;/'treeWind'/.test(src('src/cartograph/CartographApp.jsx').match(/STAGE_CHANNELS = \[[\s\S]*?\]/)?.[0] || '') ? ok('Stage passes its live treeWind') : bad('Stage does not pass treeWind live')
  ;/<TreeWindDriver channel=\{treeWindOverride \?\? scene\?\.treeWind\}/.test(src('src/components/InstancedTrees.jsx')) ? ok('the trees\' driver reads the live edit, else scene.treeWind') : bad('InstancedTrees does not drive the tree wind from the Look')
}

console.log(red ? `\n⛔ ${red} claim(s) RED` : '\n✅ every tree\'s wind look is the Look\'s, and the visible floor adds nothing in calm')
process.exit(red ? 1 : 0)
