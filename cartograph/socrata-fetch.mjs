/**
 * socrata-fetch.mjs — read a Socrata (SoQL) dataset over the town's envelope, the way every kit fetcher does it.
 * The `socrata` protocol of cartograph/states/index.mjs PROTOCOLS (NYC Open Data and its peers); the ArcGIS sibling
 * is cartograph/arcgis-fetch.mjs, and the rules are the same:
 *
 * ⭐ curl to a FILE, not through a pipe (a citywide layer over a generous envelope runs to tens of MB).
 * ⛔ execFileSync with an ARGV, never a shell string: a `where` clause is declaration text.
 * ⛔ Socrata reports a bad query as a non-200 with a JSON body; that is an ERROR, never "no rows".
 * ⛔ A partial set is refused: the count is asked first, and the pages must add up to it.
 * ⭐ The envelope is `within_box(<geom>, north, west, south, east)` on the dataset's geometry column, ANDed with the
 *    well's own `where`. Socrata serves geometry as WGS84 GeoJSON whatever the source projection (NYC's is EPSG:2263,
 *    US feet) — so nothing downstream reprojects, and nothing here assumes a unit.
 * Optional: SOCRATA_APP_TOKEN in the environment raises the rate limit; without it the public limit applies.
 */
import { readFileSync, rmSync } from 'fs'
import { execFileSync } from 'child_process'

const UA = 'lafayette-square-cartograph/1.0 (neighborhood pour kit)'

export function socrataGet(resource, params, tmpPath) {
  const args = ['-sS', '-m', '180', '-A', UA, '-o', tmpPath, '-w', '%{http_code}', '--get']
  if (process.env.SOCRATA_APP_TOKEN) args.push('-H', `X-App-Token: ${process.env.SOCRATA_APP_TOKEN}`)
  for (const [k, v] of Object.entries(params)) args.push('--data-urlencode', `${k}=${v}`)
  args.push(resource)
  try {
    const status = Number(execFileSync('curl', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim())
    const txt = readFileSync(tmpPath, 'utf8')
    let j
    try { j = JSON.parse(txt) } catch {
      throw new Error(`Socrata ${status}: did not return JSON (first 200 chars): ${txt.slice(0, 200)}`)
    }
    if (status !== 200 || !Array.isArray(j)) throw new Error(`Socrata ${status}: ${j?.message || JSON.stringify(j).slice(0, 300)}`)
    return j
  } finally { rmSync(tmpPath, { force: true }) }
}

// The envelope clause for a WGS84 bbox ({minLon,minLat,maxLon,maxLat}). ⛔ A bbox without four numbers throws.
// `geomField` is the dataset's geometry column (`within_box`), or — for a dataset that publishes only numeric
// coordinates (NYC's 2015 tree census has no geometry column) — `{ lat, lon }`, scoped by a numeric range instead.
export function withinBox(geomField, bbox) {
  for (const k of ['minLon', 'minLat', 'maxLon', 'maxLat']) {
    if (!Number.isFinite(bbox?.[k])) throw new Error(`bbox has no numeric \`${k}\` — cannot scope the Socrata fetch.`)
  }
  const col = (c) => { if (typeof c !== 'string' || !/^[a-z_][a-z0-9_]*$/.test(c)) throw new Error(`"${c}" is not a Socrata column name`); return c }
  if (geomField && typeof geomField === 'object') {
    return `${col(geomField.lat)} between ${bbox.minLat} and ${bbox.maxLat} and ${col(geomField.lon)} between ${bbox.minLon} and ${bbox.maxLon}`
  }
  return `within_box(${col(geomField)}, ${bbox.maxLat}, ${bbox.minLon}, ${bbox.minLat}, ${bbox.maxLon})`
}

export const envelopeClause = (geomField, where, bbox) =>
  [withinBox(geomField, bbox), where && where !== '1=1' ? `(${where})` : null].filter(Boolean).join(' AND ')
// ⛔ A well must name its columns (`columns`, never `select` — `select` is the town SELECTOR a state well's resolver
// consumes, cartograph/states/index.mjs). Missing → refused here, by name, before the server is asked.
const needColumns = (resource, columns) => { if (!columns || typeof columns !== 'string') throw new Error(`${resource}: the well declares no \`columns\``) }

/** The count in the envelope and ONE row — a dry run reads nothing more. */
export function socrataSample({ resource, geomField, where, columns, bbox, tmpPath }) {
  needColumns(resource, columns)
  const clause = envelopeClause(geomField, where, bbox)
  const count = Number(socrataGet(resource, { $select: 'count(*)', $where: clause }, tmpPath)[0]?.count)
  const row = socrataGet(resource, { $select: columns, $where: clause, $order: ':id', $limit: 1 }, tmpPath)[0] || null
  return { count, row }
}

/**
 * Every row of `resource` in the envelope (and the well's `where`), paged in a stable order.
 * Returns { rows, count }. Throws if the pages do not add up to the count asked first.
 */
export function socrataFetchAll({ resource, geomField, where, columns, bbox, tmpPath, page = 10000, log = () => {}, get = socrataGet }) {
  needColumns(resource, columns)
  const clause = envelopeClause(geomField, where, bbox)
  const count = Number(get(resource, { $select: 'count(*)', $where: clause }, tmpPath)[0]?.count)
  if (!Number.isFinite(count)) throw new Error(`Socrata gave no count for ${resource}`)
  log(count)
  const rows = []
  for (let offset = 0; offset < count; offset += page) {
    const got = get(resource, { $select: columns, $where: clause, $order: ':id', $limit: page, $offset: offset }, tmpPath)
    rows.push(...got)
    if (got.length < page && rows.length < count) break
  }
  if (rows.length !== count) {
    throw new Error(`${resource}: the server said ${count} rows and returned ${rows.length} — a partial set is a silently wrong town; refusing.`)
  }
  return { rows, count }
}
