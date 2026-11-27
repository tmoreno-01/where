// The original grid planner is replaced by live physical neighbourhoods.
const R=(a,b)=>a+Math.random()*(b-a),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export class Colony{
 constructor(count){this.count=count;this.reset();}
 reset(){this.clock=0;this.agents=[];this.jobs=[];this.focus=[0,1.8,0];this.focusUntil=0;this.events={moves:0,exchanges:0,parts:0};
 const side=this.count>150?6:5;
 for(let i=0;i<this.count;i++){const layer=Math.floor(i/(side*side)),slot=i%(side*side),x=slot%side,z=Math.floor(slot/side);
 const scale=R(.76,1.14),color=R(0,1),style=i%24;
 // Loose starting layers are physically dropped rather than frozen into an overlapping grid.
 const p=[(x-(side-1)*.5)*.91+R(-.09,.09),.72+layer*1.13+R(0,.12),(z-(side-1)*.5)*.91+R(-.09,.09)];
 const a={id:i,style,scale,color,p,rot:[R(-Math.PI,Math.PI),R(-Math.PI,Math.PI),R(-Math.PI,Math.PI)],partScales:Array(6).fill(scale),partIds:Array.from({length:6},(_,j)=>i*6+j),partColors:Array.from({length:6},()=>clamp(color+R(-.075,.075),0,.99999)),temper:R(.2,1),cool:R(0,5),visits:0,job:null,parts:null,links:[],tone:R(-.055,.055)};
 this.agents.push(a);}}
 disturb(p){this.focus=p.slice();this.focusUntil=this.clock+14;}
 snapshot(){return {chairs:this.agents.length,moving:this.jobs.length,events:{...this.events}};}
}