#!/usr/bin/env node
// T1 step 2 (Boz, 2026-10-19): weld raw/osm.json's highway ways back into OSM XML, no network. One node per exact lon/lat
// (weld-check.mjs measured that sound on every town: one lon/lat never projects two ways, and our own 1 cm weld folds no two
// distinct lon/lat together). A node a tagged POI sits on exactly takes the POI's real id and tags (crossings, signals, kerbs);
// every other node gets a synthetic id (SYN + index), recorded in out/<town>.nodes.json so the join can read it back.
// The clip is the town's Extent boundary (neighborhood_boundary.json, local x,z), unprojected through geography.json exactly.
// Light. Writes only scratch/osm2streets-trial/out/.   node scratch/osm2streets-trial/build-xml.mjs [town…]
import fs from 'fs'
const OUT = 'scratch/osm2streets-trial/out', SYN = 1e12
fs.mkdirSync(OUT, { recursive: true })
const towns = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync('cartograph/data').filter(t => fs.existsSync(`cartograph/data/${t}/raw/osm.json`))
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const tagXml = (tags) => Object.entries(tags || {}).map(([k, v]) => `<tag k="${esc(k)}" v="${esc(v)}"/>`).join('')
for (const town of towns) {
  const D = `cartograph/data/${town}`, o = JSON.parse(fs.readFileSync(`${D}/raw/osm.json`, 'utf8')), g = JSON.parse(fs.readFileSync(`${D}/geography.json`, 'utf8'))
  const B = JSON.parse(fs.readFileSync(`${D}/neighborhood_boundary.json`, 'utf8')).boundary
  if (!Array.isArray(B) || B.length < 3) { console.log(`⛔ ${town}: no Extent boundary — not built`); continue }
  // ⛔ NOT EVERY highway RECORD IS A WAY. A multipolygon RELATION (osmType 'relation') arrives as one record per ring, each carrying
  // the relation's id, so it is left out — named and counted, never merged into a way. A way recorded twice with byte-identical
  // geometry and tags is one way. A way recorded twice with DIFFERENT geometry or tags refuses the town by id.
  const all = o.ground?.highway || [], rel = all.filter(w => w.osmType === 'relation'), seen = new Map(), ways = []
  let twins = 0; const clash = []
  for (const w of all) { if (w.osmType === 'relation') continue
    const sig = JSON.stringify([w.coords.map(c => [c.lon, c.lat]), w.tags]), prev = seen.get(w.osmId)
    if (prev == null) { seen.set(w.osmId, sig); ways.push(w) } else if (prev === sig) twins++; else clash.push(w.osmId) }
  if (clash.length) { console.log(`⛔ ${town}: way id(s) recorded twice with different geometry or tags: ${[...new Set(clash)].join(', ')} — not built`); continue }
  const poiAt = new Map(); for (const p of o.pois || []) if (p.osmType === 'node' && p.coords?.length === 1) { const k = `${p.coords[0].lon},${p.coords[0].lat}`; if (!poiAt.has(k)) poiAt.set(k, p) }
  const nodes = new Map()             // lon,lat → { id, lon, lat, x, z, tags }
  let real = 0
  for (const w of ways) for (const c of w.coords || []) { const k = `${c.lon},${c.lat}`; if (nodes.has(k)) continue
    const p = poiAt.get(k); if (p) real++
    nodes.set(k, { id: p ? p.osmId : SYN + nodes.size, lon: c.lon, lat: c.lat, x: c.x, z: c.z, tags: p?.tags || null }) }
  const ids = new Set(); let dup = 0; for (const n of nodes.values()) { if (ids.has(n.id)) dup++; ids.add(n.id) }
  if (dup) { console.log(`⛔ ${town}: ${dup} node id(s) assigned twice — not built`); continue }
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<osm version="0.6" generator="lafayette-square T1 weld">']
  for (const n of nodes.values()) lines.push(n.tags ? `<node id="${n.id}" lat="${n.lat}" lon="${n.lon}">${tagXml(n.tags)}</node>` : `<node id="${n.id}" lat="${n.lat}" lon="${n.lon}"/>`)
  for (const w of ways) lines.push(`<way id="${w.osmId}">${(w.coords || []).map(c => `<nd ref="${nodes.get(`${c.lon},${c.lat}`).id}"/>`).join('')}${tagXml(w.tags)}</way>`)
  lines.push('</osm>')
  fs.writeFileSync(`${OUT}/${town}.osm`, lines.join('\n'))
  const ll = B.map(([x, z]) => [x / g.lonToMeters + g.lon, g.lat - z / g.latToMeters]); if (ll[0][0] !== ll.at(-1)[0] || ll[0][1] !== ll.at(-1)[1]) ll.push(ll[0])
  fs.writeFileSync(`${OUT}/${town}.clip.geojson`, JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ll] } }] }))
  fs.writeFileSync(`${OUT}/${town}.nodes.json`, JSON.stringify([...nodes.values()].map(n => [n.id, n.lon, n.lat, n.x, n.z])))
  console.log(`── ${town}: ${ways.length} ways (${twins} identical repeat record(s) folded · ${rel.length} relation record(s) left out${rel.length ? `: ${[...new Set(rel.map(r => `${r.osmId} ${r.tags?.name ?? ''}`.trim()))].join(', ')}` : ''}) · ${nodes.size} nodes (${real} with a POI's real id + tags) · clip ${B.length} pts · ${(fs.statSync(`${OUT}/${town}.osm`).size / 1e6).toFixed(1)} MB`)
}
