// d-across.mjs — read-only: the crease check's centreline samples (every 0.5 m along every tile's ①, ±δ = 10 × LATTICE_M)
// asked of D DIRECTLY, not of the mesh: a step here is D's own; a step only in the slab check is the mesh chording D.
//   node --max-old-space-size=6000 d-across.mjs <dump.json> <groundDeformer.mjs>
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { loadSceneTerrain } from '../../../cartograph/terrainLoad.js'
import { readBakeDesign } from '../../../cartograph/lookDesign.mjs'
import { resolveWalkNorm, resolveLawnNorm } from '../../../cartograph/curb-cut-norm.mjs'
import { LATTICE_M } from '../../../src/lib/lattice.js'
import { lineHeights } from '../../../.claude/worktrees/hpdm-gate/cartograph/lineHeight.mjs'
const town = 'hipointedemun', T = loadSceneTerrain(town), raw = T.getElevationRaw, E = T.exag, design = readBakeDesign(town, town, 'd-across')
const sigma = design.groundLineSigmaM > 0 ? design.groundLineSigmaM : T.stepM, blend = design.groundBlendM > 0 ? design.groundBlendM : T.stepM
const rib = JSON.parse(readFileSync(`cartograph/data/${town}/clean/ribbons.json`, 'utf8')).streets, LH = lineHeights({ streets: rib, raw, sigma })
const dump = JSON.parse(readFileSync(process.argv[2], 'utf8')), { buildDeformer } = await import(resolve(process.argv[3]))
const walkN = resolveWalkNorm(town, null), lawnN = resolveLawnNorm(town, null)
const D = buildDeformer({ town, tiles: dump.tiles, ink: dump.ink ?? [], bands: dump.bands, stencil: dump.stencil, raw, line: { step: LH.step, heightAt: (id, p) => LH.heightAt(id, p) },
  limits: { walkMax: walkN.crossSlopeMax ?? 0, lawnMax: lawnN.slopeMax ?? null, exag: E, blend, sigma } })
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c } return c }
const NO = new Map(), ST = [], TOP = [], CB = new Map(), CW = new Map(); const NB = new Map(), SB = new Map(), WB = new Map(); const dl = 10 * LATTICE_M; let n = 0, steps = 0, worst = 0, nul = 0; const at = []
for (const t of dump.tiles) { const r = t.ring
  for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L < 1e-6) continue
    const nx = -(q[1] - p[1]) / L, nz = (q[0] - p[0]) / L
    for (let s = 0.25; s < L; s += 0.5) { const x = p[0] + (q[0] - p[0]) * s / L, z = p[1] + (q[1] - p[1]) * s / L
      if (dump.stencil && !pip(x, z, dump.stencil)) continue
      const a = D.heightAt(x + nx * dl, z + nz * dl), b = D.heightAt(x - nx * dl, z - nz * dl); n++
      const oa = D.ownerAt(x + nx * dl, z + nz * dl), ob = D.ownerAt(x - nx * dl, z - nz * dl), kind = (o) => o == null ? 'none' : o.startsWith('①') ? 'road:' + (o.split('|')[2] === (t.ringOwner[i]?.skelId ?? '__rim__') ? 'own' : 'other') : o.startsWith('ink') ? (o.includes('+') ? 'crossing' : 'ink') : 'ped'
      const cls = [kind(oa), kind(ob)].sort().join('↔'), hw = /__highway__/.test(`${oa}${ob}`) || t.ringOwner[i]?.skelId === '__highway__' ? ' · highway' : ''
      if (a == null || b == null) { nul++; NB.set(cls + hw, (NB.get(cls + hw) || 0) + 1); const ok = t.ringOwner[i]?.kind ?? (t.ringOwner[i]?.gradeSeparated ? 'gradeSep' : t.ringOwner[i]?.skelId === '__highway__' ? 'highway' : 'street'); NO.set(ok, (NO.get(ok) || 0) + 1); continue }
      const ex = Math.abs(a - b) * E - Math.abs(raw(x + nx * dl, z + nz * dl) - raw(x - nx * dl, z - nz * dl)) * E
      if (ex > LATTICE_M && cls === 'ink↔road:own') { const side = kind(oa) === 'ink' ? -1 : 1, X = x + side * nx * dl, Z = z + side * nz * dl, e = D.explain(X, Z), id = t.ringOwner[i]?.skelId
        TOP.push({ ex, at: [x, z], id, H2: e.H, d2: e.d, L: id ? LH.heightAt(id, [X, Z]) : null, terr: raw(X, Z), st: e.station }) }
      if (ex > LATTICE_M) { const o = t.ringOwner[i], gs = o?.gradeSeparated || o?.skelId === '__highway__', e = D.explain(x - nx * dl, z - nz * dl), e2 = D.explain(x + nx * dl, z + nz * dl)
        const near = [e, e2].filter(q => q?.station).map(q => q.d).sort((a, b) => a - b)[0]
        const k2 = (gs ? '① grade-separated or highway' : '① a street') + (near != null && near < 2 ? ' · ② within 2 m' : ''); CB.set(k2, (CB.get(k2) || 0) + 1); if (!gs) ST.push({ ex, at: [x, z], id: o?.skelId ?? o?.kind, cls, oa: D.ownerAt(x + nx * dl, z + nz * dl), ob: D.ownerAt(x - nx * dl, z - nz * dl), a, b }); if (!(CW.get(k2) >= ex)) CW.set(k2, ex) }
      if (ex > LATTICE_M) { SB.set(cls + hw, (SB.get(cls + hw) || 0) + 1); if (!(WB.get(cls + hw) >= ex)) WB.set(cls + hw, ex); steps++; if (at.length < 6) at.push(`(${x.toFixed(1)}, ${z.toFixed(1)}) ${ex.toFixed(4)} m ${t.ringOwner[i]?.skelId ?? t.ringOwner[i]?.kind}`) }
      worst = Math.max(worst, ex) } } }
console.log(`D across ① (direct): ${n} sample(s) · ${steps} step(s) > LATTICE_M beyond the terrain · worst ${worst.toFixed(4)} m · null on a side ${nul}${at.length ? ' · ' + at.join(' · ') : ''}`)
console.log(`steps by side pair: ${[...SB].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v} (worst ${WB.get(k).toFixed(3)})`).join(' · ')}`)
console.log(`null by side pair: ${[...NB].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
TOP.sort((a, b) => b.ex - a.ex); for (const r of TOP.slice(0, 8)) console.log(`  (${r.at.map(v => v.toFixed(2)).join(', ')}) ${r.ex.toFixed(3)} m · ${r.id} · L ${r.L?.toFixed(2)} · H② ${r.H2?.toFixed(2)} at d② ${r.d2?.toFixed(2)} m (${r.st?.map(v => v.toFixed(1)).join(', ')}) · terrain ${r.terr.toFixed(2)}`)
const g = TOP.map(r => Math.abs(r.H2 - r.L) / (r.d2 + 0.01)).sort((a, b) => a - b); console.log(`|H② − L| / W over the ink↔road steps: p50 ${g[g.length >> 1]?.toFixed(3)} · p90 ${g[Math.floor(g.length * 0.9)]?.toFixed(3)} · max ${g[g.length - 1]?.toFixed(3)}`)
console.log(`steps by ① owner class: ${[...CB].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v} (worst ${CW.get(k).toFixed(3)})`).join(' · ')}`)
ST.sort((p, q) => q.ex - p.ex); const sc = new Map(); for (const r of ST) sc.set(r.cls, (sc.get(r.cls) || 0) + 1); console.log('street-class by side pair:', [...sc].map(([k, v]) => k + ' ' + v).join(' · '))
for (const r of ST.slice(0, 8)) console.log(`  (${r.at.map(v => v.toFixed(2)).join(', ')}) ${r.ex.toFixed(3)} · ${r.id} · ${r.cls} · ${r.oa} ${r.a.toFixed(3)} ↔ ${r.ob} ${r.b.toFixed(3)}`)
console.log('null by ① edge owner:', [...NO].map(([k, v]) => k + ' ' + v).join(' · '))
