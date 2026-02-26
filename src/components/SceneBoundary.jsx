import { Component } from 'react'

/**
 * Error boundary wrapping the entire R3F Canvas.
 * Catches any throw inside the 3D tree and shows a minimal retry button
 * instead of a white screen. UI (Controls, SidePanel, EventTicker) stays alive.
 */
export default class SceneBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('[SceneBoundary] R3F crash caught:', error, info?.componentStack)
  }

  handleRetry = () => {
    this.setState({ hasError: false })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#000',
          }}
        >
          <button
            onClick={this.handleRetry}
            style={{
              padding: '12px 24px',
              borderRadius: '8px',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: 'rgba(255,255,255,0.7)',
              fontSize: '14px',
              cursor: 'pointer',
              fontFamily: 'ui-monospace, monospace',
            }}
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
