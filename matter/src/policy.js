const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const key='matter-policy-v2';
export class AdaptivePolicy {
 constructor(modes,enabled=true){this.modes=modes;this.enabled=enabled;this.table={};this.history=[];this.active=null;this.total=0;this.lastReward=null;this.lastNovelty=0;
 if(enabled)try{const old=JSON.parse(localStorage.getItem(key)||'null');if(old?.version===1){for(const [k,v] of Object.entries(old.table||{}))if(/^[a-z]+:[a-z]+$/.test(k)&&Number.isFinite(v.n)&&Number.isFinite(v.q))this.table[k]={n:clamp(v.n,0,100000),q:clamp(v.q)};this.total=clamp(Number(old.total)||0,0,100000);}}catch{}}
 context(m){return !m?'unknown':m.speed>1.7?'fast':m.density>1.05?'dense':m.spread>.31?'spread':m.edge>.27?'edge':'balanced';}
 item(ctx,mode){const k=ctx+':'+mode;return this.table[k]||(this.table[k]={n:0,q:.5});}
 begin(mode,m,age){this.active={mode,context:this.context(m),age,values:[]};}
 observe(m,age){
 if(!this.enabled||!m||!Array.isArray(m.distribution)||m.distribution.length!==64||!this.active||age-this.active.age<4)return;
 const dist=(a,b)=>a.reduce((s,x,i)=>s+Math.abs(x-b[i]),0)*.5;
 const novelty=this.history.length?Math.min(...this.history.map(h=>dist(m.distribution,h))):.5;
 this.lastNovelty=novelty;this.history.push(m.distribution.slice());if(this.history.length>18)this.history.shift();
 const contrast=clamp(m.densityContrast*.8),motion=clamp(m.speedContrast*.9),balance=clamp(1-Math.abs(m.entropy-.85)*2.7),spread=clamp(1-Math.abs(Math.min(m.spreadX??.22,m.spreadY??.22)-.27)*5),coverage=clamp((m.coverage??.5)/.75),walls=clamp((m.edge-.52)*2),edgeVar=m.sides?m.sides.filter(x=>x>.018).length/4:.5;
 const reward=clamp(.19*contrast+.15*motion+.16*balance+.15*spread+.12*coverage+.10*edgeVar+.13*clamp(novelty*3)-.18*walls);
 if(Number.isFinite(reward))this.active.values.push(reward);
 }
 finish(){const a=this.active;this.active=null;if(!this.enabled||!a||!a.values.length)return;
 const q=this.item(a.context,a.mode),reward=a.values.reduce((x,y)=>x+y,0)/a.values.length;q.n++;q.q+=(reward-q.q)*Math.max(.12,1/q.n);this.total++;this.lastReward=reward;
 try{localStorage.setItem(key,JSON.stringify({version:1,table:this.table,total:this.total}));}catch{}
 }
 bonus(mode,m){if(!this.enabled)return 0;const q=this.item(this.context(m),mode);return (q.q-.5)*3.2+Math.min(1.25,Math.sqrt(Math.log(2+this.total)/(q.n+1))*.46);}
 reset(){this.table={};this.total=0;this.lastReward=null;this.history=[];this.active=null;try{localStorage.removeItem(key);}catch{}}
 snapshot(){return {enabled:this.enabled,episodes:this.total,reward:this.lastReward,novelty:this.lastNovelty,table:this.table};}
}