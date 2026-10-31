/**
 * The Light Show's engine: what every bulb shows at an instant. PURE (no React, no three, no clock of its own), so every
 * viewer who passes the same instant gets the same light, and a check can call it in node.
 * (BRIEF-the-monument-lights-up §1; rulings under references/registry.json q-how-a-town-authors-a-display.)
 *
 * THE FRAME (the town's looks.json `frame`): w × h bulbs, one pixel per bulb, in two regions stacked:
 *   rows 0 … pinH-1   the PINNACLE, strip-lit (its four faces, a colour per face)
 *   rows pinH … h-1   the CONE, strands from the ridge to the ground ring (column = around, row = down a strand)
 * A LOOK is layers, bottom to top, each with one built-in motion (r-a-look-is-layers-each-with-one-motion). A layer's
 * pixels arrive as RGBA arrays (`px`, one per frame of a system-drawn motion), rasterized by the renderer.
 * A SHOW is looks separated by transitions (r-a-show-is-looks-separated-by-transitions), opened by the Transformation:
 * the white glow gives way to the colour strands.
 * ⛔ An unknown look, motion or transition THROWS by name. Nothing here falls back.
 */
import { TRANSITIONS } from './transitions.js'
export { uplightTarget } from '../dim.js'

export const MOTIONS = ['still', 'fall', 'rise', 'spin', 'spiral', 'twinkle', 'pulse', 'strobe', 'fade']
export const OPEN_SECONDS = 3.8                     // the Transformation, and its reverse at the close
const TRANSITION = Object.fromEntries(TRANSITIONS.map(t => [t.id, t]))

export function hash(i) { let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296 }
const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const wrapIn = (v, lo, n) => lo + (((v - lo) % n) + n) % n
const clamp = (x) => Math.min(1, Math.max(0, x))
export const smooth = (x) => { const t = clamp(x); return t * t * (3 - 2 * t) }
const fadeAlpha = (t, period) => clamp(((0.5 + 0.5 * Math.sin(2 * Math.PI * t / period)) - 0.25) * 2)
/** A fade played OUT once: whole until the look's start, then each bulb turns at its own moment in the next `out`
 *  seconds, glinting white as it turns (Jacob, 2026-10-31: the lilac "fade/sparkles into the trans flag"). */
const fadeOut = (t, out, h) => { const at = h * out; return t < at ? 1 : t < at + 0.12 ? -1 : 0 }
/** Which of a layer's frames shows at t: looped, or played ONCE from the look's start and held at either end. */
const frameAt = (L, t) => { const n = L.px.length; if (n === 1) return 0; const i = Math.floor(t * L.fps); return L.once ? Math.min(n - 1, Math.max(0, i)) : ((i % n) + n) % n }

/** Checks a drawer (looks.json) against the engine: every motion known, every layer's frames present. Throws by name. */
export function validateDrawer(drawer, where) {
  const { frame, looks } = drawer || {}
  if (!(frame?.w > 0 && frame?.h > frame?.pinH && frame?.faces > 0)) throw new Error(`[lightShow] ⛔ ${where}: the drawer has no usable frame`)
  for (const L of looks || []) for (const [i, layer] of L.layers.entries()) {
    if (!MOTIONS.includes(layer.motion?.kind)) throw new Error(`[lightShow] ⛔ ${where}: look "${L.id}" layer ${i} has motion "${layer.motion?.kind}", which the Light Show does not have (have: ${MOTIONS.join(', ')})`)
    if (!layer.frames?.length) throw new Error(`[lightShow] ⛔ ${where}: look "${L.id}" layer ${i} has no frames`)
    // The layer's clock fields: refused unless meaningful, never read as something plausible (Zob, 2026-10-31).
    if (layer.frames.length > 1 && !(typeof layer.fps === 'number' && layer.fps > 0)) throw new Error(`[lightShow] ⛔ ${where}: look "${L.id}" layer ${i} has ${layer.frames.length} frames and no fps (a number > 0), so it has no clock to play them on`)
    if ('once' in layer && typeof layer.once !== 'boolean') throw new Error(`[lightShow] ⛔ ${where}: look "${L.id}" layer ${i} has once ${JSON.stringify(layer.once)}; once is true or false`)
    const out = layer.motion.out
    if (out !== undefined && !(layer.motion.kind === 'fade' && typeof out === 'number' && out > 0)) throw new Error(`[lightShow] ⛔ ${where}: look "${L.id}" layer ${i} has out ${JSON.stringify(out)} on a ${layer.motion.kind} layer; out is a fade's seconds to play out, a number > 0`)
  }
}

/**
 * A whole display record against its drawer, before it ships: the strands, the season, the schedule and the running
 * order. Throws by name. (The first line; DisplayBoundary is the last.)
 */
export function validateDisplay(display, drawer, where) {
  validateDrawer(drawer, where)
  if (display.dimUplights !== undefined && !(display.dimUplights >= 0 && display.dimUplights <= 1)) throw new Error(`[lightShow] ⛔ ${where}: dimUplights (${display.dimUplights}) is a fraction of the uplights, 0 … 1`)
  const st = display.strands
  if (!(st?.glow > 0 && st?.show > 0 && st?.ringRadiusM > 0)) throw new Error(`[lightShow] ⛔ ${where}: strands needs glow, show and ringRadiusM`)
  if (st.show % st.glow) throw new Error(`[lightShow] ⛔ ${where}: strands.show (${st.show}) must be a whole multiple of strands.glow (${st.glow}): the glow strands are show strands`)
  if (!(st.footHeightM >= 0)) throw new Error(`[lightShow] ⛔ ${where}: strands.footHeightM, the ring's height above the set-piece's base, is not authored`)
  if (typeof display.season !== 'string' || !display.season) throw new Error(`[lightShow] ⛔ ${where}: the display names no season`)
  if (display.shows && display.shows.every !== 'hour') throw new Error(`[lightShow] ⛔ ${where}: shows.every "${display.shows.every}" is not a schedule the Light Show knows (have: hour)`)
  compileRun(display.run, Object.fromEntries(drawer.looks.map(L => [L.id, L])), where)
}

/**
 * What one bulb of a look shows at time t: seconds on the LOOK's own clock, 0 when its segment begins (negative while a
 * transition brings it in), so a motion's phase is the look's, the same at every showing. `look.layers[i].px` are the
 * layer's frames; a fade with `out` is whole until t = 0 and sparkles away over `out` seconds, never returning.
 * `enter` places the look's motion objects: 0 below the ground, 1 in place, past 1 rising on.
 */
export function sampleLook(F, look, c, row, t, top = look.layers.length - 1, enter = 1) {
  const { w: FW, h: FH, pinH: P } = F, CONE = FH - P
  for (let li = top; li >= 0; li--) {
    const L = look.layers[li], m = L.motion, px = L.px[frameAt(L, t)], sp = m.speed ?? 6
    let cc = c, rr = row
    let lo = row < P ? 0 : P, n = row < P ? P : CONE
    if (m.rows && row >= P) { lo = P + m.rows[0]; n = m.rows[1] - m.rows[0]; if (row < lo || row >= lo + n) continue }
    if (L.enter && enter !== 1) { rr = row - Math.round((1 - enter) * (CONE + 4)); if (rr < P || rr >= FH) continue }
    if (m.kind === 'fall') rr = wrapIn(row - Math.floor(t * sp), lo, n)
    if (m.kind === 'rise') rr = wrapIn(row + Math.floor(t * sp), lo, n)
    if (m.kind === 'spin' || m.kind === 'spiral') cc = ((c - Math.floor(t * sp)) % FW + FW) % FW
    if (m.kind === 'spiral') rr = wrapIn(row + Math.floor(t * (m.rise ?? 3)), lo, n)
    const o = (rr * FW + cc) * 4, alpha = px[o + 3] / 255
    if (alpha < 0.02) continue
    let r = px[o], g = px[o + 1], b = px[o + 2]
    if (alpha < 0.98 && li > 0) { const u = sampleLook(F, look, c, row, t, li - 1, enter); r = u[0] + (r - u[0]) * alpha; g = u[1] + (g - u[1]) * alpha; b = u[2] + (b - u[2]) * alpha }
    let k = 1
    const only = m.only ? (m._only ??= hexRGB(m.only)) : null
    if (!only || Math.abs(r - only[0]) + Math.abs(g - only[1]) + Math.abs(b - only[2]) < 90) {
      if (m.kind === 'twinkle') { const h = hash(rr * FW + cc), w = Math.sin(t * (2 + h * 3) + h * 40); k = w > 0.55 ? 1.6 : 0.55 + 0.35 * (w + 1) / 2 }
      if (m.kind === 'pulse') k = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2 * Math.PI * (m.speed ?? 1)))
      if (m.kind === 'strobe') k = (t % 1.2) < 0.06 || ((t % 1.2) > 0.14 && (t % 1.2) < 0.2) ? 3 : 1
    }
    if (m.kind === 'fade' && m.out) { const a = fadeOut(t, m.out, hash(row * FW + c + 7919)); if (a < 0) return [255, 246, 228]; if (a === 0) { if (li === 0) return [0, 0, 0]; return sampleLook(F, look, c, row, t, li - 1, enter) } return [r, g, b] }
    if (m.kind === 'fade') { const a = fadeAlpha(t, m.period ?? 6); if (a < 1) { const u = sampleLook(F, look, c, row, t, li - 1, enter); return [u[0] + (r - u[0]) * a, u[1] + (g - u[1]) * a, u[2] + (b - u[2]) * a] } }
    return [r * k, g * k, b * k]
  }
  return [0, 0, 0]
}

/**
 * A show's running order, resolved against the drawer: `run` is [{ look, seconds } | { transition }], looks and
 * transitions alternating. Returns segments with start times and the total length. Throws on any unknown name.
 */
export function compileRun(run, looksById, where) {
  if (!run?.length) throw new Error(`[lightShow] ⛔ ${where}: the show has no running order`)
  const segs = []; let at = 0
  run.forEach((step, i) => {
    if (step.look) {
      if (!looksById[step.look]) throw new Error(`[lightShow] ⛔ ${where}: the show names look "${step.look}", and the drawer has no such look`)
      if (!(step.seconds > 0)) throw new Error(`[lightShow] ⛔ ${where}: look "${step.look}" in the show has no seconds`)
      segs.push({ kind: 'look', look: step.look, at, seconds: step.seconds }); at += step.seconds
    } else if (step.transition) {
      const tr = TRANSITION[step.transition]
      if (!tr) throw new Error(`[lightShow] ⛔ ${where}: the show names transition "${step.transition}", and there is none (have: ${Object.keys(TRANSITION).join(', ')})`)
      const prev = run[i - 1]?.look, next = run[i + 1]?.look
      if (!prev || !next) throw new Error(`[lightShow] ⛔ ${where}: transition "${step.transition}" must stand between two looks`)
      segs.push({ kind: 'transition', tr, from: prev, to: next, at, seconds: tr.seconds }); at += tr.seconds
    } else throw new Error(`[lightShow] ⛔ ${where}: step ${i} of the show is neither a look nor a transition`)
  })
  // Where each look's motion objects stand while it holds: the next transition may want them below the ground.
  segs.forEach((s, i) => { if (s.kind === 'look') s.enter = segs[i + 1]?.kind === 'transition' ? (segs[i + 1].tr.fromEnter ?? 1) : 1 })
  return { segs, seconds: at }
}

/**
 * The show at `t` seconds since it began (open → run → close). Returns
 *   { reveal: null | (c, row) → 'on' | 'off' | 'spark', pin: 0…1, colour: (c, row) → rgb }
 * During the opening the show's front spirals down from the ridge: behind it 'on' (the show's colour), ahead of it 'off',
 * where the glow strands stay lit white until the show overtakes them; at the close the same, reversed.
 * `now` is the town's instant in seconds: only the sparkles read it. Each look's motions run on its OWN clock, from the
 * start of its segment (Jacob, 2026-10-31: the ribbon's build starts black; Trans arrives on its lilac).
 */
export function showAt(F, compiled, looksById, t, now) {
  const E = { FW: F.w, FH: F.h, P: F.pinH, CONE: F.h - F.pinH, FACES: F.faces, hash }
  const total = OPEN_SECONDS + compiled.seconds + OPEN_SECONDS
  const tt = Math.min(Math.max(t, 0), total)
  const runT = Math.min(Math.max(tt - OPEN_SECONDS, 0), compiled.seconds - 1e-6)
  const seg = compiled.segs.find(s => runT >= s.at && runT < s.at + s.seconds) || compiled.segs.at(-1)
  let colour
  if (seg.kind === 'look') colour = (c, row) => sampleLook(F, looksById[seg.look], c, row, runT - seg.at, undefined, seg.enter)
  else {
    const i = compiled.segs.indexOf(seg), prevLook = compiled.segs[i - 1], nextLook = compiled.segs[i + 1]
    const p = (runT - seg.at) / seg.seconds, tA = runT - prevLook.at, tB = runT - nextLook.at   // each look on its own clock
    const A = (c, row, k = 1) => sampleLook(F, looksById[seg.from], c, row, tA, undefined, k)
    const B = (c, row, k = nextLook.enter ?? 1) => sampleLook(F, looksById[seg.to], c, row, tB, undefined, k)
    colour = (c, row) => seg.tr.mix(A, B, c, row, p, now, E)
  }
  // The Transformation: the show overtakes the glow, spiralling down from the ridge; the pinnacle comes up last.
  const open = tt < OPEN_SECONDS ? tt / OPEN_SECONDS : tt > total - OPEN_SECONDS ? (total - tt) / OPEN_SECONDS : 1
  if (open >= 1) return { reveal: null, pin: 1, colour }
  const front = open * 3.1
  const reveal = (c, row) => {
    const key = (row - E.P) / E.CONE * 2 + c / E.FW, d = Math.abs(key - front) * 14
    if (d < 4 && hash((row * E.FW + c) * 31 + Math.floor(now * 12 + hash(row * 977 + c) * 12)) < 0.5 * (1 - d / 4)) return 'spark'
    return key < front ? 'on' : 'off'
  }
  return { reveal, pin: smooth((open - 0.7) / 0.3), colour }
}
export const showSeconds = (compiled) => OPEN_SECONDS + compiled.seconds + OPEN_SECONDS

/**
 * LIVE: what the display is doing at a town instant, by its own schedule. `clock` is townClockOf(instant); `sunDown` is
 * the sun below the horizon at the town. Off out of season or by day; the glow after dark; a show from each showtime
 * (`shows: { every: 'hour', from: 'HH:MM', to: 'HH:MM' }`, town time) for as long as the show runs.
 * Returns { mode: 'off' | 'glow' | 'show', t, up } with t the seconds since the show began and `up` whether the strands
 * are hung at all: in season (by day they hang dark), never out of it (Jacob, 2026-10-31: "hide the strands out of season").
 */
export function liveState(display, compiled, clock, calendar, sunDown, where) {
  const up = inSeason(calendar, display.season, clock.date, where)
  if (!up || !sunDown) return { mode: 'off', t: 0, up }
  const s = display.shows
  if (s?.every === 'hour') {
    const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
    const startMin = clock.hours * 60, t = clock.minutes * 60 + clock.seconds
    if (startMin >= toMin(s.from) && startMin <= toMin(s.to) && t < showSeconds(compiled)) return { mode: 'show', t, up }
  } else if (s) throw new Error(`[lightShow] ⛔ ${where}: shows.every "${s.every}" is not a schedule the Light Show knows (have: hour)`)
  return { mode: 'glow', t: 0, up }
}

/** The white glow's colour for one bulb (warm white, a gentle shimmer). */
export function glowColour(c, row, now) { const h = hash(c * 131 + row), w = 0.8 + 0.2 * Math.sin(now * 1.5 + h * 30); return [255 * w, 214 * w, 150 * w] }

/**
 * Is the town's season on at `instant`? `calendar` is the town's PUBLISHED calendar (rows with id, start_date,
 * end_date?), or null when it has not been read yet: then the display is off, and nothing refuses. `day` is the
 * town's date (YYYY-MM-DD, from townClockOf). A season id the calendar lacks THROWS.
 */
export function inSeason(calendar, seasonId, day, where) {
  if (calendar == null) return false
  const e = calendar.find(r => r.id === seasonId)
  if (!e) throw new Error(`[lightShow] ⛔ ${where}: the display's season "${seasonId}" is not on the town's calendar`)
  return e.start_date <= day && day <= (e.end_date || e.start_date)
}
