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
 * tracked cartograph/*.js|mjs outside _archive/ and data/. A GATE is a town id as a string literal, a comparison with
 * DEFAULT_MAP, or a read of one town's bundled data (src/data/…), on a code line (comments excluded).
 * ⛔ HELD — the gates still awaiting a ruling, each NAMED with where its ruling stands. This is not a skip list to grow:
 *    an entry is only ever REMOVED (when its gate goes), a held entry whose gate is gone FAILS (stale), and any gate not
 *    held FAILS. Adding an entry is a decision for Jacob, recorded in the commit that adds it.
 *
 *   node checks/claims-no-town-name-gates-the-kit.mjs
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
  'cartograph/scene.js':        [{ match: "export const DEFAULT_MAP = 'lafayette-square'", why: 'the default map id itself (the held name every alias below compares with)' },
                                 { match: 'scene === DEFAULT_MAP ?', why: "ribbonsPathOf's one case: LS's ribbons ship in src/data — G2(b) Phase 0e, Jacob's call" }],
  'cartograph/bake-lamps.js':   [{ match: "scene === 'lafayette-square'", why: "G1: LS's authored lamps at src/data/street_lamps.json → data/<scene>/authored_lamps.json, awaiting Jacob" }],
  'cartograph/bake-content.js': [{ match: "scene === 'lafayette-square' && !force", why: "G4: LS's hand-curated content — is it a different producer, or baked like every town's? awaiting Jacob" }],
  'cartograph/serve.js':        [{ match: 'const isDefaultMap = bakeScene === DEFAULT_MAP', why: "G5: LS's elevation cache + its HELD status (ruling Q3) + G4's content step, awaiting Jacob" },
                                 { match: "const LEGACY_LS_LOOK_ID = 'lafayette-square'", why: 'a one-time boot migration naming the Look it creates from a pre-Looks overlay; never a fallback target' }],
  'cartograph/derive.js':       [{ match: 'const lampSourcePath = SCENE === DEFAULT_MAP', why: "found 2026-10-07: LS's lamp export lives in scripts/raw/ — unruled" }],
  'cartograph/pour-code.mjs':   [{ match: "scene === DEFAULT_MAP ? join(REPO_ROOT, 'scripts', 'raw', 'osm_street_lamps.json')", why: "found 2026-10-07: the same LS lamp export, as a pour input — unruled" }],
  'cartograph/geography.mjs':   [{ match: 'if (scene !== DEFAULT_MAP)', why: "found 2026-10-07: LS's geography from its registry module, every other town's from data/<scene>/geography.json — unruled" }],
  'cartograph/pipeline.js':     [{ match: 'if (SCENE === DEFAULT_MAP && existsSync(projectBldgPath))', why: "found 2026-10-07: LS's project buildings — unruled" }],
  'cartograph/derive-ls-render-ledger.js': [{ match: "'lafayette-square'", why: "LS's ledger generator, one town's tool by construction (its name says so)" },
                                 { match: "const SRC = join(ROOT, 'src', 'data', 'buildings.json')", why: 'the same tool reading LS\'s own content' }],
}
// lines reading one town's bundled data (src/data/…) — the same gate without the name; each awaits a ruling
const HELD_BUNDLED = {
  'cartograph/bake-lamps.js':     ["const p = join(ROOT, 'src', 'data', 'street_lamps.json')"],                       // G1
  'cartograph/serve.js':          ["const STREET_LAMPS = join(REPO_ROOT, 'src', 'data', 'street_lamps.json')",         // G1
                                   "? ['src/data/ribbons.json → promote-ribbons has no record yet",                      // G5 (the message)
                                   "join(REPO_ROOT, 'src', 'data', 'buildings.json'),",                                  // LS content (G4) as a dirty input
                                   "`src/data/ribbons.json`,"],                                                          // G2(b)
  'cartograph/derive.js':         ["join(CARTOGRAPH_DIR, '..', 'src', 'data', 'buildings.json'), 'utf-8'"],            // LS's content buildings (G4)
  'cartograph/pipeline.js':       ["const projectBldgPath = join(PROJECT_ROOT, 'src', 'data', 'buildings.json')"],     // LS's project buildings
  'cartograph/survey.js':         ["const assessorPath = join(PROJECT_DIR, 'src', 'data', 'blocks_clean.json')"],      // LS's assessor blocks
  'cartograph/seed-centerlines.js': ["const SRC_DATA = join(import.meta.dirname, '..', 'src', 'data')"],               // an LS seeding tool
  'cartograph/litmus-curb-parallel.mjs': ["path.join(ROOT, 'src/data/ribbons.json')"],                                 // an LS litmus (Check A)
  'cartograph/probe-feature-elevation.js': ["join(ROOT, 'src/data/ribbons.json')", "join(ROOT, 'src/data/park-feature-elev.json')"],  // an LS probe
}
for (const [f, ms] of Object.entries(HELD_BUNDLED)) for (const m of ms) (HELD[f] ||= []).push({ match: m, why: 'one town\'s bundled data (src/data/…), found 2026-10-07 — unruled' })

let failed = 0
const check = (ok, what, detail = '') => { console.log(`  ${ok ? '✅ pass' : '❌ FAIL'}  ${what}${!ok && detail ? `\n           ${detail}` : ''}`); if (!ok) failed++ }

const files = (process.env.GATES_FILES ? process.env.GATES_FILES.split(',') : execSync('git ls-files "cartograph/*.js" "cartograph/*.mjs"', { cwd: ROOT, encoding: 'utf8' }).trim().split('\n'))
  .filter((f) => f && !f.startsWith('cartograph/_archive/') && !f.startsWith('cartograph/data/') && existsSync(join(ROOT, f)))
const lit = new RegExp(`['"\`](${[...towns].map((t) => t.replace(/[-]/g, '\\-')).join('|')})['"\`]`)
const alias = /(===|!==)\s*DEFAULT_MAP\b|\bDEFAULT_MAP\s*(===|!==)/
// ONE TOWN'S BUNDLED DATA (src/data/…) read by kit code is the same gate without the name — bake-labels' fallback to
// src/data/ribbons.json named no town and handed every town LS's streets.
const bundled = /['"`]src\/data\/(?!\$\{)|['"`]src['"`]\s*,\s*['"`]data['"`](?!\s*,\s*(scene|bakeScene|SCENE)\b)/   // src/data/<scene>/… is per-town: fine
const gates = [], heldSeen = new Set()
for (const f of files) {
  const lines = readFileSync(join(ROOT, f), 'utf8').split('\n')
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '').trim()
    if (!code || code.startsWith('*') || code.startsWith('/*')) return
    if (!lit.test(code) && !alias.test(code) && !bundled.test(code)) return
    const held = (HELD[f] || []).find((h) => line.includes(h.match))
    if (held) heldSeen.add(f + '|' + held.match); else gates.push(`${f}:${i + 1}  ${code.slice(0, 120)}`)
  })
}
console.log(`towns: ${[...towns].sort().join(', ')} · ${files.length} kit files scanned`)
check(gates.length === 0, 'no kit code decides by a town\'s name, outside the HELD rulings', gates.join('\n           '))
const stale = Object.entries(HELD).flatMap(([f, hs]) => hs.filter((h) => !heldSeen.has(f + '|' + h.match)).map((h) => `${f}: "${h.match}"`))
check(stale.length === 0 || process.env.GATES_FILES, 'every HELD entry still names a live gate (remove an entry when its gate goes)', stale.join('\n           '))
console.log(`\n  HELD (awaiting a ruling — each is a decision the town should declare in its own data):`)
for (const [f, hs] of Object.entries(HELD)) for (const h of hs) console.log(`    ${f}: ${h.why}`)
console.log(failed ? `\n❌ ${failed} failed` : '\n✅ all passed')
process.exit(failed ? 1 : 0)
