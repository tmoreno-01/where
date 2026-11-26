// A local adaptive system: 64 regions sense, communicate, act, recover and evaluate outcomes.
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const TAU=Math.PI*2;
const neighbours=Array.from({length:64},(_,i)=>[i%8?i-1:-1,i%8<7?i+1:-1,i>=8?i-8:-1,i<56?i+8:-1].filter(j=>j>=0));
const quality=(p,s,signal)=>clamp(1-Math.abs(p-1)*.42)*.58+clamp(1-Math.abs(s-.95)*.38)*.32+clamp(signal)*.10;
export class Organism {
 constructor(random=Math.random){this.random=random;this.reset();}
 reset(){
  this.cells=Array.from({length:64},()=>({p:1,s:.75,signal:0,energy:.76,stress:0,memory:0,phase:this.random()*TAU,action:-1,deadline:0,base:0,ctx:0,q:Array.from({length:3},()=>[.5,.5,.5,.5]),n:Array.from({length:3},()=>[0,0,0,0])}));
  this.field=Array.from({length:64},()=>[0,0,0]);this.updates=0;this.learned=0;this.last=null;this.clock=0;
 }
 observe(m,age,learn=true,disturbed=false){
  if(!m?.regions||m.regions.length!==64||!m.distribution||m.distribution.length!==64)return this.field;
  const dt=this.last===null?1.2:clamp(age-this.last,.1,3);this.last=age;this.clock+=dt;
  const signals=this.cells.map(c=>c.signal),phases=this.cells.map(c=>c.phase);
  // First pass: sense the local field and receive signals from adjacent regions.
  for(let i=0;i<64;i++){
   const c=this.cells[i],r=m.regions[i],near=neighbours[i].reduce((a,j)=>a+signals[j],0)/neighbours[i].length;
   const phaseLock=neighbours[i].reduce((a,j)=>a+Math.sin(phases[j]-c.phase),0)/neighbours[i].length;
   const density=clamp(m.distribution[i]*64,0,5),speed=clamp(r.speed,0,4);
   const densityChange=density-c.p,speedChange=speed-c.s;
   const crowd=clamp((density-1.04)*.62),quiet=clamp((.52-speed)*.55);
   const excitation=clamp(Math.abs(densityChange)*.30+Math.abs(speedChange)*.13+clamp(r.signal)*.43+crowd*.22+quiet*.12);
   c.signal=clamp(c.signal*Math.exp(-dt*.82)+excitation*.22+near*.16);
   c.stress=clamp(c.stress*Math.exp(-dt*.38)+crowd*.16+quiet*.08+c.signal*.08);
   c.energy=clamp(c.energy+dt*(.09*(.82-c.energy)-.008*speed-.018*c.signal-.012*c.stress),.24,1);
   c.memory=clamp(c.memory*Math.exp(-dt*.055)+excitation*.16+c.signal*.04);
   c.p+=(density-c.p)*.48;c.s+=(speed-c.s)*.48;
   c.phase+=dt*(.14+.19*c.energy+.15*c.signal+.045*speed+phaseLock*.045);
   const context=c.p>1.62||c.stress>.72?0:c.p<.56||c.s<.46?1:2;
   if(c.action<0||age>=c.deadline){
    if(learn&&!disturbed&&c.action>=0&&c.p>.12){
     const a=c.action,k=c.ctx,n=++c.n[k][a],result=clamp(.5+(quality(c.p,c.s,c.signal)-c.base)*1.8);
     c.q[k][a]+=(result-c.q[k][a])*Math.max(.10,1/n);this.learned++;
    }
    // 0 restore / 1 clockwise / 2 counter-clockwise / 3 relay
    const prior=context===0?[.16,.12,.12,.18]:context===1?[.06,.16,.16,.18]:[.08,.16,.16,.17];
    const scores=prior.map((p,a)=>p+(learn?c.q[context][a]-.5+.22/Math.sqrt(1+c.n[context][a]):0)+this.random()*.14-(a===c.action?.12:0));
    c.action=scores.indexOf(Math.max(...scores));c.ctx=context;c.base=quality(c.p,c.s,c.signal);
    c.deadline=age+3.5+this.random()*5.5;
   }
  }
  // Second pass: local currents, counter-rotation and travelling activity waves.
  const raw=this.cells.map((c,i)=>{
   const x=i%8,y=Math.floor(i/8),near=neighbours[i].reduce((a,j)=>a+signals[j],0)/neighbours[i].length;
   const left=this.cells[x?i-1:i],right=this.cells[x<7?i+1:i],down=this.cells[y?i-8:i],up=this.cells[y<7?i+8:i];
   const gx=clamp(left.p-right.p,-1.5,1.5),gy=clamp(down.p-up.p,-1.5,1.5);
   const spin=c.action===1?1:c.action===2?-1:0,restore=c.action===0?1:0,relay=c.action===3?1:0;
   const activity=(.42+.58*c.energy)*(.72+.28*Math.sin(c.phase));
   const wavePhase=c.phase+x*.57-y*.39+this.clock*.17+c.memory*.42;
   const wave=Math.sin(wavePhase),crossWave=Math.cos(wavePhase*.83+y*.17);
   const signalDrive=(c.signal*.12+near*.10+c.memory*.045)*activity;
   const exchange=.12+relay*.23+c.signal*.065;
   const rotation=.19*spin*(.65+.35*c.energy);
   const phaseLock=neighbours[i].reduce((a,j)=>a+Math.sin(phases[j]-c.phase),0)/neighbours[i].length;
   const vx=gx*exchange-gy*rotation+wave*(.055+signalDrive)+phaseLock*.045-clamp(m.regions[i].vx,-2,2)*restore*.075;
   const vy=gy*exchange+gx*rotation+crossWave*(.055+signalDrive)-phaseLock*.045-clamp(m.regions[i].vy,-2,2)*restore*.075;
   const vz=Math.sin(c.phase*1.22+c.signal*2.7)*(.085+.105*activity)+phaseLock*.065+(relay?crossWave*.055:0)+spin*c.signal*.045;
   return [clamp(vx*activity,-.46,.46),clamp(vy*activity,-.46,.46),clamp(vz,-.29,.29)];
  });
  this.field=raw.map((a,i)=>a.map((v,k)=>v*.78+.22*neighbours[i].reduce((sum,j)=>sum+raw[j][k],0)/neighbours[i].length));
  this.updates++;return this.field;
 }
 snapshot(){return {regions:64,observations:this.updates,localUpdates:this.learned,energy:this.cells.reduce((s,c)=>s+c.energy,0)/64,signal:this.cells.reduce((s,c)=>s+c.signal,0)/64,actions:[0,1,2,3].map(a=>this.cells.filter(c=>c.action===a).length)};}
}