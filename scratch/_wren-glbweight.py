import json,struct,sys
def w(p):
    d=open(p,'rb').read(); n=struct.unpack('<I',d[12:16])[0]; j=json.loads(d[20:20+n])
    bvs=j.get('bufferViews',[]); total=len(d)
    imgbv=set()
    for im in j.get('images',[]):
        if im.get('bufferView') is not None: imgbv.add(im['bufferView'])
    seen={}   # bufferView -> semantic (first claimer)
    for m in j.get('meshes',[]):
        for pr in m.get('primitives',[]):
            for sem,ai in pr.get('attributes',{}).items():
                bv=j['accessors'][ai]['bufferView']
                seen.setdefault(bv,sem)
            if pr.get('indices') is not None:
                seen.setdefault(j['accessors'][pr['indices']]['bufferView'],'INDICES')
    agg={}
    for bv,sem in seen.items(): agg[sem]=agg.get(sem,0)+bvs[bv].get('byteLength',0)
    img=sum(bvs[b].get('byteLength',0) for b in imgbv)
    print("%-44s TOTAL %6.1f MB" % ('/'.join(p.split('/')[-2:]),total/1048576))
    print("      %-12s %6.1f MB" % ('images',img/1048576))
    for k,v in sorted(agg.items(),key=lambda x:-x[1]):
        print("      %-12s %6.1f MB" % (k,v/1048576))
for p in sys.argv[1:]:
    try: w(p)
    except Exception as e: print(p,'ERR',e)
