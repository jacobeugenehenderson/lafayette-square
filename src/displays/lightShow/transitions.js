/**
 * transitions.js: the Light Show's TRANSITIONS (BRIEF-the-monument-lights-up §1: "a drawer of transitions", kit code;
 * the operator picks them, never draws them). The contact sheet (scratch/displays-looks/make-sheet.mjs) reads this file too.
 *
 * Each transition is a PURE function of (from, to, c, row, t, now, env) → [r, g, b]:
 *   from, to   samplers (c, row, enter = 1) → colour: the two looks, still running their own motions; `enter` (0 … 1)
 *              places a look's MOTION OBJECTS (layers marked `enter`) on their way in: 0 below the ground, 1 in place
 * `mirror: true` plays the way back as the way in, reversed. `fromEnter` is where the outgoing look's motion objects
 * stand before the transition (0: still below the ground, so the card opens on the look without them).
 *   c, row     the bulb's place in the frame (row < env.P is the pinnacle; the cone is below it)
 *   t          the transition's progress, 0 … 1
 *   now        the show clock in seconds: only the strobe accents read it, so they flicker at a steady rate
 * `accent: true` marks a transition whose moving edge SPARKLES: bulbs near it glint white at random, each at its own
 * moment, thinning away from the edge. Never a hard line, never the whole tree flashing (Jacob, 2026-10-31).
 * Same inputs, same light, on every screen: nothing here reads a device clock.
 */
export const TRANSITIONS = (() => {
  const clamp = (x) => Math.min(1, Math.max(0, x))
  const ease = (x) => { const t = clamp(x); return t * t * (3 - 2 * t) }
  const easeIn = (x) => { const t = clamp(x); return t * t * t }
  const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
  const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k]
  const WHITE = [255, 255, 255], BLACK = [0, 0, 0]
  /** A glint on the moving edge: d is the bulb's distance from it; the nearer, the likelier, each bulb on its own beat. */
  const sparkle = (c, row, d, now, E, w = 4) => {
    const a = Math.abs(d); if (a > w) return null
    const beat = Math.floor(now * 12 + E.hash(row * 977 + c) * 12), h = E.hash((row * E.FW + c) * 31 + beat)
    if (h > 0.5 * (1 - a / w)) return null
    const k = 0.75 + 0.25 * E.hash(beat * 7 + c)
    return [255 * k, 246 * k, 228 * k]
  }
  /** A slow wave, so a front is never ruler-straight. */
  const wob = (x) => (Math.sin(x * 0.21) + Math.sin(x * 0.077 + 1.3)) * 1.6

  return [
    { id: 'cascade', name: 'Cascade from the Crown', seconds: 2.4, accent: true,
      notes: 'The new look pours down from the pinnacle to the ground, its uneven leading edge sparkling as it falls.',
      mix(A, B, c, row, t, now, E) {
        const front = ease(t) * (E.FH + 12) - 6 + wob(c)
        const sp = t > 0 && t < 1 && sparkle(c, row, row - front, now, E); if (sp) return sp
        return row < front - 2 ? B(c, row) : row > front + 2 ? A(c, row) : lerp(B(c, row), A(c, row), (row - front + 2) / 4)
      } },

    { id: 'rising-spiral', name: 'Rising Spiral', seconds: 3, accent: true,
      notes: 'The new look winds up the tree from the ground in a two-turn spiral, its edge sparkling as it climbs.',
      mix(A, B, c, row, t, now, E) {
        const turns = 2, h = (E.FH - row) / E.FH, key = h * turns + c / E.FW, front = ease(t) * (turns + 1.1) - 0.05
        const sp = t > 0 && t < 1 && sparkle(c, row, (key - front) * 14, now, E); if (sp) return sp
        return key < front ? B(c, row) : A(c, row)
      } },

    { id: 'iris', name: 'Iris', seconds: 2.2, accent: false,
      notes: 'A circle of the new look opens from the middle of every face until it fills the tree.',
      mix(A, B, c, row, t, now, E) {
        const fw = E.FW / E.FACES, cx = (Math.floor(c / fw) + 0.5) * fw, cy = E.P + E.CONE * 0.55
        const d = Math.hypot(c - cx, (row - cy) * 0.75) / Math.hypot(fw / 2, E.FH * 0.6)
        const k = clamp((ease(t) * 1.1 - d) * 8)
        return lerp(A(c, row), B(c, row), k)
      } },

    { id: 'curtain', name: 'Curtain Sweep', seconds: 2.6, accent: true,
      notes: 'The new look is drawn round the tree like a curtain, its softly waving edge sparkling as it passes you.',
      mix(A, B, c, row, t, now, E) {
        const front = ease(t) * (E.FW + 12) - 6 + wob(row * 1.7)
        const sp = t > 0 && t < 1 && sparkle(c, row, c - front, now, E); if (sp) return sp
        return c < front ? B(c, row) : A(c, row)
      } },

    { id: 'sparkle', name: 'Sparkle Dissolve', seconds: 2.4, accent: false,
      notes: 'Bulb by bulb, at random, the old look gives way to the new, each one sparkling white as it turns.',
      mix(A, B, c, row, t, now, E) {
        const h = E.hash(row * E.FW + c), k = ease(t)
        if (Math.abs(h - k) < 0.025) return WHITE
        return h < k ? B(c, row) : A(c, row)
      } },

    { id: 'melt', name: 'Melt', seconds: 2.8, accent: true,
      notes: 'The old look slides down off the tree, strand by strand at its own pace, revealing the new; its falling edge sparkles.',
      mix(A, B, c, row, t, now, E) {
        const drop = easeIn(t) * (E.FH + 24) * (0.7 + 0.6 * E.hash(c * 7919)), src = row - drop
        const sp = t > 0 && t < 1 && sparkle(c, row, src - 1, now, E, 3); if (sp) return sp
        return src >= 0 ? A(c, Math.floor(src)) : B(c, row)
      } },

    { id: 'twirl', name: 'Twirl', seconds: 2.6, accent: false,
      notes: 'The old look spins faster and faster round the tree, blurs, and settles spinning down into the new.',
      mix(A, B, c, row, t, now, E) {
        const k = ease(t), wrap = (x) => ((Math.round(x) % E.FW) + E.FW) % E.FW
        return lerp(A(wrap(c + t * t * E.FW * 1.2), row), B(wrap(c - (1 - k) * (1 - k) * E.FW * 1.2), row), k)
      } },

    { id: 'blackout-bloom', name: 'Blackout and Bloom', seconds: 3, accent: false,
      notes: 'The tree goes dark, holds a breath, and the new look blooms up brighter than itself before settling.',
      mix(A, B, c, row, t, now, E) {
        if (t < 0.35) return scale(A(c, row), 1 - ease(t / 0.35))
        if (t < 0.5) return BLACK
        const u = (t - 0.5) / 0.5
        return scale(B(c, row), ease(u) * (1 + 0.7 * Math.sin(Math.PI * clamp(u))))
      } },

    { id: 'shatter', name: 'Shatter to Twinkle', seconds: 3, accent: false,
      notes: 'The old look breaks into twinkling bulbs that wink out; the new one twinkles into being.',
      mix(A, B, c, row, t, now, E) {
        const h1 = E.hash(row * E.FW + c), h2 = E.hash(row * E.FW + c + 99991), tw = 0.5 + 0.5 * Math.sin(now * 9 + h1 * 50)
        if (t < 0.5) return h1 < t * 2 ? (tw > 0.93 ? WHITE : BLACK) : scale(A(c, row), 0.6 + 0.4 * tw)
        return h2 < (t - 0.5) * 2 ? scale(B(c, row), 0.6 + 0.4 * tw) : (tw > 0.95 ? WHITE : BLACK)
      } },

    { id: 'expanding-stripes', name: 'Expanding Stripes', seconds: 2.2, accent: false,
      notes: 'Thin bands of the new look appear across the old and widen until they meet.',
      mix(A, B, c, row, t, now, E) {
        const local = ((row % 12) + 12) % 12 + 0.5
        return Math.abs(local - 6) < ease(t) * 6.6 ? B(c, row) : A(c, row)
      } },

    { id: 'chevron', name: 'Chevron', seconds: 6, accent: false, mirror: true, fromEnter: 0,
      notes: 'The stripes are there. The look’s motion object, the Progress flag’s own chevron, rises from the ground into place: now it is the Progress flag. It pauses. Then it keeps rising like a curtain, up and out of the top: its colours fade away as it goes, only the black climbing on, and the next look shows through beneath it. No sparkle: each phase is its own (Jacob, 2026-10-31). The way back is the same, reversed.',
      mix(A, B, c, row, t, now, E) {
        const run = E.CONE + 4
        if (t < 0.32) return A(c, row, ease(t / 0.32))                                   // rising into place
        if (t < 0.52) return A(c, row, 1)                                                 // the pause: the flag, whole
        const k = ease((t - 0.52) / 0.48), base = E.FH - k * (run + 4)                   // rising on; its base edge climbs
        if (row > base) return B(c, row)                                                  // beneath it, the next look
        // Its colours fade on the way up, the black alone climbing on: where the object covers, the next look shows through.
        const on = A(c, row, 1 + k), bare = A(c, row, 0)
        const isObject = Math.abs(on[0] - bare[0]) + Math.abs(on[1] - bare[1]) + Math.abs(on[2] - bare[2]) > 24
        if (!isObject || on[0] + on[1] + on[2] < 40) return on
        return lerp(on, B(c, row), ease(k * 2.5))
      } },
  ]
})()
