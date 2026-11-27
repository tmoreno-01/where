import {Collective} from './collective.js?v=9';
import * as THREE from 'three';
import RAPIER from 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.17.3/rapier.es.js';
const V=(p)=>new THREE.Vector3(p.x??p[0],p.y??p[1],p.z??p[2]),Q=q=>new THREE.Quaternion(q.x??q[0],q.y??q[1],q.z??q[2],q.w??q[3]);
const I=()=>new THREE.Quaternion(),rot=(x,y,z)=>new THREE.Quaternion().setFromEuler(new THREE.Euler(x,y,z)),R=(a,b)=>a+Math.random()*(b-a),clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),key=s=>s.join(',');
export const initPhysics=()=>RAPIER.init();
export class PhysicsColony{
 constructor(colony,models,mobile){this.colony=colony;this.models=models;this.mobile=mobile;this.acc=0;this.clock=0;this.active=[];this.links=[];this.nextFront=0;this.front=null;this.settling=2.8;this.collective=new Collective();this.motion=new Map();this.nextMotion=0;this.nextBond=0;this.contactAge=new Map();this.events={arrivals:0,disassemblies:0,reassemblies:0,collisions:0,reroutes:0,grafts:0,completedGrafts:0,links:0,breaks:0,layouts:[0,0,0,0]};this.policy={branch:{q:.5,n:0},bridge:{q:.5,n:0},repair:{q:.5,n:0},excavate:{q:.5,n:0}};this.mode='branch';this.world=new RAPIER.World({x:0,y:0,z:0});this.world.timestep=1/60;this.world.integrationParameters.numSolverIterations=7;this.world.integrationParameters.maxCcdSubsteps=2;this.queue=new RAPIER.EventQueue(true);this.colliders=new Map();this.contacts=new Map();this.build();}
 dispose(){this.queue.free();this.world.free();}
 build(){this.staticBox([0,-.25,0],[1000,.25,1000]);for(const a of this.colony.agents){a.layout=this.standard(a);a.layoutKind=0;a.body=this.makeWhole(a,V(a.p),rot(...a.rot),true);a.body.setLinearDamping(.58);a.body.setAngularDamping(.85);a.body.setLinvel({x:R(-.16,.16),y:R(-.11,.11),z:R(-.16,.16)},true);a.signal=R(0,.3);a.parts=null;this.events.layouts[0]++;}for(let i=0;i<(this.mobile?32:48);i++){this.world.step(this.queue);this.queue.drainCollisionEvents((x,y,start)=>{const k=x<y?x+','+y:y+','+x;if(start)this.contacts.set(k,[x,y]);else this.contacts.delete(k);});}}
 staticBox(p,h){const b=this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(...p));this.world.createCollider(RAPIER.ColliderDesc.cuboid(...h).setFriction(.65),b);}
 standard(a){return this.models[a.style].parts.map((p,i)=>{const v=p.anchor.clone();if(i===1)v.y+=a.signature[1];if(i>=2){v.x*=1+a.signature[0];v.z*=1+a.signature[2];v.y+=(a.partScales[i]/a.scale-1)*-.20;}return {p:v,q:I()};});}
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
 for(const g of geos)for(const c of g.userData.colliders){const partScale=a.partScales[index];const h=c.h.map(x=>Math.max(.008,x*partScale*.96)),p=V(c.p).sub(part.anchor).multiplyScalar(partScale).applyQuaternion(localQ).add(localP),q=localQ.clone().multiply(Q(c.q));const desc=RAPIER.ColliderDesc.cuboid(...h).setTranslation(p.x,p.y,p.z).setRotation(q).setDensity(4).setFriction(.72).setRestitution(.11).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);const co=this.world.createCollider(desc,body);this.colliders.set(co.handle,a.id);}}
 makeWhole(a,p,q,dynamic){const b=this.body(p,q,dynamic);a.layout.forEach((l,i)=>this.addPartColliders(a,b,i,l.p.clone().multiplyScalar(a.scale),l.q));return b;}
 remove(b){const handles=new Set();for(let i=0;i<b.numColliders();i++){const h=b.collider(i).handle;handles.add(h);this.colliders.delete(h);}for(const [k,p] of this.contacts)if(handles.has(p[0])||handles.has(p[1]))this.contacts.delete(k);this.world.removeRigidBody(b);}
 touching(a){const result=new Set();for(const [x,y] of this.contacts.values()){const i=this.colliders.get(x),j=this.colliders.get(y);if(i===a.id&&j!==undefined&&j!==i)result.add(j);if(j===a.id&&i!==undefined&&i!==j)result.add(i);}return result;}
 partWorld(a,i){if(a.parts){const b=a.parts[i];return {p:V(b.translation()),q:Q(b.rotation())};}const b=a.body,l=a.layout[i],q=Q(b.rotation());return {p:l.p.clone().multiplyScalar(a.scale).applyQuaternion(q).add(V(b.translation())),q:q.multiply(l.q)};}
 start(a,forceSplit=false){this.unlink(a);const j=a.job,split=forceSplit||Math.random()<.88;const q=Q(a.body.rotation()),p=V(a.body.translation());j.physical={age:0,stage:0,origin:p.clone(),goal:V(j.to),goalQ:rot(...j.endRot),lift:j.lift,split,kind:a.layoutKind,stable:0,reroutes:0,mode:this.mode,route:[],grafted:0,flight:0,arc:j.arc||.6};const ph=j.physical;
 if(split){const old=a.layoutKind;ph.kind=this.mode==='repair'&&Math.random()<.65?0:this.mode==='bridge'?2:this.mode==='branch'?1+Math.floor(Math.random()*3):Math.random()<.22?0:3;if(ph.kind===old)ph.kind=(old+1)%4;ph.layout=this.layout(a,ph.kind);const inherited=V(a.body.linvel()),spin=V(a.body.angvel());const initial=a.layout.map((_,i)=>this.partWorld(a,i));this.remove(a.body);a.body=null;a.parts=initial.map((x,i)=>{const b=this.body(x.p,x.q,true);this.addPartColliders(a,b,i,new THREE.Vector3(),I());b.setGravityScale(0,true);b.setLinvel(inherited.clone().add(spin.clone().cross(x.p.clone().sub(p))).multiplyScalar(.85),true);b.applyImpulse(x.p.clone().sub(p).normalize().multiplyScalar(b.mass()*.08),true);return b;});this.events.disassemblies++;ph.route=a.parts.map(b=>V(b.translation()));}
 else{a.body.setBodyType(RAPIER.RigidBodyType.Dynamic,true);a.body.setLinearDamping(2.2);a.body.setAngularDamping(3.2);a.body.enableCcd(true);a.body.setGravityScale(0,true);}
 this.active.push(a);}
 graft(a,b){if(!a.parts||!b.parts||a.style!==b.style)return;const indices=[1,2,3,4,5];const count=Math.random()<.40?2:1;for(let n=0;n<count;n++){const i=indices.splice(Math.random()*indices.length|0,1)[0];[a.parts[i],b.parts[i]]=[b.parts[i],a.parts[i]];for(const field of ['partScales','partColors','partIds','partTones'])[a[field][i],b[field][i]]=[b[field][i],a[field][i]];for(const x of [a,b]){x.job.physical.route[i]=V(x.parts[i].translation());x.job.physical.grafted++;for(let k=0;k<x.parts[i].numColliders();k++)this.colliders.set(x.parts[i].collider(k).handle,x.id);}this.events.grafts+=2;}}
 steer(body,p,q,speed=1.8){const delta=p.clone().sub(V(body.translation())),desired=delta.multiplyScalar(3.5);if(desired.length()>speed)desired.setLength(speed);const dv=desired.sub(V(body.linvel())).multiplyScalar(.12*body.mass());body.applyImpulse(dv,true);
 const current=Q(body.rotation()),err=q.clone().multiply(current.invert());if(err.w<0)err.set(-err.x,-err.y,-err.z,-err.w);const angle=2*Math.acos(clamp(err.w,-1,1)),axis=new THREE.Vector3(err.x,err.y,err.z);if(axis.lengthSq()>1e-10)axis.normalize().multiplyScalar(Math.min(3.4,angle*3.5));const av=V(body.angvel());const correction=axis.sub(av).multiplyScalar(body.mass()*.009);body.applyTorqueImpulse(correction,true);if(av.length()>4.2)body.setAngvel(av.setLength(4.2),true);}
 reached(body,p,q,tol=.17){return V(body.translation()).distanceTo(p)<tol&&V(body.linvel()).length()<.30&&Q(body.rotation()).angleTo(q)<.45;}
 targetPart(a,i,center,q){const l=a.job.physical.layout[i];return {p:l.p.clone().multiplyScalar(a.scale).applyQuaternion(q).add(center),q:q.clone().multiply(l.q)};}
 // Decisions are based on the current simulated pile, not a cell grid.
 unlink(a){for(const l of this.links.filter(l=>l.a===a||l.b===a)){this.world.removeImpulseJoint(l.joint,true);this.events.breaks++;}this.links=this.links.filter(l=>l.a!==a&&l.b!==a);}
 position(a){return a.parts?V(a.parts[0].translation()):V(a.body.translation());}
 neighbours(a,all,r=1.15){const p=this.position(a);return all.filter(b=>b!==a&&this.position(b).distanceToSquared(p)<r*r);}
 chooseFront(all){const choices=Object.entries(this.policy).map(([k,v])=>({k,s:v.q+.45/Math.sqrt(v.n+1)+R(0,.36)-(k===this.mode?.13:0)})).sort((a,b)=>b.s-a.s);this.mode=choices[0].k;
 const c=this.colony,focus=c.focusUntil>c.clock?V(c.focus):null;
 const exposed=all.filter(a=>this.neighbours(a,all,1.05).length<8);
 const root=(exposed.length?exposed:all)[Math.random()*(exposed.length||all.length)|0];
 const base=focus||this.position(root),angle=R(0,Math.PI*2),dir=new THREE.Vector3(Math.cos(angle),0,Math.sin(angle));
 if(base.y<.7)base.y=.7;
 this.front={base,dir,serial:0,root};this.nextFront=this.clock+R(14,29);}
 choose(all,style=null,near=null){let best=null,score=-1e9;const candidates=all.filter(a=>!a.job&&a.cool<=0&&(style===null||a.style===style));for(let i=0;i<Math.min(65,candidates.length);i++){const a=candidates[Math.random()*candidates.length|0],p=this.position(a),n=this.neighbours(a,all,1.1).length;
 const distance=near?p.distanceTo(near):p.distanceTo(this.front.base);const contacts=this.touching(a).size;const state=this.motion.get(a.id);const s=(7-n)*.19+(5-Math.min(5,contacts))*.24+(state?.energy||0)*1.6+(a.signal||0)*.85-distance*.62+R(0,.45)-Math.min(a.visits*.15,1.2);if(s>score){score=s;best=a;}}return best;}
 plan(a,all){const f=this.front,p=this.position(a),slot=f.serial++,sign=slot%2?1:-1,rank=Math.floor(slot/2)%5;
 // Shared front develops a branch, bridge or repairing cluster across successive jobs.
 const side=new THREE.Vector3(-f.dir.z,0,f.dir.x);let goal=(f.root&&f.root!==a&&!f.root.job?this.position(f.root):f.base).clone().addScaledVector(f.dir,sign*(.46+rank*.32)).addScaledVector(side,R(-.18,.18));
 if(this.mode==='branch')goal.y+=.35+rank*.24;
 else if(this.mode==='bridge')goal.y+=.55+Math.sin(rank*.8)*.2;
 else if(this.mode==='excavate'){goal.addScaledVector(side,sign*.8);goal.y+=.4;}
 else goal.y+=.26;
 // Dock at a free surface of the moving colony rather than always above it.
 const outward=goal.clone().sub(new THREE.Vector3(0,3.05,0));if(outward.lengthSq()<.05)outward.set(1,.2,0);outward.normalize();for(let j=0;j<5;j++){if(!all.some(b=>b!==a&&!b.job&&this.position(b).distanceTo(goal)<.54))break;goal.addScaledVector(outward,.25);}goal.y=clamp(goal.y,.95,6.2);
 const az=Math.atan2(f.dir.x,f.dir.z),angle=this.mode==='bridge'?R(1.0,1.7):R(-.8,.8);
 a.job={to:goal.toArray(),endRot:[angle,az+R(-.5,.5),R(-.9,.9)],lift:Math.max(p.y,goal.y)+R(.10,.42),arc: R(.40,.80)};a.visits++;}
 updateJob(a,dt){const ph=a.job.physical;ph.age+=dt;ph.flight+=dt;
 const route=ph.goal.clone().sub(ph.origin);const tangent=new THREE.Vector3(-route.z,.18,route.x).normalize();const centre=ph.stage===0?ph.origin.clone().addScaledVector(tangent,ph.arc*.7):ph.stage===1?ph.goal.clone().addScaledVector(tangent,ph.arc):ph.goal.clone();
 let ready=true,maxErr=0;
 if(a.parts){for(let i=0;i<6;i++){const target=this.targetPart(a,i,centre,ph.goalQ);
 if(ph.stage<2){const theta=i*Math.PI/3+a.id*.618+Math.min(ph.age,2.5)*.36;const spread=.32+.13*Math.sin(a.id)+.12*Math.sin(ph.age*.8);if(ph.stage===0){const src=ph.route[i];target.p.copy(src).addScaledVector(tangent,ph.arc*.65);}target.p.add(new THREE.Vector3(Math.cos(theta)*spread,Math.sin(theta*2)*.21,Math.sin(theta)*spread));}
 else if(i>0){const wait=Math.max(0,1-ph.age/(.45+i*.22));target.p.y+=wait*.60;}
 const b=a.parts[i];const delay=i*.16*a.patience;if(ph.stage===0&&ph.age<delay){target.p.copy(ph.route[i]);target.q.copy(Q(b.rotation()));}this.steer(b,target.p,target.q,ph.stage===2?.90:1.48);maxErr=Math.max(maxErr,V(b.translation()).distanceTo(target.p));if(!this.reached(b,target.p,target.q,ph.stage===2?.19:.30))ready=false;}}
 else{this.steer(a.body,centre,ph.goalQ,ph.stage===2?.90:1.35);maxErr=V(a.body.translation()).distanceTo(centre);ready=this.reached(a.body,centre,ph.goalQ,.22);}
 ph.stable=ready?ph.stable+dt:0;
 if(ph.stable>.12||(ph.stage<2&&ph.age>7.0)){if(ph.stage<2){ph.stage++;ph.age=0;ph.stable=0;}else return true;}
 // If parts cannot fit, adjust the target; do not teleport them or force a weld.
 if(ph.stage===2&&ph.age>8){ph.age=0;ph.reroutes++;this.events.reroutes++;ph.goal.addScaledVector(tangent,.14);if(ph.reroutes>=2){ph.kind=0;ph.layout=this.standard(a);ph.goal.y=clamp(ph.goal.y+Math.sin(ph.reroutes)*.20,.9,6.2);ph.goal.x+=.30*Math.sin(a.id+ph.reroutes);ph.goal.z+=.30*Math.cos(a.id+ph.reroutes);}}
 // Unsuccessful docking remains dynamic; no forced weld across large gaps.
 return false;}
 finish(a){const ph=a.job.physical,contacts=this.touching(a);
 if(a.parts){const actual=a.parts.map(b=>({p:V(b.translation()),q:Q(b.rotation()),v:V(b.linvel())})),center=actual[0].p.clone(),q=ph.goalQ.clone(),inv=q.clone().invert(),velocity=actual.reduce((s,x)=>s.add(x.v),new THREE.Vector3()).multiplyScalar(1/6);
 this.events.layouts[a.layoutKind]--;a.layoutKind=ph.kind;this.events.layouts[a.layoutKind]++;
 a.layout=actual.map(t=>({p:t.p.clone().sub(center).applyQuaternion(inv).divideScalar(a.scale),q:inv.clone().multiply(t.q)}));a.parts.forEach(b=>this.remove(b));a.parts=null;a.body=this.makeWhole(a,center,q,true);a.body.setLinvel(velocity,true);this.events.reassemblies++;this.events.completedGrafts+=ph.grafted;}
 a.body.setGravityScale(0,true);a.body.setLinearDamping(.58);a.body.setAngularDamping(.85);a.job=null;a.cool=R(5,12);this.colony.events.moves++;this.events.arrivals++;const p=this.policy[ph.mode];p.n++;p.q+=(Math.max(.1,1-ph.reroutes*.23)-p.q)*.18;
 // A physical joint can connect two reconstructed chairs if their positions are close.
 // This creates a multi-chair compound structure without freezing either body in space.
 const candidates=this.colony.agents.filter(b=>b!==a&&!b.job&&b.body&&contacts.has(b.id)&&this.position(a).distanceTo(this.position(b))<1.15&&this.position(a).distanceTo(this.position(b))>.30);
 if(candidates.length&&this.links.length<(this.mobile?12:28)&&Math.random()<.75){const b=candidates[0];if(this.links.filter(l=>l.a===b||l.b===b).length<2){const p1=V(a.body.translation()),p2=V(b.body.translation()),mid=p1.clone().lerp(p2,.5),q1=Q(a.body.rotation()).invert(),q2=Q(b.body.rotation()).invert();const anchor1=mid.clone().sub(p1).applyQuaternion(q1),anchor2=mid.clone().sub(p2).applyQuaternion(q2);const data=RAPIER.JointData.fixed(anchor1,q1,anchor2,q2);const joint=this.world.createImpulseJoint(data,a.body,b.body,true);joint.setContactsEnabled(true);this.links.push({a,b,joint,age:0,life:R(18,65)});this.events.links++;}}}
 tick(dt,activity){this.clock+=dt;const c=this.colony;c.clock+=dt;
 const all=c.agents.filter(a=>a.body&&!a.job);
 for(const a of c.agents)a.cool=Math.max(0,a.cool-dt*activity);
 // Coherent, contact-responsive motion of the whole installation.
 if(this.clock>=this.nextMotion){this.nextMotion=this.clock+.10;const focus=c.focusUntil>c.clock?c.focus:null;const points=all.map(a=>({id:a.id,p:this.position(a).toArray(),v:V(a.body.linvel()).toArray(),trait:a.temper,signal:a.signal||0}));this.motion=this.collective.step(points,.10,activity,focus);for(const a of all){const s=this.motion.get(a.id);if(s)a.signal=s.signal;}}
 for(const a of all){const s=this.motion.get(a.id);if(!s)continue;const b=a.body,mass=b.mass(),v=V(b.linvel());b.applyImpulse(V(s.f).multiplyScalar(mass*dt),true);b.applyTorqueImpulse(V(s.torque).multiplyScalar(mass*dt),true);if(v.length()>2.1)b.setLinvel(v.setLength(2.1),true);const av=V(b.angvel());if(av.length()>3.2)b.setAngvel(av.setLength(3.2),true);}
 // Persistent contact pairs can recruit neighbours into a shared construction front.
 if(this.clock>=this.nextBond){this.nextBond=this.clock+.35;const seen=new Set(),byId=new Map(all.map(a=>[a.id,a]));for(const [x,y] of this.contacts.values()){const i=this.colliders.get(x),j=this.colliders.get(y);if(i===undefined||j===undefined||i===j||!byId.has(i)||!byId.has(j))continue;const k=i<j?i+','+j:j+','+i;if(seen.has(k))continue;seen.add(k);const age=(this.contactAge.get(k)||0)+.35;this.contactAge.set(k,age);const a=byId.get(i),b=byId.get(j);a.signal=Math.min(1,(a.signal||0)+.035);b.signal=Math.min(1,(b.signal||0)+.035);
 if(age>1.4&&this.links.length<(this.mobile?10:24)&&Math.random()<.055&&a.body&&b.body&&!this.links.some(l=>(l.a===a&&l.b===b)||(l.a===b&&l.b===a))&&this.links.filter(l=>l.a===a||l.b===a||l.a===b||l.b===b).length<2){
 const p1=this.position(a),p2=this.position(b);if(p1.distanceTo(p2)<.95&&p1.distanceTo(p2)>.22&&V(a.body.linvel()).sub(V(b.body.linvel())).length()<.65){const mid=p1.clone().lerp(p2,.5),q1=Q(a.body.rotation()).invert(),q2=Q(b.body.rotation()).invert();const joint=this.world.createImpulseJoint(RAPIER.JointData.fixed(mid.clone().sub(p1).applyQuaternion(q1),q1,mid.clone().sub(p2).applyQuaternion(q2),q2),a.body,b.body,true);joint.setContactsEnabled(true);this.links.push({a,b,joint,age:0,life:R(5,18)});this.events.links++;this.contactAge.delete(k);}}
 }for(const k of this.contactAge.keys())if(!seen.has(k))this.contactAge.delete(k);}
 if(this.clock>this.settling&&all.length){
 if(!this.front||this.clock>this.nextFront)this.chooseFront(all);
 const cap=Math.max(2,Math.min(this.mobile?8:20,Math.round((this.mobile?4:12)*activity)));
 if(this.active.length<cap&&Math.random()<dt*3.0*activity){const a=this.choose(all);if(a){this.plan(a,all);const b=this.active.length+2<=cap&&Math.random()<.65?this.choose(all.filter(x=>x!==a),a.style,this.position(a)):null;if(b){this.plan(b,all);this.start(a,true);this.start(b,true);this.graft(a,b);}else this.start(a);}}
 }
 for(const l of [...this.links]){l.age+=dt;if(l.age>l.life){this.world.removeImpulseJoint(l.joint,true);this.links.splice(this.links.indexOf(l),1);this.events.breaks++;}}
 const done=[];for(const a of this.active)if(this.updateJob(a,dt))done.push(a);
 this.world.step(this.queue);this.queue.drainCollisionEvents((h1,h2,started)=>{const k=h1<h2?h1+','+h2:h2+','+h1;if(started){this.contacts.set(k,[h1,h2]);if(this.colliders.get(h1)!==this.colliders.get(h2)){this.events.collisions++;const a=c.agents[this.colliders.get(h1)],b=c.agents[this.colliders.get(h2)];if(a)a.signal=Math.min(1,(a.signal||0)+.02);if(b)b.signal=Math.min(1,(b.signal||0)+.02);}}else this.contacts.delete(k);});
 for(const a of done)this.finish(a);this.active=this.active.filter(a=>a.job);c.jobs=this.active;
 }
 step(dt,activity){this.acc=Math.min(.075,this.acc+dt);let n=0;while(this.acc>=1/60&&n++<4){this.tick(1/60,activity);this.acc-=1/60;}}
 snapshot(){return {...this.colony.snapshot(),physics:{mode:this.clock<this.settling?'forming':this.collective.mode+' / '+this.mode,meanNeighbours:this.collective.density,linksActive:this.links.length,contactPairs:this.contacts.size,learning:JSON.parse(JSON.stringify(this.policy)),active:this.active.length,looseParts:this.active.reduce((n,a)=>n+(a.parts?6:0),0),...this.events}};}
}