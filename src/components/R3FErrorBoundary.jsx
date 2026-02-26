import { Component } from 'react'

/**
 * Lightweight error boundary for individual R3F components.
 * Renders null on error (invisible in 3D) — the rest of the scene keeps rendering.
 */
export default class R3FErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.warn(`[R3F] ${this.props.name || 'component'} crashed:`, error?.message)
  }

  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}
