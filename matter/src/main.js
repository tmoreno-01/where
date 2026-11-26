import * as THREE from 'three/webgpu';
import Simulator from './mls-mpm/mlsMpmSimulator.js';
import ParticleRenderer from './mls-mpm/particleRenderer.js';
import {conf} from './conf.js';
import {AdaptivePolicy} from './policy.js';
import {compositionField,compositionMetrics} from './composition.js';
import {paletteNames,paletteStops,selectStudy} from './palettes.js';
const stage=document.querySelector('#stage'),status=document.querySelector('#status'),params=new URLSearchParams(location.search);
const v=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),rand=(a,b)=>a+(b-a)*Math.random(),clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const target=v(0,.5,.24),raycaster=new THREE.Raycaster(),plane=new THREE.Plane(v(0,0,-1),.24);
const grid=v(conf.gridX,conf.gridY,conf.gridZ);
const origins=[v(.23,.33,.42).multiply(grid),v(.77,.67,.57).multiply(grid)],goals=origins.map(x=>x.clone());
origins.push(v(.30,.72,.28).multiply(grid),v(.70,.29,.75).multiply(grid));
goals.push(origins[2].clone(),origins[3].clone());
const axes=[v(.2,.4,1).normalize(),v(-.4,.6,-1).normalize(),v(.4,1,.3).normalize(),v(-1,.4,.5).normalize()],axisGoals=axes.map(x=>x.clone());
const pointer=v(),pointerDelta=v(),pointerGoal=v(),clickCenter=v(),pulseCenter=v(),previousPointer=v();
let pendingClick=0,dragDirty=false,lightingMode=params.get('lighting')||'contrast',finishMode=params.get('finish')||'metallic';
let fieldShadowMode=params.get('fieldshadow')||'deep';
let brightness=1.15;
const visibleFraction=.87;
let hostVisible=true,viewportVisible=true;
let pointerPulse=0,pointerStrength=0,lastPointerTime=0,detail=.8,detailGoal=.8,pulse=0,nextPulse=9,speedRef=1.0;
const tideAxis=v(1,0,0);
let pace=.66,paceGoal=.66,tideStart=-100,tideDuration=12,tideStrength=0,nextTide=12;
const drift=v(),driftGoal=v(),recent=[],lightRig={};
const spreadForce=v(.007,.009,0),spreadCenter=grid.clone().multiplyScalar(.5),edgeBias=v();
let activeStudy=conf.paletteMode<0?Math.floor(Math.random()*6):conf.paletteMode;
let studyRecent=[activeStudy],nextStudy=30,studyCurrent=paletteStops[activeStudy].map(c=>v(...c)),studyGoal=paletteStops[activeStudy].map(c=>v(...c));
function changeStudy(i){activeStudy=i;studyGoal=paletteStops[i].map(c=>v(...c));studyRecent.push(i);if(studyRecent.length>3)studyRecent.shift();}
let renderer,sim,particles,camera,scene,raf=0,previous=0,age=0,frame=0,ratio=1,perfStart=0,perfFrames=0,paused=false,running=false,dead=false;
let drive=.95,driveGoal=.95,gather=0,gatherGoal=0,palette=0,paletteGoal=0,noise=.75,noiseGoal=.75;
let nextDecision=0,nextSample=0,observing=false,metrics=null,senseError=false,state='wake',stateSince=0,lightMood=0,lightGoal=0,pointerDown=false,exposure=1.0;
const forced=params.get('mode');let wallTarget=v(.84,.72,.5);
function environment(){
 const w=1024,h=512,data=new Uint16Array(w*h*4);
 // Broad neutral softbox plus narrow strip reflections and a darker surrounding studio.
 const boxes=[[.12,.36,.085,.22,5.8,6.1,6.5],[.34,.43,.022,.27,7.3,7.6,8.0],[.69,.34,.032,.23,6.9,5.6,4.5],[.61,.13,.22,.033,5.4,5.8,6.2],[.92,.59,.043,.16,2.0,3.0,4.3],[.51,.76,.14,.052,1.2,1.4,1.6]];
 const half=THREE.DataUtils.toHalfFloat;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const u=x/w,t=y/h,i=(y*w+x)*4;let r=.017+.048*(1-t),g=.020+.055*(1-t),b=.026+.068*(1-t);
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
 sculptural:{key:1.85,rim:1.40,fill:.17,warm:.12,env:.66,exposure:.94,keyColor:0xfff1dd,rimColor:0xaccdff,fillColor:0x6b8cce,warmColor:0xe5a887},
 gloss:{key:1.10,rim:1.45,fill:.25,warm:.18,env:.95,exposure:.94,keyColor:0xfff5ed,rimColor:0xdbeaff,fillColor:0xb0c7ee,warmColor:0xffc39d},
 studio:{key:2.25,rim:2.4,fill:.55,warm:.32,env:.40,exposure:.86,keyColor:0xfff1dc,rimColor:0xc9e1ff,fillColor:0x9cb6f7,warmColor:0xffb17a},
 contrast:{key:2.90,rim:3.15,fill:.28,warm:.22,env:.88,exposure:1.04,keyColor:0xffffff,rimColor:0xb1d1ff,fillColor:0xa0b9f4,warmColor:0xffaf84},
 spectral:{key:1.65,rim:2.15,fill:.85,warm:.45,env:.29,exposure:.82,keyColor:0xe0f2ff,rimColor:0xb698ff,fillColor:0x83d9e6,warmColor:0xffa45d}
};
function light(name,color,intensity,pos,shadow=false){
 const l=new THREE.DirectionalLight(color,intensity);l.position.copy(pos);l.target.position.copy(target);scene.add(l,l.target);lightRig[name]=l;
 if(shadow){l.castShadow=true;l.shadow.mapSize.set(conf.particles>=200000?1024:1536,conf.particles>=200000?1024:1536);Object.assign(l.shadow.camera,{left:-2,right:2,top:1.4,bottom:-1.4,near:.02,far:6});l.shadow.camera.updateProjectionMatrix();l.shadow.bias=-.00035;l.shadow.normalBias=.0015;}
 return l;
}
const modes=['gather','unfold','divide','orbit','rest','shear','braid','burst'];
const policy=new AdaptivePolicy(modes,conf.learn), renderers=new Map();
let requestedCount=conf.particles,countRevision=0,measuredFps=null,manualCount=false;
let compositionGoal=Array.from({length:64},()=>[0,0]);
let shadowMode=params.get('shadows')||'auto',shadowActive=false,renderCeiling=1,nextDiagnostic=0,slowWindows=0,fastWindows=0;
const countFormat=new Intl.NumberFormat('en-GB');
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
 const scores={gather:.15,unfold:1.75,divide:1.15,orbit:1,rest:.45,shear:1.45,braid:1.65,burst:.95};
 if(m){scores.gather+=clamp((m.spread-.43)*8,0,1.6);scores.unfold+=clamp((m.density-0.8)*2.4,0,2.8)+clamp((.26-Math.min(m.spreadX??.22,m.spreadY??.22))*16,0,3)+clamp((.60-(m.coverage??.5))*3,0,1.8);scores.divide+=clamp((m.density-.65)*2,0,2);scores.orbit+=clamp((.8-m.speed)*2,0,2);scores.unfold+=clamp((.68-(m.coverage??.5))*4,0,2);scores.braid+=clamp(((m.edgeMass??.44)-.44)*5,0,2);scores.rest+=clamp((m.speed-1.7)*2.2,0,3)+m.edge*2;scores.burst+=clamp((1.0-m.speed)*2.8,0,3);scores.shear+=clamp((m.spread-.20)*5,0,2);scores.braid+=clamp((.65-m.density)*1.5,0,1);}
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
 case 'gather':set(0,.40,.44,.47);set(1,.60,.56,.52);axis(0,.2,.1,1);axis(1,.1,.4,1);gatherGoal=.18;driveGoal=.66;noiseGoal=.43;break;
 case 'unfold':set(0,.12,.24,.47);set(1,.88,.76,.53);axis(0,.2,.1,1);axis(1,.1,.2,-1);gatherGoal=-.08;driveGoal=1.35;noiseGoal=.98;break;
 case 'divide':{const vertical=Math.random()<.4;set(0,vertical?.48:.20,vertical?.19:.48,.33);set(1,vertical?.52:.80,vertical?.81:.52,.69);axis(0,0,.3,1);axis(1,.2,0,-1);gatherGoal=-.18;driveGoal=1.55;noiseGoal=.55;break;}
 case 'orbit':set(0,.37,.50,.35);set(1,.63,.50,.65);axis(0,rand(-.4,.4),rand(-.4,.4),1);axis(1,rand(-.4,.4),rand(-.4,.4),1);gatherGoal=.02;driveGoal=1.5;noiseGoal=.75;break;
 case 'wall':{const side=Math.floor(rand(0,4));wallTarget.set(side===0?.06:side===1?.94:rand(.24,.76),side===2?.06:side===3?.94:rand(.25,.75),.5);set(0,wallTarget.x,wallTarget.y,.37);set(1,wallTarget.x,wallTarget.y,.66);axis(0,0,0,1);axis(1,.15,.1,-1);gatherGoal=-.12;driveGoal=1.08;noiseGoal=.52;break;}
 case 'rest':set(0,.44,.50,.40);set(1,.56,.50,.60);axis(0,.2,1,.2);axis(1,.2,1,-.2);gatherGoal=.02;driveGoal=.40;noiseGoal=.35;detailGoal=.38;break;
 case 'shear':set(0,.22,.35,.3);set(1,.78,.65,.7);axis(0,.3,.7,1);axis(1,-.3,.7,-1);gatherGoal=-.38;driveGoal=1.85;noiseGoal=.82;detailGoal=1.15;break;
 case 'braid':set(0,.3,.42,.4);set(1,.7,.58,.6);set(2,.46,.28,.66);set(3,.54,.72,.33);axis(0,.7,.1,1);axis(1,.7,.1,1);axis(2,0,.7,-1);axis(3,0,.7,-1);gatherGoal=-.08;driveGoal=1.6;noiseGoal=.63;detailGoal=1.8;break;
 case 'burst':gatherGoal=-.13;driveGoal=1.65;noiseGoal=1.05;detailGoal=1.2;pulseCenter.copy((metrics?.mean||v(.5,.5,.5))).multiply(grid);pulse=2.1;break;
 }
}
function direct(dt){
 if(age>=nextDecision)choose();
 const a=1-Math.exp(-dt*.17);
 for(let i=0;i<4;i++){origins[i].lerp(goals[i],a);axes[i].lerp(axisGoals[i],a*.65).normalize();}
 drift.lerp(driftGoal,a);drive+=(driveGoal-drive)*a;gather+=(gatherGoal-gather)*a;palette+=(paletteGoal-palette)*a*.38;noise+=(noiseGoal-noise)*a;
 const u=sim.uniforms;u.vortexA.value.copy(origins[0]);u.vortexB.value.copy(origins[1]);u.axisA.value.copy(axes[0]);u.axisB.value.copy(axes[1]);u.drive.value=drive;u.palette.value=palette;u.gather.value=gather;u.drift.value.copy(drift);conf.noise=noise;
 const m=metrics,compression=state==='gather'||rareKind===2;
 // The occupancy field, not the outer boundary, controls distribution.
 const fx=clamp((.24-(m?.spreadX??.24))*.018,-.0015,.0025);
 const fy=clamp((.24-(m?.spreadY??.24))*.018,-.0015,.0025);
 spreadForce.lerp(v(fx,fy,0),1-Math.exp(-dt*.30));spreadCenter.copy(grid).multiplyScalar(.5);
 u.spreadForce.value.copy(spreadForce);u.spreadCenter.value.copy(spreadCenter);
 const blend=1-Math.exp(-dt*.55);
 for(let i=0;i<64;i++){const p=sim.compositionVectors[i],q=compositionGoal[i];p.x+=(q[0]-p.x)*blend;p.y+=(q[1]-p.y)*blend;}
 if(conf.paletteMode<0&&age>=nextStudy&&!rareKind){
   changeStudy(selectStudy(state,m,studyRecent));nextStudy=age+rand(28,65);
 }
 for(let i=0;i<5;i++){studyCurrent[i].lerp(studyGoal[i],1-Math.exp(-dt*.36));u.pigmentStops[i].value.copy(studyCurrent[i]);}
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
 if(age>=nextDiagnostic){nextDiagnostic=age+.35;document.querySelector('#studyName').textContent=paletteNames[activeStudy];document.querySelector('#publicState').textContent=rareKind?rareNames[rareKind]:({gather:'condensing',unfold:'unfolding',divide:'dividing',orbit:'circulating',wall:'drifting',rest:'resting',shear:'shearing',braid:'weaving',burst:'expanding',wake:'awakening'}[state]||state);document.querySelector('#coverageReadout').textContent=metrics?Math.round((metrics.occupied??0)*100)+'%':'—';document.querySelector('#diagnostic').textContent=state+' · '+policy.total+' learned · '+(rareKind?rareNames[rareKind]:'signal '+Math.round((metrics?.signal||0)*100)+'%')+(measuredFps===null?'':' · '+Math.round(measuredFps)+' fps')+' · '+(shadowActive?'shadows':'no shadows');}
 lightMood+=(lightGoal-lightMood)*(1-Math.exp(-dt*.05));
 const activity=clamp((metrics?.speed||.8)/2,0,1);
 const look=lightingPresets[lightingMode]||lightingPresets.sculptural,la=1-Math.exp(-dt*4);
 const intensities={key:look.key+lightMood*.12,rim:look.rim+activity*.24,fill:look.fill,warm:look.warm+activity*.14};
 for(const n of ['key','rim','fill','warm']){const l=lightRig[n];l.intensity+=(intensities[n]-l.intensity)*la;l.color.lerp(new THREE.Color(look[n+'Color']),la);}
 lightRig.key.position.set(-1.15+Math.sin(age*.031)*.19,1.42,-.82);
 lightRig.rim.position.set(.95+Math.sin(age*.027)*.16,.72,.88);
 // Convert the world-space key direction into the simulation's nonuniform grid.
 const keyVector=lightRig.key.position.clone().sub(target);
 keyVector.x/=Math.max(.01,u.screenScale.value);keyVector.y/=Math.max(.01,u.screenScaleY.value);keyVector.z/=.65;
 u.lightDirection.value.copy(keyVector.normalize());
 const shadowAmount=fieldShadowMode==='off'?0:fieldShadowMode==='soft'?.52:1;
 u.fieldShadows.value+=(shadowAmount-u.fieldShadows.value)*(1-Math.exp(-dt*4));
 scene.environmentIntensity+=(look.env-scene.environmentIntensity)*la;
 exposure+=((look.exposure-activity*.035)*brightness-exposure)*(1-Math.exp(-dt*3));renderer.toneMappingExposure=exposure;
}
function setShadows(enabled){if(shadowActive===enabled&&renderer.shadowMap.enabled===enabled)return;shadowActive=enabled;renderer.shadowMap.enabled=enabled;lightRig.key.castShadow=enabled;}
function updateVisibleBounds(){
 const u=sim.uniforms,halfX=grid.x*visibleFraction*.5,halfY=grid.y*visibleFraction*.5;
 // Conservative mesh radius in world units, including density and stretched cuboids.
 const extent=conf.shape==='rods'?1.85:conf.shape==='capsules'?1.19:.61;
 const pad=extent*conf.actualSize*1.12+.005;
 const sx=u.screenScale.value,sy=u.screenScaleY.value;
 const minX=Math.max(2.04,grid.x*.5-halfX+pad/sx),minY=Math.max(2.04,grid.y*.5-halfY+pad/sy);
 u.visibleMin.value.set(minX,minY,2.04);
 u.visibleMax.value.set(grid.x-minX,grid.y-minY,grid.z-2.04);
}
function resize(){
 if(!renderer||!camera)return;
 const aspect=innerWidth/Math.max(1,innerHeight),hh=61.8/128;
 camera.left=-hh*aspect;camera.right=hh*aspect;camera.top=hh;camera.bottom=-hh;camera.updateProjectionMatrix();
 const bg=scene?.getObjectByName('studio backdrop');if(bg)bg.scale.set(2*hh*aspect*1.04,2*hh*1.04,1);
 // Keep the physical boundary outside the camera on every aspect ratio.
 const scaleX=2*hh*64*aspect/(conf.gridX*visibleFraction),scaleY=2*hh*64/(conf.gridY*visibleFraction);
 if(particles){particles.setChamberScale(scaleX,scaleY);sim.uniforms.screenScale.value=scaleX;sim.uniforms.screenScaleY.value=scaleY;updateVisibleBounds();}
 renderer.setPixelRatio(ratio);renderer.setSize(innerWidth,innerHeight);
}
function fail(e){console.error(e);dead=true;status.hidden=false;status.textContent=conf.studio?'This live experiment requires WebGPU.':'This experiment requires a working WebGPU browser and graphics adapter. '+(e?.message||String(e));if(conf.studio&&window.parent!==window)window.parent.postMessage({type:'matter:unavailable'},location.origin);}
function stop(){if(raf)cancelAnimationFrame(raf);raf=0;previous=0;perfStart=0;perfFrames=0;}
function schedule(){if(!raf&&!running&&!paused&&!dead&&!document.hidden&&hostVisible&&viewportVisible)raf=requestAnimationFrame(loop);}
async function loop(now){
 raf=0;if(paused||dead||document.hidden||!hostVisible||!viewportVisible)return;running=true;
 const dt=previous?Math.min((now-previous)/1000,.033):1/60;previous=now;age+=dt;
 try{
  if(requestedCount!==conf.particles){
   conf.particles=requestedCount;conf.updateParams();updateVisibleBounds();countRevision++;metrics=null;compositionGoal=Array.from({length:64},()=>[0,0]);
   policy.begin(state,null,age);nextSample=age+.5;
   if(shadowMode==='auto'&&conf.particles>=200000)setShadows(false);
  }
  direct(dt);await sim.update(dt,age);particles.update();await renderer.renderAsync(scene,camera);
  // Keep at most one rendered frame queued so input cannot sit behind a backlog of GPU frames.
  if(renderer.backend.device?.queue)await renderer.backend.device.queue.onSubmittedWorkDone();
  if(frame++===0){status.hidden=true;stage.classList.add('ready');if(conf.studio&&window.parent!==window)window.parent.postMessage({type:'matter:ready'},location.origin);}
  if(age>=nextSample&&!observing&&!senseError&&frame>3){
   nextSample=age+1.8;observing=true;
   // Queue the compact telemetry dispatch before scheduling the next simulation.
   const revision=countRevision;
   sim.observe().then(m=>{if(m&&revision===countRevision){Object.assign(m,compositionMetrics(m.distribution));metrics=m;compositionGoal=compositionField(m.distribution);if(!rareKind&&!pointerDown)policy.observe(m,age);}}).catch(e=>{senseError=true;console.warn('Telemetry unavailable',e);}).finally(()=>{observing=false;});
  }
  perfFrames++;if(!perfStart)perfStart=now;
  if(now-perfStart>2200){
   const fps=perfFrames*1000/(now-perfStart);measuredFps=fps;
   if(fps<42){slowWindows++;fastWindows=0;}else if(fps>56){fastWindows++;slowWindows=0;}else{slowWindows=0;fastWindows=0;}
   if(slowWindows>=2){if(shadowMode==='auto'&&shadowActive)setShadows(false);else if(ratio>.65){ratio=Math.max(.65,ratio-.10);resize();}else if(conf.studio&&!manualCount&&fps<34&&requestedCount>(conf.mobile?6000:60000)){requestedCount=Math.max(conf.mobile?6000:60000,Math.round(requestedCount*.82/1000)*1000);document.querySelector('#particleCount').value=String(requestedCount);document.querySelector('#particleCountLabel').textContent=countFormat.format(requestedCount);}slowWindows=0;}
   if(fastWindows>=5&&ratio<renderCeiling){ratio=Math.min(renderCeiling,ratio+.05);resize();fastWindows=0;}
   perfFrames=0;perfStart=now;
  }
 }catch(e){fail(e);stop();}finally{running=false;schedule();}
}
async function start(){
 if(!navigator.gpu)throw Error('WebGPU is unavailable.');
 renderer=new THREE.WebGPURenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
 ratio=Math.min(devicePixelRatio||1,conf.quality==='mobile'?.85:conf.particles>=200000?1.0:1.25);renderCeiling=ratio;
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ReinhardToneMapping;renderer.toneMappingExposure=.82;
 await renderer.init();if(!renderer.backend.isWebGPUBackend)throw Error('Unable to initialize the WebGPU backend.');
 renderer.shadowMap.enabled=conf.quality!=='mobile';renderer.shadowMap.type=THREE.PCFSoftShadowMap;stage.appendChild(renderer.domElement);
 scene=new THREE.Scene();scene.background=new THREE.Color(0x101116);scene.environment=environment();scene.environmentIntensity=.66;
 camera=new THREE.OrthographicCamera(-1,1,.5,-.5,.015,10);camera.position.set(0,.5,-2.2);camera.lookAt(target);
 scene.add(new THREE.HemisphereLight(0xb8cff5,0x151f42,.13));
 light('key',0xfff4ec,1.65,v(-.85,1.65,-.95),conf.quality!=='mobile');
 setShadows(shadowMode==='on'||(shadowMode==='auto'&&!conf.mobile&&conf.particles<200000));
 light('fill',0xa9c9ff,.60,v(-1.1,.35,-.7));light('rim',0xe7f1ff,1.85,v(.95,.88,.95));light('warm',0xffad73,.46,v(.15,-.6,.25));
 const backdrop=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshStandardMaterial({color:0xffffff,map:backdropTexture(),roughness:.96,metalness:0}));
 backdrop.name='studio backdrop';
 backdrop.position.set(0,.5,.68);backdrop.rotation.y=Math.PI;backdrop.receiveShadow=true;scene.add(backdrop);
 sim=new Simulator(renderer);await sim.init();for(let i=0;i<5;i++)sim.uniforms.pigmentStops[i].value.copy(studyCurrent[i]);particles=new ParticleRenderer(sim,conf.shape);particles.setFinish(finishMode);renderers.set(conf.shape,particles);scene.add(particles.object);
 const shapeSelect=document.querySelector('#shape'),paletteSelect=document.querySelector('#palette'),colorSelect=document.querySelector('#color'),nerveToggle=document.querySelector('#nerves');
 shapeSelect.value=conf.shape;paletteSelect.value=String(conf.paletteMode);colorSelect.value=conf.densityOnly?'0':'1';nerveToggle.checked=conf.nerves;
 const solverSelect=document.querySelector('#solver'),shadowSelect=document.querySelector('#shadows');
 solverSelect.value=conf.solver;solverSelect.onchange=()=>{conf.solver=solverSelect.value;};
 shadowSelect.value=shadowMode;shadowSelect.onchange=()=>{shadowMode=shadowSelect.value;setShadows(shadowMode==='on'||(shadowMode==='auto'&&!conf.mobile&&conf.particles<200000));};
 const countSlider=document.querySelector('#particleCount'),countLabel=document.querySelector('#particleCountLabel');
 countSlider.min='5000';countSlider.max=String(conf.maxParticles);countSlider.step='1000';countSlider.value=String(conf.particles);
 countLabel.textContent=countFormat.format(conf.particles);
 countSlider.oninput=()=>{manualCount=true;requestedCount=clamp(Math.round(Number(countSlider.value)/1000)*1000,5000,conf.maxParticles);countLabel.textContent=countFormat.format(requestedCount);};
 shapeSelect.onchange=()=>{const shape=shapeSelect.value;if(shape===conf.shape)return;particles.object.visible=false;if(!renderers.has(shape)){const next=new ParticleRenderer(sim,shape);scene.add(next.object);renderers.set(shape,next);}particles=renderers.get(shape);particles.setFinish(finishMode);particles.object.visible=true;conf.shape=shape;particles.setChamberScale(sim.uniforms.screenScale.value,sim.uniforms.screenScaleY.value);updateVisibleBounds();particles.update();};
 paletteSelect.onchange=()=>{conf.paletteMode=Number(paletteSelect.value);if(conf.paletteMode>=0)changeStudy(conf.paletteMode);else {changeStudy(selectStudy(state,metrics,studyRecent));nextStudy=age+rand(28,65);}};
 colorSelect.onchange=()=>{sim.uniforms.colorMix.value=Number(colorSelect.value);};
 nerveToggle.onchange=()=>{conf.nerves=nerveToggle.checked;sim.uniforms.nervesEnabled.value=conf.nerves?1:0;};
 document.querySelector('#learn').checked=conf.learn;
 document.querySelector('#learn').onchange=e=>{policy.enabled=e.target.checked;};
 const brightnessSlider=document.querySelector('#brightness'),brightnessLabel=document.querySelector('#brightnessLabel');
 brightnessSlider.value=String(brightness);brightnessLabel.textContent=Math.round(brightness*100)+'%';
 brightnessSlider.oninput=()=>{brightness=Number(brightnessSlider.value);brightnessLabel.textContent=Math.round(brightness*100)+'%';};
 const lightingSelect=document.querySelector('#lighting');if(!lightingPresets[lightingMode])lightingMode='contrast';lightingSelect.value=lightingMode;lightingSelect.onchange=()=>{lightingMode=lightingSelect.value;};
 const fieldSelect=document.querySelector('#fieldShadow');if(!['deep','soft','off'].includes(fieldShadowMode))fieldShadowMode='deep';fieldSelect.value=fieldShadowMode;fieldSelect.onchange=()=>{fieldShadowMode=fieldSelect.value;};
 const finishSelect=document.querySelector('#finish');if(!['glossy','metallic','matte'].includes(finishMode))finishMode='metallic';finishSelect.value=finishMode;finishSelect.onchange=()=>{finishMode=finishSelect.value;particles.setFinish(finishMode);};
 document.querySelector('#rare').onclick=()=>rareEvent();
 document.querySelector('#reset').onclick=()=>{policy.reset();policy.begin(state,metrics,age);};
 if(params.has('rare')){const kind=rareNames.indexOf(params.get('rare'));nextRare=Infinity;rareEvent(kind>0?kind:1);}

 resize();status.textContent='Initializing material field…';window.addEventListener('resize',resize);
 const canvas=renderer.domElement;
 function pointerPos(e){const rect=canvas.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2),camera);const p=v();if(!raycaster.ray.intersectPlane(plane,p))return pointer.clone();const xScale=sim.uniforms.screenScale.value,yScale=sim.uniforms.screenScaleY.value;return v(clamp(p.x*64/xScale+grid.x*.5,2,grid.x-2),clamp((p.y-.5)*64/yScale+grid.y*.5,2,grid.y-2),grid.z*.5);}
 canvas.addEventListener('pointerdown',e=>{if(e.button!==0&&e.pointerType==='mouse')return;e.preventDefault();pointerDown=true;pointer.copy(pointerPos(e));previousPointer.copy(pointer);clickCenter.copy(pointer);pointerGoal.set(0,0,0);pointerDelta.set(0,0,0);pendingClick=1.25;pointerPulse=2.8;dragDirty=false;lastPointerTime=performance.now();canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{if(!pointerDown)return;e.preventDefault();const p=pointerPos(e),now=performance.now(),dt=Math.max(.008,Math.min(.12,(now-lastPointerTime)/1000));pointerGoal.copy(p).sub(previousPointer).multiplyScalar(.022/dt).clampLength(0,3.0);pointer.copy(p);dragDirty=true;lastPointerTime=now;});
 const release=()=>{pointerDown=false;};
 canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);window.addEventListener('blur',release);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else schedule();});
 document.querySelector('#pause').onclick=e=>{paused=!paused;const button=e.currentTarget;button.setAttribute('aria-label',paused?'Resume':'Pause');button.setAttribute('aria-pressed',String(paused));button.querySelector('.pause-icon').textContent=paused?'▶':'Ⅱ';if(paused)stop();else schedule();};
 document.querySelector('#new').onclick=()=>location.reload();
 document.querySelector('#full').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{}};
 document.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='h'&&!/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))document.body.classList.toggle('lab');if(e.code==='Space'&&!/BUTTON|INPUT|SELECT|TEXTAREA/.test(e.target.tagName)){e.preventDefault();document.querySelector('#pause').click();}});
 if(params.has('clean'))document.body.classList.add('clean');
 if(params.has('lab'))document.body.classList.add('lab');
 if(conf.studio){
   document.body.classList.add('studio');
   if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{viewportVisible=entries[0].isIntersecting;if(!viewportVisible)stop();else schedule();},{threshold:0});observer.observe(stage);}
   window.addEventListener('message',e=>{if(e.source!==window.parent||e.origin!==location.origin||e.data?.type!=='matter:visibility')return;hostVisible=e.data.visible===true;if(!hostVisible)stop();else schedule();});
 }
 window.matterPause=()=>{paused=true;stop();};
 window.matterResume=()=>{paused=false;schedule();};
 const dev=renderer.backend.device;if(dev?.lost)dev.lost.then(info=>{stop();fail(Error(info.message||'Graphics device lost.'));});
 document.querySelector('#labToggle').onclick=e=>{const show=document.body.classList.toggle('lab');e.currentTarget.setAttribute('aria-expanded',String(show));};
 window.sculptureStatus=()=>({palette:paletteNames[activeStudy],frame,age,particles:conf.particles,requestedCount,maxParticles:conf.maxParticles,fps:measuredFps,solver:conf.solver,shadows:shadowActive,backend:'WebGPU',pixelRatio:ratio,paused,state,metrics:metrics?{...metrics,mean:metrics.mean.toArray()}:null,telemetryAvailable:!senseError,pointerActive:pointerDown,speedRef,pace,memory:conf.memory,quality:conf.quality,shape:conf.shape,learning:policy.snapshot(),rare:rareNames[rareKind],rareCount,lighting:lightingMode,brightness,visibleFraction,fieldShadows:fieldShadowMode,finish:finishMode});
 schedule();
}
start().catch(fail);
