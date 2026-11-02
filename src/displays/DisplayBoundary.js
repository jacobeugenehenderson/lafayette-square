/**
 * DisplayBoundary: each display's last line (Boz's ruling, 2026-10-31). A display that throws while it renders is taken
 * out ALONE: the set-piece it hangs on and the town keep rendering, and the failure is NAMED, never swallowed:
 *   · one console error, "[Displays] ⛔ display <id> failed: <reason>" (the player's one channel; the Ward has no
 *     error reporting of its own);
 *   · the failure reported to the kit's one sink (src/lib/failures.js, layer `display:<id>`), which Stage shows as a
 *     banner in its Displays section and the Ward can read.
 * Everything a display can throw reaches it: its render, its plugin's frame loop (useTownFrame rethrows it at render), and Displays'
 * own refusals (an unknown kind, an attach it does not serve), raised from a child inside the boundary.
 * No retry, no stand-in: a failed display stays absent, and says so, until the page reloads. The first line is earlier:
 * a bad record refuses before it ships (▶ node checks/claims-every-declared-display-is-valid.mjs).
 * ▶ node checks/claims-a-failing-display-is-named-and-contained.mjs
 */
import { Component, createElement } from 'react'
import useFailures, { reasonOf } from '../lib/failures.js'
import { Refusal } from '../lib/refusal.js'
import { FrameBoundary } from '../lib/frameBoundary.js'

export default class DisplayBoundary extends Component {
  state = { failed: null }

  static getDerivedStateFromError(error) {
    return { failed: reasonOf(error) }
  }

  componentDidCatch(error) {
    const reason = reasonOf(error)
    console.error(`[Displays] ⛔ display ${this.props.id} failed: ${reason}`)
    // A display is never retried (above), so a failure that is not a Refusal is reported as given up at once.
    const refused = error instanceof Refusal
    useFailures.getState().report({ lookId: this.props.lookId, layer: `display:${this.props.id}`,
      kind: refused ? 'refusal' : 'gave-up', reason: refused ? reason : `not retried: ${reason}` })
  }

  componentDidMount() {
    // Mounted without a failure: the display draws, so an entry from an earlier mount is stale.
    if (!this.state.failed) useFailures.getState().clear(this.props.lookId, `display:${this.props.id}`)
  }

  render() {
    // A display's frame callback's throw comes back here, rethrown at render (src/lib/useTownFrame.js).
    return this.state.failed ? null : createElement(FrameBoundary.Provider, { value: true }, this.props.children)
  }
}
