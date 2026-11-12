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
# ---- brooks: from the map's edge, along what was painted, to the brink; sloping down all the way, a chute through the shelves below
sm=ndi.gaussian_filter(o,4)
brooks=[[(0,196),(184,262)],[(830,0),(750,160)],[(1024,512),(910,526)],[(536,1024),(524,910)],[(0,750),(144,694)]]
HW=1.7; rows_all=[]; falls=[]
w=lambda p:[round(p[0]*PX-55,2),round(p[1]*PX-55,2)]
for b in brooks:
    A=np.array(b[0],float); M=np.array(b[1],float); u=(C-M)/np.linalg.norm(C-M)
    path=[A+(M-A)*k/200 for k in range(200)]+[M+u*t for t in np.arange(0,600,0.5)]
    pts=[]
    for p in path:
        if hm(o[int(round(p[1])),int(round(p[0]))])<10: break
        pts.append(p)
    pts=np.array(pts); keep=[0]
    for i in range(1,len(pts)):
        if np.linalg.norm(pts[i]-pts[keep[-1]])*PX>=0.5: keep.append(i)
    pts=pts[keep][:-3]                                   # (stop a metre or so short of the drop)
    Bk=pts[-1]
    g=np.array([hm(sm[int(p[1]),int(p[0])]) for p in pts]); lv=np.minimum.accumulate(g-0.7)
    tree=cKDTree(pts)
    box=(x>pts[:,0].min()-40)&(x<pts[:,0].max()+40)&(y>pts[:,1].min()-40)&(y<pts[:,1].max()+40)
    P=np.stack([x[box],y[box]],1); d,i=tree.query(P); d*=PX
    bed=lv[i]-0.8; k=np.clip((d-HW*0.5)/HW,0,1); k=k*k*(3-2*k)
    cur=o[box]; o[box]=np.where(d<HW*1.6,np.minimum(cur,vof(bed+(hm(cur)-bed)*k)),cur)
    E=C+(Bk-C)/np.linalg.norm(Bk-C)*100; D=E-Bk
    tp=((x-Bk[0])*D[0]+(y-Bk[1])*D[1])/(D@D); tc=np.clip(tp,0,1)
    dc=np.hypot(x-Bk[0]-D[0]*tc,y-Bk[1]-D[1]*tc)*PX
    o[(dc<2.4)&(tp>0.0)&(hm(o)<lv[-1]+0.5)|((dc<2.4)&(tp>0.03))]=0
    rows_all.append([[*w(p),round(float(l),2),HW] for p,l in zip(pts,lv)])
    falls.append({'x':w(Bk)[0],'z':w(Bk)[1],'top':round(float(lv[-1]),2),'width':2*HW+0.4})
    print('brook', len(pts)*0.5,'m long, water from',round(lv[0],1),'to',round(lv[-1],1))
o=ndi.gaussian_filter(o,0.7)
Image.fromarray((np.clip(o,0,1)*65535).round().astype(np.uint16)).save('pit-brooks.png')
b=Image.fromarray(o.astype('f4'),'F').resize((513,513),Image.BILINEAR)
np.clip(np.array(b)*65535,0,65535).round().astype('<u2').tofile('pit-brooks.bin')
json.dump({'brooks':rows_all,'falls':falls},open('brooks.json','w'))
