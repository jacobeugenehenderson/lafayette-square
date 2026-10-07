/**
 * THE REVEAL — the town's physical classes arrive at once (Jacob, 2026-10-06: "The most important thing is everything
 * arriving at once, or very close to at once" · "physically"). Ruled: WARD USABLE = THE REVEAL.
 *
 * Each PHYSICAL class (ground surfaces, buildings, trees with their card pages) says when it is PREPARED: its geometry
 * built and the textures its first look needs arrived. <Town>'s gate keeps the classes hidden until every class it
 * draws has said so, compiles them ahead (renderer.compileAsync, parallel shader compile) and uploads their textures,
 * then shows them on ONE frame. LOOK layers (the ground's detail maps, AO, post effects) are not gated: they fade in
 * after. ▶ src/components/Town.jsx#RevealGate · startup mark `ward:reveal` (startupMarks.js).
 *
 * ⛔ A class that FAILS (its loader, its error boundary) says so by name via `markFailed`; the gate then reports what
 * it is waiting on. Nothing is revealed with a hole, and nothing is waited on in silence.
 */
const _state = new Map()   // class id → 'prepared' | { failed: reason }
const _subs = new Set()
const notify = () => { for (const fn of _subs) fn() }

/** A physical class is ready to be shown (idempotent). */
export function markPrepared(id) {
  if (_state.get(id) === 'prepared') return
  _state.set(id, 'prepared')
  notify()
}

/** A physical class will not arrive: said once, by name. */
export function markFailed(id, reason) {
  if (_state.get(id)?.failed) return
  _state.set(id, { failed: reason })
  console.error(`[reveal] ⛔ "${id}" will not arrive: ${reason}. The town stays hidden rather than revealed with a hole.`)
  notify()
}

/** A class is no longer prepared (its town re-baked or remounted). */
export function markUnprepared(id) {
  if (!_state.has(id)) return
  _state.delete(id)
  notify()
}

export const isPrepared = (id) => _state.get(id) === 'prepared'
export const failureOf = (id) => _state.get(id)?.failed || null
export function subscribeReveal(fn) { _subs.add(fn); return () => _subs.delete(fn) }

// The gate's own state: once a page has revealed its town it stays revealed (a re-bake or a remount does not hide the
// town again — the reveal is the ARRIVAL, once per page).
let _revealed = false
export const isRevealed = () => _revealed
export function setRevealed() {
  if (_revealed) return
  _revealed = true
  notify()
}
