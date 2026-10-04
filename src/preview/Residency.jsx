/**
 * Residency — what the Ward HOLDS, by piece, along the spec's progression BAKED → VISIBLE → SELECTED → OPENED.
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

const MB = (b) => `${(b / 1048576).toFixed(1)}`
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

export function ResidencyPanel() {
  const [, tick] = useState(0)
  const [open, setOpen] = useState(true)
  useEffect(() => { const f = () => tick((n) => n + 1); subs.add(f); return () => subs.delete(f) }, [])
  const r = latest
  const bakedTotal = r?.baked ? Object.values(r.baked).reduce((s, b) => s + b, 0) : null
  return (
    <div className="glass-panel rounded-xl p-3" style={{ fontSize: 11 }}>
      <button className="section-heading" onClick={() => setOpen(!open)} style={{ cursor: 'pointer', background: 'none', border: 0, padding: 0, color: 'inherit' }}>
        {open ? '▾' : '▸'} residency · GPU {r ? MB(r.gpu.total) : '—'} MB{bakedTotal != null ? ` · slab ${MB(bakedTotal)} MB` : ''}
      </button>
      {open && r && <>
        <div className="glass-text-dim" style={{ fontSize: 9, margin: '4px 0 6px', lineHeight: 1.4 }}>
          target {r.target} · BAKED = the slab's files · resident = held now · VISIBLE = shown and in frustum (per mesh, an upper bound)
          · SELECTED / OPENED: {r.selected}
        </div>
        <div className="flex font-mono glass-text-dim" style={{ fontSize: 9 }}>
          <span style={{ flex: 1 }}>geometry by piece (MB)</span><span style={{ width: 56, textAlign: 'right' }}>resident</span><span style={{ width: 56, textAlign: 'right' }}>VISIBLE</span>
        </div>
        {r.pieces.map((p) => (
          <div key={p.piece} className="flex font-mono" style={{ fontSize: 10, lineHeight: '15px' }}>
            <span style={{ flex: 1 }}>{p.piece} · {p.meshes} meshes</span>
            <span style={{ width: 56, textAlign: 'right' }}>{MB(p.resident)}</span><span style={{ width: 56, textAlign: 'right' }}>{MB(p.visible)}</span>
          </div>
        ))}
        <div className="flex font-mono glass-text-dim" style={{ fontSize: 9, marginTop: 6 }}>
          <span style={{ flex: 1 }}>GPU by source (MB)</span><span style={{ width: 56, textAlign: 'right' }}>resident</span><span style={{ width: 56, textAlign: 'right' }}>BAKED</span>
        </div>
        {r.gpu.textures.map((t) => (
          <div key={t.cls} className="flex font-mono" style={{ fontSize: 10, lineHeight: '15px' }}>
            <span style={{ flex: 1 }}>textures · {t.cls} · {t.n}</span>
            <span style={{ width: 56, textAlign: 'right' }}>{MB(t.bytes)}</span><span style={{ width: 56, textAlign: 'right' }}>{r.baked?.[t.cls] != null ? MB(r.baked[t.cls]) : ''}</span>
          </div>
        ))}
        <div className="flex font-mono" style={{ fontSize: 10, lineHeight: '15px' }}><span style={{ flex: 1 }}>buffers (all geometry)</span><span style={{ width: 56, textAlign: 'right' }}>{MB(r.gpu.buffers)}</span><span style={{ width: 56 }} /></div>
        <div className="flex font-mono" style={{ fontSize: 10, lineHeight: '15px' }}><span style={{ flex: 1 }}>renderbuffers</span><span style={{ width: 56, textAlign: 'right' }}>{MB(r.gpu.renderbuffers)}</span><span style={{ width: 56 }} /></div>
        <div className="glass-text-dim" style={{ fontSize: 9, marginTop: 4, lineHeight: 1.4 }}>
          CPU: geometry above is also held on the CPU (three keeps the arrays) · JS heap {r.jsHeap != null ? `${MB(r.jsHeap)} MB` : 'not exposed by this browser'}
          · decoded images held by the browser are not visible to the page{r.unknownFormats.length ? ` · ⚠️ unsized formats: ${r.unknownFormats.join(', ')}` : ''}
        </div>
      </>}
    </div>
  )
}
