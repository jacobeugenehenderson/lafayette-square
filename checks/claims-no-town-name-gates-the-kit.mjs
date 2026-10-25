#!/usr/bin/env node
/**
 * "DOES ANY KIT CODE STILL DECIDE BY A TOWN'S NAME?" — BRIEF-ls-bleed-excision (Jacob, 2026-10-07: "fix the LS
 * danglers").
 *
 * WHY. Act 0 let `scene === 'lafayette-square'` stand where it read LS's OWN files ("a source, not a fallback"). Each
 * such gate is a decision the TOWN should declare in its own data, and each copy is a place town #2 can be handed
 * town #1's answer — bake-labels did exactly that: a town missing its ribbons got Lafayette Square's to label
 * (2026-10-07, now a loud refusal). A gate answered by the town's own data never needs reading again.
 *
 * ⭐ READS THE SOURCE. The town ids are whatever cartograph/data/ and public/looks/index.json hold; the code is every
 * tracked cartograph/*.js|mjs outside _archive/ and data/, every checks/*.mjs|js, and the kit runtime under src/lib/ —
 * widened 2026-10-07 after claims-orphaned-customs read LS's src/data/ribbons.json for EVERY town and nothing caught it,
 * because this scanned cartograph/ only. A GATE is a town id as a string literal, a comparison with DEFAULT_MAP, or a
 * read of one town's bundled data (src/data/…; a source MODULE there, loadInstanceData.js, is code, not data), on a code
 * line (comments excluded). This file is not scanned: its tables below ARE the literals.
 * ⭐ A FIXTURE — a town id given as plain input data to a pure function — carries FIXTURE_TAG (below) on its line, and is
 *    COUNTED, never silent. A check that MEASURES a real town picked by name is not a fixture.
 * ⛔ HELD — the gates still awaiting a ruling, each NAMED with where its ruling stands. This is not a skip list to grow:
 *    an entry is only ever REMOVED (when its gate goes), a held entry whose gate is gone FAILS (stale), and any gate not
 *    held FAILS. Adding an entry is a decision for Jacob, recorded in the commit that adds it.
 *
 * ⭐⭐ RULE B, KIT AND RUNTIME (Jacob, 2026-10-21: the LS default goes "once and for all"): over EVERY tracked .js/.mjs/.jsx/
 *    .cjs/.ts outside scratch/, public/, _archive/ and cartograph/data/ (not only the three directories above), two shapes
 *    are gates under the same HELD tables: a DEFAULT NAMING A TOWN (a `DEFAULT…`/`LEGACY…` constant bound to a town id, a
 *    `|| '<town>'` / `?? '<town>'` fallback, a `= '<town>'` parameter default) and a BRANCH ON A TOWN'S NAME (`=== '<town>'`,
 *    `!== '<town>'`, or the same against a TOWN-BOUND CONSTANT — an UPPER_SNAKE const bound to a town id: an exported one
 *    aliases everywhere, a file-local one in its own file; read from the source, never a list of names), and a TOWN LISTED
 *    IN A SET OR ARRAY literal — `new Set(['<town>'])`, `['<town>', …].includes(…)` — or a constant bound to one and asked
 *    `.has(…)`/`.includes(…)`: membership in a typed-in list of towns is the same branch (found 2026-10-21: a store's
 *    `BUNDLED_MAPS = new Set(['<town>'])` read as `BUNDLED_MAPS.has(scene)` passed). A file named for
 *    the town (`src/instances/huron.js`) naming only itself is that town's own declaration, not a gate. A table keyed by
 *    town (`'huron': …`) is a declaration table: COUNTED and listed, not failed — the per-town bleed tables are held above.
 * ⭐ MUTATION TEST (`--selftest`, on planted sources in memory): Rule B narrowed to the old three directories · aliases off ·
 *    fallbacks off · membership lists off → each RED; the planted own-declaration and keyed table stay out of the gates.
 *
 *   node checks/claims-no-town-name-gates-the-kit.mjs [--selftest]
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const towns = new Set(readdirSync(join(ROOT, 'cartograph/data'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name))
try { for (const l of JSON.parse(readFileSync(join(ROOT, 'public/looks/index.json'), 'utf8')).looks || []) if (l?.id && l.id !== 'kit-default') towns.add(l.id) } catch {}

// file → [{ match: a substring of the line, why }]. Remove an entry when its gate goes.
const HELD = {
  'cartograph/derive-ls-render-ledger.js': [{ match: "'lafayettesquare'", why: "LS's ledger generator, one town's tool by construction (its name says so)" },
                                 { match: "const SRC = join(ROOT, 'src', 'data', 'buildings.json')", why: 'the same tool reading LS\'s own content' }],
}
// lines reading one town's bundled data (src/data/…) — the same gate without the name; each awaits a ruling
const HELD_BUNDLED = {
  'cartograph/serve.js':          ["join(REPO_ROOT, 'src', 'data', 'buildings.json'),"],                                  // LS content (G4) as a dirty input
  'cartograph/derive.js':         ["join(CARTOGRAPH_DIR, '..', 'src', 'data', 'buildings.json'), 'utf-8'"],            // LS's content buildings (G4)
  'cartograph/survey.js':         ["const assessorPath = join(PROJECT_DIR, 'src', 'data', 'blocks_clean.json')"],      // LS's assessor blocks
  'cartograph/seed-centerlines.js': ["const SRC_DATA = join(import.meta.dirname, '..', 'src', 'data')"],               // an LS seeding tool
  'cartograph/probe-feature-elevation.js': ["join(ROOT, 'src/data/ribbons.json')", "join(ROOT, 'src/data/park-feature-elev.json')"],  // an LS probe
}
for (const [f, ms] of Object.entries(HELD_BUNDLED)) for (const m of ms) (HELD[f] ||= []).push({ match: m, why: 'one town\'s bundled data (src/data/…), found 2026-10-07 — unruled' })
// checks/ lines held by ruling (Boz, 2026-10-07)
HELD['checks/claims-stage-controls-are-live.mjs'] = [{ match: `t.indexOf("'lafayettesquare': {")`, why: "reads src/cartograph/CartographApp.jsx's per-town scene-config block by its key — the bleed is THAT block (runtime, outside this scope); this goes with it" }]

// ⛔ LS PROBES — files that are one town's forensic BY CONSTRUCTION (their subject is Lafayette Square's own data or
// history). Held whole, by file. A probe file with no town literal left FAILS (stale), so the table only shrinks.
const LS_PROBES = {
  'checks/claims-dblock-arc-diagnosis.mjs':          'an LS probe — the D-block arc on LS\'s promoted ribbons (says so in its header)',
  'checks/claims-corner-takeover.mjs':               'an LS probe — asks whether any town carries a decline mode LAFAYETTE SQUARE lacks (LS is the reference by design)',
  'checks/claims-boundary-record-split.mjs':         'an LS probe — section C is LS\'s survival test across a rescope',
  'checks/claims-prominence-recovers-ls-landmarks.mjs': 'an LS probe — recovers LS\'s curated landmarks (its name says so)',
}

// ⛔⛔ TO WALK THE TOWNS — checks that measure ONE town picked by name (a silent default `|| 'lafayette-square'`, or a
// subject chosen by name) instead of walking the registry (`checks/_scenes.mjs` scenes(<artifact>)). Jacob, 2026-10-07:
// "PLEASE either fix this or add it to the other things marked to eliminate" — this is that list. ⛔ IT MAY ONLY SHRINK:
// an entry whose file no longer carries the literal FAILS (stale) until it is removed, and a new single-town check is
// not admitted here — it fails above. ROADMAP carries the line.
const TO_WALK = [
  'curvature-vs-band', 'divided-seam-step', 'handle-rides-its-arc',
  'live-palette-equals-the-bake', 'neon-per-place',
  'swap-reaches-the-paint', 'the-beach-band-is-the-towns-own', 'the-light-follows-the-weather', 'uturn-outer-edge-walk',
].map(n => `checks/claims-${n}.mjs`)
const fileHeld = new Map([...Object.entries(LS_PROBES), ...TO_WALK.map(f => [f, 'TO WALK the towns (Jacob 2026-10-07, shrink-only)'])])

let failed = 0
const check = (ok, what, detail = '') => { console.log(`  ${ok ? '✅ pass' : '❌ FAIL'}  ${what}${!ok && detail ? `\n           ${detail}` : ''}`); if (!ok) failed++ }

const SELF = 'checks/claims-no-town-name-gates-the-kit.mjs'
const FIXTURE_TAG = '/* fixture */'   // a town id as plain input data to a pure function: counted, never silent
// Rule A's scope (cartograph/, checks/, the kit runtime src/lib/) and Rule B's (all kit and runtime code)
const RULE_A = (f) => /^(cartograph|checks)\/.*\.(m?js)$/.test(f) || /^src\/lib\/.*\.(m?js)$/.test(f)
const RULE_B = (f) => /\.(m?js|jsx|cjs|ts)$/.test(f) && !/^(scratch|public|dist|node_modules)\//.test(f)
const OUT = (f) => f === SELF || f.includes('/_archive/') || f.startsWith('cartograph/data/')
const esc = (t) => t.replace(/[-]/g, '\\-')
const unblock = (text) => text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))   // /* … */, JSX's {/* … */} included
const codeOf = (line) => { const c = line.replace(/\/\/.*$/, '').trim(); return !c || c.startsWith('*') || c.startsWith('/*') ? '' : c }

/** The scan, pure: `sources` Map(file → text), `towns` Set. `opt` exists for the mutants: { ruleB, alias, fallback }. */
export function scan(sources, towns, opt = {}) {
  const ruleB = opt.ruleB || RULE_B, useAlias = opt.alias !== false, useFallback = opt.fallback !== false, useLists = opt.lists !== false
  const T = [...towns].map(esc).join('|')
  const lit = new RegExp(`['"\`](${T})['"\`]`)
  const alias = /(===|!==)\s*DEFAULT_MAP\b|\bDEFAULT_MAP\s*(===|!==)/
  // ONE TOWN'S BUNDLED DATA (src/data/…) read by kit code is the same gate without the name — bake-labels' fallback to
  // src/data/ribbons.json named no town and handed every town LS's streets.
  const bundled = /['"`]src\/data\/(?!\$\{|loadInstanceData\.js)|['"`]src['"`]\s*,\s*['"`]data['"`](?!\s*,\s*(scene|bakeScene|SCENE)\b)/   // src/data/<scene>/… is per-town: fine
  // Rule B's shapes, read from the source: town-bound constants (an exported one aliases everywhere, a local one in its file)
  const BIND = new RegExp(`\\b(export\\s+)?const\\s+([A-Z][A-Z0-9_]*)\\s*=\\s*['"\`](?:${T})['"\`]`)
  // a town LISTED: a Set or array literal holding a town id (the binding line itself is a gate; its .has/.includes uses too)
  const LIST = new RegExp(`(new\\s+Set\\s*\\(\\s*)?\\[[^\\]]*['"\`](${T})['"\`][^\\]]*\\]`)
  const BINDLIST = new RegExp(`\\b(export\\s+)?const\\s+([A-Z][A-Z0-9_]*)\\s*=\\s*(new\\s+Set\\s*\\(\\s*)?\\[[^\\]]*['"\`](?:${T})['"\`]`)
  const listExported = new Set(), listLocal = new Map()
  const exported = new Set(), local = new Map()
  for (const [f, text] of sources) if (ruleB(f) && !OUT(f)) for (const line of unblock(text).split('\n')) { const m = codeOf(line).match(BIND)
    if (m) { if (m[1]) exported.add(m[2]); else (local.get(f) || local.set(f, new Set()).get(f)).add(m[2]) }
    const l = useLists && codeOf(line).match(BINDLIST)
    if (l) { if (l[1]) listExported.add(l[2]); else (listLocal.get(f) || listLocal.set(f, new Set()).get(f)).add(l[2]) } }
  const DEF_NAME = new RegExp(`\\bconst\\s+[A-Z_]*(DEFAULT|LEGACY)[A-Z0-9_]*\\s*=\\s*['"\`](?:${T})['"\`]`)
  const BRANCH = new RegExp(`(===|!==)\\s*['"\`](${T})['"\`]|['"\`](${T})['"\`]\\s*(===|!==)`)
  const FALLBACK = new RegExp(`(\\|\\||\\?\\?)\\s*['"\`](${T})['"\`]|(^|[(,{])\\s*[A-Za-z_$][\\w$]*\\s*=\\s*['"\`](${T})['"\`]\\s*([,)}]|$)`)
  const ownOnly = (f, c) => { const base = f.split('/').pop().replace(/\.\w+$/, ''); if (!towns.has(base)) return false
    return !new RegExp(`['"\`](${[...towns].filter(t => t !== base).map(esc).join('|') || '(?!)'})['"\`]`).test(c) }
  const keyed = new RegExp(`['"\`](${T})['"\`]\\s*:`)
  const r = { gates: [], b: [], keyed: [], heldSeen: new Set(), fileSeen: new Set(), fixtures: 0 }
  for (const [f, text] of sources) {
    if (OUT(f)) continue
    const inA = RULE_A(f), inB = ruleB(f); if (!inA && !inB) continue
    const ids = useAlias ? [...(local.get(f) || []), ...exported] : []
    const AL = ids.length ? new RegExp(`(===|!==)\\s*(${ids.join('|')})\\b|\\b(${ids.join('|')})\\s*(===|!==)` + (useFallback ? `|(\\|\\||\\?\\?)\\s*(${ids.join('|')})\\b|(^|[(,{])\\s*[A-Za-z_$][\\w$]*\\s*=\\s*(${ids.join('|')})\\s*([,)}]|$)` : '')) : null
    const lids = useLists ? [...(listLocal.get(f) || []), ...listExported] : []
    const LU = lids.length ? new RegExp(`\\b(${lids.join('|')})\\s*\\.\\s*(has|includes)\\s*\\(`) : null
    const raw = text.split('\n')
    unblock(text).split('\n').forEach((line, i) => {
      const code = codeOf(line); if (!code) return
      const a = inA && (lit.test(code) || alias.test(code) || bundled.test(code))
      const b = inB && (DEF_NAME.test(code) || BRANCH.test(code) || (useFallback && FALLBACK.test(code)) || (AL && AL.test(code))
        || (useLists && (LIST.test(code) || (LU && LU.test(code))))) && !ownOnly(f, code)
      if (!a && !b) { if (inB && keyed.test(code) && !ownOnly(f, code)) r.keyed.push(`${f}:${i + 1}`); return }
      if (raw[i].includes(FIXTURE_TAG)) { r.fixtures++; return }   // the tag is itself a /* … */, so it is read off the raw line
      const held = (HELD[f] || []).find((h) => raw[i].includes(h.match))
      if (held) r.heldSeen.add(f + '|' + held.match)
      else if (fileHeld.has(f)) r.fileSeen.add(f)
      else (a ? r.gates : r.b).push(`${f}:${i + 1}  ${code.slice(0, 120)}`)
    })
  }
  return r
}

if (process.argv.includes('--selftest')) {
  // planted sources, in memory: one of each shape, and the two that must stay out
  const towns = new Set(['alpha', 'beta'])
  const planted = new Map([
    ['src/cartograph/View.jsx', "const isAlpha = scene === 'alpha'"],
    ['cartograph/defaults.js', "export const DEFAULT_TOWN = 'alpha'"],
    ['src/components/Panel.jsx', "if (lookId !== DEFAULT_TOWN) return null"],
    ['src/hooks/useTown.js', "const t = params.get('town') || 'alpha'"],
    ['src/instances/alpha.js', "export default { id: 'alpha', name: 'Alpha' }"],
    ['src/instances/registry.js', "const ALL = { 'alpha': a, 'beta': b }"],
    ['src/lib/note.js', "// scene === 'alpha' was the old gate"],
    ['checks/claims-planted.mjs', "const d = seed('alpha', 'beta') /* fixture */"],
    ['src/cartograph/stores/store.js', "export const BUNDLED = new Set(['alpha'])"],
    ['src/cartograph/Layers.jsx', "const isBundled = BUNDLED.has(scene)"],
    ['src/lib/pick.js', "if (['alpha', 'beta'].includes(town)) go()"],
    ['src/cartograph/Jsx.jsx', "{/* the old\n   scene === 'alpha' gate\n*/}"],
    ['arborist/bake.js', "export async function bake({\n  look,\n  scene = DEFAULT_TOWN,\n}) {}"],
  ])
  const want = (r, f) => [...r.gates, ...r.b].some(g => g.startsWith(f + ':'))
  const live = scan(planted, towns)
  const rows = [
    ['a branch on a town\'s name in src/cartograph is a gate (Rule B)', want(live, 'src/cartograph/View.jsx')],
    ['a DEFAULT constant naming a town is a gate', want(live, 'cartograph/defaults.js')],
    ['a branch on an exported town-bound constant in another file is a gate (the alias, read from the source)', want(live, 'src/components/Panel.jsx')],
    ['a `|| \'<town>\'` fallback is a gate', want(live, 'src/hooks/useTown.js')],
    ['a town\'s own file naming itself is not a gate', !want(live, 'src/instances/alpha.js')],
    ['a table keyed by town is listed, not a gate', !want(live, 'src/instances/registry.js') && live.keyed.some(k => k.startsWith('src/instances/registry.js:'))],
    ['a town listed in a Set literal is a gate, and so is its .has() in another file', want(live, 'src/cartograph/stores/store.js') && want(live, 'src/cartograph/Layers.jsx')],
    ['a town listed in an array tested with .includes() is a gate', want(live, 'src/lib/pick.js')],
    ['a line tagged /* fixture */ is counted, not a gate', !want(live, 'checks/claims-planted.mjs') && live.fixtures === 1],
    ['a comment is not a gate, a multi-line {/* … */} included', !want(live, 'src/lib/note.js') && !want(live, 'src/cartograph/Jsx.jsx')],
    ['a default on its own line (multi-line destructuring) naming a town-bound constant is a gate', want(live, 'arborist/bake.js')],
  ]
  for (const [m, ok] of rows) console.log(`  ${ok ? '✅' : '⛔'} ${m}`)
  let bad = rows.some(r => !r[1]) ? 1 : 0
  for (const [what, opt, f] of [['Rule B narrowed to the old three directories', { ruleB: RULE_A }, 'src/cartograph/View.jsx'],
                                ['aliases off', { alias: false }, 'src/components/Panel.jsx'],
                                ['fallbacks off', { fallback: false }, 'src/hooks/useTown.js'],
                                ['membership lists off', { lists: false }, 'src/cartograph/Layers.jsx']]) {
    const red = !want(scan(planted, towns, opt), f)
    console.log(`  ${red ? '✅' : '⛔'} mutant · ${what}: ${red ? 'RED, as it must be' : 'still GREEN — the check cannot see it'}`); if (!red) bad++ }
  process.exit(bad ? 1 : 0)
}

const files = (process.env.GATES_FILES ? process.env.GATES_FILES.split(',') : execSync('git ls-files "*.js" "*.mjs" "*.jsx" "*.cjs" "*.ts"', { cwd: ROOT, encoding: 'utf8' }).trim().split('\n'))
  .filter((f) => f && (RULE_A(f) || RULE_B(f)) && !OUT(f) && existsSync(join(ROOT, f)))
const R = scan(new Map(files.map(f => [f, readFileSync(join(ROOT, f), 'utf8')])), towns)
console.log(`towns: ${[...towns].sort().join(', ')} · ${files.length} kit and runtime files scanned · ${R.fixtures} fixture line(s) tagged · ${R.keyed.length} line(s) of tables keyed by town (declarations: listed, not failed)`)
check(R.gates.length === 0, 'no kit code decides by a town\'s name, outside the HELD rulings (Rule A: cartograph/, checks/, src/lib/)', R.gates.join('\n           '))
check(R.b.length === 0, 'no default names a town and no code branches on a town\'s name, anywhere in kit or runtime (Rule B)', R.b.join('\n           '))
const stale = Object.entries(HELD).flatMap(([f, hs]) => hs.filter((h) => !R.heldSeen.has(f + '|' + h.match)).map((h) => `${f}: "${h.match}"`))
check(stale.length === 0 || process.env.GATES_FILES, 'every HELD entry still names a live gate (remove an entry when its gate goes)', stale.join('\n           '))
const staleFiles = [...fileHeld.keys()].filter((f) => !R.fileSeen.has(f))
check(staleFiles.length === 0 || process.env.GATES_FILES, `every LS probe and TO-WALK file still carries its town literal (${TO_WALK.length} to walk · ${Object.keys(LS_PROBES).length} LS probes — remove an entry when its literal goes)`, staleFiles.join('\n           '))
console.log(`\n  HELD (awaiting a ruling — each is a decision the town should declare in its own data):`)
for (const [f, hs] of Object.entries(HELD)) for (const h of hs) console.log(`    ${f}: ${h.why}`)
console.log(failed ? `\n❌ ${failed} failed` : '\n✅ all passed')
process.exit(failed ? 1 : 0)
