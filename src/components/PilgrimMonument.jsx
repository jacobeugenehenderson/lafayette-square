/**
 * PilgrimMonument: Provincetown's set-piece renderer. ⛔ Never mounted directly: every app
 * mounts `SetPiece` (src/components/SetPiece.jsx), which passes the declaring `town` in.
 *
 * Renders the placeholder mass from the dossier's D/C table
 * (`src/setpieces/pilgrimMonument.js`), or the artist's model once `setPiece.model` names
 * one. That file holds the drop-in contract. A declared model that fails to load THROWS
 * (the error boundary logs it). It never quietly shows the placeholder instead.
 *
 * SEATING: Z = 0 sits on the lowest terrain point under the plinth, in RAW metres. The lift
 * is `groundRaw × terrainExag.value`, re-read every frame, because the exaggeration is a
 * live, tweened, per-shot uniform (flat in Browse, 1 in Street, the town's value in Hero;
 * see `treeGroundRaw` in `src/utils/elevation.js`). The tower's HEIGHT is never exaggerated.
 * That matches how SlabBuildings lifts by `aCentroidY × uExag`.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import SceneLabel from './SceneLabel.jsx'
import useCartographStore from '../cartograph/stores/useCartographStore.js'
import { labelFontSize } from '../lib/labelLayout.js'
import { useSceneJson } from '../lib/useSceneJson.js'
import { makeGraniteMasonryMaterial } from './graniteMasonryMaterial.js'
import { resolveSurfaceParams } from '../../cartograph/surfaces.mjs'
import { ASSET_BASE } from '../lib/bakedUrl.js'
import { getElevationRaw } from '../utils/elevation.js'
import { onTerrainReload, terrainExag } from '../utils/terrainShader.js'
import {
  DOSSIER, FT, placeholderStages, courseBeds, COURSE_SEED, siteFromFootprint, seatOnTerrain, southFacingYaw, lonLatToLocal,
} from '../setpieces/pilgrimMonument.js'

// The monument's own stone, a mid granite grey. Colour is not a dossier value; it is the set-piece's own.
const GRANITE_HEX = '#8f8b84'

// ⭐ The masonry's physics values come from `references/` findings, resolved through the one
// surface settings model (`cartograph/surfaces.mjs`). The registry is a lazy chunk, so only
// a town with a set-piece ever downloads it.
let _registry = null
const loadRegistry = () => (_registry ||= import('../../references/registry.json').then(m => m.default))
const _saidAbsent = new Set()

const SURFACE = 'pilgrim-granite'

function useGraniteMaterial(authored, lookId) {
  const [mat, setMat] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    let dead = false
    loadRegistry().then(reg => {
      if (dead) return
      const { values, absent } = resolveSurfaceParams(SURFACE, reg, authored)
      const key = lookId + '|' + absent.join()
      if (absent.length && !_saidAbsent.has(key)) {
        _saidAbsent.add(key)
        console.error(`[PilgrimMonument] ⛔ "${lookId}": surface "${SURFACE}" is drawn WITHOUT ${absent.join('; ')}. ABSENT, not defaulted — ▶ cartograph/surfaces.mjs`)
      }
      const ch = values.courseHeightIn?.courseHeight_in, j = values.jointIn?.jointMax_in
      if (!ch || !j) throw new Error(`${SURFACE}: the course range or joint width is absent — cannot course the stone`)
      const counted = values.courseCount ? [values.courseCount] : []
      const beds = courseBeds({ minIn: ch.min, maxIn: ch.max }, DOSSIER, COURSE_SEED, counted).map(z => z * FT)
      // Vertical joints only where the stone length is sourced; absent ⇒ none drawn.
      const bond = values.stoneLength ? { lengthDepths: values.stoneLength.stoneLength_depths, lapDepths: values.stoneLength.lap_depths } : null
      const shade = values.jointShade?.jointShade_x
      if (!shade) throw new Error(`${SURFACE}: the joint shade is absent — cannot draw the joints`)
      const m = makeGraniteMasonryMaterial({ beds, jointM: j * 0.0254, jointShade: shade, bond, color: GRANITE_HEX })
      m.userData.setAuthored({ reliefM: values.reliefM, toneVar: values.toneVar })
      setMat(m)
    }).catch(e => { if (!dead) setErr(e) })
    return () => { dead = true }
  }, [])
  // Authored values retune live, without rebuilding the course table.
  useEffect(() => {
    if (!mat) return
    const d = resolveSurfaceParams(SURFACE, { findings: [] }, authored).values
    // ⛔ The neutral is SAID, not silent: at relief 0 / tone 0 the joints draw but the split face
    // and the stone tones do not, and that looks like a skin that never loaded.
    const neutral = ['reliefM', 'toneVar'].filter(k => authored?.[k] == null)
    const nkey = lookId + '|neutral|' + neutral.join()
    if (neutral.length && !_saidAbsent.has(nkey)) {
      _saidAbsent.add(nkey)
      console.error(`[PilgrimMonument] ⛔ "${lookId}": ${SURFACE} drawn at its NEUTRAL authored ${neutral.map(k => `${k} ${d[k]}`).join(', ')} — the joints show, the split face and stone tones do not. Author design.json#surfaces.params['${SURFACE}'] (then bake the scene).`)
    }
    mat.userData.setAuthored({ reliefM: d.reliefM, toneVar: d.toneVar })
  }, [mat, lookId, authored?.reliefM, authored?.toneVar])
  if (err) throw new Error(`[PilgrimMonument] granite surface failed: ${err?.message || err}`)
  return mat
}

function Placeholder({ authored, lookId }) {
  const granite = useGraniteMaterial(authored, lookId)
  // ⛔ No stand-in: until the masonry resolves, nothing draws. A failure throws to the boundary.
  // Geometry in TOWER-LOCAL metres (y = height above Z = 0), so the coursing is one
  // continuous table across every stage.
  const geos = useMemo(() => placeholderStages().map(s => {
    const w = s.sq * FT, h = (s.z1 - s.z0) * FT
    const g = new THREE.BoxGeometry(w, h, w)
    g.translate(0, s.z0 * FT + h / 2, 0)
    return { name: s.name, g }
  }), [])
  if (!granite) return null
  return (
    <group>
      {geos.map(({ name, g }) => (
        <mesh key={name} name={name} geometry={g} material={granite} castShadow receiveShadow />
      ))}
    </group>
  )
}

function Model({ path }) {
  const [scene, setScene] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    let dead = false
    new GLTFLoader().load(`${ASSET_BASE}${path}`,
      g => { if (!dead) { g.scene.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true } }); setScene(g.scene) } },
      undefined,
      e => { if (!dead) setErr(e) })
    return () => { dead = true }
  }, [path])
  // ⛔ Loud, not a fallback: the boundary catches this, and the set-piece is visibly absent.
  if (err) throw new Error(`[PilgrimMonument] declared model ${path} failed to load: ${err?.message || err}`)
  return scene ? <primitive object={scene} /> : null
}

export default function PilgrimMonument({ town, graniteOverride } = {}) {
  if (!town) throw new Error('[PilgrimMonument] ⛔ no town — mount <SetPiece>, which passes it')
  const sp = town.setPiece
  // The operator's layer (`scene.surfaces.params['pilgrim-granite']`); the lab may override it for a preview.
  const scene = useSceneJson(town.lookId)
  const authored = graniteOverride || scene?.surfaces?.params?.[SURFACE] || null
  const active = sp?.kind === 'pilgrim-monument'
  const site = useMemo(() => {
    if (!active) return null
    const ring = sp.footprint.map(([lon, lat]) => lonLatToLocal(town.geography, lon, lat))
    return siteFromFootprint(ring)
  }, [active, sp])

  // Terrain re-points on a look switch; re-seat when it does.
  const [terrainGen, setTerrainGen] = useState(0)
  useEffect(() => onTerrainReload(() => setTerrainGen(g => g + 1)), [])
  const groundRaw = useMemo(
    () => (site ? seatOnTerrain(getElevationRaw, site).groundRaw : 0),
    [site, terrainGen])

  // The label: the set-piece's name printed on the ground just off its south face, read
  // from the south. Sized by the street labels' own law with the plinth as the width, and
  // styled by the same Labels panel. It rides the terrain at ITS OWN point, not the seat's.
  const labelStyle = useCartographStore(s => s.labels) || {}
  const label = useMemo(() => {
    if (!site || !sp.name) return null
    const plinthM = DOSSIER.foundationTopSq * FT
    const fontSize = labelFontSize(plinthM, labelStyle)
    const dz = plinthM / 2 + fontSize                     // local +Z = the south-facing face
    const r = southFacingYaw(site)
    const wx = site.x + dz * Math.sin(r), wz = site.z + dz * Math.cos(r)
    return { fontSize, dz, dRaw: getElevationRaw(wx, wz) - groundRaw }
  }, [site, sp, labelStyle, groundRaw])

  const ref = useRef(), labelRef = useRef()
  useFrame(() => {
    const e = terrainExag.value
    if (ref.current) ref.current.position.y = groundRaw * e
    if (labelRef.current && label) labelRef.current.position.y = label.dRaw * e
  })

  if (!site) return null
  return (
    <group ref={ref} name="pilgrim-monument" position={[site.x, groundRaw * terrainExag.value, site.z]}
           rotation={[0, southFacingYaw(site), 0]}>
      {sp.model ? <Model path={sp.model} /> : <Placeholder authored={authored} lookId={town.lookId} />}
      {label && (
        <group ref={labelRef}>
          <SceneLabel text={sp.name} fontSize={label.fontSize} position={[0, 0, label.dz]} rotation={[-Math.PI / 2, 0, 0]} />
        </group>
      )}
    </group>
  )
}
