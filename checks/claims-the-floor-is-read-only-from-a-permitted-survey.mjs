#!/usr/bin/env node
// CLAIM — THE BATHYMETRY LADDER'S NCMP RUNG READS ONE SURVEY, AND ONLY A PERMITTED ONE (fetch-bathymetry.mjs#findNcmp).
//
// references/README rule 1: no agent reads a source until its terms are permitted. The rung finds USACE topobathy surveys
// by COORDINATES on NOAA Digital Coast's bucket, so it can meet surveys nobody has checked. ASSERTS, on a drawn bucket
// (a fake fetcher, so nothing leaves the machine), through the real findNcmp and the real permittedDigitalCoast:
//   1. a survey meeting the bbox with NO permitted registry row is NAMED and its tiles are NEVER fetched;
//   2. of the permitted surveys meeting the bbox, the one holding the largest SHARE of the town's water edge is taken,
//      alone (one survey), even when a newer one exists (an NCMP survey is a corridor: the newest may clip a corner);
//      on equal shares the newer wins; each candidate's share is reported; a town with no water edge ranks none;
//   3. a survey off the bbox, or a topo-only one (no topobathy in its description), is not taken;
//   4. a collection with no STAC record is counted, not read;
//   5. a tile off the bbox is not listed.
// MUTANTS (each RED): permittedDigitalCoast ignores aiUse · the share is dropped from the rank (newest wins) · the
// recency tie-break is dropped · the bbox test is dropped · the description test is dropped.
//
//   node checks/claims-the-floor-is-read-only-from-a-permitted-survey.mjs
import { findNcmp, permittedDigitalCoast } from '../cartograph/fetch-bathymetry.mjs'

const BBOX = { minLon: -82.6, maxLon: -82.5, minLat: 41.35, maxLat: 41.45 }
const IN = [-82.62, 41.30, -82.40, 41.50], OFF = [-70, 40, -69, 41]
const coll = (bbox, end, desc = 'rasterized topobathy lidar elevations') => ({ description: desc, extent: { spatial: { bbox: [bbox] }, temporal: { interval: [[end.replace(/-\d\d$/, '-01'), end]] } } })
const tile = (id, bbox) => ({ id, bbox, assets: { [id]: { href: `https://x/${id}.tif`, type: 'image/tiff; application=geotiff' } } })
const BUCKET = {
  // the OLDER survey holds most of the water edge; the NEWER one clips a corner of it
  'dem/USACE_Old_2012_1002/': { c: coll(IN, '2012-10-18'), items: [tile('old_in_1mGrid', [-82.59, 41.39, -82.51, 41.40])] },
  'dem/USACE_New_2020_1001/': { c: coll(IN, '2020-06-13'), items: [tile('new_in_1mGrid', [-82.52, 41.39, -82.51, 41.40]), tile('new_off_1mGrid', OFF)] },
  'dem/USACE_Unchecked_2023_1003/': { c: coll(IN, '2023-07-01'), items: [tile('unchecked_in', [-82.55, 41.39, -82.54, 41.40])] },
  'dem/USACE_Far_2024_1004/': { c: coll(OFF, '2024-01-01'), items: [] },
  'dem/USACE_Topo_2025_1005/': { c: coll(IN, '2025-01-01', 'bare-earth topographic lidar DEM'), items: [tile('topo_in', [-82.55, 41.39, -82.54, 41.40])] },
  'dem/USACE_NoStac_2019_1006/': null,
}
// the town's water edge: nine samples along z 41.395, from −82.585 to −82.515
const EDGE = Array.from({ length: 9 }, (_, i) => [-82.585 + i * 0.00875, 41.395])
const fetched = []
const res = (status, body) => ({ ok: status === 200, status, text: async () => body, json: async () => JSON.parse(body) })
const fetcher = async (url) => {
  fetched.push(url)
  if (url.includes('?list-type=2')) return res(200, Object.keys(BUCKET).map(p => `<Prefix>${p}</Prefix>`).join(''))
  const p = Object.keys(BUCKET).find(k => url.includes(k))
  if (!p) return res(404, '')
  if (!BUCKET[p]) return res(404, '')
  if (url.endsWith('stac/collection.json')) return res(200, JSON.stringify(BUCKET[p].c))
  if (/noaa_item_collection_m\d+\.json$/.test(url)) return res(200, JSON.stringify({ features: BUCKET[p].items }))
  return res(404, '')
}
const registry = { sources: [
  { id: 'new', digitalCoastId: 1001, terms: { aiUse: 'permitted' } },
  { id: 'old', digitalCoastId: 1002, terms: { aiUse: 'permitted' } },
  { id: 'unchecked', digitalCoastId: 1003, terms: { aiUse: 'unchecked' } },
  { id: 'topo', digitalCoastId: 1005, terms: { aiUse: 'permitted' } },
] }
const bad = []
const say = (ok, what) => { console.log(`  ${ok ? '✅' : '⛔'} ${what}`); if (!ok) bad.push(what) }
const r = await findNcmp(BBOX, { fetcher, permitted: permittedDigitalCoast(registry), edgeLL: EDGE })
say(r.unpermitted.map(u => u.id).join() === '1003' && !fetched.some(u => /m1003\.json$/.test(u)), 'a survey with no permitted row is named, and its tiles are never fetched')
say(r.survey?.id === '1002' && r.others.map(o => o.id).join() === '1001', `the survey holding most of the water edge is taken alone, over a newer one (${r.survey?.id} at ${(100 * r.survey?.share).toFixed(0)}%; others ${r.others.map(o => `${o.id} at ${(100 * o.share).toFixed(0)}%`)})`)
say(r.delivered.every(t => t.survey === '1002'), 'no tile of another survey is mixed in')
say(!r.delivered.some(t => /topo|far/i.test(t.tile)), 'a topo-only survey and one off the bbox are not taken')
say(r.noStac.length === 1, `a collection with no STAC record is counted, not read (${r.noStac.length})`)
{ const n = await findNcmp(BBOX, { fetcher, permitted: permittedDigitalCoast(registry), edgeLL: EDGE.slice(8) })   // the one sample both hold
  say(n.survey?.id === '1001', `on an equal share the newer survey wins (${n.survey?.id})`)
  const off = n.survey ? n.delivered.map(t => t.tile) : []
  say(off.join() === 'new_in_1mGrid', `a tile off the bbox is not listed (${off})`) }
{ const z = await findNcmp(BBOX, { fetcher, permitted: permittedDigitalCoast(registry), edgeLL: [] })
  say(!z.survey && /no water edge/.test(z.why || ''), `a town with no water edge ranks none (${z.why})`) }
say(!permittedDigitalCoast(registry).has('1003'), "permittedDigitalCoast admits only aiUse 'permitted'")
if (bad.length) { console.log(`\n⛔ ${bad.length} claim(s) fail.`); process.exit(1) }
console.log('\n✅ The floor is read from one survey, and only from a permitted one.')
