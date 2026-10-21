// codemap.mjs — THE SYMBOL MAP A PREMISE PASS STARTS FROM: each row a DOC claim beside the CODE fact it describes.
//
// ⭐ WHY (docs/agents/ZOB.md §7, owed; the Boz–Zob accord, 2026-10-21, (c′)): a doc and the code are each other's smell
//   detector. A premise read from prose alone was relayed tonight that the code had already built away (the float ②), and
//   neither seat caught it until the source was read. This map keeps the code fact BESIDE the doc claim, so a mismatch is
//   printed as one, and every row is pinned to its text so it cannot outlive what it describes.
// ⭐ READ, NEVER RESTATED: each row names its doc claim by an exact QUOTE in a named file and each code fact by an exact
//   SYMBOL text in a named file. On every run each quote and each symbol must occur EXACTLY ONCE where it is cited.
// ⛔ A ROW IS STALE, and this check is RED, when its quote or a symbol is gone or no longer unique: the doc was edited or the
//   code moved, and the row must be re-read and updated (or retired) in the same commit. A recorded verdict never survives
//   the text it was about.
// ⭐ THE VERDICT is the recorded reading, marked as ZOB.md §1 requires (measured / read in source / inferred), with the
//   probe or check that measured it. MISMATCH rows are PRINTED, never failed: they are known findings carried to Boz in
//   the four-line form (doc says · code says · cause · stakes, ZOB.md §3). An ASPIRATION goes to Jacob, always.
//
//   node checks/codemap.mjs [--row=<id>] [--selftest]
// Exit 1 on any stale row. ⭐ MUTATION TEST (`--selftest`, in memory): a quote edited away · a symbol renamed · a symbol
//   made non-unique → each row goes STALE (RED).
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './_scenes.mjs'

const TG = 'src/lib/tileGround.js', BG = 'cartograph/bake-ground.js'
export const ROWS = [
  { id: 'one-ring', topic: '② is ONE ring per tile, read by the bands and by the block',
    doc: { file: 'cartograph/SECTION.md', quote: 'Every strip boundary is a concentric offset of `iA`' },
    code: [{ file: TG, symbol: 'const iA = st.iaFull || []', note: 'sectionPassProtoTile strikes the bands from iaFull' },
           { file: TG, symbol: 'iA: intersectRings(t.iA, [t.ring])', note: 'buildTileGround re-derives iA (the face trim; the circle cut follows)' }],
    verdict: 'MISMATCH, aspiration: the bands read iaFull, the block (asphalt, inBlock, rekey) reads a re-derived iA. Measured: '
      + 'identical on 35 of 144 LS tiles; two lines for 4,202 m, all on rim tiles. Being built (Mitre): the circle\'s crossings into iaFull',
    probe: 'scratchpad ribbon/iafull.mjs (Zob, 2026-10-21); the build carries it into a check' },
  { id: 'one-line-per-depth', topic: 'a band boundary at one depth is ONE line, taken once',
    doc: { file: 'cartograph/RIBBONS.md', quote: 'The **concentric law** (the curb is *always* a concentric offset of the centerline)' },
    code: [{ file: TG, symbol: 'const LV_cw = insDL(', note: 'curb|ped' },
           { file: TG, symbol: 'const LV_wf = insDL(p => F.get(p).walkFromD), LV_wt = insDL(p => F.get(p).walkToD)', note: "the walk's two edges" },
           { file: TG, symbol: 'const LV_WB = insDL(', note: 'ped|land use' }],
    verdict: 'MISMATCH, aspiration: four independent offsetRingByRects runs; where the walk is outer, LV_cw and LV_wf are one line '
      + 'struck twice. Measured on LS: near-miss 615.7 m (curb|walk), 610.0 m (walk|land use); depths equal exactly, not float',
    probe: 'scratchpad ribbon/levels.mjs (Zob, 2026-10-21)' },
  { id: 'rekey-per-class', topic: 'a land-use class boundary is cut once',
    doc: null,
    code: [{ file: TG, symbol: 'const part = intersectRings(own, sp.regionsOf(lu))', note: 'rekeyByPiece: one boolean per class' }],
    verdict: 'NO CANON CLAIM. Read in source: each class part is its own boolean, so a boundary between two classes is computed '
      + 'once per class. Measured: land use|land use 1,842 m drawn twice on LS (the evidence grid below is a second cause)',
    probe: 'node checks/claims-no-edge-is-drawn-twice.mjs lafayette-square' },
  { id: 'material-unions', topic: 'the town-wide per-material unions',
    doc: null,
    code: [{ file: TG, symbol: 'for (const [f, name] of Object.entries(PAINTED)) out[name] = unionRings(acc[f])', note: 'sectionOpen' }],
    verdict: 'NO CANON CLAIM. Measured: they do not create doubled lines (town-wide 11,310 m vs per tile 11,978 m on LS)',
    probe: 'scratchpad ribbon/stage.mjs (Zob, 2026-10-21)' },
  { id: 'collinear', topic: 'partition booleans strip collinear vertices (Clipper PreserveCollinear false)',
    doc: null,
    code: [{ file: TG, symbol: 'function unionRings(rings) {', note: 'tileGround\'s boolean wrappers set no PreserveCollinear' }],
    verdict: 'NO CANON CLAIM. Measured: NOT a cause; keeping collinear vertices raised the doubling slightly (11,978 → 12,058 m, LS)',
    probe: 'scratchpad ribbon/stage.mjs collinear (Zob, 2026-10-21)' },
  { id: 'flatten-acc', topic: 'the flatten takes a lower group\'s edges from the union of the groups above',
    doc: null,
    code: [{ file: BG, symbol: 'export function flattenPaintStack(', note: '' },
           { file: BG, symbol: 'c.AddPaths(acc, _PolyType.ptClip, true)', note: 'layer − acc' }],
    verdict: 'NO CANON CLAIM. Read in source; NOT MEASURED as a cause (the ribbon brief\'s (iii))', probe: '—' },
  { id: 'one-grid', topic: 'the kit cuts on ONE grid, land use included (Jacob, 2026-10-17)',
    doc: { file: 'docs/briefs/BRIEF-the-stamp-lands-on-the-lattice.md', quote: "The kit cuts on `src/lib/lattice.js`'s 1 mm grid everywhere, the coast and the land use included." },
    code: [{ file: 'cartograph/derive.js', symbol: 'const SCALE = 100', note: 'layerLandEvidence cuts on 1 cm' }],
    verdict: 'MISMATCH, aspiration (ruled, unbuilt): every land-evidence vertex is on whole centimetres (measured: LS 32,491, HPDM '
      + '158,581); parcel corners 0–5 mm off OSM edges (HPDM 2,805, LS 900). The re-pour at SCALE 1000 is pending',
    probe: 'scratchpad grid/welds.mjs (Zob, 2026-10-21)' },
  { id: 'one-grid-instrument', topic: 'the lattice check is blind to the land-use grid',
    doc: { file: 'src/lib/lattice.js', quote: "// lattice.js — THE PARTITION'S GRID: ONE HOME. Every polygon of the ground (the ink, the curb, the bands, the land use," },
    code: [{ file: 'checks/claims-the-lattice-has-one-home.mjs', symbol: "derive's 1 cm", note: 'its header exempts a grid at another value' }],
    verdict: 'MISMATCH, instrument: lattice.js says the land use is cut on its grid; the check that guards it exempts derive\'s 1 cm '
      + 'by design (read in source). Narrowing it is part of building one-grid',
    probe: 'node checks/claims-the-lattice-has-one-home.mjs' },
]

const occurrences = (text, s) => { let n = 0, i = -1; while ((i = text.indexOf(s, i + 1)) >= 0) n++; return n }
/** Each row's quote and symbols, judged against `read(file)` (a file's text, or null). Returns [{ row, stale: [why…] }]. */
export function judge(rows, read) {
  return rows.map(row => {
    const stale = []
    const pin = (file, s, what) => { const t = read(file); if (t == null) { stale.push(`${what}: ${file} is gone`); return }
      const n = occurrences(t, s); if (n !== 1) stale.push(`${what} occurs ${n}× in ${file} (must be once): "${s.slice(0, 70)}"`) }
    if (row.doc) pin(row.doc.file, row.doc.quote, 'the doc quote')
    for (const c of row.code) pin(c.file, c.symbol, 'the code symbol')
    return { row, stale }
  })
}
const readRepo = (f) => { const p = join(ROOT, f); return existsSync(p) ? readFileSync(p, 'utf8') : null }

if (process.argv.includes('--selftest')) {
  const R = ROWS.find(r => r.doc && r.code.length > 1)
  const muts = [
    ['a doc quote edited away', (f) => (f === R.doc.file ? readRepo(f).replace(R.doc.quote, R.doc.quote.slice(0, -3)) : readRepo(f))],
    ['a code symbol renamed', (f) => (f === R.code[0].file ? readRepo(f).replace(R.code[0].symbol, 'X' + R.code[0].symbol.slice(1)) : readRepo(f))],   // its first character changed, so the old text is gone
    ['a code symbol made non-unique', (f) => (f === R.code[1].file ? readRepo(f) + '\n' + R.code[1].symbol : readRepo(f))],
  ]
  const live = judge([R], readRepo)[0].stale.length === 0
  let bad = live ? 0 : 1
  if (!live) console.log(`  ⛔ the live row "${R.id}" is stale itself, so the mutants prove nothing`)
  for (const [what, read] of muts) { const red = judge([R], read)[0].stale.length > 0
    console.log(`  ${red ? '✅' : '⛔'} mutant · ${what}: ${red ? 'STALE (RED), as it must be' : 'still current — the map cannot see it'}`); if (!red) bad++ }
  process.exit(bad ? 1 : 0)
}

const only = process.argv.find(a => a.startsWith('--row='))?.slice(6)
const res = judge(only ? ROWS.filter(r => r.id === only) : ROWS, readRepo)
let staleN = 0
for (const { row, stale } of res) {
  const mark = stale.length ? '⛔ STALE' : row.verdict.startsWith('MISMATCH') ? '≠' : '·'
  console.log(`\n${mark}  [${row.id}] ${row.topic}`)
  console.log(`   DOC   ${row.doc ? `${row.doc.file}: "${row.doc.quote.slice(0, 110)}"` : '— (no canon claim)'}`)
  for (const c of row.code) console.log(`   CODE  ${c.file}: \`${c.symbol.slice(0, 90)}\`${c.note ? ` — ${c.note}` : ''}`)
  console.log(`   ⇒     ${row.verdict}`)
  console.log(`   ▶     ${row.probe}`)
  for (const s of stale) console.log(`   ⛔    ${s}`)
  if (stale.length) staleN++
}
const mism = res.filter(r => !r.stale.length && r.row.verdict.startsWith('MISMATCH')).length
console.log(staleN ? `\n⛔ ${staleN} stale row(s): re-read the doc and the code, and update or retire each` : `\n✅ ${res.length} row(s) current · ${mism} recorded mismatch(es) printed above`)
process.exit(staleN ? 1 : 0)
