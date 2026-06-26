import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
import { STREET_SMOOTH } from '../src/lib/smoothCenterline.js'
import { CURB_WIDTH } from '../src/cartograph/streetProfiles.js'
const root = new URL('../', import.meta.url)
const ribbons = JSON.parse(fs.readFileSync(new URL('src/data/ribbons.json', root)))
const design = JSON.parse(fs.readFileSync(new URL('public/looks/lafayette-square/design.json', root)))
const opts = { curbWidth: CURB_WIDTH, smooth: STREET_SMOOTH, blockLandUse: design.blockLandUse||null,
  cornerRadiusScale: Number.isFinite(design.cornerRadiusScale)?design.cornerRadiusScale:1,
  cornerRadiusOverrides: design.cornerRadiusOverrides||null, cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides||null,
  blockCustoms: design.blockCustoms||null }
const off = process.argv[2]==='off'
const log=console.log; console.log=()=>{}
buildTileGround(ribbons, { ...opts, deadEndMouthWrap: !off })
console.log=log
