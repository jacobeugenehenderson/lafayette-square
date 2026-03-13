/**
 * Cary — Fare Meter
 *
 * Shared between server (authoritative) and client (local preview).
 * All money values in cents. All distances in meters. All durations in seconds.
 *
 * Pricing: $1 flat platform fee per transaction. $5 minimum fare.
 * Courier always keeps fare minus $1. No percentages, no surprises.
 */

/** Default fare configuration */
export const DEFAULT_FARE_CONFIG = {
  base_fare_cents: 150,       // $1.50 flag drop
  per_minute_cents: 20,       // $0.20/min
  per_meter_cents: 0.056,     // ≈ $0.90/mile (1609m)
  minimum_fare_cents: 500,    // $5.00 minimum
  platform_fee_cents: 100,    // $1.00 flat
  processing_fee_rate: 0.029, // Stripe 2.9%
  processing_fee_flat: 30,    // Stripe $0.30
};

/**
 * Compute the raw fare from distance and duration.
 * @param {number} distanceMeters - accumulated trip distance
 * @param {number} durationSeconds - elapsed trip time
 * @param {object} config - fare configuration
 * @returns {number} fare in cents
 */
export function computeFare(distanceMeters, durationSeconds, config = DEFAULT_FARE_CONFIG) {
  const minutes = durationSeconds / 60;
  const fare = config.base_fare_cents
    + Math.round(minutes * config.per_minute_cents)
    + Math.round(distanceMeters * config.per_meter_cents);
  return Math.max(fare, config.minimum_fare_cents);
}

/**
 * Break down a fare into all components for display and payment.
 * @param {number} fareCents - raw fare from computeFare()
 * @param {object} config - fare configuration
 * @returns {object} full breakdown in cents
 */
export function computeBreakdown(fareCents, config = DEFAULT_FARE_CONFIG) {
  const platformFee = config.platform_fee_cents;
  const chargeableTotal = fareCents + platformFee;
  const processingFee = Math.round(
    chargeableTotal * config.processing_fee_rate + config.processing_fee_flat
  );
  const requesterTotal = chargeableTotal + processingFee;
  const courierPayout = fareCents;

  return {
    fare: fareCents,
    platform_fee: platformFee,
    processing_fee: processingFee,
    requester_total: requesterTotal,
    courier_payout: courierPayout,
  };
}
