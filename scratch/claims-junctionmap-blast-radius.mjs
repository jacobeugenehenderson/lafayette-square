#!/usr/bin/env node
// ⛔ READ-ONLY. Sizes the blast radius of GROWING ribbons.junctionMap.nodes from a
// CONSTRUCTION-node index into a COMPLETE node index (Option 1).
//
// ⭐ THE QUESTION IS NOT "WHO READS IT" — it is "WHO WOULD BREAK IF IT GOT BIGGER?"
// A LOOKUP by key is safe under growth. AN ITERATION is the risk — but only if the
// loop body assumes an entry MEANS "construction needed here".
//
// ⛔ This check READS the call sites out of source (no copied line numbers, no
// restated guards) and re-derives every count off the live artifact. Nothing here
// goes stale silently: a site that moves is reported MISSING, loudly.
//
//   node scratch/claims-junctionmap-blast-radius.mjs [scene]
// scene defaults to the bundled artifact (src/data/ribbons.json).

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const scene = process.argv[2]
const ART = scene
  ? join(ROOT, 'cartograph/data', scene, 'clean/ribbons.json')
  : join(ROOT, 'src/data/ribbons.json')

// ── 1. THE CALL SITES, READ OUT OF SOURCE ───────────────────────────────────
// Each probe is the GUARD EXPRESSION itself, matched as a regex against the file.
// ⛔ The verdict is asserted here in prose; the LOCATION is derived. A site that
// cannot be found is a REPORTED FAILURE — this check never assumes it moved.
const SITES = [
  { file: 'src/lib/substrateWalk.js', re: /for \(const n of junctionMap\?\.nodes \|\| \[\]\) nodes\.set/,
    mode: 'ITERATE→INDEX', assumes: 'no', verdict: 'SAFE',
    note: 'builds a key→node Map; every later read is a LOOKUP' },
  { file: 'src/lib/substrateWalk.js', re: /for \(let i = 1; i < pts\.length - 1; i\+\+\) if \(nodes\.has\(VKEY\(pts\[i\]\)\)\) cuts\.push\(i\)/,
    mode: 'LOOKUP (per vertex)', assumes: 'YES — "a node here" ⇒ "cut the chain here"', verdict: 'CHANGES',
    note: 'membership IS the arc-splitting rule; a complete index cuts at EVERY vertex' },
  { file: 'src/lib/substrateWalk.js', re: /for \(const \[nodeKey, n\] of nodes\)/,
    mode: 'ITERATE', assumes: 'no — reads n.cornersAdjacent only', verdict: 'SAFE',
    note: 'a node with no cornersAdjacent contributes no successor and no failure' },
  { file: 'src/lib/substrateWalk.js', re: /const nd = nodes\.get\(cur\.toKey\)/,
    mode: 'LOOKUP', assumes: 'no', verdict: 'CHANGES',
    note: 'diagnostic only: growth re-labels no-successor "no-node" → "no-couplers"' },
  { file: 'src/lib/tileGround.js', re: /if \(substrateTiles && tiles && ribbons\?\.junctionMap\?\.nodes\?\.length\)/,
    mode: 'PRESENCE (.length)', assumes: 'no', verdict: 'SAFE',
    note: 'non-empty test; already true, stays true' },
  { file: 'src/lib/tileGround.js', re: /const consumeJM = !!\(ribbons\?\.junctionMap\?\.nodes\?\.length\)/,
    mode: 'PRESENCE (.length)', assumes: 'no', verdict: 'SAFE',
    note: 'the toy/old-data gate — a bigger map cannot flip it' },
  { file: 'src/lib/tileGround.js', re: /for \(const nd of jm\.nodes\) \{/,
    mode: 'ITERATE', assumes: 'no — every branch is per-node guarded', verdict: 'SAFE-IF',
    note: 'guards are nd.continuity / nd.apron / kinds.includes("divided-transition"); safe ONLY while new entries carry none' },
  { file: 'src/lib/tileGround.js', re: /\.nodes\.filter\(n => \(n\.continuity\?\.length \|\| n\.deTaper\?\.length \|\| n\.apron\)\)/,
    mode: 'ITERATE→FILTER', assumes: 'no — explicitly filters FOR construction', verdict: 'SAFE',
    note: 'ALREADY HARDENED for a prior growth event (the intersection-everywhere "plain" stamps)' },
  { file: 'cartograph/promote-ribbons.js', re: /nodes: r\.junctionMap\?\.nodes\?\.length \|\| 0/,
    mode: 'COUNT', assumes: 'no', verdict: 'CHANGES (by design)',
    note: 'the material-clobber tripwire — growth blocks every promote until --yes' },
  { file: 'cartograph/derive.js', re: /for \(const n of jnodes\.values\(\)\) \{\n      const dirs = \[\]/,
    mode: 'ITERATE (producer)', assumes: 'no', verdict: 'SAFE',
    note: 'the CCW cornersAdjacent sweep runs over ALL jnodes ⇒ new entries get couplers for free' },
]

let siteFail = 0
const src = new Map()
const read = (f) => { if (!src.has(f)) src.set(f, readFileSync(join(ROOT, f), 'utf-8')); return src.get(f) }
const located = SITES.map((s) => {
  const text = read(s.file)
  const m = s.re.exec(text)
  if (!m) { siteFail++; return { ...s, line: null } }
  return { ...s, line: text.slice(0, m.index).split('\n').length }
})

// ── 2. IS "71 REFERENCES" 71 CONSUMERS? ─────────────────────────────────────
// ⛔ A count is not an answer. scratch/ carries FROZEN FORKS of tileGround.js
// (one per probe dir); each inherits all 13 references and consumes nothing live.
import { execSync } from 'node:child_process'
// ⛔ -l, not -n: the artifacts are tens of MB and a line grep overruns the buffer.
const refFiles = execSync(`grep -rl junctionMap src cartograph scratch 2>/dev/null || true`, { cwd: ROOT, maxBuffer: 1 << 26 })
  .toString().split('\n').filter(Boolean)
const bucket = (p) =>
  /^scratch\//.test(p) ? (/\/\./.test(p) ? 'scratch (frozen fork)' : 'scratch (probe)')
    : /_archive\//.test(p) ? 'archive'
      : /\.md$/.test(p) ? 'doc'
        : /\.json/.test(p) ? 'artifact (data)'
          : 'LIVE CODE'
const buckets = {}
for (const p of refFiles) (buckets[bucket(p)] ??= new Set()).add(p)

// ── 3. THE GROWTH, MEASURED ON THE LIVE ARTIFACT ────────────────────────────
if (!existsSync(ART)) { console.error(`⛔ no artifact at ${ART}`); process.exit(2) }
const r = JSON.parse(readFileSync(ART, 'utf-8'))
const N = r.junctionMap?.nodes || []
const VK = (p) => p[0].toFixed(3) + ',' + p[1].toFixed(3)
const keys = new Set(N.map(n => n.key || VK(n.at)))
const curbed = (s) => !s.gradeSeparated && !s.disabled

const uniq = new Set()
let arcsNow = 0, arcsAfter = 0, chains = 0
for (const s of r.streets || []) {
  if (!curbed(s)) continue
  const p = s.points || []
  for (const q of p) uniq.add(VK(q))
  if (p.length < 2) continue
  chains++
  let c = 1
  for (let i = 1; i < p.length - 1; i++) if (keys.has(VK(p[i]))) c++
  arcsNow += c
  arcsAfter += p.length - 1
}
let onChain = 0
for (const k of keys) if (uniq.has(k)) onChain++

const g = (n) => !!(n.continuity?.length || n.deTaper?.length || n.apron)
const stat = {
  nodes: N.length,
  withCornersAdjacent: N.filter(n => (n.cornersAdjacent || []).length).length,
  e3Constructed: N.filter(g).length,
  withApron: N.filter(n => n.apron).length,
  dividedTransition: N.filter(n => (n.kinds || []).includes('divided-transition')).length,
}

// ── REPORT ──────────────────────────────────────────────────────────────────
const pad = (s, n) => String(s).padEnd(n)
console.log(`\njunctionMap blast radius — ${scene || 'lafayette-square (bundled)'}\n`)
console.log('CONSUMER                                            MODE                 ASSUMES-CONSTRUCTION?                   VERDICT')
for (const s of located) {
  console.log(`${pad(s.line ? `${s.file}:${s.line}` : `⛔ NOT FOUND  ${s.file}`, 52)}${pad(s.mode, 22)}${pad(s.assumes, 41)}${s.verdict}`)
  console.log(`    ${s.note}`)
}
if (siteFail) console.log(`\n⛔ ${siteFail} call site(s) NOT FOUND — the source moved. This check is VOID until they are re-located.`)

console.log(`\nfiles mentioning junctionMap: ${refFiles.length}`)
for (const [k, v] of Object.entries(buckets).sort()) console.log(`  ${pad(k, 24)} ${pad(v.size + ' files', 12)}`)
console.log(`  ⇒ LIVE CODE files are the only consumers; scratch forks inherit the references and consume nothing.`)

console.log(`\nnodes today: ${stat.nodes}  (cornersAdjacent ${stat.withCornersAdjacent} · E3-constructed ${stat.e3Constructed} · apron ${stat.withApron} · divided-transition ${stat.dividedTransition})`)
console.log(`unique curbed-chain vertices: ${uniq.size}  ·  nodes landing on one: ${onChain}/${stat.nodes}  ·  vertices with NO node: ${uniq.size - onChain}`)
if (onChain < stat.nodes) console.log(`  ⚠️ ${stat.nodes - onChain} node(s) sit on NO curbed-chain vertex — the stamp names a chain the curbed filter excludes (gradeSeparated/disabled) or a chain the clip dropped (PREBAKE §"stamped pre-clip and never re-filtered"). ⛔ Cause not established here; it decides WHICH population a "complete index" would have to cover.`)
console.log(`OPTION 1 growth: ${stat.nodes} → ${uniq.size} nodes (×${(uniq.size / stat.nodes).toFixed(2)})`)
console.log(`walk arcs: ${arcsNow} → ${arcsAfter} over ${chains} chains  ·  half-edges ${arcsNow * 2} → ${arcsAfter * 2} (×${(arcsAfter / arcsNow).toFixed(2)})`)
console.log(`\n⛔ EVERY walk-derived baseline (coverage %, unclaimed classes, open runs) is measured against a`)
console.log(`   denominator that grows ×${(arcsAfter / arcsNow).toFixed(2)} under Option 1. Pre-growth figures do not carry across.`)
