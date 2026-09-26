# Diary — PUBLISH / OPERATIONS text superseded by per-town production sites (2026-09-26)

Retired for CURRENCY, not truth-at-the-time. Moved here by `BRIEF-production-sites` when Promote stopped
pushing `main` and each town got its own `.online` site. Live home: `PUBLISH.md §0.5` and
`cartograph/OPERATIONS.md` § Production sites.

## From PUBLISH.md — Quick reference rows

| Frontend → **staging** | commit, then push the trunk → `staging.yml` deploys staging. ⛔ **Do not read the branch name off this page** — it has been wrong for four weeks before now: `node checks/claims-the-publish-gate-pushes-where-staging-deploys.mjs` derives it from the workflow |
| Promote **staging → prod** | once staging is verified: `git push origin <branch>:main` → `deploy.yml` deploys lafayette-square.com (clean fast-forward; main + trunk stay a few commits apart) |
| **Promote a slab to prod** | `node scripts/upload-baked-to-r2.mjs --env=prod --look=<id>` — writes the production keys; live on lafayette-square.com immediately, still without a push. ⛔ `--env` is required and has no default. ▶ `node checks/claims-the-slab-envs-do-not-collide.mjs` |

## From PUBLISH.md — §0.5 (the subpath-first deploy model, 2026-07-04)

Superseded by the 2026-09-26 rulings: each town is served at its own `.online` domain; the domain's one
home is Operations; the player is one build, pinned per town.

## 0.5 The multi-neighborhood deploy model — one factory, many destinations

> **The "end process" doctrine** (2026-07-04, prompted by the HiPointe-DeMun URL purchase). The rest of this doc is the LS-specific mechanics; this section is the *frame* those mechanics serve once there is more than one neighborhood. Reference — the developer/operator model for how a poured neighborhood reaches the public.

**Two independent axes, never one decision.** They *feel* fused because "move Bake onto the live site" touches both at once — keep them apart and each has a clean answer:

- **Axis A — WHERE it deploys (destination/domain).** `jacobhenderson.studio/<hood>` vs. the neighborhood's own apex (`hipointedemun.com`). **This is a per-instance *variable*, not a fork.**
- **Axis B — WHO holds the authoring keys (the install *tier*).** *Guided install* (you at the wheel, sharing the rendered result) vs. *full 3rd-party self-serve* (the "front-front-end"). This is about **where the factory lives**, and the higher tier is deferred (`plans/front-front-end-and-productization.md`).

**Axis A — one factory, many destinations.** A neighborhood is a data folder (`cartograph/data/<hood>`) → bakes to a slab (`public/baked/<hood>`) → pointed to by `INSTANCE.lookId` (`src/instance.js`), `?look=`/`?scene=` override. **One build already serves LS + toy + hipointe-demun.** The deploy destination is *not* wired into the artifact — it's a CNAME + the domain field in `instance.js`. The **same built bytes** get re-homed at a different target; this is literally how staging already works today (`staging.yml` builds `dist/` and pushes it to a *separate* repo with its own `--base`). So a per-neighborhood destination is that same move with a different target — **config, not architecture.**

- **The concrete surface for Axis A:** the Publish endpoints in `cartograph/serve.js` (dev-only) hardcode `STAGING_BRANCH` and `PROD_BRANCH = main` and commit a scoped `slabPathspecs` for one look. **Parameterizing those two constants + the pathspecs by scene is the whole job.** Small, well-bounded — not yet built. ⚠️ **Live drift (2026-07-11): `STAGING_BRANCH` still = `cartograph-looks-pass-ab`, the dead pre-2026-07-08 branch that deploys nothing** (`staging.yml` moved to `curb-offset-draw`, `26a62407`). So the Preview's Publish→staging button currently pushes to a branch no workflow watches — fix the constant to `curb-offset-draw` when the parameterization lands (or sooner).

**Axis B — keep the factory local (that's the point of the tiers).** *Guided install* ships **slabs, not tools** — the authoring app (Stage/Bake) never leaves your machine, so you're never anchored to a client's project; the "shared creative" happens through the preview/publish loop (they react to the staging URL, you iterate). "Move Bake onto the live site" is **Tier B, deferred** — the only tier where live-site authoring makes sense, and the tier where the anchoring worry is solved by design (they drive, not you). Don't build it to serve a guided install.

**The one real tradeoff — a neighborhood's *default* home:**

| | Subpath (`studio/<hood>`) | Own apex (`<hood>.com`) |
|---|---|---|
| Infra now | ~zero (one build, one Pages target) | per-hood Pages target + CNAME + `--base` |
| Product story | weaker (shares studio identity) | strong ("this is HiPointe's civic thing") |
| Worth it when | proving the pour · guided installs | a client who's paid for their own home |

> **Recommendation (settled):** default to the **subpath now**, make the deploy target a **per-instance variable**, and **promote to an apex only when a client commits** — so promotion is a one-line config change, never a re-architecture. That keeps everything in "one factory, many destinations" and never anchors you.

**On buying the domain:** buy `<hood>.com` for the *name* if you want (cheap option value), but it's **decoupled** from the technical work — the pour ships to the studio subpath regardless, and the domain just becomes a CNAME you flip later. Don't let the purchase gate or reshape the build. *(HiPointe stages first to `jacobhenderson.studio/hipointe-demun`; see `NEIGHBORHOOD-INPUTS.md §7` step 8 for the pour sequence, `cartograph/_archive/HANDOFF-hipointe-pour-step0-LANDED-2026-07-02.md` for step-0 state.)*

> **Interim — the Preview Publish buttons for a non-LS look (decided 2026-07-06, Boz + Jacob).** Because the domain is decoupled (above), the "Push"/Publish button does **not** no-op. **Staging stays live for every look** — one build serves all, so `?look=hipointe-demun` already previews on the staging site. **Prod-promote for a non-LS look is disabled with an honest label** ("ships to its own home once its deploy target's set"), *never* a silent no-op — a button that lies about working is the misleading-UI anti-pattern (`feedback_stale_opaque_overlay_worse_than_hidden`). The real unblock is the per-scene destination (`STAGING_BRANCH`/`PROD_BRANCH`/pathspecs parameterized by scene, above) — small, well-bounded, not yet built. ⏳ **Guard not yet wired in code** — this note records the *decision*; the Preview Publish panel still shows the LS-scoped buttons. Tracked in `HANDOFF-blank-app-instance-decoupling.md`.

---


## From cartograph/OPERATIONS.md — Preview § Publish, first two bullets

- **"Publish to Staging"** pushes your working branch to whichever branch `.github/workflows/staging.yml` deploys from. ⛔ It was pinned to a branch nothing had deployed since 2026-08-02, so the button ran, reported success, and staging never moved — a silent no-op at the gate. ▶ `node checks/claims-the-publish-gate-pushes-where-staging-deploys.mjs` derives both halves from source and fails if they part company again. **Never take the branch from memory or from this page — the check is the answer.**
- ⚠️ **"Promote to Prod" is not a slab publish — it ships the whole branch.** It fast-forwards `main` to your working HEAD, so every commit you are carrying goes to production, not just the baked look. That is a *release*, and it deserves its own moment rather than being reached for while re-pouring.

## From cartograph/OPERATIONS.md — Preview § Publish, the state and no-git bullets (as of 2026-09-21)

- **One line per target, and the button carries the state (2026-08-29).** Each button reads **"Publish to Staging"** or, once that site is serving your latest, **"Published to Staging"** — past-tense and inert, because there is nothing left to press. **Visit → sits beside it** and is a property of the look, not of a push you happened to watch. ⛔ **AND THE ADDRESS IS DERIVED FROM THE LOOK YOU SHIPPED (2026-09-21).** It used to be two module constants, so pressing Publish on huron reported `…/lafayette-square-staging/` and `lafayette-square.com` — a truthful "published ✓" handing you another town's address. Now: **staging** is the shared site with your look named on it (`?look=<id>`, verified in a browser to render that town from its own slab) and is marked `*` to say the site's NAME is not yours yet; **production** is the town's own authored `domain` (`src/instances/<map>.js`), and a town that declares none — huron says `domain: null`, "no deploy target yet" — shows **"no address"** with the reason on hover, never a substitute. ▶ `node checks/claims-the-publish-panel-reports-the-address-it-shipped.mjs`. ⭐ **AND THE BUTTON GOES PAST-TENSE ON BOTH ARTIFACTS, NOT ONE (2026-09-21).** A staging publish ships the **slab** *and* the shared **player**, so "Published to Staging" now requires both to be current: the live `scene.json#bakedAt` for the slab, and a build marker at `staging/player/build.json` — the newest source mtime that build came from — for the player. ⛔ **No marker counts as STALE**; an unstamped player is not a current one. ⚠️ It used to require `ahead === 0` against the old staging branch, which stopped being pushed the same day, so the button could never reach its done state however many times it worked (Jacob: *"it's hard to tell"*). ▶ `node checks/claims-the-publish-button-can-say-it-is-done.mjs`. ⚠️ **ONE SHARED STAGING SITE IS TODAY'S STATE, NOT THE DESIGN.** This line used to read *"every town has its own staging site"*, which was never built; it is now **ruled** (2026-09-21, Jacob: one site per Map — the Publish button is the unit) and boarded as `ROADMAP` H-18 ①/④. ⛔ **The state is READ, never remembered:** every mount fetches what each site actually serves (`scene.json#bakedAt`) and compares it to yours. That survives a refresh — the row used to be written only by a button press, so a hard-refresh made it and the Visit link vanish while the deploy was live and fine — and it measures **the artifact being served**, so it stays right when a deploy fails silently, which no commit count does.
- ⛔ **No branch name and no commit counts on this panel** — *"the user shouldn't know about the git"* (Jacob). The git comparison still runs, but only to *gate* Promote when there is nothing to promote; the moment one of those numbers reaches the operator's eye the panel is leaking again.
