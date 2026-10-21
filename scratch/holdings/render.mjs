// node render.mjs rows.json <codeWorktree> <mainRoot> > table.md — classification + tables + headline lists (data only).
import { readFileSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
const [rowsP, CODE, MAIN] = process.argv.slice(2)
const rows = JSON.parse(readFileSync(rowsP, 'utf8'))
// ── Inputs model: intake rows (paths + present() alternates, read from intake-rows.mjs) + sources.json-declared files
const ir = readFileSync(join(CODE, 'cartograph/intake-rows.mjs'), 'utf8')
const INTAKE = [...ir.matchAll(/id:\s*'([^']+)'[^]*?path:\s*'([^']+)'/g)].map(m => ({ id: m[1], path: m[2] }))
const ALT = { 'raw/elevation-sources.txt': 'elevation', 'clean/forest_park_trees.json': 'census-city' }
const stateFiles = {}   // well id → file, read from each state record
for (const st of ['mo', 'oh', 'ma', 'ny', 'ca']) { const p = join(CODE, `cartograph/states/${st}.mjs`); if (!existsSync(p)) continue
  const rec = (await import(p)).default
  const walk = (o) => { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (v && typeof v === 'object' && typeof v.file === 'string') stateFiles[k] = v.file; walk(v) } }
  walk(rec) }
const declaredFiles = (town) => { const p = join(MAIN, `cartograph/data/${town}/sources.json`); if (!existsSync(p)) return new Map()
  const j = JSON.parse(readFileSync(p, 'utf8')), out = new Map()
  const walk = (o, key) => { if (Array.isArray(o)) o.forEach(v => walk(v, key)); else if (o && typeof o === 'object') { if (o.id && stateFiles[o.id]) out.set(stateFiles[o.id], `sources.json ${key}:${o.id}`); if (o.file) out.set(o.file, `sources.json ${key}`); for (const [k, v] of Object.entries(o)) walk(v, k) } }
  walk(j, '')
  if (j.cropland) for (const c of j.cropland) out.set(`cdl-${c.year}.tif`, 'sources.json cropland')
  if (j.tide) { out.set('tide.json', 'sources.json tide'); out.set('water-datums.json', 'sources.json tide') }
  if (j.landUseCodes) out.set(basename(String(j.landUseCodes.file || j.landUseCodes)), 'sources.json landUseCodes')
  return out }
// ── licence: the register row (scratch/data-licences/REGISTER.md) matched by filename. Patterns are mine (method stated in the doc).
const LIC = [[/(^|\/)osm[._-]|osm_(kerbs|trees|street_lamps)|overpass/, 'R1 OSM'], [/msbf/, 'R2 MSBF'], [/overture/, 'R3 Overture'],
  [/stl_parcels/, 'R4 StL City parcels'], [/city_trees|park_trees|park_census|forest_park_trees/, 'R5 StL Forestry'],
  [/stlco_parcels|county-land-use-codes/, 'R6 StL County'], [/ma_parcels/, 'R7 MassGIS'], [/oh_parcels/, 'R8 OGRIP parcels'],
  [/oh_address_points/, 'R9 OGRIP LBRS'], [/nyc_parcels|pluto/i, 'R10 MapPLUTO'], [/nyc_/, 'R11 NYC Open Data'],
  [/elevation|(^|\/)terrain\.|dem/, 'R12 USGS 3DEP'], [/bathymetry|bluetopo|datum|tide/, 'R13 NOAA'], [/cdl-/, 'R14 USDA CDL'],
  [/canopy/, 'R15 NLCD canopy'], [/tree-mix/, 'R16 USFS FIA'], [/nr-inventory|lafayette-square-hd/, 'R24 NRHP nomination (HPDM row only)'],
  [/\/(photos|logos)\//, 'R22 photos'], [/\/trees\/\*\*$|\.glb$/, 'R21 models']]
const licOf = (p) => (LIC.find(([re]) => re.test(p)) || [null, null])[1]
// ── role
const AUTH_TOP = /^cartograph\/data\/[^/]+\/(geography|neighborhood|neighborhood_boundary|norms|deployment|town-id|jurisdiction|building-overrides|identity-registry|tree-species-map|authored_lamps|sources)\.json$/
const catOf = (r) => { const p = r.path
  if (/\/_cache\//.test(p)) return 'cache'
  if (/\.prebak|\.bak|backup-|pre-promote|~|\.tmp$|\.DS_Store| copy\./.test(p)) return 'backup'
  if (/^_handoffs\/|RETIRED\.md$|\.gitignore$|\.js$|README\.txt$|REGISTER\.md$|-NOVEL\.md$|HOST-WORKLIST/.test(p)) return 'doc/code'
  if (AUTH_TOP.test(p) || /\/raw\/(survey|centerlines|measurements)\.json$/.test(p) || /\/content\/(.*\.overrides\.json|profile\.json|ASSETS\.md)$/.test(p)) return 'authored'
  return 'external' }
const roleOf = (r) => { const p = r.path
  if (p.startsWith('public/baked/')) return 'output'
  if (/\/clean\//.test(p)) return 'derived'
  if (/\/content\/(roster|listings|listing-identity)\.json$/.test(p)) return 'derived'
  if (r.town === '(stray)') return 'stray'
  return 'input' }
const tier = (f) => f.startsWith('scripts/') ? 'legacy' : f.startsWith('checks/') ? 'check' : 'kit'
const fmtB = (b) => b > 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1e3).toFixed(0) + ' KB' : b + ' B'
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
for (const r of rows) {
  r.role = roleOf(r); r.cat = catOf(r); r.lic = licOf(r.path)
  const town = r.town, rel = r.path.replace(`cartograph/data/${town}/`, '')
  const irow = INTAKE.find(i => i.path === rel) || (ALT[rel] && { id: ALT[rel] })
  const dec = town !== '(stray)' ? declaredFiles(town).get(r.basename) : null
  r.inputs = irow ? `intake:${irow.id}` : dec || (rel === 'sources.json' ? 'intake:parcels' : null)
  const kit = r.readers.filter(f => !f.endsWith('(W)') && tier(f) === 'kit').length
  const legacy = r.readers.filter(f => !f.endsWith('(W)') && tier(f) === 'legacy').length
  r.readTier = kit ? 'kit' : legacy ? 'legacy only' : r.readers.filter(f => !f.endsWith('(W)')).length ? 'checks only' : r.readers.length ? 'written, never read' : 'none'
}
// duplicates by sha
const bySha = new Map(); for (const r of rows) if (r.sha && r.bytes > 0) { if (!bySha.has(r.sha)) bySha.set(r.sha, []); bySha.get(r.sha).push(r) }
const dups = [...bySha.values()].filter(g => g.length > 1)
const out = []
const towns = ['lafayette-square', 'hipointedemun', 'huron', 'provincetown', 'jacksonheights', 'altadena', '(stray)']
for (const t of towns) {
  const R = rows.filter(r => r.town === t)
  out.push(`\n### ${t} — ${R.length} rows, ${fmtB(R.reduce((s, r) => s + r.bytes, 0))}\n`)
  out.push('| path | kind | n | size | newest | git | what (sampled) | licence row | read by | Inputs model |')
  out.push('|---|---|---|---|---|---|---|---|---|---|')
  for (const r of R.sort((a, b) => a.path.localeCompare(b.path))) {
    const what = r.sample.kind + (r.sample.head ? ` · \`${esc(r.sample.head).slice(0, 90)}\`` : '') + (r.sample.keys ? ` · keys ${esc(r.sample.keys.join(',')).slice(0, 80)}` : '') + (r.sample.meta && Object.keys(r.sample.meta).length ? ` · ${esc(Object.entries(r.sample.meta).map(([k, v]) => k + '=' + v).join('; ')).slice(0, 120)}` : '')
    const rd = r.readTier === 'none' ? '**none**' : `${r.readTier}: ${r.readers.slice(0, 3).map(esc).join(', ')}${r.readerCount > 3 ? ` +${r.readerCount - 3}` : ''}`
    out.push(`| \`${esc(r.path.replace(/^cartograph\/data\/[^/]+\//, '').replace(/^public\/baked\/[^/]+\//, 'baked: '))}\` | ${r.role === 'input' || r.role === 'stray' ? r.cat : r.role} | ${r.n} | ${fmtB(r.bytes)} | ${r.mtime} | ${r.tracked === r.n ? 'tracked' : r.tracked ? `${r.tracked}/${r.n} tracked` : 'untracked'} | ${what} | ${r.lic || (r.cat === 'external' && (r.role === 'input' || r.role === 'stray') ? '**NONE**' : '—')} | ${rd} | ${r.inputs || (r.role === 'input' && r.cat === 'external' ? '**not known**' : '—')} |`)
  }
}
const L = (title, xs, f) => { out.push(`\n#### ${title} (${xs.length})\n`); for (const x of xs) out.push(`- ${f(x)}`) }
const town = r => r.town === '(stray)' ? '' : `${r.town}: `
const short = r => r.path.replace(/^cartograph\/data\/[^/]+\//, '').replace(/^public\/baked\/[^/]+\//, 'baked/')
const H = []
out.push('\n## HEADLINES (generated)')
L('COLLECTED-BUT-UNREAD: inputs and strays no kit code reads', rows.filter(r => (r.role === 'input' || r.role === 'stray') && r.cat === 'external' && r.readTier !== 'kit'), r => `${town(r)}\`${short(r)}\` (${fmtB(r.bytes)}) — ${r.readTier}${r.readers.length ? ': ' + r.readers.slice(0, 2).join(', ') : ''}`)
L('READ-BUT-UNDECLARED: inputs kit code reads that the Inputs model does not know', rows.filter(r => r.role === 'input' && r.cat === 'external' && r.readTier === 'kit' && !r.inputs), r => `${town(r)}\`${short(r)}\` — read by ${r.readers.filter(f => !f.endsWith('(W)')).slice(0, 2).join(', ')}`)
L('NO-LICENCE-ROW: inputs and strays with no register row matched', rows.filter(r => (r.role === 'input' || r.role === 'stray') && r.cat === 'external' && !r.lic), r => `${town(r)}\`${short(r)}\``)
L('AUTHORED / CONFIG inputs the Inputs model has no row for (context, not a defect by itself)', rows.filter(r => r.cat === 'authored' && !r.inputs), r => `${town(r)}\`${short(r)}\``)
L('BACKUPS AND STALE COPIES', rows.filter(r => r.cat === 'backup'), r => `${town(r)}\`${short(r)}\` (${fmtB(r.bytes)}, ${r.mtime})`)
L('DUPLICATES: byte-identical files in two or more places', dups, g => g.map(r => `\`${r.path}\``).join(' = ') + ` (${fmtB(g[0].bytes)})`)
console.log(out.join('\n'))
console.error(JSON.stringify({ intakeRows: INTAKE.length, stateWells: Object.keys(stateFiles).length, dups: dups.length }))
