#!/usr/bin/env node
/**
 * "IN PLAN VIEW, IS THE TOWN ONE CLOSED CIRCLE WITH A SOFT EDGE?"
 *
 * WHY (Jacob, 2026-09-28, via Warden): "In plan view, in compass view, we need to re-stamp the horizon extension so
 * that the map is a circle with a soft edge again." The neighbourhood is ONE closed shape; the rim is an edge of the
 * drawing, and the fade is applied last, as a look (MEMORY §B). <HorizonDisc> — the ground from the rim out to the
 * horizon — belongs to the movie and the street shots. Drawn under the plan shot, it carried the ground past the
 * rim and the town stopped reading as one circle (the compass bezel sits on that edge).
 *
 * THE RULE, read from source: every mount of `<HorizonDisc` under src/ sits behind a guard (the `{… && <R3FErrorBoundary
 * name="HorizonDisc">` or `{… && <HorizonDisc`), and that guard, EVALUATED with the file's own plan-shot value and
 * everything else truthy, is FALSE. The plan value is the guard's own vocabulary: 'browse' when it names the apps' shot,
 * else 'plan' (<Town shot>). An unguarded mount fails. ▶ the dissolve at the same edge: claims-objects-dissolve-with-the-ground.
 *
 * ⛔ READ-ONLY. Usage: node checks/claims-the-plan-shot-ends-at-the-rim.mjs [--self-test]
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

const ROOT = new URL('..', import.meta.url).pathname
function walk(dir, out = []) {
  for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p, out); else if (/\.jsx?$/.test(n)) out.push(p) }
  return out
}
const code = (src) => src.replace(/\/\*[\s\S]*?\*\/|\{\s*\/\*[\s\S]*?\*\/\s*\}|\/\/.*$/gm, '')

// The guard of a JSX mount: the `{ … &&` expression immediately before the tag (or its error boundary).
function guardsOf(src) {
  const out = []
  const re = /\{([^{}]*?)&&\s*(?:<R3FErrorBoundary\s+name="HorizonDisc"|<HorizonDisc\b)/g
  let m
  while ((m = re.exec(src))) out.push(m[1].trim())
  const mounts = (src.match(/<HorizonDisc\b/g) || []).length
  return { guards: out, mounts }
}
function evalGuard(expr, plan) {
  // Every identifier truthy except the shot, which is the plan value; `quality.x` etc. resolve to truthy.
  const proxy = new Proxy({}, { has: () => true, get: (_, k) => (k === 'shot' ? plan : k === Symbol.unscopables ? undefined : new Proxy(() => true, { get: () => true })) })
  // eslint-disable-next-line no-new-func
  return new Function('scope', `with (scope) { return !!(${expr}) }`)(proxy)
}

export function audit(files) {
  const f = [], info = []
  let total = 0
  for (const x of files) {
    const src = code(x.src)
    const { guards, mounts } = guardsOf(src)
    if (!mounts || x.path.endsWith('HorizonDisc.jsx')) continue
    total += mounts
    if (guards.length < mounts) f.push(`${x.path}: ${mounts - guards.length} <HorizonDisc> mount(s) with no guard — it would draw under the plan shot`)
    for (const g of guards) {
      // The plan value in the guard's own vocabulary: an app's shot names ('browse') or <Town shot> ('plan').
      const plan = /['"]browse['"]/.test(g) ? 'browse' : 'plan'
      let v
      try { v = evalGuard(g, plan) } catch (e) { f.push(`${x.path}: cannot evaluate the HorizonDisc guard \`${g}\` (${e.message})`); continue }
      if (v) f.push(`${x.path}: <HorizonDisc> draws under the plan shot (shot='${plan}') — guard \`${g}\``)
      else info.push(`${x.path}: guard \`${g}\` is false at shot='${plan}'`)
    }
  }
  if (!total) f.push('no <HorizonDisc> mount found — the check cannot see the horizon')
  return { f, info }
}

const files = walk(join(ROOT, 'src')).map(p => ({ path: relative(ROOT, p), src: readFileSync(p, 'utf8') }))

if (process.argv.includes('--self-test')) {
  const town = files.find(x => x.path === 'src/components/Town.jsx')
  const swap = (fn) => files.map(x => x === town ? { ...x, src: fn(x.src) } : x)
  const cases = [
    ['Town drops the plan term', () => audit(swap(s => s.replace(/shot !== 'plan' && /g, ''))).f.length],
    ['a new unguarded mount', () => audit([...files, { path: 'src/fake/App.jsx', src: `<HorizonDisc lookId={l} />` }]).f.length],
    ['a guard that ignores the shot', () => audit([...files, { path: 'src/fake/App.jsx', src: `{heavy && <HorizonDisc lookId={l} />}` }]).f.length],
  ]
  let bad = 0
  for (const [n, run] of cases) { const c = run() > 0; if (!c) bad++; console.log(`${c ? '✅ caught' : '⛔ MISSED'} — ${n}`) }
  process.exit(bad ? 1 : 0)
}

const { f, info } = audit(files)
console.log(info.join('\n'))
if (f.length) { console.log(`⛔ FAIL\n   ${f.join('\n   ')}`); process.exit(1) }
console.log('✅ no <HorizonDisc> draws under the plan shot — in plan view the town ends at its rim')
