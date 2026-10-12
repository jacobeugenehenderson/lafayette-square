// The street furniture workstage (BRIEF-street-furniture §The work step 1): the catalog as a gallery, one
// asset in the preview, and the AUTHORED record beside it: mount · forward · triangle budget · which piece
// is which lit or sign role. Saves to street-furniture/tags.json through the server on :5555.
// Readiness is contract.js#assetStatus, the same function the server reports.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { Grid } from '@react-three/drei'
import RegimeControls from '../components/RegimeControls.jsx'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ROLES, MOUNTS, REQUIRED_ROLES, CENSUS, familyOf, assetStatus, assetKey, censusOf, noCensusWhy } from './contract.js'

const API = '/api/street-furniture'
const C = { bg: '#121212', panel: '#1b1b1b', line: '#2c2c2c', text: '#ddd', dim: '#888', ok: '#5c5', bad: '#d66', sel: '#4af' }

// The toy cycle, seconds. One clock, so the preview shows the same sequence the runtime will run.
const CYCLE = 14
function lampState(role, t, night) {
  const s = t % CYCLE
  switch (role) {
    case 'glass': return night
    case 'green': return s < 7
    case 'amber': return s >= 7 && s < 10
    case 'red':   return s >= 10
    case 'walk':  return s < 4
    case 'hand':  return s < 4 ? false : s < 7 ? Math.floor(s * 2) % 2 === 0 : true
    default:      return false
  }
}

// Split a loaded GLB into one mesh per piece (by the _PIECE vertex attribute), each with its own material,
// so a piece can be clicked, tinted and lit on its own. Preview only; the runtime keeps one draw.
function usePieces(scene) {
  return useMemo(() => {
    const out = []
    scene.traverse(o => {
      if (!o.isMesh) return
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry
      const pid = g.getAttribute('_piece')
      if (!pid) throw new Error('GLB has no _PIECE attribute — re-run street-furniture/ingest.mjs')
      const pos = g.getAttribute('position'), nor = g.getAttribute('normal')
      const byPiece = new Map()
      for (let i = 0; i < pos.count; i += 3) {
        const k = pid.getX(i)
        if (!byPiece.has(k)) byPiece.set(k, [])
        byPiece.get(k).push(i)
      }
      for (const [k, starts] of byPiece) {
        const p = new Float32Array(starts.length * 9), n = new Float32Array(starts.length * 9)
        starts.forEach((s, j) => { for (let c = 0; c < 3; c++) { p.set([pos.getX(s + c), pos.getY(s + c), pos.getZ(s + c)], j * 9 + c * 3); n.set([nor.getX(s + c), nor.getY(s + c), nor.getZ(s + c)], j * 9 + c * 3) } })
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(p, 3))
        geo.setAttribute('normal', new THREE.BufferAttribute(n, 3))
        out.push({ index: k, geo, base: o.material.color.clone() })
      }
    })
    return out
  }, [scene])
}

function Model({ asset, lod, draft, selected, onPick, night, playing }) {
  const gltf = useLoader(GLTFLoader, `${API}/glb/${asset.pack}/${asset.id}/${lod}`)
  const pieces = usePieces(gltf.scene)
  const nameOf = i => asset.pieces[i]?.name
  const mats = useMemo(() => pieces.map(p => new THREE.MeshStandardMaterial({ color: p.base, roughness: 0.7 })), [pieces])
  const t0 = useRef(performance.now())
  useFrame(() => {
    const t = playing ? (performance.now() - t0.current) / 1000 : 0
    pieces.forEach((p, j) => {
      const name = nameOf(p.index), role = draft.pieces?.[name], m = mats[j]
      const on = role && ROLES[role].emissive && lampState(role, t, night || role !== 'glass')
      m.emissive.setRGB(...(on ? ROLES[role].emissive : [0, 0, 0]))
      m.emissiveIntensity = on ? 2 : 0
      m.color.copy(name === selected ? new THREE.Color(C.sel) : p.base)
    })
  })
  return (
    <group rotation-y={THREE.MathUtils.degToRad(draft.forward ?? 0)}>
      {pieces.map((p, j) => (
        <mesh key={p.index} geometry={p.geo} material={mats[j]}
          onClick={e => { e.stopPropagation(); onPick(nameOf(p.index)) }} />
      ))}
    </group>
  )
}

function Stage({ asset, lod, draft, selected, onPick, night, playing }) {
  // Frame the whole bounding box (a mast arm reaches metres sideways), turned by the asset's forward.
  const { min, max } = asset.bbox
  const h = max[1] - min[1]
  const yaw = THREE.MathUtils.degToRad(draft.forward ?? 0)
  const centre = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
  const r = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2
  const d = r / Math.sin(THREE.MathUtils.degToRad(20)) * 1.05
  const eye = centre.clone().add(new THREE.Vector3(0.55, 0.35, 0.76).normalize().multiplyScalar(d))
  return (
    <Canvas key={assetKey(asset)} camera={{ position: eye.toArray(), fov: 40, near: 0.01, far: 500 }} onPointerMissed={() => onPick(null)}>
      <color attach="background" args={[night ? '#0a0c14' : '#2a2d33']} />
      <ambientLight intensity={night ? 0.08 : 0.6} />
      <directionalLight position={[5, 8, 6]} intensity={night ? 0.05 : 1.6} />
      <Grid args={[20, 20]} cellSize={0.5} sectionSize={1} infiniteGrid fadeDistance={30} cellColor="#444" sectionColor="#666" />
      {/* The street is +Z: after `forward` is applied, the asset's front faces this arrow. */}
      <arrowHelper args={[new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.02, 0), Math.max(1, h * 0.4), 0x44aaff]} />
      {draft.mount === 'wall' && <mesh position={[0, h / 2, -0.01]}><planeGeometry args={[h * 1.5, h * 1.2]} /><meshStandardMaterial color="#554" side={THREE.DoubleSide} /></mesh>}
      <Model {...{ asset, lod, draft, selected, onPick, night, playing }} />
      <RegimeControls regime="orbit" target={centre.toArray()} />
    </Canvas>
  )
}

const Btn = ({ on, children, ...p }) => (
  <button {...p} style={{ background: on ? '#345' : '#262626', color: C.text, border: `1px solid ${on ? C.sel : C.line}`, borderRadius: 4, padding: '3px 8px', margin: 2, cursor: 'pointer', font: 'inherit' }}>{children}</button>
)

// The number the choice is made by: this model's triangles × how many a town would place, per town.
// Mesh tier only: the impostor tier is not built for street furniture yet, and the table says so.
function Cost({ asset, lod, towns }) {
  const census = censusOf(asset.id)
  const tris = asset.lods.find(l => l.key === lod)?.tris
  const fmt = n => n >= 1e6 ? `${(n / 1e6).toFixed(2)} M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)} k` : String(n)
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ color: C.dim }}>Cost at {lod} · {census ? `× ${CENSUS[census].label}` : ''}</div>
      {!census ? <div style={{ color: C.bad }}>{noCensusWhy(asset.id)}</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 2 }}>
          <tbody>
            {towns.map(t => { const c = t.census[census]; return (
              <tr key={t.look} title={c.why ?? CENSUS[census].from}>
                <td style={{ padding: '1px 4px 1px 0' }}>{t.name}</td>
                {c.n == null ? <td colSpan={2} style={{ color: C.bad }}>{c.why}</td> : <>
                  <td style={{ textAlign: 'right', color: C.dim }}>{c.n.toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(c.n * tris)} tris</td>
                </>}
              </tr>) })}
          </tbody>
        </table>
      )}
      <div style={{ color: C.dim, marginTop: 2 }}>Mesh tier. The impostor tier for street furniture is not built yet.</div>
    </div>
  )
}

export default function StreetFurnitureApp() {
  const [assets, setAssets] = useState(null)
  const [error, setError] = useState(null)
  // ?asset=<pack>/<id> opens one asset directly (a link to share, and how the headless render probe opens it).
  const [id, setId] = useState(() => new URLSearchParams(location.search).get('asset'))
  const [towns, setTowns] = useState([])
  const [draft, setDraft] = useState({})
  const [selected, setSelected] = useState(null)
  const [night, setNight] = useState(false)
  const [playing, setPlaying] = useState(true)
  const [saveMsg, setSaveMsg] = useState(null)

  const load = () => fetch(`${API}/catalog`).then(r => r.json()).then(j => { if (j.error) throw new Error(j.error); setAssets(j.assets); setTowns(j.towns) }).catch(e => setError(e.message))
  useEffect(() => { load() }, [])

  const asset = assets?.find(a => assetKey(a) === id)
  useEffect(() => { setDraft(asset?.tags ? structuredClone(asset.tags) : { pieces: {} }); setSelected(null); setSaveMsg(null) }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  const status = asset ? assetStatus(asset, { [assetKey(asset)]: draft }) : null
  const lod = draft.lod ?? 'lod0'

  // The library is grouped by pack, then family (more than one pack: the choice is per model).
  const groups = useMemo(() => {
    const m = new Map()
    for (const a of assets || []) { const g = `${a.pack} · ${familyOf(a.id)}`; if (!m.has(g)) m.set(g, []); m.get(g).push(a) }
    return [...m]
  }, [assets])

  const set = patch => { setDraft(d => ({ ...d, ...patch })); setSaveMsg(null) }
  const setRole = role => set({ pieces: Object.fromEntries(Object.entries({ ...draft.pieces, [selected]: role }).filter(([, r]) => r)) })
  const save = () => fetch(`${API}/tags/${id}`, { method: 'POST', body: JSON.stringify(draft) }).then(r => r.json())
    .then(j => { if (j.error) throw new Error(j.error); setSaveMsg(j.status.ready ? 'saved · ready' : 'saved · not ready yet'); load() })
    .catch(e => setSaveMsg(`refused: ${e.message}`))

  if (error) return <div style={{ color: C.bad, padding: 20, font: '13px monospace' }}>{error}</div>
  if (!assets) return <div style={{ color: C.dim, padding: 20, font: '13px monospace' }}>loading catalog…</div>
  const piece = asset?.pieces.find(p => p.name === selected)
  const roleOrder = asset ? [...new Set([...(REQUIRED_ROLES[familyOf(asset.id)] || []), ...Object.keys(ROLES)])] : []

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr 320px', height: '100vh', background: C.bg, color: C.text, font: '12px/1.4 system-ui, sans-serif' }}>
      <div style={{ overflowY: 'auto', borderRight: `1px solid ${C.line}`, padding: 8 }}>
        <div style={{ fontSize: 14, marginBottom: 6 }}>Street furniture · {assets.filter(a => a.status.ready).length}/{assets.length} ready</div>
        {groups.map(([f, list]) => (
          <div key={f} style={{ marginBottom: 10 }}>
            <div style={{ color: C.dim, margin: '4px 0' }}>{f} · {list.length}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
              {list.map(a => (
                <div key={assetKey(a)} onClick={() => setId(assetKey(a))} title={`${assetKey(a)}\n${a.status.reasons.join('\n') || 'ready'}`}
                  style={{ position: 'relative', cursor: 'pointer', border: `1px solid ${assetKey(a) === id ? C.sel : C.line}`, borderRadius: 4, background: '#222', opacity: a.status.excluded ? 0.35 : 1 }}>
                  <img src={`${API}/icon/${a.pack}/${a.id}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'contain', display: 'block' }} />
                  <span style={{ position: 'absolute', top: 3, right: 3, width: 7, height: 7, borderRadius: 4, background: a.status.ready ? C.ok : a.tags ? C.bad : '#555' }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ position: 'relative' }}>
        {asset ? <Stage {...{ asset, lod, draft, selected, onPick: setSelected, night, playing }} />
          : <div style={{ color: C.dim, padding: 20 }}>Pick an asset.</div>}
      </div>

      <div style={{ overflowY: 'auto', borderLeft: `1px solid ${C.line}`, padding: 10, background: C.panel }}>
        {asset && <>
          <div style={{ fontSize: 14 }}>{asset.id} <span style={{ color: C.dim }}>· {asset.pack}</span></div>
          <div style={{ color: C.dim, marginBottom: 8 }}>{(asset.bbox.max[1] - asset.bbox.min[1]).toFixed(2)} m tall · {asset.pieces.length} pieces · source {asset.unit}</div>

          <div style={{ color: status.ready ? C.ok : C.bad, marginBottom: 8 }}>{status.ready ? 'Ready' : status.reasons.map(r => <div key={r}>· {r}</div>)}</div>

          <div style={{ color: C.dim }}>Mount</div>
          {MOUNTS.map(m => <Btn key={m} on={draft.mount === m} onClick={() => set({ mount: m })}>{m}</Btn>)}

          <div style={{ color: C.dim, marginTop: 8 }}>Forward (front faces the blue arrow = the street): {draft.forward ?? 'not set'}°</div>
          {[-90, -15, 15, 90].map(d => <Btn key={d} onClick={() => set({ forward: (((draft.forward ?? 0) + d) % 360 + 360) % 360 })}>{d > 0 ? '+' : ''}{d}°</Btn>)}
          <Btn on={Number.isFinite(draft.forward)} onClick={() => set({ forward: draft.forward ?? 0 })}>confirm</Btn>

          <div style={{ color: C.dim, marginTop: 8 }}>Triangle budget</div>
          {asset.lods.map(l => <Btn key={l.key} on={draft.lod === l.key} onClick={() => set({ lod: l.key })}>{l.key} · {l.tris.toLocaleString()}</Btn>)}
          <Cost asset={asset} lod={lod} towns={towns} />

          <div style={{ color: C.dim, marginTop: 8 }}>Piece {selected ? '' : '(click one in the preview)'}</div>
          {piece && <>
            <div><span style={{ display: 'inline-block', width: 10, height: 10, background: `rgb(${piece.kd.map(x => x * 255).join(',')})`, marginRight: 6 }} />{piece.name} · {piece.tris} tris · role {draft.pieces?.[selected] ?? 'none'}</div>
            {roleOrder.map(r => <Btn key={r} on={draft.pieces?.[selected] === r} onClick={() => setRole(r)}>{ROLES[r].label}</Btn>)}
            <Btn onClick={() => setRole(null)}>clear</Btn>
          </>}

          <div style={{ color: C.dim, marginTop: 8 }}>Tagged</div>
          {Object.entries(draft.pieces || {}).map(([n, r]) => (
            <div key={n} onClick={() => setSelected(n)} style={{ cursor: 'pointer', color: n === selected ? C.sel : C.text }}>{n} → {ROLES[r]?.label ?? r}</div>
          ))}

          <div style={{ color: C.dim, marginTop: 8 }}>Preview</div>
          <Btn on={night} onClick={() => setNight(!night)}>night</Btn>
          <Btn on={playing} onClick={() => setPlaying(!playing)}>sequence</Btn>

          <div style={{ marginTop: 12 }}>
            <Btn onClick={save}>Save</Btn>
            <div style={{ color: C.dim, marginTop: 8 }}>Exclude (not for use), with the reason</div>
            <input value={draft.excluded ?? ''} placeholder="reason" onChange={e => set({ excluded: e.target.value || undefined })}
              style={{ width: '100%', background: '#222', color: C.text, border: `1px solid ${C.line}`, borderRadius: 4, padding: 4 }} />
            {saveMsg && <div style={{ marginTop: 4, color: saveMsg.startsWith('refused') ? C.bad : C.dim }}>{saveMsg}</div>}
          </div>
        </>}
      </div>
    </div>
  )
}
