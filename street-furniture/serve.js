#!/usr/bin/env node
// @scene-independent: THE STREET FURNITURE DEV SERVER (BRIEF-street-furniture). The catalog is the kit's,
//   not a town's, so it boots without a scene. Port 5555 (Jacob, 2026-10-11).
//
//   npm run dev:street-furniture        → http://localhost:5173/street-furniture (via the vite proxy)
//
//   GET  /catalog            catalog.json (measured, from ingest.mjs) + tags.json (authored) + each asset's status
//   GET  /glb/<id>/<lod>     out/<id>.<lod>.glb
//   GET  /icon/<id>          out/icons/<id>.png
//   POST /tags/<id>          replace one asset's authored record in tags.json (refused if malformed)
//
// ⛔ Nothing here is served to a town. out/ is gitignored (licence ruling); tags.json is committed.
import { createServer } from 'http'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { assetStatus, MOUNTS, ROLES } from '../src/street-furniture/contract.js'

const PORT = 5555
const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'out')
const TAGS = join(HERE, 'tags.json')
const ID = /^[a-z_]+_\d+$/
const LOD = /^(lod0|r0\.5|r0\.25)$/

const readTags = () => existsSync(TAGS) ? JSON.parse(readFileSync(TAGS, 'utf8')) : {}
function readCatalog() {
  const path = join(OUT, 'catalog.json')
  if (!existsSync(path)) throw new Error('no out/catalog.json — run: node street-furniture/ingest.mjs <pack-dir>')
  return JSON.parse(readFileSync(path, 'utf8'))
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

createServer((req, res) => {
  try {
    const parts = (req.url || '').split('?')[0].split('/').filter(Boolean)
    if (req.method === 'GET' && parts[0] === 'catalog') {
      const cat = readCatalog(), tags = readTags()
      return send(res, 200, { assets: cat.assets.map(a => ({ ...a, tags: tags[a.id] ?? null, status: assetStatus(a, tags) })) })
    }
    if (req.method === 'GET' && parts[0] === 'glb' && ID.test(parts[1]) && LOD.test(parts[2])) {
      const f = join(OUT, `${parts[1]}.${parts[2]}.glb`)
      return existsSync(f) ? send(res, 200, readFileSync(f), 'model/gltf-binary') : send(res, 404, { error: `no ${parts[1]}.${parts[2]}.glb` })
    }
    if (req.method === 'GET' && parts[0] === 'icon' && ID.test(parts[1])) {
      const f = join(OUT, 'icons', `${parts[1]}.png`)
      return existsSync(f) ? send(res, 200, readFileSync(f), 'image/png') : send(res, 404, { error: `no icon ${parts[1]}` })
    }
    if (req.method === 'POST' && parts[0] === 'tags' && ID.test(parts[1])) {
      let body = ''
      req.on('data', c => { body += c })
      req.on('end', () => {
        try {
          const t = JSON.parse(body)
          const bad = malformed(t)
          if (bad) return send(res, 400, { error: bad })
          const cat = readCatalog()
          const asset = cat.assets.find(a => a.id === parts[1])
          if (!asset) return send(res, 404, { error: `no asset ${parts[1]}` })
          const tags = readTags()
          tags[parts[1]] = t
          const sorted = Object.fromEntries(Object.entries(tags).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })))
          writeFileSync(TAGS, JSON.stringify(sorted, null, 1) + '\n')
          send(res, 200, { status: assetStatus(asset, sorted) })
        } catch (e) { send(res, 400, { error: e.message }) }
      })
      return
    }
    send(res, 404, { error: `no route ${req.method} ${req.url}` })
  } catch (e) { send(res, 500, { error: e.message }) }
}).listen(PORT, () => console.log(`street-furniture server on :${PORT}`))
