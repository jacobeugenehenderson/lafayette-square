// READ-ONLY (BRIEF-the-street-ends-at-the-parcel §3a, Lath 2026-10-19): what each candidate ROW code MEANS in its own source,
// asked of the source's own published fields, never of geometry. Network queries only; writes nothing.
//   node scratch/footprint-census/row-codes.mjs
// Prints, per source: the candidate code's own description, how many parcels carry it, the source's OWN right-of-way marker
// (a code or a parcel type) and how many parcels carry that, and, for the candidate lots that hold street centrelines in
// row-parcels.mjs, who they are.
import fs from 'node:fs'
const REPO = '/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const get = async (url, q) => { const u = new URL(url); for (const [k, v] of Object.entries({ f: 'json', ...q })) u.searchParams.set(k, v)
  const j = await (await fetch(u)).json(); if (j.error) throw new Error(`${url}: ${JSON.stringify(j.error)}`); return j }
const count = (on) => JSON.stringify([{ statisticType: 'count', onStatisticField: on, outStatisticFieldName: 'n' }])
const group = async (url, where, by, on) => (await get(url, { where, groupByFieldsForStatistics: by, outStatistics: count(on) })).features.map(f => f.attributes).sort((a, b) => b.n - a.n)
const rows = async (url, where, outFields) => (await get(url, { where, outFields, returnGeometry: 'false' })).features.map(f => f.attributes)
const say = (h, xs) => { console.log(h); for (const x of xs) console.log('   ' + JSON.stringify(x)) }

// ── St. Louis City: AsrLandUse1, vocabulary "Assessor Land Use" (stlouis-mo.gov/data/vocabularies/vocabulary.cfm?id=24)
const STL = 'https://maps8.stlouis-mo.gov/arcgis/rest/services/ASSESSOR/Assessor_Public_Parcels/MapServer/11/query'
say('STL City · AsrLandUse1 = 5000, citywide, by CDALandUse1 (top 4)', (await group(STL, 'AsrLandUse1 = 5000', 'CDALandUse1', 'Handle')).slice(0, 4))
say('STL City · AsrLandUse1 4500–4599 (the vocabulary\'s "HIGHWAY AND STREET RIGHT-OF-WAY" is 4500), citywide', await group(STL, 'AsrLandUse1 >= 4500 AND AsrLandUse1 < 4600', 'AsrLandUse1', 'Handle'))
for (const t of ['lafayette-square', 'hipointedemun']) { const P = JSON.parse(fs.readFileSync(`${REPO}/cartograph/data/${t}/raw/stl_parcels.json`, 'utf8')).parcels
  console.log(`STL City · ${t} raw/stl_parcels.json: ${P.length} parcels · code 5000 ${P.filter(p => +p.land_use_code === 5000).length} · code 4500 ${P.filter(p => +p.land_use_code === 4500).length}`) }
// ── St. Louis County: LUCODE, decoded by the assessor's own table (content/county-land-use-codes.csv)
{ const csv = fs.readFileSync(`${REPO}/cartograph/data/hipointedemun/content/county-land-use-codes.csv`, 'utf8').split(/\r?\n/).filter(l => /ROW|STREET|ROAD/i.test(l))
  const P = JSON.parse(fs.readFileSync(`${REPO}/cartograph/data/hipointedemun/raw/stlco_parcels.json`, 'utf8')).parcels
  console.log(`STL County · the decode table's street / ROW rows: ${csv.join(' | ')}`)
  for (const c of csv.map(l => l.split(',')[0])) console.log(`   hipointedemun raw/stlco_parcels.json code ${c}: ${P.filter(p => String(p.land_use_code) === c).length} of ${P.length}`) }

// ── Massachusetts: MassGIS L3, USE_CODE with the service's own USE_DESC, and POLY_TYPE
const MA = 'https://services1.arcgis.com/hGdibHYSPO59RG1h/ArcGIS/rest/services/Massachusetts_Property_Tax_Parcels/FeatureServer/0/query'
say('MassGIS · POLY_TYPE, statewide', await group(MA, '1=1', 'POLY_TYPE', 'OBJECTID'))
say('MassGIS · POLY_TYPE, Provincetown (TOWN_ID 242)', await group(MA, 'TOWN_ID = 242', 'POLY_TYPE', 'OBJECTID'))
say('MassGIS · non-FEE/TAX polygons with a null PROP_ID, statewide', [(await get(MA, { where: "POLY_TYPE NOT IN ('FEE','TAX') AND PROP_ID IS NULL", returnCountOnly: 'true' })).count])
say('MassGIS · USE_CODE 9000 in Provincetown', await rows(MA, "TOWN_ID = 242 AND USE_CODE = '9000'", 'LOC_ID,USE_CODE,USE_DESC,OWNER1,LOT_SIZE'))

// ── NYC: MapPLUTO LandUse (PLUTO Data Dictionary 23v1.1, Appendix D), and the BldgClass of the 07 lots holding JH's streets
const NY = 'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/MAPPLUTO/FeatureServer/0/query'
{ const R = `${REPO}/cartograph/data/jacksonheights/raw`, osm = JSON.parse(fs.readFileSync(`${R}/osm.json`, 'utf8'))
  const P = JSON.parse(fs.readFileSync(`${R}/nyc_parcels.json`, 'utf8')).parcels.filter(p => String(p.land_use_code) === '07')
  const pip = (x, z, r) => { let w = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) w = !w } return w }
  const ST = ['residential', 'tertiary', 'secondary', 'primary', 'unclassified', 'tertiary_link', 'secondary_link', 'primary_link'], H = {}; let n = 0
  for (const w of osm.ground.highway || []) { const t = w.tags || {}; if (!ST.includes(t.highway) || t.service === 'alley') continue; const C = w.coords
    for (let i = 0; i + 1 < C.length; i++) { const L = Math.hypot(C[i + 1].x - C[i].x, C[i + 1].z - C[i].z), k = Math.max(1, Math.floor(L / 5))
      for (let s = 0; s < k; s++) { const u = (s + 0.5) / k, x = C[i].x + (C[i + 1].x - C[i].x) * u, z = C[i].z + (C[i + 1].z - C[i].z) * u
        const p = P.find(p => (p.rings || []).some(r => pip(x, z, r))); if (p) { n++; H[p.handle] = (H[p.handle] || 0) + 1 } } } }
  const top = Object.entries(H).sort((a, b) => b[1] - a[1]).slice(0, 8)
  console.log(`NYC · jacksonheights: street samples (5 m, row-parcels.mjs's class "street") inside a LandUse 07 lot: ${n}`)
  const info = new Map((await rows(NY, `BBL IN (${top.map(([b]) => b).join(',')})`, 'BBL,BldgClass,LandUse,OwnerName,Address')).map(a => [String(a.BBL), a]))
  for (const [b, k] of top) console.log(`   ${k} samples in ${JSON.stringify(info.get(b) || { BBL: b, missing: true })}`) }

// ── Ohio: the statewide layer's StateLUC is self-describing ("400: Com-Vacant Land"); OAC 5703-25-10 lists no ROW code
{ const P = JSON.parse(fs.readFileSync(`${REPO}/cartograph/data/huron/raw/oh_parcels.json`, 'utf8')).parcels, c = {}
  for (const p of P) { const k = String(p.land_use_code); if (/^400:/.test(k) || /road|street|right.of.way|\bROW\b|highway/i.test(k)) c[k] = (c[k] || 0) + 1 }
  console.log(`Ohio · huron raw/oh_parcels.json: ${P.length} parcels · code 400, and any code naming a road / street / right-of-way / highway: ${JSON.stringify(c)}`) }
