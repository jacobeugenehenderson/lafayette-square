import { useState } from 'react'
import useCartographStore from './stores/useCartographStore.js'
import { cancelBake } from './api.js'
import { TOWN_CAMERA_NEAR_M } from '../lib/qualityProfile.js'
import { REGIMES } from '../lib/cameraRegimes.js'

const mmss = (ms) => { if (!Number.isFinite(ms) || ms < 0) return ''; const t = Math.round(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` }
const GLYPH = { waiting: '○', running: '●', done: '✓', skipped: '–', failed: '✕', cancelled: '⊘' }

// ⭐ THE BAKE, STEP BY STEP (Jacob: "leave the customer at the counter wondering what just happened"). The list is
// the server's own (serve.js `bakePlan`, read from the route), each step with its state and time; the running step
// shows its last line and — only where the step reports its own work count — a real fraction. An estimate appears
// only from this town's own previous run of that step. Cancel stops the bake at the running step, and says which.
function BakeSteps({ progress }) {
  const [cancelling, setCancelling] = useState(false)
  const lookId = useCartographStore(s => s.activeLookId)
  const steps = progress?.steps || []
  const now = progress?.now ?? Date.now()
  return (<>
    <div className="carto-bake-steps" aria-live="polite">
      {steps.map(st => {
        const el = st.t0 ? (st.t1 ?? now) - st.t0 : null
        return (
          <div key={st.label} className={`carto-bake-step is-${st.state}`}>
            <div className="carto-bake-step-row">
              <span className="carto-bake-step-glyph">{GLYPH[st.state] ?? '·'}</span>
              <span className="carto-bake-step-label">{st.label}</span>
              <span className="carto-bake-step-time">
                {el != null ? mmss(el) : ''}{st.est && st.state !== 'skipped' ? <span className="carto-bake-step-est"> · last {mmss(st.est)}</span> : null}
              </span>
            </div>
            {st.state === 'running' && (
              <div className="carto-bake-step-live">
                {st.sub && <div className="carto-bake-step-sub">{st.sub}</div>}
                {Number.isFinite(st.frac) && <div className="carto-bake-step-bar"><div style={{ width: `${Math.round(st.frac * 100)}%` }} /></div>}
                {st.lastLine && <div className="carto-bake-step-line">{st.lastLine}</div>}
              </div>
            )}
            {(st.state === 'failed' || st.state === 'cancelled') && st.error && <div className="carto-bake-step-line is-error">{st.error}</div>}
          </div>
        )
      })}
    </div>
    {/* outside the scrolling list, so Cancel never scrolls away */}
    <div className="carto-bake-modal-actions">
      <button className="carto-bake-modal-dismiss" disabled={cancelling || !progress?.running}
        onClick={() => { setCancelling(true); cancelBake(lookId).catch(e => console.warn(`[bake] cancel: ${e.message}`)) }}>
        {cancelling ? 'Cancelling…' : 'Cancel bake'}
      </button>
    </div>
  </>)
}

// Every state of the modal is this one card: fixed width, the project's tokens (cartograph.css `.carto-bake-modal*`),
// a dialog to assistive tech, and its buttons in one right-aligned row.
function Card({ title, busy = false, actions = null, docked = false, children }) {
  return (
    <div className={`carto-bake-modal${docked ? ' is-docked' : ''}`}>
      <div className="carto-bake-modal-card" role="dialog" aria-modal="true" aria-labelledby="carto-bake-modal-title" aria-busy={busy}>
        <div className="carto-bake-modal-title" id="carto-bake-modal-title">{title}</div>
        {children}
        {actions && <div className="carto-bake-modal-actions">{actions}</div>}
      </div>
    </div>
  )
}

const m2s = (v) => (v >= 0.01 ? `${v.toFixed(2)} m²` : `${(v * 1e4).toFixed(v < 1e-3 ? 1 : 0)} cm²`)
const lens = (m) => (m >= 1 ? `${m.toFixed(1)} m` : m >= 0.01 ? `${(m * 100).toFixed(m < 0.1 ? 1 : 0)} cm` : `${(m * 1000).toFixed(1)} mm`)
// a piece's size in words: its LENGTH and its WIDEST point (openCloseJudge.mjs#spanOf, #wideOf); a sliver is never told by its mean
const sizeOf = (w) => `about ${lens(w.span)} long and at most ${lens(w.wide)} wide`
// which side has what, in plain words: the definition is the exact calculation, the candidate is the coast the kit drew
const sideOf = (w) => { const what = w.path === 'decks' ? 'deck' : 'water'
  return w.side === 'definition only' ? `the exact calculation has ${what} here that the coast doesn't` : `the coast has ${what} here that the exact calculation doesn't` }
// ⭐ HOW CLOSE A VIEWER CAN SEE IT, derived, never typed: the nearest any town shot draws the ground is the town camera's near plane or
// the movie orbit's closest dolly (cameraRegimes.js#REGIMES.playback), whichever is farther; the finest lens there is the narrowest of the
// town's movie keyframes; the pixels are this screen's. A town with no keyframe lens gets no claim, only the size
const closestView = (keys) => { const fovs = (keys || []).map(k => k.fov).filter(Number.isFinite); if (!fovs.length || typeof window === 'undefined') return null
  const d = Math.max(TOWN_CAMERA_NEAR_M, REGIMES.playback.minDistance), fov = Math.min(...fovs), px = window.innerHeight * (window.devicePixelRatio || 1)
  return { d, fov, mPerPx: (2 * d * Math.tan((fov * Math.PI) / 360)) / px } }
// a piece's view: twice its length (the Designer's zoom limit bounds how close that can be)
const frame = (w) => useCartographStore.setState(st => ({ shot: 'designer', frameRequest: { x: w.at[0], z: w.at[1], span: 2 * w.span, n: (st.frameRequest?.n || 0) + 1 } }))

// ⭐ THE CARD EXPLAINS OR GOES AWAY (Jacob, 2026-10-29, on Huron's first card: "I looked but have no idea what I'm looking at"). It leads
// with the SCALE (the largest piece's length and width, all of them together, and how many pixels it is at the closest a viewer can get),
// says in plain words which side has what, says which pieces the town already signed, and says a row can be clicked
function CoastResidualCard({ cr }) {
  const set = (patch) => useCartographStore.setState(st => ({ coastResidual: { ...st.coastResidual, ...patch } }))
  const accept = () => useCartographStore.getState().acceptCoastResidual()
  const keys = useCartographStore(s => s.heroKeyframes)
  const view = (i) => { set({ viewing: i }); if (i != null) frame(cr.pieces[i]) }
  const n = cr.pieces.length, acceptBtn = (
    <button className="carto-bake-modal-dismiss is-primary" disabled={cr.accepting} onClick={accept}>{cr.accepting ? 'Signing…' : `Accept ${n === 1 ? 'it' : `these ${n}`} and bake`}</button>)
  const cancel = <button className="carto-bake-modal-dismiss" disabled={cr.accepting} onClick={() => useCartographStore.setState({ coastResidual: null })}>Cancel</button>
  const on = cr.signedAt ? ` on ${new Date(cr.signedAt).toLocaleDateString()}` : ''
  const err = cr.error && <div className="carto-bake-modal-msg is-error">{cr.error}</div>
  if (cr.viewing != null) { const w = cr.pieces[cr.viewing]
    return (
      <Card docked title={`Piece ${cr.viewing + 1} of ${n}: ${sideOf(w)}`} actions={<>
        <button className="carto-bake-modal-dismiss" disabled={cr.viewing === 0} onClick={() => view(cr.viewing - 1)}>‹ Previous</button>
        <button className="carto-bake-modal-dismiss" disabled={cr.viewing === n - 1} onClick={() => view(cr.viewing + 1)}>Next ›</button>
        <button className="carto-bake-modal-dismiss" onClick={() => view(null)}>Back to the list</button>
        {acceptBtn}
      </>}>
        <div className="carto-bake-modal-msg">{sizeOf(w)[0].toUpperCase() + sizeOf(w).slice(1)} ({m2s(w.m2)}), at ({w.at.map(v => v.toFixed(2)).join(', ')}){w.signed ? `; ${cr.scene} signed it${on}` : ''}.</div>
        {err}
      </Card>)
  }
  const big = cr.pieces.reduce((a, w) => (w.m2 > a.m2 ? w : a)), cv = closestView(keys), signed = cr.pieces.filter(w => w.signed).length
  const pxW = cv && big.wide / cv.mPerPx
  return (
    <Card title={`${cr.scene}'s coast differs from the exact calculation in ${n} place${n === 1 ? '' : 's'}`} actions={<>{cancel}{acceptBtn}</>}>
      <div className="carto-bake-modal-msg">
        <p>The largest is {sizeOf(big)}; all {n} together come to {m2s(cr.m2)}.{cv && ` From the closest a viewer can bring the camera (${cv.d} m, through the movie's narrowest lens, ${cv.fov}°), its widest point is ${pxW < 1 ? 'under one pixel on this screen' : `about ${Math.round(pxW)} pixel${Math.round(pxW) === 1 ? '' : 's'} on this screen`}.`}</p>
        <p>The coast step smooths the traced shoreline on the trace's own grid, then checks it against the same calculation done on a grid a
          thousand times finer. Differences under twice the grid's rounding are ignored; these are larger.
          {signed ? ` ${signed} of them ${cr.scene} signed${on}; ${n - signed} ${n - signed === 1 ? 'is' : 'are'} new.` : ` ${cr.scene} has signed none of them before.`}</p>
        <p>Click a row to see it on the map. If none of them is a real change to the shore, accept them: that signs them for {cr.scene} and bakes again.</p>
        <ul className="carto-bake-residual-list">{cr.pieces.map((w, i) => (
          <li key={`${w.path}:${w.key}`}><button className="carto-bake-residual-row" onClick={() => view(i)}>
            {lens(w.span)} long, at most {lens(w.wide)} wide · {sideOf(w)}{w.signed ? ' · signed' : ''}</button></li>))}</ul>
      </div>
      {err}
    </Card>)
}

// Modal overlay shown while the cartograph bake is running. Blocks input
// against the canvas so an operator's drag/click can't fight the bake's
// own state writes. Auto-dismisses when bakeRunning flips false.
export default function BakeModal() {
  const bakeRunning = useCartographStore(s => s.bakeRunning)
  const bakeError = useCartographStore(s => s.bakeError)
  const ribbonsStale = useCartographStore(s => s.ribbonsStale)
  const mapRefreshing = useCartographStore(s => s.mapRefreshing)
  const repourConfirm = useCartographStore(s => s.repourConfirm)
  const bakeProgress = useCartographStore(s => s.bakeProgress)
  const coastResidual = useCartographStore(s => s.coastResidual)
  if (!bakeRunning && !bakeError && !ribbonsStale && !repourConfirm && !mapRefreshing && !coastResidual) return null
  // ⭐ THE COAST STOPPED ON ITS OPEN/CLOSE RESIDUAL (Boz's GO, 2026-10-29): CoastResidualCard. Cancel leaves the town unsigned and unbaked
  if (!bakeRunning && coastResidual) return <CoastResidualCard cr={coastResidual} />
  // ⛔ A CODE change would re-pour the town (the server stopped first and named the files). Say it; run on confirm.
  if (!bakeRunning && repourConfirm) {
    const { scene, files = [], resume = {} } = repourConfirm
    return (
      <Card title={`This Bake will re-pour ${scene}`} actions={<>
        <button className="carto-bake-modal-dismiss" onClick={() => useCartographStore.setState({ repourConfirm: null })}>Cancel</button>
        <button className="carto-bake-modal-dismiss is-primary" onClick={() => { useCartographStore.setState({ repourConfirm: null }); useCartographStore.getState().runBake({ ...resume, repour: true }) }}>Re-pour and bake</button>
      </>}>
        <div className="carto-bake-modal-msg">
          What {scene}'s last pour read has changed — its code, a data file it reads, its geography or a registry
          value — or baking would rewrite a file the town is holding. Baking now re-derives it first:
          <ul>{files.map(f => <li key={f}><code>{f}</code></li>)}</ul>
        </div>
      </Card>
    )
  }
  // ⭐ After a re-pour the 2D map rebuilds itself (useCartographStore `_refreshPouredMap`). This card appears only
  // while that runs, and — ⛔ never a silent stale map — when it FAILS, saying why.
  if (!bakeRunning && !bakeError && mapRefreshing) return (
    <Card title="Redrawing the 2D map…" busy>
      <div className="carto-bake-modal-msg">The bake re-poured this town; the map is being rebuilt from what was poured.</div>
      <div className="carto-bake-modal-spinner" />
    </Card>
  )
  if (!bakeRunning && !bakeError && ribbonsStale) return (
    <Card title="The 2D map is out of date" actions={<>
      <button className="carto-bake-modal-dismiss" onClick={() => useCartographStore.setState({ ribbonsStale: null })}>Dismiss</button>
      <button className="carto-bake-modal-dismiss is-primary" onClick={() => window.location.reload()}>Reload</button>
    </>}>
      <div className="carto-bake-modal-msg">Baked. But {ribbonsStale}. Reload to draw what was poured.</div>
    </Card>
  )
  if (bakeError) return (
    <Card title="Bake failed" actions={
      <button className="carto-bake-modal-dismiss" onClick={() => useCartographStore.setState({ bakeError: null })}>Dismiss</button>
    }>
      <div className="carto-bake-modal-msg">{bakeError}</div>
    </Card>
  )
  return (
    <Card title={`Baking ${bakeProgress?.scene ?? 'the cartograph'}…`} busy>
      {bakeProgress?.steps?.length
        ? <BakeSteps progress={bakeProgress} />
        : <div className="carto-bake-modal-spinner" />}
    </Card>
  )
}
