# The hero-band — retired 2026-09-28

Diary. Moved verbatim from the live arborist docs when `arborist/hero-band.mjs`, the bake's `heroRole`/`panDist`
and `?meshLod=auto` were removed (Jacob, 2026-09-28, via Boz: *"retire the hero-band"*; ruling of 2026-09-22:
*"there are no meshes unless specified in the Arborist, period"*). Live state: `arborist/ARCHITECTURE.md`
§Tree-render reality and `src/lib/treeGeometry.js`. Retired for currency, not truth.


## From `arborist/BACKLOG.md`

### ✅ SETTLED 2026-08-27 — the counts, and the budget arithmetic

**FOUR fields, three meanings, ONE authority.** They read alike; they answer different questions.
▶ `node -e "const I=require('./public/baked/lafayette-square/trees.json').instances;const f={};for(const i of I)for(const k of ['meshTier','heroTier','heroRole'])if(i[k]!==undefined)f[k+'='+i[k]]=(f[k+'='+i[k]]||0)+1;console.log(f)"`

| field | LS | what it is | authority |
|---|---|---|---|
| `meshTier` | 2,282 true | **species**-level operator eligibility, from the Grove bar (`b.tier==='mesh'`) | not a render decision |
| `heroTier` | 114 mesh / 5,013 cull | the Phase-A classifier | **QC tint only** (`aHeroTier`) |
| `heroRole` | **399 mesh / 4,728 impostor** | the geometry budget | ⭐ **the one the runtime obeys** (`InstancedTrees.jsx:859`) |

⛔ **AND THE BUDGET RECONCILES EXACTLY — I claimed otherwise and was wrong.**
Σ lod1 triangles of the 399 = **14,979,130** = `trianglesSpent`, to the triangle. The error was
assuming the runtime draws each instance's `url` (lod2); `InstancedTrees#lodForRole` overrides it
to **lod1** for mesh role, so weighing lod1 is correct.
▶ `node scratch/hero-band-reconcile.mjs`

### ⭐⭐ AND THE MEASUREMENT FOUND THE LEVER

Same 399 placements, both ladders:
```
Σ lod1   14,979,130   ← charged AND drawn
Σ lod2      878,524   ← 17× cheaper
```
**`lodForRole = (_inst) => 'lod1'`** (`InstancedTrees.jsx:770`) takes the instance and throws it
away. Every placement already carries **`panDist`**, baked — its distance to the authored hero pan.
⇒ A distance-graded LOD is **already plumbed and unused**, and grading by `panDist` is role-at-bake
(a baked distance, not a live camera), so it is on the sanctioned side of the LOD line.

⚠️ **The same 15M budget would afford roughly 17× more mesh trees** if the far half of the band drew
lod2. ⛔ NOT a licence to change the constant — what lod2 looks like at band distance is an eye
question, and the 2026-06-24 regression (lod1 decimated to specks) is what that mistake looks like.

⭐ **This does NOT displace Jacob's proposal — it is the geometry half of the same idea.** His is the
shading half. Triangles are a *vertex*-cost proxy; the cost that hurts at distance is fragments and
overdraw, which alpha-tested leaf cards make worse by defeating early-Z (`opaqueCanopyMaterial`'s
own comment). **Whether the budget's currency should be fragments rather than triangles is still
open, and still question 2.**


## From `arborist/FEATURES.md`

⭐ **THE HERO GEOMETRY BUDGET is an operator knob, and it is measured in TRIANGLES.**
`bake-trees.js` takes `heroTriangleBudget` (default 15e6) and `heroBandMaxM` (default 250m):
who keeps real mesh in the hero shot is decided AT BAKE by distance to the authored camera
path, spending that budget nearest-first. LS: 2323 mesh / ~86M tris → **403 mesh / 15.0M
tris**, cutoff 181m. ⛔ A COUNT budget lets one heavy species eat the frame — trunk diameter,
the old axis, predicts neither cost nor visibility.
▶ `node -e "console.log(require('./public/baked/lafayette-square/trees.json').heroBandMeta)"`


## From `arborist/ORIENTATION.md`

The **geometry budget** (2026-08-24): who keeps mesh in the hero shot is decided at BAKE by
distance to the authored camera path, spending a **triangle** budget — not a tree count, not
trunk diameter, which predicts neither cost nor visibility (`arborist/hero-band.mjs`;
`role-at-bake` preserved, so no pop).


## From `arborist/ORIENTATION.md`

▶ `node -e "const t=require('./public/baked/lafayette-square/trees.json');console.log(t.heroBandMeta)"`


## From `arborist/LEDGER-exorcism-wren.md`

The verdict here — *"wire it to geometry weight"* — is now real: `arborist/hero-band.mjs`
spends a **TRIANGLE budget** (`heroTriangleBudget`, `heroBandMaxM`) down a list sorted by
distance to the authored camera path. Measured on LS: 2323 mesh / ~86M tris → **403 mesh /
15.0M tris**, cutoff 181m. A count budget lets one heavy species eat the frame; this cannot.
◻ **Still owed: the BAR ITSELF is not bound to that budget** — it remains UI + persistence
read by nothing. It now has something true to read, which it never had before.


---

## Also retired 2026-09-28 — the Grove shot its impostors from lod1

Excised from `ORIENTATION.md §4`, where it was listed as a consequence "mistaken for a defect":

> 2. **The Grove reads two artifacts at two densities inside one surface** — you judge lod0
>    from the pool while the captures that ship are made from lod1 out of the bake.

It was a defect. lod1 crushes the bark to a few thousand triangles and cuts connected leaves to
20% while keeping the cards, so every shipped impostor photographed leaves floating off twigs
that were gone (oak_white median leaf→wood 0.07 m at lod0, 0.61 m at lod1). With every tree an
impostor there is no size reason to shoot the thin tier. Both Grove readers now take baked lod0.
