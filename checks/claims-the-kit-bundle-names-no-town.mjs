// claims-the-kit-bundle-names-no-town.mjs — the kit bundle, the one set of files every town's Ward loads, carries no town.
//
// ⭐ THE CLAIM: no file the bundle ships (scripts/kit-bundle-set.mjs, the same two functions publish-kit-bundle.mjs runs, here
// on the working tree) has a path, or text content, that names a registered town (src/instances/registry.js: each town's map
// id, its Look id and its name, in the forms a file would spell it, never a list here). A town's own files live in its
// bake (`baked/<look>/`), published per town.
// ⛔ Why: the retired legacy player shipped every tracked public/ file to every town, so Lafayette Square's domain file, its
// business logos, its QR tool and an authoring snapshot were public under every town's staging player (Fuse, 2026-11-01).
// The bundle is what serves every town now; this keeps it town-blind.
//
// Usage: node checks/claims-the-kit-bundle-names-no-town.mjs [--mutants] [-v]
//   --mutants: an LS file restored to public/ and reached by kitUrl · a second town's file · a town name in a shipped css ·
//   a town spelled by its Look id in a shipped json.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, extname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT } from './_scenes.mjs'
import { importSource } from './_importSource.mjs'

const VERBOSE = process.argv.includes('-v')
const { registeredMaps, instanceForMap } = await import(pathToFileURL(join(ROOT, 'src/instances/registry.js')))
const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 })
const TEXT = new Set(['.js', '.mjs', '.json', '.css', '.svg', '.html', '.txt', '.xml'])

/** Every spelling of a town a file might carry: 'Lafayette Square' → lafayette square · lafayette-square · lafayette_square · lafayettesquare. */
function townSpellings() {
  const out = []
  for (const map of registeredMaps()) {
    const inst = instanceForMap(map) || {}
    const words = new Set([map, inst.lookId].filter(Boolean).map((s) => s.toLowerCase()))
    if (inst.name) {
      const w = inst.name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(Boolean)
      for (const sep of [' ', '-', '_', '']) words.add(w.join(sep))
    }
    for (const s of words) if (s.length >= 4) out.push({ map, s, re: new RegExp(`(^|[^a-z0-9])${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i') })
  }
  return out
}

async function verdict(m = {}) {
  const fails = []
  const K = await importSource('scripts/kit-bundle-set.mjs')
  let lines = []
  try { lines = git(['grep', '-n', '-e', 'kitUrl(', '--', 'src']).split('\n').filter(Boolean) } catch { /* none → refused */ }
  let tracked = git(['ls-files', '--', 'public']).split('\n').filter(Boolean).map((p) => ({ rel: p.slice('public/'.length) }))
  const added = new Map()   // rel → text, a mutant's file
  for (const [rel, text, site] of m.add || []) { tracked.push({ rel }); added.set(rel, text); lines.push(`src/__mutant.js:1:kitUrl('${site ?? rel}')`) }
  const { wants, unreadable } = K.kitWants(lines)
  if (!wants.size) fails.push('no kitUrl() call site under src/: the bundle set is empty, so this check measured nothing')
  if (unreadable.length) fails.push(`kitUrl() call sites the bundle cannot read: ${unreadable.join(' · ')}`)
  const { files } = K.kitBundleFiles(wants, tracked)
  const towns = townSpellings()
  for (const rel of files.keys()) {
    const p = towns.find((t) => t.re.test(rel))
    if (p) { fails.push(`${rel}: its path names ${p.map} ("${p.s}")`); continue }
    if (!TEXT.has(extname(rel).toLowerCase())) continue
    const text = added.has(rel) ? added.get(rel) : readFileSync(join(ROOT, 'public', rel), 'utf8')
    const c = towns.find((t) => t.re.test(text))
    if (c) fails.push(`${rel}: its content names ${c.map} ("${c.s}")`)
  }
  return { fails, n: files.size, towns: new Set(towns.map((t) => t.map)).size }
}

const { fails, n, towns } = await verdict()
if (fails.length) { console.log(`⛔ the kit bundle carries a town (${n} files, ${towns} registered towns):\n  · ` + fails.join('\n  · ')); process.exitCode = 1 }
else console.log(`✅ the kit bundle names no town: ${n} files, read against ${towns} registered towns`)

if (process.argv.includes('--mutants')) {
  const mutants = [
    ['an LS file restored to public/ and reached by kitUrl', { add: [['lafayette-square.svg', '<svg/>']] }],
    ["a second town's file", { add: [['looks/provincetown/design.json', '{}']] }],
    ['a town name in a shipped css', { add: [['styles/kit.css', ":root { --title: 'Huron Online'; }"]] }],
    ['a town spelled by its Look id in a shipped json', { add: [['clouds/extra.json', '{ "from": "hipointedemun" }']] }],
  ]
  let bad = 0
  for (const [name, m] of mutants) { const { fails: f } = await verdict(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${VERBOSE && f.length ? ` (${f[0]})` : ''}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
