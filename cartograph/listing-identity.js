// listing-identity.js — the ONE definition of LISTING identity. The listing twin of
// `msbf-identity.js`, and it exists for the same reason that one does.
//
// ⛔⛔ A LISTING'S DISPLAY ID (`huro-lst-0245`) USED TO BE A POSITION, NOT AN IDENTITY.
// `assignDisplayIds` sorted the unpinned listings by their source key and counted — "idempotent
// on unchanged input", which was true and was the problem: one new business that sorted early
// shifted every number after it. And everything outside the bake is keyed by that number — a
// Guardian's claim, a Sheet row of Place Card edits, a menu, a photo, an event's `listing_id`. So a
// pour that added one listing silently re-pointed all of them at the wrong business.
// ⭐ Buildings had the same defect (the fetch ARRAY INDEX) and were sealed on 2026-07-22; this is
// that fix, one layer down (ROADMAP H-29).
//
// ⭐ THE KEY IS THE SOURCE'S OWN IDENTITY: `_key` — `ovt-<GERS id>` on an Overture base,
// `osm-<id>` on an OSM one — which the producers already mint and which is stable across
// releases. The registry maps that key to the display id, and:
//   · a key seen before gets its old id back, forever;
//   · a new key appends at `highWater + 1`;
//   · a key that disappears keeps its id RESERVED — it is never handed to another business.
// A listing with an AUTHORED id — an override add, or a base listing whose patch pins `id` — is not
// the registry's to number; the registry only guarantees never to issue that id to anything else,
// and refuses an authored id that would renumber a business it already numbered.
//
// ⛔ NO FALLBACKS. An unpinned listing without a `_key`, two listings with one key, a pinned id
// the registry already gave away, or a registry for a different prefix all THROW — each is a
// question about the data, and answering it with a plausible number is the failure this file
// exists to end.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export function registryPath(contentDir) {
  return join(contentDir, 'listing-identity.json')
}
export function loadRegistry(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
}
// Deterministic serialization, keys sorted — a no-op bake must produce a byte-identical file.
// ⭐ No writer here: the bake writes it through `io.js#writeIfChanged`, like every other artifact.
export function serializeRegistry(reg) {
  const ids = Object.fromEntries(Object.keys(reg.ids).sort().map(k => [k, reg.ids[k]]))
  return JSON.stringify({ meta: reg.meta, ids }, null, 1) + '\n'
}

const format = (prefix, n) => `${prefix}-lst-${String(n).padStart(4, '0')}`

/**
 * Give every listing its permanent display id.
 *   existing registry — reuse each key's id; new keys append at ++highWater.
 *   null registry     — a scene's FIRST sealed bake: number exactly as the old positional scheme did
 *                       (sorted by key, skipping pinned ids), so today's ids carry over unchanged,
 *                       and freeze that numbering for every bake after.
 * Mutates each listing's `id`; returns the (new) registry and what happened.
 */
export function assignListingIds(listings, prefix, registry) {
  const pinned = new Set(listings.filter(l => l.id).map(l => l.id))
  const unpinned = listings.filter(l => !l.id)

  const seen = new Set()
  for (const l of unpinned) {
    if (!l._key) throw new Error(`listing-identity: "${l.name}" has neither an authored id nor a source key (_key) — it cannot be given a permanent id. Every producer must mint _key.`)
    if (seen.has(l._key)) throw new Error(`listing-identity: two listings share the source key "${l._key}" — one business cannot be two listings.`)
    seen.add(l._key)
  }
  const byKey = [...unpinned].sort((a, b) => a._key.localeCompare(b._key))

  if (!registry) {
    // The seal: the old positional numbering, frozen.
    let n = 1, high = 0
    const ids = {}
    for (const l of byKey) {
      let id
      do { id = format(prefix, n); n++ } while (pinned.has(id))
      l.id = id; ids[l._key] = id; high = Math.max(high, n - 1)
    }
    return { registry: { meta: { prefix, highWater: high }, ids }, report: { sealed: true, reused: 0, minted: byKey.length } }
  }

  if (registry.meta?.prefix !== prefix) {
    throw new Error(`listing-identity: the registry numbers "${registry.meta?.prefix}-lst-*" but this scene's prefix is "${prefix}" — refusing to mix two numberings.`)
  }
  const ids = { ...registry.ids }
  const issued = new Set(Object.values(ids))
  // An authored id on a business the registry already numbered would move its claims to a new number.
  for (const l of listings) {
    if (l.id && l._key && ids[l._key] && ids[l._key] !== l.id) {
      throw new Error(`listing-identity: "${l.name}" (${l._key}) has the permanent id ${ids[l._key]}, and an override now authors ${l.id} for it — that would move everything keyed by ${ids[l._key]}. Author ${ids[l._key]} instead, or remove the authored id.`)
    }
  }
  for (const id of pinned) {
    const holder = Object.keys(ids).find(k => ids[k] === id && !listings.some(l => l.id === id && l._key === k))
    // Even a RETIRED key's id stays its own: a claim or a Sheet row may still point at it.
    if (holder) {
      throw new Error(`listing-identity: the authored id "${id}" was issued to source key "${holder}"${seen.has(holder) ? '' : ' (no longer in the base, but its id stays reserved)'}. Give the override add a different id.`)
    }
  }
  let high = registry.meta.highWater
  let reused = 0, minted = 0
  for (const l of byKey) {
    if (ids[l._key]) { l.id = ids[l._key]; reused++; continue }
    let id
    do { high++; id = format(prefix, high) } while (pinned.has(id) || issued.has(id))
    l.id = id; ids[l._key] = id; issued.add(id); minted++
  }
  return { registry: { meta: { prefix, highWater: high }, ids }, report: { sealed: false, reused, minted } }
}

/**
 * The seal's safety net. The first sealed bake numbers positionally, which reproduces today's ids
 * only if nothing changed since the last bake. So before the seal is written, compare it with the
 * listings.json already on disk and name every id that would move.
 * ⭐ Compared per (building, name) GROUP, as a set: listings.json carries no other identity, and one
 * building can hold two listings of one name (a researched add beside its OSM twin; two POIs for one
 * school). Matching them one-to-one would pair a twin with the other twin and report a move that is
 * not one. A group whose ids are the same set before and after has moved nothing.
 */
export function idsThatWouldMove(listings, onDisk) {
  const norm = s => (s || '').toLowerCase().replace(/\s+/g, ' ').trim()
  const group = (list) => {
    const g = new Map()
    for (const l of list || []) {
      const k = `${l.building_id}|${norm(l.name)}`
      if (!g.has(k)) g.set(k, { name: l.name, ids: [] })
      g.get(k).ids.push(l.id)
    }
    return g
  }
  const before = group(onDisk), after = group(listings)
  const moved = []
  for (const [k, now] of after) {
    const was = before.get(k)
    if (!was) continue
    const a = [...was.ids].sort().join(','), b = [...now.ids].sort().join(',')
    if (a !== b) moved.push({ name: now.name, was: a, now: b })
  }
  return moved
}
