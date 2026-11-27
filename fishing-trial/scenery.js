// The fishing station. Work in CSS pixels so the grip, rod, bobber and water FX share a frame.
import { drawFish } from './fish-art.js';
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
function fallbackAngler(c,v,t){const {x,y,s}=v;c.save();c.translate(x,y);c.scale(s/150,s/150);const bob=Math.sin(t*2)*.6;
  line(c,[[-7,-42],[-10,-15],[-11,-2]],'#53473d',10);line(c,[[9,-41],[8,-14],[13,-1]],'#675746',10);
  polygon(c,[[-15,-86],[3,-91],[12,-79],[20,-43],[6,-36],[-24,-44]],'#ac824e');
  polygon(c,[[-14,-79],[-3,-81],[15,-40],[1,-40]],'#ccb97a');ellipse(c,0,-101+bob,12,15,'#d3a179');
  ellipse(c,-4,-103+bob,15,15,'#51463f');ellipse(c,-1,-112+bob,24,6,'#94703e');ellipse(c,-4,-116+bob,14,8,'#bb9957');
  line(c,[[6,-80],[18,-65],[31,-72+bob]],'#ad8662',7);c.restore();return {x:x+s*.205,y:y-s*.48};}
export function createScenery(base,front,marker){
  const under=base.getContext('2d'),c=front.getContext('2d'),dock=document.createElement('canvas');
  let v,avatar=null,aim=.66,phase='',wasCast=false,lure={x:0,y:0},lastWater={x:0,y:0},lastTip=null,angle=.66,castStart=null;
  const sparks=[];
  function resize(){const w=base.clientWidth,h=base.clientHeight,dpr=Math.min(devicePixelRatio||1,1.65),portrait=w<h;
    v={w,h,dpr,x:w*(portrait?.28:.33),y:h*(portrait?.67:.82),s:Math.min(h*(portrait?.29:.37),w*.51)};
    for(const canvas of [base,front,dock]){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
    for(const ctx of [under,c,dock.getContext('2d')])ctx.setTransform(dpr,0,0,dpr,0,0);
    paintDock(dock.getContext('2d'),v);avatar?.resize(v);lastTip=null;castStart=null;
    if(phase==='land'){lastWater={x:w*aim,y:h*.6};}
  }
  function ripple(x,y,r,col){c.lineWidth=1.3;ellipse(c,x,y,r,r*.23,null,col);}
  function update(state,t,dt){
    const {w,h,s,x,y}=v;under.clearRect(0,0,w,h);c.clearRect(0,0,w,h);
    for(let i=0;i<36;i++){const yy=h*(.54+.43*noise(i+1)),xx=w*((noise(i+43)+t*.004*(i%3+1))%1),a=(.5+.5*Math.sin(t*1.4+i*7))*.31;
      line(under,[[xx,yy],[xx+w*(.005+noise(2*i+6)*.018),yy+.4]],'rgba(246,248,200,'+a+')',1.2);}
    under.drawImage(dock,0,0,w,h);
    const grip=avatar?avatar.frame(state,dt,v):fallbackAngler(under,v,t);
    const changed=phase!==state.phase;
    if(changed){if(state.phase==='cast'){aim=.61+Math.random()*.12;castStart=null;wasCast=false;}
      if(state.phase==='wait'||state.phase==='bite'||state.phase==='land'){const count=state.phase==='bite'?12:7;for(let k=0;k<count;k++)sparks.push({x:lure.x,y:lure.y,dx:(noise(k*3+1)-.5)*s*.56,dy:-s*(.05+.39*noise(k+16)),age:0});}
      phase=state.phase;}
    const pull=state.phase==='reel',casting=state.phase==='cast',landing=state.phase==='land';
    let desired=.58+Math.sin(t*1.8)*.022;
    if(casting){const a=state.age;desired=a<.36?mix(.58,2.4,clip(a/.36)):a<.64?mix(2.4,.21,clip((a-.36)/.28)):mix(.21,.48,clip((a-.64)/.51));}
    if(pull)desired=.46+state.tension*.55+(state.holding?.09*Math.sin(t*10):0);
    if(landing||state.phase==='caught')desired=1.12;
    angle=mix(angle,desired,1-Math.exp(-dt*18));
    const rodLen=Math.min(s*.99,w*.44),bend=pull?state.tension*.32:.02;
    function rod(u){return {x:grip.x+Math.cos(angle)*rodLen*u+Math.sin(angle)*rodLen*bend*u*u,y:grip.y-Math.sin(angle)*rodLen*u+Math.cos(angle)*rodLen*bend*u*u};}
    const tip=rod(1), butt=rod(-.14);
    line(c,[[butt.x,butt.y],[grip.x,grip.y]],'#61472a',Math.max(3,s*.025));
    for(let i=0;i<11;i++){const a=rod(i/11),b=rod((i+1)/11);line(c,[[a.x,a.y],[b.x,b.y]],i%3===0?'#83683e':'#a88c50',Math.max(1.2,s*.018*(1-i/13)));if(i%3===0)ellipse(c,a.x,a.y,s*.009,s*.009,'#655235');}
    const reel=rod(-.025);ellipse(c,reel.x,reel.y+s*.021,s*.024,s*.024,'#8f8767','#554d37');
    const water={x:w*aim,y:h*(w<h?.585:.66)+Math.sin(t*2)*h*.002};
    const hang={x:tip.x+Math.sin(t*1.6)*s*.016,y:tip.y+s*.27};
    lure={...hang};
    if(casting&&state.age>=.46){if(!wasCast||!castStart){castStart=lastTip?{...lastTip}:{...hang};wasCast=true;}const k=clip((state.age-.46)/.69);lure.x=mix(castStart.x,water.x,k);lure.y=mix(castStart.y,water.y,k)-Math.sin(Math.PI*k)*s*.54;}
    if(['wait','bite','reel'].includes(phase)){
      lure={...water};
      if(pull){lure.x=mix(water.x,x+s*.33,state.progress*.9)+Math.sin(t*4)*s*.10*(1-state.progress);lure.y=mix(water.y,y+s*.06,state.progress*.8);}
      if(phase==='bite')lure.y+=Math.abs(Math.sin(t*12))*s*.032;
      if(phase==='wait'&&state.age>1)lure.y+=Math.sin(t*8)*s*.006;
      lastWater={...lure};
      for(let k=0;k<2;k++){const u=(t*(pull?.98:.58)+k*.5)%1;ripple(lure.x,lure.y+s*.012,s*(.018+u*.14),'rgba(232,255,222,'+((1-u)*.68)+')');}
    }
    if(landing){const k=clip(state.age/.85);lure={x:mix(lastWater.x,hang.x,k),y:mix(lastWater.y,hang.y,k)-Math.sin(Math.PI*k)*s*.32};}
    const sag=casting||pull?0:s*.04;c.beginPath();c.moveTo(tip.x,tip.y);c.quadraticCurveTo((tip.x+lure.x)/2,(tip.y+lure.y)/2+sag,lure.x,lure.y);c.strokeStyle='#3455559c';c.lineWidth=2.0;c.stroke();c.strokeStyle='#fffae2cd';c.lineWidth=1;c.stroke();
    c.lineWidth=1;const b=Math.max(3,s*.020);ellipse(c,lure.x,lure.y,b,b*1.4,'#f7e7bc','#5d6050');c.beginPath();c.ellipse(lure.x,lure.y,b,b*1.4,0,Math.PI,2*Math.PI);c.fillStyle='#c95736';c.fill();line(c,[[lure.x,lure.y-b],[lure.x,lure.y-b*2.3]],'#8d5031',1.6);
    if(landing||phase==='caught'){c.save();c.translate(lure.x,lure.y+b);c.rotate(Math.PI*.48+Math.sin(t*10)*.12);drawFish(c,s*.09,0,s*.32,state.fish);c.restore();}
    for(let i=sparks.length-1;i>=0;i--){const p=sparks[i];p.age+=dt;if(p.age>.52){sparks.splice(i,1);continue;}ellipse(c,p.x+p.dx*p.age,p.y+p.dy*p.age+s*.82*p.age*p.age,1.8,2.5,'rgba(228,255,244,'+(1-p.age/.52)+')');}
    marker.hidden=phase!=='bite';if(!marker.hidden){marker.style.left=lure.x+'px';marker.style.top=(lure.y-12)+'px';}
    lastTip=hang;
  }
  resize();
  return {resize,update,attach(ch){avatar=ch;avatar.resize(v);}};
}
