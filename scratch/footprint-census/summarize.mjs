// Summarise census.mjs outputs: node scratch/footprint-census/summarize.mjs [towns…]
import { readFileSync } from 'node:fs'
const towns = process.argv.slice(2).length ? process.argv.slice(2) : ['lafayette-square', 'hipointedemun', 'provincetown', 'huron', 'jacksonheights']
const CL = ['asphalt', 'highway', 'curb', 'sidewalk', 'treelawn', 'alley', 'path']
const BINS = [[0, 0.5], [0.5, 1], [1, 2], [2, 3], [3, 5], [5, Infinity]]
const MIN = 0.01 // m² — an overlap below this is not counted (numeric sliver)
const out = []
for (const t of towns) {
  const { meta, results } = JSON.parse(readFileSync(new URL(`./${t}.json`, import.meta.url)))
  out.push(`\n## ${t}\n`)
  out.push(`ground: \`${meta.ground.file}\` v${meta.ground.version} groundKey ${meta.ground.groundKey} (${meta.ground.mtime}), ${meta.ground.groups} groups; partition area ${meta.partitionAreaM2} m² vs disc ${meta.stencil?.discArea} m²`)
  out.push(`buildings: \`${meta.buildings.file}\` v${meta.buildings.version} (${meta.buildings.mtime}), ${meta.buildings.count} footprints\n`)
  const srcs = [...new Set(results.map(r => r.src))]
  out.push(`| source | n | ` + CL.map(c => `n ${c}`).join(' | ') + ' | ' + CL.map(c => `m² ${c}`).join(' | ') + ' |')
  out.push('|' + '---|'.repeat(2 + CL.length * 2))
  for (const s of [...srcs, 'ALL']) {
    const R = results.filter(r => s === 'ALL' || r.src === s)
    out.push(`| ${s} | ${R.length} | ` + CL.map(c => R.filter(r => r.area[c] > MIN).length).join(' | ') + ' | ' + CL.map(c => R.reduce((a, r) => a + r.area[c], 0).toFixed(0)).join(' | ') + ' |')
  }
  out.push(`\nIntrusion depth past the property-line side (footprints with street-realm overlap > ${MIN} m²; depth = max distance of a footprint sample in asphalt/highway/curb/sidewalk/treelawn to the nearest non-street ground):\n`)
  out.push('| source | n intruding | ' + BINS.map(([a, b]) => `${a}–${b === Infinity ? '' : b}`).join(' | ') + ' | deepest: treelawn | sidewalk | curb | road |')
  out.push('|' + '---|'.repeat(2 + BINS.length + 4))
  for (const s of [...srcs, 'ALL']) {
    const R = results.filter(r => (s === 'ALL' || r.src === s) && r.sArea > MIN)
    const dv = r => typeof r.depth === 'number' ? r.depth : Infinity
    out.push(`| ${s} | ${R.length} | ` + BINS.map(([a, b]) => R.filter(r => dv(r) >= a && dv(r) < b).length).join(' | ') + ' | ' + ['treelawn', 'sidewalk', 'curb', 'road'].map(k => R.filter(r => r.deepestClass === k).length).join(' | ') + ' |')
  }
  const fpTot = results.reduce((a, r) => a + r.fpArea, 0), sTot = results.reduce((a, r) => a + r.sArea, 0)
  out.push(`\nfootprint area total ${fpTot.toFixed(0)} m²; in street realm ${sTot.toFixed(0)} m² (${(100 * sTot / fpTot).toFixed(2)}%). Samples outside any ground triangle: ${results.reduce((a, r) => a + r.uncoveredSamples, 0)}`)
  {
    const dn = d => typeof d === 'number' ? d : Infinity
    out.push(`\nAssessor-parcel test (${(meta.parcelFiles || []).join(', ')}; ${meta.parcelRings} rings in the building bbox): of the footprint samples lying in the painted street realm, how many fall INSIDE a parcel (band painted over parcel land) vs OUTSIDE every parcel (footprint past the parcel line, or a parcel gap); "beyond" = the deepest such outside sample's distance to the nearest parcel edge.\n`)
    out.push('| source | n intruding | street samples in parcel | outside | footprints w/ any outside | beyond 0–0.5 | 0.5–1 | 1–2 | 2–3 | 3–5 | 5– |')
    out.push('|---|---|---|---|---|---|---|---|---|---|---|')
    for (const s of [...srcs, 'ALL']) {
      const R = results.filter(r => (s === 'ALL' || r.src === s) && r.sArea > MIN)
      const si = R.reduce((a, r) => a + r.streetSamplesInParcel, 0), so = R.reduce((a, r) => a + r.streetSamplesOutsideParcel, 0)
      const O = R.filter(r => r.streetSamplesOutsideParcel > 0)
      out.push(`| ${s} | ${R.length} | ${si} (${(100 * si / Math.max(1, si + so)).toFixed(1)}%) | ${so} | ${O.length} | ` + BINS.map(([a, b]) => O.filter(r => dn(r.beyondParcel) >= a && dn(r.beyondParcel) < b).length).join(' | ') + ' |')
    }
  }
  const withTw = results.filter(r => r.src === 'msbf' && r.twins?.length)
  if (withTw.length) {
    const dn = d => typeof d === 'number' ? d : Infinity
    out.push(`\nMSBF footprints vs their OSM twins (same building, hand-traced; clean/map.json joinRings), same painted ground. ${withTw.length} of ${results.filter(r => r.src === 'msbf').length} MSBF footprints have ≥1 twin.\n`)
    out.push('| MSBF depth bin | n MSBF intruding w/ twin | twin also intrudes | twin depth median | twin depth ≤ MSBF−1 m | MSBF intruding, no twin |')
    out.push('|---|---|---|---|---|---|')
    for (const [a, b] of BINS) {
      const R = withTw.filter(r => r.sArea > MIN && dn(r.depth) >= a && dn(r.depth) < b)
      const td = R.map(r => Math.max(...r.twins.map(t => t.sArea > MIN ? dn(t.depth) : 0))).sort((x, y) => x - y)
      const noTw = results.filter(r => r.src === 'msbf' && !r.twins?.length && r.sArea > MIN && dn(r.depth) >= a && dn(r.depth) < b).length
      out.push(`| ${a}–${b === Infinity ? '' : b} | ${R.length} | ${R.filter(r => r.twins.some(t => t.sArea > MIN)).length} | ${td.length ? td[td.length >> 1].toFixed(2) : ''} | ${R.filter((r, i) => Math.max(...r.twins.map(t => t.sArea > MIN ? dn(t.depth) : 0)) <= dn(r.depth) - 1).length} | ${noTw} |`)
    }
    const msA = withTw.reduce((a, r) => a + r.sArea, 0), twA = withTw.reduce((a, r) => a + r.twins.reduce((x, t) => x + t.sArea, 0), 0)
    out.push(`\nstreet-realm m² over the twinned set: MSBF ${msA.toFixed(0)} vs OSM twins ${twA.toFixed(0)} (footprint m²: MSBF ${withTw.reduce((a, r) => a + r.fpArea, 0).toFixed(0)} vs twins ${withTw.reduce((a, r) => a + r.twins.reduce((x, t) => x + t.fpArea, 0), 0).toFixed(0)})`)
  }
  const W = results.filter(r => r.sArea > MIN).sort((a, b) => (typeof b.depth === 'number' ? b.depth : 1e9) - (typeof a.depth === 'number' ? a.depth : 1e9)).slice(0, 10)
  out.push('\nWorst 10 by depth:\n')
  out.push('| id | src | address | depth m | class at max | at (x,z) | m² asph/hwy/curb/walk/lawn | fp m² | street samples in parcel % | beyond parcel m | OSM twin depth m |')
  out.push('|---|---|---|---|---|---|---|---|---|---|---|')
  for (const r of W) out.push(`| ${r.id} | ${r.src} | ${r.address ?? ''} | ${r.depth} | ${r.depthCls} | ${r.depthAt?.join(', ')} | ${['asphalt', 'highway', 'curb', 'sidewalk', 'treelawn'].map(c => r.area[c].toFixed(1)).join('/')} | ${r.fpArea} | ${(100 * r.streetSamplesInParcel / Math.max(1, r.streetSamplesInParcel + r.streetSamplesOutsideParcel)).toFixed(0)} | ${r.streetSamplesOutsideParcel ? r.beyondParcel : ''} | ${r.twins ? r.twins.map(t => t.sArea > MIN ? t.depth : 0).join('/') : ''} |`)
}
console.log(out.join('\n'))
