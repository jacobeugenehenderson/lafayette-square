#!/usr/bin/env node
/**
 * claims-baked-consumers-get-a-cache-bust
 *
 * ⛔ THE CLASS: a component that builds a baked-asset URL as
 * `…/<file>` + (bakeLastMs ? '?t=' + bakeLastMs : '') is SILENTLY STALE when
 * mounted without the prop. The URL never changes, so the browser's HTTP cache
 * serves the PREVIOUS bake — the app renders, nothing errors, and the operator
 * is looking at geometry several bakes old while being told it is current.
 *
 * ⭐ MEASURED 2026-09-20: Preview passed no token to ANY of its nine baked
 * consumers while Stage passed one to all of its. A ground re-bake at 10× the
 * layer separation was invisible in Preview and visible in Stage — which cost
 * an A/B that concluded the exact opposite of the truth. An eye-gate taken in
 * a stale viewer is worse than no eye-gate: it produces confident wrong answers
 * from the operator, which is the most expensive kind.
 *
 * READS THE SOURCE: the consumer list is DERIVED by finding components whose
 * own code gates a `?t=` on bakeLastMs — never a copied list, so a new consumer
 * is covered the day it is written.
 *
 * Run: node checks/claims-baked-consumers-get-a-cache-bust.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, basename, extname } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SRC = join(ROOT, 'src')

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(jsx?|mjs)$/.test(e)) out.push(p)
  }
  return out
}
const files = walk(SRC)

// ⛔⛔ STRIP COMMENTS BEFORE GREPPING. `<BakedGround/>` is written in prose inside
// several doc blocks, and the first cut of this check reported two of them as
// unbusted mounts — a checker reading documentation and calling it code. Fathom hit
// the identical failure the same evening on a different check; it is a class, not a
// slip. ⭐ Blanked, not deleted, so every line number still points at the real file.
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length))
const CODE = new Map(files.map(f => [f, stripComments(readFileSync(f, 'utf8'))]))

// ── 1. DERIVE the consumer set from the source, never a copied list ────────
// A component NEEDS a token at its mount site iff its own code gates a `?t=` on
// the PROP. That is the whole rule, and the two exemptions below are the only
// ones — each added after the check flagged something that could not comply.
const BUSTS = /bakeLastMs\s*\?\s*['"`]\?t=/
const consumers = new Set()
for (const f of files) if (BUSTS.test(CODE.get(f))) consumers.add(basename(f, extname(f)))

// A component that FORWARDS the prop to a busting child needs one too.
for (const f of files) {
  const src = CODE.get(f)
  const self = basename(f, extname(f))
  for (const c of [...consumers]) {
    const m = src.match(new RegExp(`<${c}\\b[^>]*>`, 's'))
    if (m && /bakeLastMs/.test(m[0])) consumers.add(self)
  }
}

// ⛔⛔ EXEMPT ONLY A FORWARDER THAT SOURCES THE TOKEN ITSELF — and ONLY if it does
// not also gate its own URL on the prop. Deriving and needing are NOT exclusive:
// an earlier cut exempted any file containing `bakedAt`, which swallowed
// BakedGround itself and turned the whole check green WITH A REAL MISS PRESENT.
// ⭐ That is the worst failure a checker can have, and only the mutation test
// caught it — a green check proves nothing until it has been seen to fail.
const DERIVES = /(?:const|let)\s+bakeLastMs\s*=|\bbakedAt\b/
for (const f of files) {
  const self = basename(f, extname(f))
  if (!consumers.has(self)) continue
  if (BUSTS.test(CODE.get(f))) continue          // gates its OWN url on the prop
  if (DERIVES.test(CODE.get(f))) consumers.delete(self)
}

// ── 2. Every MOUNT of a consumer must pass the prop
const offenders = []
let mounts = 0
for (const f of files) {
  const src = CODE.get(f)
  const rel = relative(ROOT, f)
  for (const c of consumers) {
    if (basename(f, extname(f)) === c) continue            // its own definition
    const re = new RegExp(`<${c}\\b[^>]*?/?>`, 'gs')
    let m
    while ((m = re.exec(src)) !== null) {
      mounts++
      if (/bakeLastMs/.test(m[0])) continue
      const line = src.slice(0, m.index).split('\n').length
      offenders.push(`${rel}:${line}  <${c}> mounted with no bakeLastMs`)
    }
  }
}

console.log(`derived consumers (gate a ?t= on bakeLastMs): ${[...consumers].sort().join(', ')}`)
console.log(`${mounts} mount site(s) checked`)
if (!offenders.length) { console.log('\n✅ every baked consumer receives a cache-bust token'); process.exit(0) }
console.error('\n⛔ BAKED CONSUMERS MOUNTED WITHOUT A CACHE-BUST TOKEN:')
for (const o of offenders) console.error('   ' + o)
console.error('\nThese render the PREVIOUS bake from the HTTP cache, silently. Pass the look\'s')
console.error('`scene.bakedAt` (useSceneJson fetches no-store in dev, so it is never stale itself).')
process.exit(1)
