/**
 * ease — the easing curves, defined once. `easeInOutCubic` is THE camera's curve between shots (production's move,
 * BRIEF-town-shot-flight) and the one an app's panel rides (<Town flightRef>'s `eased`), so a flight and the UI that
 * moves with it cannot drift apart. ▶ node checks/claims-one-shot-flight.mjs
 */
export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}
