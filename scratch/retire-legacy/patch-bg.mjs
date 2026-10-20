// patch-bg.mjs <bake-ground.js> <out> — a copy of the bake that RECORDS its one buildTileGround call (for proof.mjs): the return,
// its inputs, and the wall-clock and peak RSS around it. Nothing else changes; refuses if the call site is not found exactly once.
import fs from 'fs'
const [src, out] = process.argv.slice(2)
let t = fs.readFileSync(src, 'utf8')
const call = '  const pr = buildTileGround(ribbons, {'
if (t.split(call).length !== 2) { console.error(`⛔ ${src}: the buildTileGround call site is not there exactly once`); process.exit(2) }
const at = t.indexOf(call), close = t.indexOf('\n  })\n', at)
if (close < 0) { console.error('⛔ no close of the call'); process.exit(2) }
const end = close + '\n  })\n'.length
t = t.slice(0, at) + '  globalThis.__T0 = performance.now(); globalThis.__M0 = process.resourceUsage().maxRSS\n' + t.slice(at, end) +
  '  globalThis.__T1 = performance.now(); globalThis.__M1 = process.resourceUsage().maxRSS; globalThis.__PR = pr; globalThis.__RIB = ribbons; globalThis.__STENCIL = stencilPolygon\n' + t.slice(end)
fs.writeFileSync(out, t)
console.error(`[patch-bg] ${src} → ${out}`)
