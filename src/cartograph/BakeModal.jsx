import { useState } from 'react'
import useCartographStore from './stores/useCartographStore.js'
import { cancelBake } from './api.js'

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
  return (
    <div className="carto-bake-steps">
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
      <button className="carto-bake-modal-dismiss" disabled={cancelling || !progress?.running}
        onClick={() => { setCancelling(true); cancelBake(lookId).catch(e => console.warn(`[bake] cancel: ${e.message}`)) }}>
        {cancelling ? 'Cancelling…' : 'Cancel bake'}
      </button>
    </div>
  )
}

// Modal overlay shown while the cartograph bake is running. Blocks input
// against the canvas so an operator's drag/click can't fight the bake's
// own state writes. Auto-dismisses when bakeRunning flips false.
export default function BakeModal() {
  const bakeRunning = useCartographStore(s => s.bakeRunning)
  const bakeError = useCartographStore(s => s.bakeError)
  const ribbonsStale = useCartographStore(s => s.ribbonsStale)
  const repourConfirm = useCartographStore(s => s.repourConfirm)
  const bakeProgress = useCartographStore(s => s.bakeProgress)
  if (!bakeRunning && !bakeError && !ribbonsStale && !repourConfirm) return null
  // ⛔ A CODE change would re-pour the town (the server stopped first and named the files). Say it; run on confirm.
  if (!bakeRunning && repourConfirm) {
    const { scene, files = [], resume = {} } = repourConfirm
    return (
      <div className="carto-bake-modal">
        <div className="carto-bake-modal-card">
          <div className="carto-bake-modal-title">This Bake will re-pour {scene}</div>
          <div className="carto-bake-modal-msg">
            The pour code changed since {scene} was last poured, so baking now re-derives its map before baking it:
            <ul>{files.map(f => <li key={f}><code>{f}</code></li>)}</ul>
          </div>
          <button className="carto-bake-modal-dismiss" onClick={() => { useCartographStore.setState({ repourConfirm: null }); useCartographStore.getState().runBake({ ...resume, repour: true }) }}>Re-pour and bake</button>
          <button className="carto-bake-modal-dismiss" onClick={() => useCartographStore.setState({ repourConfirm: null })}>Cancel</button>
        </div>
      </div>
    )
  }
  // ⛔ The 2D map is built live from ribbons loaded with the page; after a re-pour it is stale until reload.
  if (!bakeRunning && !bakeError && ribbonsStale) return (
    <div className="carto-bake-modal">
      <div className="carto-bake-modal-card">
        <div className="carto-bake-modal-title">The 2D map is out of date</div>
        <div className="carto-bake-modal-msg">Baked. But {ribbonsStale}. Reload to draw what was poured.</div>
        <button className="carto-bake-modal-dismiss" onClick={() => window.location.reload()}>Reload</button>
        <button className="carto-bake-modal-dismiss" onClick={() => useCartographStore.setState({ ribbonsStale: null })}>Dismiss</button>
      </div>
    </div>
  )

  return (
    <div className="carto-bake-modal">
      <div className="carto-bake-modal-card">
        {bakeError ? (
          <>
            <div className="carto-bake-modal-title">Bake failed</div>
            <div className="carto-bake-modal-msg">{bakeError}</div>
            <button
              className="carto-bake-modal-dismiss"
              onClick={() => useCartographStore.setState({ bakeError: null })}>
              Dismiss
            </button>
          </>
        ) : (
          <>
            <div className="carto-bake-modal-title">Baking {bakeProgress?.scene ?? 'the cartograph'}…</div>
            {bakeProgress?.steps?.length
              ? <BakeSteps progress={bakeProgress} />
              : <div className="carto-bake-modal-spinner" />}
          </>
        )}
      </div>
    </div>
  )
}
