import * as THREE from 'three/webgpu';
import Simulator from './mls-mpm/mlsMpmSimulator.js';
import ParticleRenderer from './mls-mpm/particleRenderer.js';
import {conf} from './conf.js';
const stage=document.querySelector('#stage'),status=document.querySelector('#status'),params=new URLSearchParams(location.search);
const v=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),rand=(a,b)=>a+(b-a)*Math.random(),clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const target=v(0,.5,.24),raycaster=new THREE.Raycaster(),plane=new THREE.Plane(v(0,0,-1),.24);
const grid=v(conf.gridX,conf.gridY,conf.gridZ);
const origins=[v(.23,.33,.42).multiply(grid),v(.77,.67,.57).multiply(grid)],goals=origins.map(x=>x.clone());
const axes=[v(.2,.4,1).normalize(),v(-.4,.6,-1).normalize()],axisGoals=axes.map(x=>x.clone());
const drift=v(),driftGoal=v(),recent=[],lightRig={};
let renderer,sim,particles,camera,scene,raf=0,previous=0,age=0,frame=0,ratio=1,perfStart=0,perfFrames=0,paused=false,running=false,dead=false;
let drive=.95,driveGoal=.95,gather=0,gatherGoal=0,palette=0,paletteGoal=0,noise=.75,noiseGoal=.75;
let nextDecision=0,nextSample=0,observing=false,metrics=null,senseError=false,state='wake',stateSince=0,lightMood=0,lightGoal=0,pointerDown=false,exposure=1.0;
const forced=params.get('mode');let wallTarget=v(.84,.72,.5);
function environment(){
 const w=512,h=256,data=new Uint16Array(w*h*4);
 const boxes=[[.14,.30,.11,.14,7.3,7.1,6.7],[.44,.46,.026,.27,4.2,5.9,9.2],[.73,.32,.045,.21,9.0,4.8,2.0],[.63,.09,.23,.045,5.5,5.7,6.0],[.94,.60,.05,.17,1.8,2.4,3.3]];
 const half=THREE.DataUtils.toHalfFloat;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const u=x/w,t=y/h,i=(y*w+x)*4;let r=.055+.13*(1-t),g=.065+.15*(1-t),b=.085+.18*(1-t);
  for(const [cx,cy,sx,sy,rr,gg,bb] of boxes){const dx=Math.min(Math.abs(u-cx),1-Math.abs(u-cx))/sx,dy=(t-cy)/sy;const f=Math.exp(-Math.pow(dx,6)-Math.pow(dy,6));r+=rr*f;g+=gg*f;b+=bb*f;}
  data[i]=half(r);data[i+1]=half(g);data[i+2]=half(b);data[i+3]=half(1);
 }
 const tex=new THREE.DataTexture(data,w,h,THREE.RGBAFormat,THREE.HalfFloatType);
 tex.mapping=THREE.EquirectangularReflectionMapping;tex.colorSpace=THREE.LinearSRGBColorSpace;tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;tex.needsUpdate=true;return tex;
}
function light(name,color,intensity,pos,shadow=false){
 const l=new THREE.DirectionalLight(color,intensity);l.position.copy(pos);l.target.position.copy(target);scene.add(l,l.target);lightRig[name]=l;
 if(shadow){l.castShadow=true;l.shadow.mapSize.set(1536,1536);Object.assign(l.shadow.camera,{left:-2,right:2,top:1.4,bottom:-1.4,near:.02,far:6});l.shadow.camera.updateProjectionMatrix();l.shadow.bias=-.00035;l.shadow.normalBias=.0015;}
 return l;
}
const modes=['gather','unfold','divide','orbit','wall','rest'];
function choose(){
 const m=metrics;
 const scores={gather:1,unfold:1,divide:1,orbit:1,wall:1,rest:0.55};
 if(m){scores.gather+=clamp((m.spread-.26)*12,0,4);scores.unfold+=clamp((m.density-0.8)*3.5,0,4)+clamp((.22-m.spread)*14,0,3);scores.divide+=clamp((m.density-.65)*2,0,2);scores.orbit+=clamp((.8-m.speed)*2,0,2);scores.wall+=m.edge<.12?1.4:-.8;scores.rest+=clamp((m.speed-1.4)*2.7,0,4)+m.edge*3;}
 for(const k of modes){scores[k]+=rand(0,.95);if(recent.includes(k))scores[k]-=1.5;if(k===state)scores[k]-=3;}
 const choice=forced&&modes.includes(forced)?forced:modes.reduce((a,b)=>scores[a]>scores[b]?a:b);
 recent.push(choice);if(recent.length>3)recent.shift();state=choice;stateSince=age;nextDecision=age+rand(10,23);
 const set=(i,x,y,z)=>goals[i].set(x,y,z).multiply(grid);
 const axis=(i,x,y,z)=>axisGoals[i].set(x,y,z).normalize();
 driftGoal.set(0,0,0);gatherGoal=0;paletteGoal=rand(-.65,.65);lightGoal=rand(-.75,.75);
 switch(choice){
 case 'gather':set(0,.40,.44,.47);set(1,.60,.56,.52);axis(0,.2,.1,1);axis(1,.1,.4,1);gatherGoal=.85;driveGoal=.66;noiseGoal=.43;break;
 case 'unfold':set(0,.12,.24,.47);set(1,.88,.76,.53);axis(0,.2,.1,1);axis(1,.1,.2,-1);gatherGoal=-.57;driveGoal=1.35;noiseGoal=.98;break;
 case 'divide':{const vertical=Math.random()<.4;set(0,vertical?.48:.20,vertical?.19:.48,.33);set(1,vertical?.52:.80,vertical?.81:.52,.69);axis(0,0,.3,1);axis(1,.2,0,-1);gatherGoal=-.18;driveGoal=1.55;noiseGoal=.55;break;}
 case 'orbit':set(0,.37,.50,.35);set(1,.63,.50,.65);axis(0,rand(-.4,.4),rand(-.4,.4),1);axis(1,rand(-.4,.4),rand(-.4,.4),1);gatherGoal=.22;driveGoal=1.5;noiseGoal=.75;break;
 case 'wall':{const side=Math.floor(rand(0,4));wallTarget.set(side===0?.06:side===1?.94:rand(.24,.76),side===2?.06:side===3?.94:rand(.25,.75),.5);set(0,wallTarget.x,wallTarget.y,.37);set(1,wallTarget.x,wallTarget.y,.66);axis(0,0,0,1);axis(1,.15,.1,-1);gatherGoal=-.12;driveGoal=1.08;noiseGoal=.52;break;}
 case 'rest':set(0,.44,.50,.40);set(1,.56,.50,.60);axis(0,.2,1,.2);axis(1,.2,1,-.2);gatherGoal=.17;driveGoal=.33;noiseGoal=.25;break;
 }
}
function direct(dt){
 if(age>=nextDecision)choose();
 if(state==='wall'){
  const f=clamp((age-stateSince)/3,0,1),m=metrics?.mean||v(.5,.5,.5);
  driftGoal.set(clamp((wallTarget.x-m.x)*.62,-.34,.34),clamp((wallTarget.y-m.y)*.62,-.34,.34),0).multiplyScalar(f);
  if(metrics&&metrics.edge>.27){driftGoal.multiplyScalar(-.65);nextDecision=Math.min(nextDecision,age+3);}
 }
 const a=1-Math.exp(-dt*.24);
 for(let i=0;i<2;i++){origins[i].lerp(goals[i],a);axes[i].lerp(axisGoals[i],a*.65).normalize();}
 drift.lerp(driftGoal,a);drive+=(driveGoal-drive)*a;gather+=(gatherGoal-gather)*a;palette+=(paletteGoal-palette)*a*.38;noise+=(noiseGoal-noise)*a;
 const u=sim.uniforms;u.vortexA.value.copy(origins[0]);u.vortexB.value.copy(origins[1]);u.axisA.value.copy(axes[0]);u.axisB.value.copy(axes[1]);u.drive.value=drive;u.palette.value=palette;u.gather.value=gather;u.drift.value.copy(drift);conf.noise=noise;
 lightMood+=(lightGoal-lightMood)*(1-Math.exp(-dt*.05));
 const activity=clamp((metrics?.speed||.8)/2,0,1);
 lightRig.key.intensity=2.6+lightMood*.34;lightRig.rim.intensity=2.6+activity*.6;lightRig.fill.intensity=1.05-lightMood*.23;
 lightRig.key.position.set(-.85+Math.sin(age*.031)*.24,1.65,-.95);
 lightRig.rim.position.set(.9+Math.sin(age*.027)*.2,.88,.95);
 exposure+=(1.02-activity*.11-exposure)*(1-Math.exp(-dt*.2));renderer.toneMappingExposure=exposure;
}
function resize(){
 if(!renderer||!camera)return;
 const aspect=innerWidth/Math.max(1,innerHeight),hh=61.8/128;
 camera.left=-hh*aspect;camera.right=hh*aspect;camera.top=hh;camera.bottom=-hh;camera.updateProjectionMatrix();
 const scaleX=60*aspect/(conf.gridX-4);
 if(particles){particles.setChamberScale(scaleX);sim.uniforms.screenScale.value=scaleX;}
 renderer.setPixelRatio(ratio);renderer.setSize(innerWidth,innerHeight);
}
function fail(e){console.error(e);dead=true;status.hidden=false;status.textContent='This experiment requires a working WebGPU browser and graphics adapter. '+(e?.message||String(e));}
function stop(){if(raf)cancelAnimationFrame(raf);raf=0;previous=0;}
function schedule(){if(!raf&&!running&&!paused&&!dead&&!document.hidden)raf=requestAnimationFrame(loop);}
async function loop(now){
 raf=0;if(paused||dead||document.hidden)return;running=true;
 const dt=previous?Math.min((now-previous)/1000,.033):1/60;previous=now;age+=dt;
 try{
  direct(dt);await sim.update(dt,age);particles.update();await renderer.renderAsync(scene,camera);
  if(frame++===0){status.hidden=true;stage.classList.add('ready');}
  if(age>=nextSample&&!observing&&!senseError&&frame>3){
   nextSample=age+2.1;observing=true;
   // Queue the compact telemetry dispatch before scheduling the next simulation.
   sim.observe().then(m=>{if(m)metrics=m;}).catch(e=>{senseError=true;console.warn('Telemetry unavailable',e);}).finally(()=>{observing=false;});
  }
  perfFrames++;if(!perfStart)perfStart=now;
  if(now-perfStart>4500){const fps=perfFrames*1000/(now-perfStart);if(fps<28&&ratio>.65){ratio=Math.max(.65,ratio-.15);resize();}perfFrames=0;perfStart=now;}
 }catch(e){fail(e);stop();}finally{running=false;schedule();}
}
async function start(){
 if(!navigator.gpu)throw Error('WebGPU is unavailable.');
 renderer=new THREE.WebGPURenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
 ratio=Math.min(devicePixelRatio||1,innerWidth<700?1.15:1.5);
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
 await renderer.init();if(!renderer.backend.isWebGPUBackend)throw Error('Unable to initialize the WebGPU backend.');
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;stage.appendChild(renderer.domElement);
 scene=new THREE.Scene();scene.background=new THREE.Color(0x101116);scene.environment=environment();scene.environmentIntensity=.58;
 camera=new THREE.OrthographicCamera(-1,1,.5,-.5,.015,10);camera.position.set(0,.5,-2.2);camera.lookAt(target);
 scene.add(new THREE.HemisphereLight(0xdbe5ff,0x332f3c,.64));
 light('key',0xffe9d4,2.6,v(-.85,1.65,-.95),true);
 light('fill',0x96b8ff,1.05,v(-1.1,.35,-.7));light('rim',0xf6eaff,2.8,v(.95,.88,.95));light('warm',0xffad73,1.35,v(.15,-.6,.25));
 const backdrop=new THREE.Mesh(new THREE.PlaneGeometry(12,12),new THREE.MeshStandardMaterial({color:0x21232a,roughness:.95,metalness:0}));
 backdrop.position.set(0,.5,.68);backdrop.rotation.y=Math.PI;backdrop.receiveShadow=true;scene.add(backdrop);
 sim=new Simulator(renderer);await sim.init();particles=new ParticleRenderer(sim);scene.add(particles.object);
 resize();status.textContent='Initializing material field…';window.addEventListener('resize',resize);
 renderer.domElement.addEventListener('pointerdown',e=>{pointerDown=true;renderer.domElement.setPointerCapture(e.pointerId);});
 renderer.domElement.addEventListener('pointerup',()=>{pointerDown=false;});renderer.domElement.addEventListener('pointercancel',()=>{pointerDown=false;});
 renderer.domElement.addEventListener('pointermove',e=>{if(!pointerDown)return;raycaster.setFromCamera(new THREE.Vector2(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2),camera);const p=v();if(raycaster.ray.intersectPlane(plane,p))sim.setMouseRay(raycaster.ray.origin.clone(),raycaster.ray.direction.clone(),p);});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else schedule();});
 document.querySelector('#pause').onclick=e=>{paused=!paused;e.target.textContent=paused?'resume':'pause';if(paused)stop();else schedule();};
 document.querySelector('#new').onclick=()=>location.reload();
 document.querySelector('#full').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{}};
 document.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='h')document.body.classList.toggle('clean');if(e.code==='Space'&&e.target.tagName!=='BUTTON'){e.preventDefault();document.querySelector('#pause').click();}});
 if(params.has('clean'))document.body.classList.add('clean');
 const dev=renderer.backend.device;if(dev?.lost)dev.lost.then(info=>{stop();fail(Error(info.message||'Graphics device lost.'));});
 window.sculptureStatus=()=>({frame,age,particles:conf.particles,backend:'WebGPU',pixelRatio:ratio,paused,state,metrics:metrics?{...metrics,mean:metrics.mean.toArray()}:null,telemetryAvailable:!senseError});
 schedule();
}
start().catch(fail);
