#!/usr/bin/env node
// scratch/intake-server-crawl-probe.mjs — Tally 2026-09-24, READ-ONLY. Once a jurisdiction's own
// ArcGIS Server host is known, crawl its whole catalogue and apply the SAME artifact recognisers as
// intake-artifact-discovery-probe.mjs. Proves the recogniser; host DISCOVERY is the open question.
//   node scratch/intake-server-crawl-probe.mjs <server-root> <minLon,minLat,maxLon,maxLat>
const [root, bb] = process.argv.slice(2)
const UA = 'cartograph-intake-probe/0.1 (read-only)'
const R = {
  'tree-inventory': [/Point/, /spec|common|genus|botan|scien/i],
  'street-lights': [/Point/, /light|lamp|lumin|fixture|watt/i],
  parcels: [/Polygon/, /parcel|^pin$|handle|parid|apn/i],
  'building-fabric': [/Polygon/, /height|stor(e)?y|stories|floors|levels/i],
}
const j = async (u) => { try { const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) }); return await r.json() } catch (e) { return { __e: e.message } } }
const top = await j(`${root}?f=json`)
const svcs = [...(top.services || [])]
for (const f of top.folders || []) { const d = await j(`${root}/${f}?f=json`); svcs.push(...(d.services || [])) }
const hits = []
for (const s of svcs.filter(s => /MapServer|FeatureServer/.test(s.type))) {
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
console.log(`${svcs.length} services crawled`)
for (const h of hits.sort((a, b) => a.art.localeCompare(b.art) || b.n - a.n)) console.log(`  ${h.art.padEnd(16)} ${String(h.n).padStart(6)}  ${h.name}  ${h.url}  [${h.fields}]`)
