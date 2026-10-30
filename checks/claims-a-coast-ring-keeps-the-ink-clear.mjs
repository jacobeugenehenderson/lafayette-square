#!/usr/bin/env node
// CLAIM — A COAST RING KEEPS THE INK CLEAR (Boz's ruling, 2026-10-27). ① strokes the coast at ε each side (the mint's INK_EPS), so
// two parts of a coast ring, or two rings, closer than the ink's width (2·INK_EPS) can only come out of the mint as ONE stroke:
// the land between is cut into two faces, and absorbInk refuses it far from its cause. PTown v3: settle walked the two banks of
// a channel the open/close had closed back to 1.92 mm (island, water ring 245), and bake-coast's verifier — whose `touch` was
// exact collinearity only — passed it. Now coastFile.mjs#ringViolations and #ringsMeet take the ink width (`clear`, passed in by
// bake-coast from the mint) and call two non-adjacent edges closer than it a 'near', refused by name.
//   (1) SOURCE: bake-coast hands both verifiers the mint's own 2·INK_EPS.
//   (2) PLANT: PTown v3's settled island (the neck at v14, 1.92 mm from edge 17) is a 'near' · the same island before the
//       open/close (925 mm clear) is clean.
//   (3) PLANT: two rings 3 mm apart meet as a 'near'; 30 mm apart they do not.
//   MUTANT (always run): the clearance removed (exact-only restored) → the settled island passes, RED.
//   (4) a FOLD at the lattice's resolution is a violation · (5) a folded DECK refuses by name in the take-out (each with its mutant)
//   node checks/claims-a-coast-ring-keeps-the-ink-clear.mjs
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { ROOT } from './_scenes.mjs'

let red = 0
const row = (ok, s) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${s}`) }
const { INK_EPS } = await import('../src/lib/tileGround.js'), W = 2 * INK_EPS

{ const bc = readFileSync(join(ROOT, 'cartograph/bake-coast.mjs'), 'utf8')
  const ok = /const inkW = 2 \* INK_EPS/.test(bc) && /ringViolations\(r, acuteAt, inkW\)/.test(bc) && /ringsMeet\(labels\.map\(l => l\.r\), inkW\)/.test(bc)
  row(ok, `(1) bake-coast hands ringViolations and ringsMeet the mint's ink width (2·INK_EPS = ${W} m): ${ok}`) }

// PTown v3 (ptown-failed5 era), water ring 245 as settled with the open/close ON, and water ring 240 as traced without it
const SETTLED = [[-3513.107,-1882.515],[-3514.29,-1879.602],[-3514.095,-1877.607],[-3514.977,-1876.907],[-3518.031,-1876.035],[-3519.598,-1877.607],[-3520.019,-1879.086],[-3524.526,-1877.607],[-3523.011,-1875.737],[-3519.306,-1875.609],[-3519.819,-1872.616],[-3518.985,-1871.344],[-3517.669,-1871.717],[-3517.949,-1869.618],[-3516.648,-1868.516],[-3518.851,-1867.092],[-3518.04,-1866.117],[-3516.147,-1866.613],[-3516.769,-1868.985],[-3514.596,-1869.615],[-3515.628,-1873.625],[-3512.948,-1874.604],[-3512.351,-1875.607],[-3513.745,-1876.607],[-3511.151,-1878.321],[-3510.334,-1879.604],[-3511.074,-1881.352]]
const BEFORE = [[-3513.404,-1881.607],[-3514.289,-1879.604],[-3514.095,-1877.607],[-3514.979,-1876.907],[-3518.031,-1876.035],[-3519.598,-1877.607],[-3520.019,-1879.086],[-3524.526,-1877.607],[-3523.011,-1875.737],[-3519.306,-1875.609],[-3519.819,-1872.616],[-3518.987,-1871.346],[-3517.669,-1871.718],[-3517.949,-1869.618],[-3517.022,-1868.693],[-3514.597,-1869.614],[-3515.628,-1873.625],[-3512.947,-1874.604],[-3512.35,-1875.609],[-3513.745,-1876.608],[-3511.151,-1878.321],[-3510.334,-1879.604],[-3511.074,-1881.352],[-3513.02,-1882.453]]
const sq = (x, z, s) => [[x, z], [x + s, z], [x + s, z + s], [x, z + s]]
const judge = (CF) => { const near = CF.ringViolations(SETTLED, null, W).filter(v => v.kind === 'near'), clean = CF.ringViolations(BEFORE, null, W)
  const m3 = CF.ringsMeet([sq(0, 0, 10), sq(10.003, 0, 10)], W).filter(v => v.kind === 'near'), m30 = CF.ringsMeet([sq(0, 0, 10), sq(10.03, 0, 10)], W)
  return { near, clean, m3, m30, ok2: near.length >= 1 && near.some(v => Math.abs(v.gap - 0.00192) < 0.0002) && !clean.length, ok3: m3.length >= 1 && !m30.length } }
const CF = await import('../cartograph/coastFile.mjs'), J = judge(CF)
row(J.ok2, `(2) PTown's settled island: ${J.near.length} 'near'(s), the least ${J.near.length ? (Math.min(...J.near.map(v => v.gap)) * 1000).toFixed(2) : '—'} mm (want 1.92) · the same island before the open/close: ${J.clean.length} violation(s)`)
row(J.ok3, `(3) two rings 3 mm apart: ${J.m3.length} 'near'(s) · 30 mm apart: ${J.m30.length} meeting(s)`)

// MUTANT: the clearance removed from both verifiers
{ const src = readFileSync(join(ROOT, 'cartograph/coastFile.mjs'), 'utf8'), ANCHOR = 'else if (clear > 0) { const [g, at] = segGap(p1, p2, q1, q2); if (g < clear)'
  if (src.split(ANCHOR).length !== 3) row(false, 'mutant: the clearance test is not in coastFile.mjs twice — re-aim the anchor')
  else { const dir = mkdtempSync(join(tmpdir(), 'inkclear-')), base = join(ROOT, 'cartograph')
    try { writeFileSync(join(dir, 'coastFile.mjs'), src.split(ANCHOR).join('else if (false) { const [g, at] = segGap(p1, p2, q1, q2); if (g < clear)')
        .replace(/from '(\.{1,2}\/[^']+)'/g, (_, r) => `from "${pathToFileURL(join(base, r)).href}"`))
      const M = judge(await import(pathToFileURL(join(dir, 'coastFile.mjs')).href))
      row(!M.ok2 && !M.ok3, `mutant: exact-only restored → the settled island ${M.near.length ? 'still a near' : 'PASSES'}, the 3 mm rings ${M.m3.length ? 'still near' : 'pass'} — ${!M.ok2 && !M.ok3 ? 'RED as it must be' : 'the rows prove nothing'}`)
    } finally { rmSync(dir, { recursive: true, force: true }) } } }
// ⭐ A FOLD AT THE LATTICE'S RESOLUTION (Zob's ruling, 2026-10-29): PTown's deck take-out left the water the mint is given a 294 mm
// out-and-back whose return lies 1 mm off its line, which the exact fold test passed as simple and ①'s absorb refused downstream. A
// fold is two edges that reverse with the far end within the rounding of the first's line (latticeFaces.js#onLineTiered). The take-out
// on the noded arrangement leaves the crop none; the integer take-out (frozen 464dfa5f) still folds it, and is the fold test's plant
const { waterWithoutDecks } = await import('../cartograph/structures.mjs'), FROZEN = await import('./fixtures/open-close-integer-frozen-464dfa5f.mjs'), AC = JSON.parse(readFileSync(join(ROOT, 'checks/fixtures/cut-once-ptown-antenna-crop.json'), 'utf8'))
const PARTWAY = [[0, 0], [10, 0], [10, 10], [5, 10], [5, 13], [5.0004, 11.5], [6, 10], [10, 10.5], [0, 10.5]].slice(0, 7).concat([[0, 10]])   // out 3 m, back part way, 0.4 mm off its line
const INLET = [[0, 0], [10, 0], [10, 10], [5.1, 10], [5.1, 7], [4.9, 7], [4.9, 10], [0, 10]]                                               // a real 0.2 m inlet, wider than the rounding
const folds = (CF) => { const f = (rs) => rs.flatMap(r => CF.ringViolations(r)).filter(v => v.kind === 'fold'), take = (W) => W(AC.water, [], [AC.deck], AC.fineM).rings
  return { crop: f(take(waterWithoutDecks)), integer: f(take(FROZEN.waterWithoutDecks)), partway: f([PARTWAY]), inlet: CF.ringViolations(INLET) } }
const FO = folds(CF)
row(!FO.crop.length, `(4) PTown's antenna crop, today's take-out (the noded arrangement): ${FO.crop.length} fold(s)${FO.crop.length ? ` — ${FO.crop[0].what} at (${FO.crop[0].at.join(', ')})` : ''}`)
row(FO.integer.length >= 1, `(4) mutant: the integer take-out restored (frozen 464dfa5f) on the same crop → ${FO.integer.length} fold(s)${FO.integer.length ? ` at (${FO.integer[0].at.join(', ')}), RED as it must be` : ' — the row cannot see it'}`)
row(FO.partway.length >= 1, `(4) a spike that comes back only part way, 0.4 mm off its line: ${FO.partway.length} fold(s)`)
row(!FO.inlet.length, `(4) a real 0.2 m inlet (wider than the rounding) is not a fold: ${FO.inlet.length} violation(s)`)
{ const src = readFileSync(join(ROOT, 'cartograph/coastFile.mjs'), 'utf8'), ANCHOR = "> 0 && onLineTiered([mm(u), mm(v)], mm(w))) out.push({ kind: 'fold'"
  if (src.split(ANCHOR).length !== 2) row(false, 'mutant: the fold test is not in coastFile.mjs once — re-aim the anchor')
  else { const dir = mkdtempSync(join(tmpdir(), 'fold-')), base = join(ROOT, 'cartograph')
    try { writeFileSync(join(dir, 'coastFile.mjs'), src.replace(ANCHOR, "> 0 && false) out.push({ kind: 'fold'").replace(/from '(\.{1,2}\/[^']+)'/g, (_, r) => `from "${pathToFileURL(join(base, r)).href}"`))
      const M = folds(await import(pathToFileURL(join(dir, 'coastFile.mjs')).href))
      row(!M.integer.length, `mutant: the fold test removed → the integer take-out's folded crop reads ${M.integer.length} fold(s)${M.integer.length ? ' — the row cannot see it' : ', simple again: RED as it must be'}`)
    } finally { rmSync(dir, { recursive: true, force: true }) } } }
// ⛔ (5) A FOLDED DECK REFUSES BY NAME (Zob's ruling, 2026-10-29): structures.mjs#waterWithoutDecks reads each deck's ring with the same
// fold test before any boolean. PTown's pre-port decks (checks/fixtures/cut-once-ptown-street-decks.json, deck 0's two folds) refuse
// there; today's decks (-port) build. MUTANT (source mutation of structures.mjs): the guard removed → the same input refuses far from
// its cause, as a STAIRCASE in the open's source, RED
{ const fx = (n) => JSON.parse(readFileSync(join(ROOT, `checks/fixtures/cut-once-${n}.json`), 'utf8')), coast = fx('ptown-coast'), water = coast.water.flatMap(b => [b.outer, ...b.holes])
  const why = (W, n) => { try { W(water, coast.arcs || [], fx(n).rings, coast.fineM); return null } catch (e) { return String(e.message) } }
  const stale = why(waterWithoutDecks, 'ptown-street-decks'), today = why(waterWithoutDecks, 'ptown-street-decks-port')
  row(/deck 0's ring has a fold \(a zero-width spike\) at \(275\.745, 266\.811\)/.test(stale || '') && !today, `(5) PTown's pre-port decks: ${stale ? stale.slice(0, 150) : 'BUILD — the guard did not fire'} · today's decks: ${today ? `REFUSE: ${today.slice(0, 100)}` : 'build'}`)
  const src = readFileSync(join(ROOT, 'cartograph/structures.mjs'), 'utf8'), ANCHOR = "    if (f) throw new Error(`⛔ structures: deck ${k}'s ring has a fold"
  if (src.split(ANCHOR).length !== 2) row(false, 'mutant: the folded-deck guard is not in structures.mjs once — re-aim the anchor')
  else { const dir = mkdtempSync(join(tmpdir(), 'deckfold-')), base = join(ROOT, 'cartograph')
    try { writeFileSync(join(dir, 'structures.mjs'), src.replace(ANCHOR, ANCHOR.replace('if (f)', 'if (false)')).replace(/from '(\.{1,2}\/[^']+)'/g, (_, r) => `from "${pathToFileURL(join(base, r)).href}"`)
        .replace(/from '([^.'][^']*)'/g, (_, r) => `from "${import.meta.resolve(r)}"`))   // a package resolved from here (the copy sits outside the repo)
      const M = await import(pathToFileURL(join(dir, 'structures.mjs')).href), m = why(M.waterWithoutDecks, 'ptown-street-decks')
      row(/STAIRCASE in its SOURCE/.test(m || ''), `mutant: the folded-deck guard removed → ${m ? `refuses far from its cause: ${m.slice(0, 110)}` : 'BUILDS'}${/STAIRCASE in its SOURCE/.test(m || '') ? ', RED as it must be' : ' — not the staircase the guard names'}`)
    } finally { rmSync(dir, { recursive: true, force: true }) } } }
console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ a coast ring keeps the ink clear')
process.exit(red ? 1 : 0)
