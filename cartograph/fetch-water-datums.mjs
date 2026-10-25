#!/usr/bin/env node
/**
 * fetch-water-datums.mjs — WHERE THE TOWN'S WATER STANDS: its tide datums, or its lake's level.
 *
 * ⭐ RULED BY JACOB, 2026-09-27 (BRIEF-bathymetry, "The water's LEVEL is a tide"): the water stands at a NAMED datum,
 * not at the tide on the day the lidar flew; each town has a LOW-tide level (MLLW) and a HIGH-tide level (MHW), and
 * a clock drives between them next. A lake has no tide: its level is the lake's own chart datum or mean level, from
 * its source. ⛔ A coastal town with no conversion fails loudly; it never keeps the flight's level in silence.
 *
 * This is the ACQUISITION half (network, once per town); `bake-terrain.js` reads the file this writes and turns it
 * into heights above the terrain's zero. The bake never calls a service.
 *   · TIDAL — NOAA VDatum (vdatum.noaa.gov REST), NAVD88 → MHW and → MLLW, on a coarse grid over the town's own
 *     fetch bbox (the datums vary across a town: Provincetown's MLLW spans more than VDatum's own uncertainty).
 *     A point VDatum does not cover (land, or outside its models) answers ±999999 and is recorded as null.
 *     Cross-checked against the nearest NOAA CO-OPS tidal station's published MHW − MLLW, when one lies in the bbox.
 *   · LAKE — when VDatum has no tidal datum anywhere in the bbox and the nearest CO-OPS station is a Great Lakes
 *     gauge: that gauge's chart datum (GL_LWD, IGLD85) and its monthly-mean level over the last 20 whole years, plus
 *     VDatum's NAVD88 → IGLD85 offset at the town. ⛔ Which of the two is the town's level is NOT decided here.
 *
 *   · TIDE CLOCK (tidal towns, BRIEF-tide) — the station's harmonic constituents (CO-OPS `harcon`), its MSL above
 *     MLLW and datums, and ONE WEEK of NOAA's own high/low predictions as the fixture `claims-tide-matches-noaa`
 *     holds cartograph/tide.mjs to. The constituents time the tide; the town's own MLLW/MHW stay its levels.
 *     ⛔ Written to its OWN file, raw/tide.json: water-datums.json is a terrain input (serve.js runIfDirty), and a
 *     timing record must never make a town's terrain dirty.
 *
 *   node cartograph/fetch-water-datums.mjs --scene=<id> [--dry]
 *   node cartograph/fetch-water-datums.mjs --scene=<id> --tide-only   # the tide clock alone, for a town already acquired
 * Writes cartograph/data/<scene>/raw/water-datums.json (+ raw/tide.json when tidal). Exit 0 = written · 1 = no datum
 * found (said) · other = error.
 */
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireExplicitMap } from './scene.js'
import { writeIfChanged } from './io.js'
import { terrainValueReads } from './terrainReads.mjs'
import { authoredWater } from './waterDatums.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const VDATUM = 'https://vdatum.noaa.gov/vdatumweb/api/convert'
const COOPS_MD = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi'
const COOPS_DATA = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'
// Samples per side of the grid. A COUNT, not a spacing: the step scales with the town's own bbox.
export const GRID_N = 8
const OUTSIDE = 999999          // VDatum's "no model here"

const arg = (k, d = null) => {
  const hit = process.argv.find(a => a.startsWith(`--${k}=`))
  return hit ? hit.slice(k.length + 3) : (process.argv.includes(`--${k}`) ? true : d)
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

/** NAVD88 height 0 at (lon, lat) expressed in `datum`: returns the DATUM's height in NAVD88 (m), or null outside. */
export async function datumInNavd88(lon, lat, datum, { tries = 5 } = {}) {
  const u = `${VDATUM}?s_x=${lon}&s_y=${lat}&s_z=0&region=contiguous&s_h_frame=NAD83_2011&s_coor=geo&s_v_frame=NAVD88`
    + `&t_v_frame=${datum}&t_h_frame=NAD83_2011&t_coor=geo`
  let last = null
  for (let a = 0; a < tries; a++) {
    try {
      const j = await (await fetch(u, { signal: AbortSignal.timeout(30000) })).json()
      if (j.t_z != null) {
        const z = +j.t_z
        if (Math.abs(z) >= OUTSIDE) return { value: null, why: 'outside VDatum coverage' }
        // Height 0 in NAVD88 reads as z in the datum ⇒ the datum's own zero stands at −z in NAVD88.
        return { value: -z, uncertaintyM: +j.uncertainty, url: u }
      }
      last = `${j.errorCode} ${j.message}`
    } catch (e) { last = e.message }
    await sleep(1500 * (a + 1))                   // the service answers 412 intermittently; back off and ask again
  }
  throw new Error(`⛔ VDatum ${datum} at (${lon}, ${lat}) failed ${tries}× — last: ${last}`)
}

/**
 * IGLD85 → NAVD88 AT THE LAKE'S OWN HEIGHTS: [[igld85 m, navd88 m], …], one VDatum call per height.
 * ⛔ IGLD85 is a DYNAMIC height, so its difference from NAVD88 grows with height: at Huron (Lake Erie, ~174 m) VDatum gives
 * −0.004 m at height 0 and +0.067 m at 174.354 m (measured 2026-10-25, Swash). A conversion asked at height 0 placed the
 * lake 7 cm low. ⇒ Ask it at the heights the town uses; the reader interpolates between them (waterDatums.mjs).
 */
export async function igld85ToNavd88Points(lon, lat, heights, { fetcher = fetch, tries = 5 } = {}) {
  const out = []
  for (const h of [...new Set(heights.filter(Number.isFinite).map(v => +v.toFixed(3)))].sort((a, b) => a - b)) {
    const u = `${VDATUM}?s_x=${lon}&s_y=${lat}&s_z=${h}&region=contiguous&s_h_frame=NAD83_2011&s_coor=geo&s_v_frame=IGLD85`
      + `&t_v_frame=NAVD88&t_h_frame=NAD83_2011&t_coor=geo`
    let got = null, last = null
    for (let a = 0; a < tries && got == null; a++) {
      try {
        const j = await (await fetcher(u, { signal: AbortSignal.timeout(30000) })).json()
        if (j.t_z != null) {
          if (Math.abs(+j.t_z) >= OUTSIDE) throw new Error(`⛔ VDatum has no IGLD85 → NAVD88 at (${lon}, ${lat})`)
          got = +j.t_z
        } else last = `${j.errorCode} ${j.message}`
      } catch (e) { if (/no IGLD85/.test(e.message)) throw e; last = e.message }
      if (got == null) await sleep(1500 * (a + 1))
    }
    if (got == null) throw new Error(`⛔ VDatum IGLD85 ${h} m at (${lon}, ${lat}) failed ${tries}× — last: ${last}`)
    out.push([h, +got.toFixed(4)])
  }
  if (out.length < 2) throw new Error('⛔ IGLD85 → NAVD88 needs at least two heights to interpolate between')
  return out
}

async function json(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(60000) })
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`)
  return r.json()
}

/** CO-OPS water-level stations of a type, nearest the bbox centre first. */
async function stationsNear(bbox, type) {
  const j = await json(`${COOPS_MD}/stations.json?type=${type}`)
  const cx = (bbox.minLon + bbox.maxLon) / 2, cy = (bbox.minLat + bbox.maxLat) / 2
  const km = s => Math.hypot((s.lng - cx) * 111 * Math.cos(cy * Math.PI / 180), (s.lat - cy) * 111)
  return (j.stations || []).map(s => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, km: km(s),
    inBbox: s.lng >= bbox.minLon && s.lng <= bbox.maxLon && s.lat >= bbox.minLat && s.lat <= bbox.maxLat }))
    .sort((a, b) => a.km - b.km)
}

/**
 * A town's NAMED tide station (sources.json `tide`: { station, why }), read straight from the JSON — this file runs
 * as a subprocess, so it imports nothing the server holds. null when the town names none. ⛔ A malformed one throws.
 */
export function namedTideStation(scene) {
  const p = join(ROOT, 'cartograph', 'data', scene, 'sources.json')
  if (!existsSync(p)) return null
  return parseTideDeclaration(JSON.parse(readFileSync(p, 'utf8')).tide, p)
}
/** `tide` → { station, why } | null. ⛔ Anything but a 7-digit CO-OPS id WITH a reason throws. */
export function parseTideDeclaration(t, where = 'sources.json') {
  if (t == null) return null
  if (!t || typeof t !== 'object' || !/^\d{7}$/.test(String(t.station ?? '')) || !String(t.why ?? '').trim())
    throw new Error(`⛔ ${where}: \`tide\` must be { "station": "<7-digit CO-OPS id>", "why": "<why this water>" } — got ${JSON.stringify(t)}`)
  return { station: String(t.station), why: String(t.why).trim() }
}

/**
 * WHICH CO-OPS station times this town's tide (Jacob, 2026-10-05). `stations` = the datum stations (stationsNear).
 *   1. a station INSIDE the town's bbox — the town's own water;
 *   2. else the station the town NAMES (sources.json `tide`) — the operator's ruling of which water body it is;
 *   3. else THROW, as before.
 * ⛔ NEVER nearest-by-distance: the nearest gauge can sit on a different water body (a river, the other side of a
 * spit), and a plausible tide from the wrong water is the worst answer. Returns { station, why }.
 */
export function chooseTideStation(stations, named, scene) {
  const inside = stations.find(s => s.inBbox)
  if (inside) return { station: inside, why: 'inside the town\'s bbox' }
  if (named) {
    const st = stations.find(s => String(s.id) === named.station)
    if (!st) throw new Error(`⛔ ${scene}: names tide station ${named.station}, which CO-OPS does not list among stations with published datums`)
    return { station: st, why: `named in sources.json (${st.km != null ? st.km.toFixed(1) + ' km from centre — ' : ''}${named.why})` }
  }
  throw new Error(`⛔ ${scene}: tidal, but no CO-OPS station in the bbox and none named — name the town's water in sources.json \`tide\` { station, why } (outside the US? name one in INTAKE-CATALOGUE)`)
}

/** The tide clock for a CO-OPS station: constituents, MSL above MLLW, and a week of NOAA's highs/lows. ⛔ Throws on any gap. */
export async function tideClock(stationId, now = new Date()) {
  const hc = await json(`${COOPS_MD}/stations/${stationId}/harcon.json?units=metric`)
  // ⭐ KEPT WHOLE (Jacob: "keep the data in case we ever sophisticate into using it"): every constituent, zero ones included,
  // with NOAA's local phase, number and description — nothing rounded or dropped for today's timing-only use.
  const constituents = (hc.HarmonicConstituents || []).map(c => ({ number: c.number, name: c.name, description: c.description,
    amplitudeM: +c.amplitude, phaseGMT: +c.phase_GMT, phaseLocal: +c.phase_local, speed: +c.speed }))
  if (hc.units !== 'meters' || !constituents.length) throw new Error(`⛔ CO-OPS ${stationId}: no harmonic constituents in metres (units ${hc.units}, ${constituents.length} rows) — this station cannot time a tide`)
  const d = await json(`${COOPS_MD}/stations/${stationId}/datums.json?units=metric`)
  const g = n => d.datums?.find(x => x.name === n)?.value
  if (g('MSL') == null || g('MLLW') == null) throw new Error(`⛔ CO-OPS ${stationId}: no MSL/MLLW datums`)
  const ymd = t => t.toISOString().slice(0, 10).replace(/-/g, '')
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const to = new Date(from.getTime() + 7 * 86400000)
  const pu = `${COOPS_DATA}?product=predictions&interval=hilo&datum=MLLW&units=metric&time_zone=gmt&format=json&application=cartograph-kit`
    + `&station=${stationId}&begin_date=${ymd(from)}&end_date=${ymd(to)}`
  const pj = await json(pu)
  const hilo = (pj.predictions || []).map(p => ({ at: p.t.replace(' ', 'T') + ':00Z', heightM: +p.v, kind: p.type === 'H' ? 'high' : 'low' }))
  if (hilo.length < 20) throw new Error(`⛔ CO-OPS ${stationId}: ${hilo.length} predicted highs/lows in a week — too few to hold the tide to`)
  return {
    source: `NOAA CO-OPS ${stationId} (harmonic constituents + datums; public domain)`, station: stationId, fetched: now.toISOString().slice(0, 10),
    datum: 'MLLW', mslAboveDatumM: g('MSL') - g('MLLW'), datumEpoch: d.epoch ?? null,
    stationDatums: Object.fromEntries((d.datums || []).map(x => [x.name, x.value])),   // on the station datum (STND), metres
    harconUrl: `${COOPS_MD}/stations/${stationId}/harcon.json?units=metric`, constituents,
    noaaHilo: { url: pu, window: [from.toISOString(), to.toISOString()], extrema: hilo },
  }
}

async function tidal(bbox) {
  const lons = [], lats = []
  for (let i = 0; i < GRID_N; i++) {
    lons.push(+(bbox.minLon + (bbox.maxLon - bbox.minLon) * i / (GRID_N - 1)).toFixed(5))
    lats.push(+(bbox.maxLat - (bbox.maxLat - bbox.minLat) * i / (GRID_N - 1)).toFixed(5))   // row 0 = north
  }
  const high = [], low = [], unc = []
  for (const lat of lats) for (const lon of lons) {
    const h = await datumInNavd88(lon, lat, 'MHW'), l = await datumInNavd88(lon, lat, 'MLLW')
    high.push(h.value); low.push(l.value)
    if (h.uncertaintyM != null) unc.push(h.uncertaintyM, l.uncertaintyM)
    process.stdout.write(h.value == null ? '·' : '▪')
  }
  process.stdout.write('\n')
  return { lons, lats, high, low, uncertaintyM: unc.length ? Math.max(...unc) : null }
}

async function main() {
  const scene = requireExplicitMap('fetch-water-datums.mjs (writes raw/water-datums.json)')
  const rawDir = join(ROOT, 'cartograph', 'data', scene, 'raw')
  const osmPath = join(rawDir, 'osm.json')
  if (!existsSync(osmPath)) { console.error(`fetch-water-datums: ${scene} has no raw/osm.json — fetch the town first`); process.exit(2) }
  const bbox = JSON.parse(readFileSync(osmPath, 'utf8')).bbox
  if (!bbox) { console.error(`fetch-water-datums: ${scene}'s raw/osm.json has no bbox`); process.exit(2) }
  console.log(`[fetch-water-datums] ${scene}  bbox ${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`)

  if (arg('tide-only')) {
    const p = join(rawDir, 'water-datums.json')
    if (!existsSync(p)) { console.error(`fetch-water-datums: ${scene} has no raw/water-datums.json — run the full acquisition first`); process.exit(2) }
    const cur = JSON.parse(readFileSync(p, 'utf8'))
    if (cur.kind !== 'tidal') { console.error(`fetch-water-datums: ${scene} is not tidal (${cur.kind}) — it has no tide clock`); process.exit(1) }
    if (!cur.station?.id) { console.error(`⛔ ${scene}: tidal, but no CO-OPS station is named — no tide source for this town (outside the US? name one in INTAKE-CATALOGUE)`); process.exit(1) }
    const tide = await tideClock(cur.station.id)
    console.log(`  TIDE: ${tide.constituents.length} constituents · MSL ${tide.mslAboveDatumM} m above MLLW · ${tide.noaaHilo.extrema.length} NOAA highs/lows`)
    if (arg('dry')) { console.log(JSON.stringify({ ...tide, constituents: tide.constituents.length }, null, 1)); return }
    const tp = join(rawDir, 'tide.json')
    writeIfChanged(tp, JSON.stringify(tide, null, 2) + '\n')
    console.log(`✅ → ${tp}`)
    return
  }

  let out, tideOut = null
  console.log(`  VDatum NAVD88 → MHW / MLLW on a ${GRID_N}×${GRID_N} grid (▪ covered · · not):`)
  const t = await tidal(bbox)
  const covered = t.high.filter(v => v != null).length
  if (covered) {
    const hs = t.high.filter(v => v != null), ls = t.low.filter(v => v != null)
    const chosen = chooseTideStation(await stationsNear(bbox, 'datums'), namedTideStation(scene), scene)   // every station with published datums
    const tideSt = chosen.station
    console.log(`  tide station: CO-OPS ${tideSt.id} ${tideSt.name} — ${chosen.why}`)
    let station = null
    {                                                   // the chosen station's cross-check
      const d = await json(`${COOPS_MD}/stations/${tideSt.id}/datums.json?units=metric`)
      const g = n => d.datums?.find(x => x.name === n)?.value
      const range = g('MHW') != null && g('MLLW') != null ? +(g('MHW') - g('MLLW')).toFixed(3) : null
      const at = { high: await datumInNavd88(tideSt.lng, tideSt.lat, 'MHW'), low: await datumInNavd88(tideSt.lng, tideSt.lat, 'MLLW') }
      const vd = at.high.value != null && at.low.value != null ? +(at.high.value - at.low.value).toFixed(3) : null
      station = { id: tideSt.id, name: tideSt.name, lat: tideSt.lat, lon: tideSt.lng, chosen: chosen.why, mhwMinusMllwM: range, vdatumMhwMinusMllwM: vd,
        url: `https://tidesandcurrents.noaa.gov/datums.html?id=${tideSt.id}` }
      console.log(`  cross-check: CO-OPS ${tideSt.id} ${tideSt.name} MHW − MLLW = ${range} m · VDatum there ${vd} m`)
    }
    out = { kind: 'tidal', source: 'NOAA VDatum REST (vdatum.noaa.gov), NAVD88 → tidal datums', frame: 'NAD83_2011 / NAVD88 (GEOID18)',
      fetchedOn: new Date().toISOString().slice(0, 10), grid: { lons: t.lons, lats: t.lats, rowsFrom: 'north' },
      high: { datum: 'MHW', navd88M: t.high }, low: { datum: 'MLLW', navd88M: t.low }, uncertaintyM: t.uncertaintyM,
      covered, of: GRID_N * GRID_N, station }
    tideOut = await tideClock(station.id)
    console.log(`  TIDAL: ${covered}/${GRID_N * GRID_N} points covered · MHW ${Math.min(...hs).toFixed(3)}…${Math.max(...hs).toFixed(3)} m NAVD88 · MLLW ${Math.min(...ls).toFixed(3)}…${Math.max(...ls).toFixed(3)} m · ±${t.uncertaintyM} m`)
  } else {
    const gl = (await stationsNear(bbox, 'historicwl'))                                // the Great Lakes gauges are here, not under `datums`
    // ⭐ THE NEAREST GREAT LAKES GAUGE THAT SERVES what the record is made of — a chart datum (GL_LWD) and the monthly
    // means — never merely the nearest: the station list carries REMOVED gauges (Huron's own, 9063074, ran 1935–1979 and
    // serves neither; it came first for Huron on 2026-10-25 and the record went empty). Each one passed over is NAMED.
    const y1 = new Date().getUTCFullYear() - 1, y0 = y1 - 19
    let s = null, lwd, months = [], peaks = []
    const passed = []
    for (const c of gl.slice(0, 6)) {
      const meta = (await json(`${COOPS_MD}/stations/${c.id}.json`)).stations?.[0]
      if (!meta?.greatlakes) continue
      const d = await json(`${COOPS_MD}/stations/${c.id}/datums.json?units=metric`)
      const L = d.datums?.find(x => x.name === 'GL_LWD')?.value, M = [], K = []
      for (const [a, b] of [[y0, y0 + 9], [y0 + 10, y1]]) {
        const j = await json(`${COOPS_DATA}?product=monthly_mean&station=${c.id}&begin_date=${a}0101&end_date=${b}1231&datum=IGLD&units=metric&time_zone=gmt&format=json&application=cartograph-kit`)
        for (const r of j.data || []) { if (+r.MSL > 0) M.push(+r.MSL); if (+r.highest > 0) K.push(+r.highest) }
      }
      if (Number.isFinite(L) && M.length) { s = c; lwd = L; months = M; peaks = K; break }
      passed.push(`${c.name} (${c.id}, ${c.km.toFixed(1)} km): ${!Number.isFinite(L) ? 'no GL_LWD' : ''}${!Number.isFinite(L) && !M.length ? ' · ' : ''}${!M.length ? `no monthly means ${y0}–${y1}` : ''}`)
    }
    for (const p of passed) console.log(`  lake gauge passed over — ${p}`)
    if (!s) {
      const body = { kind: 'none', why: `VDatum covers none of ${GRID_N * GRID_N} points and no Great Lakes gauge among the nearest CO-OPS stations serves a chart datum and monthly means${passed.length ? ` (passed over: ${passed.join('; ')})` : ''}`, fetchedOn: new Date().toISOString().slice(0, 10) }
      if (!arg('dry')) { mkdirSync(rawDir, { recursive: true }); writeIfChanged(join(rawDir, 'water-datums.json'), JSON.stringify(body, null, 2) + '\n') }
      console.error(`⛔ ${scene}: no tidal datum and no lake gauge that serves its levels — this town's water level cannot be named. Written: raw/water-datums.json`)
      process.exit(1)
    }
    const cx = +((bbox.minLon + bbox.maxLon) / 2).toFixed(5), cy = +((bbox.minLat + bbox.maxLat) / 2).toFixed(5)
    const mean = months.length ? +(months.reduce((a, b) => a + b, 0) / months.length).toFixed(3) : null
    // ⭐ THE SPAN THE KIT READS, and no further (the reader refuses outside it): from the deepest the bed is ever drawn —
    // the lowest level the town could stand at, less its visibility depth (bake-terrain's own rule: the town's authored
    // `water.secchiM`, else r-bottom-visibility-default) — up to the HIGHEST WATER OBSERVED on the record (a monthly
    // `highest`, not a mean: the flight-water band's top is one, fetch-flight-water.mjs).
    const reads = terrainValueReads(scene), auth = authoredWater(scene, reads)
    const visM = auth.secchiM?.value ?? reads.findings['r-bottom-visibility-default']?.value?.visibleToM
    if (!Number.isFinite(visM)) throw new Error(`⛔ ${scene}: no visibility depth (design.json water.secchiM, or the registry's r-bottom-visibility-default) — the span the bed reads is unknown`)
    const floorM = Math.min(lwd, ...months) - visM
    const conv = await igld85ToNavd88Points(cx, cy, [floorM, lwd, mean, Math.min(...months), Math.max(...months), ...(peaks.length ? [Math.max(...peaks)] : [])])
    out = { kind: 'lake', source: `NOAA CO-OPS ${s.id} ${s.name} (Great Lakes gauge, ${s.km.toFixed(0)} km) + VDatum IGLD85 → NAVD88 at the lake's heights`,
      fetchedOn: new Date().toISOString().slice(0, 10), station: { id: s.id, name: s.name, lat: s.lat, lon: s.lng, km: +s.km.toFixed(1),
        url: `https://tidesandcurrents.noaa.gov/datums.html?id=${s.id}` },
      igld85ToNavd88: { points: conv, from: `VDatum IGLD85 → NAVD88 at (${cx}, ${cy}), asked at each height (a dynamic height: never one offset)` },
      levels: { LWD: { igld85M: lwd, what: 'chart datum (Low Water Datum)' },
                mean: { igld85M: mean, what: `mean of ${months.length} monthly means, ${y0}–${y1}`, minM: Math.min(...months), maxM: Math.max(...months) } } }
    console.log(`  LAKE: ${s.name} (${s.id}) LWD ${lwd} m IGLD85 · ${y0}–${y1} mean ${mean} m (${months.length} months) · IGLD85 → NAVD88 at the lake: ${conv.map(([h, n]) => `${h} → ${n}`).join(', ')}`)
  }
  if (arg('dry')) { console.log(JSON.stringify(out, null, 1)); return }
  mkdirSync(rawDir, { recursive: true })
  const p = join(rawDir, 'water-datums.json')
  writeIfChanged(p, JSON.stringify(out, null, 2) + '\n')
  console.log(`✅ → ${p}`)
  if (tideOut) { const tp = join(rawDir, 'tide.json'); writeIfChanged(tp, JSON.stringify(tideOut, null, 2) + '\n'); console.log(`✅ → ${tp}`) }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(3) })
