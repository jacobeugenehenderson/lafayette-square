#!/usr/bin/env node
// claims-no-step-reads-what-a-later-step-writes.mjs — DOES A FINISHED BAKE LEAVE ITS OWN PLAN CLEAN?
//
// ⭐ THE CLAIM (Jacob's ruling of 2026-10-04 on scene.json's bakedAt, met again 2026-10-28). A step records what it read
// (pourSteps.mjs#recordStep), and the plan calls it stale when that content moves. If a LATER step in the same Bake
// rewrites a file an earlier step read BY FILE, the earlier step is stale the moment the Bake ends, on every town:
// LS's full Bake (2026-10-28 ~14:25) listed coast-distance, buildings, lamps and tree-anchors stale because ground-ao
// writes its maps back into ground.json. Such a read must be BY VALUE, without what the later step writes.
// Three judges, each reading the source:
//   1 · NO EARLIER READ OF A LATER WRITE: serve.js's runIfDirty steps, parsed in route order, as { reads, writes } (each a
//       `join(DIR, 'name')` or a named path constant; a by-value read `{ value, read }` or a call such as
//       groundForReaders() is not a file). No step reads by file what a later step declares it writes. Subject guard: the
//       parse finds ground and ground-ao, and ground-ao declares ground.json (it rewrites it), or the judge is blind.
//   2 · THE STRIP COVERS WHAT ground-ao WRITES: every `manifest.<field> =` in bake-ground-ao.js is in
//       pourSteps.mjs#GROUND_AO_FIELDS, so a fifth map it starts writing fails here, not on a town.
//   3 · THE VALUE SEES THE GROUND, NOT THE MAPS: pourSteps.mjs#groundForReaders, run on a scratch ground.json, records the
//       same content when only the AO maps or `timings` change, and a different one when the ground (groups, groundKey) does.
// ⭐ MUTANTS (--mutants), each must go RED: (a) coast-distance back on the raw ground.json → 1 · (b) ground-ao's ground.json
// output undeclared → 1 (blind) · (c) bake-ground-ao writes a new `manifest.foomap` → 2 · (d) the strip keeps `lightmap` → 3.
//   node checks/claims-no-step-reads-what-a-later-step-writes.mjs [--mutants]
// Read-only (judge 3 writes only under its own temp dir). Exits 1 on any failing judge or any mutant left GREEN.
import fs from 'fs'
import os from 'os'
import path from 'path'
import { contentRecord } from '../cartograph/pour-code.mjs'

const SERVE = 'cartograph/serve.js', AO = 'cartograph/bake-ground-ao.js', STEPS = 'cartograph/pourSteps.mjs'
const read = (f) => fs.readFileSync(f, 'utf8')
const DIRS = new Set(['LOOK_DIR', 'SCENE_DIR', 'CONTENT_DIR', 'REPO_ROOT', 'HERE',
  // the pour's three steps (coast, pipeline, promote-ribbons) pass `POUR.<step>.inputs/outputs`, declared in pourSteps.mjs and
  // not parsed here; they run FIRST and read the town's authoring, which no Bake step writes
  'POUR'])

// the top-level arguments of a call whose '(' ends just before `i`
function args(s, i) {
  const out = []; let depth = 0, start = i, q = null
  for (let k = i; k < s.length; k++) {
    const c = s[k]
    if (q) { if (c === '\\') { k++; continue } if (c === q) q = null; continue }
    if (c === "'" || c === '"' || c === '`') { q = c; continue }
    if (c === '/' && s[k + 1] === '/') { k = s.indexOf('\n', k); continue }
    if ('([{'.includes(c)) depth++
    else if (')]}'.includes(c)) { if (depth === 0) { out.push(s.slice(start, k)); return out } depth-- }
    else if (c === ',' && depth === 0) { out.push(s.slice(start, k)); start = k + 1 }
  }
  return out
}
// the files an argument names: `join(DIR, 'name')` and named path constants (MAP_JSON, bakePaths.boundary), never a
// by-value read (`{ value, read }`, dropped whole) or a call that returns one
function files(t = '') {
  let s = t, i
  while ((i = s.search(/\{\s*value\s*:/)) >= 0) { let d = 0, k = i; for (; k < s.length; k++) { if (s[k] === '{') d++; else if (s[k] === '}' && --d === 0) break } s = s.slice(0, i) + s.slice(k + 1) }
  s = s.replace(/\/\/.*$/gm, '')
  const out = new Set()
  for (const m of s.matchAll(/\bjoin\((\w+),\s*'([^']+)'\)/g)) out.add(`${m[1]}/${m[2]}`)
  const bare = s.replace(/\bjoin\([^()]*\)/g, '')
  for (const m of bare.matchAll(/\b(bakePaths\.\w+|[A-Z][A-Z0-9_]{2,})\b/g)) if (!DIRS.has(m[1])) out.add(m[1])
  return out
}
function stepsOf(src) {
  return [...src.matchAll(/runIfDirty\('([\w-]+)',/g)].map((m) => { const a = args(src, m.index + m[0].length); return { label: m[1], reads: files(a[0]), writes: files(a[1]) } })
}

async function judge(textOf, stripOverride) {
  const out = { 1: [], 2: [], 3: [] }
  const steps = stepsOf(textOf(SERVE))
  const ao = steps.find((s) => s.label === 'ground-ao')
  if (!steps.some((s) => s.label === 'ground') || !ao) out[1].push(`${SERVE}: the parse found no ground / ground-ao step: the judge has no subject`)
  else if (!ao.writes.has('LOOK_DIR/ground.json')) out[1].push(`${SERVE}: ground-ao does not declare ground.json, which it rewrites (bake-ground-ao.js writeIfChanged): the judge is blind to it`)
  steps.forEach((s, i) => { for (const f of s.reads) for (const l of steps.slice(i + 1)) if (l.writes.has(f)) out[1].push(`${s.label} reads ${f} by file, and the later ${l.label} writes it: ${s.label} is stale after every Bake`) })

  const { GROUND_AO_FIELDS, groundForReaders } = stripOverride ?? await import('../cartograph/pourSteps.mjs')
  if (!Array.isArray(GROUND_AO_FIELDS) || typeof groundForReaders !== 'function') {
    out[2].push(`${STEPS} exports no GROUND_AO_FIELDS / groundForReaders: nothing reads ground.json by value`); out[3].push('(no subject)'); return out
  }
  const written = [...new Set([...textOf(AO).matchAll(/\bmanifest\.(\w+)\s*=(?!=)/g)].map((m) => m[1]))]
  if (!written.length) out[2].push(`${AO}: no manifest.<field> = found: the judge has no subject`)
  for (const f of written) if (!GROUND_AO_FIELDS.includes(f)) out[2].push(`${AO} writes manifest.${f} into ground.json, and ${STEPS}#GROUND_AO_FIELDS does not strip it`)

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ground-readers-'))
  try {
    const g = path.join(dir, 'ground.json'), spec = groundForReaders(dir)
    const at = (m) => { fs.writeFileSync(g, JSON.stringify(m)); return Object.values(contentRecord([spec]))[0] }
    const base = { version: 1, groundKey: 'aaaa', groups: [{ id: 'grass', n: 3 }], timings: { mesh: 1.2 }, lightmap: { image: 'ground.lightmap.png', groundKey: 'old' } }
    const h0 = at(base)
    const maps = { ...base, timings: { mesh: 9.9 }, lightmap: { image: 'ground.lightmap.png', groundKey: 'aaaa' },
      colormap: { image: 'ground.colormap.png' }, poolmap: { image: 'ground.poolmap.png' }, rulemap: { image: 'ground.rulemap.png' } }
    if (at(maps) !== h0) out[3].push('only the AO maps and timings changed, and the recorded value moved: the readers would be stale')
    if (at({ ...base, groundKey: 'bbbb', groups: [{ id: 'grass', n: 4 }] }) === h0) out[3].push('the ground itself changed, and the recorded value did not: the readers would miss a re-bake they owe')
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
  return out
}

const NAMES = { 1: 'no step reads by file what a later step writes', 2: "the strip covers what ground-ao writes", 3: 'the value sees the ground, not the maps' }
let bad = 0
const R = await judge(read)
for (const k of [1, 2, 3]) {
  console.log(`${R[k].length ? '⛔' : '✅'} ${k} ${NAMES[k]}`)
  for (const s of R[k]) console.log(`      ${s}`)
  if (R[k].length) bad++
}
if (process.argv.includes('--mutants')) {
  const swap = (file, a, b) => (f) => { const t = read(f); if (f !== file) return t; if (!t.includes(a)) throw new Error(`mutant anchor not found in ${file}: ${a}`); return t.replace(a, b) }
  const real = await import('../cartograph/pourSteps.mjs')
  const keepsLightmap = { GROUND_AO_FIELDS: real.GROUND_AO_FIELDS, groundForReaders: (d) => { const s = real.groundForReaders(d); return { value: s.value, read: () => { const g = JSON.parse(fs.readFileSync(path.join(d, 'ground.json'), 'utf8')); for (const k of ['colormap', 'poolmap', 'rulemap', 'timings']) delete g[k]; return g } } } }
  const MUTANTS = [
    ['a', 1, swap(SERVE, '          groundForReaders(LOOK_DIR), bakePaths.geography],', "          join(LOOK_DIR, 'ground.json'), bakePaths.geography],")],
    ['b', 1, swap(SERVE, "[join(LOOK_DIR, 'ground.lightmap.png'), join(LOOK_DIR, 'ground.json')]", "[join(LOOK_DIR, 'ground.lightmap.png')]")],
    ['c', 2, swap(AO, '  manifest.lightmap = {', '  manifest.foomap = null\n  manifest.lightmap = {')],
    ['d', 3, read, keepsLightmap],
  ]
  for (const [id, want, textOf, strip] of MUTANTS) {
    let red
    try { red = (await judge(textOf, strip))[want].length > 0 } catch (e) { console.log(`⛔ mutant (${id}) could not be applied: ${e.message}`); bad++; continue }
    console.log(`${red ? '✅' : '⛔'} mutant (${id}) → judge ${want} ${red ? 'RED' : 'still GREEN'}`)
    if (!red) bad++
  }
}
process.exit(bad ? 1 : 0)
