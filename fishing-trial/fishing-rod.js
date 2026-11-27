// A flexible bamboo shaft with one angular spring. The root follows the wrist exactly;
// only the outer sections lag behind a fast stop or bow toward a pulling fish.
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export function createRod(){
  let lastAngle=null,bend=0,velocity=0,pendulum=0,pendulumSpeed=0,previousTip=null;
  function reset(){lastAngle=null;previousTip=null;bend=velocity=pendulum=pendulumSpeed=0;}
  function update(grip,state,view,dt) {
    const angle=Math.atan2(grip.dy,grip.dx), foreshorten=Math.hypot(grip.dx,grip.dy);
    const rate=lastAngle===null?0:Math.atan2(Math.sin(angle-lastAngle),Math.cos(angle-lastAngle))/Math.max(dt,.001);
    lastAngle=angle;
    const pull=state.phase==='reel' ? state.tension*(state.running?.92:.68):0;
    const target=clamp(-rate*.062-pull-.025,-.9,.85);
    const steps=Math.max(1,Math.ceil(dt*120)),h=dt/steps;
    for(let i=0;i<steps;i++){velocity+=((target-bend)*127-velocity*13)*h;bend+=velocity*h;}
    const length=view.s*1.01*foreshorten;
    const points=[{x:grip.x,y:grip.y}];
    for(let i=0;i<12;i++){
      const u=(i+.5)/12,a=angle+bend*u*u,last=points[i];
      points.push({x:last.x+Math.cos(a)*length/12,y:last.y-Math.sin(a)*length/12});
    }
    const tip=points[12],butt={x:grip.x-Math.cos(angle)*length*.165,y:grip.y+Math.sin(angle)*length*.165};
    const swing=previousTip?clamp((previousTip.x-tip.x)/Math.max(.001,dt*view.s)*.20,-1.05,1.05):0;
    for(let i=0;i<steps;i++){pendulumSpeed+=((swing-pendulum)*82-pendulumSpeed*8)*h;pendulum+=pendulumSpeed*h;}
    previousTip=tip;
    const drop=view.s*.24;
    return {points,tip,butt,hang:{x:tip.x+Math.sin(pendulum)*drop,y:tip.y+Math.cos(pendulum)*drop},bend};
  }
  return {update,reset};
}