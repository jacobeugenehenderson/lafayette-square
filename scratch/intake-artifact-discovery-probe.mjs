#!/usr/bin/env node
/**
 * scratch/intake-artifact-discovery-probe.mjs — Tally, 2026-09-24. READ-ONLY. Phase 1 of
 * docs/briefs/BRIEF-intake-panel-acquired.md: prove "look for the ARTIFACT, not the source"
 * on towns nobody hand-gathered. Writes nothing but its own JSON report to stdout / --out.
 *
 * For each ARTIFACT (defined by geometry + fields, never by a named publisher) it asks every
 * discovery well that can be queried by place, and RECOGNISES a candidate by probing the
 * layer itself: geometry type · a field pattern · a non-zero feature count INSIDE the town.
 * ⛔ The count-in-envelope test is what makes the catalogue search usable at all: AGOL's bbox
 * filter matches by item EXTENT, and thousands of items carry world or national extents.
 *
 *   node scratch/intake-artifact-discovery-probe.mjs [--town=<key>] [--out=<file>]
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs'

const UA = 'cartograph-intake-probe/0.1 (read-only research; jacob@jacobhenderson.studio)'
const arg = (k) => { const h = process.argv.find(a => a.startsWith(`--${k}=`)); return h ? h.slice(k.length + 3) : null }

// ── The towns. Bboxes come from each scene's own raw/osm.json where one exists (the kit's
//    frame); Wellfleet has no scene, so its frame is the geocoder's village centre ± ~2.5 km.
const TOWNS = {
  'lafayette-square': { name: 'St. Louis', state: 'Missouri', place: ['St. Louis', 'Saint Louis'], scene: 'lafayette-square' },
  huron: { name: 'Huron', state: 'Ohio', place: ['Huron', 'Erie County'], scene: 'huron' },
  provincetown: { name: 'Provincetown', state: 'Massachusetts', place: ['Provincetown', 'Barnstable County', 'Cape Cod'], scene: 'provincetown' },
  wellfleet: { name: 'Wellfleet', state: 'Massachusetts', place: ['Wellfleet', 'Barnstable County', 'Cape Cod'],
               bbox: { minLat: 41.915, maxLat: 41.960, minLon: -70.065, maxLon: -70.000 } },
}
for (const t of Object.values(TOWNS)) {
  if (!t.bbox) t.bbox = JSON.parse(readFileSync(new URL(`../cartograph/data/${t.scene}/raw/osm.json`, import.meta.url), 'utf8')).bbox
}

// ── The ARTIFACTS. Defined by what the kit needs, in data terms. `fields` are the recogniser.
const ARTIFACTS = {
  'tree-inventory': {
    rows: ['census-city', 'census-forest-park'],
    geometry: ['esriGeometryPoint', 'esriGeometryMultipoint'],
    keywords: ['tree inventory', 'street trees', 'trees', 'urban forest'],
    must: /spec|common|genus|botan|scien|tree_?name|cname/i,
    bonus: /dbh|diam|trunk|circum/i,
  },
  'street-lights': {
    rows: ['lamps'],
    geometry: ['esriGeometryPoint'],
    keywords: ['streetlights', 'street lights', 'light poles', 'street lighting'],
    must: /light|lamp|lumin|pole|fixture|watt/i,
  },
  parcels: {
    rows: ['parcels'],
    geometry: ['esriGeometryPolygon'],
    keywords: ['parcels', 'tax parcels', 'property parcels'],
    must: /parcel|^pin$|map_?par|loc_?id|apn|parid|handle|prop_?id|luc|land_?use/i,
    bonus: /year|yr_?built|use|zoning|value|units/i,
  },
  'building-fabric': {
    rows: ['building-fabric', 'msbf'],
    geometry: ['esriGeometryPolygon'],
    keywords: ['building footprints', 'buildings', 'structures'],
    must: /height|stor(e)?y|stories|floors|levels|roof|elev/i,
  },
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
async function getJson(url, { tries = 2, timeout = 25000 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(timeout) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return await r.json()
    } catch (e) { if (i === tries - 1) return { __error: e.message }; await sleep(800) }
  }
}
const bboxStr = (b) => `${b.minLon},${b.minLat},${b.maxLon},${b.maxLat}`
const extentArea = (e) => e && e.length === 2 ? Math.abs((e[1][0] - e[0][0]) * (e[1][1] - e[0][1])) : Infinity

// ── WELL 1: OpenStreetMap, by tag. Global. Counts only (out count).
async function overpassCounts(b) {
  const bb = `${b.minLat},${b.minLon},${b.maxLat},${b.maxLon}`
  const q = `[out:json][timeout:120];
    node["natural"="tree"](${bb});out count;
    way["natural"="tree_row"](${bb});out count;
    node["highway"="street_lamp"](${bb});out count;
    way["building"](${bb});out count;
    way["building"]["building:levels"](${bb});out count;
    way["building"]["height"](${bb});out count;
    way["building"]["roof:shape"](${bb});out count;
    nwr["addr:housenumber"](${bb});out count;`
  const labels = ['natural=tree', 'natural=tree_row', 'highway=street_lamp', 'building', 'building+levels', 'building+height', 'building+roof:shape', 'addr:housenumber']
  for (const ep of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
    try {
      const r = await fetch(ep, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(q), signal: AbortSignal.timeout(150000) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      const out = {}
      j.elements.forEach((e, i) => { out[labels[i]] = +(e.tags?.total ?? e.tags?.nodes ?? e.tags?.ways ?? 0) })
      return { endpoint: ep, counts: out }
    } catch (e) { var err = e.message }
  }
  return { error: err }
}

// ── WELL 2: ArcGIS Online / Hub catalogue, bbox + keyword, then RECOGNISE each layer.
async function agolCandidates(b, art) {
  const seen = new Map()
  for (const kw of art.keywords) {
    const u = `https://www.arcgis.com/sharing/rest/search?f=json&num=100&bbox=${bboxStr(b)}` +
      `&q=${encodeURIComponent(`(${kw}) AND (type:"Feature Service" OR type:"Map Service")`)}`
    const j = await getJson(u)
    for (const it of j.results || []) if (it.url && !seen.has(it.id)) seen.set(it.id, it)
    await sleep(250)
  }
  // Tightest extent first: a county layer outranks a national one, a national one a world one.
  return [...seen.values()].sort((a, c) => extentArea(a.extent) - extentArea(c.extent))
}

async function recogniseService(it, b, art) {
  const base = it.url.replace(/\/+$/, '')
  const isLayer = /\/\d+$/.test(base)
  let layers
  if (isLayer) layers = [{ url: base }]
  else {
    const s = await getJson(`${base}?f=json`)
    if (s.__error) return [{ item: it.title, url: base, reject: `service: ${s.__error}` }]
    layers = (s.layers || []).map(l => ({ url: `${base}/${l.id}`, name: l.name })).slice(0, 12)
  }
  const out = []
  for (const L of layers) {
    const d = await getJson(`${L.url}?f=json`)
    if (d.__error || d.error) { out.push({ url: L.url, reject: 'layer unreadable' }); continue }
    if (!art.geometry.includes(d.geometryType)) continue
    const fields = (d.fields || []).map(f => f.name)
    const hit = fields.filter(f => art.must.test(f))
    if (!hit.length) continue
    const env = `geometry=${bboxStr(b)}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects`
    const c = await getJson(`${L.url}/query?where=1%3D1&${env}&returnCountOnly=true&f=json`)
    const count = c.count ?? null
    out.push({
      item: it.title, owner: it.owner, layer: d.name, url: L.url, geometry: d.geometryType,
      fieldsMatched: hit.slice(0, 6), bonus: art.bonus ? fields.filter(f => art.bonus.test(f)).slice(0, 6) : [],
      countInTown: count, countError: c.__error || c.error?.message || null,
      licence: (it.licenseInfo || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140) || null,
      access: it.access,
    })
    await sleep(150)
  }
  return out
}

// ── WELL 3: Socrata discovery (no bbox — matched by place name, then confirmed by domain).
async function socrata(town, kw) {
  const hits = []
  for (const p of town.place) {
    const j = await getJson(`https://api.us.socrata.com/api/catalog/v1?only=dataset&limit=20&q=${encodeURIComponent(`${kw} ${p}`)}`)
    for (const r of j.results || []) {
      const blob = `${r.metadata.domain} ${r.resource.name} ${r.resource.attribution || ''}`.toLowerCase()
      if (town.place.some(x => blob.includes(x.toLowerCase())) || blob.includes(town.state.toLowerCase()))
        hits.push({ name: r.resource.name, domain: r.metadata.domain, id: r.resource.id, licence: r.metadata.license || null })
    }
  }
  return [...new Map(hits.map(h => [h.domain + h.id, h])).values()]
}

// ── WELL 4: OpenTrees (aggregated municipal tree inventories). Name match only; no bbox.
let _ot
async function openTrees(town) {
  _ot ??= await getJson('https://raw.githubusercontent.com/stevage/OpenTrees/master/src/sources-out.json')
  if (!Array.isArray(_ot)) return { error: _ot?.__error }
  return _ot.filter(s => town.place.some(p => (`${s.short} ${s.long || ''} ${s.id}`).toLowerCase().includes(p.toLowerCase())))
    .map(s => ({ id: s.id, short: s.short, download: s.download, licence: s.licence || s.license || null }))
}

async function probeTown(key) {
  const t = TOWNS[key]
  const rep = { town: key, bbox: t.bbox, osm: await overpassCounts(t.bbox), artifacts: {} }
  for (const [aid, art] of Object.entries(ARTIFACTS)) {
    const cands = await agolCandidates(t.bbox, art)
    const recognised = []
    // Probe the 25 tightest-extent candidates. ⚠️ A cap, recorded as such in the report —
    // it is a probe budget, not a claim that nothing lies beyond it.
    for (const it of cands.slice(0, 25)) {
      for (const r of await recogniseService(it, t.bbox, art)) if (r.countInTown > 0) recognised.push(r)
    }
    rep.artifacts[aid] = {
      rows: art.rows, agolCandidates: cands.length, probed: Math.min(25, cands.length),
      recognised: recognised.sort((a, b) => (b.countInTown || 0) - (a.countInTown || 0)),
      socrata: await socrata(t, art.keywords[0].split(' ')[0]),
      ...(aid === 'tree-inventory' ? { openTrees: await openTrees(t) } : {}),
    }
    console.error(`[${key}] ${aid}: ${cands.length} catalogue candidates → ${recognised.length} recognised layer(s) with features in town`)
  }
  return rep
}

const which = arg('town') ? [arg('town')] : Object.keys(TOWNS)
const all = []
for (const k of which) all.push(await probeTown(k))
const out = JSON.stringify(all, null, 2)
if (arg('out')) writeFileSync(arg('out'), out); else console.log(out)
