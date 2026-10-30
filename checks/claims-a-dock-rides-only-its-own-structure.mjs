#!/usr/bin/env node
// CLAIM — A DOCK RIDES ONLY ITS OWN STRUCTURE (Boz's rulings (A) and (A1), 2026-10-30; Jacob: "markings on the sandbed are grass").
// structures.mjs#streetDecks' own doc: "a deck that carries no street stays water (the off-ground deck object, later)". It broke at
// the UNION: PTown's floating docks moored against MacMillan Wharf merged into its footprint, which a street crosses, so they left
// ①'s water as parcel-less land and drew as the land-use sentinel's grass. Now a street rides the deck WAYS it crosses and, along
// the structure, every way of the SAME KIND (fixed with fixed, floating with floating) touching one that rides (decksRidden).
// Every row runs streetDecks / waterWithoutDecks on a planted harbour; every mutant runs the same row on _importSource's changed
// copy of structures.mjs, so a test that cannot see its mutant is RED.
//   (1) a fixed wharf a street crosses rides; a fixed spur touching it rides with it; a FLOATING dock moored against it stays water
//   (2) a floating marina a street runs on rides with its floating gangway, rooted where the gangway reaches the shore
//   (3) the seam: the wharf deck's outline over the water, the moored dock's side included, is ONE arc tagged with its deck; the
//       moored dock's water is still water
//   (4) a building on a dock left in the water refuses by name
//   MUTANTS: the union restored (every deck way rides) → the moored dock leaves the water, RED · the kind ignored (any touching way
//   rides) → RED · floating never rides along the structure (rule (A) alone) → the marina's gangway falls, RED · the building guard
//   removed → RED
//   node checks/claims-a-dock-rides-only-its-own-structure.mjs
import { importSource } from './_importSource.mjs'
import * as S0 from '../cartograph/structures.mjs'

let red = 0
const row = (ok, msg) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${msg}`) }
// a changed copy of structures.mjs through the one mutated-copy loader (bare specifiers resolved from here); null when the change
// did not apply
const withChange = async (from, to) => { try { return await importSource('cartograph/structures.mjs', { transform: (t) => {
  if (t.split(from).length !== 2) throw new Error('the line moved')
  return t.replace(from, to).replace(/from '([^.'/][^']*)'/g, (_, r) => `from '${import.meta.resolve(r)}'`) } }) } catch (e) { if (/the line moved/.test(e.message)) return null; throw e } }

// the planted harbour: water north of z = 0 (a 200 m square; the shore is z = 0)
const line = (id, w, floating, a, b) => ({ osmId: id, tags: { man_made: 'pier', width: String(w), ...(floating ? { floating: 'yes' } : {}) }, coords: [{ x: a[0], z: a[1] }, { x: b[0], z: b[1] }], isClosed: false })
const ground = { man_made: [
  line(1, 10, false, [50, -20], [50, 80]),      // the wharf: a street crosses it
  line(2, 6, false, [55, 30], [80, 30]),        // a fixed spur off the wharf, no street
  line(3, 4, true, [55, 60], [90, 60]),         // a FLOATING dock moored against the wharf, no street
  line(4, 6, true, [150, 40], [150, 100]),      // a floating marina a street runs on
  line(5, 4, true, [150, 42], [150, -20]),      // its floating gangway to the shore, no street
] }
const streets = [{ skelId: 'wharf-st', points: [[50, -40], [50, 70]] }, { skelId: 'marina-st', points: [[150, 50], [150, 90]] }]
const water = [[[0, 0], [200, 0], [200, 200], [0, 200]]], arcs = [[[0, 0], [200, 0]]]
const inR = (x, z, r) => { let w = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [a, b] = r[i], [c, e] = r[j]; if ((b > z) !== (e > z) && x < (c - a) * (z - b) / (e - b) + a) w = !w } return w }
const deckAt = (sd, x, z) => sd.decks.findIndex(d => inR(x, z, d.ring))
const SPUR = [70, 30], MOORED = [75, 60], GANGWAY = [150, 10]
const verdict = (S) => { const sd = S.streetDecks(ground, streets, 1, []); return { sd, spur: deckAt(sd, ...SPUR), moored: deckAt(sd, ...MOORED), gangway: deckAt(sd, ...GANGWAY), marina: deckAt(sd, 150, 70) } }

// (1) and (2)
{ const v = verdict(S0), wharf = deckAt(v.sd, 50, 40)
  row(wharf >= 0 && v.spur === wharf && v.moored === -1, `(1) the wharf rides (deck ${wharf}); its fixed spur rides with it (deck ${v.spur}); the floating dock moored against it stays water (${v.moored === -1 ? 'in no deck' : `deck ${v.moored}`})`)
  row(v.marina >= 0 && v.gangway === v.marina && v.marina !== wharf, `(2) the floating marina rides with its floating gangway, one deck rooted at the shore (marina ${v.marina}, gangway ${v.gangway})`)
  row(v.sd.left.some(l => l.id === 3), `(1) the moored dock is named among the ways left in the water beside a ridden one (${v.sd.left.map(l => l.id).join(', ') || 'none'})`) }

// (3) the seam
{ const v = verdict(S0), w = S0.waterWithoutDecks(water, arcs, v.sd.rings, 1), k = deckAt(v.sd, 50, 40)
  const dk = w.arcs.filter(a => a.deck === k), mooredWet = w.rings.some(r => inR(MOORED[0], MOORED[1], r))
  row(dk.length === 1 && mooredWet, `(3) the wharf deck's outline over the water is ${dk.length} arc(s) tagged deck ${k} (1), the moored dock's side included; the moored dock's water is ${mooredWet ? 'water' : 'NOT water'}`) }

// (4) the building guard
const onDock = [{ osmId: 99, coords: [{ x: 70, z: 59 }, { x: 74, z: 59 }, { x: 74, z: 61 }, { x: 70, z: 61 }, { x: 70, z: 59 }] }]
const guard = (S) => { try { S.streetDecks(ground, streets, 1, onDock); return null } catch (e) { return String(e.message) } }
{ const g = guard(S0); row(/building 99 stands on deck way 3/.test(g || ''), `(4) a building on the moored dock refuses by name: ${g ? g.slice(0, 120) : 'NOT REFUSED'}`) }

// MUTANTS
for (const [what, from, to, red_] of [
  ['the union restored (every deck way rides)', 'const drop = new Set(ways.filter(w => !w.rides).map(w => w.f))', 'const drop = new Set()', (v) => v.moored !== -1],
  ['the kind ignored (any touching way rides)', 'if (!v.rides && v.floating === w.floating && meets(w.shape, v.shape))', 'if (!v.rides && meets(w.shape, v.shape))', (v) => v.moored !== -1],
  ['floating never rides along the structure (rule (A) alone)', 'if (!v.rides && v.floating === w.floating && meets(w.shape, v.shape))', 'if (!v.rides && !v.floating && meets(w.shape, v.shape))', (v) => v.gangway !== v.marina]]) {
  const M = await withChange(from, to), v = M && verdict(M)
  row(!!v && red_(v), `mutant: ${what} → ${!M ? 'NOT MUTATED (the line moved)' : red_(v) ? 'the planted harbour reads wrong, RED as it must be' : 'still right — the row cannot see it'}`) }
{ const M = await withChange('if (overlaps([toPath(bp.slice(0, -1))], w.shape)) throw', 'if (false) throw'), g = M && guard(M)
  row(!!M && g === null, `mutant: the building guard removed → ${!M ? 'NOT MUTATED (the line moved)' : g === null ? 'the building stands on the water unrefused, RED as it must be' : 'still refused — the row cannot see it'}`) }

console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ a dock rides only its own structure')
process.exit(red ? 1 : 0)
