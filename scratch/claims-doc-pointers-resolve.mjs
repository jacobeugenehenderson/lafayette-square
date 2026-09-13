#!/usr/bin/env node
// ⭐⭐⭐ EVERY ▶ POINTER IN THE LIVE CANON MUST RESOLVE — AND RUN.
// `CLAUDE.md`: "a dead pointer is the one unforgivable error", and `SECTION §4` records a probe
// (`claims-ped-resolves-per-leg.mjs`) that was cited in TWO docs and had never existed: "a pointer
// that does not resolve reads as EVIDENCE ALREADY GATHERED." A doc that cites a probe nobody can
// run is indistinguishable from a doc that proved something.
// ⛔ It also catches the subtler case: a script that EXISTS but no longer IMPORTS — today
// `scratch/segord-duplicate-forensic.mjs`, the probe `ROADMAP A17` leans on for its authoring-key
// evidence, is dead (`resolveChainSegmentation` moved to `chainSegmentation.js`). Existence is not
// runnability, and A17's evidence was unreproducible without anyone noticing.
// ▶ node scratch/claims-doc-pointers-resolve.mjs [--run]
// ⛔ --run IMPORTS EVERY CITED CHECK, WHICH RUNS IT — live tier included. Never --run with the
//    network up: `checks/tier.mjs` classifies THIS file `live` for exactly that reason.
//   default: existence only (fast).  --run: also import each module, catching moved exports.
import fs from 'fs'
import path from 'path'
const DOCS = ['README.md', 'ORIENTATION.md', 'ROADMAP.md',
  ...fs.readdirSync('cartograph').filter(f => f.endsWith('.md')).map(f => `cartograph/${f}`)]
const RUN = process.argv.includes('--run')
const cited = new Map()                       // script → [docs citing it]
for (const d of DOCS) {
  if (!fs.existsSync(d)) continue
  const txt = fs.readFileSync(d, 'utf8')
  // ⛔ ONLY POINTERS PRESENTED AS RUNNABLE. A doc may legitimately discuss a probe that was
  // DELETED — `POLYGON-FIRST` names two by filename precisely to record that a figure is
  // unreproducible, and flagging those would train the reader to ignore this check. The signal is
  // `node scratch/…`, i.e. the doc telling you to run it.
  // ⛔ BOTH HOMES. The safe tier was promoted to `checks/` on 2026-09-13; a scan that still looked
  //    only at `scratch/` would go green by no longer seeing 124 of the pointers it exists to guard.
  for (const m of txt.matchAll(/node\s+`?(scratch|checks)\/([A-Za-z0-9._-]+\.mjs)/g)) {
    const f = `${m[1]}/${m[2]}`
    ;(cited.get(f) || cited.set(f, []).get(f)).push(d)
  }
}
const missing = [], broken = []
for (const [f, docs] of cited) {
  if (!fs.existsSync(f)) { missing.push([f, docs]); continue }
  if (!RUN) continue
  try { await import(path.resolve(f) + '?probe=' + Date.now()) }
  catch (e) {
    // a probe that runs and exits is fine; only MODULE-level failures matter here
    const msg = String(e && e.message || e)
    if (/does not provide an export|Cannot find module|SyntaxError|is not defined/.test(msg)) broken.push([f, docs, msg.split('\n')[0]])
  }
}
console.log(`${cited.size} distinct check pointer(s) cited across ${DOCS.length} live doc(s)${RUN ? ' · --run: modules imported' : ''}`)
if (missing.length) {
  console.log(`\n⛔ ${missing.length} POINTER(S) DO NOT EXIST — they read as evidence already gathered:`)
  for (const [f, docs] of missing) console.log(`   ${f}\n      cited by: ${[...new Set(docs)].join(', ')}`)
}
if (broken.length) {
  console.log(`\n⛔ ${broken.length} POINTER(S) EXIST BUT DO NOT LOAD — the citation is dead in fact:`)
  for (const [f, docs, why] of broken) console.log(`   ${f}\n      cited by: ${[...new Set(docs)].join(', ')}\n      ${why}`)
}
if (!missing.length && !broken.length) console.log(`\n✅ every cited pointer resolves${RUN ? ' and loads' : ''}.`)
process.exitCode = (missing.length || broken.length) ? 1 : 0
