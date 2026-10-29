#!/usr/bin/env node
// CLAIM — THE ARCH STANDS WHERE IT IS (BRIEF-the-arch-stands-where-it-is, 2026-10-28, Keystone; Jacob's rulings,
// registry r-the-arch-is-geo-anchored-with-an-authored-presence: "the arch can keep all the height, foot, rotation, scale
// controls it already has, it's just placed in its correct geographic center").
// The Gateway Arch was placed by a Look's hand-set distance and bearing (LS: 1690 m; the real Arch is 2.87 km out), with
// LS's bearing and facing as KIT defaults, and its glint slid with the camera by LS's numbers (Class D). Now:
//   (1) ITS SITE IS ITS REAL FEET through the town's frame: archSite(LS geography.json) is the midpoint of the two OSM
//       feet through the ONE projector (townPlace.js#projectorOf, which cartograph/geography.mjs re-exports), within the
//       cited relation's own centre (Nominatim 38.6246258, −90.1849637) by less than the legs' width.
//   (2) SOURCE: GatewayArch.jsx and DesignerArch.jsx draw it at archPose(archSite(townPlace()), …): no distance/bearing
//       and no camera in the placement. archPose keeps the APEX pivot (y = yOffset + PEAK·(1 − scale), deliberately)
//       and an unauthored rotation faces as it really stands. No Stage control authors a placement; ARCH_FLAT_DEFAULTS
//       carries no distance, bearing or rotation.
//   (3) THE MIGRATION drops only the retired distance/bearing: a planted LS row draws at the same height, size, facing.
//   (4) EVERY LOOK carrying `arch` carries no retired field, in its design.json AND its baked scene.json: RED by name
//       until `node scripts/migrate-arch-stands.mjs --write` has run and the town's scene is re-baked.
//   (5) THE GLINT MOVES WITH THE VIEWER, FROM NO TOWN'S NUMBERS: GatewayArch sets it from gatewayArch.js#glintAt (the
//       light, the live camera, the drawn pose); glintAt holds no literal but 0, 1 and 2; and a planted camera sliding
//       along the span toward the +X foot, sun overhead, moves the highlight toward the +X foot, monotonically.
//   MUTANTS (always run): the authored 1690 restored → (2) RED · a camera term in the placement → (2) RED · LS's
//   bearing back in the defaults → (2) RED · a base pivot in archPose → (2) RED · the migration dropping the authored
//   rotation → (3) RED · LS's camera reference (−400, 230) back in glintAt → (5) RED · a glint that ignores the eye
//   → (5) RED.
//   node checks/claims-the-arch-stands-where-it-is.mjs
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './_scenes.mjs'
import { projectorOf as pourProjector } from '../cartograph/geography.mjs'
import { projectorOf } from '../src/lib/townPlace.js'
import { archSite, archPose, glintAt, GATEWAY_ARCH, PEAK_HEIGHT } from '../src/setpieces/gatewayArch.js'
import { migrateArch, RETIRED_ARCH_FIELDS } from '../scripts/archStandsMigration.mjs'

let red = 0
const row = (ok, s) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${s}`) }
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const fnBody = (src, sig) => { const a = src.indexOf(sig); return a < 0 ? '' : src.slice(a, src.indexOf('\n}\n', a)) }

// (1)
const geo = JSON.parse(read('cartograph/data/lafayettesquare/geography.json'))
row(pourProjector === projectorOf, `(1) the pour and the player project through ONE function: ${pourProjector === projectorOf}`)
const site = archSite(geo), P = projectorOf(geo), [n, s] = GATEWAY_ARCH.feet.map(f => P(f.lon, f.lat))
const dMid = Math.hypot(site.x - (n[0] + s[0]) / 2, site.z - (n[1] + s[1]) / 2)
row(dMid < 0.1, `(1) LS: the site (${site.x.toFixed(1)}, ${site.z.toFixed(1)}) is the feet's midpoint through LS's frame (${dMid.toFixed(3)} m), ${(Math.hypot(site.x, site.z) / 1000).toFixed(3)} km from the origin`)
const c = P(-90.1849637, 38.6246258), dC = Math.hypot(site.x - c[0], site.z - c[1])
row(dC < 16.5, `(1) LS: within the cited relation's centre by ${dC.toFixed(1)} m (< the legs' 16.5 m)`)

// (2)
const SRC = { arch: read('src/components/GatewayArch.jsx'), designer: read('src/cartograph/DesignerArch.jsx'), card: read('src/stage/StageApp.jsx'), defaults: read('src/cartograph/skyLightChannels.js'), module: read('src/setpieces/gatewayArch.js') }
const judgePlace = (o = {}) => {
  const { arch, designer, card, defaults, module } = { ...SRC, ...o }
  const a = arch.indexOf('useFrame(('), f = arch.slice(a, arch.indexOf('if (shaderRef.current)', a))
  const placement = f.slice(f.indexOf('archPose('), f.indexOf('scale.setScalar') + 40)
  const pose = fnBody(module, 'export function archPose'), why = []
  if (!/archPose\(archSite\(townPlace\(\)\), arch\)/.test(f) || !/position\.set\(pose\.x, pose\.y, pose\.z\)/.test(f) || !/scale\.setScalar\(pose\.scale\)/.test(f)) why.push('GatewayArch: not drawn at archPose(archSite(townPlace()))')
  if (/distance|bearing|1690/.test(f)) why.push('GatewayArch: an authored distance/bearing in the placement')
  if (/camera/.test(placement)) why.push('GatewayArch: the camera in the placement')
  if (!/y: arch\.yOffset \+ PEAK_HEIGHT \* \(1 - arch\.scale\)/.test(pose)) why.push('archPose: not pivoted at the apex')
  if (!/Number\.isFinite\(arch\.rotation\) \? arch\.rotation : site\.facing/.test(pose)) why.push('archPose: an unauthored rotation is not the real facing')
  if (!/archPose\(archSite\(townPlace\(\)\), a\)/.test(designer) || /distance|bearing/.test(designer)) why.push('DesignerArch: not at archPose')
  if (/setArch\('(distance|bearingX|bearingZ)'/.test(card)) why.push('Stage: a control authors a placement')
  const d = defaults.slice(defaults.indexOf('export const ARCH_FLAT_DEFAULTS'))
  const body = d.slice(d.indexOf('= {'), d.indexOf('\n}', d.indexOf('= {')))
  if (/distance|bearing|rotation/.test(body)) why.push('ARCH_FLAT_DEFAULTS carries a placement or a rotation')
  return why
}
const W = judgePlace()
row(!W.length, `(2) drawn at its real site, apex-pivoted, nothing authored about where: ${W.length ? W.join(' · ') : 'yes'}`)
{ const p = archPose(site, { scale: 2, yOffset: 10 })
  row(p.rotation === site.facing && Math.abs(p.y + PEAK_HEIGHT * 2 - (10 + PEAK_HEIGHT)) < 1e-9, `(2) an unauthored rotation faces as it stands (${p.rotation.toFixed(3)} rad); the apex holds at yOffset + PEAK whatever the scale`) }

// (3)
const OLD = { values: { distance: 1690, bearingX: 0.9487, bearingZ: -0.3163, scale: 2.1, rotation: 1.99, yOffset: 155, footFade: 36 } }
const judgeMigration = (mig) => {
  const m = mig(OLD, 'planted')?.values, v = OLD.values
  if (!m) return ['nothing migrated']
  const why = [], was = v.yOffset + PEAK_HEIGHT * (1 - v.scale), now = archPose(site, m)
  if (Math.abs(now.y - was) > 1e-9) why.push(`drawn at y ${now.y} ≠ ${was}`)
  if (now.rotation !== v.rotation) why.push(`rotation ${now.rotation} ≠ the authored ${v.rotation}`)
  if (now.scale !== v.scale) why.push(`scale ${now.scale} ≠ ${v.scale}`)
  if (m.footFade !== v.footFade) why.push('footFade changed')
  for (const k of RETIRED_ARCH_FIELDS) if (k in m) why.push(`${k} kept`)
  return why
}
const M = judgeMigration(migrateArch)
row(!M.length, `(3) the migration drops only the retired distance/bearing; height, size and facing are as drawn: ${M.length ? M.join(' · ') : 'yes'}`)

// (4)
const index = JSON.parse(read('public/looks/index.json'))
const stale = (a) => !!a?.values && RETIRED_ARCH_FIELDS.some(k => k in a.values)
for (const { id } of index.looks) {
  const dp = join(ROOT, 'public/looks', id, 'design.json'), sp = join(ROOT, 'public/baked', id, 'scene.json')
  const d = existsSync(dp) ? JSON.parse(readFileSync(dp, 'utf8')) : null, sc = existsSync(sp) ? JSON.parse(readFileSync(sp, 'utf8')) : null
  if (!d?.arch && !sc?.arch) continue
  const why = []
  if (stale(d?.arch)) why.push('design.json carries the retired distance/bearing — run scripts/migrate-arch-stands.mjs --write')
  if (stale(sc?.arch)) why.push('the baked scene.json carries them — re-bake the scene')
  if (!sc) why.push('no baked scene.json in this tree — NOT checked')
  row(!why.length, `(4) ${id}: ${why.length ? why.join(' · ') : 'design and slab carry no retired field'}`)
}

// (5)
const judgeGlintSource = (arch, module) => {
  const why = []
  if (!/uGlintPos\.value = glintAt\(_light, camera\.position, pose\)/.test(arch)) why.push('GatewayArch: the glint is not glintAt(light, camera, pose)')
  if (/arch\.(distance|bearingX|bearingZ)\b/.test(arch)) why.push('GatewayArch: a retired placement field is read')
  const g = fnBody(module, 'export function glintAt').replace(/\/\/.*$/gm, '')
  const lits = [...g.matchAll(/(?<![\w.])\d+(\.\d+)?(?![\w])/g)].map(m => m[0]).filter(x => !['0', '1', '2'].includes(x))
  if (lits.length) why.push(`glintAt holds a number of its own: ${lits.join(', ')}`)
  return why
}
const GS = judgeGlintSource(SRC.arch, SRC.module)
row(!GS.length, `(5) the glint is the light, the live camera and the drawn pose, with no town's number: ${GS.length ? GS.join(' · ') : 'yes'}`)
const judgeGlintMotion = (glint) => {
  const pose = archPose(site, { scale: 2.1, rotation: 1.99, yOffset: 155 }), ax = [Math.cos(pose.rotation), -Math.sin(pose.rotation)]
  const ts = [-2000, -1000, 0, 1000, 2000].map(d => glint({ x: 0, y: 1, z: 0 }, { x: site.x - 1500 * ax[1] + d * ax[0], y: 150, z: site.z + 1500 * ax[0] + d * ax[1] }, pose))
  return { ts, ok: ts.every((t, i) => i === 0 || t > ts[i - 1]) && Math.abs(ts[2] - 0.5) < 1e-9 }
}
{ const J = judgeGlintMotion(glintAt)
  row(J.ok, `(5) a camera sliding toward the +X foot (sun overhead) moves the highlight that way: t ${J.ts.map(t => t.toFixed(3)).join(' → ')}`) }

// MUTANTS
const mutate = (name, ok) => row(!ok, `mutant: ${name} → ${ok ? 'still GREEN — the row proves nothing' : 'RED as it must be'}`)
const swap = (s, a, b, name) => { if (!s.includes(a)) { row(false, `mutant (${name}): its anchor is gone — re-aim it`); return s } return s.replace(a, b) }
const P0 = 'meshRef.current.position.set(pose.x, pose.y, pose.z)'
mutate('the authored 1690 restored', !judgePlace({ arch: swap(SRC.arch, P0, 'meshRef.current.position.set(1690 * 0.9487, pose.y, 1690 * -0.3163)', '1690') }).length)
mutate('a camera term in the placement', !judgePlace({ arch: swap(SRC.arch, P0, 'meshRef.current.position.set(pose.x + camera.position.x * 0.01, pose.y, pose.z)', 'camera') }).length)
mutate("LS's bearing back in the defaults", !judgePlace({ defaults: swap(SRC.defaults, '  scale: 1.3,', '  scale: 1.3,\n  bearingX: 0.9487,', 'defaults') }).length)
mutate('a base pivot in archPose', !judgePlace({ module: swap(SRC.module, 'y: arch.yOffset + PEAK_HEIGHT * (1 - arch.scale),', 'y: arch.yOffset,', 'pivot') }).length)
mutate('the migration dropping the authored rotation', !judgeMigration((a, l) => { const r = migrateArch(a, l); const { rotation, ...rest } = r.values; return { values: rest } }).length)
mutate("LS's camera reference back in glintAt", !judgeGlintSource(SRC.arch, swap(SRC.module, 'let vx = eye.x - pose.x, vy = eye.y - midY, vz = eye.z - pose.z', 'let vx = eye.x - (-400), vy = eye.y - midY, vz = eye.z - 230', 'glint-ref')).length)
mutate('a glint that ignores the eye', judgeGlintMotion((L, e, p) => glintAt(L, { x: p.x, y: p.y + 1000, z: p.z }, p)).ok)

console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ the Arch stands where it is')
process.exit(red ? 1 : 0)
