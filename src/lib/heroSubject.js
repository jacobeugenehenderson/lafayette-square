/**
 * Hero-subject resolver — the SINGLE shared resolver every camera uses.
 *
 * The Hero shot frames around one designated object and keeps it centered no
 * matter where the camera moves (the consumer re-locks its look-at target to
 * this point every frame). The operator's designation is `{kind, id}`; this
 * turns it into the 3D point the camera locks onto.
 *
 * Pure + dependency-free (no React, no store) so EVERY camera instantiation —
 * Stage (CartographApp), production (`Scene.jsx`), Preview (`PreviewApp`), and
 * any future one — resolves identically. The hero target is a deliberate
 * RUNTIME input, not a baked value (bake-scene.js SC.5, "category 3 hardwire"):
 * the slab carries the designation, the camera resolves it at render time.
 *
 * Sources (pass what the environment has):
 *   - `slabIndex`  — the render-scoped buildings index (`useSlabBuildingIndex`,
 *                    `{ byId: Map(id → { footprint, baseY, centroidY, … }) }`).
 *                    Production + Preview resolve `building`/`landmark` from
 *                    HERE — the slab owns spatial identity; never reach into
 *                    `src/data/buildings` (production no longer renders from it).
 *   - `buildings`  — live `src/data/buildings`; the Stage-only fallback, since
 *                    Stage renders the live `LafayetteScene` and mounts no slab.
 *   - `archValues` — `scene.arch.values` (production/Preview) or the cartograph
 *                    store's `arch.values` (Stage): `{distance,bearingX,bearingZ,scale}`.
 *
 * Doctrine: project_camera_framing_slab_contract — no camera may hardcode a
 * pose the slab authors, and no camera re-derives the subject differently.
 */
// Last-resort guard only — used when no arch channel is present at all. The
// undesignated DEFAULT is no longer this literal; it resolves the authored arch
// (see below). For LS the arch sits ~1670m out, far from this stale [400,45,-100].
export const FALLBACK_HERO_SUBJECT = [400, 45, -100]

// The neighborhood itself — the local frame's origin IS the boundary centroid
// (config.js wgs84ToLocal centers on it), at mid-building height. The subject for
// a hood that frames on ITSELF rather than on a set-piece or a named building:
// the answer for every installation that doesn't own a Gateway Arch.
const HOOD_CENTROID = [0, 40, 0]

// The arch is a set-piece hero. Resolve it from the authored `arch` channel
// (distance × bearing), NOT a hardcoded centroid. Mid-height ≈ scale × 35.
// No arch channel ⇒ the Look never installed the prop ⇒ frame the hood.
function archPoint(a) {
  if (!a) return HOOD_CENTROID
  return [a.distance * a.bearingX, a.scale * 35, a.distance * a.bearingZ]
}

// Footprint-centroid XZ + mid-building Y (half the local rooftop height) — the
// slab analog of the live path's [position, size[1]/2, position]. Terrain lift
// (aCentroidY × uExag) is applied per-vertex in the shader, not here, matching
// the live path which also aims in pre-terrain local Y.
function pointFromIndexEntry(e) {
  const fp = e?.footprint
  if (!fp || fp.length < 1) return FALLBACK_HERO_SUBJECT
  let sx = 0, sz = 0
  for (const [x, z] of fp) { sx += x; sz += z }
  return [sx / fp.length, (e.baseY ?? 20) * 0.5, sz / fp.length]
}

export function resolveHeroSubject(subject, { slabIndex, buildings, archValues } = {}) {
  if (Array.isArray(subject)) return subject       // already a resolved point
  // Undesignated → frame the arch, the LS hero landmark, resolved from the
  // authored arch channel (operator-confirmed default; no designation / re-bake
  // needed). The old [400,45,-100] literal is retired as the default.
  if (!subject) return archPoint(archValues)
  if (subject.kind === 'arch') return archPoint(archValues)
  // The hood itself — an explicit designation, not a fallback. Chosen in Survey
  // by any installation that doesn't want a set-piece or a privileged building.
  if (subject.kind === 'centroid') return HOOD_CENTROID
  // A landscape is the THIRD kind: a backdrop MESH, not a point to frame ON. The
  // camera frames the hood (origin, mid-height) and the range fills the sky
  // behind it (north = −z). Its render controls live in the scene.json `landscape`
  // channel (placement/snowline/atmosphere), resolved by the piece-3 renderer.
  if (subject.kind === 'landscape') return HOOD_CENTROID
  if (subject.kind === 'building' || subject.kind === 'landmark') {
    // Slab path (production/Preview): resolve from the render-scoped index.
    if (slabIndex) {
      const e = slabIndex.byId?.get(subject.id)
      return e ? pointFromIndexEntry(e) : FALLBACK_HERO_SUBJECT
    }
    // Live fallback (Stage authoring renders the live LafayetteScene).
    const b = buildings?.find(x => x.id === subject.id)
    if (!b || !b.position) return FALLBACK_HERO_SUBJECT
    const halfH = (b.size?.[1] ?? 10) / 2
    return [b.position[0], halfH, b.position[2]]
  }
  return FALLBACK_HERO_SUBJECT
}

/**
 * ── HERO FRAMING ────────────────────────────────────────────────────────────
 * Where the subject sits IN THE FRAME, and therefore where the camera points.
 *
 * ⛔ THE PROBLEM THIS SOLVES, MEASURED. With a plain `lookAt(subject)` the
 * camera's pitch is not a choice — it is `atan((subjectY − cameraY) / distance)`.
 * Lafayette Square's hero subject is the Arch: 74m high and ~2km away, with the
 * camera at 81–157m. Nearly equal heights over a huge distance means the three
 * authored keyframes come out at −0.59°, −2.05° and −0.21° of pitch, with the
 * horizon within 0.18 of dead frame-centre in all three. Half the picture is
 * sky and the neighborhood is squashed edge-on into the bottom half. Jacob:
 * "it's hard to see the rooftops in our pan because it's too flat to the ground
 * on account of the hero-lock."
 * ⛔ AND YOU CANNOT BUY PITCH BY CLIMBING. −10° at 2km costs ~350m of altitude —
 * a helicopter shot, at a scale that is a different picture entirely.
 *
 * ⭐ SO THE LOCK IS INVERTED (Jacob, 2026-09-05: "maybe the hero is locked to
 * the camera... and not vice versa"). Instead of the camera being pinned to put
 * the subject dead centre, the SUBJECT is held at a mark in the frame and the
 * camera aims wherever that requires. Pitch becomes authorable; the subject
 * cannot drift out of shot, because its frame position is the thing being held.
 * ⭐ AND AT THIS DISTANCE THE MARK IS A HORIZON CONTROL FOR FREE: 2km out, the
 * Arch is essentially ON the horizon, so raising the subject in frame raises
 * the horizon with it and the lower two-thirds fill with rooftops.
 *
 * `framing` is [sx, sy] in normalized device coords — 0 = frame centre, +1 = top
 * / right edge. ⛔ [0, 0] REPRODUCES THE OLD BEHAVIOUR EXACTLY, so this is
 * additive: every existing keyframe still plays identically and SLAB-CONTRACT
 * §4 extends rather than breaks.
 *
 * Pure and shared for the same reason `resolveHeroSubject` is: Stage,
 * production and Preview must aim identically or the shot an operator approves
 * is not the shot that ships.
 *
 * @param {{x:number,y:number,z:number}|number[]} camPos
 * @param {number[]} subject   resolved hero subject point
 * @param {number} fov         vertical field of view, degrees
 * @param {number} aspect      viewport width / height
 * @param {number[]} [framing] [sx, sy]; absent or [0,0] = subject dead centre
 * @returns {number[]} the point to aim at — feed straight to lookAt / controls.target
 */
export function heroAimTarget(camPos, subject, fov, aspect, framing) {
  const sx = framing?.[0] || 0
  const sy = framing?.[1] || 0
  const px = camPos.x ?? camPos[0], py = camPos.y ?? camPos[1], pz = camPos.z ?? camPos[2]
  if (!sx && !sy) return subject
  let vx = subject[0] - px, vy = subject[1] - py, vz = subject[2] - pz
  const r = Math.hypot(vx, vy, vz)
  if (!(r > 1e-6)) return subject
  vx /= r; vy /= r; vz /= r

  const t = Math.tan((fov * Math.PI) / 180 / 2)
  // The angle from frame centre at which the subject must sit. Aim BELOW the
  // subject to push it UP the frame, hence the negation at the rotation.
  const pitch = Math.atan(sy * t)
  const yaw   = Math.atan(sx * t * (aspect || 1))

  // Camera basis about the subject direction. worldUp is +Y everywhere in Hero
  // (no roll is authored), so `right` is well defined unless we are looking
  // straight down — which Hero never does.
  // ⚠️ right = v × worldUp, which for up=(0,1,0) is (−vz, 0, vx). Writing the
  // cross the other way round negates it and silently INVERTS the tilt — a
  // positive sy then pushed the subject DOWN the frame. Caught by asserting the
  // resulting pitch, not by reading the code.
  let rx = -vz, ry = 0, rz = vx
  const rl = Math.hypot(rx, ry, rz) || 1
  rx /= rl; ry /= rl; rz /= rl

  // Rotate the view direction down by `pitch` about `right`, then by `yaw`
  // about world Y. Rodrigues, unrolled — no THREE import, this stays pure.
  const rot = (ax, ay, az, kx, ky, kz, ang) => {
    const c = Math.cos(ang), s = Math.sin(ang), d = kx * ax + ky * ay + kz * az
    return [
      ax * c + (ky * az - kz * ay) * s + kx * d * (1 - c),
      ay * c + (kz * ax - kx * az) * s + ky * d * (1 - c),
      az * c + (kx * ay - ky * ax) * s + kz * d * (1 - c),
    ]
  }
  let [ax, ay, az] = rot(vx, vy, vz, rx, ry, rz, -pitch)
  ;[ax, ay, az] = rot(ax, ay, az, 0, 1, 0, -yaw)
  return [px + ax * r, py + ay * r, pz + az * r]
}
