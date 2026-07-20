import { Component } from 'react'

/**
 * DOM feature error boundary — kit contract: a feature DEGRADES, it does not
 * DETONATE (Jacob 2026-07-19, [[feedback_full_activation_default_on_empty_assets]]).
 *
 * A crashing overlay feature (empty assets, a null profile field, a missing
 * backend) shows a small VISIBLE fallback IN PLACE and is contained here — it
 * does NOT propagate to the React root, which would tear down the whole tree
 * INCLUDING the 3D <Canvas> (→ WebGL context lost → blank screen). The fallback
 * is deliberately visible (not null): an errored panel is a to-do you can see,
 * not invisible debt. Wrap each activated overlay feature so one feature's crash
 * never takes down the player.
 */
export default class FeatureBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) {
    console.error(`[feature:${this.props.name || 'panel'}] crashed —`, error, info?.componentStack)
  }
  render() {
    if (this.state.error) {
      return (
        <div className="fixed bottom-4 left-4 z-[100] px-3 py-2 rounded-lg backdrop-blur-md bg-red-950/70 border border-red-500/40 text-red-200 text-xs font-mono max-w-[22rem] pointer-events-auto">
          ⚠ <b>{this.props.name || 'panel'}</b> hit a snag — {String(this.state.error?.message || this.state.error).slice(0, 120)}
        </div>
      )
    }
    return this.props.children
  }
}
