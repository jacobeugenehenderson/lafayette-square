import { useEffect, useState } from 'react'

/**
 * THE CANARY — the one specimen currently under examination.
 *
 * ⭐ ONE SELECTION, MANY VIEWERS. The operator points at a tree once and every
 * surface that wants to show "the specimen we are looking at" follows it:
 * the Meteorologist's weather scene (does it hold up in a storm?) and the
 * Arborist's full monte (is the thing we ship any good?). ⛔ A second
 * "which tree?" picker would be a second answer to a question that already has
 * one, and the two would drift — invisibly, because both would look plausible.
 *
 * ⚠ THE VIEWERS ARE ALREADY IDENTICAL AND THAT IS WHY THIS IS ONE THING, not
 * two that happen to rhyme. Both resolve the SAME artifact by the same rule —
 * `baked/<look>/trees/<species>/skeleton-<variantId>-lod1.glb` — and dress it
 * with the SAME shared per-Look atlas material. There is no
 * authoring-vs-baked difference between them to preserve: both read the bake,
 * so both show what actually deploys.
 *
 * The key keeps its original `meteorologist-canary-tree` name: it is a
 * published cross-surface contract (`ARCHITECTURE.md` "Arborist ↔ Meteorologist
 * canary contract") and renaming it would strand every operator's current
 * selection to buy nothing. The NAME is historical; the meaning is "the canary".
 *
 * Payload: `{ species, variantId, lookId }` — per-operator UI state. ⛔ Not
 * authored, not per-Look, never baked. It must never reach a published surface:
 * a marketing embed that quietly changed because an operator clicked something
 * in this browser would be a per-viewer surprise with no way to explain itself.
 */
export const CANARY_KEY = 'meteorologist-canary-tree'

export function readCanaryTree() {
  if (typeof localStorage === 'undefined') return null
  try { return JSON.parse(localStorage.getItem(CANARY_KEY) ?? 'null') }
  catch { return null }
}

/**
 * ⚠ THE SAME-TAB DISPATCH IS LOAD-BEARING. Browsers do not fire `storage` in
 * the tab that wrote it, so a writer that only calls setItem updates every tab
 * EXCEPT its own. That was survivable while the only viewer lived in another
 * tab (Meteorologist); it stops being survivable the moment a viewer shares a
 * tab with the picker, which the Arborist's full monte does. Writing through
 * here is what makes "click it, see it" work in the same window.
 */
export function writeCanaryTree({ species, variantId, lookId }) {
  const value = JSON.stringify({
    species,
    variantId: Number(variantId),
    lookId: lookId || null,
  })
  localStorage.setItem(CANARY_KEY, value)
  window.dispatchEvent(new StorageEvent('storage', { key: CANARY_KEY, newValue: value }))
  return value
}

/** Live read: the current canary, re-rendering when any tab (or this one) sets it. */
export function useCanaryTree() {
  const [pref, setPref] = useState(readCanaryTree)
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== CANARY_KEY) return
      setPref(readCanaryTree())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  return pref
}
