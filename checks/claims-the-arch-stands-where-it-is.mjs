#!/usr/bin/env node
// CLAIM — THE ARCH STANDS WHERE IT IS (BRIEF-the-arch-stands-where-it-is, 2026-10-28, Keystone; Zob's plan PASS).
// The Gateway Arch was placed by a Look's hand-set distance and bearing (LS: 1690 m; the real Arch is ~2.87 km out),
// pivoting at its apex, with LS's bearing and facing as KIT defaults (Class D). Now:
//   (1) ITS SITE IS ITS REAL FEET through the town's frame: archSite(LS geography.json) is the midpoint of the two OSM
//       feet through the ONE projector (townPlace.js#projectorOf, which cartograph/geography.mjs re-exports), and it
//       lands within the cited relation's own centre (Nominatim 38.6246258, −90.1849637) by less than the legs' width.
//   (2) SOURCE: GatewayArch.jsx and DesignerArch.jsx place it by archSite(…) and pivot at the base (position y =
//       yOffset, scale = presence); no `distance`/`bearing` and no camera in the placement. The Stage card authors no
//       placement. ARCH_FLAT_DEFAULTS holds only presentation, at neutral values (presence 1, turn 0).
//   (3) THE MIGRATION keeps what was drawn: a planted row under the old rule (LS's 2.1 / 1.99 / 155) migrates to a base
//       at the same world height and a facing equal to the old rotation.
//   (4) EVERY LOOK carrying `arch` is under the new rule, in its design.json AND its baked scene.json: RED by name until
//       `node cartograph/migrate-arch-stands.mjs --write` has run and the town's scene is re-baked (the store refuses an
//       old block; the renderer says it and draws nothing).
//   MUTANTS (always run): the authored 1690 restored in GatewayArch → (2) RED · a camera term in the placement → (2) RED
//   · LS's bearing back in the defaults → (2) RED · the apex pivot kept by the migration → (3) RED.
//   node checks/claims-the-arch-stands-where-it-is.mjs
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './_scenes.mjs'
import { projectorOf as pourProjector } from '../cartograph/geography.mjs'
import { projectorOf } from '../src/lib/townPlace.js'
import { archSite, GATEWAY_ARCH, PEAK_HEIGHT } from '../src/setpieces/gatewayArch.js'
import { migrateArch } from '../cartograph/migrate-arch-stands.mjs'

let red = 0
const row = (ok, s) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${s}`) }
const read = (p) => readFileSync(join(ROOT, p), 'utf8')

// (1)
const geo = JSON.parse(read('cartograph/data/lafayettesquare/geography.json'))
row(pourProjector === projectorOf, `(1) the pour and the player project through ONE function: ${pourProjector === projectorOf}`)
const site = archSite(geo), P = projectorOf(geo), [n, s] = GATEWAY_ARCH.feet.map(f => P(f.lon, f.lat))
const mid = [(n[0] + s[0]) / 2, (n[1] + s[1]) / 2], dMid = Math.hypot(site.x - mid[0], site.z - mid[1])
row(dMid < 0.1, `(1) LS: the site (${site.x.toFixed(1)}, ${site.z.toFixed(1)}) is the feet's midpoint through LS's frame (${dMid.toFixed(3)} m), ${(Math.hypot(site.x, site.z) / 1000).toFixed(3)} km from the origin`)
const c = P(-90.1849637, 38.6246258), dC = Math.hypot(site.x - c[0], site.z - c[1])
row(dC < 16.5, `(1) LS: within the cited relation's centre by ${dC.toFixed(1)} m (< the legs' 16.5 m)`)

// (2)
const judgePlace = (arch, designer, card, defaults) => {
  const f = arch.slice(arch.indexOf('useFrame(({ camera })'), arch.indexOf('if (shaderRef.current)', arch.indexOf('useFrame(({ camera })')))
  const placement = f.slice(f.indexOf('archSite('), f.indexOf('scale.setScalar') + 40)
  const why = []
  if (!/archSite\(townPlace\(\)\)/.test(f)) why.push('GatewayArch: not placed by archSite(townPlace())')
  if (!/position\.set\(site\.x, arch\.yOffset, site\.z\)/.test(f) || !/scale\.setScalar\(arch\.presence\)/.test(f)) why.push('GatewayArch: not base-pivoted at yOffset with presence')
  if (/distance|bearing|1690/.test(f)) why.push('GatewayArch: an authored distance/bearing in the placement')
  if (/camera/.test(placement)) why.push('GatewayArch: the camera in the placement')
  if (!/archSite\(townPlace\(\)\)/.test(designer) || /distance|bearing/.test(designer)) why.push('DesignerArch: not at archSite')
  if (/setArch\('(distance|bearingX|bearingZ|scale|rotation)'/.test(card)) why.push('Stage: the card authors a placement')
  const d = defaults.slice(defaults.indexOf('export const ARCH_FLAT_DEFAULTS'), defaults.indexOf('export const ARCH_FIELD_KEYS'))
  if (/distance|bearing|rotation|scale/.test(d.slice(d.indexOf('{')))) why.push('ARCH_FLAT_DEFAULTS carries a placement')
  if (!/presence: 1,/.test(d) || !/turn: 0,/.test(d)) why.push('ARCH_FLAT_DEFAULTS: presence/turn not neutral')
  return why
}
const SRC = { arch: read('src/components/GatewayArch.jsx'), designer: read('src/cartograph/DesignerArch.jsx'), card: read('src/stage/StageApp.jsx'), defaults: read('src/cartograph/skyLightChannels.js') }
const W = judgePlace(SRC.arch, SRC.designer, SRC.card, SRC.defaults)
row(!W.length, `(2) placed by its real site, base-pivoted, nothing authored about where: ${W.length ? W.join(' · ') : 'yes'}`)

// (3)
const OLD = { values: { distance: 1690, bearingX: 0.9487, bearingZ: -0.3163, scale: 2.1, rotation: 1.99, yOffset: 155, footFade: 36 } }
const judgeMigration = (mig) => {
  const m = mig(OLD, geo, 'planted')?.values, v = OLD.values
  if (!m) return ['nothing migrated']
  const why = [], oldBase = v.yOffset + PEAK_HEIGHT * (1 - v.scale)
  if (Math.abs(m.yOffset - oldBase) > 0.01) why.push(`base ${m.yOffset} ≠ the drawn ${oldBase.toFixed(3)}`)
  const facing = site.facing + m.turn, dr = Math.atan2(Math.sin(facing - v.rotation), Math.cos(facing - v.rotation))
  if (Math.abs(dr) > 0.001) why.push(`facing ${facing.toFixed(3)} ≠ the drawn ${v.rotation}`)
  if (m.presence !== v.scale) why.push(`presence ${m.presence} ≠ scale ${v.scale}`)
  for (const k of ['distance', 'bearingX', 'bearingZ', 'scale', 'rotation']) if (k in m) why.push(`${k} kept`)
  return why
}
const M = judgeMigration(migrateArch)
row(!M.length, `(3) the migration keeps what was drawn (base, facing, size) and drops the placement: ${M.length ? M.join(' · ') : 'yes'}`)

// (4)
const index = JSON.parse(read('public/looks/index.json'))
const oldRule = (a) => !!a?.values && !('presence' in a.values)
for (const { id } of index.looks) {
  const dp = join(ROOT, 'public/looks', id, 'design.json'), sp = join(ROOT, 'public/baked', id, 'scene.json')
  const d = existsSync(dp) ? JSON.parse(readFileSync(dp, 'utf8')) : null, sc = existsSync(sp) ? JSON.parse(readFileSync(sp, 'utf8')) : null
  if (!d?.arch && !sc?.arch) continue
  const why = []
  if (oldRule(d?.arch)) why.push('design.json predates it — run cartograph/migrate-arch-stands.mjs --write')
  if (oldRule(sc?.arch)) why.push('the baked scene.json predates it — re-bake the scene')
  if (!sc) why.push('no baked scene.json in this tree — NOT checked')
  row(!why.length, `(4) ${id}: ${why.length ? why.join(' · ') : 'design and slab are under the new rule'}`)
}

// MUTANTS
const mutate = (name, ok) => row(!ok, `mutant: ${name} → ${ok ? 'still GREEN — the row proves nothing' : 'RED as it must be'}`)
const swap = (s, a, b, name) => { if (!s.includes(a)) { row(false, `mutant (${name}): its anchor is gone — re-aim it`); return s } return s.replace(a, b) }
mutate('the authored 1690 restored', !judgePlace(swap(SRC.arch, 'meshRef.current.position.set(site.x, arch.yOffset, site.z)', 'meshRef.current.position.set(1690 * 0.9487, arch.yOffset, 1690 * -0.3163)', '1690'), SRC.designer, SRC.card, SRC.defaults).length)
mutate('a camera term in the placement', !judgePlace(swap(SRC.arch, 'meshRef.current.position.set(site.x, arch.yOffset, site.z)', 'meshRef.current.position.set(site.x + camera.position.x * 0.01, arch.yOffset, site.z)', 'camera'), SRC.designer, SRC.card, SRC.defaults).length)
mutate("LS's bearing back in the defaults", !judgePlace(SRC.arch, SRC.designer, SRC.card, swap(SRC.defaults, '  presence: 1,', '  presence: 1,\n  bearingX: 0.9487,', 'defaults')).length)
mutate('the apex pivot kept by the migration', !judgeMigration((a, g, l) => { const r = migrateArch(a, g, l); return { values: { ...r.values, yOffset: a.values.yOffset } } }).length)

console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ the Arch stands where it is')
process.exit(red ? 1 : 0)
