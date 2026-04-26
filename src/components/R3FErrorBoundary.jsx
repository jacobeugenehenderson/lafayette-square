import { Component } from 'react'

/**
 * Lightweight error boundary for individual R3F components.
 * Logs loudly on crash, renders null briefly, then auto-resets so the
 * component remounts and the operator doesn't have to refresh after
 * every transient render error.
 */
export default class R3FErrorBoundary extends Component {
  state = { hasError: false, lastError: null }
  _resetTimer = null

  static getDerivedStateFromError(error) {
    return { hasError: true, lastError: error }
  }

  componentDidCatch(error, info) {
    const tag = `[R3F] ${this.props.name || 'component'} crashed`
    // console.error is red and includes a stack trace — easy to spot.
    console.error(tag, error)
    if (info?.componentStack) console.error(`${tag} component stack:`, info.componentStack)
    // Auto-recover after a short delay. If the underlying problem is
    // transient (one bad frame mid-drag), the next mount succeeds.
    // Persistent errors will just flicker until the source is fixed.
    if (this._resetTimer) clearTimeout(this._resetTimer)
    this._resetTimer = setTimeout(() => {
      this.setState({ hasError: false, lastError: null })
    }, 250)
  }

  componentWillUnmount() {
    if (this._resetTimer) clearTimeout(this._resetTimer)
  }

  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}
