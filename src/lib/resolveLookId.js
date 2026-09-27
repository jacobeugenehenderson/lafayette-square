import { INSTANCE } from '../instance.js'

/**
 * The Look a consumer draws: its `lookId` prop, else `?look=`, else the page's boot town. THE one copy — eleven
 * private copies were folded here (2026-09-27); claims-a-look-keyed-tool-is-called-with-its-look fails a new one.
 */
export function resolveLookId(propLookId) {
  if (propLookId) return propLookId
  if (typeof window === 'undefined') return INSTANCE.lookId
  const m = window.location.search.match(/[?&]look=([^&]+)/)   // [?&]: never an `overlook=`
  return m ? decodeURIComponent(m[1]) : INSTANCE.lookId
}
