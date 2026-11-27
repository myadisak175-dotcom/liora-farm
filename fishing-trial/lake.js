// Mobile/keyboard input, catch records and the local game clock.
import {createFishing,FISH} from './fishing.js?v=2';
import {createScenery} from './scenery.js?v=2';
import {fishPlate} from './fish-art.js';
const $=id=>document.getElementById(id);
const icons={
 rod:'<path d="m3 21 5-6 11-12c2 1 2 5 1 8l-1 3m-1 0c0 2 3 2 3 0"/><circle cx="8" cy="16" r="2"/>',
 cast:'<path d="m3 20 5-6 10-9c1-1 3-1 3 1v7"/><circle cx="8" cy="15" r="2"/><path d="M20 16c0 2 3 1 2-1"/>',
 book:'<path d="M3 5c3-1 6-1 9 1 3-2 6-2 9-1v14c-3-1-6-1-9 1-3-2-6-2-9-1zM12 6v14"/>',
 sound:'<path d="M3 9h4l5-4v14l-5-4H3zM16 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>',
 mute:'<path d="M3 9h4l5-4v14l-5-4H3zM16 9l6 6m0-6-6 6"/>',
 hook:'<path d="M15 3v12a6 6 0 0 1-12 0v-4l3 3"/><circle cx="15" cy="3" r="1.5"/>',
 reel:'<circle cx="10" cy="13" r="6"/><circle cx="10" cy="13" r="2"/><path d="m12 12 8-7m-1 0 2-1"/>',
 float:'<path d="M12 2v5m0 10v5M8 12c0-3 2-5 4-5s4 2 4 5-2 5-4 5-4-2-4-5zM8 12h8"/>'
};
function icon(key){return '<svg aria-hidden="true" class="icon" viewBox="0 0 24 24">'+icons[key]+'</svg>';}
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
let records={},storageOK=true,soundOn=true,audio;
try{const data=JSON.parse(localStorage.getItem('liora.fishing.trial.v1')||'{}');for(const fish of FISH){const row=data?.[fish.id];if(row&&Number.isSafeInteger(row.count)&&row.count>0&&Number.isFinite(row.best))records[fish.id]={count:row.count,best:row.best};}soundOn=localStorage.getItem('liora.fishing.sound')!=='off';}catch{storageOK=false;}
function refreshSound(){const btn=$('sound');btn.innerHTML=icon(soundOn?'sound':'mute');btn.setAttribute('aria-label',soundOn?'ปิดเสียง':'เปิดเสียง');btn.setAttribute('aria-pressed',String(soundOn));}
function startSound(){try{if(!audio)audio=new(window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume().catch(()=>{});}catch{}}
function tone(freq,to,dur=.18,offset=0,volume=.07){if(!audio||!soundOn)return;const t=audio.currentTime+offset,o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(to,t+dur);g.gain.setValueAtTime(.001,t);g.gain.exponentialRampToValueAtTime(volume,t+.012);g.gain.exponentialRampToValueAtTime(.001,t+dur);o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+dur+.015);}
$('sound').onclick=()=>{soundOn=!soundOn;startSound();refreshSound();tone(520,650);try{localStorage.setItem('liora.fishing.sound',soundOn?'on':'off');}catch{}};
refreshSound();
const book=$('book'),action=$('action'),feedback=$('feedback'),scenery=createScenery($('scenery'),$('tackle'),$('biteFlag'));
const texts={
 ready:['พร้อมตกปลา','แตะเพื่อเหวี่ยงเบ็ดลงบึง','เหวี่ยงเบ็ด','cast'],
 cast:['เหวี่ยงเบ็ด','กำลังส่งทุ่นลงน้ำ','เหวี่ยงเบ็ด…','cast'],
 wait:['รอปลา','ดูทุ่นไว้ พอทุ่นจมให้แตะวัดเบ็ด','รอปลากินเหยื่อ','float'],
 bite:['ทุ่นจมแล้ว!','แตะตอนนี้เพื่อเกี่ยวปลา','วัดเบ็ด!','hook'],
 reel:['ปลาอยู่ปลายสาย','กดค้างเพื่อกรอ ปล่อยเมื่อสายตึง','กดค้างเพื่อกรอ','reel'],
 land:['ปลาขึ้นจากน้ำ','กำลังยกปลาขึ้นท่า','ยกปลา…','hook'],
 caught:['ตกปลาได้แล้ว','บันทึกปลาลงสมุดแล้ว','เหวี่ยงอีกครั้ง','cast'],
 missed:['ปลาหลุดแล้ว','','ลองอีกครั้ง','cast']
};
function onChange(s){
  const [phase,hint,label,key]=texts[s.phase];$('phaseName').textContent=phase;$('hint').textContent=s.phase==='missed'?s.reason:hint;
  action.querySelector('span').textContent=label;action.querySelector('i').innerHTML=icon(key);
  // Keep the button focusable and release events live while waiting for the next phase.
  action.setAttribute('aria-disabled',String(['cast','wait','land'].includes(s.phase)));
  $('meters').hidden=s.phase!=='reel';$('retrieve').hidden=s.phase!=='wait';feedback.replaceChildren();
  if(s.phase==='wait')tone(340,105,.20);
  if(s.phase==='bite'){tone(460,680);tone(630,850,.16,.12);navigator.vibrate?.(35);}
  if(s.phase==='reel')tone(360,595);
  if(s.phase==='missed')tone(270,130,.25);
  if(s.phase==='caught'){tone(460,555,.2);tone(650,740,.24,.14);tone(780,920,.3,.32);}
}
function onCatch(record){const fish=FISH.find(f=>f.id===record.id),previous=records[record.id];records[record.id]={count:(previous?.count||0)+1,best:Math.max(previous?.best||0,record.length)};
  try{localStorage.setItem('liora.fishing.trial.v1',JSON.stringify(records));}catch{storageOK=false;}
  const name=document.createElement('strong'),size=document.createElement('small');name.textContent=fish.name;
  size.textContent=record.length+' ซม.'+(!previous?' · พบครั้งแรก':record.length>previous.best?' · สถิติใหม่':'');
  feedback.replaceChildren(fishPlate(fish),name,size);if(!storageOK)$('hint').textContent='บันทึกปลาไว้ในรอบนี้แล้ว';countBook();}
function countBook(){$('speciesCount').textContent=Object.keys(records).length+'/'+FISH.length;}
countBook();const fishing=createFishing({onChange,onCatch});onChange(fishing.state);
function showBook(){fishing.release();$('entries').replaceChildren();for(const f of FISH){const r=records[f.id],entry=document.createElement('div');entry.className='entry';const words=document.createElement('div'),name=document.createElement('strong'),stats=document.createElement('small');name.textContent=r?f.name:'ยังไม่ค้นพบ';stats.textContent=r?'ตกได้ '+r.count+' ตัว · ยาวที่สุด '+r.best+' ซม.':'ยังไม่เคยตกได้';words.append(name,stats);entry.append(fishPlate(f,!r),words);$('entries').append(entry);}const n=Object.keys(records).length,total=Object.values(records).reduce((s,r)=>s+r.count,0);$('bookSummary').textContent='ค้นพบ '+n+' จาก '+FISH.length+' ชนิด · ตกได้ทั้งหมด '+total+' ตัว';book.showModal();}
$('openBook').onclick=showBook;$('closeBook').onclick=()=>book.close();book.onclick=e=>{if(e.target===book){const r=book.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)book.close();}};
$('retrieve').onclick=()=>fishing.retrieve();let pointer=null,keyboard=false;
function press(){if(book.open||document.hidden)return;startSound();if(fishing.state.phase==='ready'||fishing.state.phase==='caught'||fishing.state.phase==='missed')tone(180,320,.13);fishing.press();}
action.onpointerdown=e=>{if(!e.isPrimary||e.button!==0||pointer!==null)return;pointer=e.pointerId;action.setPointerCapture(e.pointerId);press();};
function release(e){if(e.pointerId!==pointer)return;pointer=null;fishing.release();}
action.onpointerup=release;action.onpointercancel=release;action.onlostpointercapture=release;
action.onclick=e=>{if(e.detail===0){press();fishing.release();}};
window.addEventListener('keydown',e=>{if(book.open||e.repeat||keyboard)return;const target=e.target;if(e.code==='Space'&&(target===document.body||target===action||target===$('lake'))){e.preventDefault();keyboard=true;press();}});
window.addEventListener('keyup',e=>{if(e.code==='Space'&&keyboard){e.preventDefault();keyboard=false;fishing.release();}});
function clearInput(){keyboard=false;pointer=null;fishing.release();}
window.addEventListener('blur',clearInput);document.addEventListener('visibilitychange',clearInput);
const modelCanvas=$('avatar');import('./angler.js?v=2').then(m=>m.loadAngler(modelCanvas)).then(ch=>{scenery.attach(ch);modelCanvas.dataset.ready='true';}).catch(err=>{modelCanvas.hidden=true;scenery.prepareSprites();console.info('Using rendered Vivi poses',err.message);});
window.addEventListener('resize',()=>scenery.resize());
let last=performance.now(),elapsed=0,display='';
function tick(now){const dt=Math.min(.1,(now-last)/1000);last=now;if(!document.hidden&&!book.open){elapsed+=dt;fishing.update(dt);const s=fishing.state;scenery.update(s,elapsed,dt);
  if(s.phase==='reel'){const t=Math.round(s.tension*100),p=Math.round(s.progress*100);$('distance').textContent=p+'%';$('stress').textContent=t+'%';$('progressBar').style.transform='scaleX('+s.progress+')';$('tensionBar').style.transform='scaleX('+s.tension+')';$('tensionBar').parentNode.classList.toggle('hot',t>=70);const newText=t>=70?'ปล่อยนิ้วให้สายคลาย':s.running?'ปลากำลังดิ้น ระวังสายตึง':'ปลาเริ่มอ่อนแรง กดค้างเพื่อกรอ';if(display!==newText){$('hint').textContent=newText;display=newText;}}else display='';}
  requestAnimationFrame(tick);}
requestAnimationFrame(tick);
