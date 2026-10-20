# Intake census: what we take in, and where it is lost

*Lath, 2026-10-20, for Boz (Jacob: "we need to make sure we are keeping as much as we take in"). Read-only.*
*Reproduce with `node scratch/intake-census/census.mjs [town …]`. The standing check is `node checks/claims-intake-is-lossless.mjs`. ⛔ The figures below are as of each town's last pour;
re-run the command rather than quoting them.*

**Verdicts.**
- **DELIBERATE** — a named rule in the code says so.
- **SILENT** — the data is dropped and nothing names the drop.
- **PROXY** — measured indirectly, because the next record carries no id to join on.

## 0 · Fetch passes (Jacob's scoping: a light bbox fetch, then the deep fetch for the radius)

**No town's `osm.json` is a light + heavy pair.** None carries `heavyBbox`, so every town was fetched as ONE full pass:

```
fetch.js --pass=all   →   pass = null   →   LIGHT_WAYS + HEAVY_WAYS and LIGHT_NODES + HEAVY_NODES
```

That single pass runs over the frame bbox. So "what the light pass omits by design" is moot on the current data: each town holds both tag sets over one envelope.

Within that pass, `fetch.js` itself drops these at parse:

| What Overpass sends | Kept in `osm.json`? | Verdict |
|---|---|---|
| node ids (way `nodes[]`, and every vertex) | **No.** A vertex is `{lon,lat,x,z}`. The raw response is deleted after parse (`overpass.mjs` `rmSync(tmp)`). | **SILENT** |
| tags on geometry nodes | Never asked for: `out skel qt` returns geometry nodes without tags. Only nodes matching `LIGHT_NODES` / `HEAVY_NODES` come back with tags (→ `pois`). | by query design |
| relation members that are nodes or relations | Dropped. `members.filter(m => m.type === 'way')`. | **SILENT** |
| member roles other than `inner` | Folded into outer (`role !== 'inner'`) | **SILENT** |
| a way with < 2 resolvable coords | Dropped (`coords.length < 2`) | DELIBERATE (commented) |
| a way returned twice | Dropped, per bucket (`dupDropped`, printed) | DELIBERATE |
| an untagged way that is no relation's member | Dropped | DELIBERATE (commented) |
| heavy-merge dedupe | `mergeGround` keys on `f.id`, which no feature has, so duplicates are KEPT. That is a gain, not a loss, and already flagged in fetch.js. | — |

**Cost of keeping more**, measured on each file's own JSON shape. These are estimates: a fake 11-digit id and a typical `out meta` block, not a re-fetch.

| town | `osm.json` | + node id per vertex | + `out meta` per element |
|---|---|---|---|
| lafayette-square | 12.8 MB | +2.3 MB (+18%) | +1.7 MB |
| hipointedemun | 45.1 MB | +9.0 MB (+20%) | +4.8 MB |
| huron | 7.5 MB | +1.5 MB (+20%) | +0.6 MB |
| jacksonheights | 76.2 MB | +13.2 MB (+17%) | +12.9 MB |
| provincetown | 23.1 MB | +4.6 MB (+20%) | +1.6 MB |

**Geometry-node tags cannot be costed from here.** How many vertices carry tags is unmeasured without one Overpass count query, which I did not run. Deepening the fetch is Jacob's decision; `fetch.js` is unchanged.

**A second intake keeps node ids today.** `raw/osm_kerbs.json` (kerb and crossing nodes) carries them into `ribbons.curbCutEvidence` and `crosswalkEvidence`. So the id-keeping shape already exists.

## 1 · `raw/osm.json` → `clean/skeleton.json`

**Highway ways reaching a chain or a path.**
- Every way except:
  - LS 14 (11 `cycleway` "21st Street Cycle Track", 2 construction, 1 proposed)
  - HPDM 4
  - PTown 2
  - Huron 0, JH 0
- The not-built ways are dropped by `NOT_BUILT`: DELIBERATE, and printed.
- The 11 LS cycleways are dropped by `EXCLUDE_FROM_STREETS`, a per-name list. ⚠ The list is meant to keep them out of the *street* network, but `groupByName` skips the whole name group, so they reach `paths[]` neither. They leave the product entirely. **The rule exists; its effect is wider than its name.**

**Highway relations** (pedestrian areas): all reach skeleton (Huron 1, JH 3, PTown 1).

**Paths.** `skeleton.paths` carry `osmId` and the full `tags`, in every town. Lossless.

**Chains: tags are mostly lost — SILENT.** A source way's tag counts as carried only when the chain holds that key with that value.

| town | (way, key) pairs | not carried | keys lost |
|---|---|---|---|
| lafayette-square | 5851 | 3176 (54%) | 67 |
| hipointedemun | 24821 | 15417 (62%) | 128 |
| huron | 5342 | 3139 (59%) | 59 |
| jacksonheights | 20449 | 8694 (43%) | 126 |
| provincetown | 4602 | 2142 (47%) | 77 |

- Only the synthetic (unnamed) chains carry a full `tags`. A named chain keeps `name`, the vote-won `highway`, `oneway`, `lanes`, `ref`, `layer`, `bridge`, `tunnel`, and the first fragment's `surface` / `maxspeed`.
- Top lost keys:
  - the `tiger:*` family (US towns);
  - `sidewalk:*`, `cycleway:*`, `width`, `access`, `foot`, `bicycle`, `hgv`, `lit`, `turn:lanes`, `wikidata`;
  - minority values of `surface`, `maxspeed` and `lanes` on mixed chains.
- ▶ Tally's classifier branch is adding per-segment source tags. Its shape is not committed yet: the working tree carries `classFields` (`class` · `classRung` · `classReason`) and no tag carriage so far.

**Junctions** carry `{x,z,degree,kind}` and no OSM node id: SILENT (it follows from §0).

**Highway pois.** Per town:

| town | highway pois | by kind |
|---|---|---|
| huron | 178 | crossing 107 · turning_circle 13 · … |
| jacksonheights | 7290 | crossing 4894 · stop 928 · traffic_signals 767 · bus_stop 440 · … |
| provincetown | 312 | crossing 211 · turning_circle 19 · turning_loop 16 · … |
| lafayette-square, hipointedemun | 0 | their `osm.json` predates the `pois` bucket |

Readers: `derive.js` reads only `street_lamp`. `crossing` reaches evidence through `osm_kerbs.json`, not through `pois`. Everything else (turning_circle, stop, traffic_signals, give_way, bus_stop, motorway_junction) has **no reader: SILENT.**

## 2 · → `clean/map.json` + `clean/ribbons.json` (derive)

**`map.json` layers carry NO source id in any town. SILENT, and it makes every later stage unjoinable.** Non-highway ground features go in at:

| town | features | distinct tag keys |
|---|---|---|
| lafayette-square | 2999 | 111 |
| hipointedemun | 7598 | 202 |
| huron | 1264 | 234 |
| jacksonheights | 3051 | 252 |
| provincetown | 1657 | 367 |

They come out as rings carrying at most `use` / `surface` / `access` / `name` / `subtype` / `kind`.
- `parcel` carries `{use, vacant}`. `parcelId` lands from 4d916f30 on the next pour; not in these frozen files yet.
- Relation **holes**: 38 PTown, 14 Huron, 70 JH. fetch.js already prints that every `ground.*` consumer ignores `holes`, so a hole reads as its surround: DELIBERATELY DISCLOSED, unfixed (`ROADMAP H-2`).

**Buildings: no silent loss.** Every OSM building absent from `map.buildings` is outside the boundary or inside an authored exclusion loop. Measured with `membership.mjs#createMembershipFilter`, same arguments as `pipeline.js`; the 0 is the count of member buildings absent:

| town | outside boundary | exclusion loop | member yet absent |
|---|---|---|---|
| hipointedemun | 4501 | 1272 | 0 |
| huron | 34 | 7 | 0 |
| jacksonheights | 21666 | 14252 | 0 |
| provincetown | 976 | 780 | 0 |

- LS uses the curated `src/data/buildings.json` (DELIBERATE: `pipeline.js` source 1), so its OSM buildings are not the source.
- ⚠ Two silent `catch`es in `pipeline.js`'s pre-clip: "building pre-clip skipped" (a warn), and a bad `building-overrides.json` ignored outright.

**`ribbons.paths` carry `{name, kind, points, pavedWidth}`: no osmId, no tags. SILENT.** Skeleton paths absent from `ribbons.paths` + `alleys` (PROXY: endpoint within 1 m):

| town | absent | of |
|---|---|---|
| lafayette-square | 2283 | 3219 |
| hipointedemun | 7189 | 11237 |
| huron | 762 | 916 |
| jacksonheights | 11429 | 13373 |
| provincetown | 809 | 1335 |

By kind:
- `footway=sidewalk` and `footway=crossing`: excluded by derive's inline `footways` filter. Sidewalks are kept as `sidewalks` evidence and crossings reach `crosswalkEvidence` (from `osm_kerbs.json`). Deliberate in code, but unnamed.
- `service` (no subtag), `driveway`, `parking_aisle`, `drive-through`, `emergency_access`: no filter takes them; derive's `alleys` takes only `service=alley`. **SILENT.** The audit's "an unnamed lot aisle draws nothing".
- `track`, `corridor`, `elevator`: **SILENT.**

LS's ribbons are `src/data/ribbons.json` (declared; `scene.js#ribbonsPathOf`), now traced like the rest.

## 3 · → `public/baked/<town>` (served)

**`buildings.json`** records carry `{id, …, stories, zoning, address, addressSource, wallMaterial, roofMaterial, …}` and **no `tags`.** Building tag keys: LS 95 · HPDM 169 · Huron 101 · JH 152 · PTown 160. They reduce to the mapped fields; the rest is SILENT. Ids survive as `msbf-*` / `osm-*` / `bin-*` / `bldg-*`.

**`content/listings.json`** (`source_key` `osm-<id>`): pois not reaching a listing:

| town | listings | from OSM ids | pois not reaching a listing |
|---|---|---|---|
| provincetown | 446 | 377 | amenity 386 · highway 312 · tourism 137 · natural 69 · … |
| huron | 288 | 0 (all Overture) | 500 (every poi) |
| hipointedemun | 196 | 152 | — (no `pois` bucket) |

JH has no `listings.json`. `bake-content.js#classifyPoi` decides which pois become listings. Whether each drop is a named rule: not established.

**Parcels.** Raw parcel fields reach the served `content/roster.json` only through a building join:
- HPDM's roster carries most of them: year_built, building_sqft, units, zoning, appraised_value, historic_district.
- Huron's and PTown's carry address, use and vacant.
- A parcel with no building keeps only `map.parcel {use, vacant}`.
- Not carried anywhere frozen: `owner`, `land_area`, `num_buildings`, `neighborhood_code`, `last_year_built`, `source_id`. `owner` may be deliberate (privacy); no rule found. Not established.

## 4 · What a lossless check can and cannot see

It can join wherever a record carries the source id:
- ways → chains (`sources`);
- ways → paths (`osmId`);
- buildings (`osmId`, `twinOsmIds`);
- listings (`source_key`);
- evidence (`osmId`).

It cannot join `map.json` layers, `ribbons.paths` or `junctions`: they carry no id. ⇒ **The first thing the check must say RED on is the missing id itself.** A record that cannot name its source cannot be proven lossless.
