import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const doc = await io.read('public/trees/maple_sugar/skeleton-1-lod0.glb')
let minY=Infinity,maxY=-Infinity
doc.getRoot().listMeshes().forEach(m=>m.listPrimitives().forEach(p=>{const a=p.getAttribute('POSITION');if(!a)return;const A=a.getArray();for(let i=1;i<A.length;i+=3){minY=Math.min(minY,A[i]);maxY=Math.max(maxY,A[i])}}))
console.log('  height (maxY-minY):', (maxY-minY).toFixed(2), 'm   (minY', minY.toFixed(2),'maxY', maxY.toFixed(2),')')
