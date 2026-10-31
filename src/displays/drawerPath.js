/**
 * The paths a display's drawer may use, ONE rule for the bake (cartograph/bake-manifest.mjs) and the engine
 * (lightShow/engine.js#validateDisplay, #validateDrawer), so Stage refuses what the bake would (Zob, 2026-10-31: the bake
 * empties the drawer's dir and publishes every frame it names, so an unchecked path is destructive).
 *   drawerDir(drawer)   the drawer's dir, ONLY under `displays/<name>/…` of the town's content: never absolute, never
 *                        '..', never the content root (a drawer at 'looks.json' would empty the town's whole content).
 *   frameRel(frame)     a frame looks.json names: relative, inside the drawer's dir (no '..', not absolute, no '\').
 * Each throws by name. Pure; no fs.
 */
const SEG_OK = (s) => s && s !== '.' && s !== '..'

export function drawerDir(drawer, where = 'a display') {
  if (typeof drawer !== 'string' || !/^displays\/[^/]+\/(?:[^/]+\/)*[^/]+\.json$/.test(drawer) || !drawer.split('/').every(SEG_OK) || drawer.includes('\\'))
    throw new Error(`[displays] ⛔ ${where}: drawer "${drawer}" must be a looks .json under displays/<name>/ of the town's content (no '..', not absolute)`)
  return drawer.slice(0, drawer.lastIndexOf('/'))
}

export function frameRel(frame, where = 'a look') {
  if (typeof frame !== 'string' || !frame || frame.startsWith('/') || frame.includes('\\') || /^[a-z]+:/i.test(frame) || !frame.split('/').every(SEG_OK))
    throw new Error(`[displays] ⛔ ${where}: frame "${frame}" must be a path inside the drawer's own folder (no '..', not absolute)`)
  return frame
}
