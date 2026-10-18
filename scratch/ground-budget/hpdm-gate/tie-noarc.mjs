// tie-noarc.mjs — read-only: the road walls where ② changes owner between two street runs with no arc (runrun-sites.json, from
// road-disagree.mjs), tied site by site to the ② vertex where the owner changes and to what the corner ease said there
// (bands-ease.json: the instrumented producer's easeSites — noR · straightWithR · straight; none = a vertex the ease never saw).
//   node tie-noarc.mjs <bands-ease.json> <runrun-sites.json>
import { readFileSync } from 'fs'
import { loadSceneTerrain } from '../../../cartograph/terrainLoad.js'
import { lineHeights } from '../../../.claude/worktrees/hpdm-gate/cartograph/lineHeight.mjs'
const dump = JSON.parse(readFileSync(process.argv[2], 'utf8')), sites = JSON.parse(readFileSync(process.argv[3], 'utf8'))
const T = loadSceneTerrain('hipointedemun'), LH = lineHeights({ streets: JSON.parse(readFileSync('cartograph/data/hipointedemun/clean/ribbons.json', 'utf8')).streets, raw: T.getElevationRaw, sigma: 5 })
const ease = new Map(); for (const [x, z, k, turn, R] of dump.easeSites) ease.set(`${Math.round(x * 1000)},${Math.round(z * 1000)}`, { k, turn, R })
// every no-arc owner change on ② (by run/cap skelId), per tile: { p, a, b, turn, kind }
const changes = dump.tiles.map(t => { const out = []
  ;(t.iaFull || []).forEach((r, ri) => { const n = r.length, arc = t.iaArc?.[ri] || [], st = t.iaStamp?.[ri] || [], cp = t.iaCap?.[ri] || []
    const own = (i) => st[i] != null ? t.runs[st[i]]?.skelId : cp[i] != null ? t.caps[cp[i]]?.skelId : null, isArc = (i) => arc[i] != null && arc[(i + 1) % n] === arc[i]
    for (let i = 0; i < n; i++) { const a = (i + n - 1) % n; if (isArc(a) || isArc(i)) continue; const oa = own(a), ob = own(i); if (!oa || !ob || oa === ob) continue
      const P = r[a], V = r[i], N = r[(i + 1) % n], d1 = [V[0] - P[0], V[1] - P[1]], d2 = [N[0] - V[0], N[1] - V[1]]
      const turn = Math.abs(Math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1[0] * d2[0] + d1[1] * d2[1])) * 180 / Math.PI
      const e = ease.get(`${Math.round(V[0] * 1000)},${Math.round(V[1] * 1000)}`)
      out.push({ p: V, a: oa, b: ob, turn, kind: e ? e.k : 'none (not a vertex the ease saw)', R: e?.R, step: Math.abs((LH.heightAt(oa, V) ?? NaN) - (LH.heightAt(ob, V) ?? NaN)) }) } })
  return out })
const all = changes.flat(), tally = (L, f) => { const m = new Map(); for (const x of L) { const k = f(x); m.set(k, (m.get(k) || 0) + 1) } return [...m].sort((a, b) => b[1] - a[1]) }
const cls = (c) => c.kind === 'straight' ? 'straight (R = 0, turn < 18°: a CHAIN CUT or a T-side)' : c.kind === 'noR' ? 'noR (turns ≥ 18°, no radius resolved)' : c.kind === 'straightWithR' ? 'straightWithR (an authored R, turn < 18° on ②)' : c.kind
console.log(`no-arc owner changes on ② (street run ↔ street run): ${all.length} · by the ease: ${tally(all, cls).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
const st = all.map(c => c.step).filter(Number.isFinite).sort((a, b) => a - b); console.log(`their H② step (|line_a − line_b| at the vertex): p50 ${st[st.length >> 1]?.toFixed(3)} · p90 ${st[Math.floor(st.length * 0.9)]?.toFixed(3)} · max ${st.at(-1)?.toFixed(3)} m`)
// each wall site → the nearest owner-change vertex of its tile
const tied = sites.map(s => { let best = null, bd = Infinity; for (const c of changes[s.ti] || []) { const d = Math.min(...s.qs.map(q => Math.hypot(q[0] - c.p[0], q[1] - c.p[1]))); if (d < bd) { bd = d; best = c } } return { s, c: best, d: bd } })
console.log(`the ${sites.length} wall sites: tied within 1 m ${tied.filter(t => t.d < 1).length} · 1–5 m ${tied.filter(t => t.d >= 1 && t.d < 5).length} · farther / none ${tied.filter(t => !(t.d < 5)).length}`)
for (const [k, v] of tally(tied.filter(t => t.d < 1), t => cls(t.c))) { console.log(`  ${v}  ${k}`)
  const ex = []; const seenV = new Set(); for (const t of tied) if (t.d < 1 && cls(t.c) === k && !seenV.has(t.c.p.join()) && ex.length < 3) { seenV.add(t.c.p.join()); ex.push(`(${t.c.p.map(v => v.toFixed(2)).join(', ')}) ${t.c.a} | ${t.c.b} · turn ${t.c.turn.toFixed(1)}° · R ${t.c.R ?? '—'} · H② step ${t.c.step.toFixed(3)} m`) }
  for (const e of ex) console.log(`       ${e}`) }
const vs = new Set(tied.filter(t => t.d < 1).map(t => t.c.p.join())); console.log(`distinct ② vertices behind the tied walls: ${vs.size}`)
