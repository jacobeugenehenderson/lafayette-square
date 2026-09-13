# BRIEF — three poured towns have no committed inputs, and `.gitignore` is why

**Status:** DRAFT, dispatch-ready. Fresh-agent brief. Boz drafted 2026-09-13; **Jacob dispatches.**

> ⛔ **ROUTE FIRST (CLAUDE.md gate).** `ORIENTATION.md` → `README §⭐ START HERE` (the **Extent / intake** and **Building membership** rows) → **`cartograph/INTAKE.md §0.5`** + **`EXTENT-DESIGN §4`** (why `identity-registry.json` is a curated artifact, not output). Then read **`.gitignore` lines 78–140** and the **KIT POLICY (2026-07-18)** comment inside it — it records a previous version of this exact trap.
>
> ⛔ **`docs/agents/AGENT-VALIDATION-SURFACES.md`** before you validate anything.

---

## Who you are + the bounds

You are a fresh specialist landing **one** change: make `cartograph/data/<scene>/` tracking **scene-generic**, so a poured town's inputs are committed by the rule rather than by someone remembering to hand-author twenty lines for it.

⛔ **You are not deciding what a scene's inputs ARE.** That policy already exists and is correct — the four tracked scenes encode it. You are generalising the pattern that expresses it. Do not add files to the policy, do not remove any, do not touch `public/`, `arborist/`, or any bake.

If the scope pulls wider, **surface it to Jacob** rather than expanding silently.

---

## The problem — and it is not verbosity

`.gitignore:84` ignores `cartograph/data/*` wholesale. Each scene is then re-admitted by a hand-written allow-list of `!` negations — about twenty lines per town, naming each file individually.

**Three scenes were never given that allow-list, so their entire input set is ignored.** Confirm before building:

```
for s in lafayette-square toy hipointe-demun ksi-y-m-yn centrum altadena lafayette-square-staging; do
  printf "%-26s neg=%s tracked=%s disk=%s\n" "$s" \
    "$(grep -c "^!cartograph/data/$s" .gitignore)" \
    "$(git ls-files cartograph/data/$s | wc -l)" \
    "$(find cartograph/data/$s -type f 2>/dev/null | wc -l)"
done
```

Drafted against this output — **re-derive it; do not trust these numbers:**

| scene | negation lines | tracked | on disk |
|---|---|---|---|
| `lafayette-square` | 20 | 23 | 52 |
| `hipointe-demun` | 19 | 52 | 68 |
| `ksi-y-m-yn` | 19 | 63 | 75 |
| `toy` | 1 | 4 | 4 |
| `altadena` | **0** | 8 — *see below* | 18 |
| `centrum` | 0 | 0 | 19 | ⛔ **retired — see below** |
| `ksi-y-m-yn` | 19 | 63 | 75 | ⛔ **retired — see below** |
| `lafayette-square-staging` | 0 | 0 | 32 | ⛔ **retired — see below** |

> ### ⛔⛔ THREE SCENES ARE RETIRED. **DO NOT ADMIT THEM, AND DO NOT ARGUE FOR THEM.** *(Jacob, 2026-09-13)*
> - **`centrum` and `ksi-y-m-yn`** (Łódź / Księży Młyn) were a one-off internationalisation test. They are **defunct to the point of verboten** — Jacob's words — and his standing complaint is that they **keep re-emerging**. ⛔ A whole-scene check that reports them is **noise, and it is not a licence for a skip list** (`[[project-lodz-ksiezy-mlyn-portability-test]]`).
> - **`lafayette-square-staging`** was an abandoned attempt to fit LS. Production runs on actual LS. It has also **already cost a full day** — Jacob eye-gated staging while the work was on LS and neither party knew (`PREBAKE §4.0a`).
> - ⭐ **`ksi-y-m-yn` is the one with tracked files (63).** Retiring it means **removing them at HEAD**, which is non-destructive: git keeps every version, so the town is recoverable from history at any time if international ever comes back. ⛔ **Nothing is deleted. Do not `filter-repo`, and do not touch history.**
> - ⛔ **The generic rule must therefore admit `lafayette-square`, `toy`, `hipointe-demun` and `altadena` — and nothing else.** How a scene is retired without a per-scene skip list is **the design question of this brief**; see The work, step 1b.

> ⚠️ **Altadena was force-added on 2026-09-13 (`090413a6`) — its 8 input files are tracked while its negation count is still zero.** That was the loss-mode half, done early; the rule was deliberately left alone for you. ⭐ **Treat it as your worked example of the target state**: it is exactly what the generic rule must admit, and nothing more. `git ls-files cartograph/data/altadena` is the answer key.

⭐ **Altadena is the town `README §START HERE` calls "the first hood poured fully end-to-end" through the Extent tool.** Its `neighborhood_boundary.json`, `geography.json`, `building-overrides.json` and `neighborhood.json` exist on one disk and in no repository. `git check-ignore -v` names the cause: `.gitignore:84`.

⛔ **This is a Layer 0 silent substitution, not housekeeping.** Nothing errors. The kit presents seven scenes and cannot re-pour several of them from a clone. It fails worst on the towns nobody looks at, and it is very likely why `A20` finds only LS carries a frozen ①. *(⛔ "very likely" is not measured — **cause not established**. Do not restate it as fact.)*

⭐ **Altadena is the live case and the reason this matters.** It is a real, wanted town whose authoring was backed by nothing. The three retired scenes are the *other* half of the same defect: the kit has no way to say which towns it stands behind, so a fresh reader finds seven and has to ask a human which four are real.

---

## The work

**1. Replace the per-scene allow-lists with one scene-generic block.** Git's `*` matches a single path segment, so `!cartograph/data/*/content/roster.json` covers every town at once. The policy to preserve, verbatim from the existing rules:

- **Track:** the authored/fetched inputs — `neighborhood_boundary.json`, `geography.json`, `neighborhood.json`, `building-overrides.json`, `tree-species-map.json`, `tree-mix.json`, `identity-registry.json`; `raw/osm.json`, `raw/admin_boundaries.json`; the hand-authored `content/` files and their `*.overrides.json` sidecars; and **all of `clean/` by default**.
- **Ignore:** only the heavy **generated** geometry the pipeline reproduces — `clean/{map,skeleton,ribbons}.json`, `clean/terrain.{bin,json}`, `clean/derived_trees.json`.

⛔ **Read the KIT POLICY comment at `.gitignore:~115` before you touch `clean/`.** It records that a per-file allow-list there silently dropped `park_census` and `tree-species-map` once already. **Track `clean/` by default and subtract the generated files; never re-add an allow-list.** Carry that comment forward into the generic block — the comment is what would prevent the rule being re-broken.

**1b. Retire a scene without naming it in the kit. ⭐ This is the design question, and it is the whole Layer 0 test of this brief.**

Three scenes must end up with no tracked inputs, and ⛔ **a list of their names — in `.gitignore`, in a check, or anywhere else — is exactly the skip list Layer 0 forbids.** It would also be wrong on town #8, which nobody has retired yet.

▶ **The move: let the town declare its own status, and let the kit read it.** A retired scene carries a small tracked marker in its own directory — `cartograph/data/<scene>/RETIRED.md`, one paragraph saying who retired it and why. Then:

- **`.gitignore` stays fully generic** and names no town at all. It admits `cartograph/data/*/…` by pattern.
- **Retirement is a git operation, not a rule:** `git rm --cached` the scene's files, commit the marker. ⛔ Non-destructive — every version stays in history.
- **The check reads the marker**, so the invariant becomes: *every scene on disk either has tracked inputs, or carries a `RETIRED.md` saying why.* A scene that is neither **fails loudly** — which is the case that matters, because that is a freshly poured town silently going untracked, the exact defect this brief exists to close.

⭐ Note what this buys beyond tidiness: the answer to *"why is there a Polish town in here?"* stops being tribal knowledge and becomes a file. The complaint being addressed is that these scenes **keep re-emerging**; a marker is what stops the next agent re-discovering them as a gap.

**2. Commit Altadena's peers.** ⛔ With the retirements above, there are none — `altadena` was already force-added on `090413a6`. **Admit no new scene in this brief.** If the generic rule turns up a scene you did not expect, stop and surface it.

**3. Write the check — this is the deliverable, not the ignore file.**
`scratch/claims-a-pour-adds-no-gitignore-lines.mjs`, modelled on `claims-doc-pointers-resolve.mjs` and `claims-memory-index-health.mjs`:

- Enumerate scenes by **reading `cartograph/data/`**, never a hardcoded list (⛔ a list in the check is the same disease as a list in the ignore file).
- **FAIL if any line of `.gitignore` contains a scene name.**
- **FAIL if any scene has zero tracked files** while it has inputs on disk.
- ⭐ **Mutation-test it before you claim it works** — add a scene-named line, see it go red, remove it. A passing check proves nothing until it has been seen to fail (`[[project_the_check_is_the_deliverable_mutation_test_it]]`).

---

## Acceptance — mechanical, no eye gate

1. **The tracked set for the four already-tracked scenes is byte-identical.** This is the gate that matters; run it before and after and diff:
   ```
   git ls-files cartograph/data | sort > /tmp/before.txt   # BEFORE any edit
   git ls-files cartograph/data | sort > /tmp/after.txt    # AFTER
   diff /tmp/before.txt /tmp/after.txt
   ```
   ⛔ **For `lafayette-square`, `toy`, `hipointe-demun` and `altadena` the two files must be identical — zero additions, zero removals.** A removal there means the generic rule dropped a file the hand-written one kept, which is the 2026-07-18 trap recurring.
   ⭐ **The only permitted difference anywhere is the removal of `ksi-y-m-yn`'s 63 files** (retired, recoverable from history) **plus the three `RETIRED.md` markers.** ⛔ Any addition under `centrum/`, `ksi-y-m-yn/` or `lafayette-square-staging/` is a failure — resurrecting them is the thing this brief was corrected to prevent.
2. **No generated geometry becomes tracked.** `git ls-files 'cartograph/data/*/clean/map.json' 'cartograph/data/*/clean/skeleton.json' 'cartograph/data/*/clean/ribbons.json' 'cartograph/data/*/clean/*.bin'` → empty.
3. **`node scratch/claims-a-pour-adds-no-gitignore-lines.mjs` exits 0**, and has been seen to exit non-zero under mutation.
4. **Scene-named lines in `.gitignore` reach zero** for the `cartograph/data/` block.

---

## Registers (the third part of the fix — `CLAUDE.md`)

- **`cartograph/OPERATIONS.md`** — the pour runbook loses its "now add your scene's ignore lines" step. Say so explicitly; that step is the thing being deleted.
- **Commit message** names the register reached, or says "reaches no register" outright.

⚠️ **One idle interactive peer shares this working tree.** `ListAgents` before staging, and use **scoped pathspecs** — ⛔ never `git add -A` (`[[feedback_check_for_peers_before_git_add_all]]`).
