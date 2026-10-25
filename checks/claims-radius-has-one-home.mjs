#!/usr/bin/env node
/**
 * claims-radius-has-one-home.mjs
 *
 * ⛔ THE CLASS: one town fact stored in two files, disagreeing, with readers split between
 * them. The disc radius lives in `neighborhood_boundary.json` (the applied disc — what
 * every renderer and the pour read). neighborhood.json carried Extent's unapplied DRAFT
 * under the SAME key, `radius`, and two readers took it for the applied value: Extent's
 * reopen (so an unapplied edit showed as applied) and fetch.js's heavy pass. Measured
 * 2026-09-25: provincetown 5,290 vs 7,065 m, hipointedemun 1,260 vs 1,251 m.
 *
 * Asserts (reading the files and the source, never restating them):
 *   · no town's neighborhood.json carries `radius` — the draft is `draftRadius`;
 *   · Extent hydrates the APPLIED radius from the boundary, never from neighborhood.json;
 *   · commit-extent / rescope write the draft as `draftRadius`;
 *   · fetch.js's heavy pass sizes its square from the boundary.
 * REPORTS (not a failure — a legitimate state) every town whose draft differs from its
 * applied disc: an edit the operator has not built yet.
 *
 * ⭐ THE READER ROW (BRIEF-the-disc-is-one-source §1b, 2026-10-25). The radius has one home AND one reader: every
 * pour/bake/Designer reader (cartograph/, arborist/, scripts/, street-furniture/, src/cartograph/) asks "is this lit?" and
 * "where is the edge?" of boundaryRecords.mjs#discOf, whose answer is the ring. Read from the source, per line:
 *   · no invented disc — no `center || [0, 0]`, `.radius || 0|1`, `center = [0, 0]` default;
 *   · no analytic circle — no hypot/squared-distance test against a radius of its own;
 *   · no constant margin on the disc (`radius + 50`, `R * 1.25`) …
 *   · … and a file that reads the boundary's centre or radius imports the one module (or a reader built on it);
 * EXCEPT the DATED exceptions below, each with its rule, owner and COUNT of excused lines, printed on every run and RED
 * when that count moves either way (a new line hid under it, or one left it: then fix or delete the exception).
 * ⚠️ NOT SEEN (named, not tested): a destructured default (`{ center = [0, 0] }`), the `dx * dx + dz * dz <= R * R` and
 * `Math.sqrt(…) <= R` circle forms, and any of the above split across lines. A reader written that way passes the row. The runtime stencil channel (ground.json's `stencil`, the player's render path) is its own brief.
 * Ring point-in-polygon (the Python fetch scripts) is the rule, not an exception.
 *
 *     node checks/claims-radius-has-one-home.mjs [--self-test]
 */
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'cartograph', 'data')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')

// ⭐ The reader row's scope and its dated exceptions. An exception names a file, the text it allows, its owner and the date.
const ROW_DIRS = ['cartograph', 'arborist', 'scripts', 'street-furniture', 'src/cartograph']
const ROW_EXCEPTIONS = [
  { file: 'cartograph/coastline.mjs', has: 'discR * 1.25', rule: 'reader/no-constant-margin', count: 1, owner: 'BRIEF-the-disc-is-one-source §2c (water to the bb) + BRIEF-the-rim-is-cut-once §5', since: '2026-10-25' },
  { file: 'cartograph/coastline.mjs', has: 'v <= discR', rule: 'reader/no-analytic-circle', count: 2, owner: 'BRIEF-the-disc-is-one-source §2c', since: '2026-10-25' },
  { file: 'cartograph/bake-terrain.js', has: 'STENCIL_BUFFER_M', rule: 'reader/no-constant-margin', count: 2, owner: 'BRIEF-the-disc-is-one-source §3 (the height extent from the one module)', since: '2026-10-25' },
  { file: 'cartograph/bake-terrain.js', has: 'center: boundary.center, discR: boundary.radius', rule: 'reader/through-the-module', count: 1, owner: 'BRIEF-the-disc-is-one-source §3 (the terrain\'s coast and extent read the disc)', since: '2026-10-25' },
  { file: 'cartograph/bake-ground.js', has: '_discR + 50', rule: 'reader/no-constant-margin', count: 1, owner: 'BRIEF-the-disc-is-one-source §3 (not the AO reach: MAX_RAY_DIST is 80; cause not established)', since: '2026-10-25' },
  { file: 'src/cartograph/ExtentApp.jsx', has: 'keptFit.radius + 120', rule: 'reader/no-constant-margin', count: 1, owner: 'the Extent tool\'s own auto-fit (tool UI, out of the row: Boz, 2026-10-25 (c))', since: '2026-10-25' },
  { file: 'scripts/migrate-draft-radius.mjs', has: '${nb.radius}', rule: 'reader/through-the-module', count: 2, owner: 'reads neighborhood.json\'s DRAFT radius, never the disc', since: '2026-10-25' },
]
const ROW_RULES = [
  ['reader/no-invented-disc', /\.center\??\.?(\[[01]\])?\s*(\|\||\?\?)|\.radius\s*(\|\||\?\?)\s*[0-9]|center\s*=\s*\[\s*0\s*,\s*0\s*\]/],
  ['reader/no-analytic-circle', /Math\.hypot\([^)\n]*\)\s*<=?\s*[\w.]*(radius|\bR\b|discR)|\*\*\s*2\s*\+\s*\([^)\n]*\)\s*\*\*\s*2\s*<=?\s*\w*R2|<=\s*discR\b/],
  ['reader/no-constant-margin', /\b(discR|_discR|radius)\s*(\*\s*1\.\d+|\+\s*\d{2,})\b|STENCIL_BUFFER_M\b/],
]
const VIA_MODULE = /from ['"][^'"]*(boundaryRecords\.mjs|membership\.mjs|sceneStencil\.js|\/boundary\.js)['"]/
const READS_BOUNDARY = (src) => /neighborhood_boundary|sceneBoundary/.test(src)                                   // the file reads the disc's file …
const TOUCH = /\b(nb|bnd|boundary|sceneBoundary|sceneBoundaryRaw|b|prev|raw)\??\.(center|radius)\b/                // … and this line its fields

function rowFiles() {
  const out = {}
  const walk = (d) => { for (const e of readdirSync(join(ROOT, d), { withFileTypes: true })) {
    const p = `${d}/${e.name}`
    if (e.isDirectory()) { if (e.name !== '_archive' && e.name !== 'node_modules' && e.name !== 'data') walk(p) }
    else if (/\.(m?js|jsx)$/.test(e.name) && p !== 'cartograph/boundaryRecords.mjs') out[p] = read(p)
  } }
  for (const d of ROW_DIRS) walk(d)
  return out
}

function loadSources() {
  const towns = {}
  for (const s of readdirSync(DATA)) {
    const nbP = join(DATA, s, 'neighborhood.json'), bP = join(DATA, s, 'neighborhood_boundary.json')
    if (!existsSync(nbP) && !existsSync(bP)) continue
    towns[s] = {
      nb: existsSync(nbP) ? JSON.parse(readFileSync(nbP, 'utf8')) : null,
      boundary: existsSync(bP) ? JSON.parse(readFileSync(bP, 'utf8')) : null,
    }
  }
  return { towns, extent: read('src/cartograph/ExtentApp.jsx'), serve: read('cartograph/serve.js'), fetchJs: read('cartograph/fetch.js'), row: rowFiles() }
}

function run(S) {
  const out = []
  const assert = (name, ok, detail) => out.push({ name, ok: !!ok, detail })
  const legacy = Object.entries(S.towns).filter(([, t]) => t.nb && 'radius' in t.nb).map(([s, t]) => `${s} (${t.nb.radius})`)
  assert('files/no-radius-in-neighborhood-json', legacy.length === 0,
    `neighborhood.json still carries \`radius\` (a second home): ${legacy.join(', ')} — node scripts/migrate-draft-radius.mjs`)
  assert('extent/applied-from-boundary',
    /setAppliedRadius\(b && b\.radius/.test(S.extent) && !/setAppliedRadius\([^)]*\bnb\./.test(S.extent),
    'ExtentApp.jsx hydrates the applied radius from neighborhood.json, not from the boundary')
  assert('extent/draft-saved-as-draftRadius', /draftRadius: Math\.round\(radiusM\)/.test(S.extent) && !/\{ sides: clean, radius:/.test(S.extent),
    'ExtentApp.jsx buildDraft() saves the draft under `radius` again')
  assert('serve/commit-and-rescope-write-draftRadius',
    /nDraft = \{[^}]*draftRadius:/.test(S.serve) && !/nDraft = \{[^}]*\bradius:/.test(S.serve) && !/\bnb\.radius = /.test(S.serve),
    'serve.js commit-extent or rescope writes `radius` into neighborhood.json')
  assert('fetch/heavy-reads-the-applied-disc', /neighborhood_boundary\.json/.test(S.fetchJs) && !/\bnb\.radius\b[^\n]*neighborhood\.json/.test(S.fetchJs),
    'fetch.js --pass=heavy no longer sizes its square from the applied disc')
  // ⭐ THE READER ROW — every hit is a line; an exception excuses exactly `count` lines of its rule, in its file, carrying `has`
  const lines = {}   // rule → [{ f, i, l }]
  const add = (rule, f, i, l) => (lines[rule] ||= []).push({ f, i, l })
  for (const [f, src] of Object.entries(S.row)) {
    const through = !READS_BOUNDARY(src) || VIA_MODULE.test(src)
    src.split('\n').forEach((l, i) => {
      if (/^\s*(\/\/|\*)/.test(l)) return
      for (const [name, re] of ROW_RULES) if (re.test(l)) add(name, f, i, l)
      if (!through && TOUCH.test(l)) add('reader/through-the-module', f, i, l)
    })
  }
  const excusedBy = new Map()
  for (const name of [...ROW_RULES.map(r => r[0]), 'reader/through-the-module']) {
    const hits = []
    for (const h of lines[name] || []) {
      const e = ROW_EXCEPTIONS.find(e => e.rule === name && e.file === h.f && h.l.includes(e.has))
      if (e) excusedBy.set(e, (excusedBy.get(e) || 0) + 1); else hits.push(`${h.f}:${h.i + 1}`)
    }
    assert(name, hits.length === 0, `${hits.length} line(s): ${hits.slice(0, 6).join(' · ')}`)
  }
  // an exception that excuses MORE or FEWER lines than it says is RED: a new line hid under it, or one left it
  const off = ROW_EXCEPTIONS.filter(e => (excusedBy.get(e) || 0) !== e.count).map(e => `${e.file} "${e.has}" excuses ${excusedBy.get(e) || 0}, says ${e.count}`)
  assert('reader/exceptions-exact', off.length === 0, off.join(' · '))
  return out
}

const MUTATIONS = [
  { name: 'files/no-radius-in-neighborhood-json',
    apply: (S) => { const [s, t] = Object.entries(S.towns).find(([, t]) => t.nb) || []; return { ...S, towns: { ...S.towns, [s]: { ...t, nb: { ...t.nb, radius: 1 } } } } } },
  { name: 'extent/applied-from-boundary',
    apply: (S) => ({ ...S, extent: S.extent.replace('setAppliedRadius(b && b.radius > 0 ? Math.round(b.radius) : 0)', 'setAppliedRadius(Math.round(nb.draftRadius))') }) },
  { name: 'extent/draft-saved-as-draftRadius',
    apply: (S) => ({ ...S, extent: S.extent.replace('draftRadius: Math.round(radiusM)', 'radius: Math.round(radiusM)') }) },
  { name: 'serve/commit-and-rescope-write-draftRadius',
    apply: (S) => ({ ...S, serve: S.serve.replace('nb.draftRadius = Math.round(radius)', 'nb.radius = Math.round(radius)') }) },
  { name: 'fetch/heavy-reads-the-applied-disc',
    apply: (S) => ({ ...S, fetchJs: S.fetchJs.replaceAll('neighborhood_boundary.json', 'neighborhood.json') }) },
  // the reader row: each rule planted back into a real reader, and one exception made stale
  { name: 'reader/no-invented-disc', apply: (S) => ({ ...S, row: { ...S.row, 'cartograph/fetch.js': S.row['cartograph/fetch.js'] + '\nconst c = bnd.center || [0, 0]\n' } }) },
  { name: 'reader/no-analytic-circle', apply: (S) => ({ ...S, row: { ...S.row, 'street-furniture/serve.js': S.row['street-furniture/serve.js'] + '\nconst inside = (x, z) => Math.hypot(x - nb.center[0], z - nb.center[1]) <= nb.radius\n' } }) },
  { name: 'reader/no-constant-margin', apply: (S) => ({ ...S, row: { ...S.row, 'cartograph/sceneStencil.js': S.row['cartograph/sceneStencil.js'] + '\nconst half = radius + 75\n' } }) },
  { name: 'reader/through-the-module', apply: (S) => ({ ...S, row: { ...S.row, 'street-furniture/serve.js': S.row['street-furniture/serve.js'].replace("import { discOf } from '../cartograph/boundaryRecords.mjs'", '') + '\nconst r = nb.radius\n' } }) },
  { name: 'reader/exceptions-exact', apply: (S) => ({ ...S, row: { ...S.row, 'cartograph/coastline.mjs': S.row['cartograph/coastline.mjs'].replaceAll('discR * 1.25', 'discR * K') } }) },
  { name: 'reader/exceptions-exact', apply: (S) => ({ ...S, row: { ...S.row, 'cartograph/bake-ground.js': S.row['cartograph/bake-ground.js'] + '\nconst more = _discR + 50\n' } }) },
]

const S = loadSources()
if (process.argv.includes('--self-test')) {
  const red = run(S).filter(r => !r.ok)
  if (red.length) { for (const r of red) console.log(`⛔ baseline red: ${r.name} — ${r.detail}`); process.exit(1) }
  let bad = 0
  for (const m of MUTATIONS) {
    const hit = run(m.apply(S)).find(r => r.name === m.name)
    if (!hit || hit.ok) { console.log(`  ⛔ ${m.name} — defect planted and the check STAYED GREEN`); bad++ }
    else console.log(`  ✓ ${m.name} — went red`)
  }
  console.log(bad ? `\n⛔ ${bad} mutation(s) did not fail.` : '\n✅ every mutation produced its named failure.')
  process.exit(bad ? 1 : 0)
}

// The report: draft vs applied, per town. Unapplied is a state, not a failure.
for (const [s, t] of Object.entries(S.towns)) {
  const d = t.nb?.draftRadius ?? t.nb?.radius, a = t.boundary?.radius
  const state = a == null ? 'no applied disc (not built)' : d == null ? 'no draft' : Math.round(d) === Math.round(a) ? 'applied' : `⚠ UNAPPLIED DRAFT — press Bake in Extent to apply`
  console.log(`  ${s.padEnd(26)} draft ${String(d ?? '—').padStart(5)} · applied ${String(a ?? '—').padStart(5)}  ${state}`)
}
for (const e of ROW_EXCEPTIONS) console.log(`  ⚠ DATED EXCEPTION (${e.since}) ${e.file}: ${e.count} × "${e.has}" under ${e.rule} — owner: ${e.owner}`)
const res = run(S)
for (const r of res) console.log(`${r.ok ? '  ✓' : '  ✗'} ${r.name}${r.ok ? '' : ` — ${r.detail}`}`)
const failed = res.filter(r => !r.ok)
console.log(`\n${res.length - failed.length}/${res.length} green`)
process.exit(failed.length ? 1 : 0)
