// The fishing station. Work in CSS pixels so the grip, rod, bobber and water FX share a frame.
import { drawFish } from './fish-art.js';
import { createMotionPlayer, CAST_TIME, RELEASE_TIME, LAND_TIME } from './fishing-motion.js?v=2';
import { createSpriteAngler } from './fishing-sprite.js?v=2';
import { createRod } from './fishing-rod.js?v=2';
const tau=Math.PI*2,clip=v=>Math.max(0,Math.min(1,v)),mix=(a,b,k)=>a+(b-a)*k;
function ellipse(c,x,y,rx,ry,fill,stroke){c.beginPath();c.ellipse(x,y,Math.max(.2,rx),Math.max(.2,ry),0,0,tau);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.stroke();}}
function line(c,points,color,width=1){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.lineWidth=width;c.strokeStyle=color;c.stroke();}
function polygon(c,p,fill){c.beginPath();p.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=fill;c.fill();}
function noise(n){return (Math.sin(n*77.23+18.9)*4317.781%1+1)%1;}
function paintDock(c,v){
  const {x,y,s}=v;
  function point(d,u,h=0){const perspective=1+d*.14;return [x+s*(.10-d*.85+u*.72*perspective),y+s*(-.10+d*.42+u*.16*perspective-h)];}
  const wood=['#aa8760','#b18e65','#b99970','#a48665','#b19472','#b39a79'];
  for(let i=0;i<25;i++){const a=i*.22,b=a+.216;
    const p=(d,u,h)=>point(d,u,h);
    polygon(c,[p(a,.58),p(b,.58),p(b,.58,-.085),p(a,.58,-.085)],'#675339');
    polygon(c,[p(a,-.58),p(a,.58),p(a,.58,-.085),p(a,-.58,-.085)],'#856542');
    polygon(c,[p(a,-.58),p(a,.58),p(b,.58),p(b,-.58)],wood[i%wood.length]);
    line(c,[p(a,-.58),p(a,.58)],'#dcc19a',1.3);
    for(let n=0;n<9;n++){const d=a+.014+.175*noise(i*80+n),u=-.56+noise(n+i*9)*.57,len=.12+.46*noise(i+n*4);line(c,[p(d,u),p(d+.005,u+len*.45),p(d-.002,u+len)],n%3?'#795b4650':'#dfc4a16b',.45+s*.0025);}
    for(const u of [-.49,.48]){const [px,py]=p(a+.09,u);ellipse(c,px,py,s*.010,s*.004,'#695440');}
  }
  for(const d of [2.65,1.28,.13]){const [px,py]=point(d,-.56);const r=s*(.046+d*.002),top=py-s*.17;
    c.fillStyle='#735c41';c.fillRect(px-r,top,r*2,py-top+s*.08);c.fillStyle='#9a8062';c.fillRect(px-r,top,r*.75,py-top+s*.08);ellipse(c,px,top,r,r*.40,'#c4ab82','#8f755a');
    for(let k=0;k<3;k++){line(c,[[px-r,top+s*(.047+k*.012)],[px,top+s*(.054+k*.012)],[px+r,top+s*(.046+k*.012)]],'#cbb887',Math.max(1,s*.009));}}
  ellipse(c,x,y+s*.003,s*.17,s*.034,'#4e47395c');
}
export function createScenery(base,front,marker){
  const under=base.getContext('2d'),c=front.getContext('2d'),dock=document.createElement('canvas');
  const sprite=createSpriteAngler(), stepMotion=createMotionPlayer(), bamboo=createRod();
  let v,avatar=null,aim=.66,phase='',wasCast=false,lure={x:0,y:0},lastWater={x:0,y:0},lastTip=null,castStart=null;
  const sparks=[];
  let returning=null;
  function resize(){const w=base.clientWidth,h=base.clientHeight,dpr=Math.min(devicePixelRatio||1,1.65),portrait=w<h;
    v={w,h,dpr,x:w*(portrait?.28:.33),y:h*(portrait?.67:.82),s:Math.min(h*(portrait?.29:.37),w*.51)};
    for(const canvas of [base,front,dock]){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
    for(const ctx of [under,c,dock.getContext('2d')])ctx.setTransform(dpr,0,0,dpr,0,0);
    paintDock(dock.getContext('2d'),v);avatar?.resize(v);lastTip=null;castStart=null;bamboo.reset();returning=null;
    if(phase==='land'){lastWater={x:w*aim,y:h*.6};}
  }
  function ripple(x,y,r,col){c.lineWidth=1.3;ellipse(c,x,y,r,r*.23,null,col);}
  function update(state,t,dt){
    const {w,h,s,x,y}=v;under.clearRect(0,0,w,h);c.clearRect(0,0,w,h);
    for(let i=0;i<36;i++){const yy=h*(.54+.43*noise(i+1)),xx=w*((noise(i+43)+t*.004*(i%3+1))%1),a=(.5+.5*Math.sin(t*1.4+i*7))*.31;
      line(under,[[xx,yy],[xx+w*(.005+noise(2*i+6)*.018),yy+.4]],'rgba(246,248,200,'+a+')',1.2);}
    under.drawImage(dock,0,0,w,h);
    const motion=stepMotion(state,dt);
    const grip=avatar?avatar.frame(motion,v):sprite.frame(under,v,motion);
    const changed=phase!==state.phase;
    if(changed){if((state.phase==='missed'||state.phase==='ready') && phase) returning={from:{...lure},age:0};
      if(state.phase==='cast'){aim=.61+Math.random()*.12;castStart=null;wasCast=false;returning=null;}
      if(state.phase==='wait'||state.phase==='bite'||state.phase==='land'){const count=state.phase==='bite'?12:7;for(let k=0;k<count;k++)sparks.push({x:lure.x,y:lure.y,dx:(noise(k*3+1)-.5)*s*.56,dy:-s*(.05+.39*noise(k+16)),age:0});}
      phase=state.phase;}
    const pull=state.phase==='reel',casting=state.phase==='cast',landing=state.phase==='land';
    const {points,tip,butt,hang}=bamboo.update(grip,state,v,dt);
    const pair=(a,b)=>[[a.x,a.y],[b.x,b.y]];
    line(c,pair(butt,grip),'#5e452e',Math.max(3,s*.023));
    for(let i=0;i<points.length-1;i++){
      const from=points[i],to=points[i+1];
      line(c,pair(from,to),i%3===0?'#93744b':'#b99a5e',Math.max(1.05,s*.016*(1-i/13)));
      if(i%3===0){const r=Math.max(.7,s*.0055);ellipse(c,from.x,from.y,r,r,'#6c573b');}
    }
    line(c,pair(grip,grip.hub),'#736145',Math.max(1.6,s*.011));
    ellipse(c,grip.hub.x,grip.hub.y,s*.025,s*.022,'#a68f63','#594d3e');
    line(c,pair(grip.hub,grip.knob),'#665641',Math.max(1.4,s*.009));
    ellipse(c,grip.knob.x,grip.knob.y,Math.max(1.1,s*.009),Math.max(1.1,s*.009),'#805a39');
    const water={x:w*aim,y:h*(w<h?.585:.66)+Math.sin(t*2)*h*.002};
    lure={...hang};
    if(casting&&state.age>=RELEASE_TIME){if(!wasCast||!castStart){castStart=lastTip?{...lastTip}:{...hang};wasCast=true;}const k=clip((state.age-RELEASE_TIME)/(CAST_TIME-RELEASE_TIME));lure.x=mix(castStart.x,water.x,k);lure.y=mix(castStart.y,water.y,k)-4*k*(1-k)*s*.48;}
    if(['wait','bite','reel'].includes(phase)){
      lure={...water};
      if(pull){lure.x=mix(water.x,x+s*.33,state.progress*.9)+Math.sin(state.age*4)*Math.min(1,state.age*3)*s*.075*(1-state.progress);lure.y=mix(water.y,y+s*.06,state.progress*.8);}
      if(phase==='bite')lure.y+=Math.abs(Math.sin(t*12))*s*.032;
      if(phase==='wait'&&state.age>1)lure.y+=Math.sin(t*8)*s*.006;
      lastWater={...lure};
      for(let k=0;k<2;k++){const u=(t*(pull?.98:.58)+k*.5)%1;ripple(lure.x,lure.y+s*.012,s*(.018+u*.14),'rgba(232,255,222,'+((1-u)*.68)+')');}
    }
    if(landing){const k=clip(state.age/LAND_TIME);lure={x:mix(lastWater.x,hang.x,k),y:mix(lastWater.y,hang.y,k)-Math.sin(Math.PI*k)*s*.32};}
    if(returning){returning.age+=dt;const u=clip(returning.age/.32);const k=u*u*(3-2*u);lure={x:mix(returning.from.x,hang.x,k),y:mix(returning.from.y,hang.y,k)-Math.sin(Math.PI*k)*s*.055};if(u===1)returning=null;}
    const sag=pull?s*(1-state.tension)*.014:casting&&wasCast?s*.054:s*.032;c.beginPath();c.moveTo(tip.x,tip.y);c.quadraticCurveTo((tip.x+lure.x)/2,(tip.y+lure.y)/2+sag,lure.x,lure.y);c.strokeStyle='#3455559c';c.lineWidth=2.0;c.stroke();c.strokeStyle='#fffae2cd';c.lineWidth=1;c.stroke();
    c.lineWidth=1;const b=Math.max(3,s*.020);ellipse(c,lure.x,lure.y,b,b*1.4,'#f7e7bc','#5d6050');c.beginPath();c.ellipse(lure.x,lure.y,b,b*1.4,0,Math.PI,2*Math.PI);c.fillStyle='#c95736';c.fill();line(c,[[lure.x,lure.y-b],[lure.x,lure.y-b*2.3]],'#8d5031',1.6);
    if(landing||phase==='caught'){c.save();c.translate(lure.x,lure.y+b);const flutter=landing?.20:Math.exp(-state.age*1.3)*.17+.04;c.rotate(-Math.PI*.5+Math.sin(t*12)*flutter);drawFish(c,-s*.113,0,s*.32,state.fish);c.restore();}
    for(let i=sparks.length-1;i>=0;i--){const p=sparks[i];p.age+=dt;if(p.age>.52){sparks.splice(i,1);continue;}ellipse(c,p.x+p.dx*p.age,p.y+p.dy*p.age+s*.82*p.age*p.age,1.8,2.5,'rgba(228,255,244,'+(1-p.age/.52)+')');}
    marker.hidden=phase!=='bite';if(!marker.hidden){marker.style.left=lure.x+'px';marker.style.top=(lure.y-12)+'px';}
    lastTip=hang;
  }
  resize();
  return {resize,update,prepareSprites:sprite.warm,attach(ch){avatar=ch;avatar.resize(v);}};
}
