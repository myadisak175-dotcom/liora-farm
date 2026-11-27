// Small ink-and-gouache fish plates for a catch, the journal, and a fish on the line.
export function drawFish(c, x, y, size, fish, unknown = false) {
  c.save(); c.translate(x,y); c.scale(size/130,size/130);
  const edge=unknown?'#8e9d86':'#48584f', fin=unknown?'#a5b09b':fish.fin;
  function shape(d,fill,ink=true){const p=new Path2D(d); c.fillStyle=fill;c.fill(p);if(ink){c.strokeStyle=edge;c.lineWidth=1.4;c.stroke(p);}return p;}
  shape('M-33 -2 Q-47 -6 -59 -18 Q-57 -7 -52 0 Q-57 8 -58 18 Q-45 12 -32 4Z',fin);
  shape('M-14 -12 Q-8 -25 -2 -24 L11 -15 L23 -10Z',fin);
  shape('M-5 10 Q-3 21 4 23 L14 11Z',fin);
  const slim=fish.id==='silver'||fish.id==='trout';
  const body=slim?'M-39 0 Q-18 -15 7 -13 Q29 -13 46 -1 Q50 3 43 5 Q15 17 -11 10 Q-26 6 -39 3Z':'M-39 0 Q-23 -11 -11 -16 Q12 -26 34 -12 Q45 -5 47 0 L46 5 Q26 21 -1 16 Q-21 13 -39 3Z';
  const g=c.createLinearGradient(0,-20,0,17);g.addColorStop(0,unknown?'#a6b39b':fish.color);g.addColorStop(.58,unknown?'#a6b39b':fish.color);g.addColorStop(1,unknown?'#b6bfaa':fish.belly);
  const p=shape(body,g);
  if(!unknown){c.save();c.clip(p);
    c.strokeStyle='#395a5064';c.lineWidth=2;
    if(fish.pattern==='rainbow'||fish.pattern==='stripe'){c.beginPath();c.moveTo(-39,1);c.quadraticCurveTo(0,-3,27,1);c.strokeStyle=fish.pattern==='rainbow'?'#ce9692':'#dbe4cf';c.lineWidth=4;c.stroke();}
    for(let i=0;i<8;i++){const xx=-29+i*7;
      if(fish.pattern==='bars'){c.fillStyle='#40654e';c.beginPath();c.moveTo(xx,-20);c.lineTo(xx+5,-19);c.lineTo(xx+1,(i%3)*2-2);c.fill();}
      else for(let j=0;j<3;j++){const yy=-14+j*5+(i%2)*2;c.fillStyle=fish.pattern==='stars'?'#f5e5bc':'#4962588c';if(fish.pattern==='scales'){c.strokeStyle='#875c3e81';c.lineWidth=1;c.beginPath();c.arc(xx,yy,3,0,2.2);c.stroke();}else{c.beginPath();c.arc(xx+j%2*2,yy,fish.pattern==='stars'?1.5:.85,0,7);c.fill();}}}
    c.restore();shape('M8 2 Q0 8 -7 9 Q0 14 12 6Z',fin);
    c.strokeStyle=edge;c.lineWidth=1.3;c.beginPath();c.moveTo(22,-8);c.quadraticCurveTo(16,2,23,9);c.stroke();
    c.fillStyle='#f4e7be';c.beginPath();c.arc(34,-3,3.4,0,7);c.fill();c.fillStyle='#293d36';c.beginPath();c.arc(34.4,-3,2,0,7);c.fill();
  }
  c.restore();
}
export function fishPlate(fish,unknown=false){const canvas=document.createElement('canvas');canvas.width=240;canvas.height=110;drawFish(canvas.getContext('2d'),126,53,235,fish,unknown);return canvas;}
