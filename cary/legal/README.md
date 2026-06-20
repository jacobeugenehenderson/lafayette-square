# Cary — Legal Canon

**The authoritative, human/lawyer-facing source of truth for the Lafayette Square Deliveries / Cary legal layer.** These are the documents you mark up, a lawyer reviews, and where the *reasoning* behind each clause lives. The live app renders contract text at regulator-facing URLs (`/terms/courier`, `/terms/restaurant`, `/privacy`); this folder is the canon those renders should agree with.

> ⚠️ **Draft / orientation — NOT legal advice.** Authored with research (see `legal-readiness-brief.md`) but not by a licensed attorney. Nothing here is enforceable or relied-upon until a Missouri-licensed attorney (and, per jurisdiction, local counsel) reviews it. Two items are explicitly flagged for the lawyer in the readiness brief.

---

## The architecture — core + per-instance rider (the same shape as the kit)

Cary is one **activity** hung on a neighborhood **Slab** (see the project's Slab/instance doctrine). Its legal layer follows the same core-plus-rider structure the runtime already uses via `src/instance.js`:

- **The core** (jurisdiction-neutral) — the *relationship*: IC status, the comp model, conduct, handling, the free-to-decline / accountable-for-claimed principle, indemnity. Written once, portable to any neighborhood. Lives in the agreement docs here.
- **The rider** (per-jurisdiction) — only the variables that change by place: governing law, classification regime, age gates, alcohol pathway, sales-tax/facilitator obligation, fee-disclosure law, gig-pay mandates, insurance, service area, restricted-goods schedule. Lives in `rider-template.md`; each neighborhood fills its own.

This mirrors the product exactly: **the Slab is industrialized (Cartograph), the harness is hand-fit (per instance)** — and so is the law. `instance.js` is where the *fixed-truth* per-instance config already lives (geography, name, domain, Cary contacts); the rider variables are the legal extension of that same idea.

## SSoT direction (TODO — not built yet)

Today the live contract text is hardcoded LS/Missouri values inside JSX arrays (`src/components/CourierOnboarding.jsx` → `AGREEMENT_SECTIONS`; `src/pages/LegalPage.jsx` → `RESTAURANT_SECTIONS`). That means two potential homes for the same fact. **The target state:** the JSX *derives* its sections from a parameterized legal module that reads rider values from `INSTANCE`, exactly as the runtime derives geography from `INSTANCE`. Then there is genuinely one home, and a new neighborhood's contracts regenerate from its rider. Until that refactor lands, this canon is authoritative and the JSX is propagated *from* it by hand — keep them in lockstep.

## The documents

| File | What it is |
|---|---|
| `courier-agreement.md` | Courier Independent-Contractor Agreement (the person who delivers) |
| `sender-agreement.md` | Sender Participation Agreement (restaurant / package store / future general deliverables — generalizes the old "Restaurant Agreement") |
| `places-guardian-terms.md` | Places & Guardian Terms — content license + Section 230 posture for the MySpace-style profile layer |
| `rider-template.md` | The per-jurisdiction schedule. Missouri filled with confirmed values; California stubbed. |
| `legal-readiness-brief.md` | The cited research findings + the two items to hand a lawyer + open questions |

## Conventions

- **Rider variables** appear inline with the Lafayette-Square/Missouri value shown and tagged **`‹rider›`**, e.g. *"governed by the laws of the State of Missouri `‹rider›`"*. The tag marks what a new instance must re-fill; the shown value is the LS default.
- **Three age gates** run throughout: **Deliver 16+** (no motor vehicle), **Drive 18+** (motor vehicle), **Alcohol 21+** (any alcohol run). These are distinct; an alcohol run requires 21+ regardless of tier.

*Authored 2026-06-20. Keep one-kind (Reference); prune as it ages.*
