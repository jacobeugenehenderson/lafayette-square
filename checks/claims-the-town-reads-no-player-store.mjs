#!/usr/bin/env node
/**
 * "CAN AN APP DRAW THE TOWN WITHOUT BEING THE OLD PLAYER?"
 *
 * WHY (2026-09-27, BRIEF-one-town-assembly §4). The Ward imports the town's renderer from the kit
 * and must never fork it — so the renderer may not require the old player's state. Its inputs are
 * <Town>'s props. Inside, ONE bridge module (src/components/TownBridge.jsx) feeds those props into
 * the stores the leaves still read (camera shot, selection); that is the renderer's internal state,
 * and nothing else writes it from outside. Moving the leaves off those stores is a follow-up brief
 * (Warden's ruling 4); this check lists them so that brief starts from a census.
 *
 * THE RENDERER is READ, never listed: the import closure of src/components/Town.jsx (static and
 * dynamic imports, local files only). The walk stops AT a player store: a leaf reading one is the
 * follow-up's census, and what the store itself imports is the old player, not the renderer.
 * Fails when:
 *   · Town.jsx, the bridge or the quality-profile module does not exist
 *   · Town.jsx imports a player store itself — only the bridge may
 *   · a renderer file imports the user's location or the landmark filter (the player's overlays)
 *   · a renderer file reads `data-scene-pause` or imports `FRAMED` (pausing arrives as a prop)
 *   · a renderer file, or an app that mounts <Town>, imports the device sniff (lib/isMobile) —
 *     the device question is answered in ONE module, src/lib/qualityProfile.js
 *   · any file but the bridge writes the camera store's `townShot` (the shot is a prop), or a
 *     renderer file reads the old player's `viewMode` (the camera state machine) instead of it
 *   · a renderer file reads the BOOT town's place on the globe (INSTANCE.geography's lat / lon /
 *     metre scales / timezone, or the whole object) — the town it draws is the one it is given, and
 *     a live town switch must not keep the boot town's sun. A place NAME (cityState, stateCode) is
 *     a label, not a position, and is not this class. ONE module owns the boot town's place,
 *     src/lib/townPlace.js; the renderer asks it, and only the bridge moves it (setTownPlace).
 *   · ANY file Town pulls in — walked THROUGH the player stores this time, because the bundle does —
 *     imports src/instance.js or src/instances/ (Warden, 2026-09-28, from Quire's measurement). The
 *     town is <Town town>, passed in. instance.js resolves an unknown Look to the default town with
 *     only a console line to say so (Layer 0 q2 inside the assembly), and the registry carries every
 *     town's identity into any app that imports <Town>.
 *
 * ⛔ READ-ONLY. Usage: node checks/claims-the-town-reads-no-player-store.mjs [--self-test]
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, relative, resolve, dirname } from 'path'

const ROOT = new URL('..', import.meta.url).pathname
const SRC = join(ROOT, 'src')
const TOWN = 'src/components/Town.jsx'
const BRIDGE = 'src/components/TownBridge.jsx'
const PROFILE = 'src/lib/qualityProfile.js'
const PLACE = 'src/lib/townPlace.js'
const PLAYER_STORES = ['useCamera', 'useSelectedBuilding', 'useLandmarkFilter', 'useListings', 'useUserLocation']
const OVERLAY_STORES = ['useUserLocation', 'useLandmarkFilter']
// ⏳ KNOWN OPEN, still RED: the failure names the brief that closes it. Not an exemption — a time-box made visible.
const OPEN = {
  'src/data/buildings.js': 'the live-building path (LafayetteScene\'s live Buildings, SceneNeon\'s no-slab fallback) — deleted by docs/briefs/BRIEF-live-building-palette.md',
  'src/hooks/useListings.js': 'reached through SceneNeon (neon reads each place\'s hours) — the leaves brief moves neon onto props (Warden, 2026-09-28)',
  'src/instance.js': 'reached only through the two loaders above',
}
const GLOBE_RE = /INSTANCE\.geography(?!\.(cityState|stateCode)\b)/
const EXTS = ['', '.js', '.jsx', '.mjs', '/index.js', '/index.jsx']

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(jsx?|mjs)$/.test(n)) out.push(p)
  }
  return out
}

const SPEC_RE = /(?:^\s*(?:import|export)\b[^;'"()]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\))/gm
function specsOf(src) { return [...src.matchAll(SPEC_RE)].map(m => m[1] || m[2] || m[3]) }
function resolveSpec(byPath, fromPath, spec) {
  if (!spec.startsWith('.')) return null
  const base = relative(ROOT, resolve(ROOT, dirname(fromPath), spec.split('?')[0]))
  for (const e of EXTS) if (byPath.has(base + e)) return base + e
  return null
}
const isStoreModule = (p) => PLAYER_STORES.some(s => new RegExp(`/hooks/${s}\\.jsx?$`).test(p))
export function closureOf(files, entry, { throughStores = false } = {}) {
  const byPath = new Map(files.map(x => [x.path, x]))
  const seen = new Set([entry]), q = [entry]
  while (q.length) {
    const p = q.shift(), x = byPath.get(p)
    if (!x || (!throughStores && isStoreModule(p))) continue
    for (const s of specsOf(x.src)) { const r = resolveSpec(byPath, p, s); if (r && !seen.has(r)) { seen.add(r); q.push(r) } }
  }
  return [...seen].map(p => byPath.get(p)).filter(Boolean)
}
const importsStore = (x, store) => specsOf(x.src).some(s => new RegExp(`/${store}(\\.jsx?)?$`).test(s))
const code = (src) => src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
const importsSniff = (x) => specsOf(x.src).some(s => /\/isMobile(\.js)?$/.test(s))

export function audit(files) {
  const f = [], info = []
  for (const p of [TOWN, BRIDGE, PROFILE, PLACE]) if (!files.some(x => x.path === p)) f.push(`${p} does not exist`)
  if (f.length) return { f, info }
  const renderer = closureOf(files, TOWN).filter(x => !isStoreModule(x.path))
  info.push(`renderer: ${renderer.length} files in the import closure of ${TOWN}`)
  const town = files.find(x => x.path === TOWN)
  for (const s of PLAYER_STORES) if (importsStore(town, s)) f.push(`${TOWN} imports the player store ${s} — only ${BRIDGE} may`)
  if (!renderer.some(x => x.path === BRIDGE)) f.push(`${TOWN} does not reach ${BRIDGE} — its props feed nothing`)
  for (const x of renderer) {
    for (const s of OVERLAY_STORES) if (importsStore(x, s)) f.push(`${x.path} (renderer) imports ${s} — the player's overlay, not the town`)
    if (/data-scene-pause/.test(x.src.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, ''))) f.push(`${x.path} (renderer) reads data-scene-pause — pausing is <Town paused>`)
    if (/import\s*\{[^}]*\bFRAMED\b[^}]*\}/.test(x.src)) f.push(`${x.path} (renderer) imports FRAMED — the embed's state is the app's`)
    if (/useCamera\.getState\(\)\.viewMode|useCamera\(\s*\(?\w+\)?\s*=>\s*\w+\.viewMode/.test(code(x.src))) f.push(`${x.path} (renderer) reads the old player's viewMode — read townShot (<Town shot>)`)
    if (x.path !== PROFILE && importsSniff(x)) f.push(`${x.path} (renderer) imports the device sniff — read the quality profile (${PROFILE})`)
    if (x.path !== PLACE && GLOBE_RE.test(x.src.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, ''))) f.push(`${x.path} (renderer) reads the boot town's place on the globe (INSTANCE.geography) — not the town it is drawing`)
  }
  // The town's identity is passed in: nothing Town reaches — stores included — resolves it from the kit.
  for (const x of closureOf(files, TOWN, { throughStores: true })) {
    const hit = specsOf(x.src).filter(sp => /(^|\/)instance(\.js)?$|\/instances\//.test(sp))
    if (hit.length) f.push(`${x.path} (reached by <Town>) imports ${hit.join(', ')} — the town is <Town town>, never the kit's registry${OPEN[x.path] ? `\n      ⏳ OPEN: ${OPEN[x.path]}` : ''}`)
  }
  for (const x of files) {
    if (x.path === BRIDGE) continue
    if (/^import\s+Town\b[^;\n]*from\s+'[^']*\/Town(\.jsx)?'/m.test(x.src) && importsSniff(x)) f.push(`${x.path} mounts <Town> and imports the device sniff — the device question is ${PROFILE}'s`)
    if (x.path !== PLACE && /\bsetTownPlace\s*\(/.test(x.src)) f.push(`${x.path} moves the town's place — only ${BRIDGE} does (the place is <Town lookId>'s)`)
    if (!x.path.endsWith('hooks/useCamera.js') && /townShot\s*:/.test(x.src)) f.push(`${x.path} writes the camera store's townShot — only ${BRIDGE} does (the shot is <Town shot>)`)
    if (/shotOverride/.test(x.src)) f.push(`${x.path} still names shotOverride — the shot is townShot, written by ${BRIDGE}`)
  }
  // The census the follow-up brief starts from: leaves that still read a player store.
  const leaves = renderer.filter(x => x.path !== BRIDGE && PLAYER_STORES.some(s => importsStore(x, s)))
  info.push(`leaves still reading a player store (follow-up brief): ${leaves.map(x => `${x.path.replace('src/', '')} [${PLAYER_STORES.filter(s => importsStore(x, s)).join(' ')}]`).join(', ') || 'none'}`)
  return { f, info }
}

const files = walk(SRC).map(p => ({ path: relative(ROOT, p), src: readFileSync(p, 'utf8') }))

if (process.argv.includes('--self-test')) {
  if (![TOWN, BRIDGE, PROFILE, PLACE].every(p => existsSync(join(ROOT, p)))) { console.log('⛔ cannot self-test: the assembly does not exist yet'); process.exit(1) }
  const swap = (path, fn) => files.map(x => x.path === path ? { ...x, src: fn(x.src) } : x)
  const leaf = closureOf(files, TOWN).filter(x => !isStoreModule(x.path)).find(x => x.path.endsWith('SlabBuildings.jsx')).path
  const cases = [
    ['Town imports a player store', () => audit(swap(TOWN, s => `import useCamera from '../hooks/useCamera'\n` + s)).f.length],
    ['a leaf imports the device sniff', () => audit(swap(leaf, s => `import { IS_MOBILE } from '../lib/isMobile.js'\n` + s)).f.length],
    ['a leaf reads data-scene-pause', () => audit(swap(leaf, s => s + `\nconst p = document.querySelector('[data-scene-pause]')`)).f.length],
    ['a leaf imports the user location', () => audit(swap(leaf, s => `import useUserLocation from '../hooks/useUserLocation'\n` + s)).f.length],
    ['a leaf reads the boot town\'s geography', () => audit(swap(leaf, s => s + `\nconst LAT = INSTANCE.geography.lat`)).f.length],
    ['an app writes the town\'s shot', () => audit(swap('src/preview/PreviewApp.jsx', s => s + `\nuseCamera.setState({ townShot: 'hero' })`)).f.length],
    ['a leaf reads the player\'s viewMode', () => audit(swap(leaf, s => s + `\nconst v = useCamera.getState().viewMode`)).f.length],
    ['an app that mounts Town sniffs the device', () => audit(swap('src/components/Scene.jsx', s => `import { IS_MOBILE } from '../lib/isMobile.js'\n` + s)).f.length],
    ['an app moves the town\'s place', () => audit(swap('src/cartograph/CartographApp.jsx', s => s + `\nsetTownPlace(geo, look)`)).f.length],
    ['a leaf imports the kit\'s instance', () => audit(swap(leaf, s => `import { INSTANCE } from '../instance.js'\n` + s)).f.length],
    ['the bridge is unreachable', () => audit(swap(TOWN, s => s.replace(/^import .*TownBridge.*$/m, ''))).f.length],
  ]
  // Caught means MORE failures than the tree has now — the known-open loaders keep the baseline red.
  const base = audit(files).f.length
  let bad = 0
  for (const [n, run] of cases) { const c = run() > base; if (!c) bad++; console.log(`${c ? '✅ caught' : '⛔ MISSED'} — ${n}`) }
  process.exit(bad ? 1 : 0)
}

const { f, info } = audit(files)
console.log(info.join('\n'))
if (f.length) { console.log(`⛔ FAIL (${f.length})\n   ${f.join('\n   ')}`); process.exit(1) }
console.log('✅ the town is drawn from its props: no player store outside the bridge, no device sniff outside the profile, no boot-town geography')
