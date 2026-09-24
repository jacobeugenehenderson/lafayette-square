import { supabase, supabaseConfigured } from './supabase'
import { getDeviceHash } from './device'
import { INSTANCE } from '../instance.js'

/**
 * Writes to Cary's commercial state — the price of record, availability, and
 * the per-restaurant pause.
 *
 * Every call goes through the `commerce-write` edge function, which asks GAS
 * whether this device hash holds the `menu` permission on this listing before
 * touching anything. ⛔ There is no direct-write path and there must not be one:
 * `commerce_items` and `commerce_places` carry no write policy at all
 * (migration 018), so a client attempting PostgREST directly gets nothing.
 *
 * ⚠️ The role the client believes it has is a `localStorage` cache
 * (`lsq_guardian_listings`) and means nothing here. It decides what UI to SHOW;
 * the server decides what may be written. Do not conflate the two.
 */

async function invoke(payload) {
  if (!supabaseConfigured) {
    return { ok: false, code: 'unconfigured', error: 'Ordering is not configured for this installation' }
  }
  const device_hash = await getDeviceHash()
  const { data, error } = await supabase.functions.invoke('commerce-write', {
    // The town, so the Guardian check reads THIS town's Guardians — never Lafayette Square's by default.
    body: { ...payload, device_hash, look: INSTANCE.lookId },
  })
  // ⛔ A transport failure is reported as a failure. It must never read as a
  // successful no-op — a guardian who believes they confirmed a menu that is
  // still unpriced will find out from a customer.
  if (error) return { ok: false, code: 'transport', error: error.message || 'Could not reach the commerce service' }
  if (data?.ok !== true) return { ok: false, code: data?.code || 'failed', error: data?.error || 'Write failed' }
  return { ok: true, written: data.written }
}

/**
 * Confirm, reprice, or 86 items.
 *
 * @param listingId  the GAS listing id
 * @param items      [{ item_id, price_cents, confirm, available }]
 *                   `confirm: true` with a price is what makes an item sellable.
 *                   `confirm: false` withdraws it — the price stays recorded but
 *                   is no longer chargeable, which is the difference between
 *                   "we changed our mind" and "we never checked".
 */
export function writeCommerceItems(listingId, items) {
  return invoke({ op: 'items', listing_id: listingId, items })
}

/** Pause/resume ordering, or set the delivery minimum. ⛔ `tax_remitter` is not
 *  settable from here — it is a legal determination, not a restaurant setting. */
export function writeCommercePlace(listingId, patch) {
  return invoke({ op: 'place', listing_id: listingId, ...patch })
}
