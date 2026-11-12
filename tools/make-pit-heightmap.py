# make_pit.py  —  the hand-painted pit (user-pit.png) to the game's heightmap: hard-edged terraces, brook channels, fall chutes
import numpy as np, json
from PIL import Image
from scipy import ndimage as ndi
from scipy.spatial import cKDTree
a=np.array(Image.open('user-pit.png')).astype(float); a=(a-a.min())/(a.max()-a.min())
N=a.shape[0]; C=np.array([525.,507.]); PX=110/(N-1)
y,x=np.mgrid[0:N,0:N].astype(float); r=np.hypot(x-C[0],y-C[1])
hm=lambda v:15+(v-0.93)*60; vof=lambda h:(h-15)/60+0.93
# ---- terraces (only in the pit itself: the brooks painted outside it stay as they are)
s=ndi.gaussian_filter(a,3); pit=r<400
edges=[0.86,0.70,0.52,0.37,0.21]; levels=[0.70,0.53,0.38,0.24]
o=a.copy()
for k in range(4):
    band=pit&(s<edges[k])&(s>=edges[k+1]); t=(s-edges[k+1])/(edges[k]-edges[k+1])
    o[band]=levels[k]+0.012*t[band]
o[pit&(s<edges[-1])]=0.0
o=ndi.gaussian_filter(o,1.2)
# ---- brooks: from the map's edge along what was painted, then on down the pit as the land lies: across each shelf to its edge,
# over it as a fall onto the next, and at the last one down into the eye. Nothing is cut through the shelves: only a shallow
# bed (TROUGH m) is pressed into the ground under the water, so it sits in the land and does not float on it.
sm=ndi.gaussian_filter(o,2)
brooks=[[(0,196),(184,262)],[(830,0),(750,160)],[(1024,512),(910,526)],[(536,1024),(524,910)],[(0,750),(144,694)]]
HW=1.5; TROUGH=0.45; ribbons=[]; falls=[]
w=lambda p:[round(float(p[0])*PX-55,2),round(float(p[1])*PX-55,2)]
H=lambda p:hm(sm[int(round(p[1])),int(round(p[0]))])
for b in brooks:
    A=np.array(b[0],float); M=np.array(b[1],float); u=(C-M)/np.linalg.norm(C-M)
    path=[A+(M-A)*k/400 for k in range(400)]+[M+u*t for t in np.arange(0,700,0.25)]
    path=[p for p in path if np.linalg.norm(p-C)>95]
    # walk down it: a run of ground, then where the ground drops more than 1.5 m within a metre, a fall
    runs=[[]]; i=0
    while i<len(path):
        p=path[i]; runs[-1].append(p)
        j=i+1
        while j<len(path) and np.linalg.norm(path[j]-p)*PX<1.0: j+=1
        if j<len(path) and H(path[j])<H(p)-1.5:
            # the foot of the drop: the first point past it that is level again
            k=j
            while k+1<len(path) and H(path[k+1])<H(path[k])-0.05: k+=1
            if H(path[k])<-25:                   # into the eye: one long fall into the mist
                falls.append({'x':w(p)[0],'z':w(p)[1],'top':round(H(p)-TROUGH+0.3,2),'bottom':-60,'width':2*HW+0.4,'yaw':round(float(np.arctan2(u[0] if i>=400 else (M-A)[0],u[1] if i>=400 else (M-A)[1])),3),'deep':1})
                break
            falls.append({'x':w(p)[0],'z':w(p)[1],'top':round(H(p)-TROUGH+0.3,2),'bottom':round(H(path[k])-TROUGH+0.3,2),'width':2*HW+0.4,
                          'yaw':round(float(np.arctan2(u[0],u[1])),3),'deep':0})
            runs.append([]); i=k
        else: i=j
    for run in runs:
        if len(run)<2: continue
        pts=np.array(run)
        g=np.array([H(p) for p in pts]); g=ndi.gaussian_filter1d(g,2,mode='nearest')
        lv=g-TROUGH+0.3
        tree=cKDTree(pts)
        box=(x>pts[:,0].min()-30)&(x<pts[:,0].max()+30)&(y>pts[:,1].min()-30)&(y<pts[:,1].max()+30)
        P=np.stack([x[box],y[box]],1); d,ii=tree.query(P); d*=PX
        k=np.clip((d-HW*0.5)/HW,0,1); k=k*k*(3-2*k)
        cur=o[box]; bed=hm(cur)-TROUGH*(1-k)
        o[box]=np.where(d<HW*1.6,np.minimum(cur,vof(bed)),cur)
        ribbons.append([[*w(p),round(float(l),2),HW] for p,l in zip(pts,lv)])
    print('brook:',len(runs),'runs,',sum(1 for f in falls),'falls so far')
o=ndi.gaussian_filter(o,0.7)
Image.fromarray((np.clip(o,0,1)*65535).round().astype(np.uint16)).save('pit-brooks.png')
b=Image.fromarray(o.astype('f4'),'F').resize((513,513),Image.BILINEAR)
np.clip(np.array(b)*65535,0,65535).round().astype('<u2').tofile('pit-brooks.bin')
# (a drop the walk found as two, a metre apart, is one fall; and a run of water too short to see is none)
F=[]
for f in falls:
    if F and np.hypot(f['x']-F[-1]['x'],f['z']-F[-1]['z'])<1.8 and F[-1]['deep']==0: F[-1]['bottom']=f['bottom']; F[-1]['deep']=f['deep']
    else: F.append(dict(f))
falls=F; ribbons=[r for r in ribbons if len(r)>=5]
json.dump({'brooks':ribbons,'falls':falls},open('brooks.json','w'))
