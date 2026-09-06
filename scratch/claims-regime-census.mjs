#!/usr/bin/env node
// ⭐⭐⭐ THE REGIME CENSUS — every place TWO representations of the same thing coexist,
// and which one ships.
//
// Jacob, 2026-09-06: "I find it hard to believe we have so many 'regimes' layered in there
// (but 'disconnected') and none of them are causing trouble."  He is right, and the cost is
// not crashes — it is that MEASUREMENT BECOMES UNINTERPRETABLE. Nothing errors, the map
// renders, and you cannot tell whether it is correct. `SKELETON.md §0.1`, on the two
// partitions: "Both render. Neither can be seen to be wrong."
//
// ⛔ THIS READS THE ARTIFACTS AND THE SOURCE. It does not restate a doc, so it cannot go
// stale — but it also cannot see a regime nobody has named. Absence here is not proof.
//
// ▶ node scratch/claims-regime-census.mjs [scene]
import fs from 'fs'

const scene = process.argv[2] || 'lafayette-square'
const R = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null } }
const SRC = (p) => { try { return fs.readFileSync(p, 'utf8') } catch { return '' } }
const rib = R(scene === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${scene}/clean/ribbons.json`)
const sk  = R(`cartograph/data/${scene}/clean/skeleton.json`)
const shp = R(`public/baked/${scene}/shape.json`)
const ovl = R(`cartograph/data/${scene}/clean/overlay.json`)
const dsn = R(`public/looks/${scene}/design.json`)
const tg  = SRC('src/lib/tileGround.js')
const der = SRC('cartograph/derive.js')

if (!rib) { console.error(`⛔ no ribbons for '${scene}' — REFUSING rather than reporting an empty census.`); process.exit(2) }
const tiles = shp ? (shp.tiles || shp) : null
const n = (x) => (x == null ? '—' : String(x))
const rows = []
const R_ = (thing, a, b, ships, cost) => rows.push({ thing, a, b, ships, cost })

// ── A · the geometry of a street ────────────────────────────────────────────
const pts = rib.streets.reduce((s, x) => s + (x.points?.length || 0), 0)
const skp = (sk?.streets || []).reduce((s, x) => s + (x.points?.length || 0), 0)
const sp  = rib.streets.filter(x => x.strokePoints).length
R_('the geometry of a street',
   `ribbons points — ${rib.streets.length} chains / ${pts} pts`,
   `skeleton points — ${(sk?.streets || []).length} chains / ${skp} pts   (+ strokePoints on ${sp})`,
   'BOTH — the Designer draws ribbons; ① is built from skeleton',
   'the curb is a perfect offset of a line the operator cannot see')

// ── B · the partition of the map into blocks ────────────────────────────────
const holes = (rib.protopolygon?.rings || []).filter(r => {
  let a = 0; for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; a += x1 * y2 - x2 * y1 }
  return a / 2 < 0
}).length
R_('the partition into blocks',
   `face walk — ${(rib.tiles || []).length} tiles / ${(rib.faces || []).length} faces`,
   `① holes — ${holes} (of ${(rib.protopolygon?.rings || []).length} rings)`,
   'FACE WALK',
   'every probe comparing them measured the divergence, not a defect in either')

// ── C · the producer of the curb ────────────────────────────────────────────
if (tiles) {
  const by = {}; for (const t of tiles) by[t.producer || '(unstamped)'] = (by[t.producer || '(unstamped)'] || 0) + 1
  R_('the producer of the curb',
     `offset — ${by.offset || 0}`, `carve — ${by.carve || 0}` + (by['(unstamped)'] ? ` · unstamped ${by['(unstamped)']}` : ''),
     'BOTH, per block, stamped',
     'legitimate — but "the curb is a concentric offset" describes most blocks, not the map')
}

// ── D · the tile OBJECT ─────────────────────────────────────────────────────
// ⛔ Brace-match the push rather than regexing a fixed window: the object spans ~7 lines and
// contains a NESTED `bands: {curb, treelawn, sidewalk, lu}`, so a naive window either truncates
// (→ 0 fields, which is what the first run printed) or counts the nested keys as tile fields.
// Take only TOP-LEVEL keys, at depth 1.
const pIdx = tg.indexOf('protoShapeTiles.push({')
let protoFields = []
if (pIdx >= 0) {
  let d = 0, end = pIdx
  for (let i = tg.indexOf('{', pIdx); i < tg.length; i++) {
    if (tg[i] === '{') d++; else if (tg[i] === '}') { d--; if (!d) { end = i; break } }
  }
  // ⛔ STRIP COMMENTS FIRST. The push site carries `// ⭐ the FILL, already painted` between two
  // fields, and a bare identifier scan reads "FILL" as a sixth key — printing 6 where there are 5.
  // Third correction to this one parser in one sitting (0 → 4 → 6 → 5), each a good count of the
  // wrong thing. That is the census's own subject, committed by the census.
  const body = tg.slice(tg.indexOf('{', pIdx) + 1, end).replace(/\/\/[^\n]*/g, '')
  let depth = 0
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '{') depth++
    else if (body[i] === '}') depth--
    else if (depth === 0) {
      // ⛔ SHORTHAND COUNTS. `{ ring, iA: … }` — `ring` has no colon, and requiring one dropped
      // it, printing 4 where there are 5. A field list that silently omits shorthand is the same
      // class of error as sampling one tile: a good count of the wrong thing.
      const m = /^(\w+)\s*[:,}]/.exec(body.slice(i)) || /^(\w+)\s*$/.exec(body.slice(i))
      if (m && (i === 0 || /[,\s]/.test(body[i - 1]))) { protoFields.push(m[1]); i += m[1].length - 1 }
    }
  }
}
let req = '—', opt = '—'
if (tiles) {
  const u = new Set(); for (const t of tiles) Object.keys(t).forEach(k => u.add(k))
  req = [...u].filter(k => tiles.every(t => k in t)).length
  opt = u.size - req
}
R_('the tile OBJECT',
   `frozen _shapeArtifact — ${req} required + ${opt} optional keys`,
   `protoShapeTiles — ${protoFields.length} (${protoFields.join(', ')}) · tilesFromProto — {ring, edges}`,
   'FROZEN _shapeArtifact',
   'three tile shapes; saying "the proto tile" without saying which produced two wrong counts')

// ── E · who paints the FILL ─────────────────────────────────────────────────
R_('who paints the pavement',
   'sectionPassTile — the per-RUN painter, strokes inward from the frozen curb',
   'protoShapeTiles.bands — ③ already painted, "not `runs` for something else to re-stroke"',
   'sectionPassTile',
   'a change of MODEL, not a missing field — the 11 unsupplied are not all a to-do list')

// ── F · where a corner comes from ───────────────────────────────────────────
const nCross = (rib.protopolygon?.crossings || []).reduce((s, r) => s + r.filter(Boolean).length, 0)
const nFill = tiles ? tiles.reduce((s, t) => s + (t.fillets?.length || 0), 0) : null
R_('where a corner comes from',
   `filletRing — ${n(nFill)} frozen fillets, an ANGLE computed at construction`,
   `① crossings — ${nCross}, an IDENTITY read off the shape`,
   'filletRing',
   'the code names its own retirement here: filletRing, bandJoin, miterLimit clamp, cornerAt/capAt')

// ── G · what closes a dead end ──────────────────────────────────────────────
if (tiles) {
  const caps = tiles.reduce((s, t) => s + (t.cap ? 1 : 0), 0)
  const mou = tiles.filter(t => t.mouths?.length).length
  const rt = tiles.reduce((s, t) => s + (t.roundTips?.length || 0), 0)
  const bt = tiles.reduce((s, t) => s + (t.bluntTips?.length || 0), 0)
  R_('what closes a dead end',
     `FILL patches — mouths on ${mou} blocks · roundTips ${rt} · bluntTips ${bt} · cap on ${caps}`,
     '① — the spur closes into a real notch, by construction',
     'THE FILL PATCHES',
     '⛔ these repaint over a zero-width slit the face walk cannot close — a patch registry read as a feature')
}

// ── H · what bounds the map ─────────────────────────────────────────────────
// ⛔ The boundary edges live in `ribbons.tiles[].edges`, NOT in shape.json's `runs` — the first
// run of this census looked in the artifact, found none, and printed "0 blocks" against a doc
// that says 31. Both were right: the rim edge exists in the frozen TOPOLOGY and is filtered out
// of the frozen SHAPE. That gap is itself a finding — see the ⚠ line.
const bTiles = (rib.tiles || []).filter(t => (t.edges || []).some(e => e.skelId === '__boundary__')).length
const bEdges = (rib.tiles || []).reduce((s2, t) => s2 + (t.edges || []).filter(e => e.skelId === '__boundary__').length, 0)
const shapeHasB = tiles ? tiles.some(t => (t.runs || []).some(r => r.skelId === '__boundary__')) : null
R_('what bounds the map',
   `__boundary__ filler edges injected into the face walk — ${bTiles} of ${(rib.tiles || []).length} blocks, ${bEdges} edges`,
   '① unions the ROADS ONLY — takes no boundary, so the perimeter does not close',
   'THE FILLER EDGES',
   `the ruling says blocks = boundary − stroked roads; the code does not (ASPIRATION). ⛔ AND the rim edge is in the frozen TOPOLOGY but ${shapeHasB ? 'also in' : 'ABSENT FROM'} the frozen SHAPE's runs — the rim is an edge of the drawing upstream and invisible downstream`)

// ── I · where authoring lives ───────────────────────────────────────────────
R_('where authoring lives',
   `overlay.json — street-keyed measures/caps/anchors, ${Object.keys(ovl?.streets || {}).length} entries — prebake DOES read this`,
   `design.json blockCustoms — per-edge SHAPE, ${Object.keys(dsn?.blockCustoms || {}).length} streets — prebake does NOT read this`,
   'BOTH, at different stages',
   'the true statement is narrow; "prebake is authoring-blind" is the overgeneralisation that mis-scoped a design question')

// ── J · which render path draws the map ─────────────────────────────────────
const gate = /const sectionFrozen = ([^\n]+)/.exec(SRC('src/cartograph/BlockGeometryV2Debug.jsx'))?.[1] || '(not found)'
R_('which path draws the map',
   'live buildTileGround — in Survey',
   `frozen shape.json — everywhere else.  gate: ${gate.trim()}`,
   'BOTH, split by WHICH TOOL IS SELECTED',
   '⛔ not "when idle" — a doc said so for months and an agent acted on it')

// ── THE EXCISION LEDGER ─────────────────────────────────────────────────────
// ⛔ A FLAG IN A COMMENT IS THE DEBT PATTERN, NOT THE CURE. "// TODO: remove when ① lands"
// rots into exactly the corpse-lie this repo excises — it outlives its condition, nobody
// re-reads it, and it is shorter than the truth so it gets believed. So the flag is HERE,
// executable, and it MEASURES its own size on every run rather than quoting one.
//
// ⛔ THESE ARE CANDIDATES, NOT A DELETION LIST. Which lines actually die is decided by the
// produce-or-refuse call on the artifact contract — a DESIGN question for Jacob, not a count.
// The envelope below is the most that could go, never a promise that it will.
const EXCISE = [
  ['filletRing',         'CORNER', '① carries crossings — a corner is read, not computed'],
  ['filletRings',        'CORNER', 'wrapper for the above'],
  ['sharpCornerIndices', 'CORNER', 'finds corners by ANGLE; ① knows them by identity'],
  ['arcSectorPoly',      'CORNER', 'the bent sector, built off a computed fillet'],
  ['openRound',          'CORNER', ''],
  ['capArc',             'DEADEND','draws a cap over a spur ① closes into a notch'],
  ['circlePoly',         'DEADEND','"only a dead-end-cap helper" — its own comment'],
  ['fitLoopCircle',      'DEADEND',''],
  ['detectTileCaps',     'DEADEND','⭐ a SLIT DETECTOR wearing a cap detector\'s name — the registry of places the freeze failed to close a polygon'],
  ['extractFaces',       'PARTITION','the face walk ① replaces; cannot close a degree-1 spur'],
  ['tilesFromProto',     'DEADCODE','⚠️ called by NOTHING in src/ — one scratch probe only. Excisable TODAY, ①-independent.'],
]
const spanOf = (name) => {
  const L = tg.split('\n')
  const i = L.findIndex(l => new RegExp('^(export )?(function|const) ' + name + '\\b').test(l))
  if (i < 0) return null
  let d = 0, started = false, e = i
  for (let k = i; k < L.length; k++) {
    for (const c of L[k]) { if (c === '{') { d++; started = true } else if (c === '}') d-- }
    if (started && d <= 0) { e = k; break }
  }
  return { from: i + 1, to: e + 1, lines: e - i + 1 }
}
const mouthLines = (tg.match(/^.*\b(mouths|_mouthProbe|deadEndMouth\w*)\b.*$/gm) || []).length
const TOTAL = tg.split('\n').length

// ── print ───────────────────────────────────────────────────────────────────
console.log(`\nREGIME CENSUS — ${scene}\n${'='.repeat(78)}`)
for (const r of rows) {
  console.log(`\n▸ ${r.thing.toUpperCase()}`)
  console.log(`    A   ${r.a}`)
  console.log(`    B   ${r.b}`)
  console.log(`    ⇒   SHIPS: ${r.ships}`)
  console.log(`    ⚠   ${r.cost}`)
}
console.log(`\n${'='.repeat(78)}`)
console.log(`${rows.length} places where two representations of the same thing coexist.`)
console.log(`⛔ Absence from this list is NOT proof — it can only see regimes someone has named.`)

console.log(`\n\nEXCISION LEDGER — the measured envelope, in src/lib/tileGround.js`)
console.log('='.repeat(78))
let sum = 0, missing = []
for (const [name, klass, why] of EXCISE) {
  const sp2 = spanOf(name)
  if (!sp2) { missing.push(name); continue }
  sum += sp2.lines
  console.log(`${String(sp2.lines).padStart(5)}  ${klass.padEnd(9)} ${name.padEnd(20)} ${sp2.from}-${sp2.to}`)
  if (why) console.log(`${' '.repeat(7)}${why}`)
}
console.log(`${String(mouthLines).padStart(5)}  DEADEND   (mouth machinery, by line match — not a function span)`)
console.log('-'.repeat(78))
console.log(`${String(sum + mouthLines).padStart(5)}  candidate lines of ${TOTAL} in the file  (${((sum + mouthLines) / TOTAL * 100).toFixed(1)}%)`)
if (missing.length) console.log(`⛔ ${missing.length} candidate(s) NOT FOUND — renamed or already gone: ${missing.join(', ')}. Fix this list, do not ignore it.`)
console.log(`\n⛔ CANDIDATES, NOT A DELETION LIST. What actually dies is decided by the produce-or-refuse`)
console.log(`   call on the artifact contract — a DESIGN question, not a count. And this envelope EXCLUDES`)
console.log(`   sectionPassTile (${spanOf('sectionPassTile')?.lines ?? '?'} lines), which is partly legitimate FILL and partly`)
console.log(`   compensation; splitting it is the design call, so counting it here would be dishonest.`)
console.log(`\n⭐ ONE ITEM IS EXCISABLE TODAY, ①-INDEPENDENT: tilesFromProto — called by nothing in src/.`)
