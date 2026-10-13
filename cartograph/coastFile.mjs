/**
 * coastFile.mjs — the coast's artifact name, in a module with no other imports, so a reader of clean/coast.json
 * (the pour, the terrain, the outer coast, their checks) does not take bake-coast.mjs's lidar reader into its import
 * closure — and with it the network.
 */
export const COAST_FILE = 'coast.json'
