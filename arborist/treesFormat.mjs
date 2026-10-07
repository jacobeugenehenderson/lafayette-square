/**
 * trees.json's FORMAT — the one place that packs a census for the slab (arborist/bake-trees.js) and the one rule the
 * runtime reads it by (src/lib/treeGeometry.js#lodsOf). SLAB-CONTRACT.md §8.
 *
 * FORMAT 2 (2026-10-07, Strobe; cleared by Boz): the same data the runtime reads, ~6× smaller (huron 27.8 → ~4.4 MB).
 * Measured: 84% of the old file was weight nothing reads —
 *   - pretty-printed (9.7 MB of whitespace on huron) → written minified;
 *   - `tiles.instancesByTile`, a FULL SECOND COPY of every placement (9.06 MB; the runtime read only cols/rows, for a
 *     log, and its per-tile split was retired) → `tiles` dropped;
 *   - `sizeFrom`, `inHood` per placement: read by nothing downstream (bake-trees counts them in memory, before this);
 *   - `lods` per placement (3.88 MB), identical for every placement of a variant → one table, `variants[key].lods`,
 *     key = `${species}:${variantId}`.
 * A reader tells the formats apart by `format` (absent = 1), never by a missing field.
 */
export const TREES_FORMAT = 2

/** Pack a bake's in-memory census (format-1 shape) as format 2. Throws if a variant's LODs disagree across placements. */
export function packTrees(out) {
  const variants = {}
  const instances = out.instances.map(({ lods, sizeFrom, inHood, ...rest }) => {
    if (lods) {
      const key = `${rest.species}:${rest.variantId}`
      const prev = variants[key]
      if (prev && JSON.stringify(prev.lods) !== JSON.stringify(lods)) {
        throw new Error(`[treesFormat] ⛔ variant ${key} carries different LODs on two placements — the per-variant table cannot hold it`)
      }
      variants[key] = { lods }
    }
    return rest
  })
  const { tiles, instances: _drop, ...head } = out
  return { format: TREES_FORMAT, ...head, variants, instances }
}
