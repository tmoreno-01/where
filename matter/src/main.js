import * as THREE from 'three/webgpu';
import Simulator from './mls-mpm/mlsMpmSimulator.js';
import ParticleRenderer from './mls-mpm/particleRenderer.js';
import {conf} from './conf.js';

const stage=document.querySelector('#stage'), status=document.querySelector('#status'), controls=document.querySelector('#controls');
const params=new URLSearchParams(location.search);
let renderer,sim,particles,camera,scene,paused=false,raf=0,previous=0,age=0,frame=0,perfStart=0,perfFrames=0,ratio=1;
const rand=(a,b)=>a+(b-a)*Math.random();
const v=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const axes=[v(0.2,0.4,1).normalize(),v(-0.4,0.6,-1).normalize()];
const origins=[v(19,28,22),v(44,38,40)];
const goals=origins.map(x=>x.clone()),axisGoals=axes.map(x=>x.clone());
let eventAt=0,drive=0.9,driveGoal=0.9,palette=0,paletteGoal=0;
let cameraAngle=rand(-0.12,0.12),cameraGoal=cameraAngle,camAt=0;
const target=v(0,.5,.26), raycaster=new THREE.Raycaster(),plane=new THREE.Plane(v(0,0,-1),.22);
let pointerDown=false;
function environment(){
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;
 const ctx=canvas.getContext('2d'),im=ctx.createImageData(canvas.width,canvas.height);
 const boxes=[[.13,.39,.09,.19,230,240,255],[.47,.34,.07,.14,255,218,177],[.79,.34,.10,.14,170,214,255],[.65,.08,.20,.055,245,245,245]];
 for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
  const u=x/canvas.width,w=y/canvas.height,i=(y*canvas.width+x)*4;
  let r=17+24*(1-w),g=19+24*(1-w),b=24+24*(1-w);
  for(const [cx,cy,sx,sy,rr,gg,bb] of boxes){const dx=Math.min(Math.abs(u-cx),1-Math.abs(u-cx))/sx,dy=(w-cy)/sy;const f=Math.exp(-Math.pow(dx,6)-Math.pow(dy,6));r+=rr*f;g+=gg*f;b+=bb*f;}
  im.data[i]=Math.min(255,r);im.data[i+1]=Math.min(255,g);im.data[i+2]=Math.min(255,b);im.data[i+3]=255;
 }
 ctx.putImageData(im,0,0);const tex=new THREE.CanvasTexture(canvas);tex.mapping=THREE.EquirectangularReflectionMapping;tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
function light(color,intensity,pos,shadow=false){
 const l=new THREE.DirectionalLight(color,intensity);l.position.copy(pos);l.target.position.copy(target);scene.add(l,l.target);
 if(shadow){l.castShadow=true;l.shadow.mapSize.set(1024,1024);Object.assign(l.shadow.camera,{left:-.85,right:.85,top:.85,bottom:-.85,near:.02,far:5});l.shadow.bias=-.0006;l.shadow.normalBias=.003;}
 return l;
}
function newEvent(){
 for(let i=0;i<2;i++){goals[i].set(rand(13,51),rand(13,51),rand(13,51));axisGoals[i].set(rand(-1,1),rand(-1,1),rand(-1,1)).normalize();}
 driveGoal=rand(.52,1.58);paletteGoal=rand(-.65,.65);eventAt=age+rand(7,20);
}
function direct(dt){
 if(age>=eventAt)newEvent();
 if(age>=camAt){cameraGoal=rand(-.18,.18);camAt=age+rand(14,29);}
 const alpha=1-Math.exp(-dt*.18);
 for(let i=0;i<2;i++){origins[i].lerp(goals[i],alpha);axes[i].lerp(axisGoals[i],alpha*.7).normalize();}
 drive+=(driveGoal-drive)*alpha;palette+=(paletteGoal-palette)*alpha;
 sim.uniforms.vortexA.value.copy(origins[0]);sim.uniforms.vortexB.value.copy(origins[1]);sim.uniforms.axisA.value.copy(axes[0]);sim.uniforms.axisB.value.copy(axes[1]);sim.uniforms.drive.value=drive;sim.uniforms.palette.value=palette;
 cameraAngle+=(cameraGoal-cameraAngle)*(1-Math.exp(-dt*.055));
 const d=innerWidth/innerHeight<.8?1.92:1.35;
 camera.position.set(Math.sin(cameraAngle)*d,.54+Math.sin(age*.025)*.045,-Math.cos(cameraAngle)*d+.23);
 camera.lookAt(target);
}
function resize(){
 if(!renderer)return;
 const narrow=innerWidth/innerHeight<.8;camera.aspect=innerWidth/innerHeight;camera.fov=narrow?53:48;camera.updateProjectionMatrix();
 renderer.setPixelRatio(ratio);renderer.setSize(innerWidth,innerHeight);
}
function fail(e){console.error(e);status.hidden=false;status.textContent='This experiment requires a working WebGPU browser and graphics adapter. '+(e?.message||String(e));}
function stop(){if(raf)cancelAnimationFrame(raf);raf=0;previous=0;}
function schedule(){if(!raf&&!paused&&!document.hidden)raf=requestAnimationFrame(loop);}
async function loop(now){
 raf=0;if(paused||document.hidden)return;
 const dt=previous?Math.min((now-previous)/1000,.033):1/60;previous=now;age+=dt;
 try{
  direct(dt);await sim.update(dt,age);particles.update();
  await renderer.renderAsync(scene,camera);
  if(frame++===0){status.hidden=true;stage.classList.add('ready');}
  perfFrames++;if(!perfStart)perfStart=now;
  if(now-perfStart>4500){const fps=perfFrames*1000/(now-perfStart);if(fps<28&&ratio>.65){ratio=Math.max(.65,ratio-.15);resize();}perfFrames=0;perfStart=now;}
  schedule();
 }catch(e){fail(e);stop();}
}
async function start(){
 if(!navigator.gpu)throw Error('WebGPU is unavailable.');
 const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw Error('No compatible GPU was found.');
 renderer=new THREE.WebGPURenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
 ratio=Math.min(devicePixelRatio||1,innerWidth<700?1.25:1.55);
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.10;
 await renderer.init();if(!renderer.backend.isWebGPUBackend)throw Error('Unable to initialize the WebGPU backend.');
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;stage.appendChild(renderer.domElement);
 scene=new THREE.Scene();scene.background=new THREE.Color(0x17191c);scene.environment=environment();scene.environmentIntensity=.82;
 camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.015,10);
 scene.add(new THREE.HemisphereLight(0xd6e6ff,0x554331,1.35));
 light(0xfff1dc,3.2,v(-.85,1.65,-.8),true);light(0x8cbfff,2.4,v(1.1,.65,-.1));light(0xffb67f,2.1,v(.15,1.2,.85));
 const backdrop=new THREE.Mesh(new THREE.PlaneGeometry(10,10),new THREE.MeshStandardMaterial({color:0x23272b,roughness:.93,metalness:0}));
 backdrop.position.set(0,.55,.72);backdrop.rotation.y=Math.PI;backdrop.receiveShadow=true;scene.add(backdrop);
 sim=new Simulator(renderer);await sim.init();particles=new ParticleRenderer(sim);scene.add(particles.object);
 resize();direct(0);status.textContent='Initializing particle field…';
 window.addEventListener('resize',resize);
 renderer.domElement.addEventListener('pointerdown',e=>{pointerDown=true;renderer.domElement.setPointerCapture(e.pointerId);});
 renderer.domElement.addEventListener('pointerup',()=>{pointerDown=false;});
 renderer.domElement.addEventListener('pointercancel',()=>{pointerDown=false;});
 renderer.domElement.addEventListener('pointermove',e=>{if(!pointerDown)return;raycaster.setFromCamera(new THREE.Vector2(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2),camera);const p=v();if(raycaster.ray.intersectPlane(plane,p))sim.setMouseRay(raycaster.ray.origin.clone(),raycaster.ray.direction.clone(),p);});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else schedule();});
 document.querySelector('#pause').onclick=e=>{paused=!paused;e.target.textContent=paused?'resume':'pause';if(paused)stop();else schedule();};
 document.querySelector('#new').onclick=()=>location.reload();
 document.querySelector('#full').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{}};
 document.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='h')document.body.classList.toggle('clean');if(e.code==='Space'){e.preventDefault();document.querySelector('#pause').click();}});
 if(params.has('clean'))document.body.classList.add('clean');
 const dev=renderer.backend.device;if(dev?.lost)dev.lost.then(info=>{stop();fail(Error(info.message||'Graphics device lost. Reload to restart.'));});
 window.sculptureStatus=()=>({frame,age,particles:conf.particles,backend:'WebGPU',pixelRatio:ratio,paused});
 schedule();
}
start().catch(fail);
