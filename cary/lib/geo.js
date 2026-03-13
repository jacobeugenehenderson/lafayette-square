/**
 * Cary — GPS Filtering & Distance Accumulation
 *
 * Filters noisy GPS data and computes trip distance from a stream of coordinates.
 */

/** Haversine distance between two WGS84 points, in meters. */
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** GPS filter thresholds */
const ACCURACY_CEILING = 20;       // meters — discard inaccurate fixes
const MIN_DISPLACEMENT = 10;       // meters — ignore jitter below this
const MAX_SPEED = 150 / 3.6;       // 150 km/h → m/s — discard teleports

/**
 * Determine whether a new GPS point should be accepted.
 * @param {object} point - { lat, lon, accuracy, timestamp }
 * @param {object|null} lastAccepted - previous accepted point (null on first)
 * @returns {{ accept: boolean, distance: number }} distance in meters if accepted
 */
export function filterPoint(point, lastAccepted) {
  // Reject low-accuracy fixes
  if (point.accuracy > ACCURACY_CEILING) {
    return { accept: false, distance: 0 };
  }

  // First point is always accepted
  if (!lastAccepted) {
    return { accept: true, distance: 0 };
  }

  const dist = haversine(lastAccepted.lat, lastAccepted.lon, point.lat, point.lon);

  // Reject jitter
  if (dist < MIN_DISPLACEMENT) {
    return { accept: false, distance: 0 };
  }

  // Reject teleports
  const dt = (point.timestamp - lastAccepted.timestamp) / 1000; // seconds
  if (dt > 0 && dist / dt > MAX_SPEED) {
    return { accept: false, distance: 0 };
  }

  return { accept: true, distance: dist };
}

/**
 * Accumulate distance from an array of raw GPS points.
 * Returns total distance and the filtered points.
 * @param {Array} points - [{ lat, lon, accuracy, timestamp }, ...]
 * @returns {{ totalMeters: number, filtered: Array }}
 */
export function accumulateDistance(points) {
  let totalMeters = 0;
  let lastAccepted = null;
  const filtered = [];

  for (const point of points) {
    const { accept, distance } = filterPoint(point, lastAccepted);
    if (accept) {
      totalMeters += distance;
      lastAccepted = point;
      filtered.push(point);
    }
  }

  return { totalMeters, filtered };
}
