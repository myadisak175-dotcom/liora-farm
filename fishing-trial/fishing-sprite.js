// The same fishing poses, rendered from Vivi’s rig, for browsers without WebGL.
import { actorBox, actorFrame, takes } from './fishing-motion.js?v=2';
import { atlas } from './fishing-frames.js?v=2';

export function createSpriteAngler() {
  const images=new Map();
  const previous=document.createElement('canvas'), current=document.createElement('canvas');
  for(const c of [previous,current]){c.width=actorFrame.width;c.height=actorFrame.height;}
  const prior=previous.getContext('2d'), ctx=current.getContext('2d');
  let take=null,frameIndex=-1,revision=-1,lastContact=null,fromContact=null,transition=1;
  function request(name) {
    if(!images.has(name)) {
      const image=new Image();
      image.src=new URL('./poses/'+name+'.png',import.meta.url).href;
      images.set(name,image);
    }
    return images.get(name);
  }
  const ready=image=>image.complete&&image.naturalWidth>0;
  request('idle');
  request('cast');
  function frame(under,v,motion) {
    let name=motion.name, image=request(name);
    if(!ready(image)) {name=take||'idle';image=request(name);}
    const info=atlas[name],clip=takes[name],n=info.contact.length;
    const t=name===motion.name?motion.time:0;
    const f=clip.loop ? (t%clip.duration)/clip.duration*n : Math.max(0,Math.min(1,t/clip.duration))*(n-1);
    const index=Math.min(n-1,Math.max(0,Math.round(f)% (clip.loop?n:n+1)));
    const box=actorBox(v);
    if(motion.revision!==revision || take!==name) {
      prior.clearRect(0,0,previous.width,previous.height); prior.drawImage(current,0,0);
      fromContact=lastContact; revision=motion.revision; frameIndex=-1; transition=0;
    }
    const blend=fromContact?motion.blend:1;
    const data=info.contact[index];
    const mixed=fromContact && blend<1 ? data.map((v,i)=>fromContact[i]+(v-fromContact[i])*blend) : data;
    if(ready(image) && (index!==frameIndex || blend!==transition || take!==name)) {
      ctx.clearRect(0,0,current.width,current.height);
      const {width:w,height:h}=actorFrame;
      if(blend<1){ctx.globalAlpha=1-blend;ctx.drawImage(previous,0,0);}
      ctx.globalAlpha=blend;
      ctx.drawImage(image,(index%info.cols)*w,Math.floor(index/info.cols)*h,w,h,0,0,w,h);
      ctx.globalAlpha=1; frameIndex=index;transition=blend;take=name;
    }
    under.drawImage(current,box.left,box.top,box.width,box.height);
    lastContact=mixed;
    const xy=(i)=>({x:box.left+mixed[i]*box.width,y:box.top+mixed[i+1]*box.height});
    return {...xy(0),dx:mixed[2],dy:mixed[3],hub:xy(4),knob:xy(6)};
  }
  return {frame,warm(){for(const name of Object.keys(takes))request(name);}};
}