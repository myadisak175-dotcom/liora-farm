// The baked cellular mask the water surface samples for its sparse foam islands (one 256x256 texture per map).
import * as THREE from 'three';

export function createAnimeCells() {
  const S=256, P=8, data=new Uint8Array(S*S*4);
  const hash=(x,y)=>{ const a=Math.sin(((x+P)%P)*127.1+((y+P)%P)*311.7)*43758.5453; return a-Math.floor(a); };
  for(let y=0;y<S;y++) for(let x=0;x<S;x++) {
    const px=x/S*P, py=y/S*P, ix=Math.floor(px), iy=Math.floor(py); let f=99,g=99;
    for(let j=-1;j<=1;j++) for(let i=-1;i<=1;i++) {
      const cx=ix+i,cy=iy+j,dx=cx+.2+.6*hash(cx,cy)-px,dy=cy+.2+.6*hash(cx+3,cy+5)-py,d=dx*dx+dy*dy;
      if(d<f){g=f;f=d;}else if(d<g)g=d;
    }
    const o=(y*S+x)*4;
    data[o]=Math.min(255,Math.sqrt(f)*230); data[o+1]=Math.min(255,(Math.sqrt(g)-Math.sqrt(f))*420);
    data[o+2]=hash(ix,iy)*255; data[o+3]=255;
  }
  const tex=new THREE.DataTexture(data,S,S); tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  tex.minFilter=tex.magFilter=THREE.LinearFilter; tex.needsUpdate=true; return tex;
}
