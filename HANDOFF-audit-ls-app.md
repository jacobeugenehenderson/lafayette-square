# Handoff — LS App Pathologist (forensic audit)

> **You ARE the dispatched agent.** Name yourself; sign your commits with it. Read
> `AUDIT-MATRIX.md` first (shared columns, classification, guardrails, cross-cutting threads).
> Read-only walk this phase — NO code changes.

## What you're auditing — and the prize

**Lafayette Square is the product Jacob ships AND reference consumer #1 of the slab.** The
Cartograph makes a slab; the LS app *consumes* it. Your highest-value deliverable is the
**slab CONTRACT audit** — because the slab is a portable FORMAT others could theoretically
build anything on (the render-vs-content boundary: the slab carries *content*, the consumer
brings *rendering*). So for everything the app renders, answer: **does it read the slab, or
secretly hardcode?** Every "production ≠ Stage" bug is a contract violation, and we've been
fixing them one at a time — you map the whole surface at once.

A hardcoded LS-specific is a **triple gap**: a future-setting (productization), a slab-field
(format completeness), AND a barrier to third-party builds. Tag all three in the matrix.

## Your domain

The production consumer app + the integration/emit seam: `src/components/Scene.jsx`,
`LafayetteScene.jsx`, listings, place-cards, `ContactModal`, nav/UI, root `index.html`, the
deploy path (`.github/workflows/deploy.yml` → GitHub Pages on push-to-main), and auth (Supabase).

**Not yours:** the authoring tools (Cartograph), tree/cloud internals.

## The walk

Fill **`scratch/audit-ls-app.md`** in the matrix format. Centerpiece = the **slab-contract map**:
a read-vs-hardcoded table for every slab-derived thing (camera framing, browse bounds, hero
subject, neon, depth, buildings, terrain, trees, sky…). This session already found the camera
reading stale `PRESETS` instead of the slab — assume more like it.

Domain emphases:
- **Endpoint inventory** — the `/api/*` the app + tools consume (the proto-API; seeds the future
  API surface / tier 4). List them.
- **Deploy + auth + "what's behind a login/password"** live here — the Show Bible needs this
  documented; you're the source.
- You **own the shipped mobile regime** (the `IS_MOBILE` render path: antialias/dpr/shadows/
  deferred-lamps/post-fx tier) + integration; co-own the authoring/preview side with Cartograph.
- You **own LS's CSS** in the token reconciliation: `src/index.css` (the app entry) + the two
  token files are your primary input — reconcile *toward* one source with Cartograph (don't design
  new; see `AUDIT-MATRIX.md` cross-cutting note). Identify what `public/codedesk/styles/theme.css` is.

## Guardrails / defaults

Per `AUDIT-MATRIX.md`: read-only; classify dead/duct-tape/real; evidence-before-excision; Boz signs
deletions. Defaults (flag to change): LS owns shipped-mobile; CSS reconcile-not-design. Surface scope drift.

## Deliverable

`scratch/audit-ls-app.md` with the **slab-contract read-vs-hardcoded map** as its centerpiece, plus
the endpoint inventory and the deploy/auth facts for the Bible.
