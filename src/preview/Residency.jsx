/**
 * Residency — what the Ward HOLDS, by piece, along the spec's progression BAKED → VISIBLE → SELECTED → OPENED.
 * Read in the existing instruments: each Scene layer row carries its piece's line (PreviewApp LayerRow), and the GPU panel
 * carries the totals in bytes (GpuMonitor GpuPanel). This module measures; it draws nothing of its own.
 *
 * - BAKED: bytes the slab carries (`manifest.json#files`), by artifact class (artifactClass.js). What exists in the Ward.
 * - RESIDENT: what this page holds now. GPU: the GL ledger (glLedger.js) — textures by the file they came from, buffers,
 *   render targets, computed from the allocation calls. Geometry by piece: the typed arrays under each of <Town>'s named
 *   layer groups (`town:<piece>`), which three also keeps on the CPU.
 * - VISIBLE: the part of a piece's geometry whose mesh is shown and inside the camera's frustum this second. Per MESH:
 *   a merged mesh that is partly in view counts whole, so VISIBLE is an upper bound.
 * - SELECTED / OPENED: not reachable in Preview — it takes no taps (`<Town interactive={false}>`). Reported as such.
 *
 * It measures and never changes what is resident (BRIEF-phase2-E).
 * `window.__residency()` returns the same report as data.
 */
import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Frustum, Matrix4 } from 'three'
import { slabManifest } from '../lib/slabUrl.js'
import { slabClass } from './artifactClass.js'
import { getLedger } from './glLedger.js'
import { getActiveProfileId } from './deviceProfiles'

let latest = null
const subs = new Set()

const geomBytes = (g, seen) => {
  if (!g || seen.has(g)) return 0
  seen.add(g)
  let b = g.index?.array?.byteLength || 0
  for (const a of Object.values(g.attributes)) {
    const arr = a.isInterleavedBufferAttribute ? a.data.array : a.array
    if (arr && !seen.has(arr)) { seen.add(arr); b += arr.byteLength }
  }
  return b
}
const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true }

function measure(scene, camera, baked) {
  const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
  const pieces = {}
  const seen = new Set()
  scene.traverse((o) => {
    if (!o.isMesh && !o.isPoints && !o.isLine) return
    let piece = 'other'
    for (let p = o.parent; p; p = p.parent) if (p.name?.startsWith('town:')) { piece = p.name.slice(5); break }
    const b = geomBytes(o.geometry, seen)
    if (!b) return
    const e = pieces[piece] ||= { piece, resident: 0, visible: 0, meshes: 0 }
    e.resident += b; e.meshes++
    if (shown(o)) {
      if (o.isInstancedMesh && !o.boundingSphere) o.computeBoundingSphere?.()
      const s = o.isInstancedMesh ? o.boundingSphere : (o.geometry.boundingSphere || (o.geometry.computeBoundingSphere(), o.geometry.boundingSphere))
      const inView = !s || o.frustumCulled === false || frustum.intersectsSphere(s.clone().applyMatrix4(o.matrixWorld))
      if (inView) e.visible += b
    }
  })
  const L = getLedger()
  const tex = {}
  for (const t of L.textures.values()) {
    const cls = t.rt ? 'render targets' : (t.cls || 'unattributed')
    const e = tex[cls] ||= { cls, bytes: 0, n: 0 }
    e.bytes += t.bytes; e.n++
  }
  let buffers = 0; for (const b of L.buffers.values()) buffers += b.bytes
  let rbs = 0; for (const r of L.renderbuffers.values()) rbs += r.bytes
  return {
    target: getActiveProfileId(),
    baked,
    pieces: Object.values(pieces).sort((a, b) => b.resident - a.resident),
    gpu: { textures: Object.values(tex).sort((a, b) => b.bytes - a.bytes), buffers, renderbuffers: rbs,
      total: Object.values(tex).reduce((s, t) => s + t.bytes, 0) + buffers + rbs },
    jsHeap: performance.memory?.usedJSHeapSize ?? null,
    selected: 'not reachable in Preview (no taps)',
    opened: 'not reachable in Preview (no taps)',
    unknownFormats: [...L.unknownFormats],
  }
}

if (typeof window !== 'undefined') window.__residency = () => latest

/** In the Canvas: re-measures once a second. */
export function ResidencyProbe({ lookId }) {
  const { scene, camera } = useThree()
  const [baked, setBaked] = useState(null)
  useEffect(() => {
    let live = true
    slabManifest(lookId).then((m) => {
      if (!live || !m?.files) return
      const by = {}
      for (const [rel, f] of Object.entries(m.files)) {
        const cls = slabClass(rel)
        by[cls] = (by[cls] || 0) + (f.bytes || 0)
      }
      setBaked(by)
    })
    return () => { live = false }
  }, [lookId])
  const last = useRef(0)
  useFrame(() => {
    const t = performance.now()
    if (t - last.current < 1000) return
    last.current = t
    latest = measure(scene, camera, baked)
    for (const fn of subs) fn()
  })
  return null
}

/** The latest residency report (null until the probe's first second), re-rendering on each new one. */
export function useResidency() {
  const [, tick] = useState(0)
  useEffect(() => { const f = () => tick((n) => n + 1); subs.add(f); return () => subs.delete(f) }, [])
  return latest
}

// <Town>'s piece → the slab class whose files it draws (artifactClass.js), where it has one.
export const PIECE_SLAB = { ground: 'slab:ground', buildings: 'slab:buildings', trees: 'slab:trees', lamps: 'slab:lamps' }

/** One piece's line: geometry + its slab files' textures held, the part in view, and what the slab holds. */
export function pieceMemory(r, piece) {
  if (!r) return null
  const p = r.pieces.find((x) => x.piece === piece)
  const cls = PIECE_SLAB[piece]
  const tex = cls ? (r.gpu.textures.find((t) => t.cls === cls)?.bytes || 0) : 0
  if (!p && !tex) return null
  return { held: (p?.resident || 0) + tex, visible: p?.visible || 0, baked: cls ? r.baked?.[cls] ?? null : null }
}
