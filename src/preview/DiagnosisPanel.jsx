/**
 * DiagnosisPanel — "here is your problem, and here are the possible fixes" (Jacob, 2026-10-04), per surface.
 *
 * Ranks what THIS town costs on THIS surface, by measurement only — no fixed ordering (Jacob: the order is whatever is
 * biggest on the town in front of you, so it is right for town #2 too). Every kind of cost is measured, so a cost
 * cannot hide behind a small number of another kind (the ground's shading, behind 0.17M triangles):
 *   · GPU ms — by TOGGLE: "Measure each layer" takes each shown layer out and back, bracketed by fresh GPU readings
 *     (PreviewApp measureLayer, frameCost.js#gpuWindow); each row carries its own noise (the two rests' spread), and a
 *     cost inside it reads "≈ 0". Non-additive: overdraw is shared, so rows never sum to the frame. This desktop's GPU.
 *   · triangles · meshes · memory — static, per <Town> piece (Residency.jsx): they hold across devices, so they rank by SHARE.
 * Over/under a budget is said only against deviceProfiles.js, and those phone budgets are INTERIM: said wherever shown.
 * Readings are pinned to the view they were taken in (shot · viewport · surface, said beside them); the Hero movie moves,
 * so the panel will not measure there (Lens: a before/after compares one view).
 * Each row names its kind of remedy:
 *   · deployment — a switch in the deployment panel above (a post-effect pass);
 *   · creative — authored in Stage (the Look, framing, density): "this costs X; change it in Stage". Never ranked as
 *     the problem's fix here (Lens; CLAUDE.md Layer 0 q3);
 *   · engineering — no setting changes it yet: a ROADMAP row. "Don't load that yet" is engineering today (Jacob).
 */
import { useRef, useState } from 'react'
import { useResidency } from './Residency.jsx'
import { getActiveProfile } from './deviceProfiles'

// A Scene layer's kind of remedy. Keyed by <Town>'s piece names (kit-wide, every town has them), never by a town.
const REMEDY = {
  trees:     ['engineering', 'tree weight: ROADMAP Column B (impostor/card weight) · H1 phone-slice frustum culling'],
  ground:    ['engineering', 'ground shading / fill: no setting changes it yet (ROADMAP H1)'],
  buildings: ['engineering', 'building geometry: ROADMAP H1 phone-slice frustum culling'],
  lamps:     ['engineering', 'lamp instances: no setting changes it yet'],
  park:      ['creative',    'authored in Stage'],
  setPieces: ['creative',    'authored in Stage'],
  sky:       ['creative',    'the Look\'s sky, authored in Stage'],
  clouds:    ['creative',    'the Look\'s clouds, authored in Stage'],
  neon:      ['creative',    'the Look\'s neon, authored in Stage'],
  fog:       ['creative',    'the Look\'s fog, authored in Stage'],
}
const KIND_COLOR = { deployment: 'var(--warning, #f5a623)', creative: 'var(--on-surface-variant)', engineering: '#7dd3fc' }
const pct = (x) => (x == null || !isFinite(x) ? '—' : `${Math.round(x * 100)}%`)
const M = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : `${Math.round(n)}`)

/**
 * `layers`: [{ key, label, piece?, pass? }] — the shown Scene layers (piece = its <Town> piece) and the post-effect
 * passes this surface ships (pass = true). `measure(key)`: takes the layer out and back, resolving when its cost is in.
 */
export default function DiagnosisPanel({ surface, shot, layers, measure }) {
  const r = useResidency()
  const [costs, setCosts] = useState({})     // key → { gpuMs, noise }, this session's diagnosis run
  const [run, setRun] = useState(null)       // { i, n, key } while measuring
  const [open, setOpen] = useState(false)
  const stop = useRef(false)

  const pieces = Object.fromEntries((r?.pieces || []).map((p) => [p.piece, p]))
  const totals = (r?.pieces || []).reduce((t, p) => ({ tris: t.tris + p.tris, meshes: t.meshes + p.shownMeshes, held: t.held + p.resident }), { tris: 0, meshes: 0, held: 0 })
  const rows = layers.map((l) => {
    const c = costs[l.key]
    const p = l.piece ? pieces[l.piece] : null
    const [kind, why] = l.pass ? ['deployment', 'switch it per surface in the deployment panel above'] : (REMEDY[l.piece || l.key] || ['engineering', 'no setting changes it yet'])
    // Within noise (1.5× the rests' spread, at least 2% of the frame): said as ≈ 0, ranked as 0, never as a saving or a cost.
    const floor = c ? Math.max(1.5 * (c.noise ?? 0), 0.02 * (c.rest ?? 0)) : 0
    const quiet = c?.gpuMs != null && Math.abs(c.gpuMs) <= floor
    // Taking a layer OUT cannot cost GPU time: a negative beyond the noise is a reading the instrument could not settle
    // (a transient, another load on a shared GPU). Said as such, ranked last, never shown as a saving.
    const unstable = c?.gpuMs != null && c.gpuMs < -floor
    return { ...l, gpuMs: c?.gpuMs == null || unstable ? null : quiet ? 0 : c.gpuMs, quiet, unstable, noise: c?.noise ?? null, tris: p?.tris ?? 0, meshes: p?.shownMeshes ?? 0, held: p?.resident ?? 0, kind, why }
  })
  const measured = rows.some((x) => x.gpuMs != null)
  // Rank: by measured GPU time when there is one, else by triangle share. Never by a fixed list.
  rows.sort((a, b) => measured ? (b.gpuMs ?? -Infinity) - (a.gpuMs ?? -Infinity) : b.tris - a.tris)
  const prof = getActiveProfile()

  const measureAll = async () => {
    stop.current = false
    const at = { shot, w: window.innerWidth, h: window.innerHeight, surface }
    const todo = layers.map((l) => l.key)
    for (let i = 0; i < todo.length && !stop.current; i++) {
      setRun({ i, n: todo.length, key: todo[i] })
      const c = await measure(todo[i])
      setCosts((m) => ({ ...m, [todo[i]]: { ...c, at } }))
    }
    setRun(null)
  }

  const top = rows[0]
  return (
    <div className="profiler-panel">
      <button onClick={() => setOpen(!open)} className="section-heading" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', width: '100%', textAlign: 'left' }}>
        {open ? '▾' : '▸'} diagnosis · {surface}{top && (measured ? top.gpuMs != null : top.tris) ? ` · biggest: ${top.label}` : ''}
      </button>
      {open && <>
        <div className="profiler-note" style={{ margin: '4px 0 6px' }}>
          {M(totals.tris)} tris · {totals.meshes} meshes shown, against {surface}'s INTERIM budget {M(prof.triBudget)} tris · {prof.drawBudget} draws
          (placeholders until a real phone is measured: read the shares, not "how far over"). GPU ms are this desktop's GPU, never a phone's;
          a row inside its own noise reads ≈ 0, and one that read negative past it reads unstable: measure again.
        </div>
        <div className="profiler-row" style={{ gap: 6, marginBottom: 6 }}>
          {shot === 'hero'
            ? <span className="profiler-note">The Hero movie moves the camera, so a before/after there compares two views: measure in Browse or Street.</span>
            : run
            ? <><span style={{ flex: 1 }}>measuring {run.key} ({run.i + 1}/{run.n})… the view flickers as layers go out and back</span><button className="profiler-panel" style={{ padding: '2px 8px' }} onClick={() => { stop.current = true }}>stop</button></>
            : <button className="profiler-panel" style={{ padding: '2px 8px', cursor: 'pointer' }} onClick={measureAll}>measure each layer (GPU ms, by toggle)</button>}
        </div>
        {measured && (() => { const a = Object.values(costs).find((c) => c.at)?.at; return a ? <div className="profiler-note">measured in {a.shot} · {a.w}×{a.h} · {a.surface}{a.shot !== shot || a.surface !== surface ? ' — not this view: measure again to compare' : ''}</div> : null })()}
        <div className="profiler-head">
          <span style={{ flex: 1 }}>{measured ? 'ranked by GPU ms (toggle, non-additive)' : 'ranked by triangle share (measure for time)'}</span>
          <span style={{ width: 54, textAlign: 'right' }}>GPU ms</span><span style={{ width: 44, textAlign: 'right' }}>tris</span>
          <span style={{ width: 44, textAlign: 'right' }}>meshes</span><span style={{ width: 44, textAlign: 'right' }}>memory</span>
        </div>
        {rows.map((x) => (
          <div key={x.key} title={`${x.kind}: ${x.why}`}>
            <div className="profiler-row">
              <span style={{ flex: 1 }}>{x.label}</span>
              <span style={{ width: 54, textAlign: 'right' }} title={x.noise == null ? '' : `noise ±${x.noise.toFixed(1)} ms`}>{x.unstable ? 'unstable' : x.gpuMs == null ? '—' : x.quiet ? '≈ 0' : x.gpuMs.toFixed(1)}</span>
              <span style={{ width: 44, textAlign: 'right' }}>{x.pass ? '' : pct(totals.tris ? x.tris / totals.tris : null)}</span>
              <span style={{ width: 44, textAlign: 'right' }}>{x.pass ? '' : pct(totals.meshes ? x.meshes / totals.meshes : null)}</span>
              <span style={{ width: 44, textAlign: 'right' }}>{x.pass ? '' : pct(totals.held ? x.held / totals.held : null)}</span>
            </div>
            <div className="profiler-note" style={{ paddingLeft: 10, color: KIND_COLOR[x.kind] }}>{x.kind} · {x.why}</div>
          </div>
        ))}
      </>}
    </div>
  )
}
