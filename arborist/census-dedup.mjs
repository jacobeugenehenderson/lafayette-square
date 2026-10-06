// census-dedup.mjs — when two tree records are ONE trunk. Shared by the bake's cross-well dedup (arborist/bake-trees.js
// readCensus) and the fetch's supersession rule (cartograph/fetch-trees.mjs), so "the same tree" means one distance in
// both places, never two copies of a number.
export const DEDUP_M = 3   // same trunk if within this (matches scripts/14's OSM↔city dedup)
