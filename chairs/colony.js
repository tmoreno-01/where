// The original grid planner is replaced by live physical neighbourhoods.
const R=(a,b)=>a+Math.random()*(b-a),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export class Colony{
 constructor(count){this.count=count;this.reset();}
 reset(){this.clock=0;this.agents=[];this.jobs=[];this.focus=[0,1.8,0];this.focusUntil=0;this.events={moves:0,exchanges:0,parts:0};
 const cells=[];for(let x=-5;x<=5;x++)for(let y=-5;y<=5;y++)for(let z=-5;z<=5;z++){const score=x*x*.84+y*y*1.15+z*z*1.38+.38*Math.sin(x*.9+y*.6)+R(0,.4);cells.push({x,y,z,score});}cells.sort((a,b)=>a.score-b.score);
 for(let i=0;i<this.count;i++){const s=cells[i],scale=R(.76,1.14),color=R(0,1),style=i%24;
 const spacing=.79,p=[s.x*spacing+R(-.04,.04),3.30+s.y*spacing+R(-.04,.04),s.z*spacing+R(-.04,.04)];
 const a={id:i,style,scale,color,p,rot:[R(-Math.PI,Math.PI),R(-Math.PI,Math.PI),R(-Math.PI,Math.PI)],partScales:Array(6).fill(scale),partIds:Array.from({length:6},(_,j)=>i*6+j),partColors:Array.from({length:6},()=>clamp(color+R(-.075,.075),0,.99999)),temper:R(.2,1),cool:R(0,5),visits:0,job:null,parts:null,links:[],tone:R(-.055,.055)};
 a.partTones=Array.from({length:6},()=>a.tone+R(-.018,.018));a.partScales=[scale,scale*R(.85,1.15),...Array.from({length:4},()=>scale*R(.94,1.06))];a.signature=[R(-.07,.07),R(-.055,.055),R(-.08,.08)];a.patience=R(.7,1.4);this.agents.push(a);}}
 disturb(p){this.focus=p.slice();this.focusUntil=this.clock+14;}
 snapshot(){return {chairs:this.agents.length,moving:this.jobs.length,events:{...this.events}};}
}