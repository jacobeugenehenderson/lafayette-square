# BACKLOG text, resolved 2026-10-28: an inland town's player asks for no revetment

Moved from `cartograph/BACKLOG.md`, verbatim, when the revetment loader came to ask the town's manifest first
(`src/lib/revetmentFromSlab.js#loadRevetment`, used by `SlabRevetment.jsx` and the lab's stage list).
▶ `node checks/claims-a-missing-revetment-is-not-a-shoreless-town.mjs`

**⛔ AN INLAND TOWN'S PLAYER ASKS FOR A REVETMENT IT NEVER HAS (Ward, measured 2026-10-29 03:44Z on hipointedemun.online, new player):**
`[revetment] hipointedemun: FAILED to load revetment.json — [slabNames] manifest names no "revetment.json"`. No HPDM manifest names it and
no inland bake writes it; ec6f20c2 (d) gated SlabRevetment's water LEVEL, not its LOADER. Fix: the loader asks only for what the manifest
names (an inland town draws no revetment and says nothing). A false ⛔ on every live load; small; cause beyond that not established.
