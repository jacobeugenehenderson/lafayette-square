/**
 * dossier-harvest.mjs — PILOT harvest of RAW SOURCE VALUES for the first 20 species.
 *
 * ⛔ THIS SCRIPT NEVER MAPS A VALUE INTO A RUBRIC TOKEN. It emits, per line:
 *      { species, source, field, value, ... }
 *    where `field` is the SOURCE's own field name and `value` is the SOURCE's own string.
 *    `arborist/vocabulary.mjs` decides what (if anything) each resolves to. See
 *    BRIEF-dossier-hydration.md §0.
 *
 * Sources: ncsu (Plant Toolbox record HTML) · selectree (Cal Poly JSON API) ·
 *          usda (PLANTS Services API) · utd (Urban Tree Database RDS-2016-0005).
 * ⛔ Oregon State is NOT fetched (robots: ClaudeBot Disallow /). Morton/MOBOT not fetched.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs'

// ⛔ writeFileSync TRUNCATES. Batch 2 must not destroy batch 1's 2,094 observations, and
// re-fetching 20 species we already have is needless load on sources that are doing us a
// favour. `--out` writes elsewhere; `--from <rank>` harvests only rows at or above a rank.
// Merge afterwards rather than re-running the world.
const argv = process.argv.slice(2)
const flag = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : null }
const OUT = flag('out') || 'scratch/dossier-raw-observations.jsonl'
const FROM = flag('from') ? Number(flag('from')) : null
const UTD = process.env.UTD_DIR || ''
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
const obs = []
const emit = (o) => obs.push(o)
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function get(url, { json = false } = {}) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: json ? 'application/json' : 'text/html' }, signal: AbortSignal.timeout(35000) })
      if (!r.ok) { if (r.status === 404) return null; throw new Error('HTTP ' + r.status) }
      return json ? await r.json() : await r.text()
    } catch (e) { if (a === 2) { console.error('  ! fetch failed', url, e.message); return null } await sleep(1200 * (a + 1)) }
  }
}

/**
 * THE ROWS. `species` is the coverage key verbatim (demand order).
 * `taxon` is the binomial actually queried; `taxonBasis` says WHERE that determination
 * came from, and `taxonAmbiguous` marks a roster name that is NOT a single taxon.
 * ⛔ Nothing here is inferred silently — an ambiguous row says so and is reported.
 */
const ROWS = [
  { rank:1,  species:'Maple, Red',           taxon:'Acer rubrum',            usda:'ACRU',  ncsu:'acer-rubrum',            taxonBasis:'arborist/species-map.json + arborist/references/acer_rubrum' },
  { rank:2,  species:'Oak, Pin',             taxon:'Quercus palustris',      usda:'QUPA2', ncsu:'quercus-palustris',      taxonBasis:'arborist/references/quercus_palustris' },
  { rank:3,  species:'Maple, Sugar',         taxon:'Acer saccharum',         usda:'ACSA3', ncsu:'acer-saccharum',         taxonBasis:'arborist/species-map.json + arborist/references/acer_saccharum' },
  { rank:4,  species:'redbud, Oklahoma',     taxon:'Cercis canadensis',      usda:'CECA4', ncsu:'cercis-canadensis',      taxonBasis:"arborist/references/cercis_canadensis; roster name names the 'Oklahoma' cultivar (C. canadensis var. texensis) - SPECIES-level record queried", taxonAmbiguous:'cultivar rolled up to species' },
  { rank:5,  species:'Ash, Green',           taxon:'Fraxinus pennsylvanica', usda:'FRPE',  ncsu:'fraxinus-pennsylvanica', taxonBasis:'arborist/references/fraxinus_pennsylvanica' },
  { rank:6,  species:'Linden, Littleleaf',   taxon:'Tilia cordata',          usda:'TICO2',  ncsu:'tilia-cordata',          taxonBasis:'unambiguous common name' },
  { rank:7,  species:'Pear, Callery',        taxon:'Pyrus calleryana',       usda:'PYCA80',ncsu:'pyrus-calleryana',       taxonBasis:'unambiguous common name' },
  { rank:8,  species:'Maple, Silver',        taxon:'Acer saccharinum',       usda:'ACSA2', ncsu:'acer-saccharinum',       taxonBasis:'arborist/references/acer_saccharinum' },
  { rank:9,  species:'Crabapple, Flowering', taxon:'Malus',                  usda:null,    ncsu:'malus',                  taxonBasis:"arborist/references/malus_prairifire is a CULTIVAR plate; the roster name is GENUS-level", taxonAmbiguous:'GENUS-level - no single taxon' },
  { rank:10, species:'honeylocust, thornless',taxon:'Gleditsia triacanthos', usda:'GLTR',  ncsu:'gleditsia-triacanthos',  taxonBasis:"arborist/species-map.json (gleditsia_triacanthos); 'thornless' = var. inermis", taxonAmbiguous:'variety rolled up to species' },
  { rank:11, species:'Maple, Freeman',       taxon:'Acer x freemanii',       usda:'ACFR',  ncsu:'acer-x-freemanii',       taxonBasis:'unambiguous common name (A. rubrum x A. saccharinum hybrid)', taxonAmbiguous:'HYBRID - cultivar-dependent' },
  { rank:12, species:'Sweetgum (undesirable)',taxon:'Liquidambar styraciflua',usda:'LIST2',ncsu:'liquidambar-styraciflua',taxonBasis:'arborist/references/liquidambar_styraciflua' },
  { rank:13, species:'Ginkgo',               taxon:'Ginkgo biloba',          usda:'GIBI2', ncsu:'ginkgo-biloba',          taxonBasis:'monotypic genus - unambiguous' },
  { rank:14, species:'oak, northern red',    taxon:'Quercus rubra',          usda:'QURU',  ncsu:'quercus-rubra',          taxonBasis:'unambiguous common name' },
  { rank:15, species:'Elm, Hybrid',          taxon:'Ulmus',                  usda:null,    ncsu:'ulmus-americana',        taxonBasis:"no single taxon; U. americana record queried as the nearest STAND-IN", taxonAmbiguous:'HYBRID CULTIVAR GROUP - no single taxon; stand-in queried' },
  { rank:16, species:'tuliptree',            taxon:'Liriodendron tulipifera',usda:'LITU',  ncsu:'liriodendron-tulipifera',taxonBasis:'unambiguous common name' },
  { rank:17, species:'Cypress, Bald',        taxon:'Taxodium distichum',     usda:'TADI2', ncsu:'taxodium-distichum',     taxonBasis:'arborist/references/taxodium_distichum' },
  { rank:18, species:'Birch',                taxon:'Betula nigra',           usda:'BENI',  ncsu:'betula-nigra',           taxonBasis:"arborist/references/betula_nigra (the repo's own plate); roster name is bare GENUS", taxonAmbiguous:'GENUS-level - no single taxon' },
  { rank:19, species:'Linden, American',     taxon:'Tilia americana',        usda:'TIAM',  ncsu:'tilia-americana',        taxonBasis:'arborist/species-map.json (tilia_americana)' },
  { rank:20, species:'Zelkova, Japanese',    taxon:'Zelkova serrata',        usda:null,  ncsu:'zelkova-serrata',        taxonBasis:'unambiguous common name' },

  // ── BATCH 2, 2026-08-25 (Rook). Next by demand, EXCLUDING four classes that a naive
  // "next 20" would have harvested and that are recorded here rather than silently dropped:
  //   `stump` (68 placements)          — not a species; a census artifact
  //   `honeylocust` (65)               — duplicate of rank 10, already held as Gleditsia triacanthos
  //   `Elm, Hybrid` (120) · `Elm, Frontier` (55) · `Cherry/Plum, spp.` (33)
  //                                    — genuinely ambiguous; a cultivar GROUP or a genus, not one taxon
  //   `Ginkgo 'Princeton Sentry'` (30) · `Serviceberry, Apple 'Autumn Brilliance'` (36)
  //                                    — cultivars; mint refuses cultivar records because their
  //                                      morphology is not the species' (the 'Armstrong' class)
  // ⚠️ USDA symbols below are BEST DETERMINATIONS, not verified facts. usda() checks the
  // returned ScientificName against `taxon` and SKIPS on mismatch, so a wrong symbol costs
  // us that source for that species and never yields a wrong value.
  { rank:21, species:'Maple, Norway',        taxon:'Acer platanoides',       usda:'ACPL',  ncsu:'acer-platanoides',       taxonBasis:'unambiguous common name' },
  { rank:22, species:'blackgum',             taxon:'Nyssa sylvatica',        usda:'NYSY',  ncsu:'nyssa-sylvatica',        taxonBasis:'unambiguous common name' },
  { rank:23, species:'sycamore, American',   taxon:'Platanus occidentalis',  usda:'PLOC',  ncsu:'platanus-occidentalis',  taxonBasis:'unambiguous common name' },
  { rank:24, species:'Hackberry',            taxon:'Celtis occidentalis',    usda:'CEOC',  ncsu:'celtis-occidentalis',    taxonBasis:'unambiguous common name (common hackberry)' },
  { rank:25, species:'mountainash, American',taxon:'Sorbus americana',       usda:'SOAM3', ncsu:'sorbus-americana',       taxonBasis:'unambiguous common name' },
  { rank:26, species:'serviceberry, downy',  taxon:'Amelanchier arborea',    usda:'AMAR3', ncsu:'amelanchier-arborea',    taxonBasis:'unambiguous common name' },
  { rank:27, species:'goldenraintree',       taxon:'Koelreuteria paniculata',usda:'KOPA',  ncsu:'koelreuteria-paniculata',taxonBasis:'unambiguous common name' },
  { rank:28, species:'Dogwood, Flowering',   taxon:'Cornus florida',         usda:'COFL2', ncsu:'cornus-florida',         taxonBasis:'unambiguous common name' },
  { rank:29, species:"Lilac, Japanese Tree 'Ivory Silk'", taxon:'Syringa reticulata', usda:'SYRE3', ncsu:'syringa-reticulata', taxonBasis:"roster name is the 'Ivory Silk' cultivar; SPECIES-level record queried", taxonAmbiguous:'cultivar rolled up to species' },
  { rank:30, species:'Pine, White',          taxon:'Pinus strobus',          usda:'PIST',  ncsu:'pinus-strobus',          taxonBasis:'unambiguous common name (eastern white pine)' },
  { rank:31, species:'oak, bur',             taxon:'Quercus macrocarpa',     usda:'QUMA2', ncsu:'quercus-macrocarpa',     taxonBasis:'unambiguous common name' },
  { rank:32, species:'Pine, Austrian',       taxon:'Pinus nigra',            usda:'PINI',  ncsu:'pinus-nigra',            taxonBasis:'unambiguous common name' },
  { rank:33, species:'Oak, Willow',          taxon:'Quercus phellos',        usda:'QUPH',  ncsu:'quercus-phellos',        taxonBasis:'unambiguous common name' },
  // ⭐ THE ORIENTATION AXIS'S FIRST REAL TEST. Juniperus is the genus where erect and
  // prostrate genuinely diverge, which is the argument that created chassis.orientation.
  { rank:34, species:'juniper, Chinese',     taxon:'Juniperus chinensis',    usda:'JUCH',  ncsu:'juniperus-chinensis',    taxonBasis:'unambiguous common name' },
]

// ── NC State Plant Toolbox ──────────────────────────────────────────────────
// Records are server-rendered HTML: <dt>Label:</dt> then 1..n <dd><span
// class="detail_display_attribute">Value</span></dd> until the next <dt>.
// Multi-valued fields emit one observation PER VALUE.
const NCSU_WANT = new Set([
  'Habit/Form','Growth Rate','Texture','Woody Plant Leaf Characteristics','Plant Type','Maintenance',
  'Leaf Color','Leaf Feel','Leaf Value To Gardener','Deciduous Leaf Fall Color','Leaf Type',
  'Leaf Arrangement','Leaf Shape','Leaf Margin','Hairs Present','Leaf Length','Leaf Width',
  'Bark Color','Surface/Attachment','Bark Plate Shape',
  'Stem Color','Stem Surface','Stem Form','Stem Cross Section','Stem Lenticels','Stem Is Aromatic',
  'Fruit Type','Fruit Color','Fruit Length','Fruit Width','Fruit Value To Gardener',
  'Flower Color','Flower Inflorescence','Flower Value To Gardener','Flower Bloom Time',
  'Design Feature','Landscape Location','Attracts','Resistance To Challenges','Problems',
])
const unent = (s) => s.replace(/&amp;/g,'&').replace(/&#39;|&apos;/g,"'").replace(/&quot;/g,'"')
  .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/&#x27;/g,"'").trim()

function parseNcsu(html) {
  const out = []
  // Slice into <dt>…</dt> segments, then pull every detail_display_attribute in the gap.
  const re = /<dt[^>]*>\s*([^<]{1,60}?):?\s*<\/dt>/g
  const marks = []
  let m
  while ((m = re.exec(html))) marks.push({ label: unent(m[1]), start: re.lastIndex, tagStart: m.index })
  for (let i = 0; i < marks.length; i++) {
    // ⛔ End the segment at the NEXT <dt> TAG. Subtracting a fixed margin from the
    // next label's end went negative for adjacent <dt>s and silently emptied the
    // segment — which is why Leaf Type / Leaf Length / Bark Plate Shape read as
    // "no source has this" when the record carried them all along.
    const end = i + 1 < marks.length ? marks[i + 1].tagStart : Math.min(html.length, marks[i].start + 4000)
    const seg = html.slice(marks[i].start, end)
    const vals = [...seg.matchAll(/class="detail_display_attribute"[^>]*>([\s\S]*?)<\/span>/g)]
      .map(x => unent(x[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '))).filter(Boolean)
    if (vals.length) out.push({ label: marks[i].label, values: [...new Set(vals)] })
  }
  // Dimensions is prose ("Height: 40 ft. 0 in. - 75 ft. 0 in.") — take it verbatim.
  const dim = html.match(/<dt[^>]*>\s*Dimensions:?\s*<\/dt>([\s\S]{0,600}?)<\/dl>/)
  if (dim) {
    const txt = unent(dim[1].replace(/<[^>]+>/g, '\n')).split('\n').map(s => s.trim()).filter(Boolean)
    for (const t of txt) if (/Height|Width/i.test(t)) out.push({ label: 'Dimensions', values: [t] })
  }
  return out
}

// ── SelecTree ───────────────────────────────────────────────────────────────
const SEL_WANT = ['tree_shape','bark_texture','bark_color','leaf_form','leaflet_shape','leaf_arrangement',
  'foliage_type','foliage_growth_color','foliage_fall_color','height_high','width_high','growth_rate_high',
  'fruit_type','fruit_size','flower_showiness','flower_color','litter_type','landscape_application','family']

async function selectree(row) {
  const q = encodeURIComponent(row.taxon)
  const s = await get(`https://selectree.calpoly.edu/api/tree/search-by-name-multiresult?region=&searchTerm=${q}&activePage=1&resultsPerPage=25&sort=`, { json: true })
  const res = s?.pageResults || []
  if (!res.length) { console.error('  ! selectree no hit', row.taxon); return }
  // ⛔ THE FIRST HIT IS OFTEN A CULTIVAR, and a cultivar changes the silhouette
  // (TRAIT-SURVEY §1.1: Acer rubrum 'Armstrong' is Columnar while the species is not).
  // Take the record whose accepted taxon has NO cultivar and matches what we asked for.
  const norm = (x) => String(x || '').replace(/&times;?/g, 'x').replace(/[×']/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
  const want = norm(row.taxon)
  const exact = res.find(r => !r.match_taxon?.cultivar && norm(r.accepted_scientific || r.name_concat) === want)
  const hit = exact || res.find(r => !r.match_taxon?.cultivar) || res[0]
  const cultivarFallback = !exact
  const d = await get(`https://selectree.calpoly.edu/api/tree/detail/${hit.tree_id}`, { json: true })
  const rec = Array.isArray(d) ? d[0] : (d?.tree || d)
  if (!rec) return
  const matched = rec.accepted_scientific || rec.primary_taxon?.name_concat || hit.accepted_scientific || hit.name_concat
  emit({ species: row.species, source: 'selectree', field: '_matched_taxon', value: String(matched ?? ''),
         note: `queried "${row.taxon}"; tree_id ${hit.tree_id}` + (cultivarFallback ? ' — ⚠️ NO species-level record matched; this is a CULTIVAR or near-match, traits may be cultivar-specific' : ''),
         ...(cultivarFallback ? { unverified: 'taxon match is not species-level exact' } : {}) })
  if (cultivarFallback) console.error(`      ! selectree fell back to non-exact taxon: ${matched}`)
  for (const f of SEL_WANT) {
    let v = rec[f]
    if (v == null || v === '') continue
    const arr = Array.isArray(v) ? v : [v]
    for (const one of arr) {
      const val = typeof one === 'object' ? (one.name ?? one.value ?? one.label ?? JSON.stringify(one)) : one
      if (val == null || val === '') continue
      emit({ species: row.species, source: 'selectree', field: f, value: String(val),
             ...(arr.length > 1 ? { multi: true } : {}) })
    }
  }
}

// ── USDA PLANTS ─────────────────────────────────────────────────────────────
const USDA_WANT = new Set(['Shape and Orientation','Growth Form','Foliage Color','Foliage Texture',
  'Foliage Porosity Summer','Foliage Porosity Winter','Fall Conspicuous','Leaf Retention','Growth Rate',
  'Height, Mature (feet)','Height at 20 Years, Maximum (feet)','Lifespan','Bloom Period','Flower Color',
  'Flower Conspicuous','Fruit/Seed Color','Fruit/Seed Conspicuous','Active Growth Period','Shade Tolerance'])

async function usda(row) {
  if (!row.usda) return
  const p = await get(`https://plantsservices.sc.egov.usda.gov/api/PlantProfile?symbol=${row.usda}`, { json: true })
  if (!p?.Id) { console.error('  ! usda no profile', row.usda); return }
  const got = String(p.ScientificName || '').replace(/<[^>]+>/g, '').trim()
  // ⛔ A PLANTS symbol is a guess until the returned NAME confirms it. TICO is
  // *Tiarella cordifolia*, not *Tilia cordata* — an unverified symbol silently
  // imports a herb's traits into a linden. Verify genus+epithet, or take nothing.
  const g = (x) => String(x).toLowerCase().replace(/[×x]\s*/g, '').split(/\s+/).filter(Boolean).slice(0, 2).join(' ')
  if (g(got) !== g(row.taxon)) {
    console.error(`  ! usda TAXON MISMATCH for ${row.species}: symbol ${row.usda} returned "${got}", wanted "${row.taxon}" — SKIPPED`)
    emit({ species: row.species, source: 'usda', field: '_taxon_mismatch', value: got,
           note: `symbol ${row.usda} resolved to the wrong taxon; no USDA values taken for this species`, unverified: 'symbol wrong' })
    return
  }
  emit({ species: row.species, source: 'usda', field: '_matched_taxon', value: got, note: `symbol ${row.usda}, id ${p.Id}` })
  const c = await get(`https://plantsservices.sc.egov.usda.gov/api/PlantCharacteristics/${p.Id}`, { json: true })
  if (!Array.isArray(c)) return
  for (const r of c) {
    if (r.CultivarName) continue                      // species-level only (survey §1.2)
    const name = r.PlantCharacteristicName, val = r.PlantCharacteristicValue
    if (!USDA_WANT.has(name) || val == null || val === '') continue
    emit({ species: row.species, source: 'usda', field: name, value: String(val) })
  }
}

// ── Urban Tree Database (local CSV, already downloaded) ─────────────────────
// ⚠️ THE ONE PLACE THIS SCRIPT AGGREGATES. TS3 is 14,487 individually measured trees;
// emitting them raw is not a dossier input. So: the MEDIAN per species, with n and the
// quartiles alongside, and the field name says exactly what the number is. No token, no mapping.
function utdRows() {
  const p = `${UTD}/Data/TS3_Raw_tree_data.csv`
  if (!UTD || !existsSync(p)) { console.error('  ! UTD csv not found at', p); return null }
  const lines = readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean)
  // ⛔ TS3 quotes fields containing commas ("Modesto, CA"). A naive split shifts
  // every column right by one and the species column reads back SpCodes.
  const csv = (line) => {
    const out = []; let cur = '', q = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++ } else q = !q }
      else if (ch === ',' && !q) { out.push(cur); cur = '' }
      else cur += ch
    }
    out.push(cur); return out
  }
  const hdr = csv(lines[0]).map(s => s.trim())
  // ⛔ indexOf RETURNS -1, AND -1 IS A SILENT FALLBACK. A renamed or misspelled
  // column would make `f[-1]` undefined, parseFloat NaN, and the field would simply
  // produce zero observations — which reads as "no source carries this" rather than
  // "this script is broken". That exact shape already cost a re-run here when a
  // naive CSV split shifted every column. Fail loudly instead.
  const ix = (n) => {
    const i = hdr.indexOf(n)
    if (i < 0) throw new Error(`TS3 column "${n}" not found. Header is: ${hdr.join(' | ')}`)
    return i
  }
  const cols = { sci: ix('ScientificName'), ht: ix('TreeHt (m)'), cb: ix('CrnBase'), ch: ix('CrnHt (m)'),
                 cd: ix('AvgCdia (m)'), shape: ix('Shape'), type: ix('TreeType'), dbh: ix('DBH (cm)'), age: ix('Age') }
  const byTaxon = new Map()
  for (let i = 1; i < lines.length; i++) {
    const f = csv(lines[i])
    const sci = (f[cols.sci] || '').trim()
    if (!sci) continue
    if (!byTaxon.has(sci)) byTaxon.set(sci, [])
    byTaxon.get(sci).push(f)
  }
  return { byTaxon, cols }
}
const med = (a) => { const s = a.slice().sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n-1)/2] : (s[n/2-1]+s[n/2])/2) : null }
const q = (a, p) => { const s = a.slice().sort((x,y)=>x-y); return s.length ? s[Math.min(s.length-1, Math.floor(p*s.length))] : null }
const r2 = (x) => x == null ? null : Math.round(x * 100) / 100

function utd(row, db) {
  if (!db) return
  // Match on genus+species prefix so cultivar rows ("Acer rubrum 'Red Sunset'") count.
  const want = row.taxon.toLowerCase().replace(/^(\w+)\s+x\s+/, '$1 ')
  const keys = [...db.byTaxon.keys()].filter(k => {
    const kl = k.toLowerCase()
    return kl === want || kl.startsWith(want + ' ') || (row.taxonAmbiguous?.startsWith('GENUS') && kl.startsWith(want.split(' ')[0] + ' '))
  })
  if (!keys.length) return
  const rows = keys.flatMap(k => db.byTaxon.get(k))
  // -1 is TS3's not-collected sentinel. A CrnBase of 0 (crown to the ground) is real,
  // so it is admitted; a height or diameter of 0 is not.
  const num = (f, c, allowZero = false) => { const v = parseFloat(f[c]); return Number.isFinite(v) && v !== -1 && (allowZero ? v >= 0 : v > 0) ? v : null }
  const ht = [], cb = [], ch = [], cd = [], ratio = [], shapes = [], types = []
  for (const f of rows) {
    const H = num(f, db.cols.ht), B = num(f, db.cols.cb, true), C = num(f, db.cols.ch), D = num(f, db.cols.cd)
    if (H) ht.push(H); if (B != null) cb.push(B); if (C) ch.push(C); if (D) cd.push(D)
    if (H && C && C <= H) ratio.push(C / H)
    const s = (f[db.cols.shape] || '').trim(); if (s && s !== '-1') shapes.push(s)
    const t = (f[db.cols.type] || '').trim(); if (t) types.push(t)
  }
  const base = { species: row.species, source: 'utd',
                 note: `RDS-2016-0005 TS3, ${rows.length} measured trees matching ${keys.join(' | ')}` }
  const put = (field, arr, unit) => { if (arr.length >= 5) emit({ ...base, field, value: r2(med(arr)), unit, n: arr.length,
                                       p25: r2(q(arr,0.25)), p75: r2(q(arr,0.75)), aggregated: 'median of raw TS3 rows' }) }
  put('TreeHt_median', ht, 'm')
  put('CrnBase_median', cb, 'm')          // crown base height above ground
  put('CrnHt_median', ch, 'm')            // vertical crown depth
  put('AvgCdia_median', cd, 'm')
  put('CrnHt_over_TreeHt_median', ratio, 'ratio')
  const mode = (a) => { const c = {}; for (const x of a) c[x] = (c[x]||0)+1; const e = Object.entries(c).sort((p,r)=>r[1]-p[1])[0]; return e ? { v: e[0], n: e[1] } : null }
  const ms = mode(shapes); if (ms) emit({ ...base, field: 'Shape', value: ms.v, n: ms.n, of: shapes.length,
    note: base.note + '; TS3 Shape code: 1 cylinder / 2 ellipsoid-spherical / 3 paraboloid / 4 inverted paraboloid (value 5 undefined in metadata)', aggregated: 'modal TS3 code' })
  const mt = mode(types); if (mt) emit({ ...base, field: 'TreeType', value: mt.v, n: mt.n, of: types.length,
    note: base.note + '; TS3 TreeType: BD/BE/CE/PE + S<8m M 8-15m L>15m', aggregated: 'modal TS3 code' })
}

// ── run ─────────────────────────────────────────────────────────────────────
const db = utdRows()
for (const row of ROWS.filter(r => FROM == null || r.rank >= FROM)) {
  console.error(`[${row.rank}/20] ${row.species}  (${row.taxon})`)
  emit({ species: row.species, source: 'harvest', field: '_taxon_queried', value: row.taxon,
         note: row.taxonBasis, ...(row.taxonAmbiguous ? { ambiguous: row.taxonAmbiguous } : {}) })
  const html = row.ncsu ? await get(`https://plants.ces.ncsu.edu/plants/${row.ncsu}/`) : null
  if (html) {
    const fields = parseNcsu(html)
    const got = fields.filter(f => NCSU_WANT.has(f.label) || f.label === 'Dimensions')
    for (const f of got) for (const v of f.values)
      emit({ species: row.species, source: 'ncsu', field: f.label, value: v, ...(f.values.length > 1 ? { multi: true } : {}) })
    console.error(`      ncsu ${got.length} fields`)
  } else console.error('      ncsu MISS')
  await selectree(row); await sleep(400)
  await usda(row);      await sleep(400)
  utd(row, db)
}
if (!obs.length) { console.error('⛔ no observations produced — refusing to write an empty file over anything'); process.exit(1) }
writeFileSync(OUT, obs.map(o => JSON.stringify(o)).join('\n') + '\n')
console.error(`\nwrote ${obs.length} observations -> ${OUT}`)
