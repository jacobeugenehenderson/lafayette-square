#!/usr/bin/env node
/**
 * "WHEN THE PLAN IS ASKED TO FRAME ALL OF A SET, IS EVERY PLACED MEMBER INSIDE THE FREE REGION?"
 *
 * WHY (Jacob, 2026-09-29, via Boz): "Dining should frame all the bars and restaurants", and at arrival "we want to see
 * everything that's open". <Town frameMode="all"> frames every placed member (src/lib/frameDensest.js#frameAll) and the
 * plan camera stands at the height that fits that circle into the region the app's UI leaves free
 * (src/camera/planPose.js — the runtime's own fit, imported here, not restated).
 *
 * For every town slab's real sets (claims-the-plan-opens-on-its-places' cases: its largest category, every listed place,
 * and a fixture with rim and gaps), on a phone and a desktop viewport with UI insets, at several plan headings: every
 * member's footprint, projected through that camera and view offset, lands inside the free region. A member beyond the
 * Extent is not framed and must be DISCLOSED (outside), never silently dropped.
 * ⭐ The instrument is seen to see: the same projection must find members OUTSIDE the free region under the default
 *    'densest' frame on at least one real set — otherwise it could not tell 'all' from 'densest'.
 * ⛔ Mutation-tested 2026-09-29: frameAll ignoring footprint radii → red; frameAll returning the densest frame → red.
 *
 * Usage: node checks/claims-the-plan-frames-all-it-is-given.mjs
 */
import * as THREE from 'three'
import { cases } from './claims-the-plan-opens-on-its-places.mjs'
import { frameAll, frameDensest } from '../src/lib/frameDensest.js'
import { planAltitude, insetOffset } from '../src/camera/planPose.js'
import { browseUpFromHeading } from '../src/lib/browseHeading.js'
import { SHOTS_FLAT_DEFAULTS } from '../src/cartograph/skyLightChannels.js'

const { fov, padding: pad } = SHOTS_FLAT_DEFAULTS.browse
const VIEWS = [
  { name: 'phone', W: 390, H: 844, inset: { top: 110, right: 0, bottom: 300, left: 0 } },
  { name: 'desktop', W: 1440, H: 900, inset: { top: 64, right: 420, bottom: 0, left: 0 } },
]
const HEADINGS = [0, 37, 90]
const TOL = 1   // px

/** Members (placed, inside the Extent) whose footprint projects outside the free region, for this frame and view. */
function escapees(frame, places, ids, stencil, view, heading) {
  const { W, H, inset } = view
  const cam = new THREE.PerspectiveCamera(fov, W / H, 0.1, 1e6)
  const alt = planAltitude(frame.radius, { fov, pad, W, H, inset })
  const up = browseUpFromHeading(heading)
  cam.position.set(frame.x, alt, frame.z + 1)
  cam.up.set(up[0], up[1], up[2])
  cam.lookAt(frame.x, 0, frame.z)
  const o = insetOffset(inset)
  cam.setViewOffset(W, H, o.x, o.y, W, H)
  cam.updateMatrixWorld(); cam.updateProjectionMatrix()
  const [cx, cz] = stencil.center, v = new THREE.Vector3()
  const out = []
  for (const id of ids) {
    const p = id == null ? null : places.get(id)
    if (!p || Math.hypot(p.x - cx, p.z - cz) > stencil.radius) continue
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2
      v.set(p.x + Math.cos(a) * p.radius, 0, p.z + Math.sin(a) * p.radius).project(cam)
      const px = ((v.x + 1) / 2) * W, py = ((1 - v.y) / 2) * H
      if (px < inset.left - TOL || px > W - inset.right + TOL || py < inset.top - TOL || py > H - inset.bottom + TOL) { out.push(id); break }
    }
  }
  return out
}

const fails = []
let framed = 0, densestEscapes = 0
for (const c of cases()) {
  for (const [label, ids] of Object.entries(c.sets)) {
    const all = frameAll(c.places, ids, c.stencil)
    if (!all) continue
    // Nothing vanishes: placed + outside + unplaced = of.
    if (all.placed + all.outside.length + all.unplaced.length !== all.of) fails.push(`${c.town} · ${label}: the frame lost members (${all.placed}+${all.outside.length}+${all.unplaced.length} ≠ ${all.of})`)
    for (const view of VIEWS) for (const h of HEADINGS) {
      framed++
      const esc = escapees(all, c.places, ids, c.stencil, view, h)
      if (esc.length) fails.push(`${c.town} · ${label} · ${view.name} @${h}°: ${esc.length} member(s) outside the free region under frameMode 'all' — ${esc.slice(0, 5).join(', ')}`)
      const d = frameDensest(c.places, ids, c.stencil)
      if (d && escapees(d, c.places, ids, c.stencil, view, h).length) densestEscapes++
    }
  }
}
if (!densestEscapes) fails.push('INSTRUMENT BLIND: under the default densest frame no member of any real set fell outside the free region — this check could not tell "all" from "densest"')

if (fails.length) {
  console.error(`⛔ ${fails.length} failure(s):`)
  for (const f of fails.slice(0, 30)) console.error('   ' + f)
  process.exit(1)
}
console.log(`✅ ${framed} frames (sets × views × headings): under frameMode 'all' every placed member is inside the free region · densest leaves members out ${densestEscapes}× (the instrument sees)`)
