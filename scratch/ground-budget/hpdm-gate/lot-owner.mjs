// lot-owner.mjs — (ii) THE NEAREST-SPAN OWNER CLASS (Boz, 2026-10-18): every lot vertex of slab-bb-base (the bands bake's mesh)
// that TODAY's deformer (the worktree's, via make-why-lot.mjs) gives the lot branch: the nearest ② span's owner (at-grade run ·
// onTerrain run · corner arc · cap) against the owner(s) of the band piece just inside the back edge its ray finds
// (bands-blend.json's protoBandPieces). Read-only; writes lot-owner.json (the mismatches).
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { loadSceneTerrain } from '../../../cartograph/terrainLoad.js'
import { readBakeDesign } from '../../../cartograph/lookDesign.mjs'
import { resolveWalkNorm, resolveLawnNorm } from '../../../cartograph/curb-cut-norm.mjs'
import { lineHeights } from '../../../.claude/worktrees/hpdm-gate/cartograph/lineHeight.mjs'
import { buildDeformer } from './groundDeformer.why-lot.mjs'
const G = new URL('.', import.meta.url).pathname, slab = G + 'slab-bb-base'
const gj = JSON.parse(readFileSync(join(slab, 'ground.json'), 'utf8')), b = readFileSync(join(slab, gj.bin))
const town = gj.look, design = readBakeDesign(town, town, 'lot-owner'), T = loadSceneTerrain(town), raw = T.getElevationRaw
const walkN = resolveWalkNorm(town, null), lawnN = resolveLawnNorm(town, null)
const blend = design.groundBlendM > 0 ? design.groundBlendM : T.stepM, sigma = design.groundLineSigmaM > 0 ? design.groundLineSigmaM : T.stepM
const rib = JSON.parse(readFileSync(`cartograph/data/${town}/clean/ribbons.json`, 'utf8')).streets
const dump = JSON.parse(readFileSync(G + 'bands-blend.json', 'utf8'))
const LH = lineHeights({ streets: rib, raw, sigma })
const D = buildDeformer({ town, tiles: dump.tiles, ink: dump.ink, bands: dump.bands, stencil: dump.stencil, raw, line: { step: LH.step, heightAt: (id, p) => LH.heightAt(id, p) },
  limits: { walkMax: walkN.crossSlopeMax ?? 0, lawnMax: lawnN.slopeMax ?? null, exag: T.exag, blend, sigma } })
const pip = (x, z, rings) => { let c = false; for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const piecesBy = new Map()
for (const t of dump.bandPieces) if (t) piecesBy.set(t.tile, t.pieces.map(q => { let a = [1e9, 1e9, -1e9, -1e9]; for (const r of q.rings) for (const [x, z] of r) a = [Math.min(a[0], x), Math.min(a[1], z), Math.max(a[2], x), Math.max(a[3], z)]; return { ...q, bb: a } }))
const spanOwner = (ti, k, i) => { const t = dump.tiles[ti], a = t.iaArc?.[k]?.[i], st = t.iaStamp?.[k]?.[i], cp = t.iaCap?.[k]?.[i]
  const n = t.iaFull[k].length, isArc = a != null && t.iaArc[k][(i + 1) % n] === a
  if (isArc) return { cls: 'corner arc', id: `arc ${a}` }
  const o = st != null ? t.runs[st] : cp != null ? t.caps?.[cp] : null
  if (!o) return { cls: 'none', id: '?' }
  return { cls: o.noLine === 'highway' || o.noLine === 'bridge' ? `onTerrain (${o.noLine})` : o.noLine ? `noLine ${o.noLine}` : st != null ? 'at-grade run' : 'cap', id: `${o.skelId}·${o.side ?? '?'}·${o.segOrd ?? '?'}`, skelId: o.skelId, side: o.side } }
const lot = (id) => ['residential', 'commercial', 'institutional', 'underived', 'recreation', 'industrial', 'bare'].includes(id)
const bins = new Map(), byCls = new Map(), pairs = new Map(), mism = [], dev = new Map()
const add = (m, k, v = 1) => m.set(k, (m.get(k) || 0) + v)
let lotV = 0, lotBranch = 0, eased = 0
for (const g of gj.groups) { if (g.rawByteOffset == null || !lot(g.id)) continue
  const P = new Float32Array(b.buffer, b.byteOffset + g.vertexByteOffset, g.vertexCount * 3)
  for (let v = 0; v < g.vertexCount; v++) { const x = P[v * 3], z = P[v * 3 + 2]; lotV++
    const r = D._resolve(x, z), L = r.lot; if (!L) continue; lotBranch++; if (!L.eased) continue; eased++
    const so = spanOwner(L.ti, L.k, L.i); add(byCls, so.cls)
    let bin
    if (!L.behind) bin = 'no band on the ray (ease from ② itself)'
    else { const [bx, bz] = L.behind, hits = (piecesBy.get(L.ti) || []).filter(q => bx >= q.bb[0] && bx <= q.bb[2] && bz >= q.bb[1] && bz <= q.bb[3] && pip(bx, bz, q.rings))
      if (!hits.length) bin = 'behind: in no piece'
      else { const os = hits.flatMap(q => q.owners)
        if (os.some(o => o.edges?.some(e => e.si === L.k && e.e === L.i))) bin = 'behind: the piece names this span\'s edge'
        else if (so.skelId && os.some(o => o.skelId === so.skelId && o.side === so.side)) bin = 'behind: same owner (skelId·side), another edge'
        else { bin = 'behind: ANOTHER owner'; const pk = [...new Set(os.map(o => `${o.skelId}·${o.side}·${o.segOrd}`))].join('+')
          add(pairs, `${so.cls}: ${so.id} → ${pk}`); const dd = Math.abs(r.v - raw(x, z)); (dev.get(so.cls) || dev.set(so.cls, []).get(so.cls)).push(dd)
          mism.push({ x, z, ti: L.ti, span: so, piece: pk, d: L.d, back: L.back, D: r.v, terrain: raw(x, z) }) } } }
    add(bins, `${so.cls} | ${bin}`) } }
const q = (a, p) => { a.sort((u, w) => u - w); return a.length ? a[Math.floor(p * (a.length - 1))].toFixed(3) : '-' }
const Pp = D._resolve(589.896, 1194.325)
console.log(`P (589.896, 1194.325): owner ${Pp.owner} · D ${Pp.v?.toFixed(3)} · terrain ${raw(589.896, 1194.325).toFixed(3)} · lot ${JSON.stringify(Pp.lot && { ...Pp.lot, span: spanOwner(Pp.lot.ti, Pp.lot.k, Pp.lot.i) })}`)
console.log(`lot vertices ${lotV} · lot branch ${lotBranch} · eased (d < back + blend) ${eased}`)
console.log('nearest span class (eased):'); for (const [k, v] of [...byCls].sort((a, b) => b[1] - a[1])) console.log(`   ${v} × ${k}`)
console.log('class | the band piece behind:'); for (const [k, v] of [...bins].sort((a, b) => b[1] - a[1])) console.log(`   ${v} × ${k}`)
console.log('ANOTHER owner, |D − terrain| p50 / p90 / max by span class:'); for (const [k, a] of dev) console.log(`   ${k}: ${a.length} · ${q(a, 0.5)} / ${q(a, 0.9)} / ${q(a, 1)} m`)
console.log('ANOTHER owner, top pairs (span → piece):'); for (const [k, v] of [...pairs].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`   ${v} × ${k}`)
writeFileSync(G + 'lot-owner.json', JSON.stringify(mism))
console.log(`stats ${JSON.stringify(D.stats)}`)
