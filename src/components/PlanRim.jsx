/**
 * PlanRim — in the overhead PLAN, the town ends at its ONE radius, as a clean circle (Jacob, 2026-09-29: "The circle
 * is a SSoT radius"; "for now at least a clean circle, not accidental looking").
 *
 * Owns two flat shapes, both sized from the scene's disc (sceneStencilState — `ground.json#stencil`, the one radius
 * and its fade band) and nothing else:
 *   · the BASE: a lit disc under the town, to the rim, so where the ground's data stops short of the rim (Huron's frame
 *     is its bounding box) the gap reads as plain land, not a ragged black band;
 *   · the SURROUND: from the rim outward, in the page's ink (the player chrome's GROUNDS.ink, the Ward's --ground),
 *     unlit, fading in across the SAME band the ground fades out on (fade.inner → fade.outer) and opaque beyond, drawn
 *     over everything — so past the rim there is only the page, never the sky's underside.
 * Mounted by Town.jsx for shot 'plan' only; the movie and the street keep the horizon (HorizonDisc).
 * Must never: take a radius of its own. No stencil ⇒ it draws nothing, and says so once.
 */
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { onSceneStencil } from './sceneStencilState'
import { GROUNDS } from '../tokens/playerChrome.js'

const SEGMENTS = 256
let _saidNoStencil = false

function surroundMaterial(inner, outer) {
  return new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false,
    uniforms: { uInk: { value: new THREE.Color(GROUNDS.ink) }, uInner: { value: inner }, uOuter: { value: outer } },
    vertexShader: /* glsl */`
      varying float vR;
      void main() { vR = length(position.xy); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uInk; uniform float uInner; uniform float uOuter; varying float vR;
      void main() { gl_FragColor = vec4(uInk, smoothstep(uInner, uOuter, vR)); }`,
  })
}

export default function PlanRim() {
  const [stencil, setStencil] = useState(null)
  useEffect(() => onSceneStencil(setStencil), [])
  useEffect(() => {
    if (!stencil && !_saidNoStencil) { _saidNoStencil = true; console.error('[PlanRim] the scene disc has no radius yet — the plan draws no rim until the ground publishes one') }
  }, [stencil])

  const shapes = useMemo(() => {
    if (!stencil) return null
    const R = stencil.radius
    const inner = stencil.fade?.inner > 0 ? stencil.fade.inner : R
    const outer = stencil.fade?.outer > 0 ? stencil.fade.outer : R
    return {
      center: stencil.center,
      base: new THREE.CircleGeometry(outer, SEGMENTS),
      surround: new THREE.RingGeometry(inner, R * 60, SEGMENTS, 1),
      material: surroundMaterial(inner, outer),
    }
  }, [stencil])
  useEffect(() => () => { shapes?.base.dispose(); shapes?.surround.dispose(); shapes?.material.dispose() }, [shapes])
  if (!shapes) return null

  const [cx, cz] = shapes.center
  return (
    <group position={[cx, 0, cz]} rotation={[-Math.PI / 2, 0, 0]}>
      {/* Under the ground, so wherever the ground is drawn it covers this. */}
      <mesh geometry={shapes.base} position={[0, 0, -30]} renderOrder={-1}>
        <meshLambertMaterial color="#38393b" />
      </mesh>
      <mesh geometry={shapes.surround} material={shapes.material} renderOrder={1000} />
    </group>
  )
}
