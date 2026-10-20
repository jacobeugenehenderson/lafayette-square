#!/usr/bin/env node
// claims-survey-passes-what-the-bake-passes.mjs — DOES SURVEY'S LIVE BUILD GIVE buildTileGround EVERYTHING THE BAKE DOES?
//
// ⭐ THE CLAIM: Survey (`BlockGeometryV2Debug`) and the bake (`bake-ground.js#buildTileBakeShape`) call the one producer,
// `buildTileGround`. Every option the bake passes, Survey passes too, unless a row of BAKE_ONLY below names it, and every
// read of a bake-only option inside `buildTileGround`'s module sits under `if (opts.reportGlean)`, so it cannot change what
// is drawn. Found 2026-10-20: 20d3529f made `curbedMinWidth` required and only the bake passed it, so Survey's live build
// refused on every town. The Survey-vs-Section check builds Survey through the proto feed, which passed it, so it stayed green.
// Judges, each reading the source:
//   1 · the option keys of the one `buildTileGround(` call in each file, parsed (an object literal, or the check refuses);
//   2 · bake − Survey ⊆ BAKE_ONLY, and every BAKE_ONLY row is still passed by the bake (a stale row is RED);
//   3 · every `opts.<bake-only>` read in src/lib/tileGround.js is inside an `if (opts.reportGlean)`.
// ⭐ MUTANTS (--mutants): (a) Survey's curbedMinWidth removed → 2 RED · (b) a new key added to the bake → 2 RED ·
// (c) a BAKE_ONLY row the bake no longer passes → 2 RED · (d) an opts.surveyStreets read outside the gate → 3 RED.
//   node checks/claims-survey-passes-what-the-bake-passes.mjs [--mutants]
// Read-only. Exits 1 on any RED, 2 if a call site cannot be read (a broken instrument).
import fs from 'fs'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { parse } = require('@babel/parser')
const traverse = require('@babel/traverse').default

const BAKE = 'cartograph/bake-ground.js', SURVEY = 'src/cartograph/BlockGeometryV2Debug.jsx', TG = 'src/lib/tileGround.js'
const BAKE_ONLY = {
  reportGlean: 'prints the ambiguous treelawn run-sides for the operator; the gate itself',
  surveyStreets: "survey.json's streets, read only by reportGlean's print",
}

const ast = (src) => parse(src, { sourceType: 'module', plugins: ['jsx'] })
function callKeys(src, file) {
  const calls = []
  traverse(ast(src), { CallExpression(p) { if (p.node.callee.type === 'Identifier' && p.node.callee.name === 'buildTileGround') calls.push(p.node) } })
  if (calls.length !== 1) throw new Error(`${file}: ${calls.length} buildTileGround( call(s), expected exactly 1`)
  const o = calls[0].arguments[1]
  if (o?.type !== 'ObjectExpression') throw new Error(`${file}: buildTileGround's options are not an object literal`)
  return o.properties.map(q => {
    if (q.type !== 'ObjectProperty' || q.computed) throw new Error(`${file}: an option that is not a plain key (${q.type})`)
    return q.key.name ?? q.key.value
  })
}
function ungatedReads(src, keys) {
  const out = []
  traverse(ast(src), { MemberExpression(p) {
    const n = p.node
    if (n.object.type !== 'Identifier' || n.object.name !== 'opts' || n.computed || !keys.includes(n.property.name)) return
    if (n.property.name === 'reportGlean' && p.parentPath.isIfStatement({ test: n })) return   // the gate's own test
    const gated = p.findParent(q => q.isIfStatement() && q.node.test.type === 'MemberExpression' && q.node.test.object.name === 'opts'
      && q.node.test.property.name === 'reportGlean' && p.isDescendant(q.get('consequent')))
    if (!gated) out.push(`opts.${n.property.name} :${n.loc.start.line}`)
  } })
  return out
}
function judge(bakeSrc, surveySrc, tgSrc, bakeOnly) {
  const red = []
  const b = callKeys(bakeSrc, BAKE), s = callKeys(surveySrc, SURVEY)
  const missing = b.filter(k => !s.includes(k) && !(k in bakeOnly))
  const stale = Object.keys(bakeOnly).filter(k => !b.includes(k))
  if (missing.length) red.push(`2 Survey does not pass: ${missing.join(', ')}`)
  if (stale.length) red.push(`2 stale BAKE_ONLY row(s), the bake no longer passes: ${stale.join(', ')}`)
  const ug = ungatedReads(tgSrc, Object.keys(bakeOnly))
  if (ug.length) red.push(`3 a bake-only option read outside if (opts.reportGlean): ${ug.join(' · ')}`)
  return { b, s, red }
}

const read = (f) => fs.readFileSync(f, 'utf8')
let r
try { r = judge(read(BAKE), read(SURVEY), read(TG), BAKE_ONLY) }
catch (e) { console.log(`⛔ BROKEN INSTRUMENT: ${e.message}`); process.exit(2) }
console.log(`1 bake passes ${r.b.length}: ${r.b.join(', ')}`)
console.log(`  Survey passes ${r.s.length}: ${r.s.join(', ')}`)
console.log(`  bake-only, named: ${Object.entries(BAKE_ONLY).map(([k, v]) => `${k} (${v})`).join(' · ')}`)
console.log(r.red.length ? r.red.map(x => `⛔ ${x}`).join('\n') : '✅ 2 Survey passes every option the bake passes, bar the named bake-only rows · ✅ 3 those are read only under reportGlean')

if (process.argv.includes('--mutants')) {
  const surveyNoCmw = read(SURVEY).replace('curbWidth, curbedMinWidth, smooth', 'curbWidth, smooth')
  const bakeExtra = read(BAKE).replace('    curbedMinWidth: curbedMinWidthOf(scene),', '    curbedMinWidth: curbedMinWidthOf(scene),\n    newKnob: 1,')
  const tgLeak = read(TG).replace('  if (opts.reportGlean) {\n', '  if (opts.surveyStreets) globalThis.__leak = 1\n  if (opts.reportGlean) {\n')
  const M = [
    ['a Survey drops curbedMinWidth', () => judge(read(BAKE), surveyNoCmw, read(TG), BAKE_ONLY), surveyNoCmw !== read(SURVEY)],
    ['b the bake gains a key', () => judge(bakeExtra, read(SURVEY), read(TG), BAKE_ONLY), bakeExtra !== read(BAKE)],
    ['c a stale BAKE_ONLY row', () => judge(read(BAKE), read(SURVEY), read(TG), { ...BAKE_ONLY, gone: 'x' }), true],
    ['d surveyStreets read outside the gate', () => judge(read(BAKE), read(SURVEY), tgLeak, BAKE_ONLY), tgLeak !== read(TG)],
  ]
  let killed = 0
  for (const [name, run, applied] of M) {
    if (!applied) { console.log(`   mutant ${name}: ⛔ NOT APPLIED (the anchor text moved) — a broken instrument`); process.exit(2) }
    const red = run().red
    console.log(`   mutant ${name}: ${red.length ? `RED ✅ (${red[0]})` : 'GREEN ⛔ survived'}`)
    if (red.length) killed++
  }
  console.log(`${killed === M.length ? '✅' : '⛔'} mutants killed ${killed}/${M.length}`)
  if (killed !== M.length) process.exit(1)
}
process.exit(r.red.length ? 1 : 0)
