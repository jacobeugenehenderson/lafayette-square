// cap-carry.mjs — on each dead-end cap edge, the depths the painter STRUCK (bandEdgeDepths) against the cap owner's own ladder
// (SECTION §6.3: one cross-section, the cap's own). A cap edge that differs is classed by what it lies in: a padded corner arc
// (iaArc + iaCorner — the corner treatment, cMin / arcFrom) or not. Read-only, light (strikes the frozen tile, as the cap check).
//   node scratch/ground-budget/lattice-r1/cap-carry.mjs <shape.json> <town>
import { readFileSync } from 'fs'
const { sectionPassProtoTile, stripLadder, resolvePedDepths } = await import('../../../src/lib/tileGround.js')
const [shp, town] = process.argv.slice(2), tiles = JSON.parse(readFileSync(shp, 'utf8')).tiles, design = JSON.parse(readFileSync(`public/looks/${town}/design.json`, 'utf8'))
const cw = design.curbWidth, BC = design.blockCustoms || null, CO = design.cornerCornerRadiusOverrides || null
const seen = new Set(), C = {}; const ex = []
const add = (k, v) => { C[k] = (C[k] || 0) + v }
for (const [ti, st] of tiles.entries()) { if (!(st.iaCap || []).some(r => (r || []).some(c => c != null))) continue
  const ck = JSON.stringify(st.iaFull); if (seen.has(ck)) continue
  const ED = sectionPassProtoTile(st, cw, { outer: 'LU', inner: 'SW' }, BC, CO, { pieces: true }).bandEdgeDepths; if (!ED) continue; seen.add(ck)
  st.iaCap.forEach((row, si) => (row || []).forEach((c, e) => { if (c == null) return
    const cap = st.caps[c], base = st.runs.find(r => r.skelId === cap.skelId)?.baseMeasure; if (!base) return
    const cu = BC?.[cap.skelId]?.[cap.side]?.[cap.segOrd] || null, d = resolvePedDepths(base, cap.side, cu)
    const L = stripLadder({ treelawn: d.tl, sidewalk: d.sw, matOuter: cu?.materials?.outer ?? (d.hasTL ? 'LU' : 'SW'), matInner: cu?.materials?.inner ?? (d.hasTL ? 'SW' : 'LU') }, (d.tl || 0) + (d.sw || 0))
    const rec = ED[si]?.[e]; if (!rec) return
    const rng = (k) => rec[k]?.length ? [Math.min(...rec[k].map(x => x[1])), Math.max(...rec[k].map(x => x[1]))] : null
    const wf = rng('walkFrom'), wt = rng('walkTo'), eWf = cw + L.walkFrom, eWt = cw + L.walkTo
    const ok = wf && wt && Math.abs(wf[0] - eWf) < 0.01 && Math.abs(wf[1] - eWf) < 0.01 && Math.abs(wt[0] - eWt) < 0.01 && Math.abs(wt[1] - eWt) < 0.01
    const arc = st.iaArc?.[si]?.[e] != null, corner = !!st.iaCorner?.[si]?.[e]
    const k = `${ok ? 'the owner\'s ladder' : 'DIFFERS'} · ${arc ? 'on an arc' : 'off any arc'}${corner ? ' (iaCorner)' : ''}`; add(k, 1)
    if (!ok && ex.length < 8) ex.push(`tile ${ti} edge ${e} cap ${cap.skelId}|${cap.side}: walk struck ${wf?.map(v => v.toFixed(3)).join('–')} → ${wt?.map(v => v.toFixed(3)).join('–')}, owner ${eWf.toFixed(3)} → ${eWt.toFixed(3)} · ${arc ? 'arc' : 'no arc'}${corner ? ', iaCorner' : ''}`) })) }
console.log(`CC ${town}: cap edges by what they strike: ${Object.entries(C).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
for (const x of ex) console.log(`CC   ${x}`)
