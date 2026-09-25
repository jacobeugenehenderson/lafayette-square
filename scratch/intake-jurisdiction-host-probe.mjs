#!/usr/bin/env node
// scratch/intake-jurisdiction-host-probe.mjs — Wellhead 2026-09-24, READ-ONLY.
// Catalogue search misses a jurisdiction that never registered its server anywhere (St. Louis City:
// 0 AGOL items point at stlouis-mo.gov; data.gov's CKAN API 404s). So discover the HOST from the
// JURISDICTION: point → every administrative area containing it (Wikidata P131 chain from the
// reverse-geocoded place) → each one's official website (P856) → conventional GIS hostnames on that
// domain, confirmed live by an ArcGIS REST root answering `currentVersion`. No town is named in code.
//   node scratch/intake-jurisdiction-host-probe.mjs <lat> <lon>
const [lat, lon] = process.argv.slice(2).map(Number)
const UA = 'cartograph-intake-probe/0.1 (read-only research)'
const j = async (u, t = 20000) => { try { const r = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(t) }); return r.ok ? await r.json() : { __e: r.status } } catch (e) { return { __e: e.message } } }
// Every Wikidata item whose coordinate-less admin boundary contains the point is hard to ask directly;
// Nominatim's reverse gives the OSM admin hierarchy, and OSM admin relations carry `wikidata=` tags.
const rev = await j(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&extratags=1&namedetails=0&addressdetails=1&polygon_geojson=0`)
const ov = `[out:json][timeout:60];is_in(${lat},${lon})->.a;rel(pivot.a)["boundary"="administrative"]["wikidata"];out tags;`
let admins = []
for (const ep of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
  try { const r = await fetch(ep, { method: 'POST', headers: { 'User-Agent': UA }, body: 'data=' + encodeURIComponent(ov), signal: AbortSignal.timeout(90000) }); if (r.ok) { admins = (await r.json()).elements.map(e => ({ name: e.tags.name, level: +e.tags.admin_level, qid: e.tags.wikidata, web: e.tags.website || null })); break } } catch {}
}
admins.sort((a, b) => b.level - a.level)
const qids = admins.map(a => a.qid).filter(Boolean)
const wd = qids.length ? await j(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=${qids.join('|')}`) : {}
for (const a of admins) {
  const c = wd.entities?.[a.qid]?.claims?.P856 || []
  a.p856 = c.map(x => x.mainsnak?.datavalue?.value).filter(Boolean)
}
const PREFIX = ['gis', 'maps', 'arcgis', 'gisweb', 'webgis', 'gis-services', 'gisservices', 'geo', ...Array.from({ length: 9 }, (_, i) => `maps${i + 1}`)]
const PATH = ['/arcgis/rest/services', '/server/rest/services', '/rest/services', '/arcgisserver/rest/services', '/host/rest/services']
console.log(`point ${lat},${lon} · reverse: ${rev.display_name || rev.__e}`)
for (const a of admins) {
  const sites = [...new Set([...(a.p856 || []), a.web].filter(Boolean))]
  const domains = [...new Set(sites.map(s => { try { return new URL(s).hostname.replace(/^www\./, '') } catch { return null } }).filter(Boolean))]
  const live = []
  for (const d of domains) for (const p of PREFIX) {
    const host = `https://${p}.${d}`
    const results = await Promise.all(PATH.map(async path => { const r = await j(`${host}${path}?f=json`, 8000); return r.currentVersion ? { root: host + path, folders: (r.folders || []).length, services: (r.services || []).length } : null }))
    for (const r of results) if (r) live.push(r)
  }
  console.log(`  L${a.level} ${a.name} (${a.qid}) site=${sites.join(' ') || '—'}`)
  for (const l of live) console.log(`     ✔ ${l.root}  folders=${l.folders} services=${l.services}`)
}
