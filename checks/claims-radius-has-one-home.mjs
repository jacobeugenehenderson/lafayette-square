#!/usr/bin/env node
/**
 * claims-radius-has-one-home.mjs
 *
 * ⛔ THE CLASS: one town fact stored in two files, disagreeing, with readers split between
 * them. The disc radius lives in `neighborhood_boundary.json` (the applied disc — what
 * every renderer and the pour read). neighborhood.json carried Extent's unapplied DRAFT
 * under the SAME key, `radius`, and two readers took it for the applied value: Extent's
 * reopen (so an unapplied edit showed as applied) and fetch.js's heavy pass. Measured
 * 2026-09-25: provincetown 5,290 vs 7,065 m, hipointe-demun 1,260 vs 1,251 m.
 *
 * Asserts (reading the files and the source, never restating them):
 *   · no town's neighborhood.json carries `radius` — the draft is `draftRadius`;
 *   · Extent hydrates the APPLIED radius from the boundary, never from neighborhood.json;
 *   · commit-extent / rescope write the draft as `draftRadius`;
 *   · fetch.js's heavy pass sizes its square from the boundary.
 * REPORTS (not a failure — a legitimate state) every town whose draft differs from its
 * applied disc: an edit the operator has not built yet.
 *
 *     node checks/claims-radius-has-one-home.mjs [--self-test]
 */
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'cartograph', 'data')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')

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
  return { towns, extent: read('src/cartograph/ExtentApp.jsx'), serve: read('cartograph/serve.js'), fetchJs: read('cartograph/fetch.js') }
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
const res = run(S)
for (const r of res) console.log(`${r.ok ? '  ✓' : '  ✗'} ${r.name}${r.ok ? '' : ` — ${r.detail}`}`)
const failed = res.filter(r => !r.ok)
console.log(`\n${res.length - failed.length}/${res.length} green`)
process.exit(failed.length ? 1 : 0)
