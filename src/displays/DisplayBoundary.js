/**
 * DisplayBoundary: each display's last line (Boz's ruling, 2026-10-31). A display that throws while it renders is taken
 * out ALONE: the set-piece it hangs on and the town keep rendering, and the failure is NAMED, never swallowed:
 *   · one console error, "[Displays] ⛔ display <id> failed: <reason>" (the player's one channel; the Ward has no
 *     error reporting of its own);
 *   · the failure recorded in ./failures.js, which Stage's Displays section shows as a banner.
 * Everything a display can throw reaches it: its render, its plugin's frame loop (rethrown at render), and Displays'
 * own refusals (an unknown kind, an attach it does not serve), raised from a child inside the boundary.
 * No retry, no stand-in: a failed display stays absent, and says so, until the page reloads. The first line is earlier:
 * a bad record refuses before it ships (▶ node checks/claims-every-declared-display-is-valid.mjs).
 * ▶ node checks/claims-a-failing-display-is-named-and-contained.mjs
 */
import { Component } from 'react'
import useDisplayFailures from './failures.js'

export default class DisplayBoundary extends Component {
  state = { failed: null }

  static getDerivedStateFromError(error) {
    return { failed: error?.message || String(error) }
  }

  componentDidCatch(error) {
    const reason = error?.message || String(error)
    console.error(`[Displays] ⛔ display ${this.props.id} failed: ${reason}`)
    useDisplayFailures.getState().report(this.props.lookId, this.props.id, reason)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
