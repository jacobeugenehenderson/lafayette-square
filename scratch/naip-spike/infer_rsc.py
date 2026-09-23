"""ChesapeakeRSC U-Net/ResNet-18 (HF isaaccorley/chesapeakersc, MIT) — 4-band NAIP RGBN /255, classes {0 bg, 1 road}. @1 m."""
import glob, os, numpy as np, torch, segmentation_models_pytorch as smp
OUT='scratch/.naip-spike'
m=smp.Unet(encoder_name='resnet18',encoder_weights=None,in_channels=4,classes=2)
sd=torch.load(f'{OUT}/models/unet-resnet18-829a85c5.pth',map_location='cpu'); sd=sd.get('state_dict',sd)
missing=m.load_state_dict(sd,strict=True); m.eval(); print('load', missing)
for f in sorted(glob.glob(f'{OUT}/*_g1.0.npy')):
    a=torch.from_numpy(np.load(f).astype(np.float32)/255.)[None]
    with torch.no_grad(): p=torch.softmax(m(a),1)[0,1].numpy()
    np.save(f.replace('_g1.0.npy','_rsc_road.npy'),p); print(os.path.basename(f),'road share (p>0.5)',round(float((p>0.5).mean()),3))
