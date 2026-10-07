#!/usr/bin/env node
/**
 * "DOES EVERY APP THAT DRAWS A TOWN DRAW ITS SET-PIECE?"
 *
 * WHY (2026-09-26): the Pilgrim Monument was mounted by hand in Scene and Preview only,
 * and was missing in Stage, where Jacob baked Provincetown. The class: a set-piece added
 * app by app goes missing, silently, in whichever app nobody remembered. The same day the
 * shore's stone (`<SlabRevetment>`) turned out to be mounted in Stage and the lab only —
 * its own header claimed Preview mounted it identically — so it is held here too.
 *
 * An APP is found, never listed: a file under src/ that owns an R3F `<Canvas>` AND mounts
 * the town's ground (`<BakedGround`) or the one assembly (`<Town`, src/components/Town.jsx).
 * An app that mounts <Town> is held through Town.jsx, which must mount both itself
 * (claims-every-app-mounts-the-town holds every app to <Town>). Fails when:
 *   · an app does not import and render `<SetPiece` (src/components/SetPiece.jsx)
 *   · an app does not import and render `<SlabRevetment` with `lookId` and `bakeLastMs`
 *   · any file other than SetPiece.jsx imports a set-piece renderer directly (the hand-mount)
 *   · a town declares a `setPiece.kind` that SetPiece.jsx has no renderer for
 *   · the revetment draws with a material no kit terrain lift patches (it would ignore the live exaggeration)
 *
 * ⛔ READ-ONLY. Usage: node checks/claims-every-app-mounts-the-set-piece.mjs [--self-test]
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

const ROOT = new URL('..', import.meta.url).pathname
const SRC = join(ROOT, 'src')
const MOUNT = join(SRC, 'components/SetPiece.jsx')

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(jsx?|mjs)$/.test(n)) out.push(p)
  }
  return out
}

// The renderers SetPiece.jsx maps kinds to: read from its own source, never restated.
function renderersOf(mountSrc) {
  const block = mountSrc.match(/const RENDERERS = \{([\s\S]*?)\n\}/)
  if (!block) return null
  const kinds = [...block[1].matchAll(/'([^']+)'\s*:\s*(\w+)/g)].map(m => ({ kind: m[1], comp: m[2] }))
  const imports = Object.fromEntries([...mountSrc.matchAll(/import (\w+) from '([^']+)'/g)].map(m => [m[1], m[2]]))
  return kinds.map(k => ({ ...k, file: imports[k.comp] ? imports[k.comp].replace(/^\.\//, '').replace(/\.jsx?$/, '') : null }))
}

export function audit(files, mountSrc, declaredKinds) {
  const f = [], info = []
  const R = renderersOf(mountSrc)
  if (!R) return { f: ['SetPiece.jsx has no RENDERERS table — cannot verify'], info }
  const code = (src) => src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
  const town = files.find(x => x.path.endsWith('components/Town.jsx'))
  const apps = files.filter(x => /<Canvas\b/.test(code(x.src)) && /<(BakedGround|Town)\b/.test(code(x.src)))
    // An app that draws through <Town> mounts what Town.jsx mounts.
    .map(x => /<Town\b/.test(code(x.src)) && !/<BakedGround\b/.test(code(x.src)) && town ? { path: `${x.path} (through ${town.path})`, src: town.src } : x)
  info.push(`apps found: ${apps.map(a => a.path).join(', ')}`)
  if (!apps.length) f.push('no app found (no file owns a <Canvas> and mounts the ground) — the definition broke')
  for (const a of apps) {
    const imports = /import SetPiece from '[^']*SetPiece(\.jsx)?'/.test(a.src)
    const renders = /<SetPiece\b/.test(a.src)
    if (!imports || !renders) f.push(`${a.path} draws a town but does not ${!imports ? 'import' : 'render'} <SetPiece>`)
    // ⭐ The shore's stone: every app that draws the ground draws its revetment, with the two
    // props every caller passes (SlabRevetment.jsx's header: "the look and the bake token").
    const rImports = /import SlabRevetment from '[^']*SlabRevetment(\.jsx)?'/.test(a.src)
    const rTag = a.src.match(/<SlabRevetment\b[^>]*\/>/)
    if (!rImports || !rTag) f.push(`${a.path} draws a town but does not ${!rImports ? 'import' : 'render'} <SlabRevetment> — its shore has no stone`)
    else if (!/\blookId=/.test(rTag[0]) || !/\bbakeLastMs=/.test(rTag[0])) f.push(`${a.path} mounts <SlabRevetment> without lookId and bakeLastMs: ${rTag[0]}`)
  }
  for (const x of files) {
    if (x.path.endsWith('components/SetPiece.jsx')) continue
    for (const r of R) if (r.file && new RegExp(`import \\w+ from '[^']*${r.file.split('/').pop()}(\\.jsx)?'`).test(x.src))
      f.push(`${x.path} imports the set-piece renderer ${r.comp} directly — mount <SetPiece> instead`)
  }
  // ⭐ The slot lights every set-piece (BRIEF-set-piece-contract item 3): a renderer must declare the extent the
  // uplights aim at and draw the slot's children in its base frame, or its set-piece stands dark.
  for (const r of R) {
    const src = r.file && files.find(x => x.path.replace(/\.jsx?$/, '').endsWith(r.file.split('/').pop()))?.src
    if (!src) continue
    if (!new RegExp(`${r.comp}\\.extent\\s*=\\s*\\{[^}]*topM[^}]*halfWidthM`).test(src)) f.push(`${r.comp} declares no ${r.comp}.extent = { topM, halfWidthM } — the slot's uplights cannot aim at it`)
    if (!/\{\s*children\b/.test(src)) f.push(`${r.comp} does not draw {children} — the slot's lighting never reaches its base frame`)
  }
  // ⭐ THE STONE RIDES THE TERRAIN LIFT (Argon, 2026-10-07): every material SlabRevetment draws with is patched by a kit
  // lift (terrainShader.js patchTerrain*), so it follows the live exaggeration like the ground. It was draped once at
  // exag 1 and floated or sank in Plan, through the reveal's swell, and on any town authored at another exaggeration.
  const rev = files.find(x => x.path.endsWith('components/SlabRevetment.jsx'))
  if (rev) {
    const c = code(rev.src), used = [...new Set([...c.matchAll(/\bmaterial=\{(\w+)\}/g)].map(m => m[1]))]
    if (!used.length) f.push('SlabRevetment.jsx draws with no material={…} this check can read — cannot verify the stone rides the terrain lift')
    for (const id of used) {
      const d = c.match(new RegExp(`const ${id}\\s*=\\s*([^\\n]*)`))
      if (!d || !/patchTerrain\w*\(/.test(d[1])) f.push(`SlabRevetment.jsx draws with ${id}, which no kit terrain lift patches — the stone ignores the live exaggeration`)
    }
  }
  for (const k of declaredKinds) if (!R.some(r => r.kind === k.kind)) f.push(`${k.town} declares set-piece kind "${k.kind}"; SetPiece.jsx has no renderer for it`)
  return { f, info }
}

const files = walk(SRC).map(p => ({ path: relative(ROOT, p), src: readFileSync(p, 'utf8') }))
const mountSrc = readFileSync(MOUNT, 'utf8')
const declaredKinds = []
for (const n of readdirSync(join(SRC, 'instances')).filter(n => n.endsWith('.js') && n !== 'registry.js')) {
  const m = (await import(join(SRC, 'instances', n))).default
  if (m?.setPiece?.kind) declaredKinds.push({ town: n.replace(/\.js$/, ''), kind: m.setPiece.kind })
}

if (process.argv.includes('--self-test')) {
  // The mounts every app shares live in the one assembly, so that is where they are cut.
  const app = files.find(x => x.path.endsWith('components/Town.jsx'))
  const cases = [
    ['an app drops its mount', () => audit(files.map(x => x === app ? { ...x, src: x.src.replace(/<SetPiece\b[^>]*\/>/g, '') } : x), mountSrc, declaredKinds).f.length],
    ['an app drops the revetment', () => audit(files.map(x => x === app ? { ...x, src: x.src.replace(/<SlabRevetment\b[^>]*\/>/g, '') } : x), mountSrc, declaredKinds).f.length],
    ['an app mounts the revetment without its bake token', () => audit(files.map(x => x === app ? { ...x, src: x.src.replace(/(<SlabRevetment\b[^>]*?)\s*bakeLastMs=\{[^}]*\}\}?/g, '$1') } : x), mountSrc, declaredKinds).f.length],
    ['an app hand-mounts the renderer', () => audit([...files, { path: 'src/fake/App.jsx', src: "import PilgrimMonument from '../components/PilgrimMonument.jsx'" }], mountSrc, declaredKinds).f.length],
    ['a new app with no mount', () => audit([...files, { path: 'src/fake/NewApp.jsx', src: '<Canvas><BakedGround /></Canvas>' }], mountSrc, declaredKinds).f.length],
    ['a kind with no renderer', () => audit(files, mountSrc, [...declaredKinds, { town: 'town-2', kind: 'lighthouse' }]).f.length],
    ['a renderer declares no extent', () => audit(files.map(x => /PilgrimMonument\.jsx$/.test(x.path) ? { ...x, src: x.src.replace(/PilgrimMonument\.extent\s*=/, 'PilgrimMonument.nothing =') } : x), mountSrc, declaredKinds).f.length],
    ['the revetment drape skips the terrain lift', () => audit(files.map(x => /SlabRevetment\.jsx$/.test(x.path) ? { ...x, src: x.src.replace('patchTerrain(drape.material, { perVertex: true }); ', '') } : x), mountSrc, declaredKinds).f.length],
    ['the revetment stones skip the terrain lift', () => audit(files.map(x => /SlabRevetment\.jsx$/.test(x.path) ? { ...x, src: x.src.replace('patchTerrainInstancedBaked(stone.material); ', '') } : x), mountSrc, declaredKinds).f.length],
    ['a renderer drops the slot\'s children', () => audit(files.map(x => /PilgrimMonument\.jsx$/.test(x.path) ? { ...x, src: x.src.replace(/\{\s*children\b/g, '{ kids') } : x), mountSrc, declaredKinds).f.length],
  ]
  let bad = 0
  for (const [n, run] of cases) { const c = run() > 0; if (!c) bad++; console.log(`${c ? '✅ caught' : '⛔ MISSED'} — ${n}`) }
  process.exit(bad ? 1 : 0)
}

const { f, info } = audit(files, mountSrc, declaredKinds)
console.log(info.join('\n'))
console.log(`declared set-pieces: ${declaredKinds.map(k => `${k.town}:${k.kind}`).join(', ') || 'none'}`)
if (f.length) { console.log(`⛔ FAIL\n   ${f.join('\n   ')}`); process.exit(1) }
console.log('✅ every app that draws a town mounts <SetPiece> and <SlabRevetment>; no hand-mounts; every declared kind has a renderer; the stone rides the terrain lift')
