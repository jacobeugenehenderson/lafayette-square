# The bake uploaded — excisions, 2026-10-05 (Latch, BRIEF-publish-is-the-upload)

Superseded text, kept verbatim for the record. Why: Jacob, 2026-10-04 — *"I don't think it makes sense to 'upload' at
that step. If the operator turns things off or adjusts the pyramid, that's supposed to be 'accepted' when they publish
and promote."* A bake now ends on disk; Publish freezes the manifest (accepting the deployment) and uploads to staging.
Live homes: `cartograph/OPERATIONS.md` (*Bake* › THE UPLOAD · *Publish*) · `PUBLISH.md §6` · `cartograph/BAKE.md` ·
`cartograph/FEATURES.md` (Preview). ▶ `node checks/claims-a-bake-never-uploads.mjs`

## `cartograph/BAKE.md` — removed lines

> ⛔⛔ **AND THE POUR'S LAST STEP IS AN UPLOAD (2026-09-01).** `public/baked/` is gitignored; the slab is
> served from R2. `scripts/upload-baked-to-r2.mjs` runs at the end of the bake and **a failed upload fails
> the whole bake (500)** — a green bake that reached nobody is the one outcome worth refusing, and it is
> exactly the shape this pipeline refuses everywhere else. ⚠️ **The pour is then live on staging AND
> production immediately**, at the same URLs, without a push; `PREVIEW.md §0.2` settled that Preview — not
> staging — is the gate for slab data. Operator view: `cartograph/OPERATIONS.md §Bake`. Mechanics:
> `PUBLISH.md §6`. It is the boundary between the **authoring** world (cartograph: stores, live re-derivation, the operator's eye) and the **runtime** world (LS: trust the slab, never reach back).

## `PUBLISH.md` — removed lines

> | Frontend → **staging** | press **Publish to Staging** in Preview — it uploads the slab check + the shared player to R2; no branch. ▶ `node checks/claims-the-publish-gate-pushes-where-staging-deploys.mjs` |
> | **Re-poured a town** | nothing to push — the bake uploads the slab to R2 **STAGING** (`staging/baked/…`) and it is live on the staging site immediately. ⛔ **It does NOT reach production.** Verify on staging, then promote: `node scripts/upload-baked-to-r2.mjs --env=prod --look=<id>` (§6) |
> ⛔⛔ **BUT THE SLAB IS NO LONGER WHAT YOU COMMIT (2026-09-01).** This line used to read *"serve the committed slab, so the artifacts you committed are exactly what deploys (bake + commit before you push)"* — **that instruction is now wrong and following it ships nothing.** `public/baked/` is gitignored and served from R2 (§6). The pour uploads it; git carries only `design.json`, `looks/index.json`, `ribbons.json` and the OG image. ⭐ **So a slab reaches its environment WITHOUT a push, and code still needs one.** ⚠️ **Corrected 2026-09-03:** this line, and the row above, used to say a pour was *"live immediately, on staging AND prod"* — it was, and that was the defect, not the design. One bucket, one un-prefixed key space, both workflows resolving the same `VITE_ASSET_BASE`: a pour reached lafayette-square.com with **no preview and no gate**, while code had a full staging loop. The bake now writes `staging/baked/…` only; promotion is its own deliberate gesture. The slab save→ship discipline (source-vs-derived, dirty-tree triage, the symptom→door table) lives in **`cartograph/OPERATIONS.md §Save → ship`**.
> The bake endpoint runs `scripts/upload-baked-to-r2.mjs` as its **last step** and **fails the bake**
> (500) if the upload fails — a green bake that reached nothing is the one outcome worth refusing.
> ⭐ **A bake may only ever write `staging/`; `--env=prod` is the separate, deliberate promotion.**
> *(The paragraph that stood here — "one bucket serves staging and production at the same URLs… per-
> environment prefixes are the fix if it ever bites" — is retired: it bit on 2026-09-03 and the
> prefixes landed. `--env` is now required and has no default.)*

## `cartograph/OPERATIONS.md` — removed lines

>   from R2; the bake's last step, `scripts/upload-baked-to-r2.mjs --env=staging`, writes **staging** keys only
>   (prod is Promote), and a failed upload **fails the bake** rather than returning a green slab that reached nobody.
>   ▶ `node scripts/verify-baked-in-r2.mjs` (PUBLISH §6).
> Pick **Desktop / Phone hi / Phone lo**; the amber **deployment** panel (right) lists that surface's post-effects. Where you leave the boxes is what the surface ships: **autosaved** to `cartograph/data/<map>/deployment.json` (one file per town), carried into the manifest by the **next bake**, so Bake then Publish to put it on staging. The panel says *baked* or *ships at the next bake*. ⛔ The Scene / Post-FX rows below it are **inspection** (temporary, `preview.layers.v3`) and never reach the file. **Every phone runs Phone lo** until phones can be told apart; Phone hi is stored for then. A town with no file ships everything everywhere (its manifest says `authored: false`). ▶ `node checks/claims-deployment-has-one-authority.mjs`
> | **A pour looks like it did nothing** | The bake fails loudly (500) when its R2 upload fails, so check the bake's own response first. A green bake means the bucket has it. |
> | **Bake returns 500: "the slab reaches nobody — N of 915 objects FAILED"** | R2 hands back a transient 500 on a small fraction of puts. Since 2026-09-04 each put **retries 4× with backoff**, so a survivor of that is a real failure — read the key it names. ⛔ Don't re-run the whole pour to fix one object: the upload is **incremental**, so re-running only re-puts what actually differs (~15 s when nothing does). |

## `cartograph/FEATURES.md` — removed lines

> **Owns: the publish-confidence gate — *know* the slab will ship before it does, no push-and-wait.** Renders exactly what production renders, plus the inspection toolkit (per-layer cost, phone frame, layer-toggle matrix, TOD scrub) — and the proving ground where the operator (a) reads each channel's *tax against a target-device budget* — benchmarked to **two real reference phones** (iPhone 16 Pro Max as the ceiling, a Samsung Galaxy A54/A55 as the floor we hold ourselves to), not the operator's desktop, (b) makes the **per-surface deployment call** (which effects ship to desktop and to phones; it autosaves, and the next bake ships it) right beside the gauge that responds, and (c) catches the three things a fast desktop hides — thermal, memory, and crash-on-transition. If a layer is too hot here, it surfaces before a mobile user feels it; if something looks right in Stage but wrong in Preview, the bake didn't propagate. **And it ships:** *Publish to Staging* gives each town a private preview link, and *Promote to Production* puts that town — alone — on its own domain (e.g. `provincetown.online`), running the exact bytes that were previewed, in whichever player its staging site plays (the Ward, or the old player until its cutover); no other town changes. Model: `PREVIEW.md`; shipping: `PUBLISH.md §0.5`. *(Every control and how to read it: [`OPERATIONS.md`](OPERATIONS.md) "Preview.")*

