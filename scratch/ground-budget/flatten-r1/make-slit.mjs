// make-slit.mjs — writes tileGround.slit.js + bake-ground.slit.js (never committed): at each SLIT_AT point ("x,z;x,z"),
// every `cutByStamp` call whose input box holds it records its input rings, every stamp part (class, region) and its output
// pieces; written to SLIT_OUT at the stack entry, where it exits. Hooks PREPENDED (main() runs at module level).
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
const here = (f) => fileURLToPath(new URL(f, import.meta.url))
const once = (s, a, b, what) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`make-slit: ${what}: anchor found ${n}×`); return s.replace(a, b) }
let tg = readFileSync(here('../../../src/lib/tileGround.js'), 'utf8')
tg = once(tg, "  for (const lu of sp.classes) out.push(...intersectRings(own, sp.regionsOf(lu)))\n  warnOutside(sp, own, 'walk/curb paint')\n",
  "  for (const lu of sp.classes) out.push(...intersectRings(own, sp.regionsOf(lu)))\n  globalThis.__slitRec?.(own, sp, out)\n  warnOutside(sp, own, 'walk/curb paint')\n", 'cutByStamp')
writeFileSync(here('./tileGround.slit.js'), tg)
let bg = readFileSync(here('./bake-ground.gate-branch.js'), 'utf8')
bg = `import * as _fs_slit from 'node:fs'
const _SL = (process.env.SLIT_AT || '').split(';').filter(Boolean).map(s => s.split(',').map(Number)), _slOut = { pts: _SL, calls: [] }
globalThis.__slitRec = (own, sp, out) => {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
  for (const r of own) for (const [x, z] of r) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z }
  const hit = _SL.filter(([x, z]) => x >= x0 - 1 && x <= x1 + 1 && z >= z0 - 1 && z <= z1 + 1); if (!hit.length) return
  _slOut.calls.push({ pts: hit, own, parts: sp.parts.map(p => ({ lu: p.lu, region: p.region })), classes: sp.classes, out })
}
` + once(bg, "  stackEntries.sort((a, b) => FLOOR_KEYS.has(b.groupKey) - FLOOR_KEYS.has(a.groupKey))\n",
  "  stackEntries.sort((a, b) => FLOOR_KEYS.has(b.groupKey) - FLOOR_KEYS.has(a.groupKey))\n  _fs_slit.writeFileSync(process.env.SLIT_OUT, JSON.stringify(_slOut)); console.log('  [slit] ' + _slOut.calls.length + ' cutByStamp call(s) recorded; exiting'); process.exit(0)\n", 'stack entry')
writeFileSync(here('./bake-ground.slit.js'), bg)
console.log('[make-slit] tileGround.slit.js + bake-ground.slit.js written')
