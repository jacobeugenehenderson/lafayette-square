// THE BARK UV CONTRACT — read by the encoder (arborist/bake-look.js#encodeBarkUVs) and the
// decoder (src/components/treeAtlasMaterial.js#barkWrapSample). One definition, two readers.
//
// A baked bark UV names its own atlas tile: u = BARK_UV_STRIDE · (tile + 1) + the vendor's own
// tiling u (shifted by a whole number to start at 0, which leaves the wrap unchanged); v is the
// vendor's v, untouched. The shader recovers the tile from floor(u / STRIDE), wraps inside that
// tile's rect, and samples with the unwrapped uv's gradients.
//
// STRIDE bounds how many repeats one bark primitive may span across u; the encoder throws past it.
// Small keeps float32 precise (u tops out near STRIDE · (TILE_MAX + 1)).
export const BARK_UV_STRIDE = 16
export const BARK_TILE_MAX = 32
