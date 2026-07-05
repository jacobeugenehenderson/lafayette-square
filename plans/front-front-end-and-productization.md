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

## ⭐ The two faces of the decoupling — the operating frame (2026-07-05, Boz + Jacob)

The productization above resolves into **one decoupling with two faces, meeting at one seam.** It is *not* two projects, though it feels like it — the session that clarified this started at "a blank cartograph/slab" and surfaced "a Universal Reader" as if separate. They're the **producer and consumer of the same thing.**

```
   PRODUCER face                    THE SEAM                      CONSUMER face
 "blank cartograph/slab"      the INSTALLATION PAYLOAD          "Universal Reader"
 the kit pours ANY       →    · instance config (identity)  →  the app reads ANY
 neighborhood into a          · content Layers 0–2              installation, ZERO
 self-contained               · module manifest (on/off)       hardcodes, deployable
 installation payload         · branding                       on 3rd-party sites
```

- **Producer face — "blank cartograph/slab":** the kit pours any neighborhood into a **self-contained installation payload** (data folder + baked slab + look + content + config) — the *installation template*. **HPDM is accidentally the cleaner template; LS is the legacy installation to back-port onto it** (LS predates its own template: content buried in `src/data`, legacy `[-15,-15]` boundary center vs HPDM's Extent-tool `[0,0]` + `content/roster.json`).
- **Consumer face — "Universal Reader":** the app is a **generic reader with zero hardcodes** that boots any payload. **Governing gate (Jacob, 2026-07-05): nothing installation-specific may be a literal in the reader** — acceptance test = grep the reader for LS literals → zero. New axis this session: the Reader must eventually deploy on **other people's websites/URLs** — a *distinct* deploy story from slab-publishing (bake → Pages, already built). That distribution mechanism is the furthest horizon — **design the seam now, don't build it yet.**
- **The seam — the INSTALLATION PAYLOAD** (the contract both faces meet at), four parts:
  1. **Instance config** — geography, id, endpoints, **branding** (title/OG/domain per install; installation #1's value is "Lafayette Square"). `src/instance.js` is the seed.
  2. **Content — Layers 0–2** — ✅ RATIFIED `NEIGHBORHOOD-INPUTS §5.1.1`: L0 profile (population/name/tagline), L1 building ledger, L2 listings; joined by the slab building id.
  3. **Module manifest** — which features an installation runs (delivery on/off, …). Design the seam now; LS = all-on.
  4. **Slab + look** — already kit-clean (HPDM pours + renders through the identical pipeline; the look transfers byte-identical).

**Naming (settled this session):** "Lafayette Square" = the **Product**; the Lafayette Square *neighborhood* = installation #1, eponymous. We are **not de-branding** — we are **de-installation-hardwiring.** Each installation supplies its own branding; #1's happens to equal the Product name.

**⭐ Product-level constant vs installation-specific (Jacob, 2026-07-05).** The zero-hardcode gate targets *installation-specific* literals only — **Product-level constants legitimately stay literal.** Examples: the Product name "Lafayette Square"; **"Cary"** = the delivery program's name/structure (fixed across installations). Neighborhoods vary their *participants* (SMS number, couriers, zone) — not the program's name. So there's no INSTANCE field for "Cary"; `modules.delivery.enabled` gates presence, participant data carries the variation. The audit's job is to sort literals along this axis, not blindly parameterize every LS-adjacent string.

### Where we are (2026-07-05)
- **Seam / content slice — DONE:** content schema §5.1.1 ratified + committed (`a5976993`); HPDM example payload committed (`5410301d`); a content researcher is filling it.
- **Design settled (not coded):** the two-faces frame, the installation-payload contract, Product-vs-installation naming, the module-manifest axis, the zero-hardcode gate.
- **Not started (code):** the CONSUMER face — runtime instance boot, content-sidecar wiring, the **hardcode audit**, branding templating, module-gate seam (= the blank-app arc, `HANDOFF-blank-app-instance-decoupling.md`, now strengthened to the zero-hardcode gate + module seam). Reader-distribution-to-3rd-party-sites is the horizon beyond.

### The layering (so scope stays honest)
- **Near-term:** de-hardwire the reader → installation template; unblocks HPDM as installation #2. **Parallelizable:** operator + researcher pour the payload (producer face) while we build the reader to read it (consumer face) — the two don't block each other.
- **Horizon:** the Universal Reader's *distribution* (deploy on customer URLs, cross-origin slab, injected config, backend multi-tenancy). Design the seam; defer the build.

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
