import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { smoothWeldBark, trunkCutBark, crushFlooredBark } from '../arborist/decimate-tree.mjs';
await MeshoptSimplifier.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
function tally(d){let bark=0,leaf=0;for(const m of d.getRoot().listMeshes())for(const p of m.listPrimitives()){const k=(p.getExtras()||{}).atlasKind;const t=(p.getIndices()?.getCount()||0)/3;if(k==='bark')bark+=t;else if(k==='leaf')leaf+=t;}return{bark,leaf};}
const doc=await io.read('/tmp/salon-linden_american.glb');
smoothWeldBark(doc);
console.log('after smooth-weld:', tally(doc));
const tc=trunkCutBark(doc);
console.log('after trunk-cut:', tally(doc), '| report:', tc.map(r=>`${r.reason} ${r.tBefore}→${r.tAfter} cutY=${r.cutY}`).join(';'));
const cr=crushFlooredBark(doc, 1500);
console.log('after crush(1500):', tally(doc), '| report:', cr.map(r=>`${r.reason} ${r.tBefore}→${r.tAfter}`).join(';'));
