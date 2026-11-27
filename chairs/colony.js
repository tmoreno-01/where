// Occupancy and attachment graph. Persistent parts, local stochastic decisions.
const R=(a,b)=>a+Math.random()*(b-a),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const key=(x,y,z)=>x+','+y+','+z;
const offsets=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
export const spacing=.90;
export class Colony{
 constructor(count){this.count=count;this.clock=0;this.agents=[];this.occupied=new Map();this.reserved=new Set();this.jobs=[];this.exchanges=[];this.events={moves:0,exchanges:0,parts:0};this.focus=[0,9,2];this.focusUntil=0;this.region=[0,8,2];this.regionTime=0;this.reset();}
 reset(){this.clock=0;this.agents=[];this.occupied.clear();this.reserved.clear();this.jobs=[];this.exchanges=[];this.events={moves:0,exchanges:0,parts:0};this.focusUntil=0;this.regionTime=0;let sites=[];
 for(let z=0;z<13;z++)for(let y=0;y<17;y++)for(let x=-12;x<=12;x++){
 const X=x*spacing,Y=.51+y*spacing,Z=(z-6)*spacing,centre=.55*Math.sin(Y*.7);
 const ell=((X-centre)/4.9)**2+((Y-4.6)/4.9)**2+(Z/3.6)**2;
 const hole=((X+.28)/1.68)**2+((Y-1.3)/3.9)**2+(Z/6.0)**2;
 const hole2=((X-1.8)/.95)**2+((Y-6.5)/1.25)**2+(Z/3.8)**2;
 if(hole<.88||hole2<.85)continue;
 sites.push({x,y,z,score:ell+.12*Math.sin(x*.77+y*.58+z*.79)+.08*Math.cos(y*.81-z*.63)+R(-.10,.10)+(y===0?-.32:0)});
 }
 sites.sort((a,b)=>a.score-b.score);
 const pool=new Map(sites.map(s=>[key(s.x,s.y,s.z),s])),front=new Map(),used=new Set(),selected=[];for(const s of sites)if(s.y===0)front.set(key(s.x,s.y,s.z),s);while(selected.length<this.count&&front.size){let best=null;for(const s of front.values())if(!best||s.score<best.score)best=s;const k=key(best.x,best.y,best.z);front.delete(k);used.add(k);selected.push(best);for(const t of this.neighbours([best.x,best.y,best.z])){const tk=key(...t);if(!used.has(tk)&&pool.has(tk))front.set(tk,pool.get(tk));}}if(selected.length<this.count)throw Error('Not enough connected sites');sites=selected;
 for(let i=0;i<this.count;i++){const s=sites[i],style=i%12;const a={id:i,style,site:[s.x,s.y,s.z],rot:s.y===0?[0,R(-Math.PI,Math.PI),0]:[R(-Math.PI,Math.PI),R(-Math.PI,Math.PI),R(-Math.PI,Math.PI)],scale:R(.83,1.02),color:R(0,1),partColors:null,temper:R(.2,1),cool:R(0,8),job:null,exchange:null};a.partColors=Array.from({length:6},()=>clamp(a.color+R(-.13,.13),0,.9999));a.partScales=Array(6).fill(a.scale);a.partIds=Array.from({length:6},(_,p)=>a.id*6+p);a.visits=0;this.agents.push(a);this.occupied.set(key(...a.site),a);}
 }
 position(s){return [s[0]*spacing,.51+s[1]*spacing,(s[2]-6)*spacing];}
 neighbours(s){return offsets.map(d=>[s[0]+d[0],s[1]+d[1],s[2]+d[2]]);}
 degree(s){return this.neighbours(s).reduce((n,t)=>n+Number(this.occupied.has(key(...t))),0);}
 attached(s){return s[1]===0||this.degree(s)>0;}
 valid(s){return Math.abs(s[0])<=14&&s[1]>=0&&s[1]<=17&&s[2]>=0&&s[2]<=12;}
 disturb(p){this.focus=p.slice();this.focusUntil=this.clock+12;}
 distance(p,q){return Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2]);}
 // Removing a chair must not sever a supported branch. Check adjacent nodes
 // still have a path to the facade, with a bounded breadth-first traversal.
 safe(a){if(a.site[1]===0)return false;if(this.neighbours(a.site).some(t=>this.reserved.has(key(...t))))return false;const skip=key(...a.site),adj=this.neighbours(a.site).filter(s=>this.occupied.has(key(...s)));if(adj.length===0)return false;const visited=new Set([skip]);const stack=[adj[0]];let anchored=false;while(stack.length){const s=stack.pop(),k=key(...s);if(visited.has(k))continue;visited.add(k);if(s[1]===0)anchored=true;for(const t of this.neighbours(s)){const tk=key(...t);if(!visited.has(tk)&&this.occupied.has(tk))stack.push(t);}if(anchored&&adj.every(t=>visited.has(key(...t))))return true;}return anchored&&adj.every(t=>visited.has(key(...t)));}
 chooseMove(preferredStyle=null){const available=this.agents.filter(a=>!a.job&&!a.exchange&&a.cool<=0&&a.site[1]>0&&this.degree(a.site)<5&&(preferredStyle===null||a.style===preferredStyle));if(!available.length)return;let best=null,score=-1e9;for(let i=0;i<24;i++){const a=available[Math.random()*available.length|0],p=this.position(a.site),degree=this.degree(a.site);const s=(6-degree)*.40+a.temper*.4+R(0,.65)-Math.min(a.visits*.12,.8)+(this.focusUntil>this.clock?2.5*Math.exp(-this.distance(p,this.focus)/2.6):0);if(s>score&&this.safe(a)){score=s;best=a;}}if(!best)return;
 const a=best,old=a.site.slice(),oldKey=key(...old);let target=null,ts=-1e9;const goal=this.region;const mode=this.mode||'branch';const dir=this.direction||[1,0,0];
 for(let i=0;i<80;i++){const b=this.agents[Math.random()*this.agents.length|0];if(b===a||b.job)continue;const ns=this.neighbours(b.site),s=ns[Math.random()*6|0],k=key(...s);if(!this.valid(s)||this.occupied.has(k)||this.reserved.has(k))continue;const deg=this.degree(s)-Number(this.neighbours(s).some(t=>key(...t)===oldKey));if(deg<1||deg>3)continue;const p=this.position(s),d=this.distance(p,this.position(old));if(d<.7||d>7.2)continue;const local=1.3*Math.exp(-this.distance(p,goal)/3.0),shape=.55*Math.sin(p[1]*.73+this.clock*.09)+.35*Math.cos(p[0]*.8-this.clock*.07);const field=mode==='bridge'?Math.exp(-Math.abs(p[1]-goal[1]))*.85:mode==='repair'?deg*.30:mode==='excavate'?(3-deg)*.30:Math.abs(p[0]-goal[0])*.04+(deg===1?.6:0);const projected=(p[0]-goal[0])*dir[0]+(p[2]-goal[2])*dir[2];const above=this.occupied.has(key(s[0],s[1]+1,s[2]))?-.75:.6;const front=mode==='branch'?projected*.14:mode==='bridge'?-Math.abs(p[1]-goal[1])*.2:mode==='excavate'?(3-deg)*.18:deg*.16;const value=local+shape+field+front+above+(deg===2?.35:0)-d*.12+R(0,.65);if(value>ts){ts=value;target=s;}}
 if(!target)return;a.visits++;this.reserved.add(key(...target));this.occupied.delete(oldKey);const from=this.position(old),to=this.position(target),lift=Math.max(from[1],to[1])+R(1.3,2.5);a.job={from,to,target,old,age:0,duration:R(3.2,6.8),lift,rot:a.rot.slice(),endRot:[R(-Math.PI,Math.PI),R(-Math.PI,Math.PI),R(-Math.PI,Math.PI)]};this.jobs.push(a);}
 chooseExchange(){const a=this.agents[Math.random()*this.agents.length|0];if(a.job||a.exchange||a.cool>0)return;let b=null,best=8;for(let i=0;i<65;i++){const c=this.agents[Math.random()*this.agents.length|0];if(c===a||c.style!==a.style||c.job||c.exchange||c.cool>0)continue;const d=this.distance(this.position(a.site),this.position(c.site));if(d<best&&d>.6){best=d;b=c;}}if(!b)return;const part=([3,6,9,11].includes(a.style)?1:0)+(Math.random()*([3,6,9,11].includes(a.style)?5:6)|0);const ex={a,b,part,age:0,duration:R(2.4,4.9),arc:R(.6,1.35)};a.exchange=b.exchange=ex;this.exchanges.push(ex);}
 step(dt,activity){dt=clamp(dt,0,.05)*activity;this.clock+=dt;if(this.clock>this.regionTime){this.region=[R(-4.6,4.6),R(3.5,14),R(1,4.8)];this.regionTime=this.clock+R(8,22);}
 for(const a of this.agents)a.cool=Math.max(0,a.cool-dt);
 this.jobs=this.jobs.filter(a=>{const j=a.job;j.age+=dt;if(j.age<j.duration)return true;const k=key(...j.target);this.reserved.delete(k);a.site=j.target;a.rot=j.endRot;a.job=null;a.cool=R(1,5);this.occupied.set(k,a);this.events.moves++;return false;});
 this.exchanges=this.exchanges.filter(ex=>{ex.age+=dt;if(ex.age<ex.duration)return true;const {a,b,part}=ex;[a.partColors[part],b.partColors[part]]=[b.partColors[part],a.partColors[part]];a.exchange=b.exchange=null;a.cool=b.cool=R(1,4);this.events.exchanges++;this.events.parts+=2;return false;});
 const cap=Math.max(5,Math.round(this.count*.032*activity));if(this.jobs.length<cap&&Math.random()<dt*9)this.chooseMove();if(this.exchanges.length<Math.max(3,Math.round(this.count*.012*activity))&&Math.random()<dt*4)this.chooseExchange();}
 snapshot(){return {chairs:this.agents.length,moving:this.jobs.length,exchanges:this.exchanges.length,occupied:this.occupied.size,reserved:this.reserved.size,events:{...this.events}};}
}