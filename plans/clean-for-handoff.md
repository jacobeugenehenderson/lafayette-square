# Plan — Clean for Human Handoff

> **State / forward plan** (`BOZ §2`). **Status: DRAFT (2026-06-30, Boz + Jacob).** Purpose: get the codebase to a state where **human developers can be handed the package and it reads clean** — no corpse-lies, no dead paths mounted as if live, one render pipeline instead of forks, tabled work quarantined honestly.
>
> ⛔ **ROUTE FIRST** (`CLAUDE.md`): `ORIENTATION.md` → `README §⭐ START HERE` → then the arc docs this plan sequences (`HANDOFF-render-pipeline-install.md`, `cartograph/DOC-CODE-COHERENCE.md`, `plans/pre_public_cleanout.md`).

---

## The reclassification (why this plan exists)

Jacob, 2026-06-30: *"I want to hand this off to human developers and it must be clean."* This turns the standing code/doc debt from **someday-drag** into a **gating deliverable**. Cleanliness is no longer hygiene — it is the product requirement for the handoff. The good news: the targets are already enumerated in the corpse-lie ledger and the BACKLOG, so this is **execution, not discovery.**

**The lead is `render-pipeline-install`** — it is the single arc that pays down the most handoff-debt per unit work: it retires the render fork (`PreviewPostFx`), makes "Preview == Production" *structural* instead of asserted, fixes the mobile on/off drop into a resolution *bracket*, AND produces the render manifest as a first-class documentation artifact. One arc, four liabilities.

## Definition of Done — the "stranger legibility" test

A new developer, given only the repo, can:
1. **Orient in ≤2 hops** — `ORIENTATION.md` → `README §START HERE` → the topic canon, and every pointer resolves. *(Doc-canon accord sweep landed 2026-06-30; residual deferred items in W6.)*
2. **Trust the docs** — **`DOC-CODE-COHERENCE.md` has zero open rows** (13 open today). No doc claims a mechanism the code doesn't do; no code contradicts a doc. This ledger *is* the handoff-readiness gauge.
3. **Read one render pipeline** — no `PreviewPostFx` fork; the pipeline is a declared manifest installed identically in production / Stage / Preview (`render-pipeline-install`).
4. **Not trip over dead code** — the figure-ground path is deleted or, where still entangled, clearly quarantined; no dead module mounts as if live.
5. **Tell live from parked** — TABLED / mid-rethink domains (meteorologist volumetric, arborist v1) are unambiguously marked; a stranger won't build on parked work.
6. **Build + ship** — `README` dev-setup and `PUBLISH.md` / `OPERATIONS §Save→ship` are accurate end-to-end (spot-verified 2026-06-30).

## The workstreams

### W1 — `render-pipeline-install` (THE LEAD)
The 5-phase arc in `HANDOFF-render-pipeline-install.md` (design draft, standup-gated). It is the spine of this plan.
- **Grounded reality:** `PostProcessing.jsx:413` `if (IS_MOBILE) return` drops the whole pyramid stack (DoF/bloom/AO/aerial) as a binary; `PreviewApp.jsx` mounts `PreviewPostFx.jsx` (189 lines) — a forked composer whose DoF driver is silently wrong. The pyramid (`DownsamplePyramid.jsx`) is real and shared **on desktop only**.
- **Delivers:** Phase 1 extract `usePostFxDriver` (pure refactor) → Phase 2 manifest + installer → Phase 3 **retire `PreviewPostFx`** (parity win) → Phase 4 scene tree onto the manifest → Phase 5 fold `render-conformance`/`preview-measurement` in as installer capabilities.
- **Handoff payoff:** the `platform` field on each manifest entry converts the mobile on/off drop into a **resolution bracket** (mobile ships every effect at a low rung, not none) — retiring the mobile liability structurally. And the manifest is the recorded SSoT of *what the product renders* (a doc artifact across every register — see that HANDOFF §Documentation deliverable).
- **⚠️ Gate:** DESIGN DRAFT — standup on the manifest shape + `inspect` contract + the 4 open decisions **before any code**. High blast radius (`Scene.jsx` / `PostProcessing.jsx` / `PreviewApp.jsx`) — serialize with `render-conformance` + `preview-measurement`.
- **⚠️ Depends on:** the mobile *brackets* need `preview-measurement`'s real per-device numbers to tune (today phone-hi==phone-lo, guessed). The installer can ship with a conservative bracket first; the tuning follows the instrument.

### W2 — Dead-path excision (figure-ground)
The dead figure-ground construction path (`RIBBONS`/`SURVEY §3` made tiles the live path; figure-ground is the corpse).
- **Grounded reality — this is NOT an `rm`.** `src/lib/buildBlockGeometryV2.js` is **3,371 lines with ~13 live importers** (tileGround, parkPaths, buildPathRibbons, the overlays, CartographApp…). Most import *shared helpers* co-located in the grab-bag file, not the dead builder. So excision = **(a)** extract the still-used helpers to a clean module, **(b)** migrate authoring off figure-ground, **(c)** then delete the builder + `BlockGeometryV2Debug.jsx` + the `bake-ground.js:28` import.
- **Gated on `tile-T3-authoring`** (move handles / corner-R / cap-selector / strip-swap off figure-ground → then **T4 deletes it**). Ledger rows C3/C4/B4.
- **Handoff payoff:** the single biggest "why are there two ways to build a block?" confusion a stranger hits, gone.

### W3 — Corpse-lie ledger → zero
`DOC-CODE-COHERENCE.md`: **13 open rows** (🔎 identified / ⚠️ re-verify). This is the definition-of-done gauge for W1–W2 and the doc side.
- Drive each row to ✅ (both places agree) as its owning workstream lands: the render forks (via W1), the figure-ground rows (via W2), the ⚠️ re-verify rows (C6/C7/C8 vestigial serializer fields — verify-then-excise), the remaining doc rows.
- **Handoff payoff:** this ledger, at zero, is the *certificate* that the docs and code agree — the thing a human dev checks first.

### W4 — Quarantine the parked domains
Banners landed 2026-06-30 (meteorologist volumetric TABLED; arborist v1 SPEC superseded). Finish the job:
- Physically archive the wholly-superseded material to dated `_archive/` (RUNTIME-DELTA, the arborist v1 spec once nothing cites it as "largely shipped", the misfiled cartograph sky-ADRs in `meteorologist/NOTES` ~473–680).
- Each parked domain's `README` states in one line: **what's live vs what's parked** (e.g. meteorologist: "CloudDome ships; volumetric `<Atmosphere/>` is TABLED behind `?sky=volumetric`").
- **Handoff payoff:** a stranger never mistakes an elaborate tabled subsystem for the live one.

### W5 — LS pre-public cleanout
`plans/pre_public_cleanout.md` (already drafted; partly executed — S5a handoff-doc retirements done 2026-06-30). Finish: authoring HTML out of the prod build (`rollupOptions.input` mode-conditional), verified-orphan deletions, the deployment-ID audit gate. This is the LS-app-surface half of "clean."

### W6 — Doc-canon accord (mostly done)
The 2026-06-30 whole-corpus sweep landed (banners, ~10 dead pointers repointed, 3 HANDOFFs retired, orphans indexed). Residual: codify the doc-currency mechanism (dated `verified` headers) into `BOZ §3`; the deferred physical archiving (overlaps W4).

## Sequencing

```
NOW ──▶ W1 render-pipeline-install (standup → Ph1–3: the fork dies, parity structural, mobile bracket)
             │  (in parallel, LS-surface, no render-file convergence)
             └▶ W5 pre-public cleanout  ·  W4 quarantine (finish the archiving)
        │
   then ─▶ W2 figure-ground excision (gated on tile-T3-authoring — the harder untangle)
        │
  throughout ─▶ W3 ledger → zero (each row closes as its workstream lands) + W6 residual
        │
   DONE ─▶ the 6-point stranger-legibility test passes → hand off
```

**Serialization:** W1 owns `Scene.jsx` / `PostProcessing.jsx` / `PreviewApp.jsx` — anything else touching those (render-conformance, preview-measurement, the hero-motion arc) surfaces to Boz first. W2/W4/W5 are largely disjoint (cartograph-lib / docs / build-config) and can run alongside.

## The handoff artifact (what the human dev receives)
Not a document dump — a **navigable, honest repo**: the `ORIENTATION → README → canon` path, a **zero-open corpse-lie ledger** as the trust certificate, the **render manifest** as the recorded SSoT of what ships, and a BACKLOG that reflects real current state at a glance.

## Open decisions (Jacob's)
1. **W1 scope v1** — post-FX only (Phases 1–3), scene tree as follow-on (Boz recommends; it's where the rot is)? Or design both manifests up front? *(= render-pipeline-install open-decision #1.)*
2. **W2 timing** — do the figure-ground excision *now* (forcing the tile-T3-authoring migration it's gated on), or defer until after W1 ships and let T3 land on its own schedule? The handoff bar wants it gone; the effort is real.
3. **Handoff shape** — is the target a *contractor onboarding* (they extend LS) or an *open-source / kit release* (arbitrary devs pour neighborhoods)? The DoD bar is higher for the latter (the kit thesis must be legible, not just LS).

---

*Filed 2026-06-30 (Boz), at Jacob's direction ("clean for human handoff; lead with render-pipeline-install"). The lead arc's Reference home on landing = `cartograph/ARCHITECTURE.md` + `PREVIEW.md`; this plan retires to `NOTES` when the 6-point DoD passes.*
