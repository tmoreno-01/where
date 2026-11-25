import * as THREE from 'three/webgpu';
import Simulator from './mls-mpm/mlsMpmSimulator.js';
import ParticleRenderer from './mls-mpm/particleRenderer.js';
import {conf} from './conf.js';
import {AdaptivePolicy} from './policy.js';
const stage=document.querySelector('#stage'),status=document.querySelector('#status'),params=new URLSearchParams(location.search);
const v=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),rand=(a,b)=>a+(b-a)*Math.random(),clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const target=v(0,.5,.24),raycaster=new THREE.Raycaster(),plane=new THREE.Plane(v(0,0,-1),.24);
const grid=v(conf.gridX,conf.gridY,conf.gridZ);
const origins=[v(.23,.33,.42).multiply(grid),v(.77,.67,.57).multiply(grid)],goals=origins.map(x=>x.clone());
origins.push(v(.30,.72,.28).multiply(grid),v(.70,.29,.75).multiply(grid));
goals.push(origins[2].clone(),origins[3].clone());
const axes=[v(.2,.4,1).normalize(),v(-.4,.6,-1).normalize(),v(.4,1,.3).normalize(),v(-1,.4,.5).normalize()],axisGoals=axes.map(x=>x.clone());
const pointer=v(),pointerDelta=v(),pointerGoal=v(),clickCenter=v(),pulseCenter=v(),previousPointer=v();
let pendingClick=0,dragDirty=false,lightingMode=params.get('lighting')||'studio';
let pointerPulse=0,pointerStrength=0,lastPointerTime=0,detail=.8,detailGoal=.8,pulse=0,nextPulse=9,speedRef=1.0;
const tideAxis=v(1,0,0);
let pace=.66,paceGoal=.66,tideStart=-100,tideDuration=12,tideStrength=0,nextTide=12;
const drift=v(),driftGoal=v(),recent=[],lightRig={};
let renderer,sim,particles,camera,scene,raf=0,previous=0,age=0,frame=0,ratio=1,perfStart=0,perfFrames=0,paused=false,running=false,dead=false;
let drive=.95,driveGoal=.95,gather=0,gatherGoal=0,palette=0,paletteGoal=0,noise=.75,noiseGoal=.75;
let nextDecision=0,nextSample=0,observing=false,metrics=null,senseError=false,state='wake',stateSince=0,lightMood=0,lightGoal=0,pointerDown=false,exposure=1.0;
const forced=params.get('mode');let wallTarget=v(.84,.72,.5);
function environment(){
 const w=512,h=256,data=new Uint16Array(w*h*4);
 const boxes=[[.16,.28,.075,.16,7.5,7.8,8.1],[.42,.48,.016,.24,6.8,7.6,9.5],[.72,.32,.034,.15,8.2,4.8,2.8],[.63,.10,.18,.026,8.8,8.9,9.0],[.95,.62,.032,.13,2.5,4.1,7.2]];
 const half=THREE.DataUtils.toHalfFloat;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const u=x/w,t=y/h,i=(y*w+x)*4;let r=.025+.07*(1-t),g=.03+.08*(1-t),b=.04+.10*(1-t);
  for(const [cx,cy,sx,sy,rr,gg,bb] of boxes){const dx=Math.min(Math.abs(u-cx),1-Math.abs(u-cx))/sx,dy=(t-cy)/sy;const f=Math.exp(-Math.pow(dx,6)-Math.pow(dy,6));r+=rr*f;g+=gg*f;b+=bb*f;}
  data[i]=half(r);data[i+1]=half(g);data[i+2]=half(b);data[i+3]=half(1);
 }
 const tex=new THREE.DataTexture(data,w,h,THREE.RGBAFormat,THREE.HalfFloatType);
 tex.mapping=THREE.EquirectangularReflectionMapping;tex.colorSpace=THREE.LinearSRGBColorSpace;tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;tex.needsUpdate=true;return tex;
}
function backdropTexture(){
 const c=document.createElement('canvas');c.width=512;c.height=512;const ctx=c.getContext('2d');
 const g=ctx.createRadialGradient(200,170,10,256,256,360);g.addColorStop(0,'#3c4350');g.addColorStop(.44,'#252a35');g.addColorStop(1,'#10131b');ctx.fillStyle=g;ctx.fillRect(0,0,512,512);
 const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
const lightingPresets={
 studio:{key:2.25,rim:2.4,fill:.55,warm:.32,env:.40,exposure:.86,keyColor:0xfff1dc,rimColor:0xc9e1ff,fillColor:0x9cb6f7,warmColor:0xffb17a},
 contrast:{key:2.55,rim:3.05,fill:.19,warm:.18,env:.24,exposure:.76,keyColor:0xffffff,rimColor:0xb1d1ff,fillColor:0xa0b9f4,warmColor:0xffaf84},
 spectral:{key:1.65,rim:2.15,fill:.85,warm:.45,env:.29,exposure:.82,keyColor:0xe0f2ff,rimColor:0xb698ff,fillColor:0x83d9e6,warmColor:0xffa45d}
};
function light(name,color,intensity,pos,shadow=false){
 const l=new THREE.DirectionalLight(color,intensity);l.position.copy(pos);l.target.position.copy(target);scene.add(l,l.target);lightRig[name]=l;
 if(shadow){l.castShadow=true;l.shadow.mapSize.set(conf.particles>=200000?1024:1536,conf.particles>=200000?1024:1536);Object.assign(l.shadow.camera,{left:-2,right:2,top:1.4,bottom:-1.4,near:.02,far:6});l.shadow.camera.updateProjectionMatrix();l.shadow.bias=-.00035;l.shadow.normalBias=.0015;}
 return l;
}
const modes=['gather','unfold','divide','orbit','wall','rest','shear','braid','burst'];
const policy=new AdaptivePolicy(modes,conf.learn), renderers=new Map();
const nerveSource=v(),rareCenter=v(),rareAxis=v(1,0,0);
let nervePower=0,nextNerve=5,rareKind=0,rareStart=0,rareDuration=1,nextRare=rand(240,540),rareCount=0;
const rareNames=['none','resonance','eclipse','fission'];
function rareEvent(kind){
 rareKind=kind||1+Math.floor(Math.random()*3);rareStart=age;rareDuration=rand(14,23);rareCount++;
 rareCenter.copy(metrics?.mean||v(.5,.5,.5)).multiply(grid);
 rareAxis.set(rand(-1,1),rand(-1,1),rand(-.5,.5)).normalize();nextRare=age+rand(300,720);
}
function choose(){
 policy.finish();const m=metrics;
 const scores={gather:1,unfold:1,divide:1,orbit:1,wall:1,rest:0.45,shear:1.3,braid:1.4,burst:0.95};
 if(m){scores.gather+=clamp((m.spread-.26)*12,0,4);scores.unfold+=clamp((m.density-0.8)*3.5,0,4)+clamp((.22-m.spread)*14,0,3);scores.divide+=clamp((m.density-.65)*2,0,2);scores.orbit+=clamp((.8-m.speed)*2,0,2);scores.wall+=m.edge<.12?1.4:-.8;scores.rest+=clamp((m.speed-1.7)*2.2,0,3)+m.edge*2;scores.burst+=clamp((1.0-m.speed)*2.8,0,3);scores.shear+=clamp((m.spread-.20)*5,0,2);scores.braid+=clamp((.65-m.density)*1.5,0,1);}
 for(const k of modes){scores[k]+=rand(0,.65)+policy.bonus(k,m);if(recent.includes(k))scores[k]-=1.5;if(k===state)scores[k]-=3;}
 const choice=forced&&modes.includes(forced)?forced:modes.reduce((a,b)=>scores[a]>scores[b]?a:b);
 recent.push(choice);if(recent.length>3)recent.shift();state=choice;stateSince=age;nextDecision=age+rand(12,30);policy.begin(choice,m,age);
 const set=(i,x,y,z)=>goals[i].set(x,y,z).multiply(grid);
 const axis=(i,x,y,z)=>axisGoals[i].set(x,y,z).normalize();
 driftGoal.set(0,0,0);gatherGoal=0;paletteGoal=rand(-.65,.65);lightGoal=rand(-.75,.75);
 set(2,rand(.15,.85),rand(.15,.85),rand(.15,.85));set(3,rand(.15,.85),rand(.15,.85),rand(.15,.85));
 axis(2,rand(-1,1),rand(-1,1),rand(-1,1));axis(3,rand(-1,1),rand(-1,1),rand(-1,1));detailGoal=rand(.65,1.5);
 paceGoal=choice==='rest'?rand(.38,.49):choice==='burst'?rand(.83,.99):choice==='shear'||choice==='braid'?rand(.69,.82):rand(.49,.69);
 switch(choice){
 case 'gather':set(0,.40,.44,.47);set(1,.60,.56,.52);axis(0,.2,.1,1);axis(1,.1,.4,1);gatherGoal=.85;driveGoal=.66;noiseGoal=.43;break;
 case 'unfold':set(0,.12,.24,.47);set(1,.88,.76,.53);axis(0,.2,.1,1);axis(1,.1,.2,-1);gatherGoal=-.57;driveGoal=1.35;noiseGoal=.98;break;
 case 'divide':{const vertical=Math.random()<.4;set(0,vertical?.48:.20,vertical?.19:.48,.33);set(1,vertical?.52:.80,vertical?.81:.52,.69);axis(0,0,.3,1);axis(1,.2,0,-1);gatherGoal=-.18;driveGoal=1.55;noiseGoal=.55;break;}
 case 'orbit':set(0,.37,.50,.35);set(1,.63,.50,.65);axis(0,rand(-.4,.4),rand(-.4,.4),1);axis(1,rand(-.4,.4),rand(-.4,.4),1);gatherGoal=.22;driveGoal=1.5;noiseGoal=.75;break;
 case 'wall':{const side=Math.floor(rand(0,4));wallTarget.set(side===0?.06:side===1?.94:rand(.24,.76),side===2?.06:side===3?.94:rand(.25,.75),.5);set(0,wallTarget.x,wallTarget.y,.37);set(1,wallTarget.x,wallTarget.y,.66);axis(0,0,0,1);axis(1,.15,.1,-1);gatherGoal=-.12;driveGoal=1.08;noiseGoal=.52;break;}
 case 'rest':set(0,.44,.50,.40);set(1,.56,.50,.60);axis(0,.2,1,.2);axis(1,.2,1,-.2);gatherGoal=.17;driveGoal=.40;noiseGoal=.35;detailGoal=.38;break;
 case 'shear':set(0,.22,.35,.3);set(1,.78,.65,.7);axis(0,.3,.7,1);axis(1,-.3,.7,-1);gatherGoal=-.38;driveGoal=1.85;noiseGoal=.82;detailGoal=1.15;break;
 case 'braid':set(0,.3,.42,.4);set(1,.7,.58,.6);set(2,.46,.28,.66);set(3,.54,.72,.33);axis(0,.7,.1,1);axis(1,.7,.1,1);axis(2,0,.7,-1);axis(3,0,.7,-1);gatherGoal=.08;driveGoal=1.6;noiseGoal=.63;detailGoal=1.8;break;
 case 'burst':gatherGoal=-.7;driveGoal=1.65;noiseGoal=1.05;detailGoal=1.2;pulseCenter.copy((metrics?.mean||v(.5,.5,.5))).multiply(grid);pulse=2.1;break;
 }
}
function direct(dt){
 if(age>=nextDecision)choose();
 if(state==='wall'){
  const f=clamp((age-stateSince)/3,0,1),m=metrics?.mean||v(.5,.5,.5);
  driftGoal.set(clamp((wallTarget.x-m.x)*.62,-.34,.34),clamp((wallTarget.y-m.y)*.62,-.34,.34),0).multiplyScalar(f);
  if(metrics&&metrics.edge>.27){driftGoal.multiplyScalar(-.65);nextDecision=Math.min(nextDecision,age+3);}
 }
 const a=1-Math.exp(-dt*.17);
 for(let i=0;i<4;i++){origins[i].lerp(goals[i],a);axes[i].lerp(axisGoals[i],a*.65).normalize();}
 drift.lerp(driftGoal,a);drive+=(driveGoal-drive)*a;gather+=(gatherGoal-gather)*a;palette+=(paletteGoal-palette)*a*.38;noise+=(noiseGoal-noise)*a;
 const u=sim.uniforms;u.vortexA.value.copy(origins[0]);u.vortexB.value.copy(origins[1]);u.axisA.value.copy(axes[0]);u.axisB.value.copy(axes[1]);u.drive.value=drive;u.palette.value=palette;u.gather.value=gather;u.drift.value.copy(drift);conf.noise=noise;
 u.vortexC.value.copy(origins[2]);u.vortexD.value.copy(origins[3]);u.axisC.value.copy(axes[2]);u.axisD.value.copy(axes[3]);
 detail+=(detailGoal-detail)*a;u.detailForce.value=detail;
 if(age>=nextPulse){nextPulse=age+rand(17,37);if(state!=='rest'){pulseCenter.set(rand(.22,.78),rand(.22,.78),rand(.25,.75)).multiply(grid);pulse=rand(.8,1.8);}}
 pulse*=Math.exp(-dt*.85);u.pulse.value=pulse;u.pulseCenter.value.copy(pulseCenter);
 pace+=(paceGoal-pace)*(1-Math.exp(-dt*.32));conf.speed=pace;
 if(age>=nextTide){tideStart=age;tideDuration=rand(9,18);nextTide=age+tideDuration+rand(13,32);tideAxis.set(rand(-1,1),rand(-1,1),rand(-.35,.35)).normalize();tideStrength=rand(.24,.65);}
 const tideProgress=clamp((age-tideStart)/tideDuration,0,1);
 u.tideAxis.value.copy(tideAxis);u.tidePhase.value=-.85+tideProgress*1.7;u.tideAmount.value=Math.sin(Math.PI*tideProgress)*tideStrength;
 speedRef+=(clamp((metrics?.speed||1.1)*1.12,.55,4.5)-speedRef)*(1-Math.exp(-dt*.16));u.speedRef.value=speedRef;
 // Consume the latest pointer input once per submitted simulation, with no attack smoothing.
 pointerStrength=pointerDown?1:0;
 pointerDelta.copy(pointerGoal);
 const click=pendingClick;pendingClick=0;
 u.pointer.value.copy(pointer);u.pointerPrevious.value.copy(previousPointer);u.pointerDelta.value.copy(pointerDelta);
 u.pointerActive.value=pointerStrength;u.pointerDrag.value=dragDirty?1:0;
 u.clickImpulse.value=click;u.pointerPulse.value=Math.max(pointerPulse,click*2.6);u.clickCenter.value.copy(clickCenter);
 previousPointer.copy(pointer);pointerGoal.set(0,0,0);dragDirty=false;pointerPulse*=Math.exp(-dt*4.8);
 if(age>=nextNerve){nextNerve=age+rand(10,27);nerveSource.copy(metrics?.mean||v(.5,.5,.5)).add(v(rand(-.18,.18),rand(-.18,.18),rand(-.18,.18))).clampScalar(.08,.92).multiply(grid);nervePower=1;}
 nervePower*=Math.exp(-dt*.72);u.nerveSource.value.copy(nerveSource);u.nerveStrength.value=nervePower;
 if(!rareKind&&age>=nextRare){if(metrics&&metrics.edge<.4&&metrics.signal<.4)rareEvent();else nextRare=age+rand(20,55);}
 if(rareKind&&age-rareStart>=rareDuration)rareKind=0;
 const rareEnvelope=rareKind?Math.sin(Math.PI*clamp((age-rareStart)/rareDuration,0,1)):0;
 u.rareKind.value=rareKind;u.rareStrength.value=rareEnvelope;u.rareCenter.value.copy(rareCenter);u.rareAxis.value.copy(rareAxis);
 document.querySelector('#diagnostic').textContent=state+' · '+policy.total+' learned · '+(rareKind?rareNames[rareKind]:'signal '+Math.round((metrics?.signal||0)*100)+'%');
 lightMood+=(lightGoal-lightMood)*(1-Math.exp(-dt*.05));
 const activity=clamp((metrics?.speed||.8)/2,0,1);
 const look=lightingPresets[lightingMode]||lightingPresets.studio,la=1-Math.exp(-dt*4);
 const intensities={key:look.key+lightMood*.12,rim:look.rim+activity*.24,fill:look.fill,warm:look.warm+activity*.14};
 for(const n of ['key','rim','fill','warm']){const l=lightRig[n];l.intensity+=(intensities[n]-l.intensity)*la;l.color.lerp(new THREE.Color(look[n+'Color']),la);}
 lightRig.key.position.set(-1.15+Math.sin(age*.031)*.19,1.42,-.82);
 lightRig.rim.position.set(.95+Math.sin(age*.027)*.16,.72,.88);
 scene.environmentIntensity+=(look.env-scene.environmentIntensity)*la;
 exposure+=(look.exposure-activity*.035-exposure)*(1-Math.exp(-dt*3));renderer.toneMappingExposure=exposure;
}
function resize(){
 if(!renderer||!camera)return;
 const aspect=innerWidth/Math.max(1,innerHeight),hh=61.8/128;
 camera.left=-hh*aspect;camera.right=hh*aspect;camera.top=hh;camera.bottom=-hh;camera.updateProjectionMatrix();
 const bg=scene?.getObjectByName('studio backdrop');if(bg)bg.scale.set(2*hh*aspect*1.04,2*hh*1.04,1);
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
  // Keep at most one rendered frame queued so input cannot sit behind a backlog of GPU frames.
  if(renderer.backend.device?.queue)await renderer.backend.device.queue.onSubmittedWorkDone();
  if(frame++===0){status.hidden=true;stage.classList.add('ready');}
  if(age>=nextSample&&!observing&&!senseError&&frame>3){
   nextSample=age+2.1;observing=true;
   // Queue the compact telemetry dispatch before scheduling the next simulation.
   sim.observe().then(m=>{if(m){metrics=m;if(!rareKind&&!pointerDown)policy.observe(m,age);}}).catch(e=>{senseError=true;console.warn('Telemetry unavailable',e);}).finally(()=>{observing=false;});
  }
  perfFrames++;if(!perfStart)perfStart=now;
  if(now-perfStart>4500){const fps=perfFrames*1000/(now-perfStart);if(fps<28&&ratio>.65){ratio=Math.max(.65,ratio-.15);resize();}perfFrames=0;perfStart=now;}
 }catch(e){fail(e);stop();}finally{running=false;schedule();}
}
async function start(){
 if(!navigator.gpu)throw Error('WebGPU is unavailable.');
 renderer=new THREE.WebGPURenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
 ratio=Math.min(devicePixelRatio||1,conf.quality==='mobile'?.85:conf.particles>=200000?1.0:1.25);
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ReinhardToneMapping;renderer.toneMappingExposure=.82;
 await renderer.init();if(!renderer.backend.isWebGPUBackend)throw Error('Unable to initialize the WebGPU backend.');
 renderer.shadowMap.enabled=conf.quality!=='mobile';renderer.shadowMap.type=THREE.PCFSoftShadowMap;stage.appendChild(renderer.domElement);
 scene=new THREE.Scene();scene.background=new THREE.Color(0x101116);scene.environment=environment();scene.environmentIntensity=.40;
 camera=new THREE.OrthographicCamera(-1,1,.5,-.5,.015,10);camera.position.set(0,.5,-2.2);camera.lookAt(target);
 scene.add(new THREE.HemisphereLight(0xd6e2ff,0x292035,.30));
 light('key',0xfff4ec,1.65,v(-.85,1.65,-.95),conf.quality!=='mobile');
 light('fill',0xa9c9ff,.60,v(-1.1,.35,-.7));light('rim',0xe7f1ff,1.85,v(.95,.88,.95));light('warm',0xffad73,.46,v(.15,-.6,.25));
 const backdrop=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshStandardMaterial({color:0xffffff,map:backdropTexture(),roughness:.96,metalness:0}));
 backdrop.name='studio backdrop';
 backdrop.position.set(0,.5,.68);backdrop.rotation.y=Math.PI;backdrop.receiveShadow=true;scene.add(backdrop);
 sim=new Simulator(renderer);await sim.init();particles=new ParticleRenderer(sim,conf.shape);renderers.set(conf.shape,particles);scene.add(particles.object);
 const shapeSelect=document.querySelector('#shape'),paletteSelect=document.querySelector('#palette'),colorSelect=document.querySelector('#color'),nerveToggle=document.querySelector('#nerves');
 shapeSelect.value=conf.shape;paletteSelect.value=String(conf.paletteMode);colorSelect.value=conf.densityOnly?'0':'1';nerveToggle.checked=conf.nerves;
 shapeSelect.onchange=()=>{const shape=shapeSelect.value;if(shape===conf.shape)return;particles.object.visible=false;if(!renderers.has(shape)){const next=new ParticleRenderer(sim,shape);scene.add(next.object);renderers.set(shape,next);}particles=renderers.get(shape);particles.object.visible=true;conf.shape=shape;particles.setChamberScale(sim.uniforms.screenScale.value);particles.update();};
 paletteSelect.onchange=()=>{sim.uniforms.paletteMode.value=Number(paletteSelect.value);conf.paletteMode=Number(paletteSelect.value);};
 colorSelect.onchange=()=>{sim.uniforms.colorMix.value=Number(colorSelect.value);};
 nerveToggle.onchange=()=>{conf.nerves=nerveToggle.checked;sim.uniforms.nervesEnabled.value=conf.nerves?1:0;};
 document.querySelector('#learn').checked=conf.learn;
 document.querySelector('#learn').onchange=e=>{policy.enabled=e.target.checked;};
 const lightingSelect=document.querySelector('#lighting');if(!lightingPresets[lightingMode])lightingMode='studio';lightingSelect.value=lightingMode;lightingSelect.onchange=()=>{lightingMode=lightingSelect.value;};
 document.querySelector('#rare').onclick=()=>rareEvent();
 document.querySelector('#reset').onclick=()=>{policy.reset();policy.begin(state,metrics,age);};
 if(params.has('rare')){const kind=rareNames.indexOf(params.get('rare'));nextRare=Infinity;rareEvent(kind>0?kind:1);}

 resize();status.textContent='Initializing material field…';window.addEventListener('resize',resize);
 const canvas=renderer.domElement;
 function pointerPos(e){const rect=canvas.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2),camera);const p=v();if(!raycaster.ray.intersectPlane(plane,p))return pointer.clone();const xScale=sim.uniforms.screenScale.value;return v(clamp(p.x*64/xScale+grid.x*.5,2,grid.x-2),clamp(p.y*64,2,grid.y-2),grid.z*.5);}
 canvas.addEventListener('pointerdown',e=>{if(e.button!==0&&e.pointerType==='mouse')return;e.preventDefault();pointerDown=true;pointer.copy(pointerPos(e));previousPointer.copy(pointer);clickCenter.copy(pointer);pointerGoal.set(0,0,0);pointerDelta.set(0,0,0);pendingClick=1.25;pointerPulse=2.8;dragDirty=false;lastPointerTime=performance.now();canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{if(!pointerDown)return;e.preventDefault();const p=pointerPos(e),now=performance.now(),dt=Math.max(.008,Math.min(.12,(now-lastPointerTime)/1000));pointerGoal.copy(p).sub(previousPointer).multiplyScalar(.022/dt).clampLength(0,3.0);pointer.copy(p);dragDirty=true;lastPointerTime=now;});
 const release=()=>{pointerDown=false;};
 canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);window.addEventListener('blur',release);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else schedule();});
 document.querySelector('#pause').onclick=e=>{paused=!paused;e.target.textContent=paused?'resume':'pause';if(paused)stop();else schedule();};
 document.querySelector('#new').onclick=()=>location.reload();
 document.querySelector('#full').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{}};
 document.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='h')document.body.classList.toggle('clean');if(e.code==='Space'&&e.target.tagName!=='BUTTON'){e.preventDefault();document.querySelector('#pause').click();}});
 if(params.has('clean'))document.body.classList.add('clean');
 const dev=renderer.backend.device;if(dev?.lost)dev.lost.then(info=>{stop();fail(Error(info.message||'Graphics device lost.'));});
 window.sculptureStatus=()=>({frame,age,particles:conf.particles,backend:'WebGPU',pixelRatio:ratio,paused,state,metrics:metrics?{...metrics,mean:metrics.mean.toArray()}:null,telemetryAvailable:!senseError,pointerActive:pointerDown,speedRef,pace,memory:conf.memory,quality:conf.quality,shape:conf.shape,learning:policy.snapshot(),rare:rareNames[rareKind],rareCount,lighting:lightingMode});
 schedule();
}
start().catch(fail);
