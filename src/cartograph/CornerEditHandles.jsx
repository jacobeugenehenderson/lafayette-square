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

// Hit radius (world meters) for the per-corner dot.
const HIT_R_CORNER = 1.2
// Visual radius for the per-corner dot.
const DOT_R_CORNER = 0.5
// Per-vertex smoothing dot — slightly smaller than the corner dot so the
// two layers read as distinct without crowding when both surface.
const HIT_R_SMOOTH = 1.0
const DOT_R_SMOOTH = 0.4
// Minimum offset of the smoothing dot from its vertex, in meters. When R=0
// (no override), the dot sits at this distance along the outward bisector
// so it's visible and grabbable; when R>0 the dot tracks the radius.
const SMOOTH_DOT_MIN_OFFSET = 0.9
// Drag this close to a dot's "origin" (IX center for corners, chain
// vertex for smoothing) and the gesture snaps + clears the override on
// release. World meters.
const SNAP_R = 0.7
// Tap threshold — if the cursor moves less than this between down and up,
// we treat the gesture as a click (toggles the origin marker) instead of
// a drag (commits a radius).
const TAP_THRESHOLD = 0.25
// Y offset above ground so dots sit above the ribbon stack (which tops out
// around Y=0.020 for corner_plug_sidewalk).
const Y_DOTS = 0.05
// Color logic — corner default + shared override / drag colors so the
// modal state is unambiguous. Smoothing dots get a distinct purple so the
// two handle layers read as different at a glance.
const COLOR_CORNER_DEFAULT = '#22D3EE'  // cyan
const COLOR_SMOOTH_DEFAULT = '#C084FC'  // light purple
const COLOR_OVERRIDE = '#ffaa00'        // gold (all layers)
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
      // Wedge between adjacent CCW legs sits on A's RIGHT and B's LEFT
      // in the V2 chainPavementRing convention (left = -perp, right =
      // +perp). Must match the same A0/B0 derivation in
      // buildBlockGeometryV2's cornersAtIx — otherwise the per-corner
      // override key here disagrees with the geometric corner there.
      const A0 = [V[0] + (A.outerR + CURB_WIDTH) * P_A[0], V[1] + (A.outerR + CURB_WIDTH) * P_A[1]]
      const B0 = [V[0] - (B.outerL + CURB_WIDTH) * P_B[0], V[1] - (B.outerL + CURB_WIDTH) * P_B[1]]
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

// One smoothing layout entry per non-IX interior bend vertex on every
// chain. We exclude IX vertices (their corners are owned by the per-corner
// dots) and any near-collinear vertex (no visible bend, nothing useful to
// fillet). `outBis` points from the vertex into the OBTUSE side of the
// bend — the side where the dot belongs Illustrator-style.
function computeSmoothLayout(ribbons) {
  if (!ribbons?.streets?.length) return []
  const out = []
  for (let chainIdx = 0; chainIdx < ribbons.streets.length; chainIdx++) {
    const chain = ribbons.streets[chainIdx]
    if (!chain || chain.disabled) continue
    const pts = chain.points
    const n = pts?.length || 0
    if (n < 3) continue
    const ixSet = new Set(
      (chain.intersections || []).map(r => r.ix).filter(Number.isInteger)
    )
    for (let i = 1; i < n - 1; i++) {
      if (ixSet.has(i)) continue
      const prev = pts[i - 1], cur = pts[i], next = pts[i + 1]
      const ix = cur[0] - prev[0], iz = cur[1] - prev[1]
      const ox = next[0] - cur[0], oz = next[1] - cur[1]
      const lin = Math.hypot(ix, iz), lon = Math.hypot(ox, oz)
      if (lin < 1e-6 || lon < 1e-6) continue
      const inX = ix / lin, inZ = iz / lin
      const ouX = ox / lon, ouZ = oz / lon
      const cross = inX * ouZ - inZ * ouX
      if (Math.abs(cross) < 1e-3) continue   // collinear-ish: no bend
      // Outward bisector = unit(inDir - outDir). Points away from the
      // arc center for either turn direction (the OBTUSE side of the
      // bend), so the dot sits on the side that gets cut off as R grows.
      const bx = inX - ouX, bz = inZ - ouZ
      const bl = Math.hypot(bx, bz)
      if (bl < 1e-6) continue
      out.push({
        chainIdx,
        vertexIdx: i,
        vertex: cur,
        outBis: [bx / bl, bz / bl],
      })
    }
  }
  return out
}

export default function CornerEditHandles({ ribbons }) {
  const cornerEditMode = useCartographStore(s => s.cornerEditMode)
  const ixOverrides = useCartographStore(s => s.cornerRadiusOverrides) || {}
  const cornerOverrides = useCartographStore(s => s.cornerCornerRadiusOverrides) || {}
  const cornerRadiusScale = useCartographStore(s => s.cornerRadiusScale ?? 1)
  const setCornerCornerRadius = useCartographStore(s => s.setCornerCornerRadius)
  const vertexSmoothing = useCartographStore(s => s.vertexSmoothing) || {}
  const setVertexSmoothing = useCartographStore(s => s.setVertexSmoothing)
  const { camera, gl } = useThree()

  const dragRef = useRef(null)
  const [dragState, setDragState] = useState(null)
  // Tap on a dot toggles a non-destructive "origin marker" — a tiny
  // crosshair at the radius origin (IX center for corners, chain vertex
  // for smoothing). Reveals where to drag to reset without disturbing the
  // current arc. Cleared automatically when a drag commits.
  //   { kind: 'corner', key: `${ixIdx}:${cornerIdx}` }
  //   { kind: 'smooth', key: `${chainIdx}:${vertexIdx}` }
  const [originHint, setOriginHint] = useState(null)
  // rAF-throttle the heavy store commit so the dot tracks the cursor
  // smoothly even at neighborhood density (~252 IXs / ~600 corners). The
  // local `dragState` updates synchronously every pointermove for visual
  // responsiveness; the store update (which triggers the meshes useMemo
  // rebuild — Clipper booleans + ShapeGeometry triangulation across the
  // whole neighborhood) fires at most once per frame. Pointer-up flushes
  // any pending value so the persisted radius matches where the user
  // released. Same pattern as the Streets > Corners slider in Panel.jsx.
  const rafRef = useRef(null)
  const pendingCommitRef = useRef(null)

  const layout = useMemo(() => computeIxLayout(ribbons), [ribbons])
  const smoothLayout = useMemo(() => computeSmoothLayout(ribbons), [ribbons])

  useEffect(() => {
    if (!cornerEditMode) return
    if (!layout.length && !smoothLayout.length) return

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
              downPos: p,
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
      // (IX center handle retired — per-IX bulk authoring lives in the
       // global cornerRadiusScale slider; per-corner dots own everything
       // local.)
      // Second-pass: per-vertex smoothing dots. Anchored a fixed offset
      // off each non-IX bend vertex; hit-test against the dot's CURRENT
      // anchor position (which moves with R when authored).
      for (const sm of smoothLayout) {
        const cur = vertexSmoothing?.[sm.chainIdx]?.[sm.vertexIdx] || 0
        const offset = Math.max(SMOOTH_DOT_MIN_OFFSET, cur)
        const ax = sm.vertex[0] + sm.outBis[0] * offset
        const az = sm.vertex[1] + sm.outBis[1] * offset
        const dx = p.x - ax, dz = p.z - az
        if (Math.hypot(dx, dz) < HIT_R_SMOOTH) {
          dragRef.current = {
            kind: 'smooth',
            chainIdx: sm.chainIdx,
            vertexIdx: sm.vertexIdx,
            vertex: sm.vertex.slice(),
            downPos: p,
          }
          setDragState({
            kind: 'smooth',
            chainIdx: sm.chainIdx, vertexIdx: sm.vertexIdx,
            cursor: p,
            r: Math.hypot(p.x - sm.vertex[0], p.z - sm.vertex[1]),
          })
          dom.setPointerCapture?.(e.pointerId)
          e.stopPropagation()
          return
        }
      }
    }

    const flushCommit = (drag, baseR) => {
      if (drag.kind === 'smooth') {
        // setVertexSmoothing already clears for r ≤ 0.
        setVertexSmoothing(drag.chainIdx, drag.vertexIdx, baseR)
      } else {
        // Pass null/undefined to setCornerCornerRadius to clear the
        // override (vs. storing a sharp-corner override of 0). Anything
        // smaller than the snap threshold counts as "drag onto origin →
        // reset" — the dot snapped visually, so the persisted state
        // should match the visible reset.
        if (drag.snapping || baseR < (SNAP_R / Math.max(0.0001, cornerRadiusScale))) {
          setCornerCornerRadius(drag.V, drag.legKeyA, drag.legKeyB, null)
        } else {
          setCornerCornerRadius(drag.V, drag.legKeyA, drag.legKeyB, baseR)
        }
      }
    }

    const onMove = (e) => {
      const drag = dragRef.current
      if (!drag) return
      const p = screenToWorld(e.clientX, e.clientY, camera, dom)
      // Smoothing drags measure cursor → vertex; corner drags measure
      // cursor → V (IX point). Store the appropriate base radius.
      const anchor = drag.kind === 'smooth' ? drag.vertex : drag.V
      const dx = p.x - anchor[0], dz = p.z - anchor[1]
      const r = Math.hypot(dx, dz)
      // Snap-to-reset: when the cursor is within SNAP_R of the origin,
      // the dot pins visually to the origin and the gesture commits as
      // a clear. The drag.snapping flag persists into flushCommit so the
      // commit path knows to send `null` (corner) regardless of baseR
      // wobble.
      const snapping = r < SNAP_R
      drag.snapping = snapping
      // Corner radii get multiplied by cornerRadiusScale at render time;
      // smoothing radii are stored absolute (no scale layer for bends).
      const baseR = drag.kind === 'smooth'
        ? r
        : r / Math.max(0.0001, cornerRadiusScale)
      const cursorForVisual = snapping
        ? { x: anchor[0], z: anchor[1] }
        : p
      // Visual update (cheap) — synchronous so the dot tracks the cursor.
      setDragState(prev => prev && { ...prev, cursor: cursorForVisual, r: snapping ? 0 : r, snapping })
      // Heavy store commit (rebuilds meshes useMemo across the whole
      // neighborhood) — rAF-throttled so it doesn't choke pointer events
      // at LS density (~252 IXs / ~600 corners).
      pendingCommitRef.current = baseR
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null
          const target = pendingCommitRef.current
          if (target == null) return
          pendingCommitRef.current = null
          const liveDrag = dragRef.current
          if (liveDrag) flushCommit(liveDrag, target)
        })
      }
      e.stopPropagation()
    }

    const onUp = (e) => {
      const drag = dragRef.current
      if (!drag) return
      // Flush any pending rAF-throttled commit so the persisted radius
      // matches where the user released the dot.
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      // Tap detection — if the cursor moved less than TAP_THRESHOLD
      // between down and up, treat the gesture as a click that toggles
      // the origin marker for this dot. Non-destructive: the override
      // and the visible arc don't change. A second tap (same dot) hides
      // the marker; a tap on a different dot moves it.
      if (drag.downPos) {
        const upP = screenToWorld(e.clientX, e.clientY, camera, dom)
        const moved = Math.hypot(upP.x - drag.downPos.x, upP.z - drag.downPos.z)
        if (moved < TAP_THRESHOLD) {
          const key = drag.kind === 'smooth'
            ? `${drag.chainIdx}:${drag.vertexIdx}`
            : `${drag.ixIdx}:${drag.cornerIdx}`
          setOriginHint(prev => (prev?.kind === drag.kind && prev.key === key) ? null : { kind: drag.kind, key })
          pendingCommitRef.current = null
          dragRef.current = null
          setDragState(null)
          dom.releasePointerCapture?.(e.pointerId)
          e.stopPropagation()
          return
        }
      }
      // Real drag → commit. The drag.snapping flag (set in onMove when
      // the cursor entered the snap radius around origin) carries into
      // flushCommit so a snapped release commits as a clear.
      if (pendingCommitRef.current != null) {
        flushCommit(drag, pendingCommitRef.current)
        pendingCommitRef.current = null
      } else if (drag.snapping) {
        // No move events fired (rare — fast click + tiny twitch into snap
        // zone), but the down-up displacement was over the tap threshold.
        // Still commit a clear since the user landed inside the snap zone.
        flushCommit(drag, 0)
      }
      // Drag committed — clear any origin-hint left from a prior tap.
      setOriginHint(null)
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
  }, [cornerEditMode, layout, smoothLayout, camera, gl, setCornerCornerRadius, setVertexSmoothing, cornerRadiusScale, vertexSmoothing])

  if (!cornerEditMode) return null
  if (!layout.length && !smoothLayout.length) return null

  return (
    <group>
      {layout.map((entry) => {
        const { V, ix, corners, ixIdx } = entry
        const [vx, vz] = V

        // ixBaseR is still the inheritance source for any per-corner dot
        // without its own override (the center HANDLE retired; the value
        // lives on, fed by the global slider + look-level overrides).
        const ixOverrideR = ixOverrides[ixKey(V)]
        const ixBaseR = Number.isFinite(ixOverrideR) ? ixOverrideR
          : Number.isFinite(ix.cornerRadius) ? ix.cornerRadius
          : 4.5

        return (
          <group key={ixIdx}>
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
              const cornerKey = `${ixIdx}:${ci}`
              const showOriginMarker = (originHint?.kind === 'corner' && originHint.key === cornerKey)
                || draggingCorner
              return (
                <group key={ci}>
                  {/* Drag-only preview ring — shows the live R while the
                      operator is dragging the dot. Idle authored corners
                      no longer paint a ring (was visual clutter at scale).
                      The dot color (gold = override, cyan = default) is
                      sufficient at-rest indicator. */}
                  {draggingCorner && ringR > 0.05 && (
                    <mesh position={[vx, Y_DOTS + 0.001, vz]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={203}>
                      <ringGeometry args={[Math.max(0, ringR - 0.04), Math.max(0.04, ringR + 0.04), 64]} />
                      <meshBasicMaterial color={color} transparent opacity={0.95}
                        depthTest={false} depthWrite={false} />
                    </mesh>
                  )}
                  {/* Origin marker — appears on tap (toggle) or while
                      dragging this corner. Tiny white-bordered dot at V
                      (the IX center / radius origin). Drop the dot
                      within SNAP_R of this marker to snap + clear the
                      override. */}
                  {showOriginMarker && (
                    <>
                      <mesh position={[vx, Y_DOTS + 0.0005, vz]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={208}>
                        <circleGeometry args={[0.18, 16]} />
                        <meshBasicMaterial color="#ffffff" transparent opacity={1.0}
                          depthTest={false} depthWrite={false} />
                      </mesh>
                      <mesh position={[vx, Y_DOTS + 0.0008, vz]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={209}>
                        <circleGeometry args={[0.10, 16]} />
                        <meshBasicMaterial color={hasOverride ? COLOR_OVERRIDE : COLOR_CORNER_DEFAULT}
                          transparent opacity={1.0}
                          depthTest={false} depthWrite={false} />
                      </mesh>
                    </>
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

          </group>
        )
      })}
      {/* Per-vertex smoothing dots — one per non-IX bend. Sits on the
          obtuse side of the bend at SMOOTH_DOT_MIN_OFFSET (or at R if
          larger), tracking the cursor during a drag. Cyan/purple by
          default → gold when authored → white during drag. Anchored
          well above the ribbon stack so it stays clickable. */}
      {smoothLayout.map((sm) => {
        const cur = vertexSmoothing?.[sm.chainIdx]?.[sm.vertexIdx]
        const hasOverride = Number.isFinite(cur) && cur > 0
        const dragging = dragState?.kind === 'smooth'
          && dragState.chainIdx === sm.chainIdx
          && dragState.vertexIdx === sm.vertexIdx
        const color = dragging ? COLOR_DRAG : hasOverride ? COLOR_OVERRIDE : COLOR_SMOOTH_DEFAULT
        const offset = Math.max(SMOOTH_DOT_MIN_OFFSET, hasOverride ? cur : 0)
        const dotPos = dragging
          ? [dragState.cursor.x, Y_DOTS + 0.003, dragState.cursor.z]
          : [
              sm.vertex[0] + sm.outBis[0] * offset,
              Y_DOTS + 0.003,
              sm.vertex[1] + sm.outBis[1] * offset,
            ]
        const smKey = `${sm.chainIdx}:${sm.vertexIdx}`
        const showOriginMarker = (originHint?.kind === 'smooth' && originHint.key === smKey)
          || dragging
        return (
          <group key={`sm-${sm.chainIdx}-${sm.vertexIdx}`}>
            {/* Origin marker — appears on tap or while dragging. Sits at
                the bend vertex itself. Drop the dot within SNAP_R of
                this marker to clear the smoothing on this vertex. */}
            {showOriginMarker && (
              <>
                <mesh position={[sm.vertex[0], Y_DOTS + 0.001, sm.vertex[1]]}
                      rotation={[-Math.PI / 2, 0, 0]} renderOrder={208}>
                  <circleGeometry args={[0.18, 16]} />
                  <meshBasicMaterial color="#ffffff" transparent opacity={1.0}
                    depthTest={false} depthWrite={false} />
                </mesh>
                <mesh position={[sm.vertex[0], Y_DOTS + 0.0015, sm.vertex[1]]}
                      rotation={[-Math.PI / 2, 0, 0]} renderOrder={209}>
                  <circleGeometry args={[0.10, 16]} />
                  <meshBasicMaterial color={hasOverride ? COLOR_OVERRIDE : COLOR_SMOOTH_DEFAULT}
                    transparent opacity={1.0}
                    depthTest={false} depthWrite={false} />
                </mesh>
              </>
            )}
            <mesh position={dotPos} rotation={[-Math.PI / 2, 0, 0]} renderOrder={211}>
              <circleGeometry args={[DOT_R_SMOOTH, 20]} />
              <meshBasicMaterial color={color} transparent opacity={1.0}
                depthTest={false} depthWrite={false} />
            </mesh>
            <mesh position={dotPos} rotation={[-Math.PI / 2, 0, 0]} renderOrder={212}>
              <ringGeometry args={[DOT_R_SMOOTH - 0.06, DOT_R_SMOOTH, 20]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={1.0}
                depthTest={false} depthWrite={false} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}
