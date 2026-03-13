/**
 * Cary — Dispatch Logic
 *
 * Matches requests to nearby available Couriers and manages notification fan-out.
 */

import { haversine } from './geo.js';

/** Maximum radius to search for available Couriers, in meters. */
const DISPATCH_RADIUS = 2000; // 2km — covers the full neighborhood

/** How long a request stays open before auto-cancelling, in seconds. */
export const REQUEST_TTL = 300; // 5 minutes

/**
 * Find Couriers within dispatch radius of a place, sorted by proximity.
 * @param {object} place - { lat, lon } of the request origin
 * @param {Array} couriers - [{ id, lat, lon, status, vehicle_type }, ...]
 * @returns {Array} eligible couriers sorted nearest-first, with distance_meters
 */
export function findNearbyCouriers(place, couriers) {
  return couriers
    .filter((c) => c.status === 'available')
    .map((c) => ({
      ...c,
      distance_meters: haversine(place.lat, place.lon, c.lat, c.lon),
    }))
    .filter((c) => c.distance_meters <= DISPATCH_RADIUS)
    .sort((a, b) => a.distance_meters - b.distance_meters);
}

/**
 * Build a notification payload for a new request.
 * @param {object} request - the request row
 * @param {object} place - { name, address, lat, lon }
 * @param {object} requester - { display_name }
 * @returns {object} notification payload
 */
export function buildNotification(request, place, requester) {
  return {
    title: `New ${request.type} request`,
    body: `${requester.display_name} at ${place.name}`,
    data: {
      request_id: request.id,
      type: request.type,
      place_lat: place.lat,
      place_lon: place.lon,
    },
  };
}
