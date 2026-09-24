# Listing ids were positional — SUPERSEDED 2026-09-24

Retired when `cartograph/listing-identity.js` sealed listing ids (live home: `cartograph/ARCHITECTURE.md`, THE LISTING IDENTITY LOCK; operator: `cartograph/OPERATIONS.md`). `assignDisplayIds` was removed from `bake-content.js`. The sentences below were true until then.

## cartograph/OPERATIONS.md, the town calendar

> Listing ids are re-derived on every pour, so this is precisely the reference that rots; a dead one
> would be a ticker headline that clicks through to nothing.

## ROADMAP.md H-29

> (the **display** id, assigned by `assignDisplayIds` at bake time and deleted from the output at `bake-content.js:982`)

## checks/claims-the-directory-has-exactly-one-order.mjs

> ⚠️ `assignDisplayIds` DOES sort,
>  * which made it read as though a discipline existed: it sorts a filtered copy to hand
>  * out id numbers and never reorders the array it returns.

## src/lib/listingOrder.js

> ⚠️ `assignDisplayIds` DOES sort, which made it read as though an ordering discipline existed — it sorts a filtered copy to hand out id numbers and never reorders the array it returns.

## cartograph/bake-content.js — `assignDisplayIds` (removed)

> Deterministic display-id assignment. Override adds keep their pinned id; base listings get the next free hpdm-lst-NNNN in a stable sort — idempotent on unchanged input, and referenced ids (menus/photos) never reassigned.

It was idempotent only on unchanged input: a new key that sorted early renumbered every listing after it.
