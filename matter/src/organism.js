// Local feedback, not a scripted animation. 64 communicating regions with
// independent activity, fatigue, and learned action values.
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const nb=Array.from({length:64},(_,i)=>[i%8?i-1:-1,i%8<7?i+1:-1,i>=8?i-8:-1,i<56?i+8:-1].filter(j=>j>=0));
const quality=(p,s)=>clamp(1-Math.abs(p-1)*.38)*.65+clamp(1-Math.abs(s-.9)*.5)*.35;
export class Organism {
 constructor(random=Math.random){this.random=random;this.reset();}
 reset(){this.cells=Array.from({length:64},()=>({p:1,s:.7,signal:0,energy:.65,phase:this.random()*6.283,action:-1,deadline:0,base:0,ctx:0,q:Array.from({length:3},()=>[.5,.5,.5,.5]),n:Array.from({length:3},()=>[0,0,0,0])}));this.field=Array.from({length:64},()=>[0,0,0]);this.updates=0;this.learned=0;this.last=null;}
 observe(m,age,learn=true,disturbed=false){
  if(!m?.regions||m.regions.length!==64)return this.field;
  const dt=this.last===null?1.8:clamp(age-this.last,.1,4);this.last=age;this.updates++;
  const signals=this.cells.map(c=>c.signal);
  for(let i=0;i<64;i++){
   const c=this.cells[i],r=m.regions[i],near=nb[i].reduce((a,j)=>a+signals[j],0)/nb[i].length;
   c.p+=(clamp(m.distribution[i]*64,0,5)-c.p)*.55;c.s+=(clamp(r.speed,0,4)-c.s)*.55;
   c.signal=clamp(c.signal*.38+clamp(r.signal)*.42+near*.20);
   c.energy=clamp(c.energy+dt*(.038*(1-c.energy)-.012*c.s-.025*c.signal),.12,1);
   c.phase+=dt*(.11+.16*c.energy+.08*c.signal);
   const ctx=c.p>1.65?0:c.p<.55||c.s<.48?1:2;
   if(c.action<0||age>=c.deadline){
    if(learn&&!disturbed&&c.action>=0&&c.p>.15){const a=c.action,k=c.ctx;const n=++c.n[k][a];c.q[k][a]+=(clamp(.5+(quality(c.p,c.s)-c.base)*1.7)-c.q[k][a])*Math.max(.13,1/n);this.learned++;}
    const prior=ctx===0?[.22,-.02,-.02,.14]:ctx===1?[-.12,.14,.14,.20]:[.01,.12,.12,.08];
    const scores=prior.map((p,a)=>p+(learn?c.q[ctx][a]-.5+.20/Math.sqrt(1+c.n[ctx][a]):0)+this.random()*.16-(a===c.action?.10:0));
    c.action=scores.indexOf(Math.max(...scores));c.ctx=ctx;c.base=quality(c.p,c.s);c.deadline=age+5+this.random()*8;
   }
  }
  const raw=this.cells.map((c,i)=>{
   const left=this.cells[i%8?i-1:i],right=this.cells[i%8<7?i+1:i],down=this.cells[i>=8?i-8:i],up=this.cells[i<56?i+8:i];
   const gx=clamp(left.p-right.p,-1.5,1.5),gy=clamp(down.p-up.p,-1.5,1.5);
   const spin=c.action===1?1:c.action===2?-1:0,activity=(.35+.65*c.energy)*(.68+.32*Math.sin(c.phase));
   const r=m.regions[i],recover=c.action===0?.10:0,exchange=c.action===3?.13:.035;
   const x=(gx*exchange-gy*spin*.12)*activity-clamp(r.vx,-2,2)*recover;
   const y=(gy*exchange+gx*spin*.12)*activity-clamp(r.vy,-2,2)*recover;
   const z=Math.sin(c.phase+2*c.signal)*(.035+.055*activity)+spin*.045*c.signal;
   return [clamp(x,-.27,.27),clamp(y,-.27,.27),clamp(z,-.13,.13)];
  });
  this.field=raw.map((a,i)=>a.map((v,k)=>v*.65+.35*nb[i].reduce((s,j)=>s+raw[j][k],0)/nb[i].length));
  return this.field;
 }
 snapshot(){return {regions:64,observations:this.updates,localUpdates:this.learned,energy:this.cells.reduce((s,c)=>s+c.energy,0)/64,actions:[0,1,2,3].map(a=>this.cells.filter(c=>c.action===a).length)};}
}