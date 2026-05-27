# Front-Front-End & Productization — seed doc

> Seed, not a spec. Started 2026-05-27 (Boz + Jacob) to stop the productization
> vision living only in conversation. NOT a "build now" — a "keep in mind as we
> audit/clean everything else, and capture as we go." Grow this over time.

## The product stack (what's actually the product)

Corrected 2026-05-27. Three distinct tiers, three monetization surfaces:

1. **The Cartograph** = the FACTORY — the authoring suite (arborist + meteorologist as
   internal/à-la-carte modules) that *produces* slabs. The licensable product. (LS is the
   product *to Jacob* — his deliverable — but in market terms the Cartograph is the product.)
2. **The Slab** = the portable PRODUCT/FORMAT — baked `scene.json` + bins. "Theoretically
   anyone can build whatever they want on it." Governed by the render-vs-content boundary
   (slab carries content; consumer brings rendering).
3. **Consumers** = what's built on a slab. **LS is reference consumer #1**; there could be N.

Plus a cross-cutting access surface:

4. **API** = programmatic access (developer-facing AND internal). Only possible over a
   single-source-of-truth, documented system — so the cleanup *is* API-enablement. The
   proto-API already exists: the three `serve.js` backends serve `/api/*` (cartograph looks,
   meteorologist presets/almanac/modulators/specialist-seed, arborist). Audit inventories
   them → formalize once clean. Gets a developer-docs layer in the Show Bible.

**One technical spine — de-hardwire + single-source-of-truth + document — feeds all four
surfaces.** The audit matrix gets a column: of every hardcoded value + every endpoint, *what
does exposing it cleanly unlock — a setting (tier 1), a slab field (tier 2), an API route
(tier 4), or all of them?* The cleanup IS the productization, seen through four lenses.

The front-front-end productizes tier 1 (the Cartograph). Slab-completeness productizes tier 2.
The endpoint inventory seeds tier 4. All fed by the same de-hardwiring work below. NONE built
now — the campaign builds the precondition (clean + documented); these are the horizons it earns.

## The gap

We've "en-kit-ified" the product the whole way — the authoring tools (cartograph,
arborist, meteorologist) and the LS consumer app are modular. But the product is
still missing its **front-front-end**: the **intake step, setup, and settings**.
Today the kit is hardwired to *one* instance (Lafayette Square). The front-front-end
is the layer that turns "our LS instance" into "a thing someone else configures and
stands up."

## The key unification (why this rides along for free)

**Every LS-specific hardcoded value we excise during the Rip-Up/Clean-Out is a future
setting.** The de-hardwiring inventory and the intake/settings spec are the same list
seen from two ends:

- geography (lat/lon, the SunCalc anchor)
- slab framing (browse bounds, hero subject, camera presets)
- map source / basemap / centerlines
- asset roots (photos, GLBs, the published slab)
- integrations + secrets (Supabase URL/keys, deploy target, any login/password)
- brand/theme (CSS tokens, palette, copy)

→ So the pathologist audits **tag each hardcoded specific as a "future setting"
candidate.** That tagged list is the first draft of what the intake screen must collect
and what settings must exist. No extra work — it's a column in the audit matrix.

## The three documentation purposes (drives the Show Bible shape)

1. **Marketing** — "you can do this and this." Per-app, extractable, consumer-facing.
   Doubles as a vestigial-code detector: a capability that reads as nonsense flags dead code.
2. **Fundraising** — "here are all the moving pieces." The master package / map.
3. **Engineering** — "what it is, how you reach it, how to fix it, how to troubleshoot it."

Each helper app is potentially **marketable / à-la-carte on its own** → its product sheet
must stand alone, not just be an internal note.

## Keep-in-mind lens (during the audit/cleanup campaign)

- When excising hard-wiring → record the value as a candidate setting here (or in the audit matrix).
- When consolidating to single-source-of-truth → the single source is the natural home a setting overrides.
- When writing capability statements → note which capabilities are LS-bespoke vs. generic-kit.

## Open (for later)

- Intake UX: what a new operator provides to start a map (the first screen).
- Setup/settings surface: where configuration lives, per-instance vs. per-Look.
- Auth/tenancy: who logs in, what's gated.
- Packaging: à-la-carte helper distribution vs. full-kit.
