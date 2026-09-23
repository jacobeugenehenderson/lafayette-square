"""Rule out my preprocessing before blaming the model: band order × normalisation × scale, on one site."""
import os, numpy as np
os.environ['TF_USE_LEGACY_KERAS'] = '1'
import tf_keras as K
OUT='scratch/.naip-spike'
m = K.models.load_model(f'{OUT}/models/ches_7class_naipRGB_512_v5_fullmodel.h5', compile=False)
def std(img): N=img.shape[0]*img.shape[1]; return (img-img.mean())/max(img.std(),1/np.sqrt(N))
a1=np.load(f'{OUT}/truman_il_m_3809031_nw_15_030_20230818_20231031_g1.0.npy')
a3=np.load(f'{OUT}/truman_il_m_3809031_nw_15_030_20230818_20231031_g0.3.npy')
from PIL import Image
def at(a,g):  # resample the 0.3 grid centre to g m, 512 px
    rgb=np.moveaxis(a[:3],0,-1); n=int(512*g/0.3); c=(rgb.shape[0]-n)//2; crop=rgb[c:c+n,c:c+n] if n<=rgb.shape[0] else rgb
    return np.asarray(Image.fromarray(crop).resize((512,512),Image.BILINEAR)).astype(np.float32)
variants={'1m RGB std':std(np.moveaxis(a1[:3],0,-1).astype(np.float32)),
 '1m BGR std':std(np.moveaxis(a1[2::-1],0,-1).astype(np.float32)),
 '1m RGB /255':np.moveaxis(a1[:3],0,-1).astype(np.float32)/255,
 '1m RGB raw':np.moveaxis(a1[:3],0,-1).astype(np.float32),
 '1m per-chan std':np.stack([std(np.moveaxis(a1[:3],0,-1)[...,i].astype(np.float32)) for i in range(3)],-1),
 '0.5m RGB std':std(at(a3,0.5)),'0.3m RGB std':std(at(a3,0.3))}
for k,v in variants.items():
    c=m.predict(v[None],verbose=0)[0].argmax(-1); print(f'{k:16s}', np.round(np.bincount(c.ravel(),minlength=7)/c.size,3))
