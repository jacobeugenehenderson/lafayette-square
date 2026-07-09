// Fetch the San Gabriel Mountain front behind Altadena as a real DEM.
// Source: AWS Terrain Tiles (terrarium PNG, public, keyless) — USGS 3DEP under
// the hood in the US at these zooms. Decodes RGB→meters, stitches, crops to the
// bbox, writes a full-res height grid + meta + a decimated OBJ mesh (real meters,
// Y-up) + a normalized grayscale heightmap PNG.
import { PNG } from 'pngjs'
import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

// ── The Altadena hero backdrop: the front range from the Arroyo (W, ~JPL) past
// Eaton Canyon (E), from Altadena's north edge up over the crest (Mt Lowe / San
// Gabriel Peak / Mt Wilson). ───────────────────────────────────────────────
const BBOX = { minLon: -118.20, maxLon: -118.05, minLat: 34.18, maxLat: 34.30 }
const ZOOM = 14
const OUT = join(process.cwd(), 'cartograph', 'data', 'altadena', 'terrain')
const OBJ_TARGET_W = 640   // decimate the mesh to ~this many columns (viewable)

const TILE = 256
const N = 2 ** ZOOM
const lon2xf = (lon) => (lon + 180) / 360 * N
const lat2yf = (lat) => {
  const r = lat * Math.PI / 180
  return (1 - Math.asinh(Math.tan(r)) / Math.PI) / 2 * N
}
// Ground resolution (m/px) at a latitude for this zoom.
const mppAt = (lat) => (2 * Math.PI * 6378137 * Math.cos(lat * Math.PI / 180)) / (N * TILE)

const x0f = lon2xf(BBOX.minLon), x1f = lon2xf(BBOX.maxLon)
const y0f = lat2yf(BBOX.maxLat), y1f = lat2yf(BBOX.minLat) // note: y grows southward
const tx0 = Math.floor(x0f), tx1 = Math.floor(x1f)
const ty0 = Math.floor(y0f), ty1 = Math.floor(y1f)
const nTx = tx1 - tx0 + 1, nTy = ty1 - ty0 + 1
console.log(`z${ZOOM}: tiles x ${tx0}..${tx1} (${nTx}), y ${ty0}..${ty1} (${nTy}) = ${nTx * nTy} tiles`)

const stitchW = nTx * TILE, stitchH = nTy * TILE
const heights = new Float32Array(stitchW * stitchH)

async function getTile(tx, ty, tries = 4) {
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ZOOM}/${tx}/${ty}.png`
  for (let t = 0; t < tries; t++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      return PNG.sync.read(buf)
    } catch (e) {
      if (t === tries - 1) throw new Error(`tile ${tx}/${ty}: ${e.message}`)
      await new Promise(r => setTimeout(r, 400 * (t + 1)))
    }
  }
}

// Download with a small concurrency pool.
const jobs = []
for (let j = 0; j < nTy; j++) for (let i = 0; i < nTx; i++) jobs.push([i, j])
let done = 0
const POOL = 8
async function worker() {
  while (jobs.length) {
    const [i, j] = jobs.pop()
    const png = await getTile(tx0 + i, ty0 + j)
    for (let py = 0; py < TILE; py++) {
      for (let px = 0; px < TILE; px++) {
        const k = (py * TILE + px) * 4
        const R = png.data[k], G = png.data[k + 1], B = png.data[k + 2]
        const h = (R * 256 + G + B / 256) - 32768
        const gx = i * TILE + px, gy = j * TILE + py
        heights[gy * stitchW + gx] = h
      }
    }
    if (++done % 8 === 0 || done === nTx * nTy) console.log(`  decoded ${done}/${nTx * nTy}`)
  }
}
await Promise.all(Array.from({ length: POOL }, worker))

// Crop the stitched grid to the exact bbox pixel window.
const cx0 = Math.round((x0f - tx0) * TILE), cx1 = Math.round((x1f - tx0) * TILE)
const cy0 = Math.round((y0f - ty0) * TILE), cy1 = Math.round((y1f - ty0) * TILE)
const W = cx1 - cx0, H = cy1 - cy0
const grid = new Float32Array(W * H)
let minE = Infinity, maxE = -Infinity, maxIx = 0
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const h = heights[(cy0 + y) * stitchW + (cx0 + x)]
    grid[y * W + x] = h
    if (h < minE) minE = h
    if (h > maxE) { maxE = h; maxIx = y * W + x }
  }
}
const centerLat = (BBOX.minLat + BBOX.maxLat) / 2
const mpp = mppAt(centerLat)
const peakLon = BBOX.minLon + ((maxIx % W) / W) * (BBOX.maxLon - BBOX.minLon)
const peakLat = BBOX.maxLat - (Math.floor(maxIx / W) / H) * (BBOX.maxLat - BBOX.minLat)

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'heights.f32'), Buffer.from(grid.buffer))
const meta = {
  source: 'AWS Terrain Tiles (terrarium) — USGS 3DEP where available',
  bbox: BBOX, zoom: ZOOM, width: W, height: H,
  metersPerPixel: +mpp.toFixed(3),
  widthMeters: +(W * mpp).toFixed(1), heightMeters: +(H * mpp).toFixed(1),
  minElevM: +minE.toFixed(1), maxElevM: +maxE.toFixed(1),
  peak: { lon: +peakLon.toFixed(5), lat: +peakLat.toFixed(5), elevM: +maxE.toFixed(1) },
  centerLatLon: [centerLat, (BBOX.minLon + BBOX.maxLon) / 2],
  encoding: 'heights.f32 = Float32 row-major, north→south rows, west→east cols, meters ASL',
}
writeFileSync(join(OUT, 'meta.json'), JSON.stringify(meta, null, 2))

// Normalized grayscale heightmap PNG (for a displacement map / quick look).
const g8 = Buffer.alloc(W * H)
for (let i = 0; i < W * H; i++) g8[i] = Math.round(((grid[i] - minE) / (maxE - minE)) * 255)
await sharp(g8, { raw: { width: W, height: H, channels: 1 } }).png().toFile(join(OUT, 'heightmap.png'))

// Decimated OBJ mesh — real meters, Y-up, centered on the grid.
const stride = Math.max(1, Math.round(W / OBJ_TARGET_W))
const mw = Math.floor((W - 1) / stride) + 1, mh = Math.floor((H - 1) / stride) + 1
const cxm = (W / 2) * mpp, czm = (H / 2) * mpp
const verts = [], faces = []
for (let y = 0; y < H; y += stride) {
  for (let x = 0; x < W; x += stride) {
    verts.push(`v ${(x * mpp - cxm).toFixed(2)} ${grid[y * W + x].toFixed(2)} ${(y * mpp - czm).toFixed(2)}`)
  }
}
const vi = (r, c) => r * mw + c + 1
for (let r = 0; r < mh - 1; r++) {
  for (let c = 0; c < mw - 1; c++) {
    faces.push(`f ${vi(r, c)} ${vi(r + 1, c)} ${vi(r + 1, c + 1)}`)
    faces.push(`f ${vi(r, c)} ${vi(r + 1, c + 1)} ${vi(r, c + 1)}`)
  }
}
writeFileSync(join(OUT, 'sangabriel.obj'),
  `# San Gabriel front behind Altadena — DEM mesh, meters, Y-up\n# ${mw}x${mh} verts, mpp ${mpp.toFixed(2)}, elev ${minE.toFixed(0)}..${maxE.toFixed(0)}m\n` +
  verts.join('\n') + '\n' + faces.join('\n') + '\n')

console.log(`\n✓ wrote ${OUT}`)
console.log(`  grid ${W}x${H} @ ${mpp.toFixed(2)} m/px  (${(W*mpp/1000).toFixed(1)} x ${(H*mpp/1000).toFixed(1)} km)`)
console.log(`  elevation ${minE.toFixed(0)}..${maxE.toFixed(0)} m ASL  (relief ${(maxE-minE).toFixed(0)} m)`)
console.log(`  peak ~ ${peakLat.toFixed(4)}, ${peakLon.toFixed(4)} @ ${maxE.toFixed(0)} m`)
console.log(`  mesh ${mw}x${mh} = ${mw*mh} verts (stride ${stride})`)
