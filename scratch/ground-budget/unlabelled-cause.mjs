// unlabelled-cause.mjs — WHY ① NEVER LABELLED THOSE ② VERTICES. READ-ONLY; nothing baked, nothing written over a served file
// (Tern, 2026-10-13; Boz). Companion to unlabelled.mjs (the census off a shape.json).
// It patches src/lib/tileGround.js IN MEMORY (a copy in <out>, served under the original URL by scratch/kerb-cut/swap.mjs), runs
// the town's proto pour, and records:
//   · each ② vertex's label after each label stage: offsetRingByRects (its ① edge label, its ① source vertex) → the hole
//     subtraction → the highway difference;
//   · at the stamp walk's `!key`: null label, or a label naming no owner;
//   · for every ② edge `labelOf` left null inside offsetRingByRects, WHY: no contributor in its cells · off every contributor by
//     more than TOLC · on one but overlapping it by no more than TOLC · on one whose label is not a ① edge.
// Then it keeps only the vertices the SLAB calls unlabelled (by mm coordinate; the stamp walk sees rings shape.json does not
// freeze) and tabulates them.
//   node scratch/ground-budget/unlabelled-cause.mjs <town> <shape.json> [<out dir>]     (default out: scratch/ground-budget/unlabelled-cause.out)
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { spawnSync } from 'child_process'
const R = new URL('../../', import.meta.url).pathname
const [mode, ...rest] = process.argv.slice(2)

if (mode === '--child') {               // inside the swap: pour, and let the patched module write what it saw
  const [town] = rest
  const { feed, buildProto } = await import(R + 'scratch/_proto-feed.mjs')
  buildProto(feed(town), { quiet: true, protoProducer: true })
  process.exit(0)
}

const town = mode, [shape, out = R + 'scratch/ground-budget/unlabelled-cause.out'] = rest
if (!town || !shape) { console.error('usage: node scratch/ground-budget/unlabelled-cause.mjs <town> <shape.json> [<out dir>]'); process.exit(2) }
mkdirSync(out, { recursive: true })

// ── the patch ──
let s = readFileSync(R + 'src/lib/tileGround.js', 'utf8')
const rep = (o, n) => { const c = s.split(o).length - 1; if (c !== 1) throw new Error(`unlabelled-cause: tileGround.js holds ${c} copies of the anchor "${o.slice(0, 70)}…" — re-aim the patch`); s = s.replace(o, () => n) }
const G = '(globalThis.__UNL ??= { stage: new Map(), out: [], rej: new Map() })'
const rec = (stage, rings, labs, extra) => `{ const U = ${G}, m = (U.stage.get(k) || U.stage.set(k, {}).get(k)); const M = (m['${stage}'] = new Map())
          ${rings}.forEach((rg, ri) => rg.forEach((p, i) => M.set(Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000), { lab: ${labs}[ri]?.[i] ?? null${extra} }))) }\n`
let a = '        let outLabs = rings2.map((rg, ri) => (st.edgeLabels?.[ri] || rg.map(() => null)).map(e => (e == null ? null : labs[e])))\n'
rep(a, a + '        ' + rec('offset', 'rings2', 'outLabs', ', edge: st.edgeLabels?.[ri]?.[i] ?? null, src: st.labels?.[ri]?.[i] ?? null'))
a = '            outLabs = B.labels || B.rings.map(rg => rg.map(() => null))\n            outR = B.rings.map(rg => rg.map(() => 0))\n'
rep(a, a + '            ' + rec('holes', 'outRings', 'outLabs', ''))
a = '          outLabs = B.labels || B.rings.map(rg => rg.map(() => null))\n          outR = B.payloads.map(pl => pl.map(v => v?.R || 0))\n'
rep(a, a + '          ' + rec('hwy', 'outRings', 'outLabs', ''))
a = '              if (!key) { cur = null; continue }\n'
rep(a, `              if (!key) { const U = ${G}, p = EC.ring[i], kk = Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000), m = U.stage.get(k) || {}
                U.out.push({ p, why: EC.labs[i] == null ? 'null label' : 'label with no owner',
                  stages: Object.fromEntries(Object.entries(m).map(([sn, M]) => [sn, M.get(kk) ?? 'absent'])) })
                cur = null; continue }\n`)
// labelOf's verdict on every edge it leaves null (or labels with something that is not a ① edge), keyed by the edge's start
a = '  B.labels = B.rings.map(rg => rg.map((p, j) => labelOf(p, rg[(j + 1) % rg.length])))\n'
rep(a, a + `  { const U = ${G}
    B.rings.forEach((rg, rk) => rg.forEach((p, j) => { const lab = B.labels[rk][j]; if (Number.isInteger(lab) && lab >= 0 && lab < n) return
      const q = rg[(j + 1) % rg.length], eL = Math.hypot(q[0] - p[0], q[1] - p[1])
      const ids = new Set([...(grid.get(gk((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)) || []), ...(grid.get(gk(p[0], p[1])) || []), ...(grid.get('*') || [])])
      let why = ids.size ? 'off every contributor by more than TOLC' : 'no contributor in its cells', ovMax = null, offMin = Infinity
      if (lab != null) why = 'labelled by a contributor that is not a ① edge (' + lab + ')'
      else for (const id of ids) { const c = contrib[id], dx = c.b[0] - c.a[0], dy = c.b[1] - c.a[1], L = Math.hypot(dx, dy)
        const off = (r) => Math.abs((r[0] - c.a[0]) * dy - (r[1] - c.a[1]) * dx) / L, o = Math.max(off(p), off(q)); offMin = Math.min(offMin, o)
        if (o > TOLC) continue
        const tp = ((p[0] - c.a[0]) * dx + (p[1] - c.a[1]) * dy) / L, tq = ((q[0] - c.a[0]) * dx + (q[1] - c.a[1]) * dy) / L
        const ov = Math.min(L, Math.max(tp, tq)) - Math.max(0, Math.min(tp, tq)); ovMax = Math.max(ovMax ?? -Infinity, ov)
        why = 'on a contributor, overlap ≤ TOLC' }
      U.rej.set(Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000), { why, eL, ovMax, offMin: Number.isFinite(offMin) ? offMin : null, TOLC }) })) }\n`)
s = `import * as __unl_fs from 'fs'\nprocess.on('exit', () => { const U = globalThis.__UNL; if (process.env.UNL_OUT && U) __unl_fs.writeFileSync(process.env.UNL_OUT, JSON.stringify({ out: U.out, rej: [...U.rej] })) })\n` + s
const copy = `${out}/tileGround.unlabelled-cause.js`, dumpF = `${out}/${town}.json`
writeFileSync(copy, s)

// ── the pour, in a child under the swap ──
const r = spawnSync(process.execPath, ['--max-old-space-size=6000', '--import', R + 'scratch/kerb-cut/swap.mjs', new URL(import.meta.url).pathname, '--child', town],
  { cwd: R, env: { ...process.env, SWAP_MAP: JSON.stringify({ '/src/lib/tileGround.js': copy }), UNL_OUT: dumpF }, stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 1 << 28 })
if (r.status !== 0) { console.error(String(r.stderr).slice(-2000)); throw new Error(`unlabelled-cause: the ${town} pour exited ${r.status}`) }

// ── tabulate the slab's unlabelled vertices ──
const D = JSON.parse(readFileSync(dumpF, 'utf8')), rej = new Map(D.rej)
const key = (p) => Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000)
const T = JSON.parse(readFileSync(shape, 'utf8')).tiles, slab = new Map(), seen = new Set()
T.forEach(t => (t.iaFull || []).forEach((rg, ri) => { const sig = JSON.stringify(rg); if (seen.has(sig)) return; seen.add(sig); const m = rg.length
  rg.forEach((p, i) => { if (t.iaStamp[ri][i] == null && t.iaCap[ri][i] == null) { const q = rg[(i + 1) % m], b = rg[(i - 1 + m) % m]
    slab.set(key(p), { leave: Math.hypot(q[0] - p[0], q[1] - p[1]), arrive: Math.hypot(p[0] - b[0], p[1] - b[1]) }) } }) }))
const hit = new Map(); for (const o of D.out) if (slab.has(key(o.p)) && !hit.has(key(o.p))) hit.set(key(o.p), o)
// the label a merged vertex carries is the edge leaving the LAST point of its merged pair, within one grid step of it
const rejNear = (p) => { const x = Math.round(p[0] * 1000), z = Math.round(p[1] * 1000); for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const v = rej.get(`${x + dx},${z + dz}`); if (v) return v } return null }
const tally = (f) => { const c = {}; for (const [k, o] of hit) { const v = f(o, k); c[v] = (c[v] || 0) + 1 } return Object.entries(c).map(([k, v]) => `${k} ×${v}`).join(' · ') }
const stg = (o, n) => { const v = o.stages[n]; return v === undefined ? 'not run' : v === 'absent' ? 'absent' : v.lab == null ? 'null' : 'labelled' }
const mm = (v) => `${Math.round(v * 1000)} mm`
console.log(`${town}: unlabelled in the slab ${slab.size} · matched at the stamp walk ${hit.size}`)
console.log(`  why: ${tally(o => o.why)}`)
console.log(`  out of offsetRingByRects: ${tally(o => stg(o, 'offset'))} · ① edge ${tally(o => o.stages.offset?.edge == null ? 'null' : 'set')} · ① source vertex ${tally(o => o.stages.offset?.src == null ? 'none' : 'set')}`)
console.log(`  hole subtraction: ${tally(o => stg(o, 'holes'))} · highway difference: ${tally(o => stg(o, 'hwy'))}`)
console.log(`  the short edge: ${tally((o, k) => slab.get(k).leave < slab.get(k).arrive ? 'leaves it' : 'arrives at it')} · leaving edge ${tally((o, k) => mm(slab.get(k).leave))}`)
console.log(`  labelOf's verdict on the edge leaving it, by that edge's length:`)
const by = {}; for (const [k, o] of hit) { const v = rejNear(o.p), L = mm(slab.get(k).leave); const w = v ? v.why : 'no verdict recorded within one grid step'; (by[L] ??= {})[w] = (by[L][w] || 0) + 1 }
for (const [L, w] of Object.entries(by).sort()) console.log(`    ${L}: ${Object.entries(w).map(([k, v]) => `${k} ×${v}`).join(' · ')}`)
const ex = [...hit].map(([k, o]) => ({ k, v: rejNear(o.p), L: slab.get(k).leave })).filter(e => e.v && e.L > 0.0025).slice(0, 8)
if (ex.length) console.log(`  the 3–4 mm edges' verdicts (edge · overlap max · off min · TOLC): ${ex.map(e => `${mm(e.L)} · ${e.v.ovMax == null ? '—' : (e.v.ovMax * 1000).toFixed(2) + ' mm'} · ${e.v.offMin == null ? '—' : (e.v.offMin * 1000).toFixed(2) + ' mm'} · ${(e.v.TOLC * 1000).toFixed(0)} mm (${e.v.why})`).join(' | ')}`)
