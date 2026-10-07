/**
 * treeGeometry — does a tree placement draw THROUGH THE ATLAS (a model tree, or a legacy layer
 * card), or as a hero impostor that needs no atlas at all?
 *
 * ⛔⛔ "THERE ARE NO MESHES UNLESS SPECIFIED IN THE ARBORIST, PERIOD." (Jacob, 2026-09-22;
 * arborist/ARCHITECTURE.md §Tree-render reality.) Every tree is a hero impostor unless its species
 * is on the Arborist's mesh bar (`meshTier`, stamped at bake) — the ability to draw model trees is
 * kept (Jacob, 2026-09-28), and only a model tree pays for the atlas.
 *
 * ONE rule, three readers: `InstancedTrees` (what it draws), `scripts/upload-baked-to-r2.mjs` (what
 * it publishes) and `scripts/verify-baked-in-r2.mjs` (what it expects in R2). So the upload can
 * never drop a file the runtime would ask for.
 */
import { rosterOf } from './treeRoster.js'

/**
 * The Arborist's decision for one placement. ⛔⛔ ASK THE SLAB WHETHER THE FIELD IS STAMPED — never
 * read absence as permission: `meshTierStamped` present ⇒ the boolean is real and the bar is
 * authoritative, zero included; absent ⇒ a pre-2026-09-03 slab, where only an explicit `false`
 * withheld geometry. (That `!==` once turned an authored zero into a silent maximum.)
 */
export function meshAllowed(trees, inst) {
  return trees?.meshTierStamped ? inst.meshTier === true : inst.meshTier !== false
}

/**
 * Whether ONE placement draws through the atlas. `foundation` = the hero-impostor foundation is on
 * (the slab carries hero impostors and the scene has not switched them off); without it every
 * placement takes the legacy path, which draws through the atlas (or is culled).
 */
export function drawsThroughAtlas({ foundation, heroRecords, trees, inst, renderSpecies }) {
  if (!foundation) return true
  return !heroRecords?.[renderSpecies] || meshAllowed(trees, inst)
}

/**
 * For a whole slab, from its parsed files: does anything draw through the atlas?
 * ⛔ Conservative on every unknown — no roster, an out-of-roster placement (the runtime substitutes
 * a species for it), no hero impostors — answers `needed: true`, because publishing too much is
 * weight and publishing too little is a 404 on a visitor's screen.
 */
export function slabTreeGeometry({ trees, atlasManifest, scene, look }) {
  if (!Array.isArray(trees?.instances)) return { needed: true, count: 0, why: 'the slab has no readable trees.json' }
  const inst = trees.instances
  if (!inst.length) return { needed: false, count: 0, why: 'no tree placements' }
  const heroRecords = atlasManifest?.heroImpostorBySpecies || null
  const foundation = !!heroRecords && scene?.heroImpostor !== false
  if (!foundation) return { needed: true, count: inst.length, why: heroRecords ? 'the scene switches hero impostors off' : 'no hero impostors are baked' }
  let roster
  try { roster = rosterOf(atlasManifest, look) } catch { return { needed: true, count: inst.length, why: 'the atlas carries no roster' } }
  let count = 0
  for (const i of inst) {
    const inRoster = roster.has(`${i.species}:${i.variantId}`)
    if (!inRoster || drawsThroughAtlas({ foundation, heroRecords, trees, inst: i, renderSpecies: i.species })) count++
  }
  return count
    ? { needed: true, count, why: `${count} placement(s) draw as model trees or have no hero impostor` }
    : { needed: false, count: 0, why: 'every placement is a hero impostor' }
}

/** The files only atlas-drawn trees fetch: the model GLBs and the atlas PNGs. Keys as `/…/baked/<look>/<rel>`. */
export const ATLAS_ONLY_FILE = (p) => /\/baked\/[^/]+\/trees\/[^/]+\/[^/]+\.glb$/.test(p) || /\/baked\/[^/]+\/trees-atlas-[^/]*\.png$/.test(p)

/**
 * A placement's LOD urls, by trees.json's FORMAT (arborist/treesFormat.mjs; SLAB-CONTRACT.md §8): format 2 keeps them
 * once per variant (`variants[species:variantId].lods`), format 1 (absent `format`) on every placement. ⛔ An unknown
 * format throws: a census this kit cannot read must never draw as something else.
 */
export function lodsOf(trees, inst) {
  const format = trees?.format ?? 1
  if (format === 1) return inst?.lods ?? null
  if (format === 2) return trees.variants?.[`${inst.species}:${inst.variantId}`]?.lods ?? null
  throw new Error(`[treeGeometry] ⛔ trees.json format ${format} is newer than this kit reads (1–2) — update the kit before the slab`)
}
