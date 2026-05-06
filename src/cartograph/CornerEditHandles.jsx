/**
 * CornerEditHandles — Phases 2 & 3 of the corner-authoring kit.
 *
 * Surfaces draggable handles at every intersection when the operator flips
 * the "Corners > Edit" toggle in the Streets panel. Two layers of handles:
 *
 *   - **IX center dot** (Phase 2). One per intersection. Drags the bulk
 *     radius for that IX — applies to every corner that doesn't have its
 *     own per-corner override.
 *   - **Per-corner dots** (Phase 3). One per CCW-adjacent leg pair at each
 *     IX. Smaller than the IX dot, anchored at each corner's geometric Q
 *     point. Drags only that one corner's radius.
 *
 * Both use the same gesture: world-space distance from cursor to the IX
 * center sets the effective radius. The dot tracks the cursor during drag
 * (Illustrator pattern) and snaps back to its anchor on release. Color
 * coding: blue/cyan = default, gold = operator-authored, white = mid-drag.
 *
 * Persistence: per-IX → `cornerRadiusOverrides`; per-corner →
 * `cornerCornerRadiusOverrides` (keyed by `<pointKey>|<legKeyA>|<legKeyB>`,
 * leg keys sorted alphabetically so the key is invariant under A/B swap).
 * Both maps live in the active Look's `design.json`.
 *
 * Pointer events captured at the canvas DOM (matches MeasureOverlay /
 * SurveyorOverlay pattern). Pointer-capture during drag so motion is
 * tracked even if the cursor leaves a small mesh.
 *
 * **Why every mesh has `transparent` set:** the cartograph render pipeline
 * (post-FX + ribbon fade shader) only emits the transparent draw queue to
 * the final framebuffer in Designer mode. Opaque meshes from this overlay
 * simply don't appear on screen. Following MeasureOverlay's pattern,
 * every mesh here uses `transparent opacity={1}` so it lands in the
 * transparent queue and renders. Bit-for-bit indistinguishable from a
 * truly opaque mesh, but actually visible.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import useCartographStore from './stores/useCartographStore.js'
import { CURB_WIDTH } from './streetProfiles.js'

const raycaster = new THREE.Raycaster()
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const intersectPt = new THREE.Vector3()

function screenToWorld(clientX, clientY, camera, domElement) {
  const rect = domElement.getBoundingClientRect()
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1
  const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera)
  raycaster.ray.intersectPlane(groundPlane, intersectPt)
  return { x: intersectPt.x, z: intersectPt.z }
}

// Hit radii (world meters). Per-corner dots take priority — smaller and
// usually closer to the cursor when an operator is targeting them.
const HIT_R_CORNER = 1.2
const HIT_R_IX = 1.8
// Visual radii — IX dot bigger so it reads as the bulk control; corner dots
// modestly smaller so they stay legible at typical Designer zooms.
const DOT_R_IX = 0.6
const DOT_R_CORNER = 0.5
// Y offset above ground so dots sit above the ribbon stack (which tops out
// around Y=0.020 for corner_plug_sidewalk).
const Y_DOTS = 0.05
// Color logic — distinct hues for the two handle layers, shared override /
// drag colors so the modal state is unambiguous regardless of layer.
const COLOR_IX_DEFAULT = '#2250E8'      // royal blue
const COLOR_CORNER_DEFAULT = '#22D3EE'  // cyan
const COLOR_OVERRIDE = '#ffaa00'        // gold (both layers)
const COLOR_DRAG = '#ffffff'            // white

const ixKey = (p) => `${(+p[0]).toFixed(3)},${(+p[1]).toFixed(3)}`
const sortedCornerKey = (V, legKeyA, legKeyB) => {
  const [a, b] = (legKeyA <= legKeyB) ? [legKeyA, legKeyB] : [legKeyB, legKeyA]
  return `${ixKey(V)}|${a}|${b}`
}

// Compute every corner's geometric anchor (Q = where leg-A's left curb-outer
// meets leg-B's right curb-outer) plus stable leg keys, for each IX in
// `ribbons`. Same math as buildCornerPadClips; if you change either, change
// both — the per-corner UI handles MUST land at the same Q the geometry uses.
function computeIxLayout(ribbons) {
  if (!ribbons?.intersections?.length) return []
  const TWO_PI = Math.PI * 2
  const streetByName = new Map((ribbons.streets || []).map(s => [s.name, s]))
  const out = []
  for (let ixIdx = 0; ixIdx < ribbons.intersections.length; ixIdx++) {
    const ix = ribbons.intersections[ixIdx]
    if (!ix.point || !ix.streets || ix.streets.length < 2) continue
    if (ix.disabled) continue
    const V = ix.point
    const legs = []
    for (const sref of ix.streets) {
      const chain = streetByName.get(sref.name)
      if (!chain) continue
      const m = chain.measure
      if (!m?.left?.pavementHW || !m?.right?.pavementHW) continue
      const pts = chain.points
      const v = pts[sref.ix]
      if (!v) continue
      if (Math.hypot(v[0] - V[0], v[1] - V[1]) >= 0.5) continue
      const skel = chain.skelId || chain.name
      const tryDir = (direction) => {
        const ni = sref.ix + direction
        if (ni < 0 || ni >= pts.length) return
        const dx = pts[ni][0] - V[0], dz = pts[ni][1] - V[1]
        const L = Math.hypot(dx, dz)
        if (L < 1e-6) return
        const isBack = direction === -1
        const left  = isBack ? m.right : m.left
        const right = isBack ? m.left  : m.right
        legs.push({
          T: [dx / L, dz / L],
          outerL: left.pavementHW || 0,
          outerR: right.pavementHW || 0,
          legKey: `${skel || '?'}:${direction === -1 ? 'b' : 'f'}`,
        })
      }
      if (sref.ix > 0) tryDir(-1)
      if (sref.ix < pts.length - 1) tryDir(+1)
    }
    if (legs.length < 2) { out.push({ ixIdx, V, ix, corners: [] }); continue }
    legs.sort((a, b) => Math.atan2(a.T[1], a.T[0]) - Math.atan2(b.T[1], b.T[0]))

    const corners = []
    for (let i = 0; i < legs.length; i++) {
      const A = legs[i], B = legs[(i + 1) % legs.length]
      const T_A = A.T, T_B = B.T
      const P_A = [-T_A[1], T_A[0]]
      const P_B = [-T_B[1], T_B[0]]
      let theta = Math.atan2(T_B[1], T_B[0]) - Math.atan2(T_A[1], T_A[0])
      while (theta < 0) theta += TWO_PI
      while (theta >= TWO_PI) theta -= TWO_PI
      const thetaDeg = theta * 180 / Math.PI
      // Skip degenerate / non-corner pairs — geometry won't render a wedge
      // here either, so there's no corner to author.
      if (thetaDeg <= 5 || thetaDeg >= 175) continue
      const A0 = [V[0] + (A.outerL + CURB_WIDTH) * P_A[0], V[1] + (A.outerL + CURB_WIDTH) * P_A[1]]
      const B0 = [V[0] - (B.outerR + CURB_WIDTH) * P_B[0], V[1] - (B.outerR + CURB_WIDTH) * P_B[1]]
      const det = T_A[0] * (-T_B[1]) - T_A[1] * (-T_B[0])
      if (Math.abs(det) < 1e-9) continue
      const dq = [B0[0] - A0[0], B0[1] - A0[1]]
      const sQ = (dq[0] * (-T_B[1]) - dq[1] * (-T_B[0])) / det
      const Q = [A0[0] + sQ * T_A[0], A0[1] + sQ * T_A[1]]
      corners.push({ Q, legKeyA: A.legKey, legKeyB: B.legKey })
    }
    out.push({ ixIdx, V, ix, corners })
  }
  return out
}

export default function CornerEditHandles({ ribbons }) {
  const cornerEditMode = useCartographStore(s => s.cornerEditMode)
  const ixOverrides = useCartographStore(s => s.cornerRadiusOverrides) || {}
  const cornerOverrides = useCartographStore(s => s.cornerCornerRadiusOverrides) || {}
  const cornerRadiusScale = useCartographStore(s => s.cornerRadiusScale ?? 1)
  const setIxCornerRadius = useCartographStore(s => s.setIxCornerRadius)
  const setCornerCornerRadius = useCartographStore(s => s.setCornerCornerRadius)
  const { camera, gl } = useThree()

  const dragRef = useRef(null)
  const [dragState, setDragState] = useState(null)

  const layout = useMemo(() => computeIxLayout(ribbons), [ribbons])

  useEffect(() => {
    if (!cornerEditMode) return
    if (!layout.length) return

    const dom = gl.domElement

    const onDown = (e) => {
      if (e.button !== 0) return
      const p = screenToWorld(e.clientX, e.clientY, camera, dom)

      // First-pass: per-corner dots win over IX dots when both are nearby.
      // Per-corner dots cluster around the IX, so without this an IX dot
      // could swallow a click meant for a corner sitting next to it.
      for (const entry of layout) {
        for (let ci = 0; ci < entry.corners.length; ci++) {
          const c = entry.corners[ci]
          const dx = p.x - c.Q[0], dz = p.z - c.Q[1]
          if (Math.hypot(dx, dz) < HIT_R_CORNER) {
            dragRef.current = {
              kind: 'corner',
              ixIdx: entry.ixIdx,
              cornerIdx: ci,
              V: entry.V.slice(),
              legKeyA: c.legKeyA,
              legKeyB: c.legKeyB,
            }
            setDragState({
              kind: 'corner',
              ixIdx: entry.ixIdx, cornerIdx: ci,
              cursor: p,
              r: Math.hypot(p.x - entry.V[0], p.z - entry.V[1]),
            })
            dom.setPointerCapture?.(e.pointerId)
            e.stopPropagation()
            return
          }
        }
      }
      // Second-pass: IX center dots.
      for (const entry of layout) {
        const dx = p.x - entry.V[0], dz = p.z - entry.V[1]
        if (Math.hypot(dx, dz) < HIT_R_IX) {
          dragRef.current = {
            kind: 'ix',
            ixIdx: entry.ixIdx,
            V: entry.V.slice(),
          }
          setDragState({
            kind: 'ix',
            ixIdx: entry.ixIdx,
            cursor: p,
            r: Math.hypot(dx, dz),
          })
          dom.setPointerCapture?.(e.pointerId)
          e.stopPropagation()
          return
        }
      }
    }

    const onMove = (e) => {
      const drag = dragRef.current
      if (!drag) return
      const p = screenToWorld(e.clientX, e.clientY, camera, dom)
      const dx = p.x - drag.V[0], dz = p.z - drag.V[1]
      const r = Math.hypot(dx, dz)
      // Store the BASE radius (what gets multiplied by cornerRadiusScale).
      const baseR = r / Math.max(0.0001, cornerRadiusScale)
      if (drag.kind === 'corner') {
        setCornerCornerRadius(drag.V, drag.legKeyA, drag.legKeyB, baseR)
      } else {
        setIxCornerRadius(drag.V, baseR)
      }
      setDragState(prev => prev && { ...prev, cursor: p, r })
      e.stopPropagation()
    }

    const onUp = (e) => {
      if (!dragRef.current) return
      dragRef.current = null
      setDragState(null)
      dom.releasePointerCapture?.(e.pointerId)
      e.stopPropagation()
    }

    const opts = { capture: true }
    dom.addEventListener('pointerdown', onDown, opts)
    dom.addEventListener('pointermove', onMove, opts)
    dom.addEventListener('pointerup', onUp, opts)
    dom.addEventListener('pointercancel', onUp, opts)
    return () => {
      dom.removeEventListener('pointerdown', onDown, opts)
      dom.removeEventListener('pointermove', onMove, opts)
      dom.removeEventListener('pointerup', onUp, opts)
      dom.removeEventListener('pointercancel', onUp, opts)
    }
  }, [cornerEditMode, layout, camera, gl, setIxCornerRadius, setCornerCornerRadius, cornerRadiusScale])

  if (!cornerEditMode) return null
  if (!layout.length) return null

  return (
    <group>
      {layout.map((entry) => {
        const { V, ix, corners, ixIdx } = entry
        const [vx, vz] = V

        const ixOverrideR = ixOverrides[ixKey(V)]
        const ixBaseR = Number.isFinite(ixOverrideR) ? ixOverrideR
          : Number.isFinite(ix.cornerRadius) ? ix.cornerRadius
          : 4.5
        const ixEffectiveR = ixBaseR * cornerRadiusScale
        const ixHasOverride = Number.isFinite(ixOverrideR)
        const draggingIx = dragState?.kind === 'ix' && dragState.ixIdx === ixIdx
        const ixDotColor = draggingIx ? COLOR_DRAG : ixHasOverride ? COLOR_OVERRIDE : COLOR_IX_DEFAULT
        const ixRingR = draggingIx ? dragState.r : ixEffectiveR
        const ixDotPos = draggingIx
          ? [dragState.cursor.x, Y_DOTS, dragState.cursor.z]
          : [vx, Y_DOTS, vz]
        const anyCornerOverride = corners.some(c =>
          Number.isFinite(cornerOverrides[sortedCornerKey(V, c.legKeyA, c.legKeyB)])
        )

        return (
          <group key={ixIdx}>
            {/* IX-level preview ring at the bulk-control radius. Dimmed when
                ANY corner has its own override so the operator's eye goes to
                per-corner state. */}
            <mesh position={[vx, Y_DOTS - 0.001, vz]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={200}>
              <ringGeometry args={[Math.max(0, ixRingR - 0.06), Math.max(0.06, ixRingR + 0.06), 64]} />
              <meshBasicMaterial color={ixDotColor} transparent opacity={anyCornerOverride ? 0.3 : 0.7}
                depthTest={false} depthWrite={false} />
            </mesh>

            {/* Per-corner dots at each Q point. */}
            {corners.map((c, ci) => {
              const ck = sortedCornerKey(V, c.legKeyA, c.legKeyB)
              const cornerOverrideR = cornerOverrides[ck]
              const hasOverride = Number.isFinite(cornerOverrideR)
              const draggingCorner = dragState?.kind === 'corner'
                && dragState.ixIdx === ixIdx
                && dragState.cornerIdx === ci
              const color = draggingCorner ? COLOR_DRAG : hasOverride ? COLOR_OVERRIDE : COLOR_CORNER_DEFAULT
              const baseR = hasOverride ? cornerOverrideR : ixBaseR
              const effR = baseR * cornerRadiusScale
              const ringR = draggingCorner ? dragState.r : effR
              const cornerDotPos = draggingCorner
                ? [dragState.cursor.x, Y_DOTS + 0.002, dragState.cursor.z]
                : [c.Q[0], Y_DOTS + 0.002, c.Q[1]]
              return (
                <group key={ci}>
                  {/* Per-corner preview ring centered at V — only visible
                      when this corner has an override OR is being dragged,
                      so it doesn't stack noise on top of the bulk ring. */}
                  {(hasOverride || draggingCorner) && (
                    <mesh position={[vx, Y_DOTS + 0.001, vz]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={203}>
                      <ringGeometry args={[Math.max(0, ringR - 0.04), Math.max(0.04, ringR + 0.04), 64]} />
                      <meshBasicMaterial color={color} transparent opacity={0.95}
                        depthTest={false} depthWrite={false} />
                    </mesh>
                  )}
                  {/* Corner dot itself, anchored at Q. */}
                  <mesh position={cornerDotPos} rotation={[-Math.PI / 2, 0, 0]} renderOrder={204}>
                    <circleGeometry args={[DOT_R_CORNER, 20]} />
                    <meshBasicMaterial color={color} transparent opacity={1.0}
                      depthTest={false} depthWrite={false} />
                  </mesh>
                  <mesh position={cornerDotPos} rotation={[-Math.PI / 2, 0, 0]} renderOrder={205}>
                    <ringGeometry args={[DOT_R_CORNER - 0.08, DOT_R_CORNER, 20]} />
                    <meshBasicMaterial color="#ffffff" transparent opacity={1.0}
                      depthTest={false} depthWrite={false} />
                  </mesh>
                </group>
              )
            })}

            {/* IX center dot — bigger, sits on top. */}
            <mesh position={ixDotPos} rotation={[-Math.PI / 2, 0, 0]} renderOrder={206}>
              <circleGeometry args={[DOT_R_IX, 24]} />
              <meshBasicMaterial color={ixDotColor} transparent opacity={1.0}
                depthTest={false} depthWrite={false} />
            </mesh>
            <mesh position={ixDotPos} rotation={[-Math.PI / 2, 0, 0]} renderOrder={207}>
              <ringGeometry args={[DOT_R_IX - 0.12, DOT_R_IX, 24]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={1.0}
                depthTest={false} depthWrite={false} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}
