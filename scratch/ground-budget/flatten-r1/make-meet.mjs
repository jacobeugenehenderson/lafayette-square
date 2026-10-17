// make-meet.mjs — writes bake-ground.meet.js (never committed): at the flatten's "a hole below the lattice … yet a ring
// meets it" refusal, dumps the hole, the meeting ring, the step's output paths / mine / acc within 5 m, and the stack's
// treelawn items within 5 m (group + item), to MEET_OUT; then lets the refusal stand. Hooks PREPENDED.
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
const here = (f) => fileURLToPath(new URL(f, import.meta.url))
const once = (s, a, b, what) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`make-meet: ${what}: anchor found ${n}×`); return s.replace(a, b) }
let bg = readFileSync(here('./bake-ground.gate-branch.js'), 'utf8')
bg = once(bg, "  stackEntries.sort((a, b) => FLOOR_KEYS.has(b.groupKey) - FLOOR_KEYS.has(a.groupKey))\n",
  "  stackEntries.sort((a, b) => FLOOR_KEYS.has(b.groupKey) - FLOOR_KEYS.has(a.groupKey))\n  globalThis.__meetStack = stackEntries\n", 'stack')
bg = once(bg, "        const inMine = edgeIndex(mine)\n", "        const inMine = edgeIndex(mine)\n        globalThis.__meetStep = { key: e.groupKey, mine, acc, paths }\n", 'step')
bg = once(bg, "    if (meets) throw new Error(", "    if (meets) { globalThis.__meetDump?.(h.q, meets.q); throw new Error(", 'meets')
bg = once(bg, "yet a ring of ${meets.q.length} vertices meets it, at ${at}`)", "yet a ring of ${meets.q.length} vertices meets it, at ${at}`) }", 'meets close')
bg = `import * as _fs_meet from 'node:fs'
globalThis.__meetDump = (hq, mq) => {
  const S = 1000, c = [hq[0].X / S, hq[0].Y / S], nearP = (q) => q.some(v => Math.hypot(v.X / S - c[0], v.Y / S - c[1]) < 5)
  const st = globalThis.__meetStep || {}, ring = (q) => q.map(v => [v.X / S, v.Y / S])
  const items = (globalThis.__meetStack || []).filter(e => /^mat:(treelawn|sidewalk|curb)/.test(e.groupKey)).flatMap(e => e.items.flatMap((it, idx) =>
    (Array.isArray(it) ? [it] : [it.outer, ...(it.holes || [])]).map((r, ri) => ({ group: e.groupKey, idx, ri, r }))).filter(x => x.r?.some(v => Math.hypot(v[0] - c[0], v[1] - c[1]) < 5)))
  _fs_meet.writeFileSync(process.env.MEET_OUT, JSON.stringify({ at: c, key: st.key, hole: ring(hq), meets: ring(mq),
    out: (st.paths || []).filter(nearP).map(q => ({ A: q.length && require_area(q), r: ring(q) })), mine: (st.mine || []).filter(nearP).map(ring), acc: (st.acc || []).filter(nearP).map(ring), items }))
  console.log('  [meet] dumped')
}
function require_area(q) { let a = 0; for (let i = 0, j = q.length - 1; i < q.length; j = i++) a += (q[j].X + q[i].X) * (q[j].Y - q[i].Y); return a / 2e6 }
` + bg
writeFileSync(here('./bake-ground.meet.js'), bg)
console.log('[make-meet] bake-ground.meet.js written')
