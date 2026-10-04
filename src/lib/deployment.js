/**
 * DEPLOYMENT — what each surface ships of a town: the one authority, authored in Preview, frozen into the manifest.
 *
 * Owns: the shape of `cartograph/data/<map>/deployment.json` and how a surface's policy is read from it. Stage authors
 * the creative layer (the Look); Preview authors THIS layer, per surface: "when I click Phone hi, I can adjust the
 * relevant controls, and where I leave them is where they bake" (Jacob, 2026-10-04). The bake's manifest step copies it
 * into `manifest.deployment`, so the Ward reads the same policy Preview edited (qualityProfile.js#surfaceQuality, the
 * one function both apply it through). Must never: be written by an inspection toggle (Preview's `preview.layers.v3`),
 * or carry creative intent (that is the Look's), or change what a bake PRODUCES (v1 is runtime switches only).
 *
 * Shape: { surfaces: { desktop: { postFxOff: [pass ids] }, "phone-hi": {…}, "phone-lo": {…} } }
 * A surface with no entry ships everything (the kit's default-on doctrine). A town with no file is `{ authored: false }`
 * in its manifest, and every surface ships everything: said, never guessed.
 * ▶ node checks/claims-deployment-has-one-authority.mjs
 */

export const SURFACES = ['desktop', 'phone-hi', 'phone-lo']

// ⭐ Jacob, 2026-10-04: nothing at runtime tells a capable phone from the floor, so EVERY phone gets phone-lo's policy
// (the Galaxy A54, the floor we guarantee) until a phone can be told apart. phone-hi stays authorable in Preview.
export const RUNTIME_PHONE_SURFACE = 'phone-lo'

const KEYS = ['postFxOff']

/** The file's content, checked. Throws on a shape it does not know: a misspelt key would ship silently. */
export function readDeployment(raw, where = 'deployment.json') {
  if (!raw || typeof raw !== 'object' || !raw.surfaces || typeof raw.surfaces !== 'object') {
    throw new Error(`[deployment] ⛔ ${where}: expected { surfaces: { … } }`)
  }
  for (const [surface, policy] of Object.entries(raw.surfaces)) {
    if (!SURFACES.includes(surface)) throw new Error(`[deployment] ⛔ ${where}: "${surface}" is no surface (${SURFACES.join(', ')})`)
    for (const k of Object.keys(policy || {})) if (!KEYS.includes(k)) throw new Error(`[deployment] ⛔ ${where}: ${surface}.${k} is no deployment key (${KEYS.join(', ')})`)
    if (policy?.postFxOff !== undefined && !(Array.isArray(policy.postFxOff) && policy.postFxOff.every((x) => typeof x === 'string'))) {
      throw new Error(`[deployment] ⛔ ${where}: ${surface}.postFxOff must be a list of pass ids`)
    }
  }
  return { authored: true, surfaces: raw.surfaces }
}

/** One surface's policy from a manifest's `deployment` (or Preview's live copy of the file). Absent keys ship. */
export function surfacePolicy(deployment, surface) {
  if (!deployment || typeof deployment !== 'object') {
    throw new Error(`[deployment] ⛔ no deployment record (got ${deployment}): a manifest always carries one, { authored: false } when the town has none`)
  }
  if (!SURFACES.includes(surface)) throw new Error(`[deployment] ⛔ "${surface}" is no surface (${SURFACES.join(', ')})`)
  const p = deployment.authored ? deployment.surfaces?.[surface] : null
  return { postFxOff: p?.postFxOff ?? [] }
}
