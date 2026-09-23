import numpy as np, sys
from PIL import Image
OUT='scratch/.naip-spike'; T='il_m_3809031_nw_15_030_20230818_20231031'
PAL=np.array([[0,90,255],[20,110,20],[150,230,90],[210,170,110],[255,40,200],[255,255,0],[0,0,0]],np.uint8)
rows=[]
for s in ['jefferson','truman']:
    a=np.load(f'{OUT}/{s}_{T}_g1.0.npy'); rgb=np.moveaxis(a[:3],0,-1)
    c=np.load(f'{OUT}/{s}_{T}_doodle_prob.npy').argmax(-1); r=np.load(f'{OUT}/{s}_{T}_rsc_road.npy')
    nir=a[3].astype(float); red=a[0].astype(float); ndvi=(nir-red)/(nir+red+1e-6)
    rows.append(np.concatenate([rgb,PAL[c],(np.stack([r]*3,-1)*255).astype(np.uint8),(np.clip((ndvi[...,None]+0.2)/0.8,0,1).repeat(3,-1)*255).astype(np.uint8)],1))
Image.fromarray(np.concatenate(rows,0)).save(f'{OUT}/out/peek.png')
