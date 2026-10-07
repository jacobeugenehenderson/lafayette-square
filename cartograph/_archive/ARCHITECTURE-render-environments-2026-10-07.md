# ARCHITECTURE §8 — retired 2026-10-07 (Strobe, the docs prune)

Retired for CURRENCY, not truth: what these sections said was once the code. Live home: `cartograph/ARCHITECTURE.md §8`.

- The 5-env table: every app now draws through `<Town>` (Stage, Preview, the LS player, the Ward).
- The pipeline table: Bloom moved BEFORE DoF (order 25, HANDOFF-real-dof Phase 1 / Loupe 2026-09-26) and the hero ladder (21) was added; the `platform` column was replaced by the quality profile's `postFxOff`.

---

### Render environments — the 5-env topology (often confused)
| Environment | Scene root | Neon | Live vs baked |
|---|---|---|---|
| Designer | `CartographApp` → `StageEnvironment` | `<LafayetteScene>` → `<NeonBands>` | live authored |
| Stage | same `StageEnvironment` | same + `forceNeonOn` | live authored |
| Preview | `PreviewApp` → `CanvasContents` | `<SceneNeon>` via `<LafayetteScene>` | **slab `SlabBuildings`** by default (= production); A/B back to live |
| LS production | `Scene.jsx` → `SlabBuildings` + `LafayetteScene hiddenLayers={{building}}` | `<SceneNeon>`, gated by open-by-hours | **slab `buildings.json` v2** + `scene.json.neon` |

**Preview is not a separate render path** — it renders exactly what production renders (slab buildings + foundations + neon off the slab index), plus profiler/phone-frame/layer-toggle bolt-ons. `BakedBuildings` is deleted; `SlabBuildings` is the single production+Preview consumer (L1.3, 2026-05-26). Stage keeps the live `LafayetteScene` mount (authoring needs live retint) and is the only neon-shape source the others mirror.


---

- **The manifest** (`renderPipeline.jsx` → `POSTFX_PIPELINE`) is the machine SSoT of *what ships*: an ordered list, each entry `{id, pass, channel, order, platform, gate, props}`. It is the literal ship list — reading it tells you the whole post-FX stack.

  | order | id | pass | channel | platform |
  |---|---|---|---|---|
  | 10 | ao | N8AO | ao | desktop |
  | 20 | pyramid | DownsamplePyramid | (shared resource) | desktop |
  | 30 | dof | RomanceDoF | dof | desktop |
  | 40 | bloom | CustomBloom | bloom | desktop |
  | 50 | aerial | AerialPerspective | halo | desktop |
  | 60 | grade | FilmGrade | grade | (all) |
  | 70 | smaa | SMAA | smaa | (all) |
  | 80 | grain | FilmGrain | grain | (all) |


---

- **Mobile is a `platform` field, not a code fork.** The old `if (IS_MOBILE) return <minimal composer>` collapsed into the manifest (mobile currently *drops* ao/pyramid/dof/bloom/aerial). ⚠️ **Still stripped on mobile** — but now flipping "drop" → "low bracket" is a one-field edit, not a fork (the mobile-viability lever; gated on `preview-measurement`'s real device numbers).
