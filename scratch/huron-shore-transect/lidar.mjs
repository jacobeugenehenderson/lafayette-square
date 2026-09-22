// Shared: UTM 17N (NAD83/GRS80) forward, and a windowed sampler over the four
// USGS 1 m tiles that cover huron — read over HTTP range requests, nothing on disk.
import { fromUrl } from 'geotiff'

const a = 6378137.0, f = 1 / 298.257222101, e2 = f * (2 - f)
const k0 = 0.9996, FE = 500000, FN = 0
const LON0 = -81 * Math.PI / 180   // zone 17 central meridian

export function utm17(lon, lat) {
  const p = lat * Math.PI / 180, l = lon * Math.PI / 180
  const ep2 = e2 / (1 - e2)
  const N = a / Math.sqrt(1 - e2 * Math.sin(p) ** 2)
  const T = Math.tan(p) ** 2
  const C = ep2 * Math.cos(p) ** 2
  const A = (l - LON0) * Math.cos(p)
  const M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * p
    - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * p)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * p)
    - (35 * e2 ** 3 / 3072) * Math.sin(6 * p))
  const E = FE + k0 * N * (A + (1 - T + C) * A ** 3 / 6
    + (5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5 / 120)
  const Nn = FN + k0 * (M + N * Math.tan(p) * (A ** 2 / 2
    + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24
    + (61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6 / 720))
  return [E, Nn]
}

const BASE = 'https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1m/Projects/OH_Statewide_Phase1_2019_B19/TIFF/USGS_1M_17_'
const SUF = '_OH_Statewide_Phase1_2019_B19.tif'
const TILES = ['x36y458', 'x36y459', 'x37y458', 'x37y459']

const open = {}
async function tile(name) {
  if (!open[name]) {
    open[name] = (async () => {
      const img = await (await fromUrl(BASE + name + SUF)).getImage()
      const [ox, oy] = img.getOrigin()
      const [rx, ry] = img.getResolution()
      return { img, ox, oy, rx, ry, w: img.getWidth(), h: img.getHeight() }
    })()
  }
  return open[name]
}
function tileFor(E, N) {
  const tx = Math.floor(E / 10000), ty = Math.ceil(N / 10000)
  const name = `x${tx}y${ty}`
  return TILES.includes(name) ? name : null
}

// Read one rectangular patch of ground, in UTM metres, at 1 m. Returns
// { get(E,N) } — nearest-sample lookup, NaN outside coverage.
export async function patch(minE, minN, maxE, maxN) {
  const pads = 2
  const e0 = Math.floor(minE) - pads, e1 = Math.ceil(maxE) + pads
  const n0 = Math.floor(minN) - pads, n1 = Math.ceil(maxN) + pads
  const parts = []
  const names = new Set()
  for (let E = e0; E <= e1; E += 5000) for (let N = n0; N <= n1; N += 5000) {
    const t = tileFor(E, N); if (t) names.add(t)
  }
  for (const t of tileFor(e1, n1) ? [tileFor(e1, n1)] : []) names.add(t)
  for (const name of names) {
    const T = await tile(name)
    const px0 = Math.max(0, Math.floor((e0 - T.ox) / T.rx))
    const px1 = Math.min(T.w, Math.ceil((e1 - T.ox) / T.rx))
    const py0 = Math.max(0, Math.floor((n1 - T.oy) / T.ry))
    const py1 = Math.min(T.h, Math.ceil((n0 - T.oy) / T.ry))
    if (px1 <= px0 || py1 <= py0) continue
    const r = await T.img.readRasters({ window: [px0, py0, px1, py1] })
    parts.push({ T, px0, py0, px1, py1, data: r[0], w: px1 - px0 })
  }
  return {
    get(E, N) {
      for (const p of parts) {
        const px = Math.round((E - p.T.ox) / p.T.rx - 0.5)
        const py = Math.round((N - p.T.oy) / p.T.ry - 0.5)
        if (px < p.px0 || px >= p.px1 || py < p.py0 || py >= p.py1) continue
        const v = p.data[(py - p.py0) * p.w + (px - p.px0)]
        if (v < -1000) return NaN
        return v
      }
      return NaN
    },
    tiles: [...names],
  }
}
