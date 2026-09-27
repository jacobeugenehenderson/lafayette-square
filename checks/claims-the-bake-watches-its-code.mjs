#!/usr/bin/env node
// CLAIM — THE BAKE RE-POURS WHEN THE POUR'S CODE CHANGES, THE ① MINT INCLUDED — AND ONLY THEN, JUDGED BY CONTENT.
//
// The Bake (serve.js /bake) asks before a code change re-pours a town (Boz's ruling (d)). Its code inputs were once a
// hand list that missed `coastline.mjs` and `src/lib/tileGround.js` (Gantry, 2026-09-24); then an MTIME comparison
// that asked on every checkout, and asked every town when any town's favicon changed (measured 2026-09-26: HPDM's 9
// triggers = 4 town modules + 5 real pour-code edits — Sluice). ASSERTS, reading serve.js / pipeline.js /
// pour-code.mjs — never restating their lists:
//   · the pipeline's code inputs are `pourCodeClosure()` — the import closure of pipeline.js, walked by
//     `importClosure`, stopped at the town registry; run on the live tree it contains the files that DEFINE
//     `mintProtopolygon` and `coastRings` (found by grepping for the export, so a move stays covered);
//   · no town module is in it, and the ONLY file in it that imports from src/instances/ is geography.mjs —
//     whose value the pour stamps as `geographyRead` (so the boundary cannot quietly swallow a real dependency);
//   · pipeline.js stamps `codeRead: pourCodeRecord()` and `geographyRead` into map.json;
//   · `pourCodeChanged`, exercised on temp files: a CONTENT edit is named · an mtime-only touch is not · no record
//     is dirty; `geographyReadChanged`: equal ⇒ null · edited ⇒ named · no record ⇒ dirty;
//   · the registry is judged by what the pour READ (`registryRead`), on the real registry;
//   · the Bake STOPS (428) on any of the three before the pipeline step, unless `repour=1`.
//
//   node checks/claims-the-bake-watches-its-code.mjs [--serve=path] [--pour-code=path]
//
// MUTATIONS (each must go red): PIPELINE_SRC set back to importClosure([pipeline.js]) (town modules re-enter) ·
// the 428 stop removed · pourCodeChanged made to return [] · pourCodeChanged made to compare mtimes · the registry
// check dropped from the 428 list · the stopAt removed in pour-code.mjs.
import { readFileSync, mkdtempSync, writeFileSync, utimesSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { ROOT } from './_scenes.mjs'

const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const src = readFileSync(arg('serve') || join(ROOT, 'cartograph/serve.js'), 'utf8')
const pc = await import(pathToFileURL(arg('pour-code') || join(ROOT, 'cartograph/pour-code.mjs')).href)
const bad = []
const line = src.match(/const PIPELINE_SRC = [^\n]+/)?.[0]
if (!line) { console.log('⛔ NOT CHECKED — no PIPELINE_SRC in serve.js'); process.exit(2) }
if (!/=\s*pourCodeClosure\(\)/.test(line)) bad.push(`PIPELINE_SRC is not pourCodeClosure(): ${line.trim()}`)

// ── the closure, on the live tree ──
const closure = pc.pourCodeClosure()
for (const sym of ['mintProtopolygon', 'coastRings']) {
  const re = new RegExp(`export (async )?function ${sym}\\b|export const ${sym}\\b`)
  if (!closure.some(f => { try { return re.test(readFileSync(f, 'utf8')) } catch { return false } })) bad.push(`the closure has no file defining ${sym} — a change to it would never re-pour`)
}
const rel = (f) => relative(ROOT, f)
const townMods = closure.filter(f => rel(f).startsWith('src/instances/'))
if (townMods.length) bad.push(`town modules are hashed as pour code — any town's favicon asks every town: ${townMods.map(rel).join(', ')}`)
const spec = /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)['"](\.{1,2}\/[^'"]+)['"]/gm
const importers = closure.filter(f => { try { return [...readFileSync(f, 'utf8').matchAll(spec)].some(m => /(^|\/)instances\//.test(m[1])) } catch { return false } })
if (importers.map(rel).join() !== 'cartograph/geography.mjs') bad.push(`files in the pour importing src/instances/ must be exactly [cartograph/geography.mjs] (its value is recorded); found [${importers.map(rel).join(', ')}]`)

// ── the pour stamps both records ──
const pipe = readFileSync(join(ROOT, 'cartograph/pipeline.js'), 'utf8')
if (!/codeRead:\s*pourCodeRecord\(\)/.test(pipe)) bad.push('pipeline.js does not stamp codeRead: pourCodeRecord() into map.json')
if (!/geographyRead:\s*GEOGRAPHY_READ/.test(pipe)) bad.push('pipeline.js does not stamp geographyRead into map.json')

// ── content, not mtime — exercised on temp files ──
{
  const d = mkdtempSync(join(tmpdir(), 'bakewatch-')), code = join(d, 'derive.js')
  writeFileSync(code, '// a')
  const rec = pc.pourCodeRecord([code])
  const t = Date.now() / 1000 + 1000
  utimesSync(code, t, t)
  if (pc.pourCodeChanged(rec, [code]).length) bad.push('an mtime-only touch (a checkout) was named — every Bake would ask')
  writeFileSync(code, '// b')
  if (pc.pourCodeChanged(rec, [code]).length !== 1) bad.push('a CONTENT edit to a pour file was not named — the Bake would not ask')
  if (!pc.pourCodeChanged(undefined, [code]).length) bad.push('a map.json with NO code record counts as clean — it must be dirty')
  rmSync(d, { recursive: true, force: true })
}
{
  const { DEFAULT_MAP } = await import(pathToFileURL(join(ROOT, 'cartograph/scene.js')).href)
  const { geographyFor } = await import(pathToFileURL(join(ROOT, 'cartograph/geography.mjs')).href)
  const g = geographyFor(DEFAULT_MAP)
  if (pc.geographyReadChanged(g, DEFAULT_MAP) !== null) bad.push('an unchanged geography reads as changed')
  if (!pc.geographyReadChanged({ ...g, lat: g.lat + 1e-3 }, DEFAULT_MAP)) bad.push('a moved geography does not re-pour')
  if (!pc.geographyReadChanged(undefined, DEFAULT_MAP)) bad.push('a map.json with NO geography record counts as clean — it must be dirty')
}

// ── the registry, by what the pour READ ──
{ const h0 = src.indexOf("await runIfDirty('pipeline'"), g = src.lastIndexOf('registryReadChanged(', h0), q = src.indexOf('res.writeHead(428', g)
  if (g < 0 || q < 0 || q > h0 || !/regChanged/.test(src.slice(g, q))) bad.push('the Bake does not judge the registry by what the last pour read (registryReadChanged → the 428 list)') }
{ const { highwayStandard, registryReadChanged } = await import(pathToFileURL(join(ROOT, 'src/cartograph/streetProfiles.js')).href)
  const reg = () => JSON.parse(readFileSync(join(ROOT, 'references/registry.json'), 'utf8'))
  const idx = (r) => { const m = new Map(); const w = (o) => { if (Array.isArray(o)) o.forEach(w); else if (o && typeof o === 'object') { if (typeof o.id === 'string') m.set(o.id, o); for (const v of Object.values(o)) if (v && typeof v === 'object') w(v) } }; w(r); return m }
  for (const code of ['MA', 'CA', null]) {
    const read = new Map(); highwayStandard(reg(), { code }, read); const rec = Object.fromEntries(read)
    if (!read.size) { bad.push(`state ${code}: highwayStandard recorded no reads`); continue }
    if (registryReadChanged(rec, reg()).length) bad.push(`state ${code}: an unchanged registry reads as changed`)
    const valId = Object.keys(rec).find(k => rec[k] !== true), r1 = reg(), e1 = idx(r1).get(valId)
    e1.value = { ...e1.value, __mutated: 1 }
    if (!registryReadChanged(rec, r1).includes(valId)) bad.push(`state ${code}: a changed value the pour READ (${valId}) does not re-pour`)
    const r2 = reg(); r2.findings.push({ id: 'r-bakewatch-test', kind: 'ruling', quote: 'x' })
    const unread = r2.findings.find(f => !(f.id in rec) && f.value && typeof f.value === 'object'); if (unread) unread.value = { ...unread.value, __mutated: 1 }
    if (registryReadChanged(rec, r2).length) bad.push(`state ${code}: a new ruling or an unread finding re-pours every town`)
  }
  if (!registryReadChanged(undefined, reg()).length) bad.push('a map.json with NO read record counts as clean — it must be dirty') }

// ── and it ASKS (428 unless repour=1) on all three, before the pipeline step ──
{ const h0 = src.indexOf("await runIfDirty('pipeline'"), g = src.lastIndexOf('pourCodeChanged(', h0), q = g < 0 ? -1 : src.indexOf('res.writeHead(428', g)
  const between = g < 0 || q < 0 ? '' : src.slice(g, q)
  if (h0 < 0 || g < 0 || q < 0 || q > h0 || !/repourConfirmed/.test(src.slice(q - 200, h0))) bad.push('the Bake does not stop (428, unless repour=1) on changed pour code before running the pipeline')
  else if (!/codeChanged/.test(between) || !/geoChanged/.test(between)) bad.push('the 428 list does not carry both the code and the geography changes') }

// ── every OTHER step is judged by content too (Boz's rulings 2026-09-26): runIfDirty hashes each step's code closure
// AND its declared data against clean/bake-reads.json; only the pour's authoring inputs keep the mtime rule ──
{ const a = src.indexOf('const runIfDirty = async'), body = a < 0 ? '' : src.slice(a, src.indexOf('\n      }\n', a))
  if (!/importClosure\(\s*inputs\.filter\(/.test(body) || (body.match(/contentChanged\(/g) || []).length < 2 || !/saveBakeRead\(/.test(body))
    bad.push('runIfDirty does not judge a step\'s code AND data by content against bake-reads.json')
  const pl = src.slice(src.indexOf("await runIfDirty('pipeline'"), src.indexOf("await runIfDirty('promote-ribbons'"))
  if (!/judge:\s*'mtime'/.test(pl)) bad.push('the pour\'s authoring inputs are not on the explicit mtime rule (judge: \'mtime\')')
  const g = src.lastIndexOf('pourDataReads(bakeScene)', src.indexOf("await runIfDirty('pipeline'")), q = src.indexOf('res.writeHead(428', g)
  if (g < 0 || q < 0 || !/dataChanged/.test(src.slice(g, q + 300))) bad.push('a change to the pour\'s other data reads (pourDataReads) does not ask (428)')
  if (!/lsAsks/.test(src.slice(g, q + 300))) bad.push('LS (held): a first promote-ribbons with no record does not ask before rewriting src/data/ribbons.json')
  const pipe = readFileSync(join(ROOT, 'cartograph/pipeline.js'), 'utf8')
  if (!/dataRead:\s*contentRecord\(pourDataReads\(SCENE\)\)/.test(pipe)) bad.push('pipeline.js does not stamp dataRead: contentRecord(pourDataReads(SCENE))') }

console.log(`── bake inputs ── pour code: ${closure.length} file(s), no town module ${bad.length ? '⛔' : '✅'}`)
for (const x of bad) console.log(`   ⛔ ${x}`)
console.log(bad.length ? '\n⛔ The Bake can call a town clean while the pour\'s own code has changed — or ask when nothing it reads has.' : '\n✅ The Bake watches every file the pour runs, by content, and nothing it does not read.')
process.exit(bad.length ? 1 : 0)
