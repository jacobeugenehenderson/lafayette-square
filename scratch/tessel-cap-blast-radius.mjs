// THE BLAST RADIUS. Rebuilds the shape pass twice — with the fix, and with the
// old Math.max forced back through the same code path — and diffs EVERY tile's
// geometry. Only tiles carrying a cap with asymmetric legs may differ.
// ⛔ Writes nothing, bakes nothing.
//   node scratch/tessel-cap-blast-radius.mjs
import fs from 'node:fs'
import crypto from 'node:crypto'
const R = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const rb = R('src/data/ribbons.json'), ov = R('cartograph/data/lafayette-square/clean/overlay.json')
const dg = R('public/looks/lafayette-square/design.json'), nb = R('cartograph/data/lafayette-square/neighborhood_boundary.json')
const streets = rb.streets.map(x => {
  const m = ov.streets?.[x.skelId || x.name]?.measure
  return (m && (Number.isFinite(m?.left?.pavementHW) || Number.isFinite(m?.right?.pavementHW))) ? { ...x, measure: { ...x.measure, ...m } } : x
})
const opts = { stencil: nb.boundary, curbWidth: dg.curbWidth ?? 0.1524, blockLandUse: dg.blockLandUse || null,
  cornerRadiusScale: dg.cornerRadiusScale ?? 1, cornerRadiusOverrides: dg.cornerRadiusOverrides || null,
  cornerCornerRadiusOverrides: dg.cornerCornerRadiusOverrides || null, blockCustoms: dg.blockCustoms || null, emitArtifact: true }
async function build(oldRule) {
  // The mutation rides an env flag read by nothing in src — instead we re-import
  // a rewritten copy so the shipped file is never edited by this probe.
  const src = fs.readFileSync('src/lib/tileGround.js', 'utf8')
  const mut = oldRule
    ? src.replace('const hw = (hwL + hwR) / 2', 'const hw = Math.max(hwL, hwR)').replace('const disp = (hwR - hwL) / 2', 'const disp = 0')
    : src
  // The copy must live beside the original so its relative imports resolve; it
  // is removed in the finally below, and its name is dot-prefixed so a crash
  // leaves something obviously temporary rather than a plausible module.
  const tmp = `src/lib/.tg-probe-${oldRule ? 'old' : 'new'}.mjs`
  fs.writeFileSync(tmp, mut)
  let m
  try { m = await import('../src/lib/' + tmp.split('/').pop() + '?v=' + Math.random()) }
  finally { try { fs.unlinkSync(tmp) } catch {} }
  const q = console.log; console.log = () => {}
  const b = m.buildTileGround({ ...rb, streets }, opts)
  console.log = q
  return Array.isArray(b._shapeArtifact) ? b._shapeArtifact : b._shapeArtifact.tiles
}
const NEW = await build(false), OLD = await build(true)
const { sectionPassTile } = await import('../src/lib/tileGround.js')
const h = (v) => crypto.createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 12)
const CW = dg.curbWidth ?? 0.1524, BC = dg.blockCustoms || null
// ⛔ Key by the tip NODE, not skelId: 4 of LS's 50 roundTips carry no skelId, and
// keying on it collides them all onto `undefined|undefined`.
const tipK = (r) => `${Math.round(r.p[0] * 1000)},${Math.round(r.p[1] * 1000)}`
const asymOf = (a, b) => {
  const bo = new Map((b.roundTips || []).map(r => [tipK(r), r]))
  return (a.roundTips || []).filter(r => { const o = bo.get(tipK(r)); return o && Math.abs(r.hw - o.hw) > 1e-12 })
    .map(r => `${r.skelId || '(no skelId)'}|${r.capEnd || '?'}`)
}
console.log(`tiles: new ${NEW.length}, old ${OLD.length}`)
let shapeSame = 0, shapeDiff = [], bandSame = 0, bandDiff = [], unexpected = [], info = []
for (let i = 0; i < Math.min(NEW.length, OLD.length); i++) {
  // ⛔ Strip BOTH tip arrays before hashing the shape: `c` is a NEW field and it
  // lands on blunt tips too (they come from the same deadEndTips map), so a
  // naive hash reports a geometry change where only a field was added.
  const a = { ...NEW[i] }, b = { ...OLD[i] }
  delete a.roundTips; delete b.roundTips; delete a.bluntTips; delete b.bluntTips
  const asym = asymOf(NEW[i], OLD[i])
  const dHW = Math.max(0, ...(NEW[i].roundTips || []).map(r => { const o = (OLD[i].roundTips || []).find(x => tipK(x) === tipK(r)); return o ? Math.abs(r.hw - o.hw) : 0 }))
  // ── the SHAPE artifact (iA, ring, fillets…) ──
  if (h(a) === h(b)) shapeSame++
  else { shapeDiff.push(i); if (!asym.length) unexpected.push([i, 'SHAPE changed on a tile with no radius change']) }
  // ── the BAND, which is what sectionPassTile builds from roundTips ──
  const band = (t) => { try { const o = sectionPassTile(t, CW, { outer: 'LU', inner: 'SW' }, BC); return h([o.Wacc, o.tlByLu, o.luByLu]) } catch (e) { return 'THREW:' + e.message } }
  const bs = band(NEW[i]) === band(OLD[i])
  // ⚠️ A radius change SMALLER than the curb cannot be expected to move the
  // band's outline — the cap's claim is interior to the legs' own there. Only a
  // change larger than the scene's own curbWidth is evidence the paint should
  // have moved. ⛔ Scene-derived, never a map constant.
  if (bs) { bandSame++; if (asym.length && dHW > CW) unexpected.push([i, `radius moved ${dHW.toFixed(3)} m (> curbWidth ${CW}) on ${asym.join(', ')} but the BAND did not — the fix did not reach the paint`])
            else if (asym.length) info.push([i, `radius moved ${dHW.toFixed(3)} m (≤ curbWidth) on ${asym.join(', ')}; band unchanged, as expected at that scale`]) }
  else { bandDiff.push(i); if (!asym.length) unexpected.push([i, 'BAND changed on a tile with no radius change']) }
}
console.log(`\nSHAPE artifact (iA / ring / fillets):`)
console.log(`   identical ${shapeSame}   changed ${shapeDiff.length}  ${shapeDiff.length ? '(' + shapeDiff.join(', ') + ')' : ''}`)
console.log(`BAND (sectionPassTile — where roundTips.hw/c are consumed):`)
console.log(`   identical ${bandSame}   changed ${bandDiff.length}  ${bandDiff.length ? '(' + bandDiff.join(', ') + ')' : ''}`)
for (const x of info) console.log(`   ℹ️  tile ${x[0]}: ${x[1]}`)
console.log(`\n${unexpected.length ? '⛔' : '✅'} UNEXPECTED: ${unexpected.length}`)
for (const u of unexpected) console.log(`   tile ${u[0]}: ${u[1]}`)
// field-level diff for anything unexpected
for (const [i] of unexpected) {
  const a = NEW[i], b = OLD[i]
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])]
  const changed = keys.filter(k => h(a[k]) !== h(b[k]))
  console.log(`   tile ${i} fields differing: ${changed.join(', ') || '(none)'}`)
  for (const k of changed) {
    if (k === 'roundTips') { console.log(`      roundTips: ${JSON.stringify(a[k])}\n              vs ${JSON.stringify(b[k])}`); continue }
    const av = JSON.stringify(a[k]), bv = JSON.stringify(b[k])
    console.log(`      ${k}: ${av.length} vs ${bv.length} bytes${av.length === bv.length ? ' (same size — values moved)' : ''}`)
  }
}
process.exit(unexpected.length ? 1 : 0)
