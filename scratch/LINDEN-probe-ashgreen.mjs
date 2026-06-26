import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read('public/trees/ash_green/skeleton-1-lod0.glb');
const root = doc.getRoot();
console.log('=== MESHES ===');
for (const mesh of root.listMeshes()) {
  console.log('mesh:', mesh.getName());
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    const uv = prim.getAttribute('TEXCOORD_0');
    const idx = prim.getIndices();
    const nv = pos ? pos.getCount() : 0;
    const ntri = idx ? idx.getCount()/3 : nv/3;
    const mat = prim.getMaterial();
    const ex = prim.getExtras() || {};
    // UV bbox
    let uvbb = 'none';
    if (uv) { const a = uv.getArray(); let mnu=1e9,mxu=-1e9,mnv=1e9,mxv=-1e9; for(let i=0;i<a.length;i+=2){mnu=Math.min(mnu,a[i]);mxu=Math.max(mxu,a[i]);mnv=Math.min(mnv,a[i+1]);mxv=Math.max(mxv,a[i+1]);} uvbb=`U[${mnu.toFixed(2)},${mxu.toFixed(2)}] V[${mnv.toFixed(2)},${mxv.toFixed(2)}]`; }
    console.log(`  prim: verts=${nv} tris=${Math.round(ntri)} mat=${mat?mat.getName():'none'} atlasKind=${ex.atlasKind||'?'} uv=${uvbb}`);
  }
}
console.log('=== MATERIALS / TEXTURES ===');
for (const mat of root.listMaterials()) {
  const bc = mat.getBaseColorTexture();
  console.log('mat:', mat.getName(), 'baseColorTex:', bc?bc.getName():'none', bc?`${bc.getImage()?.byteLength} bytes`:'', bc?bc.getMimeType():'');
}
