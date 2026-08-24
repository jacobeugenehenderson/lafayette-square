import json,struct,sys,math
def read(p):
    d=open(p,'rb').read()
    n=struct.unpack('<I',d[12:16])[0]
    j=json.loads(d[20:20+n])
    binoff=20+n+8
    return j,d,binoff
def acc_vec3(j,d,binoff,ai):
    a=j['accessors'][ai]; bv=j['bufferViews'][a['bufferView']]
    off=binoff+bv.get('byteOffset',0)+a.get('byteOffset',0)
    stride=bv.get('byteStride') or 12
    out=[]
    for i in range(a['count']):
        o=off+i*stride
        out.append(struct.unpack_from('<fff',d,o))
    return out
def stat(p):
    j,d,binoff=read(p)
    ymin,ymax=1e9,-1e9; edges=[]
    for m in j.get('meshes',[]):
        for pr in m.get('primitives',[]):
            kind=(pr.get('extras') or {}).get('atlasKind','bark')
            pos=pr['attributes']['POSITION']
            a=j['accessors'][pos]
            if 'min' in a and 'max' in a:
                ymin=min(ymin,a['min'][1]); ymax=max(ymax,a['max'][1])
            if kind=='leaf':
                v=acc_vec3(j,d,binoff,pos)
                # cards are quads: sample first 400 verts in groups of 4
                for i in range(0,min(len(v),1600),4):
                    q=v[i:i+4]
                    if len(q)<4: break
                    e=math.dist(q[0],q[1])
                    if e>0: edges.append(e)
    edges.sort()
    med=edges[len(edges)//2] if edges else 0
    h=ymax-ymin
    print("%-44s height %6.2f m | leaf card edge median %6.3f m | cards/height %.4f" % ('/'.join(p.split('/')[-2:]),h,med,med/h if h else 0))
for p in sys.argv[1:]:
    try: stat(p)
    except Exception as e: print(p,'ERR',e)
