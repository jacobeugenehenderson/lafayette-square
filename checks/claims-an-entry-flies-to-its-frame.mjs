#!/usr/bin/env node
// claims-an-entry-flies-to-its-frame.mjs — DOES A PLAN ENTERED WITH frameIds FLY STRAIGHT TO THEIR FRAME, IN ONE MOVE?
//
// ⭐ THE CLAIM (Jacob, via Ward, 2026-10-27: Society's arrival "frame all, light open"). <Town frameIds> given, the plan's
// ENTRY flies to those places' frame. It never lands on the Browse frame first and then makes a second move: the entry's
// one destination is the frame, and the frameKey current at that entry counts as flown, so the held-key path
// (ShotFlight.jsx#frameIfLive) does not fly it again. With no frameIds the entry still opens on the Browse frame
// (browseSquare).
// Four judges, each reading the source:
//   1 · THE ENTRY'S ONE DESTINATION: ShotFlight's shot-change effect (the useLayoutEffect on [shot]) is lifted from the
//       source and run with stubs. Entering 'plan' with entryFrames, destination() is asked with planOn 'places' and never
//       'home', fly() is called once, and the frameKey is marked flown (lastKey, heldKey cleared).
//   2 · NONE GIVEN, THE BROWSE FRAME: the same effect with entryFrames false asks destination() with planOn 'home' and
//       leaves the key alone.
//   3 · TOWN KEYS IT ON frameIds: <ShotFlight> gets `entryFrames={frameIds != null}`. Town's placeIds is never absent
//       (it falls back to litIds, else every listing), so keying on it would frame every entry.
//   4 · THE FRAME WAITS FOR ITS PLACES: destination()'s places branch returns null (a pending cut) while the places are
//       not loaded, never the Browse frame.
// ⭐ MUTANTS (--mutants), each must go RED: (a) the entry ignores entryFrames → 1 · (b) Town keys it on placeIds → 3 ·
// (c) every entry frames places → 2 · (d) the key is not marked flown → 1 · (e) the places branch falls through to home → 4.
//   node checks/claims-an-entry-flies-to-its-frame.mjs [--mutants]
// Read-only. Exits 1 on any failing judge or any mutant left GREEN.
import fs from 'fs'

const SF = 'src/camera/ShotFlight.jsx', TOWN = 'src/components/Town.jsx'
const read = (f) => fs.readFileSync(f, 'utf8')

// The body of the arrow passed to the useLayoutEffect whose deps are exactly [shot].
function shotEffect(src) {
  const end = src.indexOf('}, [shot])')
  if (end < 0) return null
  const start = src.lastIndexOf('useLayoutEffect(() => {', end)
  if (start < 0) return null
  return src.slice(start + 'useLayoutEffect(() => {'.length, end)
}
function runEntry(body, { entryFrames }) {
  const asked = [], flown = []
  const refs = { prev: { current: 'movie' }, planOn: { current: 'home' }, flying: { current: null }, pending: { current: null },
    lastKey: { current: 'old' }, heldKey: { current: true } }
  const live = { current: { shot: 'plan', flight: true, entryFrames, frameKey: 'k1' } }
  const tween = { current: { isActive: () => false, cancel: () => {} } }
  const destination = (s) => { asked.push(refs.planOn.current); return { pos: [0, 1, 0], target: [0, 0, 0], fov: 50, up: [0, 0, -1] } }
  const fly = (from, to) => flown.push([from, to])
  const cut = () => { throw new Error('the entry cut instead of flying') }
  const fn = new Function('shot', 'live', 'prev', 'planOn', 'flying', 'pending', 'lastKey', 'heldKey', 'tween', 'destination', 'fly', 'cut',
    'end', 'transitionMs', 'ENTRY', body)
  fn('plan', live, refs.prev, refs.planOn, refs.flying, refs.pending, refs.lastKey, refs.heldKey, tween, destination, fly, cut,
    () => {}, () => 1000, { movie: 'hero', plan: 'browse', street: 'street' })
  return { asked, flown, lastKey: refs.lastKey.current, heldKey: refs.heldKey.current }
}

function judge(textOf) {
  const out = { 1: [], 2: [], 3: [], 4: [] }
  const sf = textOf(SF), town = textOf(TOWN)
  const body = shotEffect(sf)
  if (!body) { out[1].push(`${SF}: no useLayoutEffect on [shot]: the judge has no subject`); out[2].push('(no subject)') }
  else {
    try {
      const a = runEntry(body, { entryFrames: true })
      if (a.asked.length !== 1 || a.asked[0] !== 'places') out[1].push(`entering with entryFrames asked destination() with planOn ${JSON.stringify(a.asked)}, not ["places"]`)
      if (a.flown.length !== 1) out[1].push(`entering with entryFrames flew ${a.flown.length} time(s), not once`)
      if (a.lastKey !== 'k1' || a.heldKey !== false) out[1].push(`the entry's frameKey is not marked flown (lastKey ${a.lastKey}, heldKey ${a.heldKey}): the held key would fly it again`)
    } catch (e) { out[1].push(`the shot-change effect threw: ${e.message}`) }
    try {
      const b = runEntry(body, { entryFrames: false })
      if (b.asked.length !== 1 || b.asked[0] !== 'home') out[2].push(`entering with no frameIds asked destination() with planOn ${JSON.stringify(b.asked)}, not ["home"]`)
      if (b.lastKey !== 'old') out[2].push('entering with no frameIds marked the frameKey flown')
    } catch (e) { out[2].push(`the shot-change effect threw: ${e.message}`) }
  }
  const tag = town.match(/<ShotFlight\b[\s\S]*?\/>/)?.[0]
  if (!tag) out[3].push(`${TOWN}: no <ShotFlight … /> mount: the judge has no subject`)
  else if (!/\bentryFrames=\{frameIds != null\}/.test(tag)) out[3].push(`${TOWN}: <ShotFlight> is not given entryFrames={frameIds != null}: ${(tag.match(/entryFrames=\{[^}]*\}/) || ['(absent)'])[0]}`)
  if (!/if \(planOn\.current === 'home'\) return home\(\)\s*\n\s*if \(!stencil \|\| !live\.current\.places\) return null/.test(sf)) out[4].push(`${SF}#destination: the places branch does not wait (return null) while the places are not loaded`)
  return out
}

const NAMES = { 1: "an entry with frameIds flies to their frame, once", 2: 'an entry with none opens on the Browse frame',
  3: 'Town keys the entry on frameIds', 4: 'the frame waits for its places' }
let bad = 0
const R = judge(read)
for (const k of [1, 2, 3, 4]) {
  console.log(`${R[k].length ? '⛔' : '✅'} ${k} ${NAMES[k]}`)
  for (const s of R[k]) console.log(`      ${s}`)
  if (R[k].length) bad++
}
if (process.argv.includes('--mutants')) {
  const swap = (file, a, b) => (f) => { const t = read(f); if (f !== file) return t; if (!t.includes(a)) throw new Error(`mutant anchor not found in ${file}: ${a}`); return t.replace(a, b) }
  const MUTANTS = [
    ['a', 1, swap(SF, "planOn.current = framesOnEntry ? 'places' : 'home'", "planOn.current = 'home'")],
    ['b', 3, swap(TOWN, 'entryFrames={frameIds != null}', 'entryFrames={placeIds.length > 0}')],
    ['c', 2, swap(SF, "planOn.current = framesOnEntry ? 'places' : 'home'", "planOn.current = shot === 'plan' ? 'places' : 'home'")],
    ['d', 1, swap(SF, '    if (framesOnEntry) { lastKey.current = live.current.frameKey; heldKey.current = false }', '')],
    ['e', 4, swap(SF, 'if (!stencil || !live.current.places) return null', 'if (!stencil) return null')],
  ]
  for (const [id, want, textOf] of MUTANTS) {
    let red
    try { red = judge(textOf)[want].length > 0 } catch (e) { console.log(`⛔ mutant (${id}) could not be applied: ${e.message}`); bad++; continue }
    console.log(`${red ? '✅' : '⛔'} mutant (${id}) → judge ${want} ${red ? 'RED' : 'still GREEN'}`)
    if (!red) bad++
  }
}
process.exit(bad ? 1 : 0)
