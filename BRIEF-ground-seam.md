# BRIEF — the ground seam: trunks, lamps, contact shadow

**One job: an upright object should meet the ground correctly.** Trunks and lamp posts both.

⛔ **DO THIS AFTER THE TREES ARE PLACED CORRECTLY** (`BRIEF-arborist-join-and-budget.md` §0a).
A seam tuned against impostors is wrong for mesh trees — an impostor's bark is a single rear
card with no trunk at the base.

---

## THE SPEC (Jacob, 2026-08-24)

**Contact darkens · pool brightens · ground albedo does neither.**

- **G = contact shadow.** Ambient occlusion where any upright object meets the ground —
  **trunks and lamp posts alike**. Always darkens. **Present at every hour**; it is occlusion,
  not a shadow the lamp's light casts, so it does **not** fade with the lamp.
  ⭐ **The occlusion disc is VERY SMALL.**
- **R = lamp pool.** The light a lamp casts on the ground. Brightens. Rides the lamp TOD curve,
  so ~0 by day. ⭐ **The glow is VERY LARGE.**
- The lamp's ground profile is therefore one radial gradient: **dark → bright → 0**.
- The seam on the trunk must be **equal to or darker than the trunk**, and **soft** — an AO
  effect, never a band.

---

## THE DEFECT

`treeAtlasMaterial.js` (trunk-base block):
```glsl
diffuseColor.rgb = mix(diffuseColor.rgb, gcol, baseF);   // lerp toward ground ALBEDO
```
Bark is dark; grass and pavement are brighter. **A lerp toward a brighter colour can only
lighten the trunk base — at any value of `blend`.** Wrong operator, not a wrong number.

⛔ **Do not fix it by lowering `blend`.** That hides a wrong operator behind a small number and
will be wrong again on the next town.

**The fix:** apply the ground's *shadow*, never its *albedo*. Keep G darkening for both
objects; keep R brightening on the lamp curve; drop or clamp the albedo term so it can never
raise the value.

---

## ORIGIN — not a regression

The blend was **dormant on the map** and the 2026-08-24 land-use pour switched it on.
▶ `node -e "const {execSync}=require('child_process');const o=JSON.parse(execSync('git show 29955e46~1:public/baked/lafayette-square/ground.json'));console.log(JSON.stringify({colormap:o.colormap,poolmap:o.poolmap}))"`
→ `{}` — no `colormap`, no `poolmap`. `BakedGround.jsx:166` reads `manifest.colormap || null`,
so no texture loaded and `uHasGroundColor` stayed 0. The bake produced both maps, so it is now
live on map defaults nobody has eye-tested (`blend 0.55`, `blendTop 1.5 m`, `shadowStr 0.5`).
The fix Jacob remembers was real — it was tuned on the **Diorama** (`0.8 / 0.75 / 0.95`), which
supplies its own ground textures.

---

## ⛔ RULED OUT BY MEASUREMENT — do not re-chase

- **"the AO term isn't reaching the blend"** — 0 of 5127 trees fall outside the poolmap or
  colormap extents. The `gcol *= (1.0 - gfx.g * uTrunkShadowStr)` multiply runs for every tree.
- **"the band has a hard edge"** — the falloff is already
  `smoothstep(uTrunkBlendTop, 0.0, vLocalY)`. Soft by construction. It reads as a band because
  the **value inverts**, not because the shape has an edge.

---

## THE CHECKS

1. **Trunk:** rendered trunk-base value **≤** trunk value above the band. Always.
2. **Lamp:** sample the baked FX map radially outward from a lamp — the profile must go
   **dark → bright → 0**, in that order, once. ⚠️ Only holds while **G's radius < R's**; if the
   occlusion disc grows past the pool the middle zone vanishes and the lamp reads as a dark blob.

Both are one-line assertions over baked data. Neither needs anyone to have seen the street.

---

**Dials, once the trees are right:** `?trunk=` (strength) · `?trunkTop=` (metres).
**Code:** `treeAtlasMaterial.js:356-378` (uniforms), `~:978-1000` (the blend),
`BakedGround.jsx:157,176` (map loading), `treeTrunkGround` / `setTrunkGround` (shared knob).
