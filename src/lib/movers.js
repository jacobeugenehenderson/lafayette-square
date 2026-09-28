/**
 * movers — the live dots a town draws: where each stands, and whether it is inside the town. Pure (no three, no React).
 *
 * WHY (Warden, 2026-09-28). The app owns the positions — geolocation and its permission are the Ward's, a courier's
 * position is the Cary backend's — and the TOWN places them: through its own place (townPlace's projection, the one
 * the sun uses) and against its own disc (ground.json#stencil). ⛔ The old player's courier layer projected with the
 * boot town's geography and stood every dot at a fixed 35 m; neither survives here.
 * ▶ node checks/claims-a-mover-stands-where-it-is.mjs
 *
 * A mover: { id, kind, lat, lon, active? }
 *   kind    'you' (the visitor) · 'courier' (built and checked; unused until Cary goes live)
 *   active  courier only, REQUIRED: true = on a delivery (blue), false = idle (yellow)
 * ⛔ No `heading`, no `accuracy`: no look draws them yet, and a field nothing draws is a silent no-op — passing one
 * throws until it is designed.
 */

/** Each kind and what it needs. The looks live in src/components/Movers.jsx. */
export const MOVER_KINDS = {
  you: { needsActive: false },
  courier: { needsActive: true },
}
const UNDESIGNED = ['heading', 'accuracy']

/**
 * @param movers  the app's list
 * @param place   the town's place { lat, lon, latToMeters, lonToMeters } (townPlace())
 * @param disc    the town's disc { center: [x, z], radius } — or null when not yet published (every mover is outside)
 * @returns [{ id, kind, active, x, z, inside }] — every mover, in order; none vanish
 */
export function placeMovers(movers, place, disc) {
  if (!Array.isArray(movers)) throw new Error(`[Town] ⛔ movers must be an array (got ${typeof movers})`)
  const seen = new Set()
  return movers.map((m, i) => {
    if (m?.id == null || m.id === '') throw new Error(`[Town] ⛔ mover #${i} has no id`)
    if (seen.has(m.id)) throw new Error(`[Town] ⛔ two movers share the id "${m.id}"`)
    seen.add(m.id)
    const kind = MOVER_KINDS[m.kind]
    if (!kind) throw new Error(`[Town] ⛔ mover "${m.id}": unknown kind "${m.kind}" — one of ${Object.keys(MOVER_KINDS).join(' · ')}`)
    for (const f of UNDESIGNED) if (f in m) throw new Error(`[Town] ⛔ mover "${m.id}" carries \`${f}\` — no look draws it yet, so it would do nothing`)
    if (!Number.isFinite(m.lat) || !Number.isFinite(m.lon)) throw new Error(`[Town] ⛔ mover "${m.id}": lat/lon must be numbers (got ${m.lat}, ${m.lon})`)
    if (kind.needsActive && typeof m.active !== 'boolean') throw new Error(`[Town] ⛔ courier "${m.id}" needs \`active\` (true on a delivery, false idle)`)
    const x = (m.lon - place.lon) * place.lonToMeters
    const z = (place.lat - m.lat) * place.latToMeters
    const inside = !!disc && Math.hypot(x - disc.center[0], z - disc.center[1]) <= disc.radius
    return { id: m.id, kind: m.kind, active: kind.needsActive ? m.active : null, x, z, inside }
  })
}
