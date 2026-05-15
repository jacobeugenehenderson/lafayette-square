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
    for (let s = 0; s < n; s++) {
      const t0 = s / n, t1 = (s + 1) / n
      const r0 = rBot + (rTop - rBot) * t0
      const r1 = rBot + (rTop - rBot) * t1
      const geo = new THREE.CylinderGeometry(r1, r0, segLen, segs)
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

  function growBranch(ox, oy, oz, az, ti, len, radius, gen, maxGen, rs, conf) {
    if (len < 0.12 || radius < 0.008) return
    const segs = gen <= 1 ? 6 : gen <= 2 ? 4 : 3
    const nBend = gen <= 1 ? 3 : gen <= 2 ? 2 : 1
    const rTop = radius * (gen < maxGen ? 0.55 : 0.25)
    const br = makeBranch(ox, oy, oz, az, ti, len, radius, rTop, segs, nBend, rs + gen * 53)
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

  // ── Trunk ──────────────────────────────────────────────────────────────
  const trunkTopVis = (preset === 'conifer' || preset === 'columnar')
    ? trunkRTop * 0.2 : trunkRTop * 0.35
  const trunk = new THREE.CylinderGeometry(trunkTopVis, trunkRBot, trunkH, 8)
  trunk.translate(0, trunkH / 2, 0)
  const lean = (r(0) - 0.5) * 0.06
  if (Math.abs(lean) > 0.001) trunk.rotateZ(lean)
  trunk.translate(0, -0.25, 0)
  woodGeos.push(trunk)

  const flare = new THREE.CylinderGeometry(trunkRBot, trunkRBot * 1.4, 0.4, 8)
  flare.translate(0, 0.2, 0)
  flare.translate(0, -0.25, 0)
  woodGeos.push(flare)

  const maxGen = branching.maxGen
  const branchLen = canopyR * (0.8 + r(5) * 0.15)
  const branchR = trunkRTop * 0.6
  const rBase = seedN * 10000

  // ── Shape-specific branching (resurrected per-shape configs) ──────────
  if (preset === 'conifer') {
    const leader = new THREE.CylinderGeometry(trunkRTop * 0.3, trunkRTop, canopyH * 0.9, 6)
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

  } else if (preset === 'weeping' || preset === 'columnar') {
    const pN = 5 + Math.floor(r(50) * 2)
    for (let p = 0; p < pN; p++) {
      const az = (p / pN) * TAU + (r(p + 10) - 0.5) * 0.5
      const attachH = trunkH * (preset === 'weeping'
        ? 0.6 + r(p + 40) * 0.3
        : 0.4 + r(p + 40) * 0.5)
      const len = preset === 'weeping'
        ? canopyR * (0.6 + r(p + 30) * 0.2)
        : branchLen * 0.7
      const baseTilt = branching.baseTilt + r(p + 20) * 0.3
      growBranch(0, attachH, 0, az, baseTilt, len, branchR, 1, maxGen,
        rBase + p * 1000, branching)
    }

  } else {
    // broadleaf / ornamental — full recursive crown
    const pN = Math.floor(branching.primaryN + r(50) * branching.primaryVar)
    for (let p = 0; p < pN; p++) {
      const az = (p / pN) * TAU + (r(p + 10) - 0.5) * 0.5
      const attachH = trunkH * (0.55 + r(p + 40) * 0.35)
      const scaffoldR = branchR * (1.0 + 0.3 * (1 - p / pN))
      growBranch(0, attachH, 0, az,
        branching.baseTilt + r(p + 20) * branching.tiltVar,
        branchLen, scaffoldR, 1, maxGen,
        rBase + p * 1000, branching)
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

async function buildSourceGLB({ species, variants, barkPng, leafPng, outPath }) {
  const doc = new Document()
  const buffer = doc.createBuffer()

  const barkTex = doc.createTexture('procedural_bark')
    .setImage(barkPng).setMimeType('image/png')
  const leafTex = doc.createTexture(`procedural_leaf_${species}`)
    .setImage(leafPng).setMimeType('image/png')

  const barkMat = doc.createMaterial('proceduralBark')
    .setBaseColorTexture(barkTex)
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
// Bark: a 64×64 solid-color PNG per species. Bake-look's `atlas-survey.js`
// requires every material to have a baseColorTexture (no-texture materials
// can't atlas — see atlas-survey.js:124). `publish-glb.js`'s
// `fallbackColorsForUnboundMaterials` sets baseColorFactor but does not add
// a texture, so we must author one explicitly. Vertex colors are stripped by
// bake-look's GLB rewriter (see bake-look.js:459), so per-tree bark variation
// from the original ParkTrees palette can't survive — settle for per-species
// for v1. SpeedTree migration restores the per-instance bark color via tinted
// baked-cards atlas tiles.

async function buildBarkPng(hex) {
  // 32×32 noisy brown — sharp-generated, deterministic per hex.
  const w = 32, h = 32, c = new THREE.Color(hex)
  const r0 = Math.round(c.r * 255), g0 = Math.round(c.g * 255), b0 = Math.round(c.b * 255)
  const buf = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const noise = (seed(x * 7 + y * 13) - 0.5) * 40
      const i = (y * w + x) * 4
      buf[i]     = Math.max(0, Math.min(255, r0 + noise))
      buf[i + 1] = Math.max(0, Math.min(255, g0 + noise))
      buf[i + 2] = Math.max(0, Math.min(255, b0 + noise))
      buf[i + 3] = 255
    }
  }
  return await sharp(buf, { raw: { width: w, height: h, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

async function readLeafPng(morph) {
  return await fs.readFile(path.join(REPO_ROOT, 'public/textures/leaves', `${morph}.png`))
}

// ── Preset table — five species × 2–3 seed variants each ────────────────
//
// Every entry is a plain `params` object. Discipline (per design memorial in
// cartograph/NOTES.md): no hardcoded shortcuts. The eventual Arborist UI
// binds sliders to this same signature.

export const BARK_BY_SPECIES = {
  procedural_broadleaf:  '#5a4030',
  procedural_conifer:    '#4d3828',
  procedural_ornamental: '#634838',
  procedural_columnar:   '#554030',
  procedural_weeping:    '#4a3525',
}

export const PRESETS = {
  procedural_broadleaf: {
    leafMorph: 'ovate_large',
    label: 'Procedural Broadleaf',
    variants: [
      { preset: 'broad', seedN: 11, dbh: 18, canopyR: 7.0,  canopyH: 7.0,  branching: { primaryN: 5, primaryVar: 3, childN: 2, childVar: 2, spread: 2.2, baseTilt: 0.75, tiltVar: 0.4,  lenRatio: 0.62, droopPerGen: 0.03, maxGen: 3 } },
      { preset: 'broad', seedN: 23, dbh: 24, canopyR: 9.0,  canopyH: 8.5,  branching: { primaryN: 5, primaryVar: 3, childN: 2, childVar: 2, spread: 2.2, baseTilt: 0.75, tiltVar: 0.4,  lenRatio: 0.62, droopPerGen: 0.03, maxGen: 3 } },
      { preset: 'broad', seedN: 41, dbh: 30, canopyR: 11.0, canopyH: 10.0, branching: { primaryN: 6, primaryVar: 2, childN: 3, childVar: 1, spread: 2.4, baseTilt: 0.70, tiltVar: 0.45, lenRatio: 0.60, droopPerGen: 0.03, maxGen: 3 } },
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
      { preset: 'ornamental', seedN: 17, dbh: 8,  canopyR: 4.0, canopyH: 3.5, branching: { primaryN: 4, primaryVar: 2, childN: 2, childVar: 2, spread: 1.8, baseTilt: 0.7, tiltVar: 0.35, lenRatio: 0.62, droopPerGen: 0.03, maxGen: 3 } },
      { preset: 'ornamental', seedN: 31, dbh: 12, canopyR: 5.5, canopyH: 4.5, branching: { primaryN: 4, primaryVar: 2, childN: 2, childVar: 2, spread: 1.8, baseTilt: 0.7, tiltVar: 0.35, lenRatio: 0.62, droopPerGen: 0.03, maxGen: 3 } },
    ],
  },
  procedural_columnar: {
    leafMorph: 'narrow',
    label: 'Procedural Columnar',
    variants: [
      { preset: 'columnar', seedN: 19, dbh: 14, canopyR: 2.5, canopyH: 9.0,  branching: { primaryN: 5, primaryVar: 2, childN: 2, childVar: 1, spread: 1.2, baseTilt: 0.35, tiltVar: 0.2, lenRatio: 0.58, droopPerGen: 0.02, maxGen: 3 } },
      { preset: 'columnar', seedN: 37, dbh: 18, canopyR: 3.0, canopyH: 11.0, branching: { primaryN: 5, primaryVar: 2, childN: 2, childVar: 1, spread: 1.2, baseTilt: 0.35, tiltVar: 0.2, lenRatio: 0.58, droopPerGen: 0.02, maxGen: 3 } },
    ],
  },
  procedural_weeping: {
    leafMorph: 'narrow',
    label: 'Procedural Weeping',
    variants: [
      { preset: 'weeping', seedN: 47, dbh: 16, canopyR: 6.0, canopyH: 5.0, branching: { primaryN: 5, primaryVar: 2, childN: 3, childVar: 1, spread: 2.0, baseTilt: 0.5, tiltVar: 0.35, lenRatio: 0.62, droopPerGen: 0.35, maxGen: 3 } },
      { preset: 'weeping', seedN: 59, dbh: 22, canopyR: 7.5, canopyH: 6.0, branching: { primaryN: 5, primaryVar: 2, childN: 3, childVar: 1, spread: 2.0, baseTilt: 0.5, tiltVar: 0.35, lenRatio: 0.62, droopPerGen: 0.35, maxGen: 3 } },
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

// Resolve a {slot, seed, params} pair to the full params object the algorithm
// expects. PRESETS[species].variants[(slot-1) % N] is the base; per-overlay
// `params` lays on top; `seed` writes to `seedN`. Single source of truth so
// the dice endpoint, the adopt-then-publish path, and main() all agree.
function resolveVariantParams(species, { slot, seed, params }) {
  const cfg = PRESETS[species]
  const base = cfg.variants[(slot - 1) % cfg.variants.length]
  return { ...base, ...(params || {}), seedN: seed }
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
  const barkPng = await buildBarkPng(BARK_BY_SPECIES[species])
  const leafPng = await readLeafPng(cfg.leafMorph)
  const tmpPath = path.join('/tmp', `${species}-preview-${process.pid}-${Date.now()}.glb`)
  await buildSourceGLB({
    species,
    variants: [{ barkGeo, leafGeo }],
    barkPng, leafPng, outPath: tmpPath,
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

    const barkPng = await buildBarkPng(BARK_BY_SPECIES[species])
    const leafPng = await readLeafPng(cfg.leafMorph)

    const variants = seedlings.map((sd, i) => {
      const effective = resolveVariantParams(species, sd)
      const { barkGeo, leafGeo, leafCount, woodCount } = generateTreeMesh(effective)
      console.log(`  slot ${sd.slot} (seed ${sd.seed}): ${woodCount} branches, ${leafCount} leaves`)
      return { barkGeo, leafGeo }
    })

    const tmpGlb = path.join('/tmp', `${species}.glb`)
    await buildSourceGLB({ species, variants, barkPng, leafPng, outPath: tmpGlb })
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
