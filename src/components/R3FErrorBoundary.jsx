import { Component } from 'react'

/**
 * Lightweight error boundary for individual R3F components.
 * Logs loudly on crash, renders null briefly, then auto-resets so the
 * component remounts and the operator doesn't have to refresh after
 * every transient render error.
 */
// Backoff schedule (ms): retries pause progressively longer so a transient
// OOM during load (ParkTrees waiting on aerial-tile texture upload to
// finish, etc.) gets enough time for memory to free before the next attempt.
// Total wait: ~16 s across 8 attempts. Then we give up — beyond that it's
// a real bug, not transient pressure.
const RETRY_DELAYS_MS = [250, 500, 1000, 2000, 4000, 4000, 4000]

export default class R3FErrorBoundary extends Component {
  state = { hasError: false, lastError: null, retryCount: 0, gaveUp: false }
  _resetTimer = null

  static getDerivedStateFromError(error) {
    return { hasError: true, lastError: error }
  }

  componentDidCatch(error, info) {
    const tag = `[R3F] ${this.props.name || 'component'} crashed`
    console.error(tag, error)
    if (info?.componentStack) console.error(`${tag} component stack:`, info.componentStack)

    const attempt = this.state.retryCount
    const delay = RETRY_DELAYS_MS[attempt]
    if (delay === undefined) {
      console.error(`${tag} — gave up after ${RETRY_DELAYS_MS.length} retries (${RETRY_DELAYS_MS.reduce((a,b)=>a+b,0)/1000}s total). Component will render null until reload.`)
      this.setState({ gaveUp: true, retryCount: attempt + 1 })
      return
    }

    if (this._resetTimer) clearTimeout(this._resetTimer)
    this._resetTimer = setTimeout(() => {
      this.setState({ hasError: false, lastError: null, retryCount: attempt + 1 })
    }, delay)
  }

  componentWillUnmount() {
    if (this._resetTimer) clearTimeout(this._resetTimer)
  }

  render() {
    if (this.state.gaveUp || this.state.hasError) return null
    return this.props.children
  }
}
