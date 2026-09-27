import { INSTANCE } from '../instance.js'

/** The Look a consumer draws: its `lookId` prop, else `?look=`, else the page's boot town. */
export function resolveLookId(propLookId) {
  if (propLookId) return propLookId
  if (typeof window === 'undefined') return INSTANCE.lookId
  const m = window.location.search.match(/look=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : INSTANCE.lookId
}
