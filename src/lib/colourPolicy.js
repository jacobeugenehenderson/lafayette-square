/**
 * THE COLOUR POLICY for every colour a town sets in Identity — suggested or hand-picked (Jacob via Warden, 2026-09-28).
 * One home, read by the Identity panel, the store's setters, the scene bake and Stage's suggester, so a hand-edited
 * design.json cannot pass what the panel would refuse.
 *
 *   HARD — what sits on the player's grounds (src/tokens/playerChrome.js), accessibility first:
 *     · the ACCENT is text: ≥ CONTRAST.text (7:1) on every ground;
 *     · a category's DETAIL form (its chip and dot, categoryColor.detailOf) ≥ CONTRAST.edge (3:1) on every ground.
 *     A colour under its floor cannot be saved; its NEAREST PASSING colour (same hue: lightness, then chroma) is offered.
 *   NOT HERE — the neon TUBE and the lit tint are drawn on the map, never on the player's grounds; their legibility is
 *     measured on the map (scripts/legibility-report.mjs), shown, not enforced.
 *   ADVISORY — closeness to a colour that already MEANS something (playerChrome MEANING): flagged, with the nearest
 *     option that clears it offered; the operator may keep theirs.
 * ▶ node checks/claims-identity-colours-obey-the-policy.mjs
 */
import { hexToRgb, rgbToHex, rgbToOklab, oklabToRgb, oklabToOklch, oklchToOklab, inGamut, contrast, deltaE } from './colourMath.js'
import { GROUNDS, MEANING, CONTRAST } from '../tokens/playerChrome.js'
import { detailOf } from './categoryColor.js'

/**
 * The advisory distance (OKLab ΔE) from a meaning colour. CHROME (accent): 0.12 — the closest the player's own meaning
 * colours come to each other (closed ↔ live). MAP (neon, detail, lit tint): 0.06 — three times OKLab's just-noticeable
 * difference (~0.02). Flagged, never enforced: Jacob's approved Lafayette Square accent sits 0.063 from "live".
 */
export const D_SEM = { chrome: 0.12, map: 0.06 }

const oklch = (hex) => oklabToOklch(rgbToOklab(hexToRgb(hex)))
const hexOf = ([L, C, h]) => rgbToHex(oklabToRgb(oklchToOklab([L, C, h])))
/** The largest chroma ≤ C inside sRGB at (L, h). */
export function gamutChroma(L, C, h) {
  if (inGamut(oklabToRgb(oklchToOklab([L, C, h])))) return C
  let lo = 0, hi = C
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (inGamut(oklabToRgb(oklchToOklab([L, mid, h])))) lo = mid; else hi = mid }
  return lo
}
/** The lowest contrast of `hex` against the player's grounds. */
export const groundContrast = (hex) => Math.min(...Object.values(GROUNDS).map((g) => contrast(hex, g)))

/**
 * The nearest colour at `hex`'s hue whose `measure(candidate)` ≥ floor: the smallest lightness change (either way) at its
 * own chroma, gamut-clipped by chroma, never by hue. null when no lightness at that hue clears it.
 */
export function nearestPassing(hex, floor, measure = groundContrast) {
  const [L0, C, h] = oklch(hex)
  const at = (L) => hexOf([L, gamutChroma(L, C, h), h])
  if (measure(hex) >= floor) return hex
  let best = null
  for (let step = 1; step <= 100; step++) for (const L of [L0 + step / 100, L0 - step / 100]) {
    if (L < 0 || L > 1) continue
    const c = at(L)
    if (measure(c) >= floor) { best = c; break }
    if (best) break
  }
  if (!best) return null
  // refine to the boundary between the failing and passing lightness
  const [Lb] = oklch(best), dir = Lb > L0 ? 1 : -1
  let lo = L0, hi = Lb
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (measure(at(mid)) >= floor) hi = mid; else lo = mid }
  return at(hi) && measure(at(hi)) >= floor ? at(hi) : best
}

/**
 * The closest meaning colour, and the advisory if within `dSem` — with the NEAREST option that clears it: same hue, the
 * (lightness, chroma) closest to the original (OKLab ΔE) that stands `dSem` from every meaning colour and keeps
 * `keepFloor` when given. Lightness must move too: the player's meaning colours are pastels at the lightness a readable
 * accent sits at, so draining chroma alone walks toward them. null when no colour at that hue clears it.
 */
export function meaningAdvisory(hex, dSem, keepFloor = null, measure = groundContrast) {
  let near = null
  for (const [name, m] of Object.entries(MEANING)) { const d = deltaE(hex, m); if (!near || d < near.deltaE) near = { name, deltaE: +d.toFixed(3) } }
  if (near.deltaE >= dSem) return { closest: near, flagged: false, clear: null }
  const [, C0, h] = oklch(hex)
  let clear = null, clearD = Infinity
  for (let L = 0; L <= 1.0001; L += 0.01) for (let c = 0; c <= C0 + 1e-9; c += 0.005) {
    const cand = hexOf([L, gamutChroma(L, c, h), h])
    const d = deltaE(cand, hex)
    if (d >= clearD) continue
    if (!Object.values(MEANING).every((m) => deltaE(cand, m) >= dSem)) continue
    if (keepFloor != null && measure(cand) < keepFloor) continue
    clear = cand; clearD = d
  }
  return { closest: near, flagged: true, clear }
}

/** The accent under the policy. `ok` false → it cannot be saved; `nearest` is what can. */
export function accentPolicy(hex) {
  const c = groundContrast(hex)
  const ok = c >= CONTRAST.text
  return { hex, contrast: +c.toFixed(2), ok, nearest: ok ? hex : nearestPassing(hex, CONTRAST.text), floor: CONTRAST.text,
    advisory: meaningAdvisory(ok ? hex : nearestPassing(hex, CONTRAST.text) || hex, D_SEM.chrome, CONTRAST.text) }
}

/** A category neon under the policy: its DETAIL form is held to the edge floor; the tube itself is the map's. */
export function neonPolicy(neonHex) {
  const measure = (n) => groundContrast(detailOf(n))
  const c = measure(neonHex)
  const ok = c >= CONTRAST.edge
  return { hex: neonHex, detail: detailOf(neonHex), detailContrast: +c.toFixed(2), ok, floor: CONTRAST.edge,
    nearest: ok ? neonHex : nearestPassing(neonHex, CONTRAST.edge, measure),
    advisory: meaningAdvisory(neonHex, D_SEM.map), detailAdvisory: meaningAdvisory(detailOf(neonHex), D_SEM.map) }
}

/** The lit tint: no hard floor (it is on the map); advisory only. */
export const litTintPolicy = (tint) => ({ ok: true, advisory: meaningAdvisory(tint.color, D_SEM.map) })

/** Throws, naming each failure, when a Look's authored identity or category colours break the HARD tier. */
export function assertHardPolicy({ identity = {}, materialColors = {} }, where) {
  const bad = []
  if (identity.accent) { const p = accentPolicy(identity.accent); if (!p.ok) bad.push(`accent ${p.hex} is ${p.contrast}:1 — under ${p.floor}:1 on the player's grounds (nearest passing: ${p.nearest})`) }
  for (const [k, v] of Object.entries(materialColors)) {
    if (!k.startsWith('neon_') || !v) continue
    const p = neonPolicy(v)
    if (!p.ok) bad.push(`${k} ${v}: its chip ${p.detail} is ${p.detailContrast}:1 — under ${p.floor}:1 (nearest passing: ${p.nearest})`)
  }
  if (bad.length) throw new Error(`${where}: a colour breaks the contrast policy (src/lib/colourPolicy.js) —\n  ${bad.join('\n  ')}`)
}
