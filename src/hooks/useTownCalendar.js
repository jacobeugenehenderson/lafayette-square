/**
 * useTownCalendar(lookId): the town's PUBLISHED calendar (its content/events.json, as the bake carried it into the slab),
 * for <Town calendar>. Every app that mounts <Town> passes this; the town's displays read their season from it.
 *
 *   null              not answered yet (a display is off; nothing refuses)
 *   [rows]            the calendar
 *   { absent: true }  the town publishes none: its MANIFEST says so (manifest.content['events.json'] === null)
 *   { error }         it could not be read: no manifest, a manifest with no content index, or a listed file that does not
 *                     answer. ⛔ A failed read is never taken for absence (Zob, 2026-10-31: that turns a deploy fault into a
 *                     statement): a display that needs a season refuses with the error, by name, inside its boundary.
 * Read through the slab resolver (src/lib/slabUrl.js: the manifest is the no-cache switch, and a published file has an
 * immutable content name), never a hand-made URL. ▶ node checks/claims-a-towns-calendar-reaches-its-displays.mjs
 */
import { useEffect, useState } from 'react'
import { slabManifest, slabFetch } from '../lib/slabUrl.js'

export async function readTownCalendar(lookId) {
  const m = await slabManifest(lookId)
  if (!m) return { error: `"${lookId}" has no manifest.json, so whether it publishes a calendar is unknown` }
  if (!m.content || !('events.json' in m.content)) return { error: `"${lookId}"'s manifest carries no content index for events.json (re-run bake-manifest)` }
  if (m.content['events.json'] === null) return { absent: true }
  const res = await slabFetch(lookId, 'content/events.json')
  if (!res.ok) return { error: `"${lookId}"'s manifest lists content/events.json, and it answered ${res.status}` }
  const j = await res.json()
  const rows = Array.isArray(j) ? j : j?.events
  return Array.isArray(rows) ? rows : { error: `"${lookId}"'s content/events.json holds no rows` }
}

export default function useTownCalendar(lookId) {
  const [cal, setCal] = useState({ lookId: null, value: null })
  useEffect(() => {
    if (!lookId) return
    let dead = false
    readTownCalendar(lookId).then(v => { if (!dead) setCal({ lookId, value: v }) }, e => { if (!dead) setCal({ lookId, value: { error: String(e?.message || e) } }) })
    return () => { dead = true }
  }, [lookId])
  return cal.lookId === lookId ? cal.value : null   // a town switch never shows the last town's calendar
}
