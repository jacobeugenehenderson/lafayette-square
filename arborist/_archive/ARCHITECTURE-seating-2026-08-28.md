# arborist/ARCHITECTURE — the seating incident record (2026-08-28), excised 2026-09-25

> Retired for CURRENCY. Live: arborist/ARCHITECTURE.md "SEATING: ONE ANCHOR PER TREE, LIFTED IN THE SHADER".

> ### ⛔⛔ SEATING: THE LIFT IS THE SHADER'S JOB, OFF A LIVE UNIFORM *(2026-08-28, Jacob's eye twice)*
> **1. `y: 0` in the slab is a SENTINEL, not sea level.** Every placement carries it. The impostor
> consumers read `typeof inst.y === 'number' ? inst.y : getElevationRaw(...)` — and `typeof 0` is
> `'number'`, so the lookup never ran and **4,867 hero cards sat under 2.6–34.8 m of terrain.** The
> mesh path survived only because it reads `groundRaw` and falls back on `undefined` — **a value the
> sentinel cannot counterfeit.** ⭐ That is the defence: fall back on something the sentinel can't fake.
> **2. THE EXAG IS AN ANIMATED PER-SHOT UNIFORM, NOT A CONSTANT.** `targetExag = street ? 1 : browse ?
> 0 : sceneExag()` — **Browse draws the ground FLAT.** A matrix-baked `raw × exag` is right in Hero and
> up to **52 m adrift in Browse**. ⇒ `treeGroundRaw()` returns RAW; `OVERHEAD_GROUND_LIFT` applies
> `aGroundRaw * uExag / _instYScale` in the vertex shader — the identical lift the mesh path has
> always used (`terrainShader.js:345`), which is why mesh trees ride the ground down and impostors did not.
> ⛔ **You cannot bake a tween.**
>
