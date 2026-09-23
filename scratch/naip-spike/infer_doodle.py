"""Doodleverse Chesapeake 7-class Res-UNet v5 (zenodo 7576904, CC-BY-4.0) on frame-gridded NAIP RGB @1 m.
Preprocessing = Segmentation Gym's `standardize` (per-image mean/std, std floored at 1/sqrt(N)); no TTA, no CRF."""
import os, sys, glob, numpy as np
os.environ['TF_USE_LEGACY_KERAS'] = '1'
import tf_keras as K
OUT = 'scratch/.naip-spike'
m = K.models.load_model(f'{OUT}/models/ches_7class_naipRGB_512_v5_fullmodel.h5', compile=False)
def standardize(img):
    N = img.shape[0] * img.shape[1]; s = max(np.std(img), 1.0 / np.sqrt(N)); return (img - np.mean(img)) / s
for f in sorted(glob.glob(f'{OUT}/*_g1.0.npy')):
    a = np.load(f); rgb = np.moveaxis(a[:3], 0, -1).astype(np.float32)
    p = m.predict(standardize(rgb)[None], verbose=0)[0].astype(np.float32)
    np.save(f.replace('_g1.0.npy', '_doodle_prob.npy'), p)
    c = p.argmax(-1); print(os.path.basename(f), 'class share', np.round(np.bincount(c.ravel(), minlength=7) / c.size, 3))
