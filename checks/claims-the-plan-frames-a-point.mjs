#!/usr/bin/env node
/**
 * "CAN THE PLAN FRAME A SPOT, AND WHEN NOTHING IS PLACED DOES IT HOLD?" (Boz, 2026-10-31: an event's { name, point } venue
 * must be somewhere to fly; Zob's premises and conditions; Boz's ruling (a): nothing placed → the camera holds.)
 *
 * PLANTED (a grid of 100 buildings, an Extent of 600 m), through src/lib/frameDensest.js, both frame modes:
 *   1. a lone point is FRAMED, centred on it, at the town's floor (the k = ⌈√N⌉ nearest BUILDINGS, so points never count
 *      as buildings: merging them in would move the floor);
 *   2. a point with places is framed with them; its disclosure is its own (`points: { placed, of, outside }`);
 *   3. a point outside the Extent is never framed: a set of only that is null, and discloseFrame names it in points.outside;
 *   4. a duplicate point id, and a point id that is also a place id, are refused by name.
 * READ (no render instrument for the camera; bound to the code that does it):
 *   5. ShotFlight projects framePoints through the one projector, as (lon, lat);
 *   6. nothing placed is its OWN result: the destination is { hold }, never home() (the Browse frame); cut and fly both
 *      end the landing on it with the camera unmoved, and cut never parks it as pending;
 *   7. movers project through the same projector (the inline copy of its formula is gone);
 *   8. <Town> passes framePoints, enters on them (entryFrames), refuses an empty array (null is "no spot"), and its header
 *      says a new framePoints flies only on a frameKey change; a frame-key hold never cancels a flight in progress.
 * Usage: node checks/claims-the-plan-frames-a-point.mjs [--mutants]
 */
import { importSource, sourceOf } from './_importSource.mjs'

const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/.*$/gm, '')
const places = new Map(), N = 100
for (let i = 0; i < N; i++) places.set(`b${i}`, { x: (i % 10) * 100 - 450, z: Math.floor(i / 10) * 100 - 450, radius: 5 })
const ST = { center: [0, 0], radius: 600 }
const BUILDINGS = [...places.values()].map((p) => ({ ...p }))   // a snapshot: the expected floor never reads a map a mutant could write into
function floorAt(x, z) {   // the floor as the module defines it, recomputed from the buildings alone
  const d = BUILDINGS.map((p) => Math.hypot(p.x - x, p.z - z) + p.radius).sort((a, b) => a - b)
  return d[Math.ceil(Math.sqrt(d.length)) - 1]
}

async function verdict({ frame, flight, movers, town } = {}) {
  const fails = [], F = (c, m) => { if (!c) fails.push(m) }
  const places = new Map(BUILDINGS.map((p, i) => [`b${i}`, { ...p }]))   // fresh each run: a mutant that writes into it leaves nothing behind
  const M = await importSource('src/lib/frameDensest.js', frame ? { transform: frame } : {})
  for (const mode of ['densest', 'all']) {
    const lone = M.framePlaces(places, [], ST, mode, [], [{ id: 'p', x: 120, z: 80 }])
    F(lone && Math.abs(lone.x - 120) < 1e-6 && Math.abs(lone.z - 80) < 1e-6, `(${mode}) a lone point is not framed centred on it (${JSON.stringify(lone)})`)
    F(lone && Math.abs(lone.radius - floorAt(120, 80)) < 1e-6, `(${mode}) a lone point's frame is not the town's floor (${lone?.radius} vs ${floorAt(120, 80)})`)
    const many = M.framePlaces(places, [], ST, mode, [], Array.from({ length: 12 }, (_, i) => ({ id: `q${i}`, x: 120 + i * 0.01, z: 80 })))
    F(many && Math.abs(many.radius - floorAt(120, 80)) < 0.2, `(${mode}) points moved the floor: they were counted as buildings (${many?.radius} vs ${floorAt(120, 80)})`)
    const withPlace = M.framePlaces(places, ['b55'], ST, mode, [], [{ id: 'p', x: 120, z: 80 }])
    F(withPlace && withPlace.points?.placed === 1 && withPlace.placed === 1, `(${mode}) a point with a place is not framed as a member beside it (${JSON.stringify(withPlace && { placed: withPlace.placed, points: withPlace.points })})`)
    F(M.framePlaces(places, [], ST, mode, [], [{ id: 'far', x: 5000, z: 0 }]) === null, `(${mode}) a point outside the Extent was framed`)
  }
  const dis = M.discloseFrame(places, [], ST, [{ id: 'far', x: 5000, z: 0 }])
  F(dis?.points?.outside?.[0] === 'far' && dis.points.placed === 0, `an outside point is not disclosed in points.outside (${JSON.stringify(dis)})`)
  const refuses = (f, re) => { try { f(); return false } catch (e) { return re.test(e.message) } }
  F(refuses(() => M.framePlaces(places, [], ST, 'densest', [], [{ id: 'p', x: 1, z: 1 }, { id: 'p', x: 2, z: 2 }]), /two points share the id "p"/), 'a duplicate point id is not refused by name')
  F(refuses(() => M.framePlaces(places, ['b1'], ST, 'densest', [], [{ id: 'b1', x: 1, z: 1 }]), /"b1" is both a place and a point/), 'a point id that is also a place id is not refused by name')
  // 5–6. the camera
  const sf = code(flight ? flight(sourceOf('src/camera/ShotFlight.jsx')) : sourceOf('src/camera/ShotFlight.jsx'))
  F(/const toLocal = projectorOf\(townPlace\(\)\)/.test(sf) && /toLocal\(p\.lon, p\.lat\)/.test(sf), 'ShotFlight does not project framePoints through the one projector as (lon, lat)')
  const nofr = sf.slice(sf.indexOf('if (!frame) {'), sf.indexOf('const alt = planAltitude'))
  F(/return \{ hold: true, frame: \{[^}]*\.\.\.discloseFrame\(/.test(nofr) && !/home\(\)/.test(nofr), 'with nothing placed the plan does not hold (it returns the Browse frame, or no disclosure)')
  F(/pending\.current = null\s*if \(d\.hold\) \{ framed\(d\); if \(landed\) end\(landed\); return true \}/.test(sf), "cut does not end the landing on a hold (or parks it as pending)")
  F(/if \(d\.hold\) \{ framed\(d\); end\(landed\); return \}/.test(sf), 'fly does not end the landing on a hold without moving')
  const fil = sf.slice(sf.indexOf('const frameIfLive = '), sf.indexOf('useLayoutEffect(', sf.indexOf('const frameIfLive = ')))
  F(/if \(!d\) return false\s*if \(d\.hold\) \{ framed\(d\); return true \}\s*if \(tween\.current\.isActive\(\)\) tween\.current\.cancel\(\)/.test(fil), 'a frame-key hold cancels a flight in progress (it must report and return before any cancel)')
  // 7. movers
  const mv = code(movers ? movers(sourceOf('src/lib/movers.js')) : sourceOf('src/lib/movers.js'))
  F(/projectorOf\(place\)\(m\.lon, m\.lat\)/.test(mv) && !/\* place\.lonToMeters/.test(mv), 'movers project with their own copy of the formula, not the one projector')
  // 8. Town
  const tw = town ? town(sourceOf('src/components/Town.jsx')) : sourceOf('src/components/Town.jsx')
  F(/framePoints=\{framePoints\} \/>/.test(tw) && /entryFrames=\{frameIds != null \|\| framePoints != null\}/.test(tw), '<Town> does not pass framePoints, or does not enter on them')
  F(/A new framePoints moves the camera only on a frameKey change/.test(tw), "<Town>'s header does not say a new framePoints flies only on a frameKey change")
  F(/framePoints\.length && framePoints\.every\(/.test(tw), '<Town> accepts an empty framePoints (null is "no spot")')
  return fails
}

const fails = await verdict()
if (fails.length) { console.log('⛔ the plan cannot frame a point, or does not hold:\n  · ' + fails.join('\n  · ')); process.exitCode = 1 }
else console.log('✅ the plan frames a spot: alone at the town\'s floor, with places as a member, never outside (disclosed); nothing placed holds the camera and ends the landing; one projector for points and movers')

if (process.argv.includes('--mutants')) {
  const mutants = [
    ['points dropped', { frame: (s) => s.replace('for (const q of points || []) {', 'for (const q of []) {') }],
    ['points merged into the places (the floor moves)', { frame: (s) => s.replace('else { pts.push({ x: q.x, z: q.z, radius: 0 }); ptPlaced++ }', 'else { pts.push({ x: q.x, z: q.z, radius: 0 }); ptPlaced++; places.set(q.id, { x: q.x, z: q.z, radius: 0 }) }') }],
    ['an outside point framed', { frame: (s) => s.replace('if (Math.hypot(q.x - cx, q.z - cz) > stencil.radius) ptOutside.push(q.id)\n    else', 'if (false) ptOutside.push(q.id)\n    else') }],
    ['a duplicate point id accepted', { frame: (s) => s.replace("if (ptSeen.has(q.id)) throw", 'if (false) throw') }],
    ['a place/point shadow accepted', { frame: (s) => s.replace('if (all.includes(q.id)) throw', 'if (false) throw') }],
    ['a hold cancels the running flight', { flight: (s) => s.replace('    if (d.hold) { framed(d); return true }\n', '') }],
    ['an empty framePoints accepted', { town: (s) => s.replace('framePoints.length && framePoints.every(', 'framePoints.every(') }],
    ['lat and lon swapped', { flight: (s) => s.replace('toLocal(p.lon, p.lat)', 'toLocal(p.lat, p.lon)') }],
    ['home() restored on null', { flight: (s) => s.replace("return { hold: true, frame: {", "return home() || { hold: true, frame: {") }],
    ['nothing-placed treated as pending', { flight: (s) => s.replace('if (!d) { pending.current = { shot: s, landed }', 'if (!d || d.hold) { pending.current = { shot: s, landed }').replace('if (d.hold) { framed(d); if (landed) end(landed); return true }', '') }],
    ["movers' own formula back", { movers: (s) => s.replace('const [x, z] = projectorOf(place)(m.lon, m.lat)', 'const x = (m.lon - place.lon) * place.lonToMeters, z = (place.lat - m.lat) * place.latToMeters') }],
    ['<Town> not entering on points', { town: (s) => s.replace('entryFrames={frameIds != null || framePoints != null}', 'entryFrames={frameIds != null}') }],
  ]
  let bad = 0
  for (const [name, m] of mutants) { const f = await verdict(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${f.length ? ` (${f.length})` : ''}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
