/**
 * 15-fia-tree-mix.mjs — a town's LIKELY GROVE, from the USDA Forest Inventory & Analysis
 * survey of its county, in popularity order.
 *
 * Jacob, 2026-09-25: "The point of the Arborist is to create likely groves … list the species
 * in popularity order … if we have pieces to make those trees we should build them … we should
 * list the USDA forest survey in popularity order." Same method for every town: the list comes
 * from FIA by county, never hand-picked.
 *
 *   town centre (geography.json) → county FIPS (US Census geocoder)
 *   → the state's latest FIA evaluation → live stems (≥ 1 in d.b.h., forest land) by species, in that county
 *   → cartograph/data/<scene>/tree-mix.json   commonWeights (= the county's stem shares, ranked),
 *                                              shapeByCommon (conifer when FIA's code is a softwood),
 *                                              commonToLibrary (COMPOSED species only), fia provenance
 *   → cartograph/data/<scene>/tree-species-map.json   { map: { COMMON: [libraryId] } }
 *
 * ⛔ Routes ONLY what is composed; every other species stays in the list, unmapped — the
 * Grove shows it red, ranked, as the work item (TREE-INTAKE §5.4). ⛔ No county, no evaluation,
 * no species ⇒ it throws; it never writes an empty or borrowed mix.
 * Sources: references/registry.json `usda-fia`, `us-census-geocoder` (federal, permitted).
 *
 * Usage: CARTOGRAPH_SCENE=<scene> node scripts/15-fia-tree-mix.mjs   (or --scene=<scene>)
 *        --dry-run  print the ranking and the change against the town's current mix; write nothing
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireExplicitMap } from '../cartograph/scene.js'
import { resolveSpecies } from '../arborist/vocabulary.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FIA = 'https://apps.fs.usda.gov/fiadb-api/fullreport'
const LIVE_STEMS = 4          // FIADB estimate 0004: number of live trees (≥ 1 in d.b.h./d.r.c.) on forest land
const SOFTWOOD_BELOW = 300    // FIA species codes < 300 are softwoods (conifers)

async function getJSON(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`)
  return r.json()
}

async function countyOf(lon, lat) {
  const u = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${lon}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&layers=Counties&format=json`
  const c = (await getJSON(u))?.result?.geographies?.Counties?.[0]
  if (!c) throw new Error(`⛔ the Census geocoder found no county at ${lat}, ${lon}`)
  return { state: c.STATE, county: c.COUNTY, name: c.NAME }
}

/** The state's most recent FIA evaluation that answers, newest year first. */
async function stemsByCountyAndSpecies(state) {
  const year = new Date().getFullYear()
  for (let y = year; y >= year - 8; y--) {
    const wc = `${Number(state)}${y}`
    const u = `${FIA}?snum=${LIVE_STEMS}&wc=${wc}&rselected=Species&cselected=County%20code%20and%20name&outputFormat=NJSON`
    try {
      const d = await getJSON(u)
      if (d?.estimates?.length) return { wc, d }
    } catch { /* that evaluation year does not exist — try the one before */ }
  }
  throw new Error(`⛔ no FIA evaluation answered for state ${state} in the last nine years`)
}

async function main() {
  const scene = requireExplicitMap('15-fia-tree-mix.mjs (writes tree-mix.json + tree-species-map.json)')
  const dir = path.join(REPO, 'cartograph', 'data', scene)
  const geo = JSON.parse(readFileSync(path.join(dir, 'geography.json'), 'utf8'))
  const where = await countyOf(geo.lon, geo.lat)
  const { wc, d } = await stemsByCountyAndSpecies(where.state)
  const key = `\`${where.state}${where.county}`
  const rows = d.estimates.filter(e => String(e.GRP2).startsWith(key))
  if (!rows.length) throw new Error(`⛔ FIA evaluation ${wc} has no live-stem estimate for ${where.name}`)
  const total = rows.reduce((s, e) => s + e.ESTIMATE, 0)

  // Composed library species, keyed every way the kit names them (id · label · scientific).
  // ⛔ COMPOSED = a Salon composition with a chassis (arborist/state/<id>/compositions.json)
  // AND a published variant. A variant alone is not enough: the raw Latin twins
  // (quercus_alba, nyssa_sylvatica) are published variants with no composition, and cannot
  // produce an impostor — routing to them is the one-tree-two-ids class.
  const index = JSON.parse(readFileSync(path.join(REPO, 'public', 'trees', 'index.json'), 'utf8'))
  const published = new Set(index.variants.map(v => v.species))
  const stateDir = path.join(REPO, 'arborist', 'state')
  const composed = new Set(readdirSync(stateDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).filter(id => {
    try { return published.has(id) && JSON.parse(readFileSync(path.join(stateDir, id, 'compositions.json'), 'utf8')).compositions?.some(c => c.chassis) } catch { return false }
  }))
  const byName = new Map()
  const add = (k, id) => { if (!k) return; const n = String(k).toLowerCase(); byName.set(n, [...new Set([...(byName.get(n) || []), id])]) }
  for (const s of index.species) if (composed.has(s.species)) {
    add(s.species, s.species); add(s.label, s.species); add(s.scientific, s.species)
    const r = resolveSpecies(s.label || s.species); if (r?.resolved) add(r.value, s.species)
  }

  const ranked = rows.map(e => {
    const m = String(e.GRP1).match(/`(\d+) SPCD \d+ - (.+?) \((.+)\)$/)
    const spcd = m ? Number(m[1]) : null, fiaCommon = m ? m[2] : String(e.GRP1), scientific = m ? m[3] : ''
    const r = resolveSpecies(scientific), rc = resolveSpecies(fiaCommon)
    const common = (r?.resolved && r.value) || (rc?.resolved && rc.value) || fiaCommon
    const lib = [...new Set([...(byName.get(scientific.toLowerCase()) || []), ...(byName.get(String(common).toLowerCase()) || [])])]
    return { common, fiaCommon, scientific, spcd, stems: e.ESTIMATE, share: e.ESTIMATE / total, plots: e.PLOT_COUNT, sePct: e.SE_PERCENT,
      shape: spcd != null && spcd < SOFTWOOD_BELOW ? 'conifer' : null, library: lib }
  }).sort((a, b) => b.stems - a.stems)

  const commonWeights = Object.fromEntries(ranked.map(r => [r.common, +(100 * r.share).toFixed(3)]))
  const shapeByCommon = Object.fromEntries(ranked.filter(r => r.shape).map(r => [r.common, r.shape]))
  const commonToLibrary = Object.fromEntries(ranked.filter(r => r.library.length).map(r => [r.common, r.library[0]]))
  const mapped = ranked.filter(r => r.library.length), mappedShare = mapped.reduce((s, r) => s + r.share, 0)
  const mix = {
    _what_this_is: 'The likely grove: this town\'s county, from the USDA Forest Inventory & Analysis survey, ranked by live stems. Generated by scripts/15-fia-tree-mix.mjs — do not hand-edit; re-run it.',
    source: `USDA FIA ${wc} · ${where.name} (${where.state}${where.county}) · estimate ${LIVE_STEMS}: live trees ≥ 1 in d.b.h., forest land`,
    scene,
    fia: { evaluation: wc, county: `${where.state}${where.county}`, countyName: where.name, estimate: LIVE_STEMS, citation: d.citation,
      ranked: ranked.map(({ library, shape, ...r }) => ({ ...r, stems: Math.round(r.stems), sePct: +r.sePct.toFixed(1), composed: library })) },
    commonWeights, shapeByCommon, commonToLibrary,
    _unmapped_is_deliberate: 'Only COMPOSED species are routed. Every other species stays in commonWeights and reads red in the Grove, ranked — the work item.',
    palette: mapped.map(r => ({ libraryId: r.library[0], share: +(r.share / (mappedShare || 1)).toFixed(4) })),
  }
  if (process.argv.includes('--dry-run')) {
    let prev = null
    try { prev = JSON.parse(readFileSync(path.join(dir, 'tree-mix.json'), 'utf8')) } catch { /* no current mix */ }
    const was = prev?.commonWeights || {}, wasTotal = Object.values(was).reduce((a, b) => a + b, 0) || 1
    const nowTotal = Object.values(commonWeights).reduce((a, b) => a + b, 0) || 1
    console.log(`[fia-mix] DRY RUN — ${scene}: current mix "${prev?.source ?? 'none'}" → FIA ${wc} ${where.name}`)
    const names = [...new Set([...Object.keys(commonWeights), ...Object.keys(was)])]
      .sort((a, b) => (commonWeights[b] || 0) - (commonWeights[a] || 0) || (was[b] || 0) - (was[a] || 0))
    for (const n of names) {
      const a = 100 * (was[n] || 0) / wasTotal, b = 100 * (commonWeights[n] || 0) / nowTotal
      const tag = !was[n] ? 'NEW ' : !commonWeights[n] ? 'GONE' : '    '
      console.log(`  ${tag} ${n.padEnd(26)} ${a.toFixed(1).padStart(5)}% → ${b.toFixed(1).padStart(5)}%   routed: ${(prev?.commonToLibrary?.[n] ?? '—').toString().padEnd(22)} → ${commonToLibrary[n] ?? '—'}`)
    }
    return
  }
  writeFileSync(path.join(dir, 'tree-mix.json'), JSON.stringify(mix, null, 2))
  writeFileSync(path.join(dir, 'tree-species-map.json'), JSON.stringify({
    _what_this_is: 'DERIVED FROM tree-mix.json#commonToLibrary by scripts/15-fia-tree-mix.mjs — do not hand-edit.',
    map: Object.fromEntries(Object.entries(commonToLibrary).map(([k, v]) => [k, [v]])),
  }, null, 2))
  console.log(`[fia-mix] ${scene}: ${where.name} · FIA ${wc} · ${ranked.length} species · ${mapped.length} composed`)
  ranked.forEach((r, i) => console.log(`  ${String(i + 1).padStart(2)} ${r.common.padEnd(24)} ${(100 * r.share).toFixed(1).padStart(5)}%  plots ${String(r.plots).padStart(2)}  SE ${r.sePct.toFixed(0).padStart(3)}%  ${r.library.length ? '✅ ' + r.library.join(',') : '— not composed'}`))
}

main().catch(e => { console.error(e.message || e); process.exit(1) })
