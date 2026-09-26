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
function Card({ title, busy = false, actions = null, children }) {
  return (
    <div className="carto-bake-modal">
      <div className="carto-bake-modal-card" role="dialog" aria-modal="true" aria-labelledby="carto-bake-modal-title" aria-busy={busy}>
        <div className="carto-bake-modal-title" id="carto-bake-modal-title">{title}</div>
        {children}
        {actions && <div className="carto-bake-modal-actions">{actions}</div>}
      </div>
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
  const mapRefreshing = useCartographStore(s => s.mapRefreshing)
  const repourConfirm = useCartographStore(s => s.repourConfirm)
  const bakeProgress = useCartographStore(s => s.bakeProgress)
  if (!bakeRunning && !bakeError && !ribbonsStale && !repourConfirm && !mapRefreshing) return null
  // ⛔ A CODE change would re-pour the town (the server stopped first and named the files). Say it; run on confirm.
  if (!bakeRunning && repourConfirm) {
    const { scene, files = [], resume = {} } = repourConfirm
    return (
      <Card title={`This Bake will re-pour ${scene}`} actions={<>
        <button className="carto-bake-modal-dismiss" onClick={() => useCartographStore.setState({ repourConfirm: null })}>Cancel</button>
        <button className="carto-bake-modal-dismiss is-primary" onClick={() => { useCartographStore.setState({ repourConfirm: null }); useCartographStore.getState().runBake({ ...resume, repour: true }) }}>Re-pour and bake</button>
      </>}>
        <div className="carto-bake-modal-msg">
          What {scene}'s last pour read has changed — its code, its geography or a registry value — so baking now
          re-derives its map before baking it:
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
