import os, json, re, numpy as np
os.environ['TF_USE_LEGACY_KERAS']='1'
import tf_keras as K
OUT='scratch/.naip-spike'
m=K.models.load_model(f'{OUT}/models/ches_7class_naipRGB_512_v5_fullmodel.h5',compile=False)
cfg=m.to_json(); n=cfg.count('mixed_float16'); cfg=cfg.replace('"mixed_float16"','"float32"')
K.mixed_precision.set_global_policy('float32')
m2=K.models.model_from_json(cfg); m2.set_weights([w.astype(np.float32) for w in m.get_weights()])
print('mixed_float16 refs replaced:', n, '· layer dtypes', {l.dtype for l in m2.layers})
def std(img): N=img.shape[0]*img.shape[1]; return (img-img.mean())/max(img.std(),1/np.sqrt(N))
for site in ['truman','jefferson']:
    a=np.load(f'{OUT}/{site}_il_m_3809031_nw_15_030_20230818_20231031_g1.0.npy'); x=std(np.moveaxis(a[:3],0,-1).astype(np.float32))[None]
    for nm,mm in [('fp16',m),('fp32',m2)]:
        c=mm.predict(x,verbose=0)[0].argmax(-1); print(site,nm,np.round(np.bincount(c.ravel(),minlength=7)/c.size,3))
m2.save(f'{OUT}/models/doodle_v5_fp32.h5')
