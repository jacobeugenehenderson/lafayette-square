# BRIEF — how we plant the trees (audit)

**You are a fresh agent.** Read `CLAUDE.md` (the gate), then `ORIENTATION.md`, then
`README.md §⭐ START HERE`, then the tree canon: `arborist/ARCHITECTURE.md`
§"Tree-render reality at LS", `arborist/FEATURES.md`, `SLAB-CONTRACT.md`.

⛔ **This is a READ.** Measure and report. Write no `src/`, run no pour, change no
authoring. If a fix is obvious, name it and its code site — do not make it.

---

## The operator's four symptoms, in his words (2026-09-03)

1. *"As the trees load in, there are seemingly different levels/kind of trees. I'm not
   sure it's meshes vs. impostors, but it almost seems like **more than one whole set
   loads in**."*
2. *"The canopy now is **so dense that we can't even see the trunks or buildings**.
   There's no way to even determine or confirm if all these trees are real. They look
   pretty good in plan view; in browse, **each tree there is supposed to correspond
   exactly to a tree in the hero shot** — the impostors are supposed to load into the
   same spot, viewable from the different views."*
3. *"If the density is correct, it seems possible we're still having some kind of
   **terrain or exaggeration multiplier** issue?"*
4. *"There was already a **scaling issue**; I don't know if it's truly fixed."*

Surface under test: https://jacobeugenehenderson.github.io/lafayette-square-staging/
(staging serves `assets.theward.online/staging/`; production is a DIFFERENT, older slab —
do not measure production and report it as this.)

---

## Measured before you start. ⛔ THESE ARE CLAIMS, NOT FACTS — confirm each in the code.

Re-derive, never quote:
`node -e "const t=require('./public/baked/lafayette-square/trees.json');console.log(t.heroTierMeta)"`

- `heroTier` (prominence classifier): **mesh 1296 · opaque 0 · impostor 0 · cull 3850**,
  with `promThreshold: 0` and `promOpaque: 0`.
- `heroRole` (band classifier): **mesh 335 · impostor 4811**.
- `heroBandMeta.trianglesSpent` **14,990,144** against `triangleBudget` **15,000,000** —
  pinned at the ceiling.
- Placements 5146 · 9 species · `scale` min 0.200 / p50 0.767 / max 1.000, 530 distinct.
- Every instance has **`y: 0`**.

⭐ **`y: 0` IS A SENTINEL, NOT A BUG.** The terrain lift is a live per-shot tween applied
in the SHADER (`project_one_tree_two_library_ids` era work, 2026-08-28). Do not open
symptom 3 by "discovering" that trees are at zero — that ground is trodden and the finding
is wrong. Start from `V_EXAG` and where the shader applies it.

---

## The questions, in priority order

**Q1 (symptom 1) — does more than one geometry set render for the same placement?**
Two classifiers disagree (1296 vs 335 mesh). Establish which field the runtime actually
reads for geometry — `InstancedTrees.jsx#lodForRole` and its callers, `HeroImpostorTrees.jsx`,
`OverheadTrees.jsx` — and whether a placement can be drawn by two of them at once, in the
same frame, in the same shot. ⭐ The comment at `InstancedTrees.jsx:582` says geometry is
chosen "by baked role (heroTier)" while the instances carry BOTH `heroTier` and `heroRole`;
one of those is wrong and finding out which is the job.

**Q2 (symptom 1/2) — is `promThreshold: 0` correct, and is it the operator's `meshTopN: 0`?**
`design.json#/groveThreshold.meshTopN` was set 5 → 0 by the operator, meaning "no species
held back as mesh — all impostors." The slab came out with 1296 mesh and 0 impostor tier.
Trace `meshTopN` → `promThreshold` → `classifyHeroTiers`. ⛔ **Q: does 0 mean "no meshes"
or "threshold zero, so everything is a mesh"?** If the operator's gesture inverts, that is
the finding, and it is a one-line answer with a code site.

**Q3 (symptom 2) — verify the browse↔hero correspondence the operator states.**
"Each tree in browse corresponds exactly to a tree in the hero shot." Test it: same
placement id, same x/z, same species, in both paths. Report any placement drawn in one and
not the other, and any drawn TWICE.

**Q4 (symptom 3) — the exaggeration multiplier.** `V_EXAG` is doctrine (=1.5,
`project_terrain_doctrine_2026_05_14`). Establish where it is applied to tree Y, whether it
is applied ONCE, and whether the ground and the trees agree. A tree lifted by a different
factor than the ground it stands on is the shape of this symptom.

**Q5 (symptom 4) — scaling.** `scale` spans 0.200–1.000. Establish what that number MEANS
(a multiplier on what?), where the size band comes from
(`node scratch/claims-every-placed-asset-has-a-size-band.mjs`), and whether the rendered
metre height matches the dossier band for a sample of species. ⛔ Note the check currently
FAILS on hipointe/staging/toy but PASSES on lafayette-square — do not report those other
towns' failures as this town's.

---

## Rules (`CLAUDE.md` Layer 0 — you will be judged on these)

- ⛔ **This is a KIT.** Every finding must say what it means for a town nobody has looked
  at. An LS-only observation is not a finding.
- ⛔ **The override IS the product.** `meshTopN`, `blockCustoms`, the roster — these are
  the operator AUTHORING. Load the scene's authored state before measuring, and never
  report an authoring gesture as a defect. ⭐ But Q2 asks whether a gesture INVERTS, which
  is a real bug — say which you found.
- ⛔ **No fallbacks.** If a mechanism is not measured, write **"cause not established"**
  and stop. Do not write the explanation of a number.
- ⛔ **A difference between blocks/trees is not, by itself, evidence of a bug.**
- ⭐ **Reuse forensics.** `scratch/` holds 80 `claims-*` checks. Run the relevant ones
  before building anything: `claims-every-shadowed-placement-renders`,
  `claims-the-roster-light-tells-the-truth`, `claims-every-placed-asset-has-a-size-band`,
  `claims-the-capture-frame-is-the-clip-frame`. ⚠️ Several are RED for reasons unrelated to
  this brief (stale slabs on other towns, two orphan manifest records on LS) — read their
  output, do not assume the red is yours.

## Deliverable

One report: per question, the NUMBER, the CODE SITE, and either the mechanism (measured) or
"cause not established". Rank by what the operator would see fixed first. ⛔ No new document
unless asked — put it in the reply.
