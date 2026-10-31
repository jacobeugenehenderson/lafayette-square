import { Component, createElement } from 'react'
import { Refusal } from '../lib/refusal.js'
import useFailures, { reasonOf } from '../lib/failures.js'
import { TownContext } from './townContext.js'

/**
 * The boundary around one layer of the town (`name` is the layer). It tells a refusal from a transient
 * (src/lib/refusal.js), and neither ends as a silent absence (BRIEF-a-refusal-is-never-swallowed, 2026-10-31):
 *   · a Refusal is reported to the one sink (src/lib/failures.js) at once and the layer stays out. It is NEVER
 *     retried: the same inputs give the same refusal.
 *   · anything else (a Transient, or an untyped crash: an OOM during load, a lost context) is retried on
 *     RETRY_DELAYS_MS. If the last retry fails too, the boundary reports that it gave up, with the reason, to the
 *     same sink.
 * The layer's absence is named in the sink, keyed to the town this boundary sits in (TownContext's lookId; null
 * outside a <Town>), and Stage shows it. The console carries it too. A clean mount clears the layer's entry (a remount
 * is a fresh attempt), so the banner never outlives its cause.
 * ▶ node checks/claims-a-refusal-is-never-swallowed.mjs
 */
const RETRY_DELAYS_MS = [250, 500, 1000, 2000, 4000, 4000, 4000]

// DEV ONLY, and the build removes it (import.meta.env.DEV is false there): `?refuse=<layer>` makes that layer refuse, so
// the operator can see Stage's banner work. ⛔ Never a production URL that makes a layer throw.
const DEV_REFUSE = import.meta.env.DEV ? new URLSearchParams(globalThis.location?.search || '').get('refuse') : null
function DevRefuse({ layer }) { throw new Refusal(`[${layer}] ⛔ refused on purpose by ?refuse=${layer} (a dev-only flag)`) }

export default class R3FErrorBoundary extends Component {
  static contextType = TownContext
  state = { hasError: false, retryCount: 0 }
  _resetTimer = null

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    const layer = this.props.name || 'component', lookId = this.context?.lookId ?? null
    const tag = `[R3F] ${layer} crashed`
    console.error(tag, error)
    if (info?.componentStack) console.error(`${tag} component stack:`, info.componentStack)

    if (error instanceof Refusal) {
      useFailures.getState().report({ lookId, layer, kind: 'refusal', reason: reasonOf(error) })
      return
    }
    const attempt = this.state.retryCount
    const delay = RETRY_DELAYS_MS[attempt]
    if (delay === undefined) {
      const reason = `gave up after ${RETRY_DELAYS_MS.length} retries: ${reasonOf(error)}`
      console.error(`${tag}: ${reason}`)
      useFailures.getState().report({ lookId, layer, kind: 'gave-up', reason })
      return
    }
    if (this._resetTimer) clearTimeout(this._resetTimer)
    this._resetTimer = setTimeout(() => this.setState({ hasError: false, retryCount: attempt + 1 }), delay)
  }

  componentDidMount() {
    // Mounted without a failure: the layer draws, so an entry from an earlier mount is stale. (A mount that failed
    // already holds hasError here, and keeps the report its componentDidCatch writes.)
    if (!this.state.hasError) useFailures.getState().clear(this.context?.lookId ?? null, this.props.name || 'component')
  }

  componentWillUnmount() {
    if (this._resetTimer) clearTimeout(this._resetTimer)
  }

  render() {
    if (this.state.hasError) return null
    if (import.meta.env.DEV && DEV_REFUSE && DEV_REFUSE === this.props.name) return createElement(DevRefuse, { layer: this.props.name })
    return this.props.children
  }
}
