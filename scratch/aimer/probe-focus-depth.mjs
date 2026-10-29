// Aimer, option δ (Boz, 2026-10-29): a key's look-at point on its view axis at the depth of its FOCUS OBJECT (the box
// centre projected onto the look ray). Replays each town's LIVE key list (integration's public/looks/<town>/design.json)
// with its stored targets vs δ targets, through src/preview/heroAnim.js#heroPoseAtTime.
// ⚠️ Focus centres are APPROXIMATE: the Arch from gatewayArch.js#archSite + archPose (box centre y inferred as the
// midpoint of feet and apex); the Pilgrim Monument (PTown's osm-164024699) from its public lat/lon and ~30 m hill +
// 77 m tower, not the slab index (not in the local data). δ depth is dominated by horizontal range, so y matters little.
import { readFileSync } from 'node:fs'
import { heroPoseAtTime } from '../../src/preview/heroAnim.js'
import { archSite, archPose, PEAK_HEIGHT } from '../../src/setpieces/gatewayArch.js'
import { keyframeFocusIds } from '../../src/lib/focusObject.js'
const INT = new URL('../../../integration/', import.meta.url)
const json = (p) => JSON.parse(readFileSync(new URL(p, INT), 'utf8'))
const sub = (a, b) => a.map((v, i) => v - b[i]), add = (a, b) => a.map((v, i) => v + b[i]), mul = (a, k) => a.map(v => v * k)
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0), len = (a) => Math.hypot(...a), norm = (a) => mul(a, 1 / len(a))
const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(norm(a), norm(b))))) * 180 / Math.PI
const proj = (g) => (lon, lat) => [(lon - g.lon) * g.lonToMeters, (g.lat - lat) * g.latToMeters]

const centres = {}
{ const g = json('cartograph/data/lafayettesquare/geography.json'), d = json('public/looks/lafayettesquare/design.json')
  const site = archSite(g), pose = archPose(site, d.arch.values), apexY = d.arch.values.yOffset + PEAK_HEIGHT
  const footY = apexY - PEAK_HEIGHT * d.arch.values.scale
  centres.arch = [pose.x, (apexY + Math.max(footY, 0)) / 2, pose.z] }
{ const g = json('cartograph/data/provincetown/geography.json'), [x, z] = proj(g)(-70.18833, 42.05278)
  centres['osm-164024699'] = [x, 30 + 77 / 2, z] }

const LEN = 400
for (const town of ['lafayettesquare', 'provincetown', 'huron', 'hipointedemun']) {
  const d = json(`public/looks/${town}/design.json`), keys = d.heroKeyframes, motion = d.heroMotion
  const ids = keyframeFocusIds(keys)
  console.log(`\n${town}: ${keys.length} keys, focus by key (inherited) ${JSON.stringify(ids)}`)
  const delta = []
  for (const [i, k] of keys.entries()) {
    const look = norm(sub(k.target, k.position)), stored = len(sub(k.target, k.position))
    const c = ids[i] && centres[ids[i]]
    if (!ids[i]) { console.log(`  key ${i}: stored depth ${stored.toFixed(0)} m · δ: NO FOCUS OBJECT`); delta.push(null); continue }
    const rel = sub(c, k.position), depth = dot(rel, look), off = ang(rel, look)
    console.log(`  key ${i}: stored depth ${stored.toFixed(0)} m · δ depth ${depth.toFixed(0)} m · focus centre ${off.toFixed(1)}° off the look axis`)
    delta.push(depth > 0 ? add(k.position, mul(look, depth)) : null)
  }
  if (delta.some(t => t == null)) { console.log('  δ replay: undefined (a key has no focus object, or its focus is behind the camera)'); continue }
  const ratio = (ts) => { const ds = keys.map((k, i) => len(sub(ts[i], k.position))); return (Math.max(...ds) / Math.min(...ds)).toFixed(2) }
  const play = (ts) => { const ks = keys.map((k, i) => ({ ...k, target: ts[i] })), o = []; for (let i = 0; i <= LEN; i++) { const p = [0, 0, 0], q = [0, 0, 0]; heroPoseAtTime(ks, motion, motion.length * i / LEN, p, q); o.push({ p, d: sub(q, p) }) } return o }
  const a = play(keys.map(k => k.target)), b = play(delta)
  const eq = play(keys.map(k => add(k.position, mul(norm(sub(k.target, k.position)), 1000))))
  let mA = 0, mP = 0, mE = 0, mEP = 0
  a.forEach((f, i) => { mA = Math.max(mA, ang(f.d, b[i].d)); mP = Math.max(mP, len(sub(f.p, b[i].p))); mE = Math.max(mE, ang(b[i].d, eq[i].d)); mEP = Math.max(mEP, len(sub(b[i].p, eq[i].p))) })
  console.log(`  depth ratio across keys: stored ${ratio(keys.map(k => k.target))} · δ ${ratio(delta)}`)
  console.log(`  stored vs δ: max look Δ ${mA.toFixed(2)}°, max position Δ ${mP.toFixed(1)} m · δ vs all-equal depths: look Δ ${mE.toFixed(2)}°, position Δ ${mEP.toFixed(1)} m`)
}
