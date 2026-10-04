/**
 * Preview — standalone runtime simulator at /preview.
 *
 * Reads only baked / flattened / reduced outputs. Per
 * `project_ls_parity_pipeline.md`: must reach LS parity, full fidelity.
 * The GPU monitor (right panel) governs additions — every layer toggle
 * notes a Δ-event so spikes are tagged with their cause.
 */
import { Canvas, useFrame } from '@react-three/fiber'
import Town from '../components/Town.jsx'
import { surfaceQuality, townCanvasProps } from '../lib/qualityProfile.js'
import DeploymentPanel, { liveDeployment, useDeployment } from './DeploymentPanel.jsx'
import DiagnosisPanel from './DiagnosisPanel.jsx'
import { gpuWindow } from './frameCost.js'
import useListings from '../hooks/useListings'
import { useEffect, useMemo, useRef, useState } from 'react'

import { invalidateTreeAtlas } from '../components/treeAtlasMaterial'
import { shotReachable, SHOT_LABELS, streetStandOf } from '../camera/shots.js'
import { useSceneStencil } from '../lib/cameraRegimes.js'
import useTimeOfDay from '../hooks/useTimeOfDay'
import { INSTANCE } from '../instance.js'
import { slabManifest } from '../lib/slabUrl.js'
import DawnTimeline from '../components/DawnTimeline'
import { RENDER_TIERS } from '../lib/renderTiers.js'
import { setActiveProfileId } from './deviceProfiles'
// Preview mounts the SHARED PostProcessing consumer with `inspect` (the per-pass
// toggle matrix, which can only take out a pass the tier ships) — the retired
// PreviewPostFx forked its own composer + driver.
import { mountedPasses } from '../components/renderPipeline.jsx'
import PhoneFrame, { BODY_W as PHONE_FRAME_W, BODY_H as PHONE_FRAME_H } from './PhoneFrame'
import StripChart from './StripChart'
import TriggerBar from './TriggerBar'
import FilesTab from './FilesTab.jsx'
import { ResidencyProbe, pieceMemory, useResidency } from './Residency.jsx'
import { stop as phoneBusStop, startSpan as phoneBusStartSpan, endSpan as phoneBusEndSpan, recordColdStart } from './phoneBus'
import { STARTUP_SEQUENCE, readStartupMarks } from '../lib/startupMarks.js'
import {
  GpuMonitorTicker, GpuPanel, noteEvent, measureToggle,
  getLayerCost, layerCostSubscribe,
} from './GpuMonitor'

function BasicLights() {
  return (
    <>
      <hemisphereLight args={['#bcd4ff', '#3a3a30', 0.6]} />
      <ambientLight intensity={0.15} />
      <directionalLight
        position={[120, 200, 80]} intensity={2.2} color="#fff5e0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1} shadow-camera-far={1800}
        shadow-camera-left={-900} shadow-camera-right={900}
        shadow-camera-top={900} shadow-camera-bottom={-900}
        shadow-bias={-0.0001}
      />
    </>
  )
}

function ForceDaytimeOnMount() {
  const setTime = useTimeOfDay((s) => s.setTime)
  useEffect(() => {
    const d = new Date(); d.setHours(10, 30, 0, 0); setTime(d)
  }, [setTime])
  return null
}
// Preview targets a continuously-rendering runtime (mobile/desktop app):
// frameloop="always" is more honest about cost than demand+invalidate.

// The camera is <Town>'s: ShotFlight flies between shots, <Town controls> mounts one regime per shot
// (src/lib/cameraRegimes.js). ⛔ Preview adds no gesture of its own: it is the player's experience, and in the player the
// movie takes no input (Jacob, 2026-10-04). Its drag/wheel → Browse rule is gone.

// ?frameloop=demand — inspect <Town paused> as the Ward runs it (Preview draws "always" by default).
const PREVIEW_FRAMELOOP = new URLSearchParams(window.location.search).get('frameloop') === 'demand' ? 'demand' : 'always'
// ?inset=top,right,bottom,left (CSS px) — inspect <Town viewInset>: the plan frames into what an app's UI leaves free.
const PREVIEW_INSET = (() => {
  const q = new URLSearchParams(window.location.search).get('inset')
  if (!q) return undefined
  const [top, right, bottom, left] = q.split(',').map(Number)
  if (![top, right, bottom, left].every(Number.isFinite)) throw new Error(`[Preview] ?inset=${q} — four numbers: top,right,bottom,left (CSS px)`)
  return { top, right, bottom, left }
})()
// ?movers=you@lat,lon;courier@lat,lon,active|idle — inspect <Town movers>: each kind's look on this town's ground.
const PREVIEW_MOVERS = (() => {
  const q = new URLSearchParams(window.location.search).get('movers')
  if (!q) return undefined
  return q.split(';').map((one, i) => {
    const [kind, rest = ''] = one.split('@')
    const [lat, lon, state] = rest.split(',')
    return { id: `${kind}-${i}`, kind, lat: Number(lat), lon: Number(lon), ...(kind === 'courier' ? { active: state === 'active' } : {}) }
  })
})()

const APP_BAR_H = 48


function TopAppBar({ shot, setShot, mode, setMode }) {
  const btn = (k, label, active, onClick, disabled = false) => (
    <button key={k} onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={disabled ? 'Not reachable from the current shot in production' : undefined}
      className={`rounded-lg px-3 py-1 ${disabled ? '' : 'cursor-pointer'} ${active ? 'glass-text' : 'glass-text-secondary'}`}
      style={{
        fontSize: 13,
        background: active ? 'rgba(255,255,255,0.18)' : 'transparent',
        opacity: disabled ? 0.35 : 1,
      }}>{label}</button>
  )
  const divider = (key) => (
    <span key={key} style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.12)', margin: '0 8px' }} />
  )
  return (
    <div className="absolute z-20 flex items-center pointer-events-auto"
      style={{
        top: 0, left: 0, right: 0, height: APP_BAR_H,
        padding: '0 12px', gap: 4,
        background: 'rgba(20,20,22,0.92)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(8px)',
      }}>
      <a href="/cartograph" className="rounded-lg px-3 py-1 cursor-pointer glass-text-secondary"
        style={{ fontSize: 13, textDecoration: 'none' }}>← Stage</a>
      {divider('d1')}
      <span className="rounded-lg px-3 py-1 glass-text-dim"
        style={{ fontSize: 13, background: 'rgba(255,255,255,0.04)' }}>{INSTANCE?.name ?? 'Choose a town'} ▼</span>
      <div style={{ flex: 1 }} />
      {btn('desktop',  'Desktop',  mode === 'desktop',  () => { setMode('desktop');  noteEvent('mode→desktop') })}
      {btn('phone-hi', 'Phone hi', mode === 'phone-hi', () => { setMode('phone-hi'); noteEvent('mode→phone-hi') })}
      {btn('phone-lo', 'Phone lo', mode === 'phone-lo', () => { setMode('phone-lo'); noteEvent('mode→phone-lo') })}
      {divider('d2')}
      {Object.entries(SHOT_LABELS).map(([k, label]) =>
        btn(k, label, shot === k, () => { setShot(k); noteEvent(`shot→${k}`) }, !shotReachable(shot, k))
      )}
    </div>
  )
}

// ── Preview layer-toggle convention (Vernier, 2026-05-26) ──────────────────
// Every Scene-layer toggle gates `.visible` (a <group visible={...}> wrapper,
// or an `enabled`-style prop for non-drawn drivers like fog), NEVER the mount.
// Rationale: Preview is production's render tree + inspection bolt-ons over the
// top (project_preview_equals_ls_literally) — "all on" must equal production's
// literal mount list, and a toggle must be a clean per-frame on/off, not a
// destructive unmount/dispose/re-upload that churns the GPU meter.
//   - A layer whose cost is a draw (geometry) → wrap in <group visible>.
//   - A layer that is a scene property (fog) → pass an `enabled` prop; the
//     component nulls the property instead of unmounting.
//   - The ONE sanctioned mount-gate is the live LafayetteScene buildings:
//     production unmounts them (the slab is the rendered path), so they stay
//     unmounted here too — visibility-gating ~1082 dead meshes would regress
//     production. The Buildings toggle gates the SLAB's .visible.
//   - PostFX is the exception: the composer can only add/remove passes, so FX
//     toggles mount/unmount their pass. Accepted (cheap, full-screen) — but
//     the same transient caveat applies to FX deltas.
// Migration A/B flags (e.g. a tree-impostor on/off during a cutover) are
// TEMPORARY: ship as one extra toggle, then collapse to a single .visible
// toggle once the new path is operator-confirmed. (This is the convention
// Azimuth's Phase-C tree-impostor flag adopts — the retired `slabBuildings`
// A/B is the worked example.)
// The page's cold start is the strip's first recording (phoneBus recordColdStart): the startup marks as ticks, every
// fetched file as an assets span labelled with its size.
const fmtKB = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`)
recordColdStart({ sequence: STARTUP_SEQUENCE, readMarks: readStartupMarks,
  describe: (e) => `${fmtKB(e.decodedBodySize)} decoded · ${fmtKB(e.transferSize)} wire` })

const SCENE_LAYERS = [
  ['ground',     'Ground'],
  ['buildings',  'Buildings'],
  ['trees',      'Trees'],
  ['park',       'Park (paths/water/canopy)'],
  ['lights',     'Streetlamps'],
  ['arch',       'Gateway Arch'],
  ['neon',       'Neon'],
  ['celestial',  'Sky + Sun'],
  ['clouds',     'Clouds'],
  ['fog',        'Atmospheric Fog'],
]
const FX_LAYERS = [
  ['ao',     'N8AO'],
  ['bloom',  'Bloom'],
  ['aerial', 'Halo'],   // label matches the Stage control (Sky & Light → Halo); key stays `aerial` (the AerialPerspective effect)
  ['grade',  'Film Grade'],
  ['grain',  'Film Grain'],
  ['smaa',   'SMAA (AA)'],
  ['dof',    'DoF'],   // mounts only where the Look authors a blur (its gate) — verify via ?dofDebug=1
]
// The deployment panel's names for the passes (the inspection rows' names, and the one they do not list).
const FX_LABELS = { ...Object.fromEntries(FX_LAYERS), heroLadder: 'Hero ladder (DoF)' }

// EVERY TOGGLE STARTS ON — the inspection's starting state is the shipping render;
// a toggle only takes something out to measure it.
//   neon  — mounts via <SceneNeon>, lit by the Look's authored hours as in
//           production (only Stage forces tubes on).
//   fog   — <StageFog> reads scene.mist; on by default for parity.
//   post-FX — every pass ON, because a toggle can only take OUT what the tier
//           ships (renderPipeline.jsx#mountedPasses): all on = production's
//           mount list for the tier, DoF and the hero ladder by the scene's gate.
const DEFAULT_LAYERS = {
  // `buildings` gates the merged-mesh slab's visibility (production ships the
  // L1.3 slab; the live LafayetteScene buildings stay unmounted, as in
  // production). The old `slabBuildings` A/B toggle was retired in Phase 2 —
  // there is now one Buildings toggle, gating .visible.
  ground: true, buildings: true, trees: true,
  park: true, lights: true, arch: true, neon: true,
  celestial: true, clouds: true, fog: true,
  ao: true, bloom: true, aerial: true, grade: true, grain: true, smaa: true, dof: true,
}

// v3 (Vernier Phase 2): retired the `slabBuildings` A/B key — one `buildings`
// toggle now gates the slab's .visible. Old v2 state is dropped (defaults
// reapply) and its key cleaned up, since the buildings semantics changed.
const LAYERS_KEY = 'preview.layers.v3'
const LAYERS_KEY_PREV = 'preview.layers.v2'
function loadLayers() {
  if (typeof localStorage === 'undefined') return DEFAULT_LAYERS
  try {
    if (localStorage.getItem(LAYERS_KEY_PREV)) localStorage.removeItem(LAYERS_KEY_PREV)
    const raw = localStorage.getItem(LAYERS_KEY)
    if (!raw) return DEFAULT_LAYERS
    // Drop any retired keys (e.g. slabBuildings) not in DEFAULT_LAYERS.
    const saved = JSON.parse(raw)
    const next = { ...DEFAULT_LAYERS }
    for (const k of Object.keys(DEFAULT_LAYERS)) if (k in saved) next[k] = saved[k]
    return next
  } catch { return DEFAULT_LAYERS }
}
function saveLayers(layers) {
  if (typeof localStorage === 'undefined') return
  try { localStorage.setItem(LAYERS_KEY, JSON.stringify(layers)) }
  catch { /* ignore quota / disabled */ }
}

const fmtNum = (n) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M`
                    : n >= 1_000     ? `${(n/1_000).toFixed(1)}K`
                    : `${Math.round(n)}`

// The per-layer metric a row ranks on. Scene layers are geometry — ranked by
// DRAW CALLS (the mobile-critical number; tris shown for context). Post-FX are
// full-screen passes with ~0 geometry — their cost is MS, so showing them
// against a draw/tri budget read "post-fx · N triangles", nonsense. They rank
// on ms instead. (Vernier Phase 2 redraw — Jacob's eye, 2026-06-18.)
function layerMetricValue(cost, metric) {
  if (!cost) return 0
  return metric === 'ms' ? Math.max(0, cost.ms) : Math.max(0, cost.calls)
}

// A layer row = a RANKED HOG. The bar is this layer's share of the HEAVIEST
// layer in its group (heaviest = full bar), in absolute units — NOT a budget %.
// Dividing one layer's draws by the whole-DEVICE budget produced "Trees 1004%"
// (a single layer can dwarf the per-frame ceiling); that's a category error.
// Budget-% is a SCENE-TOTAL question and now lives in the verdict (GpuPanel).
// Heat is RELATIVE WEIGHT (which layers are the hogs), not a good/bad call.
// A Scene layer's <Town> piece (its `town:<piece>` group), for the row's memory line (Residency.jsx).
const LAYER_PIECE = { ground: 'ground', buildings: 'buildings', trees: 'trees', park: 'park', lights: 'lamps', arch: 'setPieces', celestial: 'sky', clouds: 'clouds' }
const fmtMB = (b) => `${(b / 1048576).toFixed(b < 10485760 ? 1 : 0)}`

function LayerRow({ layerKey, label, on, onToggle, disabled, metric, groupMax }) {
  const mem = pieceMemory(useResidency(), LAYER_PIECE[layerKey])
  const cost = getLayerCost(layerKey)
  const draws = cost ? Math.max(0, cost.calls) : 0
  const tris  = cost ? Math.max(0, cost.tris)  : 0
  const ms    = cost ? Math.max(0, cost.ms)    : 0

  const value = layerMetricValue(cost, metric)
  const share = groupMax > 0 ? value / groupMax : 0      // 0..1 of the heaviest
  const pct = share * 100
  const color =
    !cost ? 'rgba(255,255,255,0.18)'
    : share > 0.66 ? 'var(--warning, #f5a623)'   // the hogs
    : share > 0.33 ? '#fbbf24'
    : '#5eead4'                                   // light — teal, not "good/green"

  const readout = !cost ? '—'
    : metric === 'ms' ? `${ms.toFixed(1)} ms`
    : `${fmtNum(draws)}d · ${fmtNum(tris)}t`

  return (
    <div style={{ opacity: disabled ? 0.4 : 1 }}>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={on}
          disabled={disabled}
          onChange={(e) => {
            measureToggle(layerKey, e.target.checked)
            onToggle(e.target.checked)
            noteEvent(`${layerKey}=${e.target.checked ? 'on' : 'off'}`)
          }}
        />
        <span className="glass-text-secondary" style={{ flex: 1, fontSize: 12 }}>{label}</span>
      </label>
      <div className="flex items-center gap-2" style={{ paddingLeft: 22, marginTop: 2 }}>
        <div style={{
          flex: 1, height: 6, borderRadius: 3,
          background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
        }}>
          <div style={{
            width: `${Math.min(100, pct)}%`, height: '100%',
            background: color, transition: 'width 200ms ease',
          }} />
        </div>
        <span className="font-mono glass-text-dim" style={{
          fontSize: 10, minWidth: 110, textAlign: 'right',
        }}>
          {readout}
        </span>
      </div>
      {mem && (
        <div className="profiler-note" style={{ paddingLeft: 22 }} title="held = geometry + this piece's slab textures on the GPU · in view = shown and in frustum (per mesh) · slab = the baked files">
          {fmtMB(mem.held)} MB held · {fmtMB(mem.visible)} in view{mem.baked != null ? ` · slab ${fmtMB(mem.baked)}` : ''}
        </div>
      )}
    </div>
  )
}

// A toggle group (Scene / Post-FX). Subscribes once to layer-cost changes,
// computes the group's heaviest cost (its metric), and feeds every row its
// share. Keeping a single subscription here (vs. per-row) is what lets the
// share-of-heaviest bar stay consistent across rows on the same render.
function LayerSection({ title, layerList, layers, setLayer, metric, footer, defaultExpanded = false, notOnTier = null }) {
  const [, force] = useState(0)
  useEffect(() => layerCostSubscribe(() => force(n => n + 1)), [])
  // Twirl-collapsible, collapsed by default — there's a lot of roster to look at
  // but only a little to see at any moment (Jacob, 2026-06-24). Open to toggle.
  const [expanded, setExpanded] = useState(defaultExpanded)
  let groupMax = 0
  for (const [key] of layerList) {
    const v = layerMetricValue(getLayerCost(key), metric)
    if (v > groupMax) groupMax = v
  }
  return (
    <div className="glass-panel rounded-xl p-3 space-y-2">
      <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center"
        style={{ gap: 6, padding: 0, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ display: 'inline-block', width: 10, color: 'var(--on-surface-subtle)',
          transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }}>▸</span>
        <span className="section-heading" style={{ marginBottom: 0 }}>{title}</span>
      </button>
      {expanded && (
        <>
          <div className="space-y-1">
            {layerList.map(([key, label]) => (
              <LayerRow key={key} layerKey={key} label={notOnTier?.has(key) ? `${label} — not on this tier` : label}
                metric={metric} groupMax={groupMax} disabled={notOnTier?.has(key)}
                on={!!layers[key]} onToggle={(v) => setLayer(key, v)} />
            ))}
          </div>
          {footer}
        </>
      )}
    </div>
  )
}

function TimeControl() {
  return (
    <div className="space-y-2">
      <div className="section-heading">Time of Day</div>
      <DawnTimeline />
    </div>
  )
}

// The profiler's three instruments, one at a time: the strip (frames against budget, with the cold start's marks and
// fetches on its lanes), the GPU panel (draws / tris / memory / GPU vs main), and the files table (FilesTab.jsx).
function ProfilerBody({ tab }) {
  if (tab === 'strip') return <StripChart height={220} />
  // The strip's height, so switching tabs never pushes the phone off the screen; the panel scrolls inside it.
  return <div className="profiler-panel" style={{ height: 220, overflowY: 'auto' }}>{tab === 'gpu' ? <GpuPanel /> : <FilesTab />}</div>
}

// Desktop: the same profiler in the right panel, closed to one line until opened.
function DesktopProfiler({ tab, setTab }) {
  const [open, setOpen] = useState(false)
  const r = useResidency()
  const ttw = readStartupMarks()['first-truthful-frame']
  return (
    <div className="profiler-panel">
      <button onClick={() => setOpen(!open)} className="section-heading" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', width: '100%', textAlign: 'left' }}>
        {open ? '▾' : '▸'} profiler · TIME TO WARD {ttw == null ? '—' : `${(ttw / 1000).toFixed(2)} s`} · GPU {r ? `${Math.round(r.gpu.total / 1048576)} MB` : '—'}
      </button>
      {open && <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <ProfilerTab tab={tab} setTab={setTab} />
        <ProfilerBody tab={tab} />
      </div>}
    </div>
  )
}

function ProfilerTab({ tab, setTab }) {
  const btn = (id, label) => (
    <button
      key={id}
      onClick={() => setTab(id)}
      className="profiler-panel"
      style={{
        padding: '4px 10px',
        fontSize: 11,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        opacity: tab === id ? 1 : 0.5,
        cursor: 'pointer',
      }}
    >{label}</button>
  )
  return (
    <div style={{ display: 'flex', gap: 4, flex: 'none' }}>
      {btn('strip', 'strip')}
      {btn('gpu', 'gpu')}
      {btn('files', 'files')}
    </div>
  )
}

// How to read the per-layer numbers — caveats that, unstated, would mislead
// (Vernier Phase 2). Bars rank by share of the heaviest layer (relative weight,
// not a budget call — that's the scene verdict); render cost, not memory;
// non-additive.
function SceneCaveats() {
  return (
    <div className="glass-text-dim" style={{
      fontSize: 9.5, lineHeight: 1.5, paddingTop: 6, marginTop: 2,
      borderTop: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div><b>ranked by share of heaviest</b> — bars show each layer's draws relative to the biggest hog, not a budget %. The budget call is the scene verdict (gpu tab).</div>
      <div><b>render cost, not memory</b> — toggles hide a layer (skip its draw); geometry stays GPU-resident.</div>
      <div><b>deltas don't sum</b> — overdraw is shared (hiding trees also cuts buildings' fill); trust the all-on total, not the sum of layers.</div>
    </div>
  )
}

function FxCaveats() {
  return (
    <div className="glass-text-dim" style={{
      fontSize: 9.5, lineHeight: 1.5, paddingTop: 6, marginTop: 2,
      borderTop: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div><b>post-FX cost is ms</b> — full-screen passes draw no geometry; ranked by frame-time, not draws/tris.</div>
    </div>
  )
}

// Pyramid tuner — edits the ACTIVE environment's blur bracket (meta phase 2).
// ⛔ UNFINISHED: IT REACHES NOTHING YET. The degree it edits is never handed to the
// renderer, DownsamplePyramid ignores levels/radius/resolutionScale, and phones do
// not run the pyramid at all. Kept on purpose (Jacob, 2026-10-04): it is the intent
// that phones run every effect at a lower rung — renderTiers.js says why and where.
function PyramidTuner({ envId, degree, onChange }) {
  // Twirl-collapsible, collapsed by default, like the roster cards below (Jacob, 2026-09-27).
  const [expanded, setExpanded] = useState(false)
  if (!degree) return null
  const row = (key, label, min, max, step, digits) => (
    <div className="space-y-0.5" key={key}>
      <div className="flex items-baseline justify-between">
        <span className="glass-text-secondary" style={{ fontSize: 12 }}>{label}</span>
        <span className="font-mono glass-text-dim" style={{ fontSize: 11 }}>
          {Number(degree[key]).toFixed(digits)}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step}
        value={Number(degree[key])}
        onChange={(e) => onChange(key, parseFloat(e.target.value))}
        className="w-full" style={{ accentColor: '#5eead4' }} />
    </div>
  )
  return (
    <div className="glass-panel rounded-xl p-3 space-y-2">
      <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center"
        style={{ gap: 6, padding: 0, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ display: 'inline-block', width: 10, color: 'var(--on-surface-subtle)',
          transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }}>▸</span>
        <span className="section-heading" style={{ marginBottom: 0 }}>Pyramid · {envId} · unfinished</span>
      </button>
      {expanded && (
        <>
          {row('levels', 'Levels', 1, 8, 1, 0)}
          {row('resolutionScale', 'Resolution', 0.1, 1, 0.05, 2)}
          {row('radius', 'Radius', 0, 1, 0.05, 2)}
          <div className="glass-text-dim" style={{ fontSize: 9, lineHeight: 1.4 }}>
            Unfinished — these values do not reach the render yet. They are the planned
            blur bracket per tier (phones running every effect at a lower rung).
          </div>
        </>
      )}
    </div>
  )
}

function RightPanel({ layers, setLayer, top, bottom, envId, degree, onTuneDegree, quality, profilerTab, setProfilerTab, deployment, shot }) {
  // The passes this tier's profile ships at all (gates aside): the rest have nothing to toggle.
  const tierPasses = new Set(mountedPasses({ quality, dofOn: true }).map((e) => e.id))
  const notOnTier = new Set(FX_LAYERS.map(([k]) => k).filter((k) => !tierPasses.has(k)))
  // The diagnosis measures what is SHOWN and SHIPPED: the Scene layers that are on, and the passes this surface ships.
  const diagnosed = [
    ...SCENE_LAYERS.filter(([k]) => layers[k]).map(([key, label]) => ({ key, label, piece: LAYER_PIECE[key] })),
    ...FX_LAYERS.filter(([k]) => tierPasses.has(k) && layers[k]).map(([key, label]) => ({ key, label, pass: true })),
  ]
  // One layer out and back, bracketed by fresh GPU readings (frameCost.js#gpuWindow): at rest · out · at rest. The cost
  // is rest − out; the two rests' spread is that row's noise. Temporary: the layer is back on before the next.
  // ⛔ Not GpuMonitor's measureToggle: its baseline is a 30-sample rolling window, so back to back it still held the
  // previous layer's "out" frames and read costs as large as −38 ms (2026-10-04).
  // Settle long enough for a post pass's composer rebuild (and its shader compile) at a few frames a second.
  const SETTLE_MS = 3000, WINDOW_MS = 2500
  const settle = () => new Promise((r) => setTimeout(r, SETTLE_MS))
  const measureLayer = async (key) => {
    const rest1 = await gpuWindow(WINDOW_MS)
    setLayer(key, false); noteEvent(`${key}=off (diagnosis)`)
    await settle()
    const out = await gpuWindow(WINDOW_MS)
    setLayer(key, true); noteEvent(`${key}=on (diagnosis)`)
    await settle()
    const rest2 = await gpuWindow(WINDOW_MS)
    if (rest1.ms == null || out.ms == null || rest2.ms == null) return { gpuMs: null, noise: null }
    return { gpuMs: (rest1.ms + rest2.ms) / 2 - out.ms, noise: Math.abs(rest1.ms - rest2.ms), rest: (rest1.ms + rest2.ms) / 2 }
  }
  return (
    <div className="absolute z-10 flex flex-col gap-3 pointer-events-auto overflow-y-auto"
      style={{ top, right: 24, bottom, width: RIGHT_PANEL_W }}>
      {/* Time of Day stays at the very top. */}
      <div className="glass-panel rounded-xl p-3">
        <TimeControl />
      </div>

      {/* The phone tiers show the profiler under the phone; the desktop tier shows it here, closed to one line. */}
      {envId === 'desktop' && <DesktopProfiler tab={profilerTab} setTab={setProfilerTab} />}

      {/* Pyramid tuner leads the tools; it and the roster cards below
          twirl-collapse (default closed) to cut the clutter. */}
      <PyramidTuner envId={envId} degree={degree} onChange={onTuneDegree} />

      {/* What this surface SHIPS (deployment.json) — authored, autosaved; below it, what you are inspecting (temporary). */}
      {deployment}
      <DiagnosisPanel surface={envId} shot={shot} layers={diagnosed} measure={measureLayer} />

      <LayerSection title="Scene" layerList={SCENE_LAYERS} layers={layers}
        setLayer={setLayer} metric="draws" footer={<SceneCaveats />} />

      <LayerSection title="Post-FX" layerList={FX_LAYERS} layers={layers}
        setLayer={setLayer} metric="ms" footer={<FxCaveats />} notOnTier={notOnTier} />
    </div>
  )
}

const MODE_KEY = 'preview.mode.v1'
// Environments = device-regime tiers (same ids as deviceProfiles / renderTiers).
// Extended from the old binary desktop|phone — the mode toggle IS the env
// selector (the device-regime workflow, meta phase 1). phone-hi/phone-lo both
// render the phone frame through the phone profile; today they differ only in the
// gauge budgets they are judged against (deviceProfiles.js) — see renderTiers.js.
const ENV_IDS = ['desktop', 'phone-hi', 'phone-lo']
function loadMode() {
  if (typeof localStorage === 'undefined') return 'desktop'
  try {
    const raw = localStorage.getItem(MODE_KEY)
    if (raw === 'phone') return 'phone-hi'             // migrate the old binary value
    return ENV_IDS.includes(raw) ? raw : 'desktop'
  } catch { return 'desktop' }
}
function saveMode(m) {
  if (typeof localStorage === 'undefined') return
  try { localStorage.setItem(MODE_KEY, m) } catch { /* ignore */ }
}

// Editable per-environment pyramid degrees (the tuner edits these; meta phase 2).
// Seeded from RENDER_TIERS, persisted, merged over defaults so new envs/keys
// always resolve. Same load/save shape as the layer matrix.
const TIERS_KEY = 'preview.renderTiers.v1'
function loadTiers() {
  if (typeof localStorage === 'undefined') return RENDER_TIERS
  try {
    const raw = localStorage.getItem(TIERS_KEY)
    if (!raw) return RENDER_TIERS
    const saved = JSON.parse(raw)
    const next = {}
    for (const id of Object.keys(RENDER_TIERS)) {
      next[id] = { pyramid: { ...RENDER_TIERS[id].pyramid, ...(saved[id]?.pyramid || {}) } }
    }
    return next
  } catch { return RENDER_TIERS }
}
function saveTiers(t) {
  if (typeof localStorage === 'undefined') return
  try { localStorage.setItem(TIERS_KEY, JSON.stringify(t)) } catch { /* ignore */ }
}

const RIGHT_PANEL_W = 400
const RIGHT_PANEL_GUTTER = 24
const STAGE_PADDING = 24
// Default phone display scale — 0.65 keeps a Pro Max reading as a phone, not a billboard,
// and leaves room beneath for the strip-chart band.
const PHONE_TARGET_SCALE = 0.65

function usePhoneScale(active) {
  const [scale, setScale] = useState(PHONE_TARGET_SCALE)
  useEffect(() => {
    if (!active) return
    const compute = () => {
      const sw = window.innerWidth - RIGHT_PANEL_W - RIGHT_PANEL_GUTTER * 2 - STAGE_PADDING * 2
      // Reserve vertical room for the strip-chart band: 220 chart + 32 trigger row + ~24 gap.
      const sh = window.innerHeight - APP_BAR_H - STAGE_PADDING * 2 - 280
      const fit = Math.min(sw / PHONE_FRAME_W, sh / PHONE_FRAME_H)
      // Use target scale unless the window is too small, then shrink to fit.
      setScale(Math.max(0.3, Math.min(PHONE_TARGET_SCALE, fit)))
    }
    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [active])
  return scale
}

// The Preview canvas's WebGL renderer, captured at onCreated — so the Publish
// panel can grab the current SLAB frame (the 3D render only; the UI panels are
// separate DOM overlays, never on the canvas) for the link-preview image.
let _ogCaptureGL = null
// Center-crop the live slab frame to a square JPEG data URL (for og:image).
function captureOGImage(size = 1200) {
  const gl = _ogCaptureGL
  if (!gl?.domElement) throw new Error('scene not ready')
  const src = gl.domElement
  const s = Math.min(src.width, src.height)
  const off = document.createElement('canvas')
  off.width = size; off.height = size
  off.getContext('2d').drawImage(src, (src.width - s) / 2, (src.height - s) / 2, s, s, 0, 0, size, size)
  return off.toDataURL('image/jpeg', 0.9)
}

// ── Publish panel — the gate (PREVIEW.md §0.2). Preview is the publish gate;
// this is the button that ships the verified slab the canon way: bake → commit
// the look's slab → push STAGING (its own URL, the dry-run) → verify there →
// PROMOTE to prod. Talks to the dev-only serve.js git endpoints via the vite
// proxy (`/api/cartograph/*`). In a DEPLOYED Preview there is no backend, so
// the status probe fails and the whole panel renders null — it can't touch the
// live app. (HANDOFF: gated two-step ceremony, 2026-06-30.)
function PublishPanel({ lookId }) {
  const [status, setStatus] = useState(null)   // object = backend up; false = none
  const [busy, setBusy] = useState(null)        // 'staging' | 'prod' | null
  const [msg, setMsg] = useState(null)          // { kind:'ok'|'err', text }
  const [deploys, setDeploys] = useState({ staging: null, prod: null }) // {status:'building'|'ready', bakedAt, url}
  const [capturing, setCapturing] = useState(false)
  // A bake that would RE-POUR the town (the server's 428: the pour's code changed) is a question, never "bake failed"
  // (Jacob, 2026-09-29: Provincetown's Publish printed the raw JSON). { files } while the operator decides.
  const [repour, setRepour] = useState(null)
  // ⭐ THE DEV DRAWER, AND IT IS FOR THE DEVELOPER — NOT THE OPERATOR (Jacob, 2026-09-04:
  // "a collapsible git area for you, basically, to get through developing").
  // ⛔ This does NOT reverse "no git in this panel" (2026-08-29). That rule is about the
  // OPERATOR'S FACE, and it stands: the two gestures are "put it up in a sample way" and
  // "put it up, overwriting production" — neither is a git thing, even though the reality
  // is. The drawer is a second audience behind a closed door, not a change to the first.
  // ⛔ DEFAULT CLOSED, and in-memory by design — a refresh returns to the operator's face.
  const [drawer, setDrawer] = useState(false)
  const API = `/api/cartograph/looks/${encodeURIComponent(lookId)}`

  async function load() {
    try {
      const r = await fetch(`${API}/publish/status`)
      if (!r.ok) return setStatus(false)
      setStatus(await r.json())
    } catch { setStatus(false) }   // no dev backend (deployed Preview) → hide
  }
  useEffect(() => { load() }, [lookId])  // eslint-disable-line react-hooks/exhaustive-deps

  // ⛔⛔ READ THE WORLD ON MOUNT — DO NOT REMEMBER WHAT THIS SESSION DID.
  // `deploys` used to be written ONLY by publishStaging/promoteProd, so it recorded an
  // EVENT this tab witnessed rather than a FACT about the sites. Hard-refresh and the
  // whole row vanished — Visit included — while the deploy was live and fine (Jacob,
  // 2026-08-29). That is the same failure as trusting a cached iframe: the panel
  // reporting its own history as the world's state.
  // ⭐ So the state is DERIVED, every mount: ask each live site what slab it is actually
  // serving and compare against ours. It survives a refresh, it is right when a deploy
  // failed silently, and it is the answer in the operator's terms — "is the site showing
  // my work?" — with no branch and no commit count anywhere near it.
  useEffect(() => {
    if (!status || status.bakedAt == null) return
    let cancelled = false
    ;(async () => {
      for (const key of ['staging', 'prod']) {
        try {
          const j = await (await fetch(`${API}/deployed?target=${key}`)).json()
          if (cancelled) return
          setDeploys(prev => {
            // Never clobber a push this session is still watching land.
            if (prev[key]?.status === 'building') return prev
            return { ...prev, [key]: { status: String(j.bakedAt) === String(status.bakedAt) ? 'ready' : 'behind', bakedAt: j.bakedAt, url: status.sites?.[key]?.url ?? null } }
          })
        } catch { /* a site that cannot be reached stays unknown rather than claiming ready */ }
      }
    })()
    return () => { cancelled = true }
  }, [status, API])  // eslint-disable-line react-hooks/exhaustive-deps

  // Poll the LIVE site (server-side via the backend → no browser CORS) until its
  // bakedAt matches what we pushed → the deploy has propagated. Flips the row to
  // "ready" + reveals Visit; never auto-opens (no stale tab, no 10-min ambush).
  useEffect(() => {
    const pending = Object.entries(deploys).filter(([, d]) => d && d.status === 'building')
    if (!pending.length) return
    let cancelled = false
    const tick = async () => {
      for (const [key, d] of pending) {
        try {
          const j = await (await fetch(`${API}/deployed?target=${key}`)).json()
          if (!cancelled && j.bakedAt != null && String(j.bakedAt) === String(d.bakedAt)) {
            setDeploys(prev => ({ ...prev, [key]: { ...prev[key], status: 'ready' } }))
          }
        } catch { /* keep polling */ }
      }
    }
    const iv = setInterval(tick, 15000); tick()
    return () => { cancelled = true; clearInterval(iv) }
  }, [deploys, API])  // eslint-disable-line react-hooks/exhaustive-deps

  async function publishStaging(confirmRepour = false) {
    setBusy('staging'); setMsg(null); setRepour(null)
    try {
      const bake = await fetch(`${API}/bake${confirmRepour ? '?repour=1' : ''}`, { method: 'POST' })
      // 428 = this bake would re-pour the town because the pour's code changed; nothing ran. Ask, as BakeModal does.
      if (bake.status === 428) {
        const body = await bake.json().catch(() => ({}))
        setRepour({ files: body.repour?.files || [] })
        setBusy(null)
        return
      }
      if (!bake.ok) throw new Error(`bake failed: ${(await bake.text()).slice(0, 160)}`)
      const pub = await fetch(`${API}/publish`, { method: 'POST' })
      const data = await pub.json()
      if (!pub.ok || data.error) throw new Error(data.error || 'publish failed')
      const n = data.changed?.length || 0
      setMsg({ kind: 'ok', text: `Pushed to staging${data.committed ? ` · ${n} file${n === 1 ? '' : 's'}` : ' · no slab change'}` })
      setDeploys(prev => ({ ...prev, staging: { status: 'building', bakedAt: data.bakedAt, url: data.stagingUrl } }))
      await load()
    } catch (e) { setMsg({ kind: 'err', text: String(e.message || e) }) }
    setBusy(null)
  }

  async function promoteProd() {
    // ⭐ The address is the one the server derived for THIS look, from Operations — never the
    // page's own INSTANCE, which is whatever town Preview happens to be showing.
    const to = status.sites?.prod?.url
    if (!to) { setMsg({ kind: 'err', text: status.sites?.prod?.why || 'no production address' }); return }
    if (!window.confirm(`Promote this look to PRODUCTION at ${to}?\n\nOnly this town changes. Its player is the build now on staging.`)) return
    setBusy('prod'); setMsg(null)
    try {
      const r = await fetch(`${API}/promote`, { method: 'POST' })
      const data = await r.json()
      if (!r.ok || data.error) throw new Error(data.error || 'promote failed')
      // ⛔ `ok` is the DOMAIN's answer, not ours: the server asks the town's own address which
      // town and which pour it serves. Shipped-but-not-serving comes back as an error with the
      // reason, so a site whose DNS has not settled never reads as promoted.
      setDeploys(prev => ({ ...prev, prod: { status: 'ready', bakedAt: data.bakedAt, url: data.prodUrl } }))
      await load()
    } catch (e) { setMsg({ kind: 'err', text: String(e.message || e) }) }
    setBusy(null)
  }

  // Snapshot the current slab frame → center-square JPEG → public/photos/og-preview.jpg.
  // It is committed with the next Publish (it is in the slab pathspecs); nothing ships it on its own.
  async function smsCapture() {
    setCapturing(true); setMsg(null)
    try {
      const dataUrl = captureOGImage()  // current slab frame (no UI) → center-square JPEG
      const r = await fetch('/api/cartograph/og-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl }) })
      const data = await r.json()
      if (!r.ok || data.error) throw new Error(data.error || 'save failed')
      setMsg({ kind: 'ok', text: `Captured · ${Math.round(data.bytes / 1024)} KB` })
    } catch (e) { setMsg({ kind: 'err', text: String(e.message || e) }) }
    setCapturing(false)
  }

  if (!status) return null   // probing or no backend → render nothing
  // ⭐ ONE CONDITION DRIVES BOTH THE TENSE AND THE DISABLE (Jacob, 2026-08-31).
  // They used to be two: `disabled` keyed on `ahead === 0`, the LABEL on the live
  // site having finished building. So the moment after a promote the button was
  // grey and still read "Promote to Prod" — inert but present-tense, which reads
  // as "this failed" — and the only thing saying otherwise was a green line
  // underneath. Nothing to ship IS the past tense; there is no third state.
  const clean = !status.unbaked && !status.dirty?.length
  // ⛔⛔ A TARGET IS CURRENT ONLY IF **BOTH** SHIPMENTS LANDED — code AND slab (2026-09-04).
  // These read `clean && ahead === 0` alone, i.e. git only, and that is now half an answer:
  // since the slab left the repo it ships to R2, not in a commit, so "no commits ahead" says
  // nothing about the canopy. On 2026-09-04 prod sat at ahead 0 with 830 of 915 objects
  // stale — the button would have gone inert and past-tense over a live, wrong map, which is
  // the Layer 0 failure (a plausible success nobody is told about) committed by the gate.
  // ⭐ The slab half is READ, not remembered: `/deployed?target=` fetches what that key space
  // actually serves and the derive-on-mount effect compares it to ours.
  // ⚠️ 'building' COUNTS AS CURRENT, and that is load-bearing — it is what preserves the
  // 2026-08-31 fix. Gating on 'ready' alone would make the button present-tense and live for
  // the minutes Pages takes to build, which reads as "that failed" (the exact defect the
  // one-condition rule was written to kill). We just shipped it; it is on its way.
  // ⛔ UNKNOWN IS NOT CURRENT. A site we cannot reach leaves `deploys[key]` undefined and the
  // button stays live — it offers to ship rather than claiming a state it could not read.
  const slabCurrent = (key) => ['ready', 'building'].includes(deploys[key]?.status)
  // ⛔⛔ STAGING NO LONGER GOES THROUGH A BRANCH, SO A COMMIT COUNT CANNOT ANSWER FOR IT.
  // This read `aheadStaging === 0`, which was right while Publish pushed a trunk that
  // `staging.yml` deployed. Since staging became a direct upload to R2 (2026-09-21) that
  // count never returns to zero — measured 18 the same evening — so the button could NEVER
  // say "Published to Staging", however many times it succeeded. The operator pressed it,
  // it worked, and it told him nothing: "it's hard to tell" (Jacob).
  // ⭐ The two things staging actually ships are the SLAB and the shared PLAYER, so both
  // must be current: `slabCurrent` reads the live scene.json's bakedAt, and `status.player`
  // compares the published build marker against local source. ⛔ An absent marker counts as
  // STALE — an unstamped player is not a current one.
  const playerCurrent = status.player ? status.player.stale === false : false
  const stagingDone = clean && slabCurrent('staging') && playerCurrent
  // ⭐ PROD SHIPS THE SAME TWO THINGS NOW (2026-09-26): the slab, and the player this town has
  // PINNED — current when it is the build staging serves. No git: Promote no longer pushes a
  // branch, so a commit count would never return to zero and the button would never rest.
  // ⛔ A town still on legacy hosting (LS until its cutover) or with no address is not "done" —
  // the button stays live and Promote refuses with the reason.
  const prodDone    = clean && slabCurrent('prod') && status.prodPlayer?.current === true
  const prodBlocked = !status.sites?.prod?.url || status.sites?.prod?.legacy
  const btn = (extra) => ({ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.14)', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginTop: 6, ...extra })
  // ⛔ NO GIT IN THIS PANEL (Jacob, 2026-08-29: "the user shouldn't know about the git").
  // A branch name and a commit count answer a question the operator does not have. The
  // one they DO have is "is the site showing my work?", and that is `bakedAt` on the live
  // site vs ours — see the derive-on-mount effect above.
  // ⭐ VISIT ALWAYS RENDERS WHEN THERE IS AN ADDRESS. It is a property of the look, not of
  // a deploy this tab happened to watch, so it must not come and go with session state —
  // that was the reported bug.
  // ⛔ ONE LINE PER TARGET (Jacob, 2026-08-29: "why are there two staging areas").
  // A "Staging · Visit →" row above a "Publish to Staging" button named the same thing
  // twice. The button IS the row: it says the state (past-tense and inert when the site
  // is current) and carries that site's link beside it.
  // ⛔⛔ AND WHEN THERE IS NO ADDRESS, IT SAYS SO RATHER THAN OFFERING ONE (H-18 ③,
  // 2026-09-21). `sites` is now derived per look on the server and each side is
  // `{ url }` or `{ url: null, why }`: huron declares no domain, so it has no production
  // address, and the panel prints that reason instead of linking Lafayette Square's —
  // which is exactly what it used to do, from a module constant, for every town.
  const visitLink = (key) => {
    const site = status.sites?.[key]
    const url = deploys[key]?.url || site?.url
    if (!url) {
      if (!site?.why) return null
      return <span title={site.why}
        style={{ flex: '0 0 auto', color: '#9ca3af', fontSize: 11 }}>no address</span>
    }
    return <a href={url} target="_blank" rel="noopener noreferrer" title={site?.note || undefined}
      style={{ flex: '0 0 auto', color: '#bfdbfe', textDecoration: 'underline', fontSize: 11 }}>Visit →</a>
  }
  const targetRow = (key, button) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>{button}</div>
      {visitLink(key)}
    </div>
  )
  // ⛔ Past-tense AND INERT when there is nothing to send (Jacob, 2026-08-29). A
  // site already showing your latest has nothing to publish, so the button states
  // that and stops being a button — it does not offer a re-do nobody asked for.
  // ⚠️ The pair that used to live here — `stagingCurrent` / `prodCurrent`, keyed on
  // the live deploy reaching 'ready' — is GONE, not renamed. Waiting on the site to
  // finish building was the whole defect: for the minutes Pages takes, the button
  // was inert AND present-tense, which reads as a failure. `stagingDone`/`prodDone`
  // above answer the question the operator actually has — is there anything of mine
  // still unsent — and that is true the instant the push lands.

  return (
    <div style={{ position: 'absolute', left: 12, bottom: 12, zIndex: 50, display: 'flex', alignItems: 'flex-end', gap: 8 }}>
    <div style={{ width: 236, background: 'rgba(16,14,12,0.72)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12, padding: 12, color: '#e9e6e2', fontSize: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontWeight: 700 }}>Publish</span>
        {/* ⭐ The handle is a glyph, not a word: it must not read as a third gesture beside
            the two real ones. Horizontal expansion (Jacob: "we're not hurting for horizontal
            space") keeps the operator's column exactly the size it was — the drawer cannot
            push the buttons around or change what the default face looks like. */}
        <button onClick={() => setDrawer(v => !v)} title={drawer ? 'Hide dev details' : 'Show dev details (git + slab)'}
          style={{ background: 'none', border: 'none', color: drawer ? '#bfdbfe' : 'rgba(233,230,226,0.45)', cursor: 'pointer', fontSize: 11, padding: '0 2px', lineHeight: 1 }}>
          {drawer ? '⟨' : '⟩'}
        </button>
      </div>
      {status.unbaked && <div style={{ color: '#fbbf24', marginBottom: 6 }}>⚠ Unbaked edits — Publish bakes first.</div>}

      <button disabled={!!busy || capturing} onClick={smsCapture}
        style={btn({ background: 'rgba(168,85,247,0.18)', color: '#e9d5ff', opacity: (busy || capturing) ? 0.6 : 1 })}
        title="Snapshot the current slab view (center-square, no UI) as the SMS/link-preview image. It is committed with the next Publish.">
        {capturing ? 'Capturing…' : '📷 Capture SMS Hero'}
      </button>
      {targetRow('staging', <button disabled={!!busy || stagingDone || !!repour} onClick={() => publishStaging()}
        style={btn({ background: busy === 'staging' ? 'rgba(96,165,250,0.25)' : 'rgba(96,165,250,0.18)', color: '#bfdbfe', opacity: (busy || stagingDone) ? 0.45 : 1, cursor: stagingDone ? 'default' : 'pointer' })}>
        {busy === 'staging' ? 'Publishing…' : stagingDone ? 'Published to Staging' : 'Publish to Staging'}
      </button>)}
      {targetRow('prod', <button disabled={!!busy || prodDone || prodBlocked} onClick={promoteProd}
        title={prodBlocked ? status.sites?.prod?.why : undefined}
        style={btn({ background: 'rgba(74,222,128,0.16)', color: '#bbf7d0', opacity: (busy || prodDone || prodBlocked) ? 0.45 : 1, cursor: (prodDone || prodBlocked) ? 'default' : 'pointer' })}>
        {busy === 'prod' ? 'Promoting…' : prodDone ? 'Promoted to Prod' : 'Promote to Prod'}
      </button>)}
      {/* ⛔ ERRORS ONLY. The success line was a second place the panel said what
          the button already says — and it said it in GIT: "Promoted to prod ·
          1032 commits" put a commit count in front of the operator, which the
          panel's no-git rule forbids in as many words. A thing that
          worked needs no receipt; a thing that failed does. */}
      {msg && msg.kind === 'err' && <div style={{ marginTop: 8, color: '#f87171', wordBreak: 'break-word' }}>{msg.text}</div>}
      {repour && (
        <div style={{ marginTop: 8, color: '#fde68a', wordBreak: 'break-word' }}>
          This re-pours {lookId} because the pour's code changed{repour.files.length ? `: ${repour.files.join(', ')}` : ''}.
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button onClick={() => publishStaging(true)} style={btn({ background: 'rgba(250,204,21,0.18)', color: '#fde68a' })}>Re-pour and publish</button>
            <button onClick={() => setRepour(null)} style={btn({ background: 'rgba(255,255,255,0.06)', color: '#e5e7eb' })}>Cancel</button>
          </div>
        </div>
      )}
    </div>
    {/* ⛔⛔ THE DEV DRAWER — TWO SHIPMENTS PER TARGET, NEVER ONE.
        Code ships in a commit; the SLAB ships to R2 and is in no commit at all. Reading
        only the git column is what let 2026-09-04 promote code over an 830-object-stale
        canopy and call it done. So every row states both, side by side, and disagreement
        between them is the thing this drawer exists to make visible.
        ⛔ It is a READOUT, not a control — no buttons. The two gestures stay the only way
        to ship, so a developer cannot use the drawer to do something the operator's face
        cannot see or undo. ⭐ Numbers are READ (`/publish/status`, `/deployed?target=`),
        never remembered, so a refresh shows the world rather than this tab's history. */}
    {drawer && (
      <div style={{ width: 268, maxHeight: '60vh', overflowY: 'auto', background: 'rgba(16,14,12,0.72)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12, padding: 12, color: '#e9e6e2', fontSize: 11, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
        <div style={{ fontWeight: 700, marginBottom: 6, fontFamily: 'inherit', color: '#bfdbfe' }}>dev · what would ship</div>
        <Row k="branch" v={status.branch} />
        <Row k="slab built" v={status.bakedAt ? new Date(status.bakedAt).toLocaleTimeString() : '—'} />
        <Row k="unbaked edits" v={status.unbaked ? 'YES — bake first' : 'no'} warn={status.unbaked} />
        <Row k="dirty slab files" v={status.dirty?.length || 0} warn={!!status.dirty?.length} />
        {['staging', 'prod'].map((key) => {
          const d = deploys[key]
          const ahead = key === 'staging' ? (status.vsStaging?.ahead || 0) : 0
          const behind = key === 'staging' ? (status.vsStaging?.behind || 0) : 0
          // ⭐ 'behind' is the one that matters and the one git alone cannot see: the target's
          // live slab is not the slab on this disk. ⚠️ unknown ≠ current — an unreachable
          // site says so rather than borrowing the other row's answer, which is exactly the
          // bug that let staging quietly report production's number.
          // ⭐ ABSENT ≠ STALE. A look never published to this key space answers 404 → bakedAt
          // null, which is "nothing here", not "an older slab". Both correctly leave the
          // button live, but naming them the same would send a developer hunting a bad pour
          // when the real answer is that this town has never been put up here at all.
          const slab = d?.status === 'ready' ? 'current'
            : d?.status === 'building' ? 'shipped, building'
            : d?.status === 'behind' ? (d.bakedAt == null ? 'never published here' : 'STALE — not your slab')
            : 'unknown (unreachable)'
          const bad = !d || d.status === 'behind'
          return (
            <div key={key} style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ color: '#e9e6e2', fontWeight: 700, marginBottom: 3 }}>{key}</div>
              {key === 'staging'
                ? <Row k="code" v={ahead === 0 ? 'current' : `${ahead} commit${ahead === 1 ? '' : 's'} to ship`} warn={ahead > 0} />
                : <Row k="player" v={status.prodPlayer?.current ? 'current' : (status.prodPlayer?.why || 'unknown')} warn={!status.prodPlayer?.current} />}
              {behind > 0 && <Row k="⚠ behind by" v={`${behind} — not a fast-forward`} warn />}
              <Row k="slab" v={slab} warn={bad} />
              <Row k="live built" v={d?.bakedAt ? new Date(d.bakedAt).toLocaleTimeString() : '—'} />
            </div>
          )
        })}
        {/* ⛔ The drawer reports; it never certifies. A byte-level answer needs the
            independent verifier, which re-walks the tree rather than trusting bakedAt. */}
        <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.08)', color: 'rgba(233,230,226,0.5)', lineHeight: 1.45 }}>
          bakedAt only — for bytes:<br />
          <span style={{ color: 'rgba(233,230,226,0.75)' }}>verify-baked-in-r2.mjs</span>
        </div>
      </div>
    )}
    </div>
  )
}

// One label/value line in the dev drawer. Warn colours the VALUE, never the label —
// the eye should land on the thing that is wrong, not on the row it lives in.
function Row({ k, v, warn }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, lineHeight: 1.7 }}>
      <span style={{ color: 'rgba(233,230,226,0.5)', flex: '0 0 auto' }}>{k}</span>
      <span style={{ color: warn ? '#fbbf24' : '#e9e6e2', textAlign: 'right', wordBreak: 'break-word' }}>{v}</span>
    </div>
  )
}

// Feeds CascadedShadows the SAME key vector CelestialBodies publishes — never re-derived.
// ⭐ NO TOWN, NO DRAWING (BRIEF-no-default-town, 2026-09-28). Preview with no ?look= and no town open drew Lafayette
// Square; it now offers the towns. ▶ node checks/claims-a-look-link-opens-that-town.mjs
function TownChooser() {
  const [towns, setTowns] = useState(null)
  useEffect(() => {
    fetch('/looks/index.json').then(r => r.json()).then(j => setTowns((j.looks || []).filter(l => l.scene))).catch(() => setTowns([]))
  }, [])
  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#141416', color: '#ddd' }}>
      <div className="town-chooser" style={{ minWidth: 320 }}>
        <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 12 }}>Preview · Choose a town</div>
        {(towns || []).map(t => (
          <a key={t.id} className="carto-looks-option" href={`?look=${encodeURIComponent(t.id)}`}
            style={{ display: 'block', padding: '8px 12px', color: '#eee', textDecoration: 'none' }}>{t.name || t.id}</a>
        ))}
      </div>
    </div>
  )
}

export default function PreviewApp() {
  const lookId = resolvePreviewLookId()
  return lookId ? <FrozenTown lookId={lookId} /> : <TownChooser />
}

// ⭐ PREVIEW DRAWS THE TOWN A BAKE FROZE (Jacob, 2026-10-04: Stage authors, Bake freezes, Preview and the Ward read what is
// frozen). Its identity is the slab's `manifest.json#identity`, the record the Ward reads, never the authoring source
// (`src/instances/<map>.js`), so Preview shows what ships. ⛔ No manifest, no identity: it refuses and says to bake.
function FrozenTown({ lookId }) {
  const [state, setState] = useState({ town: null, error: null })
  useEffect(() => {
    let live = true
    slabManifest(lookId).then((m) => {
      if (!m) throw new Error(`"${lookId}" has no baked manifest.json. Preview draws what a bake froze: bake it in Stage first.`)
      if (!m.identity || typeof m.identity !== 'object') throw new Error(`"${lookId}"'s manifest.json carries no identity. Re-bake it.`)
      if (live) setState({ town: { ...m.identity, lookId, mapId: m.town }, error: null })
    }).catch((e) => { if (live) setState({ town: null, error: e.message }) })
    return () => { live = false }
  }, [lookId])
  if (state.error) {
    console.error(`[Preview] ⛔ ${state.error}`)
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#141416', color: '#ddd' }}>
        <div style={{ maxWidth: 480, fontSize: 13 }}><div style={{ opacity: 0.7, marginBottom: 8 }}>Preview</div>{state.error}</div>
      </div>
    )
  }
  return state.town ? <PreviewTown town={state.town} /> : null
}

function PreviewTown({ town }) {
  // ⛔ NOT ALWAYS HERO (2026-09-05). Preview opened on the Hero shot every
  // time, which dates from when arriving on the hero was the emotionally
  // resonant thing to do. It is now just a camera you have to click out of
  // before you can look at what you came to look at.
  // ⭐ It lands on the last Stage shot the operator was actually in —
  // `cartograph-last-stage-shot`, which Stage records on every shot change.
  const [shot, setShot] = useState(() => {
    try {
      const saved = localStorage.getItem('cartograph-last-stage-shot')
      if (saved && ['hero', 'browse', 'street'].includes(saved)) return saved
    } catch { /* ignore */ }
    return 'browse'
  })
  const lookId = resolvePreviewLookId()
  const [mode, setModeRaw] = useState(loadMode)
  const setMode = (m) => { setModeRaw(m); saveMode(m) }
  // The active environment's editable pyramid degree (tuner-backed, persisted).
  const [tiers, setTiers] = useState(loadTiers)
  const activeDegree = (tiers[mode] || tiers.desktop).pyramid
  const setActiveDegree = (key, value) => setTiers(prev => {
    const cur = prev[mode] || prev.desktop
    const next = { ...prev, [mode]: { pyramid: { ...cur.pyramid, [key]: value } } }
    saveTiers(next)
    return next
  })
  // The env selector also drives which device the gauges judge against (the
  // active-profile re-aim — meta phase 3). Covers initial mount + every switch.
  useEffect(() => { setActiveProfileId(mode) }, [mode])
  const [layers, setLayers] = useState(loadLayers)
  const [profilerTab, setProfilerTab] = useState('strip')
  const setLayer = (k, v) => setLayers(prev => {
    const next = { ...prev, [k]: v }
    saveLayers(next)
    return next
  })
  // Soft-reload counter: bumping this remounts CanvasContents (forces
  // BakedGround/Buildings/Trees to re-fetch + re-mount). True cold
  // reload comes later via sessionStorage handoff.
  const [reloadKey, setReloadKey] = useState(0)
  const onReload = () => {
    // Drop the module-cached tree atlas for this Look so the remount RE-FETCHES
    // trees-atlas.json (fresh generatedAt → fresh ?v= on the GLB URLs). Without
    // this, the soft-reload reuses the stale _cache manifest and the trees show
    // the pre-rebake geometry until a full browser hard-reload — the recurring
    // "stale leaves in Preview after a rebake" trap (2026-06-24).
    invalidateTreeAtlas(resolvePreviewLookId())
    setReloadKey(n => n + 1)
  }

  const isPhone = mode !== 'desktop'
  // ⭐ EACH SURFACE DRAWS WHAT IT SHIPS: its render profile with the town's DEPLOYMENT policy for that surface laid on it,
  // through qualityProfile.js#surfaceQuality — the one function the Ward applies the manifest's copy through. Preview
  // reads the live deployment.json (its deployment panel edits it), so an edit shows before the bake carries it.
  // phone-hi and phone-lo draw the phone profile; they differ by their policies and budgets (deviceProfiles.js).
  // ▶ node checks/claims-deployment-has-one-authority.mjs · claims-preview-phone-runs-production-passes.mjs
  const [dep, setDep] = useDeployment(town.mapId)
  const deployment = liveDeployment(dep)
  const depKey = JSON.stringify(deployment ?? null)
  const quality = useMemo(() => (deployment ? surfaceQuality(mode, deployment) : null), [mode, depKey])
  const townCanvas = useMemo(() => (quality ? townCanvasProps(quality) : null), [quality])
  const phoneScale = usePhoneScale(isPhone)

  // Stage spans from below the app bar to the bottom of the window, leaving
  // room for the right panel. In Phone mode it draws the dark backdrop and
  // centers the phone horizontally within the available area; the future
  // strip-chart band will sit below the phone.
  const STAGE_RIGHT = RIGHT_PANEL_W + RIGHT_PANEL_GUTTER * 2  // 448
  const stageStyle = isPhone
    ? {
        position: 'absolute',
        top: APP_BAR_H, left: 0, bottom: 0, right: STAGE_RIGHT,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        background: '#141416',
        padding: STAGE_PADDING,
        gap: STAGE_PADDING,
      }
    : { position: 'absolute', top: APP_BAR_H, left: 0, right: 0, bottom: 0 }

  // ⛔ No deployment, no render: Preview cannot say what a surface ships without it.
  if (!quality) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#141416', color: '#ddd', fontSize: 13 }}>
        {dep.error ? `⛔ Preview ${dep.error}` : 'reading the deployment…'}
      </div>
    )
  }

  const canvas = (
    <Canvas
      // Depth, antialias and the shadow map are fixed when the Canvas is created: a tier switch re-creates it.
      key={quality.id}
      {...townCanvas}
      frameloop={PREVIEW_FRAMELOOP}
      camera={townCanvas.camera}
      // The Canvas is the quality profile's (townCanvasProps — the same profile <Town> is given); Preview adds only
      // preserveDrawingBuffer, so "Capture hero → preview" can read the slab frame off the canvas between renders.
      gl={{ ...townCanvas.gl, preserveDrawingBuffer: true }}
      onCreated={({ gl }) => { _ogCaptureGL = gl }}
    >
      <CanvasContents key={reloadKey} town={town} layers={layers} shot={shot} quality={quality} />
    </Canvas>
  )

  const panelTop = APP_BAR_H + STAGE_PADDING
  const panelBottom = STAGE_PADDING

  return (
    <div className="fixed inset-0" style={{ background: isPhone ? '#141416' : '#a8c8e8' }}>
      <div style={stageStyle}>
        {isPhone ? (
          <>
            <div style={{
              flex: 1, minHeight: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <PhoneFrame scale={phoneScale}>{canvas}</PhoneFrame>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <TriggerBar shot={shot} setShot={setShot} onReload={onReload} />
                </div>
                <ProfilerTab tab={profilerTab} setTab={setProfilerTab} />
              </div>
              <ProfilerBody tab={profilerTab} />
            </div>
          </>
        ) : (
          <div style={{ position: 'absolute', inset: 0 }}>{canvas}</div>
        )}
      </div>

      <TopAppBar shot={shot} setShot={setShot} mode={mode} setMode={setMode} />
      <RightPanel layers={layers} setLayer={setLayer} top={panelTop} bottom={panelBottom}
        envId={mode} degree={activeDegree} onTuneDegree={setActiveDegree} quality={quality}
        deployment={<DeploymentPanel map={town.mapId} surface={mode} state={dep} setState={setDep} labels={FX_LABELS} />}
        profilerTab={profilerTab} setProfilerTab={setProfilerTab} shot={shot} />
      {!isPhone && <PublishPanel lookId={lookId} />}
    </div>
  )
}

// ⭐ Preview is an authoring page: its town is the one INSTANCE resolved from the address (`?look=`, else the town Stage
// last had open) by the shared resolver, src/lib/authoringAddress.js#resolveTown. ⛔ It parsed `?look=` a third time,
// and opened a Look the index does not have as though it were a town.
function resolvePreviewLookId() {
  return INSTANCE?.lookId ?? null
}

// Preview's shots → the shot <Town> draws; its layer toggles → <Town layers>.
const TOWN_SHOT = { hero: 'movie', browse: 'plan', street: 'street' }

function CanvasContents({ town, layers, shot, quality }) {
  // The town's flight between shots reports here; exposed for claims-a-shot-change-flies (an inspection surface).
  const flightRef = useRef(null)
  const bearingRef = useRef(null)
  // An inspection surface for claims-a-shot-change-flies: drive the plan's one move, the rose, the lit set.
  const [frameKey, setFrameKey] = useState(0)
  const [planHeading, setPlanHeadingRaw] = useState('town')
  const followRef = useRef(null)
  const setPlanHeading = (h) => setPlanHeadingRaw(h === 'follow' ? { follow: followRef } : h)
  const [litIds, setLitIds] = useState(null)
  const [probePaused, setProbePaused] = useState(false)
  const framedLog = useRef([])
  const listingsRef = useRef([])
  // Preview's Street button has no tap: the eye stands at the one stand point, near the town's own centre (shots.js).
  const streetAt = streetStandOf(useSceneStencil())   // null until the disc is published: Street waits (ShotFlight)
  useEffect(() => {
    window.__flight = flightRef
    window.__townProbe = { bearingRef, followRef, framed: framedLog.current, setFrameKey, setPlanHeading, setPaused: setProbePaused,
      setLitIds: (ids) => setLitIds(ids ? new Set(ids) : null),
      get listingIds() { return listingsRef.current.map((l) => l.building_id).filter(Boolean) } }
    return () => { if (window.__flight === flightRef) { delete window.__flight; delete window.__townProbe } }
  }, [])
  // The phone bus's camera span: one per flight, closed when the town says it landed.
  const span = useRef(null)
  useEffect(() => { span.current = `camera:${shot}:${performance.now()}`; phoneBusStartSpan(span.current, 'camera', `→${shot}`, '#7dd3fc') }, [shot])
  const onFlightEnd = useMemo(() => () => { if (span.current) { phoneBusEndSpan(span.current); span.current = null; phoneBusStop() } }, [])
  const lookId = resolvePreviewLookId()
  // Preview takes no clicks (interactive={false}); it draws the listings the page loaded, as production does.
  const listings = useListings((s) => s.listings)
  listingsRef.current = listings
  // ?dofDebug=1 paints the DoF CoC zones (green = sharp, red = full blur) — the
  // shared dofDriver reads window.__dofDebug.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('dofDebug') === '1') window.__dofDebug = 1
  }, [])
  // ⭐ Preview draws the town through <Town>, the assembly production and Stage mount — so the
  // surface an operator confirms on cannot drift from what ships. What is Preview's own: the
  // per-layer and per-pass toggles (measurement), a noon clock on load, the GPU monitor, and
  // BasicLights — an inspection fallback lit only while the sky layer is off.
  return (
    <>
      <Town town={town} lookId={lookId} quality={quality} listings={listings} shot={TOWN_SHOT[shot]} interactive={false}
        flightRef={flightRef} onFlightEnd={onFlightEnd} streetAt={streetAt} viewInset={PREVIEW_INSET} controls
        frameKey={frameKey} planHeading={planHeading} bearingRef={bearingRef} litIds={litIds ?? undefined} paused={probePaused}
        onFramed={(f) => { framedLog.current.push(f); if (framedLog.current.length > 20) framedLog.current.shift() }}
        movers={PREVIEW_MOVERS} onMovers={PREVIEW_MOVERS ? (m) => { window.__movers = m } : undefined}
        layers={{
          ground: layers.ground, buildings: layers.buildings, trees: layers.trees, park: layers.park,
          lamps: layers.lights, setPieces: layers.arch, neon: layers.neon, sky: layers.celestial,
          clouds: layers.clouds, fog: layers.fog,
        }}
        postFx={{ toggles: layers }}>
        <ForceDaytimeOnMount />
        <GpuMonitorTicker />
        <ResidencyProbe lookId={lookId} />
        <group visible={!layers.celestial}>
          <BasicLights />
        </group>
      </Town>
    </>
  )
}
