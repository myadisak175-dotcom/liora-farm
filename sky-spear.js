// Tidal spear rain. All effects use the same clock and fixed world-space landing points.
import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = 2 * Math.PI;
const smooth = (t, a, b) => T.MathUtils.smoothstep(t, a, b);
export const WINDUP = 0.38, RELEASE = WINDUP + 0.11, RECOVERY = 1.13;
export const FINAL_HIT = 3.20;
const ARRIVAL = 1.14, END = 4.28;

function sigilTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const c = canvas.getContext('2d');
  c.translate(256, 256);
  c.strokeStyle = '#c1fff7'; c.lineWidth = 2.2; c.lineJoin = 'round';
  c.shadowColor = '#00cbff'; c.shadowBlur = 6;
  const ring = r => { c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke(); };
  const path = points => {
    c.beginPath(); points.forEach(([x,y],i) => i ? c.lineTo(x,y) : c.moveTo(x,y)); c.stroke();
  };
  [234, 228, 201, 191, 148, 56, 49, 12].forEach(ring);
  for (let i=0; i<48; i++) {
    c.save(); c.rotate(i * TAU / 48);
    path([[-5, -211], [-2, -221], [4, -214], [6, -222]]);
    if (i % 2 === 0) path([[-5,-191], [0,-180], [5,-191]]);
    c.restore();
  }
  for (let i=0; i<8; i++) {
    c.save(); c.rotate(i * TAU / 8);
    path([[0,-31], [-17,-82], [0,-184], [17,-82], [0,-31], [0,-147]]);
    c.beginPath(); c.moveTo(-54,-128); c.quadraticCurveTo(-32,-64,0,-56);
    c.quadraticCurveTo(32,-64,54,-128); c.stroke(); c.restore();
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

// Flat-shaded crystal with a dark shaft, silver edge and two swept fins.
function spearGeometry() {
  function section(rt, rb, h, y, color, x=0, angle=0) {
    const g = new T.CylinderGeometry(rt,rb,h,5).toNonIndexed();
    g.rotateZ(angle); g.translate(x,y,0);
    const colors = [], tint = new T.Color(color);
    for (let i=0;i<g.attributes.position.count;i++) {
      const shade = 0.68 + 0.32 * (1 + Math.sin(2.3 * Math.floor(i/6))) / 2;
      colors.push(tint.r*shade,tint.g*shade,tint.b*shade);
    }
    g.setAttribute('color',new T.Float32BufferAttribute(colors,3)); return g;
  }
  return mergeGeometries([
    section(.017,.012,.68,-.58,0x62defa), section(.03,0,.12,-.91,0xe1ffff),
    section(.053,.025,.14,-.29,0x248dd6), section(0,.075,.27,-.135,0xecffff),
    section(.071,.012,.09,-.315,0x78eefd),
    section(.034,0,.22,-.34,0x8ffdfa,-.06,-.48), section(.034,0,.22,-.34,0xbafcff,.06,.48)
  ]);
}

function ribbonGeometry() {
  const p=[], colors=[], idx=[];
  for (let strand=0; strand<2; strand++) {
    const first = p.length/3;
    for (let i=0; i<=48; i++) {
      const u=i/48, a=TAU*(u*1.13+strand*.5), r=.11+.14*Math.sin(Math.PI*u);
      for (const edge of [0,1]) {
        const w = edge*.075*Math.sin(Math.PI*u);
        p.push(Math.cos(a)*(r+w),-.12-u*.99,Math.sin(a)*(r+w));
        colors.push(...(edge ? [.84,1,1] : [.035,.54,.81]));
      }
      if(i) {const j=first+i*2;idx.push(j-2,j-1,j,j-1,j+1,j);}
    }
  }
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(p,3));
  g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setIndex(idx);return g;
}

// A broken crown of curling water with bright tips and a saturated underside.
function crownGeometry() {
  const pos=[],col=[],ind=[];
  for(let petal=0;petal<11;petal++) {
    const a=petal*TAU/11, h=.5+.48*(.5+.5*Math.sin(petal*3.9)), first=pos.length/3;
    for(let i=0;i<=6;i++) {
      const u=i/6, r=.1+.77*u+.18*u*u, y=h*(1.45*u-.47*u*u);
      for(const edge of [-1,1]) {
        const angle=a+u*.18+edge*.24*(1-u);
        pos.push(r*Math.cos(angle),y,r*Math.sin(angle));
        col.push(.04+.8*u**3,.59+.4*u,.86+.14*u);
      }
      if(i) {const j=first+i*2;ind.push(j-2,j-1,j,j-1,j+1,j);}
    }
  }
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  g.setAttribute('color',new T.Float32BufferAttribute(col,3));g.setIndex(ind);return g;
}

export function createSkySpear() {
  const object=new T.Group(); object.name='Tidal spear rain'; object.visible=false;
  const basic=opts=>new T.MeshBasicMaterial({toneMapped:false, ...opts});
  const gem=basic({vertexColors:true}), water=basic({vertexColors:true,side:T.DoubleSide,transparent:true,opacity:.87,depthWrite:false});
  const shaft=spearGeometry(), lead=new T.Mesh(shaft,gem), coil=new T.Mesh(ribbonGeometry(),water);
  lead.add(coil);object.add(lead);
  const disc=new T.Mesh(new T.PlaneGeometry(2,2),basic({map:sigilTexture(),side:T.DoubleSide,transparent:true,depthWrite:false}));
  object.add(disc);
  const strikes=Array.from({length:15},(_,i)=>({
    angle:i*2.39996, radius:i===14?0:.50+1.95*Math.sqrt((i+.5)/14),
    drop:i===14?FINAL_HIT-.48:1.75+i*.052, fall:i===14?.48:.38+.045*Math.sin(i*2),
    size:i===14?2.18:.78+.19*Math.sin(i*8), start:new T.Vector3(), land:new T.Vector3()
  }));
  const batch=(g,m,n)=>{
    const b=new T.InstancedMesh(g,m,n); b.count=0;b.frustumCulled=false;
    b.instanceMatrix.setUsage(T.DynamicDrawUsage);object.add(b);return b;
  };
  const blades=batch(shaft,gem,strikes.length), crowns=batch(crownGeometry(),water,strikes.length);
  const rings=batch(new T.RingGeometry(.95,1,64).rotateX(-Math.PI/2),basic({color:0xb6fff7,side:T.DoubleSide,transparent:true,opacity:.84,depthWrite:false}),strikes.length*2);
  const waveAlpha=new T.InstancedBufferAttribute(new Float32Array(strikes.length*2),1);
  rings.geometry.setAttribute('waveAlpha',waveAlpha);
  rings.material.onBeforeCompile=shader=>{
    shader.vertexShader='attribute float waveAlpha; varying float opacityWave;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n opacityWave=waveAlpha;');
    shader.fragmentShader='varying float opacityWave;\n'+shader.fragmentShader.replace('#include <alphamap_fragment>','#include <alphamap_fragment>\n diffuseColor.a*=opacityWave;');
  };
  const drops=batch(new T.OctahedronGeometry(1),basic({color:0xa4f8ff}),strikes.length*8);
  const batches=[blades,crowns,rings,drops], pose=new T.Object3D(), up=new T.Vector3(0,1,0);
  const from=new T.Vector3(), center=new T.Vector3(), portal=new T.Vector3(), dir=new T.Vector3(), tip=new T.Vector3(), control=new T.Vector3();
  let t=-1,k=1,launched=false;
  function put(b,x,y,z,sx,sy,sz) {
    pose.position.set(x,y,z);pose.scale.set(sx,sy,sz);pose.updateMatrix();
    b.setMatrixAt(b.count++,pose.matrix);
  }
  function reset() {t=-1;object.visible=false;launched=false;}
  return {
    object, portal, get time(){return t;}, reset,
    start(me,height,ground) {
      t=0;k=height/1.75;launched=false;object.visible=true;
      const dx=Math.sin(me.heading),dz=Math.cos(me.heading);
      center.copy(me.pos);center.x+=dx*5.6*k;center.z+=dz*5.6*k;
      center.y=ground(center.x,center.z);
      let highest=Math.max(me.pos.y,center.y);
      for(const s of strikes) {
        const x=Math.cos(s.angle)*s.radius*k,z=Math.sin(s.angle)*s.radius*k;
        s.land.set(center.x+x,ground(center.x+x,center.z+z)+.14*k,center.z+z);
        highest=Math.max(highest,s.land.y);
        s.start.set(center.x+x*.70,0,center.z+z*.70);
      }
      portal.set(center.x,highest+4.65*k,center.z);
      for(const s of strikes) s.start.y=portal.y;
      disc.rotation.set(-Math.PI/2+.13,me.heading,0,'YXZ');
      dir.set(dx*.45,.89,dz*.45).normalize();
    },
    advance(dt) { if(t>=0) {t+=dt;if(t>=END) reset();} },
    draw(hand) {
      if(t<0) return;
      for(const b of batches) b.count=0;
      if(!launched) {
        from.copy(hand).addScaledVector(dir,.72*k*smooth(t,0,.18));
        if(t>=RELEASE) {
          launched=true;
          control.copy(from).addScaledVector(dir,3.3*k);
          control.y=Math.max(control.y,portal.y+.30*k);
        }
      }
      lead.visible=t<ARRIVAL+.11;
      if(lead.visible) {
        tip.copy(from);
        if(launched) {
          const u=smooth(t,RELEASE,ARRIVAL);
          tip.multiplyScalar((1-u)**2).addScaledVector(control,2*(1-u)*u).addScaledVector(portal,u*u);
          dir.copy(control).sub(from).multiplyScalar(1-u)
            .addScaledVector(pose.position.copy(portal).sub(control),u).normalize();
        }
        lead.position.copy(tip);lead.quaternion.setFromUnitVectors(up,dir);
        lead.scale.setScalar(1.65*k*smooth(t,0,.18)*(1-smooth(t,ARRIVAL-.045,ARRIVAL+.11)));
        coil.rotation.y=t*9;
      }
      const open=smooth(t,ARRIVAL-.12,1.62)*(1-smooth(t,FINAL_HIT-.35,FINAL_HIT+.15));
      disc.visible=open>.001;
      if(disc.visible) {
        disc.position.copy(portal);disc.scale.setScalar(2.63*k*open);
        disc.material.opacity=open*.97;disc.rotation.z=t*.35;
      }
      for(const s of strikes) {
        const since=t-s.drop, impact=since-s.fall, form=smooth(since,-.38,-.08), length=1.7*s.size*k;
        if(form>0 && impact<0) {
          const u=Math.max(0,since/s.fall);
          tip.lerpVectors(s.start,s.land,.13*u+.87*u*u);
          dir.subVectors(s.land,s.start).normalize();
          if(since<0) tip.addScaledVector(dir,.15*k*form);
          pose.quaternion.setFromUnitVectors(up,dir);
          put(blades,tip.x,tip.y,tip.z,length*form,length*form,length*form);
        }
        if(impact<0 || impact>.96) continue;
        const u=impact/.96, x=s.land.x,y=s.land.y,z=s.land.z, size=k*s.size;
        const burst=smooth(impact,0,.085)*(1-smooth(impact,.29,.69));
        pose.rotation.set(0,s.angle,0);
        if(burst>.001) put(crowns,x,y,z,size*(.45+.7*u)*burst,size*burst,size*(.45+.7*u)*burst);
        for(let j=0;j<2;j++) {
          const wave=(impact-j*.11)/(.83-j*.06);
          if(wave>0 && wave<1) {
            const r=size*(.13+1.35*(1-(1-wave)**2)), fade=1-smooth(wave,.66,1);
            waveAlpha.setX(rings.count,fade);
            put(rings,x,y+.025*k+j*.008*k,z,r,1,r);
          }
        }
        for(let j=0;j<8;j++) {
          const a=s.angle+j*2.39, flight=.55+.18*Math.cos(j*3), f=impact/flight;
          if(f>=1) continue;
          const r=size*(.12+f*(.55+.55*Math.abs(Math.sin(a)))), w=size*.042*(1-f*f);
          put(drops,x+Math.sin(a)*r,y+size*(3.8*f*(1-f)+.10),z+Math.cos(a)*r,w,w*1.65,w);
        }
      }
      waveAlpha.needsUpdate=true;
      for(const b of batches) {b.visible=b.count>0;b.instanceMatrix.needsUpdate=true;}
    }
  };
}
