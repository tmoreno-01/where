// Occupancy and attachment graph. Persistent parts, local stochastic decisions.
const R=(a,b)=>a+Math.random()*(b-a),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const key=(x,y,z)=>x+','+y+','+z;
const offsets=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
export const spacing=.91;
export class Colony{
 constructor(count){this.count=count;this.clock=0;this.agents=[];this.occupied=new Map();this.reserved=new Set();this.jobs=[];this.exchanges=[];this.events={moves:0,exchanges:0,parts:0};this.focus=[0,9,2];this.focusUntil=0;this.region=[0,8,2];this.regionTime=0;this.reset();}
 reset(){this.clock=0;this.agents=[];this.occupied.clear();this.reserved.clear();this.jobs=[];this.exchanges=[];this.events={moves:0,exchanges:0,parts:0};this.focusUntil=0;this.regionTime=0;let sites=[];
 for(let z=0;z<9;z++)for(let y=2;y<26;y++)for(let x=-14;x<=14;x++){
  const X=x*spacing,Y=y*spacing,Z=.8+z*spacing;
  const centre=1.1*Math.sin(Y*.53)+.45*Math.cos(Y*1.1);
  const envelope=((X-centre)/(3.9+.6*Math.sin(Y*.6)))**2+((Y-8.4)/6.5)**2+((Z-2.1)/3.1)**2;
  const cavity1=((X+.4)/1.35)**2+((Y-7.2)/1.2)**2+((Z-2.7)/2.7)**2;
  const cavity2=((X-1.4)/.95)**2+((Y-11.7)/1.35)**2+((Z-2.3)/2.2)**2;
  if(cavity1<.9||cavity2<.9)continue;
  const irregular=.12*Math.sin(x*.75+y*.53+z*.83)+.12*Math.cos(y*.81-z*.63)+R(-.17,.17);
  sites.push({x,y,z,score:envelope+irregular+(z===0?-.27:0)});
 }
 sites.sort((a,b)=>a.score-b.score);
 for(let i=0;i<this.count;i++){const s=sites[i],style=i%12;const a={id:i,style,site:[s.x,s.y,s.z],rot:[R(-Math.PI,Math.PI),R(-Math.PI,Math.PI),R(-Math.PI,Math.PI)],scale:R(.75,.93),color:R(0,1),partColors:null,temper:R(.2,1),cool:R(0,8),job:null,exchange:null};a.partColors=Array.from({length:6},()=>clamp(a.color+R(-.13,.13),0,.9999));this.agents.push(a);this.occupied.set(key(...a.site),a);}
 }
 position(s){return [s[0]*spacing,s[1]*spacing,1.28+s[2]*spacing];}
 neighbours(s){return offsets.map(d=>[s[0]+d[0],s[1]+d[1],s[2]+d[2]]);}
 degree(s){return this.neighbours(s).reduce((n,t)=>n+Number(this.occupied.has(key(...t))),0);}
 attached(s){return s[2]===0||this.degree(s)>0;}
 valid(s){return Math.abs(s[0])<=14&&s[1]>=2&&s[1]<=27&&s[2]>=0&&s[2]<=9;}
 disturb(p){this.focus=p.slice();this.focusUntil=this.clock+12;}
 distance(p,q){return Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2]);}
 // Removing a chair must not sever a supported branch. Check adjacent nodes
 // still have a path to the facade, with a bounded breadth-first traversal.
 safe(a){if(a.site[2]===0)return false;if(this.neighbours(a.site).some(t=>this.reserved.has(key(...t))))return false;const skip=key(...a.site),adj=this.neighbours(a.site).filter(s=>this.occupied.has(key(...s)));if(adj.length<2)return true;const visited=new Set([skip]);const stack=[adj[0]];let anchored=false;while(stack.length){const s=stack.pop(),k=key(...s);if(visited.has(k))continue;visited.add(k);if(s[2]===0)anchored=true;for(const t of this.neighbours(s)){const tk=key(...t);if(!visited.has(tk)&&this.occupied.has(tk))stack.push(t);}if(anchored&&adj.every(t=>visited.has(key(...t))))return true;}return anchored&&adj.every(t=>visited.has(key(...t)));}
 chooseMove(){const available=this.agents.filter(a=>!a.job&&!a.exchange&&a.cool<=0&&a.site[2]>0&&this.degree(a.site)<6);if(!available.length)return;let best=null,score=-1e9;for(let i=0;i<24;i++){const a=available[Math.random()*available.length|0],p=this.position(a.site),degree=this.degree(a.site);const s=(6-degree)*.28+a.temper*.4+R(0,1)+(this.focusUntil>this.clock?2.5*Math.exp(-this.distance(p,this.focus)/2.6):0);if(s>score&&this.safe(a)){score=s;best=a;}}if(!best)return;
 const a=best,old=a.site.slice(),oldKey=key(...old);let target=null,ts=-1e9;const goal=this.region;
 for(let i=0;i<80;i++){const b=this.agents[Math.random()*this.agents.length|0];if(b===a||b.job)continue;const ns=this.neighbours(b.site),s=ns[Math.random()*6|0],k=key(...s);if(!this.valid(s)||this.occupied.has(k)||this.reserved.has(k))continue;const deg=this.degree(s)-Number(this.neighbours(s).some(t=>key(...t)===oldKey));if(deg<1||deg>3)continue;const p=this.position(s),d=this.distance(p,this.position(old));if(d<.7||d>7.2)continue;const local=1.3*Math.exp(-this.distance(p,goal)/3.0),shape=.55*Math.sin(p[1]*.73+this.clock*.09)+.35*Math.cos(p[0]*.8-this.clock*.07);const value=local+shape+(deg===2?.45:0)-d*.10+R(0,1.7);if(value>ts){ts=value;target=s;}}
 if(!target)return;this.reserved.add(key(...target));this.occupied.delete(oldKey);const from=this.position(old),to=this.position(target),lift=Math.max(from[2],to[2])+R(1.2,2.1);a.job={from,to,target,old,age:0,duration:R(3.2,6.8),lift,rot:a.rot.slice(),endRot:[R(-Math.PI,Math.PI),R(-Math.PI,Math.PI),R(-Math.PI,Math.PI)]};this.jobs.push(a);}
 chooseExchange(){const a=this.agents[Math.random()*this.agents.length|0];if(a.job||a.exchange||a.cool>0)return;let b=null,best=8;for(let i=0;i<65;i++){const c=this.agents[Math.random()*this.agents.length|0];if(c===a||c.style!==a.style||c.job||c.exchange||c.cool>0)continue;const d=this.distance(this.position(a.site),this.position(c.site));if(d<best&&d>.6){best=d;b=c;}}if(!b)return;const part=([3,6,9,11].includes(a.style)?1:0)+(Math.random()*([3,6,9,11].includes(a.style)?5:6)|0);const ex={a,b,part,age:0,duration:R(2.4,4.9),arc:R(.6,1.35)};a.exchange=b.exchange=ex;this.exchanges.push(ex);}
 step(dt,activity){dt=clamp(dt,0,.05)*activity;this.clock+=dt;if(this.clock>this.regionTime){this.region=[R(-4.6,4.6),R(3.5,14),R(1,4.8)];this.regionTime=this.clock+R(8,22);}
 for(const a of this.agents)a.cool=Math.max(0,a.cool-dt);
 this.jobs=this.jobs.filter(a=>{const j=a.job;j.age+=dt;if(j.age<j.duration)return true;const k=key(...j.target);this.reserved.delete(k);a.site=j.target;a.rot=j.endRot;a.job=null;a.cool=R(1,5);this.occupied.set(k,a);this.events.moves++;return false;});
 this.exchanges=this.exchanges.filter(ex=>{ex.age+=dt;if(ex.age<ex.duration)return true;const {a,b,part}=ex;[a.partColors[part],b.partColors[part]]=[b.partColors[part],a.partColors[part]];a.exchange=b.exchange=null;a.cool=b.cool=R(1,4);this.events.exchanges++;this.events.parts+=2;return false;});
 const cap=Math.max(5,Math.round(this.count*.032*activity));if(this.jobs.length<cap&&Math.random()<dt*9)this.chooseMove();if(this.exchanges.length<Math.max(3,Math.round(this.count*.012*activity))&&Math.random()<dt*4)this.chooseExchange();}
 snapshot(){return {chairs:this.agents.length,moving:this.jobs.length,exchanges:this.exchanges.length,occupied:this.occupied.size,reserved:this.reserved.size,events:{...this.events}};}
}