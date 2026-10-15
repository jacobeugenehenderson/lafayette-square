// flightDestination.js — WHERE A FLIGHT WILL LAND, said at its first frame (2026-10-14).
// ShotFlight knows a flight's destination before the camera moves (`fly`, at t = 0). Whatever must be ready when the
// camera arrives — the shore's near stone (SlabRevetment) — reads it here and prepares it while the camera is in the air,
// so the landing view is whole and no frame of the motion pays for it. One channel; ShotFlight is its only writer.
const subs = new Set()
/** @param d { pos: [x, y, z], target: [x, y, z], to: shot, duration: ms } */
export function publishFlightDestination(d) { for (const cb of subs) { try { cb(d) } catch (e) { console.error('[flight] a destination listener failed', e) } } }
/** @returns the unsubscribe */
export function onFlightDestination(cb) { subs.add(cb); return () => subs.delete(cb) }
