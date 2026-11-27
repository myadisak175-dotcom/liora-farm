// Time and posture for the fishing station. Distances are metres on a 1.65 m actor.
// A frame describes the right grip (forward, up, toward the camera), rod elevation,
// hip travel and drop, forward torso lean, shoulder turn, and the reel handle.
export const CAST_TIME = 1.32;
export const RELEASE_TIME = .59;
export const LAND_TIME = 1.02;
const tau = Math.PI * 2;
const fields = ['reach','height','side','pitch','shift','drop','lean','turn','crank'];
const rest = [.31, 1.04, .105, .63, 0, .025, .055, -.06, 0];
const loaded = [-.065, 1.43, .245, 2.33, -.108, .107, -.145, -.46, 0];
const through = [.50, 1.18, .095, .235, .115, .066, .25, .31, 0];
const hook = [.08, 1.38, .16, 1.45, -.09, .116, -.21, -.17, 0];
const trophy = [.115, 1.37, .15, 1.19, -.038, .016, -.067, -.16, 0];

export const takes = {
  idle: {duration: 2.4, loop: true},
  cast: {duration: CAST_TIME},
  hook: {duration: .48},
  reel: {duration: .76, loop: true},
  brace: {duration: 1.36, loop: true},
  land: {duration: LAND_TIME},
  caught: {duration: 2, loop: true}
};

// Smooth cubic interpolation with nonuniform timing. Zero slopes at extrema keep
// feet and elbows from overshooting the poses during a short, fast rod stop.
function sample(keys, time) {
  const i = keys.findIndex(([t]) => t >= time);
  if (i <= 0) return (i === 0 ? keys[0] : keys.at(-1))[1].slice();
  const [t0, a] = keys[i-1], [t1,b] = keys[i];
  const [tp,p] = keys[Math.max(0,i-2)], [tn,n] = keys[Math.min(keys.length-1,i+1)];
  const u = (time-t0)/(t1-t0), u2=u*u, u3=u2*u;
  return a.map((v,j) => {
    const d=b[j]-v;
    const m0 = (v-p[j])*d > 0 ? (b[j]-p[j])*(t1-t0)/(t1-tp) : 0;
    const m1 = (n[j]-b[j])*d > 0 ? (n[j]-v)*(t1-t0)/(tn-t0) : 0;
    return (2*u3-3*u2+1)*v + (u3-2*u2+u)*m0 + (3*u2-2*u3)*b[j] + (u3-u2)*m1;
  });
}
const castKeys = [
  [0,rest], [.14,[.36,.97,.10,.48,.023,.071,.12,.015,0]],
  [.36,[-.03,1.39,.23,2.14,-.096,.108,-.13,-.41,0]],
  [.44,loaded], [.53,[.145,1.49,.218,1.71,-.022,.082,.025,-.19,0]],
  [RELEASE_TIME,[.365,1.38,.152,.82,.062,.052,.175,.14,0]],
  [.705,through], [.83,[.46,1.125,.092,.33,.092,.063,.207,.235,0]], [CAST_TIME,rest]
];
const hookKeys = [[0,rest],[.07,[.38,.99,.1,.35,.055,.092,.16,.07,0]],[.255,hook],[.48,[.20,1.225,.145,.98,-.067,.083,-.12,-.125,0]]];
const landKeys = [[0,[.22,1.19,.13,.89,-.05,.075,-.11,-.10,0]],[.17,[.34,1.035,.14,.54,.045,.16,.2,.08,0]],[.49,[.025,1.445,.16,1.48,-.105,.065,-.18,-.23,0]],[.71,[.08,1.44,.168,1.35,-.067,.027,-.12,-.205,0]],[LAND_TIME,trophy]];
export function poseAt(name, time) {
  const take=takes[name];
  const t=take.loop ? ((time%take.duration)+take.duration)%take.duration : Math.max(0,Math.min(time,take.duration));
  const wave=t*tau/take.duration, breath=Math.sin(wave);
  let v;
  if(name==='cast') v=sample(castKeys,t);
  else if(name==='hook') v=sample(hookKeys,t);
  else if(name==='land') v=sample(landKeys,t);
  else if(name==='reel') {
    const pump=.5-.5*Math.cos(wave);
    v=[.22+.038*pump,1.235-.064*pump,.148,.99-.18*pump,-.068+.035*pump,.080+.025*pump,-.11+.095*pump,-.115+.08*breath,wave];
  } else if(name==='brace') {
    const tug=.5-.5*Math.cos(wave);
    v=[.157+.020*tug,1.235-.052*tug,.145,.95-.24*tug,-.055-.03*tug,.088+.045*tug,-.105-.065*tug,-.115-.061*tug,0];
  } else {
    v=(name==='caught'?trophy:rest).slice();
    v[1]+=.010*breath; v[3]+=.023*breath; v[5]+=.006*breath;
    v[6]+=.015*breath; v[7]+=.018*Math.sin(wave);
  }
  return Object.fromEntries(fields.map((f,i)=>[f,v[i]]));
}

export function createMotionPlayer() {
  let name='idle', clock=0, age=1, fade=.16, previous=null, previousTime=0, startPose=null, lastPose=null, revision=0;
  function change(next, duration) {
    previous=name; previousTime=clock; startPose=lastPose; name=next; clock=0; age=0; fade=duration; revision++;
  }
  return function step(state,dt) {
    const p=state.phase;
    let next='idle';
    if(p==='cast'||p==='land'||p==='caught') next=p;
    if(p==='reel') next=state.age<takes.hook.duration?'hook':state.holding?'reel':'brace';
    if(name!==next) {
      change(next, next==='cast'?.1:next==='hook'?.07:next==='caught'?.16:.18);
    }
    if(['cast','land'].includes(next)||next==='hook') clock=state.age;
    else clock+=dt*(next==='reel' && state.running?.78:1);
    if(previous)previousTime+=dt;
    age+=dt;
    const u=Math.min(1,age/fade), blend=u*u*(3-2*u);
    const curr=poseAt(name,clock);
    if(previous && blend<1) {
      const old=startPose || poseAt(previous,previousTime);
      for(const f of fields) {
        if(f==='crank') {
          const d=curr[f]-old[f];curr[f]=old[f]+Math.atan2(Math.sin(d),Math.cos(d))*blend;
        } else curr[f]=old[f]+(curr[f]-old[f])*blend;
      }
    } else previous=null;
    lastPose=curr;
    return {name,time:clock,previous,previousTime,blend,revision,pose:curr};
  };
}
export const actorFrame={width:176,height:240,worldHeight:1.89,centerX:.11,top:1.77};
export function actorBox(view) {
  const {width,height,worldHeight,centerX,top}=actorFrame;
  const worldWidth=worldHeight*width/height, pixels=view.s/1.65;
  return {left:view.x+(centerX-worldWidth/2)*pixels,top:view.y-top*pixels,width:worldWidth*pixels,height:worldHeight*pixels};
}
