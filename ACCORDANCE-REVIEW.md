# Accordance Review — Product ⟷ Promise

**The outside-in diligence lens + the two-way accordance punchlist.** What an informed outsider
(an investor, a new engineer, a licensee) actually sees when they read the docs *and then* read the
code — and the ranked work to close the gap in **both** directions:

- **Product → Promise** — *build the thing we claim.* (Homes in `ROADMAP.md` + `SECURITY.md`.)
- **Promise → Product** — *correct the claim to match the thing.* (Homes in the pitch/canon docs;
  the discipline instrument is `AUDIT-MATRIX.md`'s "capability statement = dead-code detector.")

> **What this is / isn't.** A **reference-kind synthesis**, pointer-not-restatement. It does not own
> any fact — every punchlist line points to its detail home. It exists because the *outside-in* read
> (does the shipped code deliver what the docs promise?) is a lens no single canon doc carries, and it
> was, per the commissioning session, "unexpectedly illuminating." Keep it plain; keep it honest;
> revise the pointers when the homes change.
>
> **Provenance.** Independent diligence pass, 2026-07-18 (commissioned as an investor-lens deep-dive).
> Two adversarial verifications — an architecture/novelty walk of the geometry + render engine, and an
> independent re-audit of `SECURITY.md` against source — plus first-hand spot-checks. Reachable from
> `ORIENTATION.md`.
>
> ⚠️ **v1.1 erratum (2026-07-18, same day) — the review corrected itself, on challenge.** The first
> draft's **Column A→P was written from subagent summaries + grep excerpts, not a full read of the
> indicted docs** — the exact accordance failure this doc exists to catch, committed by this doc. On a
> full read of `arborist/FEATURES.md`, `SHOW-BIBLE.md`, `README.md`, `cartograph/FEATURES.md`, the
> pitch/dev canon proved **markedly more honest than stated**: it explicitly flags parked capability and
> unmeasured mobile perf, with dates and pointers. **AP-1 and AP-2 are downgraded accordingly** (the
> code-verified rows AP-3/-4/-5/-6 and the whole P→A column stand — those were checked first-hand). The
> meta-lesson *is* Part III.3, demonstrated on the reviewer. Kept visible on purpose.
>
> **Reading order:** `ORIENTATION.md` → `README §⭐ START HERE` → this. Sits *beside* `ROADMAP.md`
> (what's left) and `AUDIT-MATRIX.md` (the promise↔product instrument); it is the *lens*, they are the
> *boards*.

---

## Part I — The diligence report (the illuminating synthesis)

### Bottom line
A **real, working, and unusually sophisticated** codebase — not a demo or a docs-heavy shell.
~118k lines of first-party code, ~2,024 commits over ~5 months, a live pipeline that has already
poured four distinct neighborhoods (`lafayette-square`, `altadena`, `hipointe-demun`, `toy`) into real
binary artifacts on disk. The differentiated IP is genuine and concentrated in two hard domains: a
**survey-grounded computational-geometry engine** and a **hand-written GPU rendering layer**. The
material risks are not "is it real" — they are **single-author concentration** and a **pre-production
backend security posture**, plus **doc↔code drift that lives at the pitch layer, not the dev canon.**

### What's genuinely sophisticated (verified against source)
- **The geometry engine is the crown jewel** and is novel vs. any three.js city viewer or
  Google/Cesium/Mapbox 3D (those extrude default-height buildings over generic road tiles). This does
  a **figure-ground inversion**: blocks are extracted as *faces of the street graph*; roads are the
  void. Verified line-by-line in `src/lib/tileGround.js`:
  - A correct **DCEL / half-edge planar face walk** (`extractFaces`, `:533`) — the algorithm class of
    PostGIS `ST_Polygonize` / osm2streets — with node quantization + endpoint welding.
  - A hand-rolled **variable-width per-edge polygon offset** (`offsetRingVariable`, `:148`): each
    street side gets its own *surveyed* right-of-way depth. This is precisely what the off-the-shelf
    Clipper library structurally **cannot** do — the load-bearing custom algorithm.
  - Parametric **per-corner fillets** (`filletRing`, `:263`) with authored radii + a neighbor-clamp so
    fillets can't overrun.
  - `cartograph/skeleton.js` (~2,166 LOC): OSM→graph welding, divided-carriageway detection, node
    typing. Real domain-specific graph work. Topology is **frozen at prebake** ("the Wall") and
    rehydrated at runtime — a real determinism/perf architecture.
- **The GPU layer shows AAA-grade craft** — ~2,000–2,500 lines of hand-written GLSL across ~25 custom
  materials: a full **volumetric cloud raymarcher** (domain-warped FBM, Beer's-law extinction, Mie
  forward-scatter), a **shared 8-rung HDR blur pyramid** feeding both bloom and depth-of-field (an
  optimization stock `postprocessing` can't do), CPU/GPU terrain sampler reconciliation, and
  disciplined handling of two three.js footguns (raw-ShaderMaterial log-depth, program-cache-key
  collisions).
- **Beyond commodity:** relightable render-to-texture tree impostors, and the frozen-topology **"slab"
  contract** + kit model itself (verified working across 4 scenes).
- **The Preview publish-confidence instrument** (`cartograph/PREVIEW.md`, `src/preview/`) — a distinct,
  under-credited asset. Preview mounts the frozen slab in production's **exact** render tree (byte-for-byte
  the same components), so its per-layer cost attribution measures the *shipping* render, not a proxy —
  production-parity-as-measurement. **Shipped (v0.1):** signed-Δ per-channel cost, gesture-tagged spike log,
  shot/TOD scrub, one-click publish gate (`d1b86dd4`). **Ratified, not built (v0.2, `HANDOFF-preview-measurement.md`):**
  gauges re-aimed from desktop-ms to *% of a named device budget*, thermal / transition-spike / memory axes,
  and two clever browser-proxy techniques for "weaker hardware" (render the mobile path; **supersample
  fill-strain** — smooth at 3× pixels ⇒ smooth on a ~3×-weaker GPU). This is the designed *proof-path* for
  the phone claim — see PA-1/AP-2 for the built-vs-ratified honesty.

### What's off-the-shelf (appropriate)
Clipper (boolean primitives + *uniform* offsets only — the value-add sits on top), three.js
triangulation (earcut), glTF-transform + meshoptimizer (in the *tree* pipeline only), Supabase,
React-Three-Fiber, zustand. Correct leverage, not a red flag.

### The honest caveat — *capability built ≠ shipped configuration*
A large fraction of the fanciest machinery is **coded but deliberately parked** in a conservative
shipping config. **The dev *and* pitch canon are honest about this** — verified on a full read:
`arborist/FEATURES.md:5,25` and `README.md:125` flag parked LOD/impostors in plain words (dated),
`cartograph/FEATURES.md:77` scopes mobile perf as an in-flight, unproven measurement arc, and
`SHOW-BIBLE.md:7` carries an explicit honesty note. The only residual drift is the **top-line
marketing slogans** ("mobile-viable," "fast enough for a phone"), which the docs already self-hedge.
So: a diligence reader should credit the *capability* but not the parked machinery as *shipped value* —
and should note the documentation is unusually disciplined about drawing that line itself.
(Details + the v1.1 self-correction: Part II, Column A→P + the erratum above.)

### Risks to price in
1. **Single-author bus factor** — 2,024 commits, one author. Extraordinary velocity; total key-person
   concentration; heavy handoff-doc cognitive load for any successor.
2. **Backend not production-hardened** — the Cary courier backend is a pre-launch prototype with an
   accurate map of its own holes (see `SECURITY.md` + Part II). Bounded work, not a rewrite.
3. **"Runs on a phone" is asserted, not yet measured** against the stated device floor; geometry
   compression is absent on shipped output.
4. **Doc↔code drift is *narrow*, not systemic** — verified: the FEATURES/README/NOTES canon honestly
   flags parked capability and unmeasured perf; only the marketing slogans need sharpening. This is a
   *strength* signal (disciplined docs), with a small sweep left. (My first draft overstated this — see
   the v1.1 erratum; the overstatement itself is the cautionary tale.)

### For an investor, in one line
The differentiated, defensible IP — a **survey-grounded block-face geometry engine** and
**engine-grade GPU rendering craft** — is real, hard, and well-executed; the multi-neighborhood kit
thesis is demonstrated, not hypothetical; the gaps are the *expected* gaps of a pre-launch solo
research effort, and the team demonstrably knows where its own bodies are buried.

---

## Part II — The accordance punchlist

> **Two columns, opposite directions.** Sizes: **S** = hours · **M** = a session · **L** = multi-session.
> **DoD = Jacob's eye on the real render** (never a proxy) for build items; **DoD = the doc reads true to
> a cold outsider** for correction items. **Pointer-not-restatement** — the → home is the truth; strike
> a line here *and* at its home in the same breath when it lands (the accord sweep).

### Column P→A · Product → Promise — *build the thing we claim*
> Most of these already have a home on `ROADMAP.md`; this column is the **accordance framing** of that
> board (which promises are currently unbacked) + the items diligence surfaced that the board lacked.

| # | The promise | The shipped reality | Action | Size | → Home |
|---|---|---|---|---|---|
| **PA-1** | *"Runs on a phone"* / "mobile-viable canopy" (`SHOW-BIBLE §1`, `arborist/FEATURES`) | **(Revised 2026-07-22 — the impostor foundation landed; both hemispheres now render.)** Remaining gap is weight, not capability: the hero pool is ~70 MB of PNG (additive today) and the atlas is 27.6 MB uncompressed; mobile budgets self-labeled "interim/unmeasured." **The proof-path exists and is named — Preview** (production-parity cost instrument, v0.1 shipped) — **but the v2 device-budget measurement regime is ratified, not built** (`HANDOFF-preview-measurement.md`), today's phone mode "tests nothing real," and the portrait-slice lightness bet rides on frustum culling that is currently **off** | Land Column B; KTX2/Basis the atlas (27.6→~5 MB); build the Preview v0.2 regime (H1); restore per-tile culling; then **measure** against the Galaxy-A54 floor **in Preview** | L | `ROADMAP` B1–B6 + **H1** (Preview measurement) · `cartograph/PREVIEW.md` |
| **PA-2** | Octahedral / coverage-preserving impostors + distance LOD (BATON, arborist docs) | **Superseded 2026-07-22:** shipped as two RTT-captured impostors split by viewing hemisphere (overhead 3-slice + hero azimuthal bands) rather than octahedral; the prominence classifier it assumed is retired. Coverage mipmaps still absent | Build the impostor render arc (or move it firmly to "planned" — see AP-1) | L | `ROADMAP` B3 · `arborist/ARCHITECTURE.md §"Tree-render reality at LS"` |
| **PA-3** | *"beautiful … curved streets"* / "HPDM chunky" curves | `STREET_SMOOTH` pinned 0, `CURVE_FIT` built + eye-approved but **OFF** (offset not robust on tight bends) | Robust bezier offset → curves ON → re-bake HPDM (strictly downstream of the curb freeze) | L | `ROADMAP` A3→A4 |
| **PA-4** | The SHAPE finish — "author caps, corners, ADA" as a premier-product aesthetic | Cul-de-sac **legs** flip renders Δ=0; through-node T-artifact re-fix failed the eye; some real corners don't fire ADA | A1 legs · A2 through-node · A7 corner-identity + ADA trigger | M–L | `ROADMAP` A1/A2/A7 |
| **PA-5** | *"couriers run a request-and-dispatch system"* (`ls/FEATURES`) — a live product | Backend is unauthenticated on privileged paths + drafted-unapplied RLS fix (see security items below) | Ship the security close-out **before** Cary touches a real user/dollar | M–L | `ROADMAP` close-out · `SECURITY.md` |
| **PA-6** | *"fortified, fast slab"* implying compact/portable | Slab `.bin` is raw Float32/Uint32; tree GLBs uncompressed geometry — no meshopt/draco/quantization on shipped output | Add geometry quantization/compression to the bake (or scope the claim) | M | *new* → fold to `cartograph/BACKLOG` |
| **PA-7** | **Security — CRITICAL, live today:** `sms_messages` PII readable by the public anon key | Fix migration `009` is written + committed but its own message says **"drafted, unapplied"**; no CI runs `supabase db push` | **Apply `009`** to the live project; re-run the Advisor | S | `SECURITY.md` F-1/F-7/F-8 |
| **PA-8** | **Security — HIGH:** privileged endpoints are authenticated | `complete-session` (money-mover), `onboarding` (activation), **and `dispatch` (live GPS)** all take ids from the body with **zero caller auth** (service-role client) | Require the user JWT; assert `auth.uid()===` the subject on every mutating/reading action | M | `SECURITY.md` F-2/F-3 + **new: dispatch** |
| **PA-9** | **Security — HIGH:** webhooks are trustworthy | **Zero** signature verification anywhere (Stripe/Twilio/Checkr; repo-wide grep = 0 hits) — a forged webhook can activate a courier with no real background check | Verify signatures before trusting any webhook; reject on mismatch | M | `SECURITY.md` F-5 |
| **PA-10** | **Security — HIGH (new, missed by the self-audit):** courier PII is owner-scoped | `courier_profiles_select_active` is `using (status='active')` with **no `auth.uid()` gate** (`002_rls_policies.sql:47`) — anon key reads every active courier's plate, insurance dates, **Stripe account id** | Scope the policy to ownership / route through an edge fn | M | *new* → add to `SECURITY.md` |
| **PA-11** | **Security — MEDIUM/LOW:** dep + surface hygiene | High-severity `ws` CVE (8.0.0–8.20.1); `requests` RLS `USING(true)`; all-courier GPS to any auth user; fail-open cron guard | `npm audit fix`; scope `requests`/`courier_locations`; fail-closed cron | S–M | `SECURITY.md` F-4/F-10/F-11 + dep |

### Column A→P · Promise → Product — *correct the claim to match the thing*
> The **dead-code / vestigial detector** in operation (`AUDIT-MATRIX §"capability statement"`,
> `SHOW-BIBLE §"honesty note"`). Each line: the overstatement → the truth → the doc to edit. **Verified
> against source** — including one claim I had to *retract mid-audit* (AP-4), which is the whole point.

| # | The claim, as written | The verified truth | Action (edit the doc) | Size | → Home |
|---|---|---|---|---|---|
| **AP-1** ↓ | *(as first drafted:)* "READMEs/pitch describe impostors/LOD/culling as **current**" | **LARGELY WRONG on a full read — the canon is honest.** `arborist/FEATURES.md:5,25` explicitly flag "impostor render is **PARKED** … dormant on disk," dated; `README.md:125` tags Arborist "hero-LOD/DoF **parked**"; `arborist/NOTES.md`/`ARCHITECTURE.md` say "parked, not current." **Residual, narrow:** only the top-line *marketing slogans* (`SHOW-BIBLE §1`: "*Real trees, mobile-viable*") assert the end-state — and `SHOW-BIBLE:7`'s honesty note already hedges them | **Sharpen (not correct):** tighten the §1 marquee slogans to match the honest FEATURES sheets they point to. Not a dead-code flag | S | `SHOW-BIBLE §1` marquee only |
| **AP-2** ↓ | *(as first drafted:)* "*Runs on a phone* stated as **achieved**" | **OVERSTATED — and the honest home is a real strategy I under-credited: Preview.** `cartograph/FEATURES.md:77` scopes it precisely — names the two reference phones (iPhone 16 Pro Max ceiling / **Galaxy A54 floor**), calls the measurement an *"in-flight v0.2 arc"* → `HANDOFF-preview-measurement.md`, and points at the **Preview** publish-confidence instrument as the mechanism; `README.md:13` frames "works on a phone" as a *remaining-work column name*. The dev pitch does **not** claim it achieved — it names a *designed instrument to prove it* (v0.1 shipped, v0.2 ratified). Mobile *budgets* self-labeled "interim" is the true, smaller residual | Leave the FEATURES pitch as-is (it's honest); only sharpen the SHOW-BIBLE slogan (AP-1). The *product* gap (build the Preview v0.2 regime + measure) is **PA-1 / H1**, not a doc fix | S | `SHOW-BIBLE §1` slogan · `cartograph/PREVIEW.md` |
| **AP-3** | `SECURITY.md` F-12: dev servers *"expected to bind to localhost"* | They call `.listen(PORT)` with **no host arg** → bind `0.0.0.0` (LAN-reachable): `cartograph/serve.js:2242`, `arborist/serve.js:1770`, `meteorologist/serve.js:241` | Correct F-12; bind `127.0.0.1`; add the 3 new findings (PA-8 dispatch, PA-10 courier_profiles, ws CVE) to the register | S | `SECURITY.md` |
| **AP-4** | *(agent-claimed)* `buildBlockGeometryV2.js` is a **dead file, safe to delete** | **FALSE — file is live.** Four modules import helpers from it (`resolveChainSegmentation`, `differenceRings`, `intersectRings`; `tileGround.js:35`, `buildPathRibbons.js:29`, `SurveyorOverlay`, `MeasureOverlay`). Only the **eponymous function** is likely vestigial | Audit the *single function* `buildBlockGeometryV2()` for removal; **do NOT delete the file**; fix any doc that calls the whole file dead | S | `AGENT-VALIDATION-SURFACES` |
| **AP-5** | `poly2tri` is a project dependency (implies used) | **Zero real imports** — only a vite `global→globalThis` polyfill for its UMD shim (`vite.config.js:142`). Vestigial weight | Remove the dep + the polyfill, or document why it's retained | S | `package.json` |
| **AP-6** | `SLAB-CONTRACT.md` / `AGENT-VALIDATION-SURFACES` "last verified" dates | Stale (SLAB-CONTRACT "Last verified 2026-05-26") against a codebase that has since churned | Re-verify + re-date, or add a "known-stale, re-verify" banner | S | those docs |
| **AP-7** | Docs reference a `buildBlockGeometryV2`/figure-ground **model that was deleted at T4** as if the tile era's relationship to it is settled | The tile path (`tileGround.js`) is live; the figure-ground *builder* is gone but its **utility exports live on** in a confusingly-named file | Rename/split the file (utilities vs. dead builder) so the name stops lying — a findability + onboarding fix | M | `cartograph` refactor note |

---

## Part III — How to run this as a discipline (not a one-off)

1. **This doc is the lens; the boards are the truth.** When a P→A item lands, strike it here **and** on
   `ROADMAP.md`/`SECURITY.md`. When an A→P correction lands, strike it here **and** fix the named doc.
   Never let a done line sit.
2. **The A→P column is the vestigial-detector, live.** Every capability statement is also a dead-code
   test: if it reads as nonsense to a cold outsider, it's a flag, not a copy nit
   (`AUDIT-MATRIX`, `SHOW-BIBLE §honesty note`). This column is where those flags land with a fix.
3. **Verify before you promise — in both directions.** The single most valuable finding of this pass
   (AP-4) was a *retraction*: a plausible "delete this dead file" that source proved false and would
   have broken the build. The DoD for adding a line here is the same as for the code:
   **checked against the code and/or the lit app, never memory** (`feedback_verify_your_own_premises`).
4. **Re-run at each publish gate.** The gap between promise and product is widest right after a burst
   of parked-but-built machinery. Sweep this lens before the next `PUBLISH.md` gate.

---

*Diligence pass 2026-07-18. Revise freely — the pointers are the contract, the prose is the lens.*
