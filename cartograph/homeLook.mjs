// homeLook.mjs — A TOWN'S DECLARED HOME LOOK, by value off its town record (src/instances/<town>.js `lookId`). The one rule the
// pour's caller (pourSteps.mjs, which hands it to pipeline.js as --home-look) and the checks read. ⛔ Never imported by the pour
// itself: the pour reads no town module (claims-the-bake-watches-its-code); it is handed the value.
//   undefined → no record: nothing is declared, the pour refuses by name (mintInputs.mjs#townBlockCustoms)
//   null      → a record with no lookId: the town declares none
//   '<id>'    → the Look the town declares
import { instanceForMap } from '../src/instances/registry.js'
export function homeLookOf(scene) { const rec = instanceForMap(scene); return rec ? (rec.lookId ?? null) : undefined }
