#!/usr/bin/env node
/**
 * scratch/intake-host-discovery-probe.mjs — Wellhead, 2026-09-24. READ-ONLY.
 * Phase 1 of docs/briefs/BRIEF-intake-panel-acquired.md, closing the gap Tally's
 * intake-server-crawl-probe.mjs names in its own header: "host DISCOVERY is the open question."
 *
 * Keyword search misses a jurisdiction whose layer is titled "FORESTRY_TREES" or "Layer 4".
 * So don't search for the artifact by NAME. Search for ANY public item whose extent covers the
 * town, harvest the distinct ArcGIS REST HOSTS those items live on, and crawl every host's whole
 * catalogue with the same geometry + field recognisers. The town's own GIS host is discovered by
 * the town having published *anything*, not by it having titled the right layer the right way.
 *
 * Wells for host harvest (all queried by the town's bbox, never by a place name):
 *   · ArcGIS Online / Hub  — www.arcgis.com/sharing/rest/search, bbox filter, any service type
 *   · data.gov CKAN        — catalog.data.gov package_search, ext_bbox (spatial harvest of
 *                            federal + state + many municipal catalogues)
 *
 *   node scratch/intake-host-discovery-probe.mjs --town=<key> [--hosts=N] [--out=<file>]
 * Writes nothing but its report.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const UA = 'cartograph-intake-probe/0.1 (read-only research)'
const arg = (k) => { const h = process.argv.find(a => a.startsWith(`--${k}=`)); return h ? h.slice(k.length + 3) : null }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
async function j(url, timeout = 25000) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(timeout) })
    if (!r.ok) return { __e: `HTTP ${r.status}` }
    return await r.json()
  } catch (e) { return { __e: e.message } }
}

const sceneBbox = (s) => JSON.parse(readFileSync(new URL(`../cartograph/data/${s}/raw/osm.json`, import.meta.url), 'utf8')).bbox
const TOWNS = {
  'lafayette-square': () => sceneBbox('lafayette-square'),
  huron: () => sceneBbox('huron'),
  provincetown: () => sceneBbox('provincetown'),
  // No scene: the village centre ± ~2.5 km (same frame Tally's probe uses).
  wellfleet: () => ({ minLat: 41.915, maxLat: 41.960, minLon: -70.065, maxLon: -70.000 }),
}

// The recognisers — the SAME ones as intake-server-crawl-probe.mjs (geometry + field pattern),
// plus a count INSIDE the town, which is what turns a catalogue hit into evidence.
const R = {
  'tree-inventory': [/Point/, /spec|common|genus|botan|scien/i],
  'street-lights': [/Point/, /light|lamp|lumin|fixture|watt/i],
  parcels: [/Polygon/, /parcel|^pin$|handle|parid|apn|loc_?id|map_?par/i],
  'building-fabric': [/Polygon/, /height|stor(e)?y|stories|floors|levels/i],
}

const hostOf = (u) => { const m = /^(https?:\/\/[^/]+\/[^?#]*?\/rest\/services)\b/i.exec(u || ''); return m ? m[1] : null }

async function harvestHosts(b) {
  const bs = `${b.minLon},${b.minLat},${b.maxLon},${b.maxLat}`
  const townArea = (b.maxLon - b.minLon) * (b.maxLat - b.minLat)
  const hosts = new Map() // host → { minExtentRatio, items, via }
  const note = (u, ratio, via, title) => {
    const h = hostOf(u); if (!h) return
    // AGOL's own hosted-services farm serves every organisation on earth; it is a host of
    // items, not a jurisdiction's server, and crawling its root is neither possible nor meaningful.
    if (/services\d*\.arcgis\.com/i.test(h)) {
      const org = /services\d*\.arcgis\.com\/([^/]+)\/arcgis\/rest\/services/i.exec(u)
      if (!org) return
    }
    const cur = hosts.get(h) || { minRatio: Infinity, items: 0, via: new Set(), sample: [] }
    cur.minRatio = Math.min(cur.minRatio, ratio); cur.items++; cur.via.add(via)
    if (cur.sample.length < 3) cur.sample.push(title)
    hosts.set(h, cur)
  }
  // AGOL — page through; any Feature/Map Service whose extent intersects the town.
  let start = 1, pages = 0, agolTotal = 0
  while (start > 0 && pages < 10) {
    const q = encodeURIComponent('(type:"Feature Service" OR type:"Map Service")')
    const r = await j(`https://www.arcgis.com/sharing/rest/search?f=json&num=100&start=${start}&bbox=${bs}&q=${q}&sortField=numviews&sortOrder=desc`)
    if (r.__e) break
    agolTotal = r.total ?? agolTotal
    for (const it of r.results || []) {
      const e = it.extent
      const area = e && e.length === 2 ? Math.abs((e[1][0] - e[0][0]) * (e[1][1] - e[0][1])) : Infinity
      note(it.url, area / townArea, 'agol', it.title)
    }
    start = r.nextStart ?? -1; pages++; await sleep(200)
  }
  // data.gov CKAN — spatial harvest. Resources carry the service URLs.
  let ckanTotal = 0
  for (let off = 0; off < 1000; off += 200) {
    const r = await j(`https://catalog.data.gov/api/3/action/package_search?rows=200&start=${off}&ext_bbox=${bs}`, 40000)
    if (r.__e || !r.result) break
    ckanTotal = r.result.count
    for (const p of r.result.results) {
      const sp = (p.extras || []).find(x => x.key === 'spatial')
      let ratio = Infinity
      try {
        const g = JSON.parse(sp?.value || 'null'); const cs = g?.coordinates?.[0]
        if (cs) { const xs = cs.map(c => c[0]), ys = cs.map(c => c[1]); ratio = ((Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))) / townArea }
      } catch {}
      for (const res of p.resources || []) note(res.url, ratio, 'data.gov', p.title)
    }
    if (off + 200 >= ckanTotal) break
    await sleep(200)
  }
  return { agolTotal, ckanTotal, hosts }
}

async function crawl(root, b) {
  const bb = `${b.minLon},${b.minLat},${b.maxLon},${b.maxLat}`
  const top = await j(`${root}?f=json`)
  if (top.__e) return { root, error: top.__e, hits: [] }
  const svcs = [...(top.services || [])]
  for (const f of (top.folders || []).slice(0, 40)) { const d = await j(`${root}/${f}?f=json`); svcs.push(...(d.services || [])) }
  const hits = []
  for (const s of svcs.filter(s => /MapServer|FeatureServer/.test(s.type)).slice(0, 150)) {
    const base = `${root}/${s.name}/${s.type}`
    const d = await j(`${base}/layers?f=json`)
    for (const L of d.layers || []) {
      const fields = (L.fields || []).map(f => f.name)
      for (const [art, [g, re]] of Object.entries(R)) {
        if (!g.test(L.geometryType || '') || !fields.some(f => re.test(f))) continue
        const c = await j(`${base}/${L.id}/query?where=1%3D1&geometry=${bb}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&returnCountOnly=true&f=json`)
        if (c.count > 0) hits.push({ art, url: `${base}/${L.id}`, name: L.name, n: c.count, fields: fields.filter(f => re.test(f)).slice(0, 5) })
      }
    }
  }
  return { root, services: svcs.length, hits }
}

const key = arg('town'); const b = TOWNS[key]?.()
if (!b) { console.error(`--town=${Object.keys(TOWNS).join('|')}`); process.exit(2) }
const N = +(arg('hosts') || 12)
const { agolTotal, ckanTotal, hosts } = await harvestHosts(b)
// Tightest-extent hosts first: a host whose items hug the town is the town's; one whose
// tightest item is a continent is a national publisher. N is a PROBE BUDGET, reported as such.
const ranked = [...hosts.entries()].map(([h, v]) => ({ host: h, ...v, via: [...v.via] })).sort((a, c) => a.minRatio - c.minRatio)
console.error(`[${key}] catalogue: agol=${agolTotal} data.gov=${ckanTotal} → ${ranked.length} distinct ArcGIS hosts; crawling ${Math.min(N, ranked.length)}`)
const crawled = []
for (const h of ranked.slice(0, N)) {
  const c = await crawl(h.host, b)
  console.error(`  ${h.host}  (tightest item ${h.minRatio.toFixed(1)}× town, via ${h.via}) → ${c.error ? 'ERR ' + c.error : c.services + ' services, ' + c.hits.length + ' hits'}`)
  crawled.push({ ...h, ...c })
}
const rep = { town: key, bbox: b, agolTotal, ckanTotal, hostsFound: ranked.length, crawledN: crawled.length,
  uncrawled: ranked.slice(N).map(h => h.host), crawled }
const out = JSON.stringify(rep, null, 2)
if (arg('out')) writeFileSync(arg('out'), out); else console.log(out)
