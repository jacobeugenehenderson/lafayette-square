import fs from 'fs'
const path = process.argv[2] || 'public/baked/lafayette-square/shape.json'
const shape = JSON.parse(fs.readFileSync(path))
const r = (shape.tiles||[]).map(st => (st.iA||[]).map(ring=>ring.map(p=>[Math.round(p[0]*1000),Math.round(p[1]*1000)])))
import crypto from 'crypto'
console.log('tiles', shape.tiles?.length, 'iA-md5', crypto.createHash('md5').update(JSON.stringify(r)).digest('hex'))
