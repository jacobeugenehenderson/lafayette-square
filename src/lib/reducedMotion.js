/**
 * The reader's "reduce motion" preference — asked at the moment of each motion, so a change in the OS setting takes
 * effect on the next one. Under it, every <Town> flight is a cut and the controls do not coast (Warden, 2026-09-28,
 * kit-wide). ▶ node checks/claims-one-shot-flight.mjs
 */
export function prefersReducedMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
