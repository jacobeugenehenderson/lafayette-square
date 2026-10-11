// lattice.js — THE PARTITION'S GRID: ONE HOME. Every polygon of the ground (the ink, the curb, the bands, the land use,
// the shore) is cut by Clipper on an integer grid of CLIP_SCALE units per metre, so every vertex the partition makes sits
// on a 1/CLIP_SCALE m lattice. Anything that matches, welds, keys or snaps those vertices reads the lattice HERE.
// ⛔ Never a second literal: two copies of one grid are two grids the moment one is edited, and the seams between them are
//   the partition's own gaps (BRIEF-the-ground-knows-its-height; Boz, 2026-10-11). ▶ node checks/claims-the-lattice-has-one-home.mjs
export const CLIP_SCALE = 1000                // integer Clipper units per metre: a 1 mm grid
export const LATTICE_M = 1 / CLIP_SCALE       // the grid step in metres (=== 0.001)
// ⚠️ OPEN — OTHER GRIDS, NOT THIS ONE: derive.js (land use) and outer-coast.mjs / bake-terrain.js (coast, water flood) cut
//   on a 1 cm Clipper grid; smoothCenterline's junction keys are 1 cm; extractFaces keys nodes at 0.1 mm. Each is its own
//   grid at its own value, so none is a copy of this one — whether any should BE this one is not decided.
