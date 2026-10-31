/**
 * transitions.js: draft 1 of the Light Show's TRANSITIONS (BRIEF-the-monument-lights-up §1: "a drawer of transitions",
 * kit code; the operator picks them, never draws them).
 *
 * Each transition is a PURE function of (from, to, c, row, t, now, env) → [r, g, b]:
 *   from, to   samplers (c, row) → colour: the two looks, still running their own motions
 *   c, row     the bulb's place in the frame (row < env.P is the pinnacle; the cone is below it)
 *   t          the transition's progress, 0 … 1
 *   now        the show clock in seconds: only the strobe accents read it, so they flicker at a steady rate
 * `accent: true` marks a transition that strobes hard white at its moving edge, the dynamic moment.
 * Same inputs, same light, on every screen: nothing here reads a device clock.
 * ⚠️ Draft for Jacob's contact sheet; it moves into the plugin when he approves the set.
 */
const TRANSITIONS = (() => {
  const clamp = (x) => Math.min(1, Math.max(0, x))
  const ease = (x) => { const t = clamp(x); return t * t * (3 - 2 * t) }
  const easeIn = (x) => { const t = clamp(x); return t * t * t }
  const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
  const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k]
  const WHITE = [255, 255, 255], BLACK = [0, 0, 0]
  const flick = (now) => Math.floor(now * 16) % 2 === 0                       // a strobe: ~8 flashes a second
  const edge = (d, now, w = 1.6) => Math.abs(d) < w && flick(now)            // on the moving edge, and flashing
  function bounceOut(x) {                                                     // lands, bounces twice, settles
    const n = 7.5625, d = 2.75, t = clamp(x)
    if (t < 1 / d) return n * t * t
    if (t < 2 / d) { const u = t - 1.5 / d; return n * u * u + 0.75 }
    if (t < 2.5 / d) { const u = t - 2.25 / d; return n * u * u + 0.9375 }
    const u = t - 2.625 / d; return n * u * u + 0.984375
  }

  return [
    { id: 'cascade', name: 'Cascade from the Crown', seconds: 2.4, accent: true,
      notes: 'The new look pours down from the pinnacle to the ground; its leading edge strobes as it falls.',
      mix(A, B, c, row, t, now, E) {
        const front = t * (E.FH + 6) - 3
        if (edge(row - front, now)) return WHITE
        return row < front - 2 ? B(c, row) : row > front + 2 ? A(c, row) : lerp(B(c, row), A(c, row), (row - front + 2) / 4)
      } },

    { id: 'rising-spiral', name: 'Rising Spiral', seconds: 3, accent: true,
      notes: 'The new look winds up the tree from the ground in a two-turn spiral; its edge strobes as it climbs.',
      mix(A, B, c, row, t, now, E) {
        const turns = 2, h = (E.FH - row) / E.FH, key = h * turns + c / E.FW, front = t * (turns + 1.05)
        if (edge((key - front) * 12, now, 1.4)) return WHITE
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
      notes: 'The new look is drawn round the tree like a curtain, its edge strobing as it passes you.',
      mix(A, B, c, row, t, now, E) {
        const front = ease(t) * (E.FW + 4) - 2
        if (edge(c - front, now, 1.2)) return WHITE
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
      notes: 'The old look slides down off the tree, strand by strand at its own pace, revealing the new; the falling edge strobes.',
      mix(A, B, c, row, t, now, E) {
        const drop = easeIn(t) * (E.FH + 24) * (0.7 + 0.6 * E.hash(c * 7919)), src = row - drop
        if (src >= 0) return edge(src - 1, now, 1.4) ? WHITE : A(c, Math.floor(src))
        return B(c, row)
      } },

    { id: 'twirl', name: 'Twirl', seconds: 2.6, accent: false,
      notes: 'The old look spins faster and faster round the tree, blurs, and settles spinning down into the new.',
      mix(A, B, c, row, t, now, E) {
        const k = ease(t), wrap = (x) => ((Math.round(x) % E.FW) + E.FW) % E.FW
        return lerp(A(wrap(c + t * t * E.FW * 1.2), row), B(wrap(c - (1 - k) * (1 - k) * E.FW * 1.2), row), k)
      } },

    { id: 'strobe-flash', name: 'Strobe Flash', seconds: 1.4, accent: true,
      notes: 'A burst of hard white strobes, the look switching underneath it.',
      mix(A, B, c, row, t, now, E) {
        if (t < 0.15) return A(c, row)
        if (t > 0.85) return B(c, row)
        return flick(now) ? WHITE : scale(t < 0.5 ? A(c, row) : B(c, row), 0.25)
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

    { id: 'rising-stripes', name: 'Rising Stripes', seconds: 2.6, accent: true,
      notes: 'Bands of the new look climb from the ground, every other band a beat behind; their tops strobe as they rise.',
      mix(A, B, c, row, t, now, E) {
        const band = Math.floor((E.FH - row) / 8), tt = clamp((t - (band % 2) * 0.22) / 0.78), front = ease(tt) * (E.FH + 4)
        if (edge((E.FH - row) - front, now, 1.4)) return WHITE
        return (E.FH - row) < front ? B(c, row) : A(c, row)
      } },

    { id: 'expanding-stripes', name: 'Expanding Stripes', seconds: 2.2, accent: false,
      notes: 'Thin bands of the new look appear across the old and widen until they meet.',
      mix(A, B, c, row, t, now, E) {
        const local = ((row % 12) + 12) % 12 + 0.5
        return Math.abs(local - 6) < ease(t) * 6.6 ? B(c, row) : A(c, row)
      } },

    { id: 'drop-in', name: 'Drop-in Stripes', seconds: 3.2, accent: true,
      notes: 'Bands of the new look drop from the pinnacle one by one, land with a bounce and stack up from the ground; each landing strobes.',
      mix(A, B, c, row, t, now, E) {
        const H = 12, nb = Math.ceil(E.FH / H)
        for (let k = 0; k < nb; k++) {
          const u = clamp((t - (k / nb) * 0.62) / 0.38)
          if (u <= 0) continue
          const bottom = E.FH - k * H, top = bottom - H, d = (1 - bounceOut(u)) * bottom
          if (row >= top - d && row < bottom - d) {
            const landing = [0.36, 0.73, 0.91].some(x => Math.abs(u - x) < 0.035)
            if (landing && row >= bottom - d - 1.5) return WHITE
            return B(c, Math.min(E.FH - 1, Math.round(row + d)))
          }
        }
        return A(c, row)
      } },
  ]
})()
if (typeof module !== 'undefined') module.exports = { TRANSITIONS }
