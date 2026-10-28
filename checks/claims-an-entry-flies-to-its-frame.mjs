#!/usr/bin/env node
// claims-an-entry-flies-to-its-frame.mjs — DOES A PLAN ENTERED WITH frameIds FLY STRAIGHT TO THEIR FRAME, IN ONE MOVE?
//
// ⭐ THE CLAIM (Jacob, via Ward, 2026-10-27: Society's arrival "frame all, light open"). <Town frameIds> given, the plan's
// arrival frames those places in ONE move. A shot change with the places live flies straight to their frame, never via
// the Browse frame; the frameKey current at that entry counts as flown, so the held-key path (ShotFlight.jsx#frameIfLive)
// does not fly it again. A COLD mount (no shot before, so a cut) or unloaded places OPEN on the Browse frame and leave the
// frame HELD, so frameIfLive flies it once when the plan is live: still one move, never a jump-cut onto the frame (Zob,
// 2026-10-28). flight 'cut' cuts to the frame. With no frameIds the entry opens on the Browse frame (browseSquare).
// Four judges, each reading the source:
//   1 · THE ENTRY'S ONE MOVE: ShotFlight's shot-change effect (the useLayoutEffect on [shot]) is lifted from the source and
//       run with stubs. (warm) A shot change into 'plan' with entryFrames and the places live: destination() asked with
//       'places' only, fly() once, key flown, nothing held. (cold) The first shot, entryFrames: a cut to 'home', with the
//       key HELD. (unloaded) A shot change with no places yet: a flight to 'home', the key HELD. ('cut') a cut to 'places'.
//   2 · NONE GIVEN, THE BROWSE FRAME: the same effect with entryFrames false asks destination() with planOn 'home' and
//       leaves the key alone.
//   3 · TOWN KEYS IT ON frameIds: <ShotFlight> gets `entryFrames={frameIds != null}`. Town's placeIds is never absent
//       (it falls back to litIds, else every listing), so keying on it would frame every entry.
//   4 · THE FRAME WAITS FOR ITS PLACES: destination()'s places branch returns null (a pending cut) while the places are
//       not loaded, never the Browse frame.
// ⭐ MUTANTS (--mutants), each must go RED: (a) the entry ignores entryFrames → 1 · (b) Town keys it on placeIds → 3 ·
// (c) every entry frames places → 2 · (d) the key is not marked flown → 1 · (e) the places branch falls through to home → 4 ·
// (f) a cold mount goes straight to the places (the jump-cut) → 1.
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
function runEntry(body, { entryFrames, from = 'movie', places = true, mode = true }) {
  const asked = [], flown = [], cuts = []
  const refs = { prev: { current: from }, planOn: { current: 'home' }, flying: { current: null }, pending: { current: null },
    lastKey: { current: 'old' }, heldKey: { current: 'untouched' } }
  const live = { current: { shot: 'plan', flight: mode, entryFrames, frameKey: 'k1', places: places ? new Map() : null } }
  const tween = { current: { isActive: () => false, cancel: () => {} } }
  const destination = (s) => { asked.push(refs.planOn.current); return { pos: [0, 1, 0], target: [0, 0, 0], fov: 50, up: [0, 0, -1] } }
  const fly = (f, to) => flown.push([f, to])
  const cut = () => cuts.push(refs.planOn.current)
  const fn = new Function('shot', 'live', 'prev', 'planOn', 'flying', 'pending', 'lastKey', 'heldKey', 'tween', 'destination', 'fly', 'cut',
    'end', 'transitionMs', 'ENTRY', 'getSceneStencil', body)
  fn('plan', live, refs.prev, refs.planOn, refs.flying, refs.pending, refs.lastKey, refs.heldKey, tween, destination, fly, cut,
    () => {}, () => 1000, { movie: 'hero', plan: 'browse', street: 'street' }, () => ({ center: [0, 0], radius: 1 }))
  return { asked, flown, cuts, lastKey: refs.lastKey.current, heldKey: refs.heldKey.current }
}

function judge(textOf) {
  const out = { 1: [], 2: [], 3: [], 4: [] }
  const sf = textOf(SF), town = textOf(TOWN)
  const body = shotEffect(sf)
  if (!body) { out[1].push(`${SF}: no useLayoutEffect on [shot]: the judge has no subject`); out[2].push('(no subject)') }
  else {
    const S = (x) => JSON.stringify(x)
    try {
      const a = runEntry(body, { entryFrames: true })
      if (S(a.asked) !== '["places"]' || a.flown.length !== 1 || a.cuts.length) out[1].push(`(warm) asked ${S(a.asked)}, flew ${a.flown.length}, cut ${S(a.cuts)}: not one flight to "places"`)
      if (a.lastKey !== 'k1' || a.heldKey !== false) out[1].push(`(warm) the key is not marked flown (lastKey ${a.lastKey}, heldKey ${a.heldKey}): the held key would fly it again`)
      const c = runEntry(body, { entryFrames: true, from: null })
      if (S(c.cuts) !== '["home"]' || c.flown.length) out[1].push(`(cold) cut ${S(c.cuts)}, flew ${c.flown.length}: not a cut to "home" (a cut to "places" is the jump-cut)`)
      if (c.lastKey !== 'k1' || c.heldKey !== true) out[1].push(`(cold) the frame is not HELD (lastKey ${c.lastKey}, heldKey ${c.heldKey}): nothing flies to the places`)
      const u = runEntry(body, { entryFrames: true, places: false })
      if (S(u.asked) !== '["home"]' || u.flown.length !== 1 || u.heldKey !== true) out[1].push(`(unloaded) asked ${S(u.asked)}, flew ${u.flown.length}, held ${u.heldKey}: not a flight home with the frame held`)
      const k = runEntry(body, { entryFrames: true, from: null, mode: 'cut' })
      if (S(k.cuts) !== '["places"]' || k.heldKey !== false) out[1].push(`('cut') cut ${S(k.cuts)}, held ${k.heldKey}: not a cut to "places" with nothing held`)
    } catch (e) { out[1].push(`the shot-change effect threw: ${e.message}`) }
    try {
      const b = runEntry(body, { entryFrames: false })
      if (S(b.asked) !== '["home"]') out[2].push(`entering with no frameIds asked destination() with planOn ${S(b.asked)}, not ["home"]`)
      if (b.lastKey !== 'old' || b.heldKey !== 'untouched') out[2].push('entering with no frameIds touched the frameKey')
    } catch (e) { out[2].push(`the shot-change effect threw: ${e.message}`) }
  }
  const tag = town.match(/<ShotFlight\b[\s\S]*?\/>/)?.[0]
  if (!tag) out[3].push(`${TOWN}: no <ShotFlight … /> mount: the judge has no subject`)
  else if (!/\bentryFrames=\{frameIds != null\}/.test(tag)) out[3].push(`${TOWN}: <ShotFlight> is not given entryFrames={frameIds != null}: ${(tag.match(/entryFrames=\{[^}]*\}/) || ['(absent)'])[0]}`)
  if (!/if \(planOn\.current === 'home'\) return home\(\)\s*\n\s*if \(!stencil \|\| !live\.current\.places\) return null/.test(sf)) out[4].push(`${SF}#destination: the places branch does not wait (return null) while the places are not loaded`)
  return out
}

const NAMES = { 1: 'an entry with frameIds frames them in one move (warm, cold, unloaded, cut)', 2: 'an entry with none opens on the Browse frame',
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
    ['a', 1, swap(SF, "planOn.current = straight ? 'places' : 'home'", "planOn.current = 'home'")],
    ['b', 3, swap(TOWN, 'entryFrames={frameIds != null}', 'entryFrames={placeIds.length > 0}')],
    ['c', 2, swap(SF, 'const straight = framesOnEntry && (', "const straight = shot === 'plan' && (")],
    ['d', 1, swap(SF, 'if (framesOnEntry) { lastKey.current = live.current.frameKey; heldKey.current = !straight && mode === true }', '')],
    ['f', 1, swap(SF, "(from != null && !!live.current.places", "(!!live.current.places")],
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
