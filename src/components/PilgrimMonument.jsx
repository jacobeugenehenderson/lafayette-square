/**
 * PilgrimMonument: Provincetown's set-piece. Self-gates on the town's instance
 * (`INSTANCE.setPiece.kind === 'pilgrim-monument'`), the way GatewayArch self-gates on
 * `scene.arch`, so no mount site names a town.
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
import { INSTANCE } from '../instance.js'
import SceneLabel from './SceneLabel.jsx'
import useCartographStore from '../cartograph/stores/useCartographStore.js'
import { labelFontSize } from '../lib/labelLayout.js'
import { ASSET_BASE } from '../lib/bakedUrl.js'
import { getElevationRaw } from '../utils/elevation.js'
import { onTerrainReload, terrainExag } from '../utils/terrainShader.js'
import {
  DOSSIER, FT, placeholderStages, siteFromFootprint, seatOnTerrain, southFacingYaw, lonLatToLocal,
} from '../setpieces/pilgrimMonument.js'

// Rough split granite (dossier §4: "fresh quarry faces … not dressed ashlar"). The
// monument's own stone, so it is not a Look value.
const GRANITE = new THREE.MeshStandardMaterial({ color: '#8f8b84', roughness: 0.92, metalness: 0 })

function Placeholder() {
  const stages = useMemo(() => placeholderStages(), [])
  return (
    <group>
      {stages.map(s => {
        const w = s.sq * FT, h = (s.z1 - s.z0) * FT
        return (
          <mesh key={s.name} name={s.name} material={GRANITE} castShadow receiveShadow
                position={[0, (s.z0 * FT) + h / 2, 0]}>
            <boxGeometry args={[w, h, w]} />
          </mesh>
        )
      })}
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

export default function PilgrimMonument() {
  const sp = INSTANCE.setPiece
  const active = sp?.kind === 'pilgrim-monument'
  const site = useMemo(() => {
    if (!active) return null
    const ring = sp.footprint.map(([lon, lat]) => lonLatToLocal(INSTANCE.geography, lon, lat))
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
      {sp.model ? <Model path={sp.model} /> : <Placeholder />}
      {label && (
        <group ref={labelRef}>
          <SceneLabel text={sp.name} fontSize={label.fontSize} position={[0, 0, label.dz]} rotation={[-Math.PI / 2, 0, 0]} />
        </group>
      )}
    </group>
  )
}
