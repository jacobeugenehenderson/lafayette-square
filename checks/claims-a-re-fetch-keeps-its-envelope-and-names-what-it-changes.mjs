// claims-a-re-fetch-keeps-its-envelope-and-names-what-it-changes.mjs — A RE-FETCHED raw/osm.json, BEFORE IT REPLACES THE
// TOWN'S: SAME ENVELOPE, NOTHING THE OLD FETCH CARRIED SILENTLY GONE, AND EVERY CHANGE COUNTED.
//
// ⭐ THE GATES (`EXTENT-DESIGN §3.4`, Jacob 2026-10-21: "a re-fetch is routine when it is GATED"): gate 1 (same envelope)
//   and gate 2 (the raw diff). Gates 3 and 4 are their own checks (authoring parity, building ids).
//   ⛔ RED, loudly, naming what moved:
//     · the new file's `bbox` is not the town's `geography.json` bbox (the frame the town was poured in);
//     · a CLASS the old fetch carried comes back empty or absent — a ground category, the buildings, a top-level key
//       (`pois`, …). That is what a half-failed fetch looks like: Overpass refusing the second request (a 502) after
//       the first succeeded leaves a plausible-looking file with no buildings (measured on LS, 2026-10-20). A class the
//       town genuinely lost in OSM is a real change too, and a human says so before it ships.
//   ⭐ Everything else is a DISCLOSURE, never a verdict: per category ways added / gone (by OSM id), highway ways gone
//     (by class) and added, kept highway ways whose geometry or tags changed, what the old fetch NEVER carried (new
//     categories, new top-level keys such as `pois`, relation rings), POI counts by the tags the kit reads
//     (kerb, turning_circle, crossing, traffic_signals), buildings and nodes. OSM changes; the gate's job is to make the
//     change visible, not to forbid it.
// ⛔ Reads, never restates: the envelope from `geography.json`; the classes from the two files themselves.
//
//   node checks/claims-a-re-fetch-keeps-its-envelope-and-names-what-it-changes.mjs --scene=<town> --after=<new osm.json>
//        [--before=<osm.json>] [--geography=<geography.json>] [--selftest]
//   --after is the re-fetched file, written somewhere that is NOT the town's raw/ (a scratch copy of fetch.js).
// @args --after=<path>   (unbounded: npm test cannot supply a re-fetch, so it is BLOCKED by this declaration, counted — tier.mjs)
// Exit 1: a gate fails, or an input is missing.
// ⭐ MUTATION TEST (`--selftest`, in memory, the town's own raw against itself): identity → GREEN; the bbox shifted →
//   RED; the buildings emptied → RED; one ground category removed → RED; `pois` dropped from a file that had them → RED;
//   a highway way deleted and one added → GREEN, and both are counted.
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const ROOT = new URL('..', import.meta.url).pathname
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const SELFTEST = process.argv.includes('--selftest')
const scene = arg('scene')
if (!scene) { console.error('⛔ --scene=<town> is required'); process.exit(1) }
const dir = join(ROOT, 'cartograph/data', scene)
const paths = { before: arg('before') || join(dir, 'raw/osm.json'), after: arg('after'), geography: arg('geography') || join(dir, 'geography.json') }
for (const k of ['before', 'geography', ...(SELFTEST ? [] : ['after'])])
  if (!paths[k] || !existsSync(paths[k])) { console.error(`⛔ ${scene}: no ${k} at ${paths[k] ?? '(not given: --' + k + '=)'}`); process.exit(1) }
const readJSON = (p) => JSON.parse(readFileSync(p, 'utf8'))
const geo = readJSON(paths.geography)
if (!geo.bbox) { console.error(`⛔ ${scene}: ${paths.geography} carries no bbox — the envelope cannot be judged`); process.exit(1) }

const BBOX_KEYS = ['minLat', 'maxLat', 'minLon', 'maxLon']
const sameBbox = (a, b) => !!a && !!b && BBOX_KEYS.every(k => a[k] === b[k])
const idsOf = (arr) => new Set((arr || []).map(f => String(f.osmId ?? f.id)))
const tagHits = (pois, test) => (pois || []).filter(p => Object.entries(p.tags || {}).some(([k, v]) => test(k, v))).length

function judge(o, n) {
  const fail = [], say = []
  // gate 1 — the envelope
  if (!sameBbox(n.bbox, geo.bbox)) fail.push(`ENVELOPE: the new bbox ${JSON.stringify(n.bbox)} is not geography.json's ${JSON.stringify(geo.bbox)}`)
  if (!sameBbox(o.bbox, geo.bbox)) say.push(`⚠️ the OLD file's bbox is not geography.json's either (${JSON.stringify(o.bbox)})`)
  // gate 2 — nothing the old fetch carried silently gone
  for (const k of Object.keys(o)) if (!(k in n)) fail.push(`a top-level key the old fetch carried is ABSENT: \`${k}\``)
  for (const k of ['pois', 'buildings']) if (Array.isArray(o[k]) && o[k].length && !(Array.isArray(n[k]) && n[k].length)) fail.push(`\`${k}\`: ${o[k].length} before, ${Array.isArray(n[k]) ? 0 : 'absent'} after`)
  for (const [c, a] of Object.entries(o.ground || {})) if (a?.length && !(n.ground?.[c]?.length)) fail.push(`ground.${c}: ${a.length} before, ${n.ground?.[c]?.length ?? 'absent'} after`)
  // the diff, disclosed
  const cats = [...new Set([...Object.keys(o.ground || {}), ...Object.keys(n.ground || {})])].sort()
  const rows = cats.map(c => { const A = idsOf(o.ground?.[c]), B = idsOf(n.ground?.[c]), add = [...B].filter(x => !A.has(x)).length, gone = [...A].filter(x => !B.has(x)).length
    return `${c} ${A.size}→${B.size}${A.size ? '' : ' (NEW — the old fetch never carried it)'} (+${add} −${gone})` })
  say.push(`ground by category: ${rows.join(' · ')}`)
  const H0 = new Map((o.ground?.highway || []).map(f => [String(f.osmId), f])), H1 = new Map((n.ground?.highway || []).map(f => [String(f.osmId), f]))
  const byHw = (L) => Object.entries(L.reduce((m, f) => (m[f.tags?.highway || '?'] = (m[f.tags?.highway || '?'] || 0) + 1, m), {})).map(([k, v]) => `${k} ${v}`).join(' · ')
  const gone = [...H0.keys()].filter(k => !H1.has(k)).map(k => H0.get(k)), added = [...H1.keys()].filter(k => !H0.has(k)).map(k => H1.get(k))
  let geom = 0, tags = 0
  for (const [k, f] of H1) { const g = H0.get(k); if (!g) continue
    if (JSON.stringify((g.coords || []).map(p => [p.lon, p.lat])) !== JSON.stringify((f.coords || []).map(p => [p.lon, p.lat]))) geom++
    if (JSON.stringify(g.tags) !== JSON.stringify(f.tags)) tags++ }
  say.push(`highway ways: gone ${gone.length}${gone.length ? ` (${byHw(gone)})` : ''} · added ${added.length}${added.length ? ` (${byHw(added)})` : ''} · kept ${H1.size - added.length}, of which geometry changed ${geom}, tags changed ${tags}`)
  const newKeys = Object.keys(n).filter(k => !(k in o))
  if (newKeys.length) say.push(`top-level keys the old fetch NEVER carried: ${newKeys.map(k => `\`${k}\`${Array.isArray(n[k]) ? ` (${n[k].length})` : ''}`).join(' · ')}`)
  const rel = (x) => Object.values(x.ground || {}).flat().filter(f => f?.osmType === 'relation' || f?.holes).length
  say.push(`relation rings: ${rel(o)} → ${rel(n)}`)
  if (n.pois) say.push(`pois ${o.pois?.length ?? 'absent'} → ${n.pois.length} · kerb ${tagHits(n.pois, (k) => k === 'kerb')} · turning_circle ${tagHits(n.pois, (k, v) => k === 'highway' && v === 'turning_circle')} · crossing ${tagHits(n.pois, (k, v) => k === 'highway' && v === 'crossing')} · traffic_signals ${tagHits(n.pois, (k, v) => k === 'highway' && v === 'traffic_signals')}`)
  say.push(`buildings ${o.buildings?.length ?? 'absent'} → ${n.buildings?.length ?? 'absent'} · nodeCount ${o.nodeCount ?? '—'} → ${n.nodeCount ?? '—'}`)
  return { fail, say, gone: gone.length, added: added.length }
}

const before = readJSON(paths.before)

if (SELFTEST) {
  const c = () => structuredClone(before)
  const H = before.ground?.highway || [], cat = Object.entries(before.ground || {}).find(([k, a]) => k !== 'highway' && a?.length)?.[0]
  const cases = [
    ['identity (the raw against itself)', c, false],
    ['the bbox shifted', () => { const x = c(); x.bbox = { ...x.bbox, minLat: x.bbox.minLat + 0.001 }; return x }, true],
    ['the buildings emptied (a half-failed fetch)', () => { const x = c(); x.buildings = []; return x }, true],
    [`ground.${cat} removed`, () => { const x = c(); delete x.ground[cat]; return x }, true],
    ['a highway way deleted and one added (OSM changed)', () => { const x = c(); x.ground.highway = [...H.slice(1), { ...H[0], osmId: -1 }]; return x }, false, (r) => r.gone === 1 && r.added === 1],
    ...(Array.isArray(before.pois) && before.pois.length ? [['pois dropped', () => { const x = c(); delete x.pois; return x }, true]] : []),
  ]
  if (!cat || !H.length) { console.error(`⛔ ${scene}: the raw has no second ground category or no highways — the mutants have nothing to move`); process.exit(1) }
  let ok = true
  for (const [name, mk, wantRed, extra] of cases) { const r = judge(before, mk()), red = r.fail.length > 0, pass = red === wantRed && (!extra || extra(r))
    console.log(`  ${pass ? '✅' : '⛔'} ${name}: ${red ? 'RED' : 'GREEN'} (want ${wantRed ? 'RED' : 'GREEN'})${extra ? ` · counted gone ${r.gone} / added ${r.added}` : ''}${red ? ' — ' + r.fail[0].slice(0, 110) : ''}`)
    if (!pass) ok = false }
  if (!Array.isArray(before.pois) || !before.pois.length) console.log('  ⚪ this raw carries no pois: the pois-dropped row is not run, said')
  console.log(ok ? '\n✅ selftest: every planted loss is RED, a plain OSM change is GREEN and counted' : '\n⛔ selftest: the instrument missed a planted case')
  process.exit(ok ? 0 : 1)
}

const r = judge(before, readJSON(paths.after))
console.log(`${scene}: re-fetch gates 1–2 · before ${paths.before} · after ${paths.after}`)
for (const f of r.fail) console.log(`  ⛔ ${f}`)
for (const s of r.say) console.log(`  · ${s}`)
console.log(r.fail.length ? `\n⛔ ${r.fail.length} gate failure(s) — this fetch does not replace the town's raw as it stands` : `\n✅ same envelope; nothing the old fetch carried is gone — the changes above are OSM's, counted`)
process.exit(r.fail.length ? 1 : 0)
