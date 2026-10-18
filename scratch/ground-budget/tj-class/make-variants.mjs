// make-variants.mjs — scratch copies of groundConformity.js for the T-junction class (91c7fb7f; Boz 2026-10-18). Each edit's
// anchor is asserted. Relative imports are rewritten to absolute. Never imported by the bake.
//   node make-variants.mjs <groundConformity.js>  → groundConformity.{base,a,b}.js beside this file
//   base = as given · a = midpointIndex goes through the weld (vid) · b = findTJunctions keys vertices by exact float32 identity
import { readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
const one = (s, a, b) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`make-variants: anchor found ${n}× — ${a}`); return s.replace(a, b) }
const srcPath = resolve(process.argv[2]), dir = dirname(srcPath)
let base = readFileSync(srcPath, 'utf8').replace(/from '(\.\.?\/[^']+)'/g, (m, p) => `from '${resolve(dir, p)}'`)
if (/from '\.\.?\//.test(base)) throw new Error('a relative import survived')
const a = one(base, "if (i === undefined) { i = PX.length; PX.push((PX[a] + PX[b]) * 0.5); PZ.push((PZ[a] + PZ[b]) * 0.5); midCache.set(k, i) }",
  "if (i === undefined) { i = vid((PX[a] + PX[b]) * 0.5, (PZ[a] + PZ[b]) * 0.5); midCache.set(k, i) }")
// b: inside findTJunctions only, every weldKey( becomes an exact-identity key (an integer per distinct float32 position)
const head = 'export function findTJunctions(groups, lift = null) {'
const at = base.indexOf(head); if (at < 0 || base.indexOf(head, at + 1) >= 0) throw new Error('findTJunctions anchor')
const end = base.indexOf('\n}\n', at); const body = base.slice(at, end)
if (!(body.match(/weldKey\(/g)?.length >= 3)) throw new Error('findTJunctions: fewer weldKey uses than expected')
const b = base.slice(0, at) + body.replace(head, head + "\n  const __xid = new Map(), weldKeyX = (x, z) => { const s = Math.fround(x) + ',' + Math.fround(z); let k = __xid.get(s); if (k === undefined) { k = __xid.size; __xid.set(s, k) } return k }")
  .replace(/weldKey\(/g, 'weldKeyX(').replace('weldKeyX = (x, z) =>', 'weldKeyX = (x, z) =>') + base.slice(end)
for (const [n, s] of [['base', base], ['a', a], ['b', b]]) writeFileSync(new URL(`groundConformity.${n}.js`, import.meta.url), s)
console.log('written base, a, b')
