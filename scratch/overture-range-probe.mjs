// Probe: can hyparquet pull ONE TOWN out of Overture places without pulling the world?
import { asyncBufferFromUrl, parquetMetadataAsync, parquetReadObjects, byteLengthFromUrl } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'

const BBOX = { minLon: -82.62165, minLat: 41.35042, maxLon: -82.50322, maxLat: 41.43952 } // huron

const catalog = await (await fetch('https://stac.overturemaps.org/catalog.json')).json()
const rel = catalog.links.find(l => l.rel === 'child' && /Latest/.test(l.title || ''))
const relCat = await (await fetch(rel.href)).json()
const placesCat = await (await fetch(relCat.links.find(l => l.rel === 'child' && l.title === 'places').href)).json()
const coll = await (await fetch(placesCat.links.find(l => l.rel === 'child').href)).json()
const items = coll.links.filter(l => l.rel === 'item')
console.log(`release ${rel.href.split('/')[3]} · ${items.length} parquet files in the places collection`)

// which files' bboxes intersect the town?
let hits = []
for (const l of items) {
  const it = await (await fetch(l.href)).json()
  const [x0, y0, x1, y1] = it.bbox
  if (x1 >= BBOX.minLon && x0 <= BBOX.maxLon && y1 >= BBOX.minLat && y0 <= BBOX.maxLat)
    hits.push({ id: it.id, href: it.assets.aws.href, rows: it.properties.num_rows, groups: it.properties.num_row_groups })
}
console.log(`STAC file-level prune: ${hits.length}/${items.length} files intersect huron`)

let bytes = 0, reqs = 0
const count = (buf) => ({
  byteLength: buf.byteLength,
  async slice(s, e) { reqs++; const b = await buf.slice(s, e); bytes += b.byteLength; return b },
})

let all = []
for (const h of hits) {
  const size = await byteLengthFromUrl(h.href)
  const buf = count(await asyncBufferFromUrl({ url: h.href, byteLength: size }))
  const meta = await parquetMetadataAsync(buf)
  const names = meta.schema.map(s => s.name)
  const ix = { xmin: names.indexOf('xmin'), xmax: names.indexOf('xmax'), ymin: names.indexOf('ymin'), ymax: names.indexOf('ymax') }
  // row-group prune on the bbox struct's own statistics
  let start = 0, picked = []
  for (const rg of meta.row_groups) {
    const n = Number(rg.num_rows)
    const col = (leaf) => rg.columns.find(c => (c.meta_data?.path_in_schema || []).join('.') === `bbox.${leaf}`)?.meta_data?.statistics
    const sx = col('xmin'), sy = col('ymin'), sxM = col('xmax'), syM = col('ymax')
    if (sx && sy && sxM && syM) {
      const ok = Number(sxM.max) >= BBOX.minLon && Number(sx.min) <= BBOX.maxLon &&
                 Number(syM.max) >= BBOX.minLat && Number(sy.min) <= BBOX.maxLat
      if (ok) picked.push([start, start + n])
    } else picked.push([start, start + n])
    start += n
  }
  console.log(`  ${h.id}: ${(size/1e6).toFixed(0)} MB · ${h.groups} row groups → ${picked.length} intersect`)
  for (const [rowStart, rowEnd] of picked) {
    const rows = await parquetReadObjects({ file: buf, compressors, rowStart, rowEnd,
      columns: ['id', 'names', 'categories', 'confidence', 'addresses', 'websites', 'phones', 'sources', 'bbox', 'operating_status'] })
    for (const r of rows) {
      const b = r.bbox
      if (b.xmax >= BBOX.minLon && b.xmin <= BBOX.maxLon && b.ymax >= BBOX.minLat && b.ymin <= BBOX.maxLat) all.push(r)
    }
  }
}
const totalSize = (await Promise.all(hits.map(h => byteLengthFromUrl(h.href)))).reduce((a, b) => a + b, 0)
console.log(`\nRESULT  ${all.length} places`)
console.log(`BYTES   ${(bytes/1e6).toFixed(1)} MB fetched in ${reqs} range requests`)
console.log(`WORLD   ${(totalSize/1e6).toFixed(0)} MB if we had downloaded the intersecting files whole`)
console.log(`RATIO   ${(bytes/totalSize*100).toFixed(2)}% of the candidate files`)
console.log('sample:', all.slice(0,3).map(r => r.names?.primary))
