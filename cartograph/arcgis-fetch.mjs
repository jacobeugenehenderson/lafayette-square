/**
 * arcgis-fetch.mjs — one GET against an ArcGIS REST endpoint, the way every kit fetcher does it.
 * Shared by fetch-parcels.mjs and fetch-address-points.mjs (one home for the rules below).
 *
 * ⭐ curl to a FILE, not through a pipe: a county layer over a generous envelope runs to tens of MB and a pipe's
 *    maxBuffer becomes a silent ceiling on how big a town may be.
 * ⛔ execFileSync with an ARGV, never a shell string: a `where` clause is operator text from the declaration.
 * ⛔ ArcGIS reports failure INSIDE a 200. A page that errors must not read as "no more pages".
 */
import { readFileSync, rmSync } from 'fs'
import { execFileSync } from 'child_process'

const UA = 'lafayette-square-cartograph/1.0 (neighborhood pour kit)'

export function arcgisGet(url, params, tmpPath) {
  const args = ['-sS', '-m', '180', '-A', UA, '-o', tmpPath, '--get']
  for (const [k, v] of Object.entries(params)) args.push('--data-urlencode', `${k}=${v}`)
  args.push(url)
  try {
    execFileSync('curl', args, { stdio: ['ignore', 'ignore', 'inherit'] })
    const txt = readFileSync(tmpPath, 'utf8')
    let j
    try { j = JSON.parse(txt) } catch {
      throw new Error(`endpoint did not return JSON (first 200 chars): ${txt.slice(0, 200)}`)
    }
    if (j.error) throw new Error(`ArcGIS error ${j.error.code}: ${j.error.message} ${(j.error.details || []).join('; ')}`)
    return j
  } finally { rmSync(tmpPath, { force: true }) }
}
