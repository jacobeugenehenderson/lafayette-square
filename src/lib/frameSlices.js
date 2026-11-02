// frameSlices.js — work done in a frame's spare time, so motion never has a long frame.
//
// Owns: the kit's ONE measure of the display's frame (the median of the last animation-frame intervals, read live) and the
// ONE way the kit, and every app that draws a town, spreads work across frames: `runSliced` runs a generator a step at a
// time in a task posted after the frame's animation callbacks (the town's render included), and stops for the frame once the
// time since the frame began reaches the frame's own interval. `rowsInAFrame` is a request's budget for a list growing on
// screen: one frame's worth of work a frame (a frame of rendering plus a frame of rows stays under two frames).
// The visitor's rule it serves is The Ward's README.md §3 "Motion is fluid; a request may pause" (Jacob, 2026-10-14); this
// file is its mechanism. Moved here from The Ward's src/scene/frameSlices.js on 2026-11-02 (Usher; Ward's yes) so the
// town's own first-use work (SlabRevetment's near layer) and the Ward's lists share ONE measure of the frame. Apps import
// it through Town.jsx's public re-export, never by path, so there is one module instance and one rAF sampler.
// Must never: carry a row count or a millisecond constant — every budget is the
// frame's, measured; and never run work before a frame has been measured (it waits for one).

const deltas = []
let frameStart = 0
function tick(t) {
  if (frameStart) { deltas.push(t - frameStart); if (deltas.length > 30) deltas.shift() }
  frameStart = t
  requestAnimationFrame(tick)
}
if (typeof window !== 'undefined' && typeof requestAnimationFrame === 'function') requestAnimationFrame(tick)

/** The display's frame interval (ms), the median of the last frames; null until enough frames have been seen. */
export function frameInterval() {
  if (deltas.length < 8) return null
  const s = [...deltas].sort((a, b) => a - b)
  return s[s.length >> 1]
}

/** The time left in this frame (ms), from its start and its measured interval; null until a frame has been measured. */
export function frameTimeLeft() {
  const iv = frameInterval()
  return iv == null ? null : frameStart + iv - performance.now()
}

/**
 * Run `steps` (a generator) in the frames' spare time. Each frame: after its animation callbacks, steps run until the
 * frame's interval is used, then wait for the next frame. Returns { finish, cancel }: `finish` runs what is left at once
 * (a request that cannot wait — a brief pause, never a freeze of motion, since nothing moves while a reader picks).
 * `onDone(value)` gets the generator's return value, once.
 */
export function runSliced(steps, onDone) {
  let over = false
  const ch = new MessageChannel()
  const next = () => requestAnimationFrame(() => ch.port2.postMessage(0))
  const done = (value) => { over = true; ch.port1.onmessage = null; onDone?.(value) }
  ch.port1.onmessage = () => {
    if (over) return
    const left = frameTimeLeft()
    if (left == null) { next(); return }
    const end = performance.now() + left
    do { const r = steps.next(); if (r.done) { done(r.value); return } } while (performance.now() < end)
    next()
  }
  next()
  return {
    finish() { if (over) return undefined; let r; do r = steps.next(); while (!r.done); done(r.value); return r.value },
    cancel() { over = true; ch.port1.onmessage = null },
  }
}

/** How many of something costing `msEach` one measured frame interval holds (at least one, so a list always grows).
 *  A request's budget: the town's own render keeps its frame, the rows take one more; no frame reaches two. */
export function rowsInAFrame(msEach) {
  const iv = frameInterval()
  if (iv == null || !(msEach > 0)) return 1
  return Math.max(1, Math.floor(iv / msEach))
}
