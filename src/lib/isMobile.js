// Single source of truth for the mobile-device check. The UA sniff
// (/iPhone|iPad|iPod|Android/) was previously redefined in 6+ modules with
// subtly different guards; consolidated here so the mobile render profile keys
// off ONE definition. SSR-safe via the `typeof navigator` guard.
export const IS_MOBILE = typeof navigator !== 'undefined'
  && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
