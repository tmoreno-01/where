import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {RGBELoader} from 'three/addons/loaders/RGBELoader.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {PhysicsColony,initPhysics} from './physics.js?v=4';
import {Colony} from './colony.js?v=4';
import {chairModels} from './models.js?v=3';
import {gallery,loadWood} from './gallery.js?v=4';
const $=id=>document.getElementById(id),stage=$('stage'),status=$('status');
const mobile=matchMedia('(pointer:coarse)').matches||innerWidth<700,COUNT=mobile?180:420;
const scene=new THREE.Scene();scene.background=new THREE.Color(0xf1efeb);
const camera=new THREE.PerspectiveCamera(39,1,.1,140);camera.position.set(8.2,6.0,19.8);
let renderer,controls,colony,physics,models,composer,ao,hdrLoaded=false,woodLoaded=false,groups=[],paused=matchMedia('(prefers-reduced-motion: reduce)').matches,activity=1,raf=0,last=0,frame=0,dead=false,visible=true,quality=mobile?1:Math.min(devicePixelRatio,1.65),fps=0,perf=0,perfFrames=0,slow=0;
const mat=new THREE.Matrix4(),pos=new THREE.Vector3(),scale=new THREE.Vector3(),quat=new THREE.Quaternion(),q2=new THREE.Quaternion(),euler=new THREE.Euler(),col=new THREE.Color(),anchor=new THREE.Vector3();
const palette=['#55351f','#83502b','#a16b39','#c18c4b','#6c4329','#bb9565','#412d23','#996039','#b77b43','#75503a','#d0ab74','#674933'].map(c=>new THREE.Color(c));
const textile=['#80392a','#8c7850','#4e5b43','#b08c68','#4b3e35','#a39c84'].map(c=>new THREE.Color(c));
const smooth=t=>t*t*(3-2*t),mix=(a,b,t)=>a+(b-a)*t;
function colorFor(a,p){return col.copy(palette[Math.min(palette.length-1,Math.floor(a.partColors[p]*palette.length))]);}
function transform(a,p,model){const t=physics.partWorld(a,p);quat.copy(t.q);scale.setScalar(a.scale);pos.copy(t.p).sub(anchor.copy(model.parts[p].anchor).multiplyScalar(a.scale).applyQuaternion(quat));mat.compose(pos,quat,scale);return mat;}
function render(){if(composer)composer.render();else renderer.render(scene,camera);}
function setupInstances(){groups=models.map((model,style)=>{const list=colony.agents.filter(a=>a.style===style);const parts=model.parts.map(part=>{const m=new THREE.InstancedMesh(part.geo,model.mat,list.length);m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);m.castShadow=true;m.receiveShadow=true;m.frustumCulled=false;scene.add(m);return m;});let pad=null;if(model.pad){pad=new THREE.InstancedMesh(model.pad,model.cloth,list.length);pad.instanceMatrix.setUsage(THREE.DynamicDrawUsage);pad.castShadow=true;pad.receiveShadow=true;pad.frustumCulled=false;scene.add(pad);}return {model,list,parts,pad};});}
function updateInstances(){for(const g of groups){for(let i=0;i<g.list.length;i++){const a=g.list[i];for(let p=0;p<6;p++){g.parts[p].setMatrixAt(i,transform(a,p,g.model));g.parts[p].setColorAt(i,colorFor(a,p));}if(g.pad){g.pad.setMatrixAt(i,transform(a,0,g.model));g.pad.setColorAt(i,textile[Math.floor(a.color*textile.length)%textile.length]);}}for(const m of g.parts){m.instanceMatrix.needsUpdate=true;m.instanceColor.needsUpdate=true;}if(g.pad){g.pad.instanceMatrix.needsUpdate=true;g.pad.instanceColor.needsUpdate=true;}}}
function resize(){if(!renderer)return;const w=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight);renderer.setPixelRatio(quality);renderer.setSize(w,h,false);if(composer){composer.setPixelRatio(quality);composer.setSize(w,h);}camera.aspect=w/h;camera.updateProjectionMatrix();if(paused&&!dead){controls.update();render();}}
function stop(){cancelAnimationFrame(raf);raf=0;last=0;perf=0;perfFrames=0;}
function schedule(){if(!raf&&!paused&&!dead&&visible&&!document.hidden)raf=requestAnimationFrame(loop);}
function loop(now){raf=0;if(paused||dead||!visible||document.hidden)return;const dt=last?Math.min(.05,(now-last)/1000):1/60;last=now;physics.step(dt,activity);updateInstances();controls.update();render();frame++;if(!perf)perf=now;perfFrames++;if(now-perf>2500){fps=perfFrames*1000/(now-perf);if(fps<30)slow++;else slow=0;if(slow>=2&&quality>.75){quality=Math.max(.75,quality-.15);resize();slow=0;}const s=physics.snapshot();$('readout').textContent=s.chairs+' assemblies / '+s.physics.looseParts+' loose parts';$('stats').textContent=s.physics.mode+' · '+s.physics.collisions+' contacts · '+s.physics.reassemblies+' rebuilt assemblies';perf=now;perfFrames=0;}schedule();}
function setPause(v){paused=v;$('pause').textContent=v?'Play':'Pause';if(v)stop();else schedule();}
async function init(){await initPhysics();renderer=new THREE.WebGLRenderer({antialias:!mobile,powerPreference:'high-performance'});renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.13;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;stage.insertBefore(renderer.domElement,stage.firstChild);
 const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();scene.environment=pmrem.fromScene(room,.04).texture;scene.environmentIntensity=.65;room.dispose();pmrem.dispose();
 new RGBELoader().load('https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr',hdr=>{hdr.mapping=THREE.EquirectangularReflectionMapping;scene.environment=hdr;scene.environmentIntensity=.85;hdrLoaded=true;if(paused)render();},undefined,()=>console.warn('Studio HDR unavailable; using local environment.'));
 scene.add(new THREE.HemisphereLight(0xf8f8ff,0xd3c9bc,.48));const sun=new THREE.DirectionalLight(0xfff4e8,2.15);sun.position.set(-8,17,9);sun.castShadow=true;sun.shadow.mapSize.set(mobile?1024:3072,mobile?1024:3072);Object.assign(sun.shadow.camera,{left:-11,right:11,top:12,bottom:-11,near:.5,far:65});sun.shadow.normalBias=.015;sun.shadow.bias=-.00006;sun.shadow.radius=3;sun.target.position.set(0,4,0);scene.add(sun,sun.target);
 gallery(scene);colony=new Colony(COUNT);models=chairModels();physics=new PhysicsColony(colony,models,mobile);setupInstances();updateInstances();loadWood(models).then(ok=>{woodLoaded=ok;if(ok&&paused&&!dead)render();}).catch(console.warn);
 if(!mobile){composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));ao=new GTAOPass(scene,camera,stage.clientWidth,stage.clientHeight);ao.updateGtaoMaterial({radius:.55,samples:16,distanceExponent:1.3,thickness:.20});ao.blendIntensity=.85;composer.addPass(ao);composer.addPass(new OutputPass());}
 controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,4.25,0);controls.enableDamping=true;controls.dampingFactor=.08;controls.minDistance=9;controls.maxDistance=25;controls.minPolarAngle=.70;controls.maxPolarAngle=1.67;controls.minAzimuthAngle=-.78;controls.maxAzimuthAngle=.78;controls.enablePan=false;controls.update();controls.addEventListener('change',()=>{if(paused&&!dead)render();});
 let down=null;renderer.domElement.addEventListener('pointerdown',e=>down=[e.clientX,e.clientY]);renderer.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>6)return;const r=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2),camera);const plane=new THREE.Plane(new THREE.Vector3(0,0,1),0),p=new THREE.Vector3();if(ray.ray.intersectPlane(plane,p))colony.disturb(p.toArray());down=null;});
 renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();dead=true;stop();status.hidden=false;status.textContent='Graphics context lost. Reload to restart.';});
 new ResizeObserver(resize).observe(stage);new IntersectionObserver(([e])=>{visible=e.isIntersecting;if(visible)schedule();else stop();}).observe(stage);resize();render();status.hidden=true;setPause(paused);
}
$('pause').onclick=()=>setPause(!paused);$('activity').oninput=e=>activity=Number(e.target.value);$('rebuild').onclick=()=>{if(!colony)return;physics.dispose();colony.reset();physics=new PhysicsColony(colony,models,mobile);for(const g of groups)g.list=colony.agents.filter(a=>a.style===g.list[0].style);updateInstances();if(paused)render();};$('full').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{}};$('about').onclick=()=>{$('infoPanel').hidden=!$('infoPanel').hidden;};$('close').onclick=()=>$('infoPanel').hidden=true;document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else schedule();});
window.chairStatus=()=>({fps,quality,frame,paused,dead,hdrLoaded,woodLoaded,...physics?.snapshot()});
init().catch(e=>{dead=true;console.error(e);status.hidden=false;status.textContent='Could not initialise the 3D artwork: '+e.message;});
