// Stylized impact meshes, inspired by the reference's ring / crown / spout layering.
// A single baked cellular texture replaces per-pixel procedural Voronoi.
import * as THREE from 'three';

function cells() {
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

export function createAnimeSplashes({field, waterLevelAt, capacity=8}) {
  const group=new THREE.Group(); group.name='anime-water-fx';
  const tex=cells(), impacts=new Float32Array(capacity*4), params=new Float32Array(capacity*4);
  for(let i=0;i<capacity;i++){ impacts[i*4+3]=-100; params[i*4+2]=1; }
  const impact=new THREE.InstancedBufferAttribute(impacts,4), param=new THREE.InstancedBufferAttribute(params,4);
  impact.setUsage(THREE.DynamicDrawUsage); param.setUsage(THREE.DynamicDrawUsage);
  const time={value:0}, foam={value:1}; let cursor=0, lastSmall=-1, lastTap=-1;
  const uniforms={uTime:time,uCells:{value:tex},uHeight:{value:field.texture},uHeightRect:{value:field.rect},uFoamAmt:foam};
  const vertexHead=`attribute vec4 aImpact,aParams;
    uniform float uTime;
    varying vec2 vUV; varying float vAge,vSeed; varying vec3 vWorld;
    void main(){
      float age=clamp((uTime-aImpact.w)/aParams.z,0.0,1.0);
      vAge=age; vSeed=aParams.y; vUV=uv;
      float power=aParams.x;
      vec3 p=position;`;
  const vertexEnd=`vWorld=p+aImpact.xyz;
    if(uTime<aImpact.w || uTime-aImpact.w>aParams.z) gl_Position=vec4(2.,2.,2.,1.);
    else gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.); }`;
  const fragmentHead=`uniform sampler2D uCells,uHeight; uniform vec4 uHeightRect; uniform float uFoamAmt;
    varying vec2 vUV; varying float vAge,vSeed; varying vec3 vWorld;
    void main(){
      float ground=texture2D(uHeight,(vWorld.xz-uHeightRect.xy)*uHeightRect.z+uHeightRect.w).r;
      if(vWorld.y<ground+0.005) discard;
      float fade=(1.-smoothstep(.55,1.,vAge))*smoothstep(0.,.035,vAge);`;
  const finish=`if(alpha<.015)discard; gl_FragColor=vec4(col,alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`;
  function mesh(geo,vertex,fragment) {
    const g=new THREE.InstancedBufferGeometry();g.index=geo.index;g.attributes={...geo.attributes};g.instanceCount=capacity;
    g.setAttribute('aImpact',impact);g.setAttribute('aParams',param);
    const mat=new THREE.ShaderMaterial({uniforms,vertexShader:vertexHead+vertex+vertexEnd,fragmentShader:fragmentHead+fragment+finish,
      transparent:true,depthWrite:false,side:THREE.DoubleSide});
    const m=new THREE.Mesh(g,mat);m.frustumCulled=false;m.renderOrder=3;group.add(m);geo.dispose();return m;
  }
  const crown=mesh(new THREE.CylinderGeometry(1,.44,1,48,7,true),`
    float h=p.y+.5, angle=atan(p.z,p.x);
    float teeth=.6+.23*sin(angle*7.+vSeed)+.17*sin(angle*11.-vSeed);
    p.xz*=power*(.5+age*1.5);
    p.y=pow(h,.8)*teeth*sin(pow(age,.7)*3.14159)*power*.7;
    p.y+=.025;`, `
    vec2 uv=vec2(vUV.x*1.8+vSeed, vUV.y*.65-vAge*.32);
    vec2 c=texture2D(uCells,uv).rg;
    float hole=smoothstep(.26,.36,c.r+vUV.y*.1);
    float lip=smoothstep(.82,.96,vUV.y);
    float alpha=max(hole,lip)*fade*(1.-smoothstep(.96,1.,vUV.y))*.6*uFoamAmt;
    vec3 col=mix(vec3(.26,.72,.86),vec3(.94,.995,1.),smoothstep(.3,.8,vUV.y+c.g*.5));`);
  const jet=mesh(new THREE.CylinderGeometry(.08,.3,1,14,5,true),`
    float h=p.y+.5; p.xz*=power*(1.-age*.5);
    p.x+=sin(h*5.+vSeed)*h*.08*power;
    p.y=h*sin(pow(age,.55)*3.14159)*power*1.25+.025;`, `
    float pattern=texture2D(uCells,vec2(vUV.x*.6+vSeed,vUV.y-vAge*.7)).r;
    float alpha=fade*(1.-smoothstep(.82,1.,vUV.y))*.5;
    vec3 col=mix(vec3(.25,.68,.86),vec3(.92,.99,1.),smoothstep(.22,.5,pattern));`);
  // Two expanding annuli with irregular, dissolving foam edges.
  const rg=new THREE.BufferGeometry(),rp=[],ru=[],ri=[];
  for(let layer=0;layer<2;layer++)for(let i=0;i<=64;i++)for(let j=0;j<2;j++) {
    const a=i/64*Math.PI*2;rp.push(Math.cos(a),layer,Math.sin(a));ru.push(i/64,j);
    if(i<64&&j===0){const k=layer*130+i*2;ri.push(k,k+1,k+2,k+1,k+3,k+2);}
  }
  rg.setAttribute('position',new THREE.Float32BufferAttribute(rp,3));rg.setAttribute('uv',new THREE.Float32BufferAttribute(ru,2));rg.setIndex(ri);
  mesh(rg,`
    float layer=p.y, a=max(0.,age-layer*.13);
    float radius=(.12+a*2.8)*power;
    float wob=sin(vUV.x*37.7+vSeed+a*2.)*.035;
    p.xz*=max(0.01,radius+(vUV.y-.5)*power*(.12+.12*a)+wob);
    p.y=.035+layer*.01+sin(vUV.x*18.85+age*4.)*.012;`, `
    float c=texture2D(uCells,vec2(vUV.x*2.+vSeed,vUV.y*.12+vAge*.18)).r;
    float edges=smoothstep(0.,.17,vUV.y)*(1.-smoothstep(.65,1.,vUV.y));
    float alpha=edges*fade*smoothstep(.12,.25,c-vAge*.1)*.5*uFoamAmt;
    vec3 col=vec3(.9,.99,1.);`);
  // Billboard droplets with ballistic flight, all in a single instanced draw.
  const dg=new THREE.PlaneGeometry(1,1), g=new THREE.InstancedBufferGeometry();g.index=dg.index;g.attributes={...dg.attributes};g.instanceCount=capacity*6;
  const di=new Float32Array(capacity*6*4),dp=new Float32Array(capacity*6*4),ds=new Float32Array(capacity*6);
  for(let i=0;i<ds.length;i++)ds[i]=i%6;
  const da=new THREE.InstancedBufferAttribute(di,4),db=new THREE.InstancedBufferAttribute(dp,4);
  da.setUsage(THREE.DynamicDrawUsage);db.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('aImpact',da);g.setAttribute('aParams',db);g.setAttribute('aDrop',new THREE.InstancedBufferAttribute(ds,1));
  const dm=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,
    vertexShader:`attribute vec4 aImpact,aParams; attribute float aDrop; uniform float uTime; varying vec2 vUV; varying float vFade; varying vec3 vWorld;
      void main(){float age=(uTime-aImpact.w)/aParams.z; float t=max(0.,uTime-aImpact.w);
      float a=aDrop*2.39996+aParams.y;
      float vy=(1.8+fract(aDrop*.618)*1.4)*sqrt(aParams.x);
      vec3 p=aImpact.xyz+vec3(cos(a)*t*aParams.x,vy*t-3.8*t*t,sin(a)*t*aParams.x);
      float size=(.045+fract(aDrop*.37)*.04)*sqrt(aParams.x)*(1.-smoothstep(.5,1.,age));
      vUV=uv; vFade=1.-smoothstep(.45,.9,age); vWorld=p;
      vec4 mv=viewMatrix*vec4(p,1.);mv.xy+=position.xy*vec2(1.,1.6)*size;
      gl_Position=projectionMatrix*mv;
      if(age<0. || age>1. || p.y<aImpact.y+.02)gl_Position=vec4(2.,2.,2.,1.);}`,
    fragmentShader:`uniform sampler2D uHeight; uniform vec4 uHeightRect; varying vec2 vUV; varying float vFade; varying vec3 vWorld;
      void main(){float ground=texture2D(uHeight,(vWorld.xz-uHeightRect.xy)*uHeightRect.z+uHeightRect.w).r;
      if(vWorld.y<ground)discard;
      float r=length(vUV-.5);float alpha=(1.-smoothstep(.32,.5,r))*vFade;if(alpha<.02)discard;
      vec3 col=mix(vec3(.48,.84,.94),vec3(.97,1.,1.),smoothstep(.25,.7,vUV.y)); gl_FragColor=vec4(col,alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`});
  const droplets=new THREE.Mesh(g,dm);droplets.frustumCulled=false;droplets.renderOrder=4;group.add(droplets);dg.dispose();
  const nodes=[...group.children];
  group.visible=false;
  let lastEvent=-100;
  return {group, texture:tex,
    emit(x,z,strength=1){
      if(strength<.95)return;        // only knee-deep wading and real impacts splash; ankle-deep steps stay plain ripples
      const now=time.value;
      if(strength<1.5&&now-lastSmall<.38)return;
      if(strength>=1.5&&now-lastTap<.08)return;
      if(strength<1.5)lastSmall=now;else lastTap=now;
      const o=cursor*4, power=Math.min(1.1,Math.max(.3,strength*.42)), duration=1.15+power*.25;
      impacts.set([x,waterLevelAt(x,z)+.035,z,now],o);params.set([power,(cursor*13.71+now)%100,duration,1],o);
      for(let j=0;j<6;j++){const d=(cursor*6+j)*4;di.set(impacts.subarray(o,o+4),d);dp.set(params.subarray(o,o+4),d);}
      impact.needsUpdate=param.needsUpdate=da.needsUpdate=db.needsUpdate=true;
      cursor=(cursor+1)%capacity;lastEvent=now;group.visible=true;
    },
    update(dt,amount=1){time.value+=dt;foam.value=Math.min(1,Math.max(0,amount));group.visible=time.value-lastEvent<1.7&&amount>0;},
    dispose(){for(const m of nodes){m.geometry.dispose();m.material.dispose();}tex.dispose();},
    get time(){return time.value;}
  };
}
