import * as THREE from 'three';
import RAPIER from 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.17.3/rapier.es.js';
const V=(p)=>new THREE.Vector3(p.x??p[0],p.y??p[1],p.z??p[2]),Q=q=>new THREE.Quaternion(q.x??q[0],q.y??q[1],q.z??q[2],q.w??q[3]);
const I=()=>new THREE.Quaternion(),rot=(x,y,z)=>new THREE.Quaternion().setFromEuler(new THREE.Euler(x,y,z)),R=(a,b)=>a+Math.random()*(b-a),clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),key=s=>s.join(',');
export const initPhysics=()=>RAPIER.init();
export class PhysicsColony{
 constructor(colony,models,mobile){this.colony=colony;this.models=models;this.mobile=mobile;this.acc=0;this.clock=0;this.active=[];this.events={arrivals:0,disassemblies:0,reassemblies:0,collisions:0,reroutes:0,layouts:[0,0,0,0]};this.policy={branch:{q:.5,n:0},bridge:{q:.5,n:0},repair:{q:.5,n:0},excavate:{q:.5,n:0}};this.mode='branch';this.world=new RAPIER.World({x:0,y:0,z:0});this.world.timestep=1/60;this.world.integrationParameters.numSolverIterations=5;this.world.integrationParameters.maxCcdSubsteps=2;this.queue=new RAPIER.EventQueue(true);this.colliders=new Map();this.build();}
 dispose(){this.queue.free();this.world.free();}
 build(){this.staticBox([0,-.2,0],[50,.2,50]);this.staticBox([0,12,-15],[50,12,.18]);this.staticBox([-18,12,0],[.18,12,50]);this.staticBox([18,12,0],[.18,12,50]); for(const a of this.colony.agents){a.layout=this.standard(a);a.layoutKind=0;a.body=this.makeWhole(a,V(this.colony.position(a.site)),rot(...a.rot),false);a.parts=null;this.events.layouts[0]++;}}
 staticBox(p,h){const b=this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(...p));this.world.createCollider(RAPIER.ColliderDesc.cuboid(...h).setFriction(.65),b);}
 standard(a){return this.models[a.style].parts.map(p=>({p:p.anchor.clone(),q:I()}));}
 // Persistent alternate assemblies: open radial ribs, ladder bridges and split fins.
 // Each local transform belongs to a real part; no procedural substitute geometry.
 layout(a,k){const s=this.standard(a);if(k===0)return s;
 const parts=this.models[a.style].parts,phase=R(-Math.PI,Math.PI),curl=R(-.45,.45),spread=R(.4,.85);
 const seat=parts[0].geo;seat.computeBoundingBox();const bb=seat.boundingBox,w=(bb.max.x-bb.min.x)*.5,d=(bb.max.z-bb.min.z)*.5;
 s[0]={p:new THREE.Vector3(0,0,0),q:I()};
 const back=parts[1],backQ=rot(R(-.35,.35),phase*.20+(this.mode==='bridge'?Math.PI*.5:0),R(-.25,.25));
 back.geo.computeBoundingBox();const min=back.geo.boundingBox.min,max=back.geo.boundingBox.max,joint=new THREE.Vector3((min.x+max.x)*.5,min.y,(min.z+max.z)*.5).sub(back.anchor);
 s[1]={p:new THREE.Vector3(0,.028,-d*.90).sub(joint.applyQuaternion(backQ)),q:backQ};
 const endpoint=[];
 for(let j=0;j<4;j++){const part=parts[j+2],primitive=part.geo.userData.colliders[0],q0=Q(primitive.q),origin=V(primitive.p).sub(part.anchor),half=primitive.h[1];let hi=origin.clone().add(new THREE.Vector3(0,half,0).applyQuaternion(q0)),lo=origin.clone().add(new THREE.Vector3(0,-half,0).applyQuaternion(q0));if(hi.y<lo.y)[hi,lo]=[lo,hi];
 const angle=phase+j*Math.PI/2,dx=Math.cos(angle),dz=Math.sin(angle);let socket=new THREE.Vector3((j%2?1:-1)*w*.83,-.034,(j<2?1:-1)*d*.83);
 if((k===2&&j>1)||(k===3&&j===3))socket=endpoint[Math.max(0,j-2)].clone();
 let dir=new THREE.Vector3(dx*spread,-1,dz*spread);if(k===1)dir.set(dx,-.25+curl,dz);else if(k===2)dir.set(Math.cos(phase),-.28+curl*(j%2?1:-1),Math.sin(phase));else if(k===3)dir.set(dx*.75,j%2===0?-.85:.5,dz*.75);
 const qq=new THREE.Quaternion().setFromUnitVectors(lo.clone().sub(hi).normalize(),dir.normalize()),pp=socket.clone().sub(hi.clone().applyQuaternion(qq));s[j+2]={p:pp,q:qq};endpoint.push(lo.clone().applyQuaternion(qq).add(pp));}
 return s;}
 body(p,q,dynamic){let d=(dynamic?RAPIER.RigidBodyDesc.dynamic():RAPIER.RigidBodyDesc.fixed()).setTranslation(p.x,p.y,p.z).setRotation(q);if(dynamic)d=d.setLinearDamping(2.2).setAngularDamping(3.2).setCcdEnabled(true);return this.world.createRigidBody(d);}
 addPartColliders(a,body,index,localP,localQ){const model=this.models[a.style],part=model.parts[index],geos=[part.geo];if(index===0&&model.pad)geos.push(model.pad);
 for(const g of geos)for(const c of g.userData.colliders){const h=c.h.map(x=>Math.max(.008,x*a.scale*.96)),p=V(c.p).sub(part.anchor).multiplyScalar(a.scale).applyQuaternion(localQ).add(localP),q=localQ.clone().multiply(Q(c.q));const desc=RAPIER.ColliderDesc.cuboid(...h).setTranslation(p.x,p.y,p.z).setRotation(q).setDensity(4).setFriction(.62).setRestitution(.12).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);const co=this.world.createCollider(desc,body);this.colliders.set(co.handle,a.id);}}
 makeWhole(a,p,q,dynamic){const b=this.body(p,q,dynamic);a.layout.forEach((l,i)=>this.addPartColliders(a,b,i,l.p.clone().multiplyScalar(a.scale),l.q));return b;}
 remove(b){for(let i=0;i<b.numColliders();i++)this.colliders.delete(b.collider(i).handle);this.world.removeRigidBody(b);}
 partWorld(a,i){if(a.parts){const b=a.parts[i];return {p:V(b.translation()),q:Q(b.rotation())};}const b=a.body,l=a.layout[i],q=Q(b.rotation());return {p:l.p.clone().multiplyScalar(a.scale).applyQuaternion(q).add(V(b.translation())),q:q.multiply(l.q)};}
 start(a){const j=a.job,split=Math.random()<.82;const q=Q(a.body.rotation()),p=V(a.body.translation());j.physical={age:0,stage:0,origin:p.clone(),goal:V(j.to),goalQ:rot(...j.endRot),lift:j.lift,split,kind:a.layoutKind,stable:0,reroutes:0,mode:this.mode};const ph=j.physical;
 if(split){const old=a.layoutKind;ph.kind=this.mode==='repair'&&Math.random()<.65?0:this.mode==='bridge'?2:this.mode==='branch'?1+Math.floor(Math.random()*3):Math.random()<.22?0:3;if(ph.kind===old)ph.kind=(old+1)%4;ph.layout=this.layout(a,ph.kind);const initial=a.layout.map((_,i)=>this.partWorld(a,i));this.remove(a.body);a.body=null;a.parts=initial.map((x,i)=>{const b=this.body(x.p,x.q,true);this.addPartColliders(a,b,i,new THREE.Vector3(),I());b.applyImpulse(x.p.clone().sub(p).normalize().multiplyScalar(b.mass()*.28),true);return b;});this.events.disassemblies++;}
 else{a.body.setBodyType(RAPIER.RigidBodyType.Dynamic,true);a.body.setLinearDamping(2.2);a.body.setAngularDamping(3.2);a.body.enableCcd(true);}
 this.active.push(a);}
 steer(body,p,q,speed=1.8){const delta=p.clone().sub(V(body.translation())),desired=delta.multiplyScalar(3.5);if(desired.length()>speed)desired.setLength(speed);const dv=desired.sub(V(body.linvel())).multiplyScalar(.27*body.mass());body.applyImpulse(dv,true);
 const current=Q(body.rotation()),err=q.clone().multiply(current.invert());if(err.w<0)err.set(-err.x,-err.y,-err.z,-err.w);const angle=2*Math.acos(clamp(err.w,-1,1)),axis=new THREE.Vector3(err.x,err.y,err.z);if(axis.lengthSq()>1e-10)axis.normalize().multiplyScalar(Math.min(3.4,angle*3.5));const av=V(body.angvel()).lerp(axis,.30);body.setAngvel(av,true);}
 reached(body,p,q,tol=.17){return V(body.translation()).distanceTo(p)<tol&&V(body.linvel()).length()<.30&&Q(body.rotation()).angleTo(q)<.45;}
 targetPart(a,i,center,q){const l=a.job.physical.layout[i];return {p:l.p.clone().multiplyScalar(a.scale).applyQuaternion(q).add(center),q:q.clone().multiply(l.q)};}
 // New goals are exterior vacant sites. No forced teleport or timed snap.
 reroute(a){const j=a.job,ph=j.physical;let best=null,score=-1e9;for(let k=0;k<240;k++){const b=this.colony.agents[Math.random()*this.colony.count|0];if(b.job)continue;const ns=this.colony.neighbours(b.site),s=ns[Math.random()*6|0],kk=key(s);if(!this.colony.valid(s)||this.colony.occupied.has(kk)||this.colony.reserved.has(kk)||s[1]<1)continue;const n=this.colony.degree(s);if(n<1||n>2)continue;const p=V(this.colony.position(s)),v=p.y*.20-p.distanceTo(ph.goal)*.09+R(0,1);if(v>score){score=v;best=s;}}
 if(!best)return;this.colony.reserved.delete(key(j.target));j.target=best;j.to=this.colony.position(best);this.colony.reserved.add(key(best));ph.goal=V(j.to);ph.origin=a.parts?this.partWorld(a,0).p:V(a.body.translation());ph.lift=Math.max(ph.origin.y,ph.goal.y)+2.0;ph.age=0;ph.stage=0;ph.stable=0;ph.reroutes++;this.events.reroutes++;}
 updateJob(a,dt){const j=a.job,ph=j.physical;ph.age+=dt;
 // Travel in three physical stages: detach outward, translate in free space,
 // then approach the destination. Stage progression uses simulated positions.
 const centre=ph.stage===0?new THREE.Vector3(ph.origin.x,ph.lift,ph.origin.z):ph.stage===1?new THREE.Vector3(ph.goal.x,ph.lift,ph.goal.z):ph.goal.clone();
 let ready=true;
 if(a.parts){for(let i=0;i<6;i++){const target=this.targetPart(a,i,centre,ph.goalQ);if(ph.stage<2){const theta=i*Math.PI*2/6;target.p.add(new THREE.Vector3(Math.cos(theta)*.62,Math.sin(theta*2)*.18,Math.sin(theta)*.62));}else if(i>0){const wait=Math.max(0,1-ph.age/(.8+i*.35));target.p.add(new THREE.Vector3(0,wait*.65,0));}this.steer(a.parts[i],target.p,target.q,ph.stage===2?1.05:1.8);if(!this.reached(a.parts[i],target.p,target.q,ph.stage===2?.14:.28))ready=false;}}
 else{this.steer(a.body,centre,ph.goalQ,ph.stage===2?1.05:1.8);ready=this.reached(a.body,centre,ph.goalQ,ph.stage===2?.17:.32);}
 if(ready)ph.stable+=dt;else ph.stable=0;
 if(ph.stable>.16){if(ph.stage<2){ph.stage++;ph.stable=0;ph.age=0;}else return true;}
 if(ph.age>12){if(ph.stage<2){ph.stage++;ph.age=0;ph.stable=0;}else{const p=this.policy[ph.mode];p.n++;p.q+=(0-p.q)*.18;this.reroute(a);ph.age=0;}}return false;}
 finish(a){const j=a.job,ph=j.physical;
 if(a.parts){const actual=a.parts.map(b=>({p:V(b.translation()),q:Q(b.rotation())}));const center=ph.goal.clone(),q=ph.goalQ.clone(),inv=q.clone().invert();this.events.layouts[a.layoutKind]--;a.layoutKind=ph.kind;this.events.layouts[a.layoutKind]++;
 // Preserve exact solved part poses when welding; only change the physics
 // representation from independent rigid bodies to a single compound.
 a.layout=actual.map(t=>({p:t.p.clone().sub(center).applyQuaternion(inv).divideScalar(a.scale),q:inv.clone().multiply(t.q)}));a.parts.forEach(b=>this.remove(b));a.parts=null;a.body=this.makeWhole(a,center,q,false);this.events.reassemblies++;}
 else{a.body.setLinvel({x:0,y:0,z:0},true);a.body.setAngvel({x:0,y:0,z:0},true);a.body.setBodyType(RAPIER.RigidBodyType.Fixed,true);}
 this.colony.reserved.delete(key(j.target));a.site=j.target;a.job=null;a.cool=R(1,5);this.colony.occupied.set(key(a.site),a);this.colony.events.moves++;this.events.arrivals++;const p=this.policy[ph.mode];p.n++;p.q+=(1-p.q)*.18;}
 tick(dt,activity){this.clock+=dt;const c=this.colony;c.clock+=dt;if(c.clock>c.regionTime){this.mode=Object.keys(this.policy).map(k=>({k,s:this.policy[k].q+.42/Math.sqrt(1+this.policy[k].n)+R(0,.35)-(k===this.mode?.12:0)})).sort((a,b)=>b.s-a.s)[0].k;c.mode=this.mode;c.region=[R(-4.5,4.5),R(2,8.5),R(-3,3)];c.regionTime=c.clock+R(9,24);}for(const a of c.agents)a.cool=Math.max(0,a.cool-dt*activity);
 const cap=Math.max(2,Math.round((this.mobile?6:13)*activity));if(this.active.length<cap&&Math.random()<dt*3.8*activity){const old=c.jobs.length;c.chooseMove();if(c.jobs.length>old)this.start(c.jobs[c.jobs.length-1]);}
 const done=[];for(const a of this.active)if(this.updateJob(a,dt))done.push(a);this.world.step(this.queue);this.queue.drainCollisionEvents((h1,h2,started)=>{if(started&&this.colliders.get(h1)!==this.colliders.get(h2))this.events.collisions++;});for(const a of done)this.finish(a);this.active=this.active.filter(a=>a.job);c.jobs=this.active;}
 step(dt,activity){this.acc=Math.min(.075,this.acc+dt);let n=0;while(this.acc>=1/60&&n++<4){this.tick(1/60,activity);this.acc-=1/60;}}
 snapshot(){return {...this.colony.snapshot(),physics:{mode:this.mode,learning:JSON.parse(JSON.stringify(this.policy)),active:this.active.length,looseParts:this.active.reduce((n,a)=>n+(a.parts?6:0),0),...this.events}};}
}