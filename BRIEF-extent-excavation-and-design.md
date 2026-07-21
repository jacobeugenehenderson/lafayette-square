# BRIEF — Extent: excavation, audit, and system design

**Agent: FRESH.** Not a continuation. This brief exists *because* accumulated context on this subsystem has produced wrong models three times; a warm agent inherits the contamination we are trying to escape. Name yourself — one word, your choice — and use it when you report back.

**You are a specialist brought in on ONE subsystem: the Extent tool.** The rest of this platform has reached a fairly sophisticated, reliable standard. Extent has not, and Jacob (the owner) knows it:

> *"The extent tool persists as an unfinished and shaky element in our scheme… because it's the fundamental base of everything I don't think it's totally without risk to continue without just fixing it once and for all; but of course if it were that simple I would have done it already."*

You are **not** implementing. You are producing an excavation, an audit, and a design recommendation. **No production code.** See §7 for what you may write.

---

## 0. Why you specifically, and why the reading order below is mandatory

Three passes at this subsystem have reached wrong conclusions — two agent passes, and a coordinator pass on 2026-07-21. The pattern is identical every time: **read some code, infer a mechanism, reason forward from the inference without checking it, then propose a design that solves the inferred problem.** Two of those three then wrote the wrong model into a document the next pass read.

The most recent example, so you can recognise the shape: the coordinator observed that Hi-Pointe–DeMun's edge buildings are carried by 16 per-building `activate` overrides, inferred that re-deriving the boundary would discard them, and proposed a new per-street "side" property to fix it. The overrides live in a separate file that the pour only ever reads. Nothing would have been lost. The design solved a problem that did not exist — and it was written into the canon before anyone checked.

**So: the failure is not ignorance, it is premature synthesis.** Everything below is arranged to delay your synthesis until after you have the evidence.

> ⛔ **MANDATORY READ ORDER. Do not skip ahead, and say in your report that you followed it.**
> **§1 route → §2 excavate → §3 audit → §4 prior art → THEN §5 (what we built).**
>
> §5 is sealed on purpose. Our methods are the single largest contamination risk in this repo, and if you read them first you will spend your pass evaluating our answers instead of finding the right one. **Form your independent view first, then read §5 and reconcile.** Where you disagree with what we built, say so — that is the most valuable thing you can produce.

---

## 1. ROUTE FIRST — a hard gate, not advice

`CLAUDE.md` at repo root is a mandatory routing gate. Follow it before forming any opinion.

1. **`ORIENTATION.md`** (root) — the universal first read.
2. **`README.md §⭐ START HERE`** + its cross-cutting feature index.
3. **`cartograph/ARCHITECTURE.md` § "The Extent tool & the Pour" → "⭐ THE PROCEDURE, as-built"** — the live doctrinal home for this subsystem.

**Rebuilding the model from grep + first principles when the canon already spells it out is this repo's named recurring failure.** Cite what you actually read, by section.

⚠️ **The canon is not uniformly current, and you must treat currency as a variable.** On 2026-07-20 a single commit (`004a33e3`) retracted a settled model that had been asserted in **ten places across nine docs**, including both docs the routing gate sends every agent through first. Two agent passes obeyed the gate and were told the wrong thing. When two docs disagree, **the more recent commit wins** — check with `git log -1 --format=%ci -- <file>` rather than assuming, and **report every contradiction you find** as a finding in its own right.

---

## 2. THE EXCAVATION (your first deliverable)

**Premise: the requirements already exist. They are scattered, and we keep losing them.** This has a demonstrated cost — a requirement stated explicitly in a root-level brief was missed by a coordinator who then declared it had never been stated, while running three subagent audits past the file.

**Sweep the entire corpus for every Extent requirement ever stated** — anything asserting what the tool must do, must not do, must preserve, or must make possible:

- All `*.md` at root and in `cartograph/`, `arborist/`, `meteorologist/`, `ls/`, `plans/`
- `cartograph/_archive/` and any other `_archive/` — superseded docs still hold requirements that were never wrong, only re-homed
- Every `BRIEF-*.md` and `HANDOFF-*.md` (there are ~45 at root)
- `scratch/` — 1,000+ files, git-tracked, holds forensics and findings
- **Git history.** Commit messages in this repo are unusually substantive and frequently carry the *reasoning*, not just the change. `git log --all --grep=` over extent/boundary/membership/polygon terms. Requirements have been stated in commit bodies and nowhere else.
- **Jacob's own words, quoted in docs.** Verbatim operator statements are the highest-authority requirements in this corpus and appear scattered through briefs and NOTES.

**Output: one consolidated requirements list.** For each requirement:

- The requirement, stated as **what must be TRUE and WHY** — never as a mechanism
- **Provenance** — file:line and/or commit, and the date
- **Status** — live · superseded (by what) · contradicted (by what) · never implemented
- **Confidence** — stated explicitly by Jacob · inferred by a prior pass · your own inference

That last field matters more than it looks. A prior pass's inference that got written down reads exactly like an established requirement one document later. **Separate what was decided from what was assumed.**

⚠️ **Requirements vs methods.** *"The operator must be able to define a neighborhood no gazetteer knows"* is a requirement. *"Click boundary streets and the ring closes from shared junctions"* is a method — our answer to a requirement, and precisely the kind of thing that stops a designer finding a better one. **Keep them in separate lists.**

---

## 3. THE AUDIT (your second deliverable)

**3a. The subsystem as it actually is.** Operator gesture → boundary → pour → bake → skeleton → slab, naming real functions, endpoints, and persisted files. Where does membership get decided, how many times, and do the copies agree?

**3b. Structural diagnosis — why does it stay shaky?** Grounded in code you read, with `file:line`. **Label inference as inference.**

**3c. The destruction surface.** What does a re-extent overwrite, and what has no recovery path? Which authored work is protected, which is protected only by an opt-in flag, and which is silently destroyed? Where does the operator get warned — and where do they not?

**3d. Dispatch-artifact staleness audit.** Every `BRIEF-*` / `HANDOFF-*` that cites a doc, checked against what that doc says **today**. We found one that was five hours older than a retraction it contradicted and would have re-contaminated the next agent. There are ~45 at root and no reason to think it was the only one. **This is a first-class deliverable, not a footnote** — it is the mechanism by which wrong models propagate here.

**3e. What you would DELETE.** This repo prefers excising vestigial paths to accreting new ones.

---

## 4. PRIOR ART (your third deliverable) — do this BEFORE reading §5

> Jacob, 2026-07-21: *"We have had a couple points in this process where we could have just looked at how 'everybody else does it' instead of trying to reinvent the wheel."*

**Survey how this problem is actually solved, by people who have solved it for decades.** "What is in this area, and where does it stop" is not a new question. At minimum:

- **OSM's own model** — admin relations, `place=*`, boundary ways, how membership and containment are expressed, and what `admin_level` means in practice across countries
- **Census geography** — tracts, block groups, TIGER; how boundaries are defined, versioned, and reconciled against streets
- **Municipal planning boundaries** — how cities publish neighborhood definitions, and how they handle the ones residents disagree with
- **Cadastral / parcel systems** — the parcel-first view of belonging
- **GIS practice generally** — point-in-polygon vs network-based membership, topological vs geometric boundary editing, snapping and conflation, how editors let people trace along existing features

For each: what problem it solves, what it assumes, and **what it would give us that we don't have.** Be concrete about applicability — some of these assume an authority that our invented neighborhoods lack by definition.

**Then answer directly: is there a standard approach we should adopt wholesale rather than continue inventing?** A clear "yes, do it this way" is the single most valuable finding available to you.

---

## 5. ⛔ SEALED — what we have already built and tried

**Do not read this section until §§2–4 are drafted.** Then read it and reconcile.

- **`BRIEF-extent-boundary-procedure.md`** (repo root) — the prior implementation brief. Contains Jacob's procedure verbatim in six numbered steps, the three description modes, the unnamed-way finding, and a worked Księży Młyn test case. ⚠️ It carries a dated staleness banner — heed it.
- **`cartograph/ARCHITECTURE.md` §Extent** — the live procedure, including two doctrinal points established 2026-07-21 (street names come from the fetch; two centerpoints) and one explicit **DO-NOT** recording a design that was proposed on a false premise.
- The Extent tool itself: `src/cartograph/ExtentApp.jsx`, `cartograph/serve.js` (the extent/pour/rescope endpoints), `cartograph/pipeline.js`, `cartograph/bake-buildings.js`, `cartograph/reproject-raw.js`.
- Retired approaches you will find traces of, and should **not** revive without an argument: the excluder model (retracted 2026-07-20), the order-dependent corner resolver `computeExtentCorners` (excised `55df128a`), the per-street "side" property (refuted 2026-07-21).

**When you reconcile, say plainly: where does what we built match your independent conclusion, where does it diverge, and where is our existing answer actually better than the standard one?** That last case is real and worth naming when you find it.

---

## 6. OPEN QUESTIONS — do not answer these yourself

These are **product decisions belonging to Jacob.** A prior pass invented answers to questions in this class and wrote them into the canon. **Surface them; do not resolve them.**

1. ~~**What IS a neighborhood, for our purposes?**~~ — **ANSWERED by Jacob, 2026-07-21. This is the definition every requirement inherits; read it before you form any view of the subsystem.**

   > *"A neighborhood is a collection of buildings/structures which are connected by people-run accounts. The idea is that a neighborhood can be described by its hard surfaces but it is enlivened by their soft contents."*

   ⚠️ **A coordinator had earlier proposed "a small world correct at its edges, where a resident would recognise where it stops." That guess was wrong and is superseded** — it treated the boundary as the thing being defined. It is not.

   **What follows is the coordinator's INFERENCE from that definition, 2026-07-21 — not Jacob's words. Test it, don't inherit it:**
   - **The unit of a neighborhood is the STRUCTURE, not the area.** A neighborhood is a *set of buildings*; a boundary is one means of selecting that set, not the definition of it. Every geometric mechanism in this subsystem — disc, polygon, boundary streets, exclusion loops — is **instrumental**: a way to arrive at the right set of structures. If that is right, then membership is the primary artifact and the boundary is downstream of it, which is the reverse of how the tool is currently built.
   - **The connective tissue is the accounts, not the adjacency.** What makes these buildings *one* neighborhood is that people run accounts in them. Geometry is a proxy for that relation, and proxies fail at the margin — which may be why the correction step (§2.5 of the prior brief) keeps refusing to collapse into a rule. It may not be a gap. It may be the mechanism by which a *social* fact overrules a *geometric* guess.
   - **"Honorary Hood Residents" may be first-class members, not margin corrections.** One `activate` on Galeria Łódzka carries 22 listings. Under this definition, a structure full of people-run accounts is *more* a member than an empty one inside the polygon.
   - **Content loss is not a content bug — it is the neighborhood dying.** If soft contents are what enliven, then a bake that took Łódź's listings 84 → 5, or that silently drops place cards whose anchor left the baked set (`bake-content.js:554`), is destroying the thing itself. Weigh the destruction surface (§3c) accordingly — **soft-content loss may outrank geometry loss.**

   **Report whether the excavated requirements are consistent with this definition, and name every place the tool contradicts it.**
2. **Must the boundary close?** Every mechanism we have assumes a closed ring. Is a fuzzy or open edge ever legitimate?
3. **When gazetteer and resident disagree, who wins** — and is overruling the official answer a correction, or the primary act?
4. Anything else where the call is a product decision rather than an engineering one.

---

## 7. Boundaries — what you may write, and the gate

**You may write exactly one file: `EXTENT-EXCAVATION.md` at repo root**, containing §§2, 3, 4, your §5 reconciliation, and your §6 questions. Commit only that file.

⛔ **Do not modify any other file.** Not source, not canon, not the existing briefs — even where you find them wrong. **Report errors as findings**; Jacob decides what gets corrected. This matters especially for the canon: a pass that "fixes" a doc mid-audit destroys the evidence of what the next agent would have been told.

⛔ **No production code.** Throwaway analysis scripts are fine — put them in `scratch/`.

⛔ **Confirm alignment before proposing any implementation.** Deliver the excavation, audit, prior art, and recommendations; then **stop and wait for Jacob's explicit go-ahead.** This is the repo's standing rule (`CLAUDE.md` §"Standup before code") and it binds you with particular force: this subsystem is the foundation every scene rests on, and two prior passes proceeded confidently on a wrong model.

**Finally — and this is not a formality:** say what in **this brief** you think is wrong. It was written by the coordinator who made the most recent wrong-model error on this subsystem, roughly an hour after making it. It contains at least one thing nobody has verified. **Disagreement is more useful to us than agreement.**
