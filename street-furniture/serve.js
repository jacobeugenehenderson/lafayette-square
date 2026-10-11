#!/usr/bin/env node
// @scene-independent: THE STREET FURNITURE DEV SERVER (BRIEF-street-furniture). The catalog is the kit's,
//   not a town's, so it boots without a scene. Port 5555 (Jacob, 2026-10-11).
//
//   npm run dev:street-furniture        → http://localhost:5173/street-furniture (via the vite proxy)
//
//   GET  /catalog                    every pack's out/<pack>/catalog.json (measured) + tags.json (authored)
//                                    + each asset's status, and every town's census (what the cost is counted by)
//   GET  /glb/<pack>/<id>/<lod>      out/<pack>/<id>.<lod>.glb
//   GET  /icon/<pack>/<id>           out/<pack>/icons/<id>.png
//   POST /tags/<pack>/<id>           replace one asset's authored record in tags.json (refused if malformed)
//
// ⛔ Nothing here is served to a town. out/ is gitignored (licence ruling); tags.json is committed.
import { createServer } from 'http'
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { assetStatus, assetKey, MOUNTS, ROLES, CENSUS } from '../src/street-furniture/contract.js'

const PORT = 5555
const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const OUT = join(HERE, 'out')
const TAGS = join(HERE, 'tags.json')
const PACK = /^[a-z0-9-]+$/
const ID = /^[a-z_]+_\d+$/
const LOD = /^(lod0|r0\.5|r0\.25)$/

const readJson = p => JSON.parse(readFileSync(p, 'utf8'))
const readTags = () => existsSync(TAGS) ? readJson(TAGS) : {}
function readCatalog() {
  const packs = existsSync(OUT) ? readdirSync(OUT).filter(d => PACK.test(d) && existsSync(join(OUT, d, 'catalog.json'))) : []
  if (!packs.length) throw new Error('no pack in street-furniture/out/ — run: node street-furniture/ingest.mjs <pack-dir> --pack=<id>')
  return packs.flatMap(p => readJson(join(OUT, p, 'catalog.json')).assets)
}

// ── The census per town: what a family's cost is multiplied by. Read from each town's own files; a census
// that can't be read is reported with its reason, never as 0. Cached by the files' mtimes.
const cache = new Map()
function cached(paths, fn) {
  const key = paths.map(p => existsSync(p) ? `${p}@${statSync(p).mtimeMs}` : `${p}@-`).join('|')
  if (!cache.has(key)) cache.set(key, fn())
  return cache.get(key)
}
function townCensus(look, scene) {
  const data = join(ROOT, 'cartograph/data', scene)
  const lampsP = join(ROOT, 'public/baked', look, 'lamps.json')
  const osmP = join(data, 'raw/osm.json'), skelP = join(data, 'clean/skeleton.json'), nbP = join(data, 'neighborhood_boundary.json')
  return cached([lampsP, osmP, skelP, nbP], () => {
    const out = {}
    out.lamps = existsSync(lampsP) ? { n: readJson(lampsP).count } : { why: 'no baked lamps.json' }
    const nb = existsSync(nbP) ? readJson(nbP) : null
    const inside = (x, z) => Math.hypot(x - nb.center[0], z - nb.center[1]) <= nb.radius
    if (!nb) for (const k of ['signals', 'junctions', 'benches', 'bins', 'bus-stops']) out[k] = { why: 'no neighborhood_boundary.json' }
    else {
      const pois = existsSync(osmP) ? readJson(osmP).pois : undefined
      const poiCount = test => pois.filter(p => test(p.tags || {}) && inside(p.coords[0].x, p.coords[0].z)).length
      const noPois = { why: "osm.json carries no pois (fetched before node tags were kept: ROADMAP A09)" }
      out.signals = pois ? { n: poiCount(t => t.highway === 'traffic_signals') } : noPois
      out.benches = pois ? { n: poiCount(t => t.amenity === 'bench') } : noPois
      out.bins = pois ? { n: poiCount(t => t.amenity === 'waste_basket') } : noPois
      out['bus-stops'] = pois ? { n: poiCount(t => t.highway === 'bus_stop') } : noPois
      out.junctions = existsSync(skelP) ? { n: readJson(skelP).junctions.filter(j => j.degree >= 3 && inside(j.x, j.z)).length } : { why: 'no skeleton.json' }
    }
    for (const k of Object.keys(CENSUS)) if (!out[k]) throw new Error(`census ${k} not computed for ${look}`)
    return out
  })
}
// Every town that has a look with a scene (public/looks/index.json), ⛔ no list of town names here.
function towns() {
  return readJson(join(ROOT, 'public/looks/index.json')).looks
    .filter(l => l.scene && existsSync(join(ROOT, 'cartograph/data', l.scene)))
    .map(l => ({ look: l.id, name: l.name, census: townCensus(l.id, l.scene) }))
}

// Shape only; whether the record is COMPLETE is contract.js#assetStatus's job, reported, not refused.
function malformed(t) {
  if (typeof t !== 'object' || !t) return 'not an object'
  if (t.mount != null && !MOUNTS.includes(t.mount)) return `mount ${t.mount}`
  if (t.forward != null && !Number.isFinite(t.forward)) return 'forward is not a number'
  if (t.lod != null && !LOD.test(t.lod)) return `lod ${t.lod}`
  if (t.excluded != null && (typeof t.excluded !== 'string' || !t.excluded.trim())) return 'excluded needs a reason'
  for (const [k, r] of Object.entries(t.pieces || {})) if (!/^SG\d*#\d+$/.test(k) || !(r in ROLES)) return `piece ${k}: ${r}`
  const extra = Object.keys(t).filter(k => !['mount', 'forward', 'lod', 'pieces', 'excluded'].includes(k))
  return extra.length ? `unknown fields ${extra.join(', ')}` : null
}

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' })
  res.end(type === 'application/json' ? JSON.stringify(body) : body)
}
const file = (res, f, type) => existsSync(f) ? send(res, 200, readFileSync(f), type) : send(res, 404, { error: `not found: ${f.slice(HERE.length + 1)}` })

createServer((req, res) => {
  try {
    const [route, pack, id, lod] = (req.url || '').split('?')[0].split('/').filter(Boolean)
    const asset = PACK.test(pack ?? '') && ID.test(id ?? '')
    if (req.method === 'GET' && route === 'catalog') {
      const tags = readTags()
      return send(res, 200, { towns: towns(), assets: readCatalog().map(a => ({ ...a, tags: tags[assetKey(a)] ?? null, status: assetStatus(a, tags) })) })
    }
    if (req.method === 'GET' && route === 'glb' && asset && LOD.test(lod ?? '')) return file(res, join(OUT, pack, `${id}.${lod}.glb`), 'model/gltf-binary')
    if (req.method === 'GET' && route === 'icon' && asset) return file(res, join(OUT, pack, 'icons', `${id}.png`), 'image/png')
    if (req.method === 'POST' && route === 'tags' && asset) {
      let body = ''
      req.on('data', c => { body += c })
      req.on('end', () => {
        try {
          const t = JSON.parse(body)
          const bad = malformed(t)
          if (bad) return send(res, 400, { error: bad })
          const a = readCatalog().find(x => x.pack === pack && x.id === id)
          if (!a) return send(res, 404, { error: `no asset ${pack}/${id}` })
          const tags = readTags()
          tags[assetKey(a)] = t
          const sorted = Object.fromEntries(Object.entries(tags).sort(([x], [y]) => x.localeCompare(y, 'en', { numeric: true })))
          writeFileSync(TAGS, JSON.stringify(sorted, null, 1) + '\n')
          send(res, 200, { status: assetStatus(a, sorted) })
        } catch (e) { send(res, 400, { error: e.message }) }
      })
      return
    }
    send(res, 404, { error: `no route ${req.method} ${req.url}` })
  } catch (e) { send(res, 500, { error: e.message }) }
}).listen(PORT, () => console.log(`street-furniture server on :${PORT}`))
