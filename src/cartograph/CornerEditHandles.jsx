/**
 * CornerEditHandles — the corner-radius authoring kit (Survey).
 *
 * Surfaces a draggable handle at EVERY drawn tile corner when the operator flips
 * the "Corners > Edit" toggle in the Streets panel. The corner LIST is sourced
 * from the live TILE build (`tileCorners`, published by BlockGeometryV2Debug) —
 * the same topology the render is built from — NOT the legacy
 * `ribbons.intersections` list (which is smaller and mis-keyed, so it missed
 * handles, dropped divided-avenue legs, and drew nothing where its raw-OSM point
 * didn't match the tile vertex). This is the T3 "one corner truth" migration
 * (HANDOFF-tile-T3-corner-handles.md).
 *
 *   - **Filleted corner** → the magenta handle IS the achieved curb ARC (the
 *     `fillet` the build rounded this corner to — never a re-derived preview).
 *   - **Unfilleted corner (R=0)** → a small SQUARE marker at the sharp vertex,
 *     so square corners are visible AND un-squarable (drag out to author a radius).
 *
 * Gesture: world-space distance from cursor to the corner vertex V sets the
 * effective radius. The handle tracks the cursor during drag (Illustrator
 * pattern); dragging within SNAP_R of V commits R=0. Color coding: magenta =
 * default radius, gold = operator-authored, white = mid-drag.
 *
 * Persistence: per-corner → `cornerCornerRadiusOverrides`, keyed by the tile
 * corner's own `key` (= `<pointKey>|<legKeyA>|<legKeyB>`, legs sorted so the key
 * is invariant under A/B swap) — exactly the key `resolveVertR` reads overrides
 * off, so a drag round-trips to the radius for free. Lives in the active Look's
 * `design.json`.
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

// Hit radius (world meters) around the corner's VISIBLE handle (the curb-arc
// midpoint) — generous, because the corner itself is the grab target now and the
// arc sits inboard of the apex; aiming at the magenta must land the grab.
const HIT_R_CORNER = 5.0
// Drag this close to the IX center and the gesture snaps + clears the
// override on release. World meters.
const SNAP_R = 0.7
// Tap threshold — if the cursor moves less than this between down and up,
// we treat the gesture as a click (toggles the origin marker) instead of
// a drag (commits a radius).
const TAP_THRESHOLD = 0.25
// Y offset above ground so dots sit above the ribbon stack (which tops
// out around Y=0.020 for V2's `cornerSidewalkPads`).
const Y_DOTS = 0.05
// Color logic — corner + IX defaults + shared override / drag colors so the
// modal state is unambiguous.
const COLOR_CORNER_DEFAULT = '#ff3df0'  // magenta = editable, default radius
const COLOR_OVERRIDE = '#ffaa00'        // gold = operator-authored radius
const COLOR_DRAG = '#ffffff'            // white
// Side (world meters) of the marker drawn at an UNFILLETED (R=0) corner — a small
// square so a sharp corner is visible AND grabbable (drag out to author a radius).
const SQUARE_SIZE = 1.2

const ixKey = (p) => `${(+p[0]).toFixed(3)},${(+p[1]).toFixed(3)}`
const DEFAULT_R = 4.5

// Angular extent of a curb arc — between the two tangent points tA/tB, the side
// that bulges toward the apex. Returns ringGeometry { thetaStart, thetaLength }
// in the flat (rotation=[-π/2,0,0]) frame, where a world XZ angle ψ → local -ψ.
// The handle reads the ACHIEVED fillet's tA/tB/apex directly (the live drag
// drives the store, so the achieved geometry tracks the radius) — there is no
// separate idealized preview to keep in sync.
function arcExtentFrom(C, tA, tB, apex) {
  const norm = (a) => { a %= 2 * Math.PI; if (a < 0) a += 2 * Math.PI; return a }
  const psiA = Math.atan2(tA[1] - C[1], tA[0] - C[0])
  const psiB = Math.atan2(tB[1] - C[1], tB[0] - C[0])
  const psiQ = Math.atan2(apex[1] - C[1], apex[0] - C[0])
  const dAB = norm(psiB - psiA)
  const dAQ = norm(psiQ - psiA)
  const start = dAQ <= dAB ? psiA : psiB
  const length = dAQ <= dAB ? dAB : 2 * Math.PI - dAB
  return { thetaStart: -(start + length), thetaLength: length }
}

// Build the handle layout from the TILE corner set (`tileCorners`, published by
// BlockGeometryV2Debug off the live tile build) — the corners actually drawn, one
// per sharp tile-ring vertex. This is the T3 migration: the handle corner-LIST is
// now sourced from the same topology the render is built from, NOT the legacy
// `ribbons.intersections` (a smaller raw-OSM list the render no longer matches —
// missing handles, divided-avenue legs dropped, key-mismatch invisibles). Each
// tile corner already carries its `key` (= the write-path key `resolveVertR` reads
// overrides off), its two legs, and the achieved `fillet` arc, so no geometry is
// re-derived here — the handle IS the corner the build computed.
function computeCornerLayout(tileCorners) {
  if (!tileCorners?.length) return []
  // Dedup by full corner key — a corner identity can be emitted by >1 tile at a
  // shared node; prefer the entry that carries a fillet.
  const byKey = new Map()
  for (const tc of tileCorners) {
    if (!tc || !tc.key || !tc.V) continue
    const prev = byKey.get(tc.key)
    if (!prev || (!prev.fillet && tc.fillet)) byKey.set(tc.key, tc)
  }
  // Group by IX (the corner point V) for the render <group> structure; the corner
  // identity is the full `key`.
  const groups = new Map()
  for (const tc of byKey.values()) {
    const gk = ixKey(tc.V)
    let g = groups.get(gk)
    if (!g) { g = { ixKey: gk, V: tc.V, corners: [] }; groups.set(gk, g) }
    g.corners.push({ key: tc.key, V: tc.V, legKeyA: tc.legA, legKeyB: tc.legB, fillet: tc.fillet || null })
  }
  return [...groups.values()]
}

export default function CornerEditHandles() {
  // Corner SHAPE authoring is a Survey concern (the corner is two things in two
  // tools — RIBBONS / ARCHITECTURE §2.1). The corner handles show ONLY under the
  // Survey tool; Section shows its own (ped) handles. Gate by tool so the
  // per-tool handle split is honoured.
  const tool = useCartographStore(s => s.tool)
  const cornerEditMode = useCartographStore(s => s.cornerEditMode)
  const cornerOverrides = useCartographStore(s => s.cornerCornerRadiusOverrides) || {}
  const cornerRadiusScale = useCartographStore(s => s.cornerRadiusScale ?? 1)
  const setCornerCornerRadius = useCartographStore(s => s.setCornerCornerRadius)
  const setIxCornerRadius = useCartographStore(s => s.setIxCornerRadius)
  // The TILE corner set from the live build — the handle's corner LIST AND each
  // corner's achieved curb arc (`fillet`), one corner truth. The live drag commits
  // to the store each frame, so this whole array is rebuilt every frame mid-drag;
  // route the derived layout through a ref so the pointer-listener effect below
  // doesn't tear down / re-add its DOM handlers on every commit (which would churn
  // pointer capture mid-drag). The effect's grabTarget reads the ref, so the
  // hit-test still sees fresh fillets while the render reads the live layout.
  const tileCorners = useCartographStore(s => s.tileCorners) || []
  const { camera, gl } = useThree()

  const dragRef = useRef(null)
  const [dragState, setDragState] = useState(null)
  // Tap on a dot toggles a non-destructive "origin marker" — a tiny
  // crosshair at the IX center. Reveals where to drag to reset without
  // disturbing the current arc. Cleared automatically when a drag commits.
  //   { kind: 'corner', key: <the tile corner's stable key> }
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

  const layout = useMemo(() => computeCornerLayout(tileCorners), [tileCorners])
  // The layout rebuilds every frame during a live drag (tileCorners is a fresh
  // array each tile build). Read it through a ref in the listeners so they aren't
  // torn down mid-drag; gate the effect on `hasLayout` (empty→non-empty) only.
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  const hasLayout = layout.length > 0

  useEffect(() => {
    if (tool !== 'surveyor') return
    if (!cornerEditMode) return
    if (!hasLayout) return

    const dom = gl.domElement

    // Find the corner whose VISIBLE handle is nearest the cursor, within
    // HIT_R_CORNER. The grab target is the curb-arc midpoint (where the magenta
    // sits) when the corner is filleted — the achieved fillet's arc midpoint —
    // else the sharp vertex V (where the R=0 square marker sits). Reads the live
    // layout via the ref so the fillet stays fresh mid-drag.
    const grabTarget = (entry, c) => {
      const f = c.fillet
      if (f && f.apex && f.C && Number.isFinite(f.r)) {
        const ax = f.apex[0] - f.C[0], az = f.apex[1] - f.C[1]
        const al = Math.hypot(ax, az) || 1
        return [f.C[0] + (ax / al) * f.r, f.C[1] + (az / al) * f.r]
      }
      return entry.V
    }
    const pickCorner = (p) => {
      let best = null, bestD = HIT_R_CORNER
      for (const entry of layoutRef.current) {
        for (let ci = 0; ci < entry.corners.length; ci++) {
          const c = entry.corners[ci]
          const t = grabTarget(entry, c)
          const d = Math.hypot(p.x - t[0], p.z - t[1])
          if (d < bestD) { bestD = d; best = { entry, ci, c } }
        }
      }
      return best
    }

    const onDown = (e) => {
      const p = screenToWorld(e.clientX, e.clientY, camera, dom)
      const hit = pickCorner(p)
      if (!hit) return

      // Right-click a corner → revert just THAT corner to default.
      if (e.button === 2) {
        setCornerCornerRadius(hit.entry.V, hit.c.legKeyA, hit.c.legKeyB, null)
        e.preventDefault(); e.stopPropagation()
        return
      }
      if (e.button !== 0) return

      // Left-click a corner → grab it. Drag tunes the radius (cursor → V). The
      // corner `key` is the stable identity (the layout rebuilds every frame, so
      // group/index positions are not stable mid-drag).
      dragRef.current = {
        kind: 'corner',
        cornerKey: hit.c.key,
        V: hit.entry.V.slice(),
        legKeyA: hit.c.legKeyA, legKeyB: hit.c.legKeyB,
        downPos: p,
      }
      setDragState({
        kind: 'corner', cornerKey: hit.c.key,
        cursor: p, r: Math.hypot(p.x - hit.entry.V[0], p.z - hit.entry.V[1]),
      })
      dom.setPointerCapture?.(e.pointerId)
      e.stopPropagation()
    }

    const flushCommit = (drag, baseR) => {
      // Snap-to-origin sets R=0 (sharp corner) as an explicit authored
      // override — the operator-side dial for square corners. This is
      // distinct from clearing the override entirely (right-click on the
      // IX dot does that — falls back through per-IX → default-R rule).
      // Anything between origin and SNAP_R counts as snap-to-zero per the
      // visual snap behavior below.
      const snapZero = drag.snapping || baseR < (SNAP_R / Math.max(0.0001, cornerRadiusScale))
      const persistR = snapZero ? 0 : baseR
      if (drag.kind === 'ix') {
        setIxCornerRadius(drag.V, persistR)
      } else {
        setCornerCornerRadius(drag.V, drag.legKeyA, drag.legKeyB, persistR)
      }
    }

    const onMove = (e) => {
      const drag = dragRef.current
      if (!drag) {
        // HOVER feedback — when the cursor is over a grabbable corner, show the
        // grab cursor (hoverTarget → 'pointer' in CartographApp). CornerEditHandles
        // fires before SurveyorOverlay (registered first); stopImmediatePropagation
        // when over a corner keeps SurveyorOverlay's move from clobbering
        // hoverTarget back to false. Off a corner we don't stop, so Survey's own
        // hover (centerlines / asphalt handles) still works.
        const hp = screenToWorld(e.clientX, e.clientY, camera, dom)
        if (pickCorner(hp)) {
          useCartographStore.getState().setHoverTarget(true)
          e.stopImmediatePropagation()
        }
        return
      }
      const p = screenToWorld(e.clientX, e.clientY, camera, dom)
      // Corner drags measure cursor → V (IX point); store the base radius.
      const anchor = drag.V
      const dx = p.x - anchor[0], dz = p.z - anchor[1]
      const r = Math.hypot(dx, dz)
      // Snap-to-reset: when the cursor is within SNAP_R of the origin,
      // the dot pins visually to the origin and the gesture commits as
      // a clear. The drag.snapping flag persists into flushCommit so the
      // commit path knows to send `null` regardless of baseR wobble.
      const snapping = r < SNAP_R
      drag.snapping = snapping
      // Corner radii get multiplied by cornerRadiusScale at render time.
      const baseR = r / Math.max(0.0001, cornerRadiusScale)
      const cursorForVisual = snapping
        ? { x: anchor[0], z: anchor[1] }
        : p
      // Visual update (cheap) — synchronous so the drag highlight tracks the
      // cursor at frame rate. The ARC itself is the published achieved fillet
      // (rendered below), not a re-derived preview.
      setDragState(prev => prev && { ...prev, cursor: cursorForVisual, r: snapping ? 0 : r, snapping })
      // DRIVE THE STORE LIVE (rAF-throttled). The handle reads the ACHIEVED
      // fillet (tileCornerFillets) for its arc — the same one-corner-truth path
      // as at rest — so the drag preview IS the bake and physically cannot
      // detach. tileGround re-runs on commit (live == bake). rAF-throttle caps it
      // to one rebuild per frame; on heavy scenes (LS) the rebuild can exceed a
      // frame, so the arc lags the cursor slightly — correct over smooth, and
      // toy (the authoring surface) keeps up.
      pendingCommitRef.current = baseR
      // Only drive the store once the gesture is unambiguously a DRAG (moved past
      // the tap threshold) — a tap commits nothing (it toggles the origin marker
      // in onUp). Without this gate the live rAF would commit a radius before
      // onUp's tap detection runs.
      const movedFromDown = drag.downPos
        ? Math.hypot(p.x - drag.downPos.x, p.z - drag.downPos.z)
        : Infinity
      if (movedFromDown > TAP_THRESHOLD && rafRef.current == null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null
          const d = dragRef.current
          if (d && pendingCommitRef.current != null) flushCommit(d, pendingCommitRef.current)
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
          const hintKind = drag.kind === 'ix' ? 'ix' : 'corner'
          const key = drag.kind === 'ix' ? `${drag.V}` : drag.cornerKey
          setOriginHint(prev => (prev?.kind === hintKind && prev.key === key) ? null : { kind: hintKind, key })
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

    const onContextMenu = (e) => {
      // Suppress browser context menu while in corner-edit mode so the
      // right-click-to-revert gesture doesn't pop a system menu.
      e.preventDefault()
    }

    const opts = { capture: true }
    dom.addEventListener('pointerdown', onDown, opts)
    dom.addEventListener('pointermove', onMove, opts)
    dom.addEventListener('pointerup', onUp, opts)
    dom.addEventListener('pointercancel', onUp, opts)
    dom.addEventListener('contextmenu', onContextMenu, opts)
    return () => {
      dom.removeEventListener('pointerdown', onDown, opts)
      dom.removeEventListener('pointermove', onMove, opts)
      dom.removeEventListener('pointerup', onUp, opts)
      dom.removeEventListener('pointercancel', onUp, opts)
      dom.removeEventListener('contextmenu', onContextMenu, opts)
    }
    // NOTE: the layout is intentionally NOT a dep — it's a fresh array every frame
    // during a live drag; the handlers read it via layoutRef so the listeners
    // aren't torn down mid-drag. `hasLayout` (empty→non-empty) is the only
    // layout-shaped dep, so the effect re-binds once when corners first arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, cornerEditMode, hasLayout, camera, gl, setCornerCornerRadius, setIxCornerRadius, cornerRadiusScale])

  if (tool !== 'surveyor') return null
  if (!cornerEditMode) return null
  if (!layout.length) return null

  return (
    <group>
      {layout.map((entry) => {
        const { V, corners, ixKey: gKey } = entry
        return (
          <group key={gKey}>
            {corners.map((c) => {
              const ck = c.key
              const hasOverride = Number.isFinite(cornerOverrides[ck])
              const draggingCorner = dragState?.kind === 'corner' && dragState.cornerKey === ck
              const color = draggingCorner ? COLOR_DRAG : hasOverride ? COLOR_OVERRIDE : COLOR_CORNER_DEFAULT
              const fit = c.fillet
              // FILLETED corner: the corner IS the handle — paint just the CURB ARC,
              // the ACHIEVED fillet the construction produced (one corner truth — the
              // magenta IS the curb, never drifts). The drag drives the store live
              // (rAF), so tileGround re-runs and this fillet reflects the dragged
              // radius — the preview is the bake and cannot detach.
              if (fit && fit.tA && fit.tB && Number.isFinite(fit.r)) {
                const C = fit.C, rr = fit.r
                const { thetaStart, thetaLength } = arcExtentFrom(fit.C, fit.tA, fit.tB, fit.apex || V)
                // A band straddling the curb line (radius rr from the arc centre),
                // ~0.9 m wide so it reads + is grabbable; the hit-test stays generous.
                const inner = Math.max(0.05, rr - 0.6)
                const outer = rr + 0.3
                return (
                  <mesh key={ck} position={[C[0], Y_DOTS, C[1]]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={204}>
                    <ringGeometry args={[inner, outer, 48, 1, thetaStart, thetaLength]} />
                    <meshBasicMaterial color={color} transparent opacity={draggingCorner ? 1.0 : 0.85}
                      side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
                  </mesh>
                )
              }
              // UNFILLETED corner (R=0 square, or a fillet not yet landed mid-rebuild):
              // draw a small SQUARE marker at the sharp vertex V — so square corners are
              // visible AND un-squarable (drag out to author a radius). Grabbable via
              // grabTarget's V fallback.
              return (
                <mesh key={ck} position={[V[0], Y_DOTS, V[1]]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={204}>
                  <planeGeometry args={[SQUARE_SIZE, SQUARE_SIZE]} />
                  <meshBasicMaterial color={color} transparent opacity={draggingCorner ? 1.0 : 0.85}
                    side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
                </mesh>
              )
            })}
          </group>
        )
      })}
    </group>
  )
}
