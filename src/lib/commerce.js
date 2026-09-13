/**
 * Orderability — the one place that decides whether an item can be SOLD, and at
 * what price.
 *
 * ⛔⛔ THE RULE THIS FILE EXISTS TO ENFORCE: **A SEEDED PRICE IS NOT A PRICE.**
 *
 * `item.price` — the number on the bundled editorial menu or the guardian's
 * authored copy — is a DISPLAY FIGURE. It can be shown. It can never be charged.
 * The only chargeable number is `price_cents` on a confirmed `commerce_items`
 * row (migration 018). Those are different kinds of thing that happen to be
 * denominated the same way, which is exactly why they were easy to conflate.
 *
 * So `priceOfRecord` is null until someone confirmed it, and an item with no
 * price of record is not orderable — not "falls back to the display figure".
 * A fallback here would charge a customer a number nobody checked, and it would
 * look entirely correct on the way past.
 *
 * ⭐ Everything downstream reads `priceOfRecord` and never `item.price`. The
 * check `checks/claims-price-of-record.mjs` asserts there is no input at all
 * for which this returns an orderable line carrying a display figure.
 */

/** Why an item cannot be ordered. The reason is the product, not a detail —
 *  "we're out of that" and "nobody has priced this yet" are different
 *  sentences to a customer and different jobs for a guardian. */
export const BLOCKED = {
  NO_COMMERCE: 'no_commerce',      // commerce isn't configured for this town at all
  PAUSED: 'paused',                // the restaurant stopped taking orders
  UNCONFIRMED: 'unconfirmed',      // no price of record — nobody has confirmed this item
  EIGHTY_SIXED: 'eighty_sixed',    // the kitchen can't make it right now
  OUT_OF_WINDOW: 'out_of_window',  // this menu type isn't being served at this hour
  NO_LONGER_ON_MENU: 'stranded',   // in a cart, but the item has left the menu
}

export const BLOCKED_COPY = {
  [BLOCKED.NO_COMMERCE]: 'Ordering isn’t set up here yet',
  [BLOCKED.PAUSED]: 'Not taking orders right now',
  [BLOCKED.UNCONFIRMED]: 'Not yet priced for delivery',
  [BLOCKED.EIGHTY_SIXED]: '86’d — the kitchen is out',
  [BLOCKED.OUT_OF_WINDOW]: 'Not served at this hour',
  [BLOCKED.NO_LONGER_ON_MENU]: 'No longer on the menu',
}

/**
 * Can this item be sold right now, and for how much?
 *
 * @param item      the menu item (content — carries the DISPLAY figure)
 * @param row       its `commerce_items` row, or null/undefined if there is none
 * @param place     its `commerce_places` row, or null/undefined
 * @param opts.inWindow  is the item's menu type being served at this hour
 * @param opts.commerceLoaded  has commercial state actually been fetched
 * @returns { orderable, blockedBy, priceOfRecord, displayPrice }
 */
export function itemOrderability(item, row, place, { inWindow = true, commerceLoaded = false } = {}) {
  const displayPrice = item?.price ?? null
  const priceOfRecord = row?.confirmed_at && row?.price_cents != null ? row.price_cents : null

  // ⛔ Unloaded is NOT "allow for now". Until commercial state has actually
  // arrived we do not know whether anything is sellable, and the honest
  // rendering of not knowing is a menu you can read but not order from.
  const blockedBy =
    !commerceLoaded ? BLOCKED.NO_COMMERCE
    : place?.ordering_paused ? BLOCKED.PAUSED
    : !inWindow ? BLOCKED.OUT_OF_WINDOW
    : priceOfRecord == null ? BLOCKED.UNCONFIRMED
    : row?.available === false ? BLOCKED.EIGHTY_SIXED
    : null

  return { orderable: blockedBy === null, blockedBy, priceOfRecord, displayPrice }
}

/**
 * Resolve a whole cart against the live menu and the live commercial state.
 *
 * One resolution feeds the count, the money and the notices, so they cannot
 * disagree with each other — the shape that let a total quietly shrink.
 *
 * `stranded` and `blocked` are returned separately because they are different
 * sentences: stranded means the item left the menu, blocked means it is still
 * there but not sellable this minute.
 */
export function resolveCart(cart, { itemIndex, rows, place, orderableSections, commerceLoaded }) {
  const lines = []
  const stranded = []
  const blocked = []

  for (const [key, qty] of Object.entries(cart || {})) {
    if (!(qty > 0)) continue
    const itemId = key.split('#')[0]
    const entry = itemIndex?.get(itemId)

    if (!entry) { stranded.push({ key, qty, blockedBy: BLOCKED.NO_LONGER_ON_MENU }); continue }

    const verdict = itemOrderability(entry.item, rows?.get(itemId), place, {
      inWindow: orderableSections ? orderableSections.has(entry.sectionIdx) : true,
      commerceLoaded,
    })

    if (!verdict.orderable) {
      // Out-of-window is not a fault — the menu pills already say the kitchen
      // isn't serving this now, so it is dropped quietly rather than alarming.
      if (verdict.blockedBy !== BLOCKED.OUT_OF_WINDOW) {
        blocked.push({ key, qty, item: entry.item, blockedBy: verdict.blockedBy })
      }
      continue
    }

    lines.push({ key, qty, item: entry.item, unitPriceCents: verdict.priceOfRecord })
  }

  return {
    lines,
    stranded,
    blocked,
    count: lines.reduce((a, l) => a + l.qty, 0),
    // ⭐ Reads unitPriceCents — the price of record — and has no access to a
    // display figure to fall back to.
    subtotalCents: lines.reduce((a, l) => a + l.unitPriceCents * l.qty, 0),
  }
}
