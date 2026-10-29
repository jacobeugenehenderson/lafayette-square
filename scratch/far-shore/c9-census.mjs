// c9-census.mjs — Zob's C9: run the proposed rule on the source as it stands and print what it flags.
// Rule (draft): inside a useFrame / useMemo / useEffect / useLayoutEffect callback in src/components or src/lib, a call
// that BUILDS geometry (new THREE.*Geometry, .computeVertexNormals(), or a call to a src function that transitively does)
// is flagged unless the callback reads the camera (useThree's camera, the frame state's camera, a Frustum).
// The census then splits each hit by what feeds the build: fetched bytes (a BufferAttribute over an ArrayBuffer /
// typed-array view) vs an instruction it generates from. ▶ node scratch/far-shore/c9-census.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { parse } = require('@babel/parser'), traverse = require('@babel/traverse').default
const ROOT = new URL('../..', import.meta.url).pathname
const files = []; const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : /\.(m?js|jsx)$/.test(n) && files.push(p) } }
walk(join(ROOT, 'src/components')); walk(join(ROOT, 'src/lib'))
const HOOKS = new Set(['useFrame', 'useMemo', 'useEffect', 'useLayoutEffect'])
const isBuild = (p) => (p.isNewExpression() && /Geometry$/.test(p.node.callee.property?.name || p.node.callee.name || ''))
  || (p.isCallExpression() && p.node.callee.property?.name === 'computeVertexNormals')
// pass 1: which named functions (exports and locals) build geometry, directly; then close over calls by name (one level of names, iterated)
const builds = new Set(), calls = new Map(), asts = new Map()
for (const f of files) { let ast; try { ast = parse(readFileSync(f, 'utf8'), { sourceType: 'module', plugins: ['jsx'] }) } catch { continue } asts.set(f, ast)
  traverse(ast, { Function(p) { const name = p.node.id?.name || (p.parentPath.isVariableDeclarator() ? p.parentPath.node.id.name : null); if (!name) return
    let direct = false; const out = new Set()
    p.traverse({ enter(q) { if (isBuild(q)) direct = true; if (q.isCallExpression()) { const c = q.node.callee; const n = c.name || c.property?.name; if (n) out.add(n) } } })
    if (direct) builds.add(name); calls.set(name, new Set([...(calls.get(name) || []), ...out])) } }) }
for (let changed = true; changed;) { changed = false; for (const [n, out] of calls) if (!builds.has(n) && [...out].some(o => builds.has(o))) { builds.add(n); changed = true } }
// the narrower class: a name that (transitively) SAMPLES THE GROUND through a function — the CPU height readers
const SAMPLERS = new Set(['drawnGroundParts', 'drawnGroundY', 'partsAt', 'heightAt', 'getElevationRaw', 'getElevation', 'groundAt', 'rawAt'])
const samples = new Set([...calls].filter(([, out]) => [...out].some(o => SAMPLERS.has(o))).map(([n]) => n))
for (let changed = true; changed;) { changed = false; for (const [n, out] of calls) if (!samples.has(n) && [...out].some(o => samples.has(o))) { samples.add(n); changed = true } }
// pass 2: hook callbacks
const hits = []
for (const [f, ast] of asts) traverse(ast, { CallExpression(p) { const hook = p.node.callee.name; if (!HOOKS.has(hook)) return
  const cb = p.get('arguments.0'); if (!cb?.isFunction?.()) return
  let camera = false, built = [], sampled = false
  cb.traverse({ enter(q) {
    if (q.isIdentifier() && /^(camera|cam|frustum|Frustum)$/.test(q.node.name)) camera = true
    if (q.isCallExpression()) { const n = q.node.callee.name || q.node.callee.property?.name; if (n && (SAMPLERS.has(n) || samples.has(n))) sampled = true }
    if (isBuild(q)) built.push(q.node.callee.property?.name || q.node.callee.name)
    else if (q.isCallExpression()) { const n = q.node.callee.name || q.node.callee.property?.name; if (n && builds.has(n) && n !== hook) built.push(n) } } })
  if (built.length && !camera) hits.push(`${sampled ? 'SAMPLES ' : '        '}${relative(ROOT, f)}:${p.node.loc.start.line} ${hook} → ${[...new Set(built)].slice(0, 4).join(', ')}`) } })
console.log(`${builds.size} named builders found; ${hits.length} hook callbacks build geometry with no camera read:`)
for (const h of hits) console.log('  ' + h)
