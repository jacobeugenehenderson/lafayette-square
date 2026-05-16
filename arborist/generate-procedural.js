/**
 * generate-procedural.js — v1 stopgap procedural tree generator.
 *
 * Resurrects the pre-43c4aa3 `ParkTrees` branching algorithm as a headless
 * Arborist generator. Emits multi-node source GLBs (one per morphology, with
 * N variant nodes) under /tmp, then shells out to publish-glb.js so the
 * existing variant-split / LOD / manifest pipeline runs unmodified.
 *
 * Species (5, mirrors leafTypes.json morphology axis):
 *   procedural_broadleaf  procedural_conifer  procedural_ornamental
 *   procedural_columnar   procedural_weeping
 *
 * Each variant in v1 is a plain `params` object — same signature the eventual
 * Arborist UI will bind sliders to. No hardcoded shortcuts.
 *
 * Algorithm source: commit 43c4aa3~1, src/components/LafayettePark.jsx lines
 * 440–880 (function ParkTrees). growBranch / addLeaf / makeBranch / paint and
 * the per-shape branching configs are lifted verbatim. Runtime-only bits
 * (useEffect matrix wiring, onBeforeCompile shaders, panel reactivity) are
 * dropped — those live in treeAtlasMaterial.js or are obviated by the
 * per-instance baked pipeline.
 *
 * Usage:  node arborist/generate-procedural.js [--species procedural_<id>]
 *
 * Phase A note (v1.5 in-Arborist authoring, 2026-05-15): this module is also
 * imported by `arborist/serve.js` for the dice / adopt / publish endpoints.
 * Side-effect `main()` is therefore guarded by an `import.meta.url` check;
 * importing the module does NOT republish. Operator-overlays land in
 * `arborist/state/procedural_<species>/seedlings.json`; the canonical
 * `PRESETS` table below is the fallback for fresh checkouts.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { runSCA, DEFAULT_SCA_BY_PRESET } from './spaceColonization.js'
import { NodeIO, Document } from '@gltf-transform/core'
import sharp from 'sharp'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const TAU = Math.PI * 2

// Deterministic hash → [0, 1). Same as the resurrected ParkTrees.
function seed(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s) }

// ── Phase C geometric polish primitives ──────────────────────────────────
//
// Non-linear taper, per-vertex radial noise, flange-ring helper, and a
// triangular buttress-fin builder. All four feed the cylinder-emission
// sites (makeBranch, buildTaperedCylinderBetween, trunk + root-flare). The
// goal is to break the smooth-cylinder regularity that makes the Phase B
// photo bark wrap look computer-generated, without touching the shader
// path (see NOTES Phase C, 2026-05-16). Author at source-GLB ("lod0")
// quality; publish-glb.js's `simplify` chain produces lod1/lod2 at fixed
// ratios of lod0.
const PHASE_C_RADIAL_SEGS = 12

// r(0) = rBase, r(1) = rTop exactly. Slow thinning near base, fast near tip.
// exponent = 2 is the starter; visual reads as a "real" branch instead of a
// CAD cone. Same call signature as a linear lerp so callers swap one line.
function nonLinearTaper(rBase, rTop, t, exponent = 2) {
  return rTop + (rBase - rTop) * Math.pow(1 - t, exponent)
}

// Displace each cylinder vertex radially by ±displacementScale via the
// deterministic seed() hash. Parameterized by (angle, branch-global H) so
// adjacent segment cylinders along the same branch hash to the same noise
// at their shared interface H — no visible seam ridges. Apply BEFORE any
// transforms so atan2(z, x) is the local-frame angle and Y is the local
// cylinder axis. SCA edges share a node position but their local frames
// don't align across edges; for them the per-edge displacement still
// breaks circular cross-section even though seam continuity is not
// guaranteed (flagged in NOTES).
function applyRadialNoise(geo, branchHStart, branchHLen, displacementScale, seedOffset) {
  const pos = geo.attributes.position
  const len = Math.max(branchHLen, 1e-6)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const radialDist = Math.sqrt(x * x + z * z)
    if (radialDist < 1e-6) continue   // skip axial/cap vertices
    const angle = Math.atan2(z, x)
    const localFrac = (y + len * 0.5) / len      // [0, 1] across this cylinder
    const globalH = branchHStart + localFrac * len
    const noise = (seed(seedOffset + angle * 7.3 + globalH * 4.1) - 0.5) * 2
    const f = 1 + noise * displacementScale
    pos.setX(i, x * f)
    pos.setZ(i, z * f)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
}

// Short flared frustum at the BASE of a child branch where a parent splits.
// Bottom (at parentPos) radius = childRadius * 1.3; top (along the
// child-direction axis, flangeLen above parentPos) radius = childRadius.
// Hides the hard cylinder-cylinder intersection at branching joints.
const _flY = new THREE.Vector3(0, 1, 0)
const _flDir = new THREE.Vector3()
const _flQuat = new THREE.Quaternion()
function makeFlangeRing(parentPos, childPos, childRadius, segs = PHASE_C_RADIAL_SEGS, flangeRingScale = 1.3) {
  _flDir.set(childPos[0] - parentPos[0], childPos[1] - parentPos[1], childPos[2] - parentPos[2])
  const dist = _flDir.length()
  if (dist < 1e-4) return null
  _flDir.divideScalar(dist)
  const flangeLen = Math.min(2 * childRadius, dist * 0.6)
  if (flangeLen < 1e-3) return null
  const cyl = new THREE.CylinderGeometry(childRadius, childRadius * flangeRingScale, flangeLen, segs)
  cyl.translate(0, flangeLen / 2, 0)
  _flQuat.setFromUnitVectors(_flY, _flDir)
  cyl.applyQuaternion(_flQuat)
  cyl.translate(parentPos[0], parentPos[1], parentPos[2])
  return cyl
}

// Subtle triangular buttress fin: tall at trunk base, tapers to nothing at
// the top so the silhouette stays "Midwestern broadleaf" (maple/oak/locust)
// rather than tropical/banyan. ~6 visible faces × 2 triangles ≈ 8 tris/fin.
// All four attributes (position/normal/uv/index) so mergeGeometries stays
// consistent with the surrounding CylinderGeometry siblings.
function makeButtressFin(trunkRadius, outward, height, thickness) {
  const r = trunkRadius
  const t = thickness / 2
  const o = r + outward
  const positions = new Float32Array([
    // bottom triangle (Y=0)
    r, 0, -t,
    r, 0,  t,
    o, 0,  0,
    // top edge (Y=height): outer tip collapses to trunk surface so the fin
    // tapers to nothing at the top
    r, height, -t,
    r, height,  t,
    r, height,  0,
  ])
  const indices = new Uint16Array([
    // bottom triangle, normal -Y
    0, 1, 2,
    // top "triangle" (degenerate, collapsed to trunk-surface line)
    3, 5, 4,
    // outer face (between bottom outer tip and top collapsed edge)
    1, 5, 2,
    1, 4, 5,
    2, 5, 0,
    0, 5, 3,
    // inner face (trunk-side)
    0, 3, 1,
    1, 3, 4,
  ])
  const uvs = new Float32Array([
    0, 0,  1, 0,  0.5, 0,
    0, 1,  1, 1,  0.5, 1,
  ])
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.setIndex(new THREE.BufferAttribute(indices, 1))
  geo.computeVertexNormals()
  return geo
}

// ── Generator: pure function ─────────────────────────────────────────────
//
// generateTreeMesh(params) → { barkGeo, leafGeo }
//
// barkGeo: merged THREE.BufferGeometry (trunk + flare + every branch cylinder)
// leafGeo: merged THREE.BufferGeometry of leaf cards (one quad per leaf)
//
// params is the contract the eventual Arborist UI will bind sliders to.
// Discipline: every preset entry in the table below MUST be a plain params
// object. No hardcoded shortcuts.
export function generateTreeMesh({
  preset,
  seedN,
  dbh,
  canopyR,
  canopyH,
  branching,    // { primaryN, primaryVar, childN, childVar, spread, baseTilt, tiltVar, lenRatio, droopPerGen, maxGen }
  leafMorph,
  envelope,     // Phase D — SCA envelope override (rounded_oval/umbrella/tight_column/broad_low; width/height/asymmetry/offsetYFrac)
  sca,          // Phase D — SCA tunables override (tropism, attractorCount, influenceRadius, killRadius, stepLength, maxIters)
}) {
  const woodGeos = []
  const leaves = []

  const r = (n) => seed(seedN * 137 + n)
  const trunkRBot = dbh * 0.015 + 0.05
  const trunkRTop = trunkRBot * 0.6
  const trunkH = canopyH * 0.5 + 1.5   // anchor; per-preset trunkH already baked into canopyH/canopyR

  // ── Branch + leaf primitives (resurrected from ParkTrees 43c4aa3~1) ────

  function makeBranch(bx, by, bz, az, ti, length, rBot, rTop, segs, nBend, bSeed) {
    const n = nBend || 1
    const segLen = length / n
    const geos = []
    let cx = bx, cy = by, cz = bz
    // Phase C: 12 radial segs (publish-glb simplifies to lod1/lod2 at fixed
    // ratios). Non-linear taper sampled at branch-global t — branch retains
    // base thickness longer, thins fast toward the tip. Per-segment noise
    // hashed by (angle, branchHStart+localY) so adjacent segments share the
    // same noise at their interface H (no visible seam ridges along a
    // straight branch's segment chain).
    const radialSegs = PHASE_C_RADIAL_SEGS
    const applyNoise = rBot > 0.05
    for (let s = 0; s < n; s++) {
      const t0 = s / n, t1 = (s + 1) / n
      const r0 = nonLinearTaper(rBot, rTop, t0, 2)
      const r1 = nonLinearTaper(rBot, rTop, t1, 2)
      const geo = new THREE.CylinderGeometry(r1, r0, segLen, radialSegs)
      if (applyNoise) applyRadialNoise(geo, s * segLen, segLen, 0.05, bSeed)
      geo.translate(0, segLen / 2, 0)
      geo.rotateZ(ti)
      geo.rotateY(az)
      geo.translate(cx, cy, cz)
      geos.push(geo)
      cx -= segLen * Math.sin(ti) * Math.cos(az)
      cy += segLen * Math.cos(ti)
      cz += segLen * Math.sin(ti) * Math.sin(az)
      if (s < n - 1) {
        az += (seed(bSeed + s * 7) - 0.5) * 0.35
        ti += (seed(bSeed + s * 7 + 3) - 0.5) * 0.2
      }
    }
    return { geos, tx: cx, ty: cy, tz: cz }
  }

  function addLeaf(cx, cy, cz, radius, rng) {
    const r2 = seed(rng * 10000 + 1)
    const r3 = seed(rng * 10000 + 2)
    const r4 = seed(rng * 10000 + 3)
    const r5 = seed(rng * 10000 + 4)
    const r6 = seed(rng * 10000 + 5)
    leaves.push({
      x: cx, y: cy, z: cz,
      sx: radius * 4.5 * (0.7 + r4 * 0.6),
      sy: radius * 3.5 * (0.7 + r5 * 0.6),
      sz: radius * 4.5 * (0.7 + r6 * 0.6),
      rx: (r2 - 0.5) * 0.7,
      ry: rng * TAU,
      rz: (r3 - 0.5) * 0.7,
    })
  }

  function growBranch(ox, oy, oz, az, ti, len, radius, gen, maxGen, rs, conf, emitFlange = true) {
    if (len < 0.12 || radius < 0.008) return
    // Phase C: radial seg count is now uniform across gens (set inside
    // makeBranch). nBend kept gen-aware — controls bend-count along the
    // branch, not radial resolution.
    const segs = PHASE_C_RADIAL_SEGS
    const nBend = gen <= 1 ? 3 : gen <= 2 ? 2 : 1
    const rTop = radius * (gen < maxGen ? 0.55 : 0.25)
    const br = makeBranch(ox, oy, oz, az, ti, len, radius, rTop, segs, nBend, rs + gen * 53)
    // Phase C: flange ring at every sub-branch's root (including
    // trunk-to-first-branch joints). Aimed along the first-segment exit
    // direction so the flare blends into the branch's first cylinder.
    if (emitFlange && radius > 0.02) {
      // First-segment direction matches the branch's az/ti convention
      // used by the makeBranch advance step (dx,dy,dz on segment 0).
      const segLen0 = len / nBend
      const dirX = -segLen0 * Math.sin(ti) * Math.cos(az)
      const dirY =  segLen0 * Math.cos(ti)
      const dirZ =  segLen0 * Math.sin(ti) * Math.sin(az)
      const flange = makeFlangeRing(
        [ox, oy, oz],
        [ox + dirX, oy + dirY, oz + dirZ],
        radius,
      )
      if (flange) woodGeos.push(flange)
    }
    br.geos.forEach(g => woodGeos.push(g))

    if (gen >= maxGen) {
      addLeaf(br.tx, br.ty, br.tz, len * 0.6, seed(rs + 500))
      return
    }

    const nChildren = gen === 0
      ? Math.floor(conf.primaryN + seed(rs) * conf.primaryVar)
      : Math.floor(conf.childN + seed(rs + 1) * conf.childVar)

    for (let c = 0; c < nChildren; c++) {
      const cAz = gen === 0
        ? (c / nChildren) * TAU + (seed(rs + c * 7 + 10) - 0.5) * 0.6
        : az + (c / nChildren - 0.5) * conf.spread + (seed(rs + c * 7 + 10) - 0.5) * 0.6
      const cTilt = gen === 0
        ? conf.baseTilt + seed(rs + c * 7 + 20) * conf.tiltVar
        : ti + (seed(rs + c * 7 + 20) - 0.35) * conf.tiltVar + conf.droopPerGen * gen
      const cLen = len * (conf.lenRatio + seed(rs + c * 7 + 30) * 0.12)
      const cR = rTop * (0.65 + seed(rs + c * 7 + 40) * 0.1)
      growBranch(br.tx, br.ty, br.tz, cAz, cTilt, cLen, cR,
        gen + 1, maxGen, rs + c * 200 + 1000, conf)
    }

    if (gen < maxGen - 1) {
      const sideN = seed(rs + 900) > 0.35 ? (seed(rs + 901) > 0.5 ? 2 : 1) : 1
      for (let s = 0; s < sideN; s++) {
        const t = 0.3 + seed(rs + s * 7 + 910) * 0.35
        const midX = ox + t * (br.tx - ox)
        const midY = oy + t * (br.ty - oy)
        const midZ = oz + t * (br.tz - oz)
        const sAz = az + (seed(rs + s * 7 + 920) - 0.5) * 2.5
        const sTilt = ti + 0.15 + seed(rs + s * 7 + 930) * 0.4 + conf.droopPerGen * gen
        const sLen = len * (0.35 + seed(rs + s * 7 + 940) * 0.12)
        const sR = rTop * 0.55
        growBranch(midX, midY, midZ, sAz, sTilt, sLen, sR,
          gen + 1, maxGen, rs + s * 300 + 5000, conf)
      }
    }
  }

  // ── Trunk (Phase C: 12 radial segs + radial noise) ────────────────────
  const trunkTopVis = (preset === 'conifer' || preset === 'columnar')
    ? trunkRTop * 0.2 : trunkRTop * 0.35
  const trunk = new THREE.CylinderGeometry(trunkTopVis, trunkRBot, trunkH, PHASE_C_RADIAL_SEGS)
  applyRadialNoise(trunk, 0, trunkH, 0.05, seedN * 11 + 17)
  trunk.translate(0, trunkH / 2, 0)
  const lean = (r(0) - 0.5) * 0.06
  if (Math.abs(lean) > 0.001) trunk.rotateZ(lean)
  trunk.translate(0, -0.25, 0)
  woodGeos.push(trunk)

  // ── Phase C: root flare + 6 subtle buttress fins ──────────────────────
  // Replaces the prior single flat-flare cylinder. Trunk reads as PLANTED,
  // not stuck-in; subtle radial ribbing reads as Midwestern broadleaf
  // (maple/oak/locust), not tropical/banyan. Fin parameters tuned for ~5–10 cm
  // outward protrusion, ~10–15 cm tall, ~3–5 cm thick.
  const flareTop = trunkRBot
  const flareBot = trunkRBot * 1.4
  const flareHeight = 0.4
  const flare = new THREE.CylinderGeometry(flareTop, flareBot, flareHeight, PHASE_C_RADIAL_SEGS)
  applyRadialNoise(flare, 0, flareHeight, 0.05, seedN * 11 + 999)
  flare.translate(0, flareHeight / 2 - 0.25, 0)
  woodGeos.push(flare)

  const finCount = 6
  const finOutward = 0.08
  const finHeight  = 0.12
  const finThick   = 0.04
  for (let f = 0; f < finCount; f++) {
    const az = (f / finCount) * TAU + r(700 + f) * 0.4
    const finGeo = makeButtressFin(flareBot, finOutward, finHeight, finThick)
    finGeo.rotateY(az)
    finGeo.translate(0, -0.25, 0)
    woodGeos.push(finGeo)
  }

  const maxGen = branching.maxGen
  const branchLen = canopyR * (0.8 + r(5) * 0.15)
  const branchR = trunkRTop * 0.6
  const rBase = seedN * 10000

  // ── Shape-specific branching (resurrected per-shape configs) ──────────
  if (preset === 'conifer') {
    const leaderH = canopyH * 0.9
    const leader = new THREE.CylinderGeometry(trunkRTop * 0.3, trunkRTop, leaderH, PHASE_C_RADIAL_SEGS)
    applyRadialNoise(leader, 0, leaderH, 0.05, seedN * 11 + 333)
    leader.translate(0, canopyH * 0.45, 0)
    leader.translate(0, trunkH, 0)
    woodGeos.push(leader)

    const layers = 6 + Math.floor(r(50) * 3)
    for (let l = 0; l < layers; l++) {
      const t = l / (layers - 1)
      const layerH = trunkH + canopyH * (0.05 + t * 0.85)
      const layerR = canopyR * (1.0 - t * 0.55)
      const brN = 3 + Math.floor(r(l + 60) * 2)
      const subMaxGen = t < 0.3 ? 2 : 1
      for (let b = 0; b < brN; b++) {
        const az = (b / brN) * TAU + r(l * 10 + b + 70) * 0.5
        const ti = 1.1 + (1 - t) * 0.3 + r(l * 10 + b + 80) * 0.2
        const len = layerR * (0.6 + r(l * 10 + b + 90) * 0.3)
        const rB = trunkRTop * Math.max(0.08, 0.25 - t * 0.12)
        growBranch(0, layerH, 0, az, ti, len, rB, 0, subMaxGen,
          rBase + l * 500 + b * 50, branching)
      }
    }
    addLeaf(0, trunkH + canopyH * 0.93, 0, canopyR * 0.2, r(300))

  } else {
    // ── Phase D (2026-05-15): SCA + tropism for the 4 non-conifer
    // morphologies. Envelope-driven branching replaces the v1 free-growth
    // recursion. Same generateTreeMesh() signature; new optional
    // `envelope` + `sca` params merged onto per-preset defaults
    // (DEFAULT_SCA_BY_PRESET). Generator algorithm is otherwise unchanged
    // — cylinders are still plain tapered Y-aligned, leaf cards still go
    // through addLeaf. Geometric polish (multi-seg crag, flange rings,
    // root flare) is Phase C; bark/leaf shaders are Phases B/F.
    const defaults = DEFAULT_SCA_BY_PRESET[preset] || DEFAULT_SCA_BY_PRESET.broadleaf
    const env = {
      profile:     (envelope && envelope.profile)     || defaults.envelope.profile,
      width:       (envelope && envelope.width    !== undefined) ? envelope.width    : canopyR,
      height:      (envelope && envelope.height   !== undefined) ? envelope.height   : canopyH,
      asymmetry:   (envelope && envelope.asymmetry!== undefined) ? envelope.asymmetry: defaults.envelope.asymmetry,
      offsetYFrac: (envelope && envelope.offsetYFrac !== undefined) ? envelope.offsetYFrac : defaults.envelope.offsetYFrac,
    }
    const scaCfg = { ...defaults.sca, ...(sca || {}) }

    // SCA picks up at the trunk top (the −0.25 matches the trunk's own
    // post-translate so the SCA root joins the visible trunk seamlessly).
    const trunkTop = [0, trunkH - 0.25, 0]
    const { nodes } = runSCA({
      envelope: env,
      sca: scaCfg,
      seedN,
      trunkBase: trunkTop,
      tipRadius: 0.012,
    })

    // Emit one tapered cylinder per edge. radius from Murray's law sits
    // on each node. We clamp the minimum radius so trunkward thin twigs
    // don't disappear to sub-pixel after publish-glb's prune pass.
    //
    // Phase C: 12 radial segs + per-vertex radial noise. Non-linear taper
    // emerges naturally across the SCA chain because Murray's law sets
    // each node's radius; a single edge is already "short" by stepLength
    // (~0.4 m) so per-edge non-linear taper would buy little.
    // Flange rings at children of TRUE branching nodes (parent has >1
    // child) — NOT at every interior segment-to-segment edge along a
    // single straight path; SCA emits a node per stepLength so every-edge
    // flanging would produce hundreds of visible rings per tree.
    const branchSegs = PHASE_C_RADIAL_SEGS
    let edgeIdx = 0
    for (const n of nodes) {
      if (!n.parent) continue
      const r0 = Math.max(0.01, n.parent.radius)
      const r1 = Math.max(0.008, n.radius)
      // Gate noise on radius — sub-mm displacement on twigs is invisible
      // and wastes publish time on computeVertexNormals.
      const noise = (r0 > 0.05) ? { scale: 0.05, seedOffset: seedN * 13 + edgeIdx } : null
      const cyl = buildTaperedCylinderBetween(n.parent.pos, n.pos, r0, r1, branchSegs, noise)
      if (cyl) woodGeos.push(cyl)
      // Flange ring only when parent IS a branching node (>1 child).
      if (n.parent.children.length > 1 && n.radius > 0.02) {
        const flange = makeFlangeRing(n.parent.pos, n.pos, n.radius)
        if (flange) woodGeos.push(flange)
      }
      edgeIdx++
    }

    // Leaf card at every tip. The seed stream is offset per-tip via the
    // node's index so adjacent tips don't render identical leaf cards.
    let tipIdx = 0
    for (const n of nodes) {
      if (n.children.length === 0) {
        const leafSeed = seed(seedN * 7919 + tipIdx * 31)
        addLeaf(n.pos[0], n.pos[1], n.pos[2], 0.5, leafSeed)
        tipIdx++
      }
    }
  }

  const barkGeo = woodGeos.length ? mergeGeometries(woodGeos, false) : null
  const leafGeo = leaves.length ? buildLeafGeometry(leaves) : null
  return { barkGeo, leafGeo, leafCount: leaves.length, woodCount: woodGeos.length }
}

// Build a single BufferGeometry with one quad per leaf card. Transforms are
// baked into vertex positions so the GLB carries plain triangles — runtime
// per-instance variation happens via InstancedMesh, not per-leaf.
function buildLeafGeometry(leaves) {
  const positions = new Float32Array(leaves.length * 4 * 3)
  const normals   = new Float32Array(leaves.length * 4 * 3)
  const uvs       = new Float32Array(leaves.length * 4 * 2)
  const indices   = new Uint32Array(leaves.length * 6)

  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const v = new THREE.Vector3()
  const nbase = new THREE.Vector3(0, 0, 1)
  const n = new THREE.Vector3()

  // Base quad in XY plane, UVs match leaf-card orientation (upright).
  const bv = [[-0.5, -0.5, 0], [0.5, -0.5, 0], [0.5, 0.5, 0], [-0.5, 0.5, 0]]
  const buv = [[0, 0], [1, 0], [1, 1], [0, 1]]

  for (let i = 0; i < leaves.length; i++) {
    const lf = leaves[i]
    e.set(lf.rx, lf.ry, lf.rz)
    q.setFromEuler(e)
    n.copy(nbase).applyQuaternion(q)
    for (let k = 0; k < 4; k++) {
      v.set(bv[k][0] * lf.sx, bv[k][1] * lf.sy, bv[k][2] * lf.sz).applyQuaternion(q)
      v.x += lf.x; v.y += lf.y; v.z += lf.z
      const pi = (i * 4 + k) * 3, ui = (i * 4 + k) * 2
      positions[pi] = v.x; positions[pi + 1] = v.y; positions[pi + 2] = v.z
      normals[pi] = n.x;   normals[pi + 1] = n.y;   normals[pi + 2] = n.z
      uvs[ui] = buv[k][0]; uvs[ui + 1] = buv[k][1]
    }
    const ii = i * 6, base = i * 4
    indices[ii]     = base
    indices[ii + 1] = base + 1
    indices[ii + 2] = base + 2
    indices[ii + 3] = base
    indices[ii + 4] = base + 2
    indices[ii + 5] = base + 3
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('normal',   new THREE.BufferAttribute(normals, 3))
  geo.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2))
  geo.setIndex(new THREE.BufferAttribute(indices, 1))
  return geo
}

// Tapered cylinder aligned along an arbitrary edge p0→p1. THREE's
// CylinderGeometry is Y-aligned and centered, so we translate to put the
// base at origin, rotate the Y axis to the edge direction, then translate
// to p0. Returns null for zero-length edges so the caller can skip them.
//
// Used by the SCA path (Phase D): one cylinder per node→parent edge, with
// Murray's-law radii at each end. Conifer's free-growth path still uses
// the original makeBranch() helper, which has its own per-segment bend
// loop and Y-aligned cylinder primitive.
const _bcY = new THREE.Vector3(0, 1, 0)
const _bcDir = new THREE.Vector3()
const _bcQuat = new THREE.Quaternion()
function buildTaperedCylinderBetween(p0, p1, r0, r1, segs, noise) {
  _bcDir.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2])
  const len = _bcDir.length()
  if (len < 1e-4) return null
  _bcDir.divideScalar(len)
  // CylinderGeometry args: (radiusTop, radiusBottom, height, radialSegs)
  const geo = new THREE.CylinderGeometry(r1, r0, len, segs)
  // Phase C: apply radial noise in LOCAL cylinder frame (cylinder still
  // Y-aligned, centered at origin) before the orient-to-edge transform —
  // atan2(z, x) gives the local angle and Y is the local axis. Each edge
  // is its own independent noise frame; SCA nodes connect at shared world
  // positions but local frames don't align across edges, so seam
  // continuity across SCA edges is not guaranteed (flagged in NOTES).
  if (noise) applyRadialNoise(geo, 0, len, noise.scale, noise.seedOffset)
  geo.translate(0, len / 2, 0)
  _bcQuat.setFromUnitVectors(_bcY, _bcDir)
  geo.applyQuaternion(_bcQuat)
  geo.translate(p0[0], p0[1], p0[2])
  return geo
}

// ── GLB authoring ────────────────────────────────────────────────────────
//
// One source GLB per species. Each variant is a separate top-level node
// named `procedural_<morph>_<n>` so publish-glb.js's `namesSuggestVariants`
// splits them automatically.

function writeAttrToDoc(doc, buffer, type, arr) {
  return doc.createAccessor()
    .setType(type)
    .setArray(arr)
    .setBuffer(buffer)
}

function geoToPrimitive(doc, buffer, geo, mat) {
  const prim = doc.createPrimitive().setMaterial(mat)

  // Compute and write min/max for POSITION (required by glTF spec).
  const posArr = new Float32Array(geo.attributes.position.array)
  const pos = writeAttrToDoc(doc, buffer, 'VEC3', posArr)
  // gltf-transform recomputes min/max from the typed array when needed.
  prim.setAttribute('POSITION', pos)

  const nor = writeAttrToDoc(doc, buffer, 'VEC3',
    new Float32Array(geo.attributes.normal.array))
  prim.setAttribute('NORMAL', nor)

  if (geo.attributes.uv) {
    const uv = writeAttrToDoc(doc, buffer, 'VEC2',
      new Float32Array(geo.attributes.uv.array))
    prim.setAttribute('TEXCOORD_0', uv)
  }

  if (geo.index) {
    const idxArr = geo.index.array
    const vertCount = geo.attributes.position.count
    const arr = vertCount > 65535
      ? new Uint32Array(idxArr)
      : new Uint16Array(idxArr)
    const idx = writeAttrToDoc(doc, buffer, 'SCALAR', arr)
    prim.setIndices(idx)
  }
  return prim
}

async function buildSourceGLB({ species, variants, barkBundle, leafPng, outPath, barkExtras }) {
  const doc = new Document()
  const buffer = doc.createBuffer()

  // Phase B (2026-05-15): bark is photo-PBR (color + normal from
  // public/textures/bark/<materialRef>/). Multiple species can reference the
  // same materialRef; atlas-survey sha1-dedups by texture bytes, so the
  // master atlas carries ONE bark tile per unique source material regardless
  // of how many species share it.
  const barkColorTex = doc.createTexture(`bark_${barkBundle.materialRef}_color`)
    .setImage(barkBundle.colorBytes).setMimeType('image/jpeg')
  const barkNormalTex = doc.createTexture(`bark_${barkBundle.materialRef}_normal`)
    .setImage(barkBundle.normalBytes).setMimeType('image/jpeg')
  const leafTex = doc.createTexture(`procedural_leaf_${species}`)
    .setImage(leafPng).setMimeType('image/png')

  const barkMat = doc.createMaterial('proceduralBark')
    .setBaseColorTexture(barkColorTex)
    .setNormalTexture(barkNormalTex)
    .setAlphaMode('OPAQUE')
    .setRoughnessFactor(0.9)
    .setMetallicFactor(0)
  const leafMat = doc.createMaterial('proceduralLeaves')
    .setBaseColorTexture(leafTex)
    .setAlphaMode('MASK')
    .setAlphaCutoff(0.5)
    .setDoubleSided(true)
    .setRoughnessFactor(0.85)
    .setMetallicFactor(0)

  const scene = doc.createScene()
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i]
    const mesh = doc.createMesh(`${species}_${i + 1}`)
    if (v.barkGeo) mesh.addPrimitive(geoToPrimitive(doc, buffer, v.barkGeo, barkMat))
    if (v.leafGeo) mesh.addPrimitive(geoToPrimitive(doc, buffer, v.leafGeo, leafMat))
    const node = doc.createNode(`${species}_${i + 1}`).setMesh(mesh)
    scene.addChild(node)
  }

  const io = new NodeIO()
  await io.write(outPath, doc)
}

// ── Bark + leaf textures ─────────────────────────────────────────────────
//
// Phase B (2026-05-15): bark is photo-PBR sourced from CC0 ambientCG / Poly
// Haven tileable materials under `public/textures/bark/<materialRef>/`. Each
// material directory carries `color.jpg`, `normal.jpg` (NormalGL convention),
// `roughness.jpg`, and a `LICENSE.txt`. Multiple species can reference the
// same `materialRef` (e.g. several broadleaf species → Bark007); the master
// atlas's sha1 dedup in `atlas-survey.js` collapses them to a single tile,
// so adding hero species is nearly free in atlas footprint.
//
// Phase B pillar 0.5 (NOTES.md): the Grove's single master atlas + sha1
// dedup is the load-bearing innovation that makes the heroes-on-fillers
// doctrine feasible at scale.

const BARK_DIR = path.join(REPO_ROOT, 'public/textures/bark')
const BARK_OUT_SIZE = 1024  // atlas-tile-friendly square target

// Pre-tile a source bark JPG into a BARK_OUT_SIZE×BARK_OUT_SIZE image
// containing cols×rows repeats of the resized source. Done at publish
// time so the runtime shader can sample directly via texture2D — hardware
// mipmap + anisotropic filtering then work natively. Avoids the
// atlas-tile + shader-fract tradeoff (wrap-line crawl OR uniform mip-blur)
// that bit us in B.1.a's polish loop. uvScale rounds to nearest integer;
// fractional values are quantized at this step (PRESETS uvScale values
// should be integers).
async function preTileBark(srcBytes, uvScale, mimeKind) {
  const cols = Math.max(1, Math.round(uvScale[0] || 1))
  const rows = Math.max(1, Math.round(uvScale[1] || 1))
  if (cols === 1 && rows === 1) return srcBytes
  const cellW = Math.floor(BARK_OUT_SIZE / cols)
  const cellH = Math.floor(BARK_OUT_SIZE / rows)
  const small = await sharp(srcBytes).resize(cellW, cellH).toBuffer()
  const composites = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      composites.push({ input: small, left: c * cellW, top: r * cellH })
    }
  }
  // Normal maps need flat-tangent-space backing (128, 128, 255); color
  // can stay (0, 0, 0). sharp normalizes to RGB regardless.
  const bg = (mimeKind === 'normal')
    ? { r: 128, g: 128, b: 255 }
    : { r: 0, g: 0, b: 0 }
  return await sharp({
    create: { width: cellW * cols, height: cellH * rows, channels: 3, background: bg },
  })
    .composite(composites)
    .jpeg({ quality: 90 })
    .toBuffer()
}

async function loadBarkBundle(materialRef, uvScale) {
  const matDir = path.join(BARK_DIR, materialRef)
  const [colorRaw, normalRaw] = await Promise.all([
    fs.readFile(path.join(matDir, 'color.jpg')),
    fs.readFile(path.join(matDir, 'normal.jpg')),
  ])
  const [colorBytes, normalBytes] = await Promise.all([
    preTileBark(colorRaw, uvScale, 'color'),
    preTileBark(normalRaw, uvScale, 'normal'),
  ])
  return { materialRef, colorBytes, normalBytes }
}

async function readLeafPng(morph) {
  return await fs.readFile(path.join(REPO_ROOT, 'public/textures/leaves', `${morph}.png`))
}

// ── Preset table — five species × 2–3 seed variants each ────────────────
//
// Every entry is a plain `params` object. Discipline (per design memorial in
// cartograph/NOTES.md): no hardcoded shortcuts. The eventual Arborist UI
// binds sliders to this same signature.

// Phase B per-species bark spec. Each entry binds a species to one of the
// CC0 photo-PBR materials under public/textures/bark/<materialRef>/ and
// authors the per-species defaults for the retint shader:
//   • materialRef: directory under public/textures/bark/
//   • uvScale: [circumferential, vertical] tile repeat on each branch cylinder
//     (1 = atlas tile sampled once across the cylinder; >1 = tiled tighter)
//   • tintBase: per-species default tint (hex). The Look-level
//     `design.materialColors[<speciesId>]` override wins at runtime.
//   • tintJitterRange: per-instance hue jitter amplitude (0..0.3 typical).
//     Adjacent trees of the same species hash off world-XZ to vary slightly.
//   • roughnessOverride: -1 = use the sampled roughness texture; 0..1 forces
//     a flat per-species roughness clamp.
//
// Hero species (G.1-G.5) will publish their own entries here on top of the
// 5 fillers. SpeedTree migration drops in at the same shape via material
// extras; the retint shader path survives unchanged (NOTES.md Phase B).
// uvScale per species starter values (Phase B.1.a, 2026-05-15): tile-pitch
// across the bark UV span. Tuned visually for Hero distance — broadleaf and
// weeping carry tighter circumferential repeat than the columnar / conifer
// trunks. Format is [circumferential, vertical]. Higher numbers = tighter
// tiling = finer-grained bark pattern across the cylinder surface.
// uvScale = [1, 1] disables the pre-tile entirely (loadBarkBundle returns
// the original 1024×1024 bark bytes unchanged). The B.1.a v2 pre-tile
// produced visible chevron/aliasing artifacts at Hero distance — anisotropic
// resize (8:1 vertical squish) crushed the bark grain into prominent
// screen-space patterns. Reverted to B-core baseline: each cylinder samples
// the full bark photo once across its length. Long trunks look stretched;
// short branches look right. Phase B.2 (texture arrays or 2K/4K sources)
// is the proper substrate fix.
export const BARK_BY_SPECIES = {
  procedural_broadleaf:  { materialRef: 'Bark007', uvScale: [1, 1], tintBase: '#ffffff', tintJitterRange: 0.08, roughnessOverride: -1 },
  procedural_conifer:    { materialRef: 'Bark012', uvScale: [1, 1], tintBase: '#ffffff', tintJitterRange: 0.06, roughnessOverride: -1 },
  procedural_ornamental: { materialRef: 'Bark003', uvScale: [1, 1], tintBase: '#ffffff', tintJitterRange: 0.10, roughnessOverride: -1 },
  procedural_columnar:   { materialRef: 'Bark004', uvScale: [1, 1], tintBase: '#ffffff', tintJitterRange: 0.05, roughnessOverride: -1 },
  procedural_weeping:    { materialRef: 'Bark015', uvScale: [1, 1], tintBase: '#ffffff', tintJitterRange: 0.07, roughnessOverride: -1 },
}

export const PRESETS = {
  procedural_broadleaf: {
    leafMorph: 'ovate_large',
    label: 'Procedural Broadleaf',
    variants: [
      { preset: 'broad', seedN: 11, dbh: 18, canopyR: 7.0,  canopyH: 7.0,  branching: { primaryN: 5, primaryVar: 3, childN: 2, childVar: 2, spread: 2.2, baseTilt: 0.75, tiltVar: 0.4,  lenRatio: 0.62, droopPerGen: 0.03, maxGen: 3 }, envelope: { profile: 'rounded_oval', asymmetry: 0,   offsetYFrac: 0 }, sca: { tropism: [0, 0, 0], attractorCount: 450, influenceRadius: 4.0, killRadius: 1.2, stepLength: 0.45, maxIters: 160 } },
      { preset: 'broad', seedN: 23, dbh: 24, canopyR: 9.0,  canopyH: 8.5,  branching: { primaryN: 5, primaryVar: 3, childN: 2, childVar: 2, spread: 2.2, baseTilt: 0.75, tiltVar: 0.4,  lenRatio: 0.62, droopPerGen: 0.03, maxGen: 3 }, envelope: { profile: 'rounded_oval', asymmetry: 0.1, offsetYFrac: 0 }, sca: { tropism: [0, 0, 0], attractorCount: 500, influenceRadius: 4.2, killRadius: 1.3, stepLength: 0.5,  maxIters: 160 } },
      { preset: 'broad', seedN: 41, dbh: 30, canopyR: 11.0, canopyH: 10.0, branching: { primaryN: 6, primaryVar: 2, childN: 3, childVar: 1, spread: 2.4, baseTilt: 0.70, tiltVar: 0.45, lenRatio: 0.60, droopPerGen: 0.03, maxGen: 3 }, envelope: { profile: 'rounded_oval', asymmetry: 0,   offsetYFrac: 0 }, sca: { tropism: [0, 0, 0], attractorCount: 600, influenceRadius: 4.5, killRadius: 1.4, stepLength: 0.55, maxIters: 180 } },
    ],
  },
  procedural_conifer: {
    leafMorph: 'short_needle',
    label: 'Procedural Conifer',
    variants: [
      { preset: 'conifer', seedN: 13, dbh: 14, canopyR: 4.0, canopyH: 12.0, branching: { primaryN: 2, primaryVar: 1, childN: 2, childVar: 1, spread: 1.5, baseTilt: 1.2, tiltVar: 0.3, lenRatio: 0.55, droopPerGen: 0.05, maxGen: 2 } },
      { preset: 'conifer', seedN: 29, dbh: 20, canopyR: 5.0, canopyH: 16.0, branching: { primaryN: 2, primaryVar: 1, childN: 2, childVar: 1, spread: 1.5, baseTilt: 1.2, tiltVar: 0.3, lenRatio: 0.55, droopPerGen: 0.05, maxGen: 2 } },
    ],
  },
  procedural_ornamental: {
    leafMorph: 'ovate_small',
    label: 'Procedural Ornamental',
    variants: [
      { preset: 'ornamental', seedN: 17, dbh: 8,  canopyR: 4.0, canopyH: 3.5, branching: { primaryN: 4, primaryVar: 2, childN: 2, childVar: 2, spread: 1.8, baseTilt: 0.7, tiltVar: 0.35, lenRatio: 0.62, droopPerGen: 0.03, maxGen: 3 }, envelope: { profile: 'broad_low', asymmetry: 0,    offsetYFrac: 0 }, sca: { tropism: [0, -0.05, 0], attractorCount: 350, influenceRadius: 3.5, killRadius: 1.1, stepLength: 0.4,  maxIters: 160 } },
      { preset: 'ornamental', seedN: 31, dbh: 12, canopyR: 5.5, canopyH: 4.5, branching: { primaryN: 4, primaryVar: 2, childN: 2, childVar: 2, spread: 1.8, baseTilt: 0.7, tiltVar: 0.35, lenRatio: 0.62, droopPerGen: 0.03, maxGen: 3 }, envelope: { profile: 'broad_low', asymmetry: 0.15, offsetYFrac: 0 }, sca: { tropism: [0, -0.05, 0], attractorCount: 400, influenceRadius: 3.6, killRadius: 1.2, stepLength: 0.4,  maxIters: 160 } },
    ],
  },
  procedural_columnar: {
    leafMorph: 'narrow',
    label: 'Procedural Columnar',
    variants: [
      { preset: 'columnar', seedN: 19, dbh: 14, canopyR: 2.5, canopyH: 9.0,  branching: { primaryN: 5, primaryVar: 2, childN: 2, childVar: 1, spread: 1.2, baseTilt: 0.35, tiltVar: 0.2, lenRatio: 0.58, droopPerGen: 0.02, maxGen: 3 }, envelope: { profile: 'tight_column', asymmetry: 0, offsetYFrac: 0 }, sca: { tropism: [0, +0.3, 0], attractorCount: 350, influenceRadius: 3.0, killRadius: 1.0, stepLength: 0.45, maxIters: 180 } },
      { preset: 'columnar', seedN: 37, dbh: 18, canopyR: 3.0, canopyH: 11.0, branching: { primaryN: 5, primaryVar: 2, childN: 2, childVar: 1, spread: 1.2, baseTilt: 0.35, tiltVar: 0.2, lenRatio: 0.58, droopPerGen: 0.02, maxGen: 3 }, envelope: { profile: 'tight_column', asymmetry: 0, offsetYFrac: 0 }, sca: { tropism: [0, +0.3, 0], attractorCount: 400, influenceRadius: 3.2, killRadius: 1.1, stepLength: 0.45, maxIters: 200 } },
    ],
  },
  procedural_weeping: {
    leafMorph: 'narrow',
    label: 'Procedural Weeping',
    variants: [
      { preset: 'weeping', seedN: 47, dbh: 16, canopyR: 6.0, canopyH: 5.0, branching: { primaryN: 5, primaryVar: 2, childN: 3, childVar: 1, spread: 2.0, baseTilt: 0.5, tiltVar: 0.35, lenRatio: 0.62, droopPerGen: 0.35, maxGen: 3 }, envelope: { profile: 'umbrella', asymmetry: 0,   offsetYFrac: -0.6 }, sca: { tropism: [0, -0.4, 0], attractorCount: 450, influenceRadius: 3.5, killRadius: 1.1, stepLength: 0.45, maxIters: 200 } },
      { preset: 'weeping', seedN: 59, dbh: 22, canopyR: 7.5, canopyH: 6.0, branching: { primaryN: 5, primaryVar: 2, childN: 3, childVar: 1, spread: 2.0, baseTilt: 0.5, tiltVar: 0.35, lenRatio: 0.62, droopPerGen: 0.35, maxGen: 3 }, envelope: { profile: 'umbrella', asymmetry: 0.1, offsetYFrac: -0.6 }, sca: { tropism: [0, -0.5, 0], attractorCount: 500, influenceRadius: 3.6, killRadius: 1.2, stepLength: 0.5,  maxIters: 220 } },
    ],
  },
}

// ── Post-publish manifest patch ──────────────────────────────────────────
//
// publish-glb.js writes each variant with `quality: 0` (sentinel: needs an
// operator rating). Procedural variants are v1 stopgap "Fill" tier — set
// `qualityOverride: 2` on every variant, which matches what the Rating UI
// writes. build-index.js then ships them.

async function patchManifestForFillTier(species) {
  const p = path.join(REPO_ROOT, 'public/trees', species, 'manifest.json')
  const m = JSON.parse(await fs.readFile(p, 'utf8'))
  for (const v of m.variants ?? []) v.qualityOverride = 2
  // Phase B: stamp the per-species bark spec onto the published species
  // manifest. bake-look reads this when the look's atlas is rebaked and
  // surfaces it into trees-atlas.json#/barkBySpecies — the runtime then
  // looks up tint+jitter+roughness uniforms per (species, draw call).
  const bark = BARK_BY_SPECIES[species]
  if (bark) m.bark = { ...bark }
  await fs.writeFile(p, JSON.stringify(m, null, 2))
}

// ── Roster sync — add published variants to a Look's design.json#/trees ──
//
// Idempotent: only writes if the set changes. Existing non-procedural entries
// are preserved.

async function syncLookRoster(lookName, speciesList) {
  const p = path.join(REPO_ROOT, 'public/looks', lookName, 'design.json')
  const design = JSON.parse(await fs.readFile(p, 'utf8'))
  const trees = Array.isArray(design.trees) ? design.trees : []
  const haveKeys = new Set(trees.map(t => `${t.species}|${t.variantId}`))
  const want = []
  for (const species of speciesList) {
    const manifestPath = path.join(REPO_ROOT, 'public/trees', species, 'manifest.json')
    const m = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
    for (const v of m.variants ?? []) want.push({ species, variantId: v.id })
  }
  const newRoster = [...trees]
  let added = 0
  for (const w of want) {
    if (!haveKeys.has(`${w.species}|${w.variantId}`)) {
      newRoster.push(w)
      haveKeys.add(`${w.species}|${w.variantId}`)
      added++
    }
  }
  if (added > 0) {
    design.trees = newRoster
    await fs.writeFile(p, JSON.stringify(design, null, 2))
  }
  return added
}

// ── Species-map sync — ensure the 5 procedural species are declared ─────
//
// publish-glb.js's `guessCategory` consults species-map.json for `leafMorph`
// + `hasFlowers` hints. We need:
//   procedural_columnar  → category 'columnar'   (name regex covers this)
//   procedural_weeping   → category 'weeping'    (name regex covers this)
//   procedural_conifer   → category 'conifer'    (leafMorph=short_needle hits /needle|scale/)
//   procedural_broadleaf → category 'broadleaf'  (leafMorph=ovate_large hits /ovate/)
//   procedural_ornamental→ category 'ornamental' (hasFlowers:true)

async function syncSpeciesMap() {
  const p = path.join(__dirname, 'species-map.json')
  const map = JSON.parse(await fs.readFile(p, 'utf8'))
  if (!map.species) map.species = {}
  let touched = false
  for (const [speciesId, cfg] of Object.entries(PRESETS)) {
    const wantCategory = (
      speciesId === 'procedural_columnar'   ? 'columnar' :
      speciesId === 'procedural_weeping'    ? 'weeping' :
      speciesId === 'procedural_conifer'    ? 'conifer' :
      speciesId === 'procedural_ornamental' ? 'ornamental' :
                                              'broadleaf'
    )
    const entry = {
      label: cfg.label,
      scientific: null,
      source: 'procedural',
      inventoryNames: [],
      tier: 'fallback',
      leafMorph: cfg.leafMorph,
      barkMorph: null,
      deciduous: speciesId !== 'procedural_conifer',
      hasFlowers: speciesId === 'procedural_ornamental',
      tints: null,
      categoryHint: wantCategory,
    }
    const prev = map.species[speciesId]
    if (!prev || JSON.stringify(prev) !== JSON.stringify(entry)) {
      map.species[speciesId] = entry
      touched = true
    }
  }
  if (touched) await fs.writeFile(p, JSON.stringify(map, null, 2))
  return touched
}

// ── Seedlings overlay (v1.5 dice/adopt) ─────────────────────────────────
//
// Effective seedlings per species = `arborist/state/procedural_<id>/seedlings.json`
// if present, else synthesized from the PRESETS table. Operator's diced +
// adopted seeds live in state/; the published GLB artifacts (which ARE
// committed) reflect whatever was last adopted + republished. Fresh checkouts
// with no state file fall back to PRESETS — reproducible v1 behavior.

function seedlingsStatePath(species) {
  return path.join(REPO_ROOT, 'arborist/state', species, 'seedlings.json')
}

// Returns the effective per-variant payload [{slot, seed, params}].
// `params` is intentionally empty in Phase A; subsequent phases populate it
// with envelope / tropism / bark / leaf fields.
export async function readEffectiveSeedlings(species) {
  const cfg = PRESETS[species]
  if (!cfg) throw new Error(`unknown procedural species: ${species}`)
  try {
    const json = JSON.parse(await fs.readFile(seedlingsStatePath(species), 'utf8'))
    if (Array.isArray(json.variants) && json.variants.length > 0) return json.variants
  } catch { /* fall through to PRESETS */ }
  return cfg.variants.map((v, i) => ({ slot: i + 1, seed: v.seedN, params: {} }))
}

export async function writeSeedlings(species, variants) {
  if (!PRESETS[species]) throw new Error(`unknown procedural species: ${species}`)
  const stateDir = path.dirname(seedlingsStatePath(species))
  await fs.mkdir(stateDir, { recursive: true })
  await fs.writeFile(seedlingsStatePath(species), JSON.stringify({
    species, variants, savedAt: Date.now(),
  }, null, 2))
}

// Resolve a {slot, seed, params} pair to the full params object the
// algorithm expects. PRESETS[species].variants[(slot-1) % N] is the base;
// per-overlay `params` lays on top; `seed` writes to `seedN`. Single
// source of truth so the dice endpoint, the adopt-then-publish path, and
// main() all agree.
//
// Phase D — nested `envelope`, `sca`, and `branching` objects need a
// one-level-deep merge so a partial overlay (e.g. operator dragging just
// the tropism.Y slider, which writes `{sca: {tropism: [...]}}`) doesn't
// wipe the sibling fields off the base PRESET. Top-level keys (preset,
// dbh, canopyR, etc.) remain shallow-merged.
const NESTED_PARAM_KEYS = ['envelope', 'sca', 'branching']
function resolveVariantParams(species, { slot, seed, params }) {
  const cfg = PRESETS[species]
  const base = cfg.variants[(slot - 1) % cfg.variants.length]
  const merged = { ...base, ...(params || {}), seedN: seed }
  for (const k of NESTED_PARAM_KEYS) {
    if (base[k] || (params && params[k])) {
      merged[k] = { ...(base[k] || {}), ...((params && params[k]) || {}) }
    }
  }
  return merged
}

// Build a single-variant GLB buffer in memory. Used by `POST /procedural/generate`
// to stream a live preview into ProceduralWorkstage without touching the
// committed manifest under public/trees/. Determinism: same {species, slot,
// seed, params} → byte-identical bytes (modulo the /tmp filename, which is
// the file off disk; the GLB contents themselves are deterministic).
export async function generateSingleVariantGLB({ species, slot, seed, params }) {
  const cfg = PRESETS[species]
  if (!cfg) throw new Error(`unknown procedural species: ${species}`)
  const effective = resolveVariantParams(species, { slot, seed, params })
  const { barkGeo, leafGeo } = generateTreeMesh(effective)
  const barkSpec = BARK_BY_SPECIES[species]
  const barkBundle = await loadBarkBundle(barkSpec.materialRef, barkSpec.uvScale)
  const leafPng = await readLeafPng(cfg.leafMorph)
  const tmpPath = path.join('/tmp', `${species}-preview-${process.pid}-${Date.now()}.glb`)
  await buildSourceGLB({
    species,
    variants: [{ barkGeo, leafGeo }],
    barkBundle, leafPng, outPath: tmpPath,
  })
  const buf = await fs.readFile(tmpPath)
  await fs.unlink(tmpPath).catch(() => {})
  return buf
}

// ── Main ─────────────────────────────────────────────────────────────────

function parseCliFilter(argv) {
  const i = argv.indexOf('--species')
  if (i === -1 || !argv[i + 1]) return null
  return argv[i + 1]
}

async function main() {
  console.log('[generate-procedural] resurrecting pre-43c4aa3 ParkTrees algorithm')

  const onlySpecies = parseCliFilter(process.argv)
  if (onlySpecies && !PRESETS[onlySpecies]) {
    console.error(`[generate-procedural] unknown --species ${onlySpecies}; valid: ${Object.keys(PRESETS).join(', ')}`)
    process.exit(1)
  }

  // Sync species-map BEFORE publish so publish-glb.js can read species hints.
  const mapTouched = await syncSpeciesMap()
  console.log(`[generate-procedural] species-map.json ${mapTouched ? 'updated' : 'unchanged'}`)

  const speciesToBuild = onlySpecies
    ? [[onlySpecies, PRESETS[onlySpecies]]]
    : Object.entries(PRESETS)

  for (const [species, cfg] of speciesToBuild) {
    const seedlings = await readEffectiveSeedlings(species)
    console.log(`\n[generate-procedural] === ${species} (${seedlings.length} variants) ===`)

    const barkSpec = BARK_BY_SPECIES[species]
    const barkBundle = await loadBarkBundle(barkSpec.materialRef, barkSpec.uvScale)
    const leafPng = await readLeafPng(cfg.leafMorph)
    console.log(`  bark: ${barkSpec.materialRef} pre-tiled ${barkSpec.uvScale[0]}×${barkSpec.uvScale[1]} (color ${(barkBundle.colorBytes.length / 1024).toFixed(0)} KB, normal ${(barkBundle.normalBytes.length / 1024).toFixed(0)} KB)`)

    const variants = seedlings.map((sd, i) => {
      const effective = resolveVariantParams(species, sd)
      const { barkGeo, leafGeo, leafCount, woodCount } = generateTreeMesh(effective)
      console.log(`  slot ${sd.slot} (seed ${sd.seed}): ${woodCount} branches, ${leafCount} leaves`)
      return { barkGeo, leafGeo }
    })

    const tmpGlb = path.join('/tmp', `${species}.glb`)
    await buildSourceGLB({ species, variants, barkBundle, leafPng, outPath: tmpGlb })
    const stat = await fs.stat(tmpGlb)
    console.log(`  → ${tmpGlb} (${(stat.size / 1024).toFixed(0)} KB)`)

    // Shell out to publish-glb.js. Pipeline must round-trip unmodified
    // (per cartograph/NOTES.md 2026-05-14 design memorial).
    execFileSync('node', [
      path.join(__dirname, 'publish-glb.js'),
      '--source', tmpGlb,
      '--species', species,
      '--label', cfg.label,
    ], { stdio: 'inherit', cwd: REPO_ROOT })

    // Mark every variant as quality=2 (Fill tier) so build-index.js ships
    // them. publish-glb.js writes quality=0 (Untouched sentinel) by default;
    // for the v1 stopgap roster every procedural variant is Fill.
    await patchManifestForFillTier(species)
  }

  // Add published variants to the lafayette-square Look's roster.
  const rosterSpecies = onlySpecies ? [onlySpecies] : Object.keys(PRESETS)
  const added = await syncLookRoster('lafayette-square', rosterSpecies)
  console.log(`\n[generate-procedural] roster: added ${added} variant(s) to lafayette-square/design.json`)

  console.log('\n[generate-procedural] done. Next:')
  console.log('  node arborist/bake-look.js  --look lafayette-square')
  console.log('  node arborist/bake-trees.js --look lafayette-square')
}

// Only run the publish pipeline when invoked as a script. Importing the
// module (e.g. from arborist/serve.js for the dice endpoint) MUST be
// side-effect-free.
const invokedAsScript = (() => {
  try { return fileURLToPath(import.meta.url) === process.argv[1] }
  catch { return false }
})()
if (invokedAsScript) {
  main().catch(err => {
    console.error('[generate-procedural] FAILED:', err)
    process.exit(1)
  })
}
