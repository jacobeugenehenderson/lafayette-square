// Read-only census of the "street-sides with no handle" row of checks/claims-handle-rides-its-arc.mjs.
// CODE from the integration worktree; DATA from the main checkout (untracked town data lives there).
// Same build + same stampArcs + same denominator as the check; then classifies each dark side.
//   node dark-sides.mjs <scene>
import fs from 'fs'
import path from 'path'
const CODE = '/Users/jacobhenderson/Desktop/lafayette-square.nosync/.claude/worktrees/census-202'
const DATA = '/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const SCENE = process.argv[2] || 'lafayette-square'
const { buildTileGround, hasStampInquiry } = await import(path.join(CODE, 'src/lib/tileGround.js'))
const { resolveCurbWidth, curbedMinWidth, townState } = await import(path.join(CODE, 'src/cartograph/streetProfiles.js'))
const rd = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const ribP = SCENE === 'lafayette-square' ? path.join(CODE, 'src/data/ribbons.json') : path.join(DATA, `cartograph/data/${SCENE}/clean/ribbons.json`)
const ribbons = rd(ribP)
const design = (() => { try { return rd(path.join(CODE, `public/looks/${SCENE}/design.json`)) } catch { return {} } })()
const b = rd(path.join(DATA, `cartograph/data/${SCENE}/neighborhood_boundary.json`))
const hood = b.boundary
const osmP = path.join(DATA, `cartograph/data/${SCENE}/raw/osm.json`)
const state = fs.existsSync(osmP) ? townState(rd(osmP)) : { code: null }
const cmw = curbedMinWidth(rd(path.join(CODE, 'references/registry.json')), state, null)
const inHood = (x, z) => { let o = false; for (let i = 0, j = hood.length - 1; i < hood.length; j = i++) { const [xi, zi] = hood[i], [xj, zj] = hood[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) o = !o } return o }
const CW = resolveCurbWidth(design).value
const FROZEN = process.argv.includes('--frozen')
const tiles = FROZEN ? rd(path.join(DATA, `public/baked/${SCENE}/shape.json`)).tiles
  : buildTileGround(ribbons, { stencil: hood, curbWidth: CW, smooth: 0, blockLandUse: design.blockLandUse || null,
  cornerRadiusScale: design.cornerRadiusScale ?? 1, cornerRadiusOverrides: design.cornerRadiusOverrides || null,
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides || null, blockCustoms: design.blockCustoms || null, curbedMinWidth: cmw }).protoShapeTiles || []
function stampArcs(st) {   // verbatim from the check
  const out = []
  ;(st.iaFull || []).forEach((ring, si) => {
    const stp = st.iaStamp?.[si] || [], n = ring.length
    if (n < 2 || stp.length !== n) return
    let start = 0; while (start < n && stp[start] === stp[(start - 1 + n) % n]) start++
    if (start === n) { if (stp[0] != null) out.push({ owner: stp[0], poly: [...ring, ring[0]] }); return }
    for (let k = 0; k < n;) { const q0 = (start + k) % n, r = stp[q0]; let len = 0
      while (k + len < n && stp[(start + k + len) % n] === r) len++
      if (r != null) { const poly = []; for (let t = 0; t <= len; t++) poly.push(ring[(q0 + t) % n]); out.push({ owner: r, poly }) }
      k += len }
  })
  return out
}
const runsBy = new Map()   // key → { runs, withArc, polyLen, inTilesUnstamped }
const plen = (p) => { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s }
let unst = 0
for (const st of tiles) {
  const ok = hasStampInquiry(st); if (!ok) unst++
  const arcs = ok ? stampArcs(st) : []
  const owners = new Set(arcs.map(a => a.owner))
  ;(st.runs || []).forEach((run, ri) => {
    if (!run.skelId || !run.poly || run.poly.length < 2) return
    const k = `${run.skelId}|${run.side}`
    if (!runsBy.has(k)) runsBy.set(k, { runs: 0, withArc: 0, len: 0 })
    const e = runsBy.get(k); e.runs++; e.len += plen(run.poly); if (owners.has(ri)) e.withArc++
  })
}
const bc = design.blockCustoms || {}
const authoredSide = (skel, side) => { const c = bc[skel]?.[side]; return c && typeof c === 'object' && Object.keys(c).length > 0 }
const rows = []
for (const st of ribbons.streets || []) {
  if (st.gradeSeparated || !st.measure) continue
  const skel = st.skelId || st.name
  const pts = st.points || []
  let L = 0, Lin = 0
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); L += l
    const mx = (pts[i][0] + pts[i - 1][0]) / 2, mz = (pts[i][1] + pts[i - 1][1]) / 2; if (inHood(mx, mz)) Lin += l }
  for (const side of ['left', 'right']) {
    if (!(st.measure[side]?.pavementHW > 0)) continue
    const k = `${skel}|${side}`, e = runsBy.get(k)
    const other = runsBy.get(`${skel}|${side === 'left' ? 'right' : 'left'}`)
    const dark = !(e && e.withArc > 0)
    rows.push({ k, dark, type: st.type, disabled: !!st.disabled, L, Lin, kind: !e ? 'no run' : 'runs, no arc', runs: e?.runs || 0, runLen: e?.len || 0,
      otherLit: !!(other && other.withArc > 0), authored: authoredSide(skel, side), divided: !!(st.divided || st.pair || st.anchor === 'inner' || st.corridorPair) })
  }
}
const dark = rows.filter(r => r.dark)
const pct = (a, n) => n ? (100 * a / n).toFixed(1) + '%' : '—'
const tally = (arr, f) => { const m = new Map(); for (const r of arr) { const k = f(r); m.set(k, (m.get(k) || 0) + 1) } return [...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ') }
const where = (r) => r.Lin === 0 ? 'outside hood (0 m in)' : r.Lin < 0.999 * r.L ? 'crosses the rim' : 'wholly inside'
console.log(`══ ${SCENE}${FROZEN ? ' [FROZEN shape.json]' : ' [live build]'} · tiles ${tiles.length} (${unst} unstamped) · blockCustoms chains ${Object.keys(bc).length}`)
console.log(`sides (check's denominator): ${rows.length} · dark ${dark.length} (${pct(dark.length, rows.length)})`)
console.log(`  by kind:      ${tally(dark, r => r.kind)}`)
console.log(`  by hood:      ${tally(dark, where)}   [all sides: ${tally(rows, where)}]`)
const inside = rows.filter(r => r.Lin > 0), dIn = inside.filter(r => r.dark)
console.log(`  sides with ≥1 m in hood: ${inside.length} · dark ${dIn.length} (${pct(dIn.length, inside.length)})`)
const whole = rows.filter(r => where(r) === 'wholly inside'), dW = whole.filter(r => r.dark)
console.log(`  sides wholly inside:     ${whole.length} · dark ${dW.length} (${pct(dW.length, whole.length)})`)
console.log(`  dark & in hood, by kind: ${tally(dIn, r => r.kind)}`)
console.log(`  dark & in hood, by type: ${tally(dIn, r => r.type)}`)
console.log(`  dark & in hood, far side lit: ${tally(dIn, r => r.otherLit ? 'far side lit' : 'far side dark too')}`)
console.log(`  dark & in hood, authored side: ${tally(dIn, r => r.authored ? 'authored' : 'not authored')}   [all in-hood sides authored: ${inside.filter(r => r.authored).length}]`)
console.log(`  dark & in hood, disabled chain: ${dIn.filter(r => r.disabled).length}`)
const lens = dIn.map(r => r.Lin).sort((a, b) => a - b); const q = (p) => lens.length ? lens[Math.floor(p * (lens.length - 1))].toFixed(1) : '—'
console.log(`  dark & in hood, in-hood length m: min ${q(0)} · p25 ${q(.25)} · median ${q(.5)} · p75 ${q(.75)} · max ${q(1)} · total ${lens.reduce((a, b) => a + b, 0).toFixed(0)} of ${inside.reduce((a, r) => a + r.Lin, 0).toFixed(0)}`)
console.log(`  runs-no-arc detail: ${dIn.filter(r => r.kind !== 'no run').map(r => `${r.k}(${r.type},${r.runs}r,${r.runLen.toFixed(0)}m)`).slice(0, 25).join(' · ')}`)
console.log(`  no-run in hood, longest: ${dIn.filter(r => r.kind === 'no run').sort((a, b) => b.Lin - a.Lin).slice(0, 15).map(r => `${r.k}(${r.type},${r.Lin.toFixed(0)}m${r.otherLit ? ',far lit' : ''})`).join(' · ')}`)
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), `${SCENE}${FROZEN ? '.frozen' : ''}.json`), JSON.stringify(rows, null, 1))
