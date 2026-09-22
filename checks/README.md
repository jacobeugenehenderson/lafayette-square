# The check suite

⛔ **GENERATED — `npm run test:tiers`. Do not hand-edit; your edit is the next run's casualty.**

One check per bug-class, each stating a claim that can be **shown false**. The tier is **derived
from each script's source** (`checks/tier.mjs`), never from a list — so a check added tomorrow is
gated without anyone remembering to gate it, which is what makes this work on town #2.

| gesture | tier(s) | contacts |
|---|---|---|
| `npm test` | safe | nothing — enforced per-run by `checks/_no-network.mjs` |
| `npm run test:all` | safe + local-effect | nothing; ⛔ writes to disk, so not CI |
| `npm run test:live` | live | ⛔ **production.** Needs `CHECKS_LIVE=i-mean-it` |
| `npm test -- --list` | — | prints what would run |

A non-zero exit is a **finding for the board**, not a runner fault. The suite reports; it does not fix.

## ⛔ live — 36. Never in a default run.

Two reason classes, and they are not the same thing. **outbound** — a demonstrated call out.
**unreadable** — runs code the parser cannot read, so it *may* contact nothing but cannot be shown
to. Both are excluded, because "cannot be shown safe" is the only honest gate (`CLAUDE.md` Layer 0 q2).

⛔ `scratch/claims-onboarding-guard.sh` POSTs `/auth/v1/signup` at the live Supabase project **with no
teardown** — every invocation leaves another anonymous user behind. That is a recorded incident
(`SECURITY.md`, the 2026-08-31 audit disclosure), not a hypothetical.

| check | why | what it reaches |
|---|---|---|
| `checks/claims-an-external-base-survives-a-bake.mjs` | unreadable | writeFileSync · mkdirSync · deletes files · runs `node` — not a known-local command |
| `checks/claims-baked-consumers-get-a-cache-bust.mjs` | unreadable | child_process with a non-literal command — cannot be read |
| `checks/claims-hero-subject-resolves-in-its-own-slab.mjs` | unreadable | child_process with a non-literal command — cannot be read |
| `checks/claims-overture-licence-table-is-current.mjs` | outbound | calls fetch() · child_process with a non-literal command — cannot be read |
| `checks/claims-prominence-recovers-ls-landmarks.mjs` | unreadable | imports cartograph/bake-content.js, which can: mkdirSync, imports cartograph/io.js, which can: writeFileSync, imports cartograph/scene.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-sky-follows-its-town.mjs` | unreadable | computed import() with no readable target — runs arbitrary modules · imports cartograph/proceduralSky.js, which can: child_process with a non-literal command — cannot be read · imports package(s) suncalc — not read from source |
| `checks/claims-stage-preview-parity.mjs` | unreadable | writeFileSync · mkdirSync · computed import() with no readable target — runs arbitrary modules |
| `checks/claims-writers-name-the-scene.mjs` | unreadable | runs `git` — not a known-local command |
| `scratch/claims-a-rename-cannot-repaint.mjs` | unreadable | imports arborist/generate-salon.js, which can: writeFile, runs `node` — not a known-local command |
| `scratch/claims-attribution-is-per-town.mjs` | unreadable | imports cartograph/bake-sources.js, which can: writeFileSync, mkdirSync, imports cartograph/intake-rows.mjs, which can: writeFileSync, mkdirSync, imports cartograph/config.js, which can: imports cartograph/scene.js, which can: child_process with a non-literal command — cannot be read |
| `scratch/claims-band-reaches-lu.mjs` | unreadable | writeFileSync · mkdirSync · computed import() with no readable target — runs arbitrary modules · computed import() with no readable target — runs arbitrary modules |
| `scratch/claims-cary-anon-exposure.mjs` | outbound | calls fetch() · child_process with a non-literal command — cannot be read · references a hosted-service credential |
| `scratch/claims-clip-extent-floor.mjs` | unreadable | child_process with a non-literal command — cannot be read |
| `scratch/claims-corner-delta.mjs` | unreadable | writeFileSync · deletes files · child_process with a non-literal command — cannot be read · imports scratch/claims-band-reaches-lu.mjs, which can: writeFileSync, mkdirSync, computed import() with no readable target — runs arbitrary modules, computed import() with no readable target — runs arbitrary modules |
| `scratch/claims-corner-leg-suppression.mjs` | unreadable | writeFileSync · mkdirSync · computed import() with no readable target — runs arbitrary modules |
| `scratch/claims-curb-ramp-neutral.mjs` | unreadable | writeFileSync · mkdirSync · computed import() with no readable target — runs arbitrary modules |
| `scratch/claims-decline-fate.mjs` | unreadable | writeFileSync · mkdirSync · computed import() with no readable target — runs arbitrary modules · computed import() with no readable target — runs arbitrary modules |
| `scratch/claims-doc-code-citations.mjs` | unreadable | runs `git ls-files` — local, read-only · child_process with a non-literal command — cannot be read |
| `scratch/claims-doc-pointers-resolve.mjs` | unreadable | computed import() with no readable target — runs arbitrary modules · runs `git ls-files "*.md"` — local, read-only |
| `scratch/claims-dossier-writers-agree.mjs` | unreadable | deletes files · copies/renames files · runs `node` — not a known-local command |
| `scratch/claims-every-declared-page-ships.mjs` | unreadable | runs `git` — not a known-local command |
| `scratch/claims-every-placed-asset-has-a-size-band.mjs` | unreadable | imports arborist/salon-options.js, which can: imports arborist/roster-coverage.js, which can: imports arborist/generate-salon.js, which can: writeFile, runs `node` — not a known-local command |
| `scratch/claims-hook-bindings-declared.mjs` | unreadable | child_process with a non-literal command — cannot be read |
| `scratch/claims-junctionmap-blast-radius.mjs` | unreadable | runs `grep -rl junctionMap src carto` — local, read-only · child_process with a non-literal command — cannot be read |
| `scratch/claims-keyhole-carry-to-ia.mjs` | unreadable | imports scratch/claims-band-reaches-lu.mjs, which can: writeFileSync, mkdirSync, computed import() with no readable target — runs arbitrary modules, computed import() with no readable target — runs arbitrary modules |
| `scratch/claims-keyhole-splice-survival.mjs` | unreadable | imports scratch/claims-band-reaches-lu.mjs, which can: writeFileSync, mkdirSync, computed import() with no readable target — runs arbitrary modules, computed import() with no readable target — runs arbitrary modules |
| `scratch/claims-label-loss-bisect.mjs` | unreadable | writeFileSync · mkdirSync · computed import() with no readable target — runs arbitrary modules |
| `scratch/claims-mesh-equals-the-bar.mjs` | unreadable | imports arborist/roster-coverage.js, which can: imports arborist/generate-salon.js, which can: writeFile, runs `node` — not a known-local command |
| `scratch/claims-notch-origin-bisect.mjs` | unreadable | writeFileSync · mkdirSync · computed import() with no readable target — runs arbitrary modules |
| `scratch/claims-offset-reversal.mjs` | unreadable | writeFileSync · mkdirSync · computed import() with no readable target — runs arbitrary modules |
| `scratch/claims-onboarding-guard.sh` | outbound | shell: runs curl · shell: redirects to a file |
| `scratch/claims-postwall-provenance.mjs` | unreadable | writeFileSync · mkdirSync · computed import() with no readable target — runs arbitrary modules |
| `scratch/claims-regime-census.mjs` | unreadable | child_process with a non-literal command — cannot be read |
| `scratch/claims-the-leaf-face-axis-reaches-the-shader.mjs` | unreadable | imports arborist/salon-options.js, which can: imports arborist/roster-coverage.js, which can: imports arborist/generate-salon.js, which can: writeFile, runs `node` — not a known-local command |
| `scratch/claims-the-roster-light-tells-the-truth.mjs` | unreadable | imports arborist/roster-coverage.js, which can: imports arborist/generate-salon.js, which can: writeFile, runs `node` — not a known-local command |
| `scratch/claims-unpainted-arcs.mjs` | unreadable | writeFileSync · mkdirSync · computed import() with no readable target — runs arbitrary modules |

## local-effect — 6. `npm run test:all`, never CI.

Writes into the repo or a scratch dir.

| check | the claim it falsifies |
|---|---|
| `checks/claims-fade-derives-from-radius.mjs` | CLAIM: the circle has ONE origin, and the fade is DERIVED from it. |
| `scratch/claims-building-identity-survives-repour.mjs` | ⭐ WHY IT IS NOT A COUNT. `A01`'s ticket exists because `promote-ribbons.js`'s clobber |
| `scratch/claims-deadend-look.mjs` | look.mjs — RENDER THE NINE. Read-only. |
| `scratch/claims-ia-source-stamp.mjs` | "DOES EVERY iA VERTEX KNOW WHICH RING EDGE MADE IT — AND DOES THE STAMP |
| `scratch/claims-protopolygon.mjs` | THE PROTOPOLYGON — Jacob's construction, built for the first time. READ-ONLY. |
| `scratch/claims-wind-tier-extraction.mjs` | Does the extracted stampWindTier still classify exactly as the two hand-kept |

## safe — 152. This is `npm test`.

| check | the claim it falsifies |
|---|---|
| `checks/claims-a-brief-declares-how-it-dies.mjs` | EVERY BRIEF ON THE ROSTER SAYS WHEN IT LEAVES IT. |
| `checks/claims-a-corner-is-where-one-turns.mjs` | ⭐⭐⭐ A CORNER IS A VERTEX WHERE ① TURNS *AND* THE OWNER CHANGES — the shape answers WHETHER, |
| `checks/claims-a-frontage-can-ask-for-no-ped-band.mjs` | CLAIM: a frontage that carries no pedestrian realm can say so. |
| `checks/claims-a-kink-recovers-but-a-corner-does-not.mjs` | WHY THIS EXISTS. Jacob, 2026-09-08: "streets should continue their predominant direction into an |
| `checks/claims-a-level-body-has-one-surface.mjs` | surface.mjs — IS THE LAKE FLAT IN OUR OWN HEIGHTFIELD? |
| `checks/claims-a-look-keyed-tool-is-called-with-its-look.mjs` | every spawn of a Look-strict tool passes `--look`. |
| `checks/claims-a-pour-adds-no-gitignore-lines.mjs` | "DOES A POUR ADD LINES TO .gitignore?" — the standing guard on scene tracking. |
| `checks/claims-a-swap-never-happens-mid-street.mjs` | ⭐⭐⭐ JACOB'S RULE, MADE CHECKABLE: "A treelawn swap NEVER happens mid-leg, period. It's |
| `checks/claims-a-tile-is-one-tree.mjs` | A TILE IS ONE TREE. |
| `checks/claims-a16-materials-write.mjs` | A16 GATE — "does a materials flip invent authoring, and did the resolver fix |
| `checks/claims-alley-stub-pairs.mjs` | ⭐⭐⭐ IS "BRIDGE THE ALLEY ACROSS A JUNCTION" A RULE, OR A SPECIAL CASE? |
| `checks/claims-anchors-follow-the-placements.mjs` | `tree-anchors.json` keys to its own slab’s placements. |
| `checks/claims-atlas-uv-rect-survives-the-bake.mjs` | A UV RECTANGLE MUST SURVIVE THE ATLAS BAKE UNMOVED. |
| `checks/claims-axis-keys-resolve.mjs` | Does every axis key anyone stores actually exist in the rubric? |
| `checks/claims-band-is-one-ring.mjs` | Jacob, 2026-08-11, setting the acceptance for the whole arc: |
| `checks/claims-band-vs-partition-state.mjs` | does the ped band differ on the two sides at the same station — and is |
| `checks/claims-both-surfaces-draw-the-same-water.mjs` | water.mjs — DOES THE OPERATOR SEE WHAT SHIPS? |
| `checks/claims-boundary-record-split.mjs` | CLAIM (the CLASS, not one scene): `neighborhood_boundary.json` splits into three |
| `checks/claims-browse-frame.mjs` | frame.mjs — the authored Browse frame (SC.5), checked by |
| `checks/claims-cap-vs-skeleton.mjs` | "IS THIS CAP A DEAD END, OR A COVER OVER A FRAGMENT SEAM?" |
| `checks/claims-cards-light-from-the-scene-key.mjs` | THE IMPOSTOR CARDS MUST LIGHT FROM THE |
| `checks/claims-cary-order-contract.mjs` | The CaryOrder contract — does it hold, and does the doc still describe it? |
| `checks/claims-commerce-write-gate.mjs` | Is there any way to write commercial state without GAS saying yes? |
| `checks/claims-contact-sms-rate-limit.mjs` | can a stranger still flood the Host's phone? |
| `checks/claims-coplanar-ground-has-a-painters-order.mjs` | order.mjs — CAN TWO TOUCHING SURFACES FIGHT? |
| `checks/claims-coplanar-groups-do-not-overlap.mjs` | overlap |
| `checks/claims-corner-decline-vs-partition.mjs` | "IS THE DOMINANT CORNER DECLINE SITTING ON TILES THAT ALREADY OWN THEIR ARC?" |
| `checks/claims-corner-takeover.mjs` | "WHERE DOES THE CORNER RIBBON'S TAKEOVER DECLINE?" — A10 / D1, the population. |
| `checks/claims-coupler-totality.mjs` | ── Is the COUPLER RELATION TOTAL? |
| `checks/claims-curated-centerlines-unread.mjs` | "DOES THE FRAME AGREE WITH THE AUTHORITATIVE GEOMETRY WE ALREADY PAID FOR?" |
| `checks/claims-curvature-vs-band.mjs` | (Tally, 2026-08-14) — CURVATURE vs OFFSET DISTANCE, station by station, BOTH FACES. |
| `checks/claims-cutover-casualties.mjs` | ⭐ THE CUTOVER-CASUALTY CLASS. |
| `checks/claims-dblock-arc-diagnosis.mjs` | (Tally, 2026-08-14) — THE D-BLOCK ARC: two candidate mechanisms, measured side |
| `checks/claims-deadend-notch-standoff.mjs` | THE CHECK: at every frozen dead-end cap, the block (iA) must stand off the |
| `checks/claims-deadend-populations.mjs` | The dead-end population, reproduced — THREE populations, side by side, because |
| `checks/claims-deadend-set-decomposition.mjs` | decomposition.mjs — READ-ONLY. Written for PIPELINE-CLAIMS.md (Quill, 2026-08-05). |
| `checks/claims-deployment-id-single-source.mjs` | Do all the Apps Script deployment IDs still agree? |
| `checks/claims-displaced-casters-have-a-depth-material.mjs` | material |
| `checks/claims-divided-seam-step.mjs` | DOES THE DIVIDED↔UNDIVIDED SEAM STEP SURVIVE INTO THE FROZEN ARTIFACT? |
| `checks/claims-docs-carry-their-commands.mjs` | ⭐⭐⭐ THE DOC WRAP, AS A GATE INSTEAD OF A PROMISE. (Jacob, 2026-09-07: "The docs must be fixed |
| `checks/claims-every-baked-species-has-an-impostor.mjs` | every species in a baked census is in that slab’s atlas. |
| `checks/claims-every-category-has-a-full-treatment.mjs` | every category resolves to a COMPLETE class set. |
| `checks/claims-every-corner-is-configured.mjs` | pad is a band-slice, NOT predicated on the arc — so it works square OR round." |
| `checks/claims-every-corner-is-one-of-three.mjs` | ⭐⭐⭐ EVERY CORNER RENDERS AS ONE OF THE THREE SANCTIONED SPECS — OR IT IS A DEFECT. |
| `checks/claims-every-lu-tag-has-a-home.mjs` | home.mjs — CAN A TOWN BRING A WORD WE DO NOT KNOW? |
| `checks/claims-every-measurable-town-is-declared.mjs` | A TOWN THE KIT CAN MEASURE IS A TOWN THE KIT DECLARES. |
| `checks/claims-every-shadowed-placement-renders.mjs` | EVERY PLACEMENT THE GROUND SHADOWS MUST RENDER A TREE. |
| `checks/claims-every-turn-in-the-protopolygon-gets-an-arc.mjs` | ⭐⭐⭐ THE COMPLEMENT OF `claims-the-ease-is-the-corner`, AND THE HALF THAT WAS NEVER BUILT. |
| `checks/claims-every-water-body-reaches-the-kit-material.mjs` | material.mjs — DOES THE WATER ARRIVE? |
| `checks/claims-faces-on-the-ssot.mjs` | Jacob, 2026-09-06: "All data should skew to SSoT." Three geometries are frozen at prebake from |
| `checks/claims-fade-has-something-to-dissolve.mjs` | REPORT: does each town's block fill actually reach the fade band? |
| `checks/claims-false-deadend-census.mjs` | "IS THIS DEGREE-1 TIP A ROAD END, OR A FRAGMENT SEAM?" |
| `checks/claims-fetch-contains-the-forever-zone.mjs` | WHY. Jacob's eye, 2026-09-06: "the rest of the streets show around the disc, just these on |
| `checks/claims-frontage-covers-the-block.mjs` | ⭐⭐⭐ CAN ONE FRONTAGE OWN THREE SIDES OF A BLOCK? On some blocks it does, and that is the |
| `checks/claims-gas-schema.mjs` | The GAS backend's real shape, READ FROM SOURCE — never restated. |
| `checks/claims-grout-is-a-valid-polygon.mjs` | READ-ONLY. The POSITIVE-SIDE check, applied to the grout itself |
| `checks/claims-handle-rides-its-arc.mjs` | ── DOES THE AUTHORING HANDLE SIT ON THE ARC IT OWNS? ──────────────────────── |
| `checks/claims-hero-degrade-static.mjs` | static.mjs — A11-c gate (agent Vantage, 2026-08-07). |
| `checks/claims-inboard-side-convention.mjs` | READ-ONLY. Two questions left by claims-side-chain-falsifiers.mjs: |
| `checks/claims-inner-edge-deletion-gates.mjs` | the regression gates for deleting |
| `checks/claims-inner-edge-side-selector.mjs` | WHAT actually selects the ped-zeroed side on |
| `checks/claims-intake-absence-is-loud.mjs` | loud.mjs |
| `checks/claims-intake-is-consumed.mjs` | consumed.mjs — WHAT DID THIS TOWN FETCH THAT NOTHING USES? |
| `checks/claims-intersections-are-over-described.mjs` | ⭐⭐⭐ HOW OVER-DESCRIBED IS AN INTERSECTION? *(Jacob, 2026-09-08: "We need to simplify the corners |
| `checks/claims-leaf-pack-cells-agree.mjs` | A leaf pack's CELLS MUST BE INTERCHANGEABLE — the system assumes it and nothing checked. |
| `checks/claims-look-default-has-no-town.mjs` | "IS THE KIT'S 0-STATE A KIT, OR IS IT A TOWN?" — A11 / A00, the root gate. |
| `checks/claims-look-seed-scene-clean.mjs` | "DOES A NEW LOOK START CLEAN?" — A11 / D-C, the recurrence gate. |
| `checks/claims-marked-corners.mjs` | `clean/marker_strokes.json`; this classifies what is inside each one by CARRIED IDENTITY, so a |
| `checks/claims-matched-axes-have-matrices.mjs` | Without one, enumDistance returns farDistance (9) for ANY non-identical pair |
| `checks/claims-memory-index-health.mjs` | "WILL THE READ-IN STILL LOAD?" — the standing guard on the coordinator memory index. |
| `checks/claims-menu-item-ids.mjs` | Does every orderable menu item have a STABLE identity? |
| `checks/claims-named-way-becomes-street.mjs` | ⭐⭐ DOES A NON-VEHICULAR WAY BOUND A CITY BLOCK? — the check behind `ROADMAP A19`. |
| `checks/claims-no-coarse-value-decides.mjs` | The defect this exists for, measured 2026-08-26: SelecTree's `leaf_form` has three |
| `checks/claims-no-hairline-ring-reaches-the-operator.mjs` | CLAIM: every ring the operator is shown — ① and the ②/③ ped bands — has a real |
| `checks/claims-no-shadowed-chains.mjs` | WHY. Jacob's eye, 2026-09-06, on Survey: two navy centerlines running near-parallel with a |
| `checks/claims-no-slab-outlives-its-schema.mjs` | CLAIM: no baked slab is read under a fade model it was not baked for. |
| `checks/claims-no-tree-stands-on-drawn-hardscape.mjs` | NO TREE MAY STAND ON A SURFACE THE MAP DRAWS AS HARDSCAPE. |
| `checks/claims-node-pair-key-parity.mjs` | SLICE 1 of "fix the key". PROVE, DON'T SWITCH. |
| `checks/claims-objects-dissolve-with-the-ground.mjs` | CLAIM: trees, lamps and labels thin out over the SAME band the ground fades on — |
| `checks/claims-one-face-one-arrangement.mjs` | ⭐⭐⭐ "There should be no seams in runs, ever, period." (Jacob, 2026-09-07) |
| `checks/claims-one-frontage-one-arc.mjs` | ⭐⭐⭐ THINK IN ①. A block IS a closed polygon; each edge carries one owner; a CORNER is a vertex |
| `checks/claims-opting-out-of-the-fade-is-explicit.mjs` | CLAIM: a population that does not fade says so EXPLICITLY, and buildings are one. |
| `checks/claims-orphaned-customs.mjs` | It reported "27 of 76 authored leg slots are never read" (commit c430f4e9). |
| `checks/claims-override-provenance.mjs` | "WHOSE TOWN DOES THIS OVERRIDE BELONG TO?" — A11, the provenance classifier. |
| `checks/claims-ped-does-not-follow-the-rim.mjs` | rim runs ALONG the arc for tens of metres; a band that is CUT by the stamp meets it in chords |
| `checks/claims-physical-side-reconcile.mjs` | THE CHECK: does reconciling a road's pavementHW by the PHYSICAL side instead |
| `checks/claims-preclip-walk.mjs` | DOES THE PUNCH-OUT EVER SEE A CLIPPED VERTEX? |
| `checks/claims-price-of-record.mjs` | Can a DISPLAY FIGURE ever be charged? |
| `checks/claims-producer-does-not-decide-partition.mjs` | carry through the splice" (`ROADMAP.md` A06). It is FALSE as a statement about |
| `checks/claims-proto-band-flood-mechanism.mjs` | ⭐ WHICH DISEASE IS THE FAT BAND? — the discriminating measurement, not a thickness histogram. |
| `checks/claims-proto-blocks-are-faces.mjs` | + the raw neighborhood boundary) with the WORKING-TREE `mintProtopolygon`, so the frozen |
| `checks/claims-proto-corner-is-authored-radius.mjs` | the gate is: does ②'s eased contour actually turn at the radius the operator asked for? |
| `checks/claims-proto-curb-is-block-sized.mjs` | 2. the largest live ② ring is comparable to the largest real city block, not to the disc |
| `checks/claims-proto-curb-is-parallel.mjs` | protopoly) is smooth, their offsets should match." |
| `checks/claims-proto-curb.mjs` | ② THE CURB FROM THE PROTOPOLYGON. READ-ONLY. Does offsetting ① per-edge at the authored |
| `checks/claims-proto-fill-is-live.mjs` | ⭐⭐⭐ ③'s FILL, STRUCK LIVE PAST THE WALL — the STAMP INQUIRY, measured. |
| `checks/claims-proto-frozen-matches-live.mjs` | ⭐⭐⭐ THE FREEZE REPRODUCES THE CONSTRUCTION — the one claim a frozen artifact must earn. |
| `checks/claims-proto-identity.mjs` | if (!f) process.exit(1) |
| `checks/claims-proto-leg-tail-is-corner-reach.mjs` | decides whether the node handles are the WHOLE job or only half of it. |
| `checks/claims-proto-legmiss-by-producer.mjs` | WHY THIS EXISTS, AND IT IS A BASELINE QUESTION, NOT A GEOMETRY ONE. |
| `checks/claims-proto-median-is-a-hole.mjs` | Jacob's ruling, 2026-09-06: "the line segments which make up the split carriageways each get 2 |
| `checks/claims-proto-paints-into-medians.mjs` | It reported "Benton Place 17%"; Benton's median CORRECTLY carries no sidewalk. Jacob: "No." |
| `checks/claims-proto-stack-disjoint.mjs` | ③ THE PED STACK IS A SET OF DISJOINT RINGS — the check, not the number. |
| `checks/claims-proto-stack-reads-authoring.mjs` | WHY THIS EXISTS. Seven of the eight ①②③ probes in `scratch/` call |
| `checks/claims-proto-thin-curb-runs.mjs` | WHY. `?proto=1` shows ② as long thin runs on some streets. ⛔ THE FIRST QUESTION IS NOT "what is |
| `checks/claims-proto-tip-has-two-apexes.mjs` | WHY IT MATTERS. `RIBBONS §1` carries an UNMADE RULING: "a single cubic cannot hold a half-turn; |
| `checks/claims-proto-unrounded-corners.mjs` | named set of classes, not "some corners look wrong". |
| `checks/claims-proto-vertex-provenance.mjs` | Sizes the handles build: a SOURCE vertex can resolve its centreline node by carried identity |
| `checks/claims-proto-wall.mjs` | ⭐ THE WALL, ENFORCED BY READING THE SOURCE — not by a comment claiming it. |
| `checks/claims-recentre-removes-asymmetry.mjs` | READ-ONLY. Jacob, 2026-09-04: "there is NO asymmetrical case for the CHAIN ITSELF, for |
| `checks/claims-reference-credits.mjs` | The acknowledgements for the Salon's reference plates — GENERATED from the dossiers, |
| `checks/claims-repour-changes-nothing.mjs` | WHY THIS EXISTS. `promote-ribbons.js` and `ROADMAP A01` both carried a standing alarm that a |
| `checks/claims-revert-field-coverage.mjs` | coverage.mjs — CAN THE OPERATOR GET BACK? |
| `checks/claims-rim-census.mjs` | THE RIM CENSUS — what `pipeline.js`'s boundary clip costs, per scene. READ-ONLY. |
| `checks/claims-ring-partition.mjs` | "DOES THE FROZEN RING ALREADY CARRY A PARTITION WITH AN OWNER ON EVERY ARC?" |
| `checks/claims-scene-at-default.mjs` | "IS THIS SCENE AT THE STUDS?" — enumerate every surviving authoring gesture, |
| `checks/claims-scene-flag-is-the-equals-form.mjs` | form |
| `checks/claims-shader-fragments-declare-what-they-use.mjs` | EVERY IDENTIFIER A GLSL FRAGMENT USES |
| `checks/claims-side-baseline-audit.mjs` | VERIFY THE BASELINE BEFORE COMPARING TO IT. |
| `checks/claims-side-chain-falsifiers.mjs` | READ-ONLY. THE TWO FALSIFIABLE PREDICTIONS of the directed-side-chain / grout model, |
| `checks/claims-sidewalk-is-one-band.mjs` | ⭐⭐⭐ THE ACCEPTANCE, IN THE OPERATOR'S WORDS. |
| `checks/claims-simplify-preserves-authoring.mjs` | WHY THIS MUST RUN BEFORE THAT CHANGE. The drawn centreline and the line ① is built from are two |
| `checks/claims-species-map-routes-are-composed.mjs` | Every COMMON a scene routes must resolve to a COMPOSED species. |
| `checks/claims-spur-leg-offset.mjs` | READ-ONLY. ⭐ SCOPE, and it is the whole point of this file: |
| `checks/claims-stamp-follows-the-edge.mjs` | ⭐⭐⭐ DOES A ② CONTOUR EDGE CARRY THE OWNER OF THE ① EDGE IT LIES ALONG? |
| `checks/claims-stat-scope.mjs` | scope.mjs — A DISPLAYED FIGURE MUST DECLARE, AND MATCH, ITS SCOPE. |
| `checks/claims-survey-and-section-agree.mjs` | Section opens `_shapeArtifact` through `sectionOpen`. Under ① both must come from ①②③ and |
| `checks/claims-swap-reaches-the-paint.mjs` | ⭐⭐⭐ THE OPERATOR'S GESTURE, AS A GATE. (Jacob, 2026-09-07: "The swap regime doesn't work on |
| `checks/claims-the-ao-belongs-to-its-ground.mjs` | ground |
| `checks/claims-the-block-underlay-never-shows.mjs` | `BlockGeometryV2Debug.jsx`: `sectionGeos.block` is "the frozen block silhouette, under the LU |
| `checks/claims-the-capture-frame-is-the-clip-frame.mjs` | THE FRAME A BAND IS CUT IN MUST BE THE FRAME THE CAMERA CLIPS IN. |
| `checks/claims-the-corner-extent-is-carried.mjs` | ⭐⭐⭐ THE CORNER'S EXTENT IS CARRIED, NOT RECOVERED — and this reads the artifact, never a rule. |
| `checks/claims-the-corner-record-reports-the-achieved-radius.mjs` | CLAIM: the corner record the operator's handle rides reports the radius the arc |
| `checks/claims-the-dev-servers-do-not-import-the-looks-index.mjs` | no dev server imports a file it WRITES. |
| `checks/claims-the-ease-is-the-corner.mjs` | ⭐⭐⭐ THE EASE IS THE CORNER TEST. `iaCorner` used to be "① TURNS *and* the owner changes" — a |
| `checks/claims-the-fade-tracks-the-active-disc.mjs` | disc.mjs — WHOSE CIRCLE IS THE MAP FADING OVER? |
| `checks/claims-the-key-light-is-a-real-body.mjs` | body.mjs — IS ANYTHING ACTUALLY THERE? |
| `checks/claims-the-pad-is-the-size-of-the-corner.mjs` | ⭐⭐⭐ THE ADA PAD IS THE SIZE OF THE CORNER — the gate on the canary Jacob marked 2026-09-07. |
| `checks/claims-the-publish-gate-pushes-where-staging-deploys.mjs` | THE PUBLISH GATE MUST PUSH WHERE THE DEPLOY ACTUALLY LISTENS. |
| `checks/claims-the-publish-panel-reports-the-address-it-shipped.mjs` | no site URL is a module constant. |
| `checks/claims-the-ramp-has-room.mjs` | ⭐⭐⭐ THE RAMP NEEDS SOMEWHERE TO HAPPEN, AND ① HAS NOWHERE TO PUT IT. |
| `checks/claims-the-shore-says-what-it-is-made-of.mjs` | of.mjs — CAN THE KIT TELL STONE FROM SAND? |
| `checks/claims-the-slab-envs-do-not-collide.mjs` | STAGING AND PRODUCTION MUST NOT SERVE THE SAME SLAB. |
| `checks/claims-the-slab-freshness-key-is-not-stale.mjs` | NO SLAB ARTIFACT MAY BE NEWER THAN THE KEY THAT BUSTS IT. |
| `checks/claims-the-slope-is-on-the-leg.mjs` | ⭐⭐⭐ THE ACCEPTANCE FOR THE RAMP, AND IT IS A CONTINUITY TEST, NOT A DIMENSION ONE. |
| `checks/claims-the-survey-reaches-the-measure.mjs` | ⭐⭐⭐ DOES THE CITY'S SURVEY REACH THE MAP? — the join, scored, for any town that has one. |
| `checks/claims-through-node-width-step.mjs` | THE CHECK: at a THROUGH-NODE — a ring vertex where two consecutive runs carry |
| `checks/claims-twilio-webhook-guard.mjs` | does sms-webhook actually reject a forged POST? |
| `checks/claims-uturn-outer-edge-walk.mjs` | THE CHECK: walk the OUTER EDGE (the asphalt polygon `iA`) of every tile that |
| `checks/claims-verify-taxon.mjs` | taxon.mjs — asserts vocabulary.mjs `verifyTaxon`. |
| `checks/claims-water-scales-with-its-body.mjs` | body.mjs — DOES THE WATER KNOW HOW BIG IT IS? |
| `checks/claims-zero-separation-offset.mjs` | READ-ONLY. Three questions, none of which has been measured: |
