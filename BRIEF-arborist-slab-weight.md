# BRIEF — Arborist: what ships, why it's heavy, and whether slabs should share a tree library

**Agent: FRESH.** Name yourself — one word, your choice — and use it when you report back.

**You are a specialist on ONE question: why a poured neighborhood's slab is 85–88% trees, and what the right structure is.** You are producing an **audit and a design recommendation**. **No production code, no re-bake** until §7's gate is satisfied.

---

## 1. ROUTE FIRST — a hard gate, not advice

`CLAUDE.md` at repo root is a mandatory routing gate. Then, in order:

1. **`ORIENTATION.md`** (root) — universal first read.
2. **`README.md §⭐ START HERE`** + its cross-cutting feature index.
3. **The arborist quartet**: `arborist/{FEATURES,ARCHITECTURE,BACKLOG,NOTES}.md`. **`BACKLOG.md`'s dated arc "2026-07-21 — SLAB WEIGHT" is this brief's finding, already logged** — start there.
4. **`SLAB-CONTRACT.md`** — the cartograph↔LS boundary. Load-bearing for §4's decision.

**Rebuilding the model from grep + first principles when the canon already spells it out is this repo's named recurring failure.** Cite what you read, by section.

⚠️ **Two dated walls you must read before proposing anything about tree file size.** Both are real, both were fought, and re-proposing what they rule out wastes the pass:
- `arborist/BACKLOG.md` **"2026-06-23 (EOD) — ⛔ THE WALL: trees are 16MB, decimation floors."**
- `[[project_meshopt_attribute_topology_floor]]` — there is a floor below which meshopt cannot compress these without destroying leaf topology.

**If your recommendation is "decimate harder," you must first say why those walls don't bind.**

---

## 2. THE MEASURED FINDING (2026-07-21, verified — re-verify before building on it)

**A poured neighborhood is not big. Its trees are.**

| scene | tracked | trees | share |
|---|---|---|---|
| centrum (2,954 buildings — most in repo) | 35 MB | none baked | — |
| altadena | 117 MB | none (terrain-heavy) | — |
| lafayette-square | 147 MB | 126 MB | **85%** |
| hipointe-demun | 307 MB | 269 MB | **88%** |

Buildings + ground + lamps + shape + scene run **20–35 MB** per scene. Everything above that is trees.

**The duplication is concentrated in ten species present in ALL THREE tree-bearing scenes** — `ash_green · birch · blackgum · linden_american · maple_red · maple_silver · maple_sugar · oak_bur · oak_white · platanus_acerifolia`:

- shipped across the three scenes: **305 MB**
- unique content among them: **128 MB**
- **wasted to duplication: 177 MB**

`public/baked/` overall is 818 MB tracked, 611 MB unique — **207 MB (25%) duplicated**, and the ten species above are most of it.

**Why it duplicates:** `src/components/InstancedTrees.jsx:780` rewrites every tree URL unconditionally to `${BASE_URL}baked/${lookName}${url}`, with **no fallback** to the shared `public/trees/` library. Every slab must therefore carry its own copy. *(All the "missing" per-look GLBs resolve fine against the shared library — the assets exist; only the per-look copies are incomplete.)*

**Context:** tracked `public/` is ~985 MB against GitHub Pages' **1 GB soft limit**, so this is live, not theoretical.

---

## 3. THE AUDIT (deliverable 1)

**3a. What actually ships, and is it what should?** Per scene: species with shipped GLBs vs species actually placed vs what renders. Known starting points — LS ships 10 species / 45 GLBs but places 22; HPDM ships 17 / 78 and places 22; **`garden_mix` ships in HPDM and is never placed.** Explain the roster→bake→ship path and where the set is decided.

**3b. Why is one tree 12–26 MB?** `picea_abies/skeleton-1-lod0.glb` is 26 MB; `pseudotsuga_menziesii` 19 MB; `abies_concolor` 14 MB; `linden_american` 12.7 MB. Yet `platanus_acerifolia` ships **twelve** files totalling under 4 MB. **That spread is the most interesting number in this brief** — same pipeline, 100× the per-file size. Find out why. *(Note conifers dominate the heavy end.)*

**3c. ⛔ BUG — `linden_american` skeleton variants are byte-identical.** `skeleton-1/2/3` are three names for one file, across all three scenes and all three LODs (9 species/LOD groups). 15 other groups vary correctly, so this is linden-specific, not systemic. **Treat it as a visual-variety defect first, size second** — every American linden in three towns is the same tree while the roster believes there are three. Diagnose the variant generation; ~100 MB is a side-effect of the fix.

**3d. The LOD ladder.** Per species: 3 skeletons × 3 LODs = 9 files. `lod2` is ~150 KB while `lod0` is 12.7 MB — a 85× step. Is the ladder right? Is `lod0` ever actually loaded at the distances trees are seen? *(Cross-check `[[project_tree_lod_role_at_bake_not_distance]]` — role at bake, never a live distance swap.)*

**3e. KTX2/Basis is absent entirely.** 97 MB of uncompressed atlas PNG across scenes (HPDM alone 73 MB). No `.ktx2`/`.basis` files, no `KTX2Loader` anywhere. Already scoped at `HANDOFF-hero-impostor-and-startup-weight.md:58` — *"27.6 MB → ~5 MB, smaller on wire AND in VRAM."* Say what it costs to land and what it breaks.

**3f. Does METEOROLOGIST duplicate the same way?** `public/clouds` is 19 MB tracked and **nobody has looked.** Same question: per-scene copies of shared assets? Report it even if the answer is no.

**3g. The 17.9%.** 1,850 HPDM placements request GLBs absent under the look (`betula_pendula` 725, `magnolia_sp` 438, `acer_saccharum_multistem` 261, `nyssa_sylvatica` 152, `tilia_americana` 141, `acer_saccharum` 133). Cause looks like ordering — `trees.json` Jul 17 00:25 vs atlas/GLB dirs Jul 16 13:22. Confirm, and say whether a re-bake alone fixes it or whether the ordering can recur.

---

## 4. THE DESIGN QUESTION (deliverable 2) — shared library vs self-contained slab

Jacob, 2026-07-21: *"I am wondering if we shouldn't move the tree builder and meteorologist to the git and then everybody links to them? I bet 10 of those trees are repeated in every slab."* **He was right about the ten.**

⚠️ **This is a genuine architectural tension. Do not resolve it by picking the smaller number.** The constraint on the other side is doctrine:

- `[[project_slab_is_the_instance_identity]]` — the slab IS the instance
- `[[project_slab_carries_full_authored_product]]` — authored-but-not-baked is a slab gap
- `SLAB-CONTRACT.md` — the formal boundary, owned by neither app

A self-contained slab deploys as one unit and can be handed to someone with no shared dependency. A shared library cuts ~177 MB and couples every slab to it. **There is also a middle — shared for the common ten, per-slab for scene-specific — which may be the right answer or the worst of both.**

**Deliver: the options, what each costs, what each breaks, and a recommendation with the tradeoff stated plainly.** Include what happens to a slab handed to a third party, and to versioning when a shared tree is re-baked under a slab that was authored against the old one.

**Prior art, before you design** (`feedback: we could have looked at how everybody else does it`): glTF external/referenced buffers, Draco vs meshopt vs KTX2, how asset CDNs and game engines handle shared-vs-bundled libraries, and how other web 3D products version shared assets.

---

## 5. ⛔ SEALED — read only after §§3–4 are drafted

Our existing answers, held back so you form an independent view first: `arborist/ARCHITECTURE.md` on the bake/publish loop · `arborist/bake-look.js` (what it writes per look) · `arborist/bake-trees.js` (`HERO_TIER`, tier classification) · `src/components/InstancedTrees.jsx` (the consumer, incl. `:780`) · `HANDOFF-hero-impostor-and-startup-weight.md` · `HANDOFF-density-impostor-swap.md`.

Then reconcile: where does what we built match your conclusion, where does it diverge, and where is our answer better than the standard one?

---

## 6. OPEN QUESTIONS — surface, do not answer

Product decisions belonging to Jacob:

1. **Is a slab a self-contained deliverable, or may it depend on a shared library?** §4 hangs on this and it is his call, not an engineering optimum.
2. **Does every town get the same ten street trees?** If the common ten are common because they're genuinely the right species for these towns, that is a content fact worth knowing; if it's roster inertia, that's different work.
3. **What is the actual size target?** 985 MB against a 1 GB soft limit is the live constraint, but "under the limit" and "light on a phone" are different goals with different answers.

---

## 7. Boundaries and the gate

**Write exactly one file: `ARBORIST-SLAB-WEIGHT.md` at repo root.** Commit only that. Throwaway analysis scripts go in `scratch/` (prefix them with your name — another agent, Marl, is working `scratch/` on the Extent excavation; do not touch their files).

⛔ **Do not re-bake.** A bake rewrites `public/baked/**` and is not reversible from the working tree. Several findings above depend on the *current* artifacts as evidence.
⛔ **Do not modify source, canon, or other briefs.** Report errors as findings.
⛔ **Confirm alignment before proposing implementation**, and wait for Jacob's explicit go-ahead (`CLAUDE.md` §"Standup before code").

**Finally: say what in this brief you think is wrong.** It was written by a coordinator who, on the day it was written, was corrected four times on a different subsystem — each time for inferring a mechanism from code and reasoning forward without checking. The measurements in §2 are verified; the framing around them may not be. **Disagreement is more useful than agreement.**
