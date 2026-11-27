import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {Colony} from './colony.js?v=1';
import {chairModels,facade} from './models.js?v=1';
const $=id=>document.getElementById(id),stage=$('stage'),status=$('status');
const mobile=matchMedia('(pointer:coarse)').matches||innerWidth<700,COUNT=mobile?360:760;
const scene=new THREE.Scene();scene.background=new THREE.Color(0xb6c5cd);scene.fog=new THREE.FogExp2(0xc1cbd0,.009);
const camera=new THREE.PerspectiveCamera(39,1,.1,140);camera.position.set(12.5,10.5,28.5);
let renderer,controls,colony,groups=[],paused=matchMedia('(prefers-reduced-motion: reduce)').matches,activity=1,raf=0,last=0,frame=0,dead=false,visible=true,quality=mobile?1:Math.min(devicePixelRatio,1.65),fps=0,perf=0,perfFrames=0,slow=0;
const mat=new THREE.Matrix4(),pos=new THREE.Vector3(),scale=new THREE.Vector3(),quat=new THREE.Quaternion(),q2=new THREE.Quaternion(),euler=new THREE.Euler(),col=new THREE.Color(),anchor=new THREE.Vector3();
const palette=['#55351f','#83502b','#a16b39','#c18c4b','#6c4329','#bb9565','#412d23','#996039','#b77b43','#75503a','#d0ab74','#674933'].map(c=>new THREE.Color(c));
const textile=['#80392a','#8c7850','#4e5b43','#b08c68','#4b3e35','#a39c84'].map(c=>new THREE.Color(c));
const smooth=t=>t*t*(3-2*t),mix=(a,b,t)=>a+(b-a)*t;
function pose(a){const j=a.job;if(!j){return {p:colony.position(a.site),r:a.rot};}const t=Math.min(1,j.age/j.duration),s=smooth(t),lift=Math.sin(Math.PI*t);return {p:[mix(j.from[0],j.to[0],s),mix(j.from[1],j.to[1],s)+lift*.45,mix(j.from[2],j.to[2],s)+lift*(j.lift-Math.max(j.from[2],j.to[2]))],r:j.rot.map((v,i)=>mix(v,j.endRot[i],s)+Math.sin(t*Math.PI*2)*.22)};}
function colorFor(a,p){const n=a.partColors[p],base=palette[Math.min(palette.length-1,Math.floor(a.color*palette.length))];return col.copy(base).lerp(palette[Math.min(palette.length-1,Math.floor(n*palette.length))],.36);}
function transform(a,p,model){
 const ap=pose(a);pos.set(...ap.p);quat.setFromEuler(euler.set(...ap.r));scale.setScalar(a.scale);
 const ex=a.exchange;
 if(ex&&ex.part===p){const other=ex.a===a?ex.b:ex.a,op=pose(other),t=smooth(Math.min(1,ex.age/ex.duration)),arch=Math.sin(Math.PI*t),part=model.parts[p];anchor.copy(part.anchor).multiplyScalar(a.scale).applyQuaternion(quat);const aWorld=pos.clone().add(anchor);
 q2.setFromEuler(euler.set(...op.r));const oAnchor=part.anchor.clone().multiplyScalar(other.scale).applyQuaternion(q2),bWorld=new THREE.Vector3(...op.p).add(oAnchor);
 // Route exchanged pieces on opposite sides of a raised arc.
 const sign=ex.a===a?1:-1;const world=aWorld.lerp(bWorld,t);world.z+=arch*ex.arc;world.y+=arch*.46*sign;world.x+=arch*.20*sign;
 quat.slerp(q2,t);scale.setScalar(mix(a.scale,other.scale,t));anchor.copy(part.anchor).multiplyScalar(scale.x).applyQuaternion(quat);pos.copy(world).sub(anchor);
 }
 mat.compose(pos,quat,scale);return mat;
}
function setupInstances(){const models=chairModels();groups=models.map((model,style)=>{const list=colony.agents.filter(a=>a.style===style);const parts=model.parts.map(part=>{const m=new THREE.InstancedMesh(part.geo,model.mat,list.length);m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);m.castShadow=true;m.receiveShadow=true;m.frustumCulled=false;scene.add(m);return m;});let pad=null;if(model.pad){pad=new THREE.InstancedMesh(model.pad,model.cloth,list.length);pad.instanceMatrix.setUsage(THREE.DynamicDrawUsage);pad.castShadow=true;pad.receiveShadow=true;pad.frustumCulled=false;scene.add(pad);}return {model,list,parts,pad};});}
function updateInstances(){for(const g of groups){for(let i=0;i<g.list.length;i++){const a=g.list[i];for(let p=0;p<6;p++){g.parts[p].setMatrixAt(i,transform(a,p,g.model));const ex=a.exchange;let colorAgent=a;if(ex&&ex.part===p&&ex.age/ex.duration>.5)colorAgent=ex.a===a?ex.b:ex.a;g.parts[p].setColorAt(i,colorFor(colorAgent,p));}if(g.pad){g.pad.setMatrixAt(i,transform(a,0,g.model));g.pad.setColorAt(i,textile[Math.floor(a.color*textile.length)%textile.length]);}}for(const m of g.parts){m.instanceMatrix.needsUpdate=true;m.instanceColor.needsUpdate=true;}if(g.pad){g.pad.instanceMatrix.needsUpdate=true;g.pad.instanceColor.needsUpdate=true;}}}
function resize(){if(!renderer)return;const w=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight);renderer.setPixelRatio(quality);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();if(paused&&!dead){controls.update();renderer.render(scene,camera);}}
function stop(){cancelAnimationFrame(raf);raf=0;last=0;perf=0;perfFrames=0;}
function schedule(){if(!raf&&!paused&&!dead&&visible&&!document.hidden)raf=requestAnimationFrame(loop);}
function loop(now){raf=0;if(paused||dead||!visible||document.hidden)return;const dt=last?Math.min(.05,(now-last)/1000):1/60;last=now;colony.step(dt,activity);updateInstances();controls.update();renderer.render(scene,camera);frame++;if(!perf)perf=now;perfFrames++;if(now-perf>2500){fps=perfFrames*1000/(now-perf);if(fps<30)slow++;else slow=0;if(slow>=2&&quality>.75){quality=Math.max(.75,quality-.15);resize();slow=0;}const s=colony.snapshot();$('readout').textContent=s.chairs+' chairs / '+(s.moving+s.exchanges)+' active';$('stats').textContent=s.events.moves+' relocations · '+s.events.parts+' exchanged components';perf=now;perfFrames=0;}schedule();}
function setPause(v){paused=v;$('pause').textContent=v?'Play':'Pause';if(v)stop();else schedule();}
function init(){renderer=new THREE.WebGLRenderer({antialias:!mobile,powerPreference:'high-performance'});renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;stage.insertBefore(renderer.domElement,stage.firstChild);
 const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();scene.environment=pmrem.fromScene(room,.04).texture;scene.environmentIntensity=.52;room.dispose();pmrem.dispose();
 scene.add(new THREE.HemisphereLight(0xe5f2ff,0x8c7964,2.1));const sun=new THREE.DirectionalLight(0xffe5c3,3.1);sun.position.set(-12,24,18);sun.castShadow=true;sun.shadow.mapSize.set(mobile?1024:2048,mobile?1024:2048);Object.assign(sun.shadow.camera,{left:-15,right:15,top:18,bottom:-15,near:.5,far:65});sun.shadow.normalBias=.032;sun.shadow.bias=-.00016;sun.target.position.set(0,8,1);scene.add(sun,sun.target);
 facade(scene);colony=new Colony(COUNT);setupInstances();updateInstances();
 controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,8.65,1.3);controls.enableDamping=true;controls.dampingFactor=.08;controls.minDistance=13;controls.maxDistance=43;controls.minPolarAngle=.70;controls.maxPolarAngle=1.67;controls.minAzimuthAngle=-.78;controls.maxAzimuthAngle=.78;controls.enablePan=false;controls.update();controls.addEventListener('change',()=>{if(paused&&!dead)renderer.render(scene,camera);});
 let down=null;renderer.domElement.addEventListener('pointerdown',e=>down=[e.clientX,e.clientY]);renderer.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>6)return;const r=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2),camera);const plane=new THREE.Plane(new THREE.Vector3(0,0,1),-2.8),p=new THREE.Vector3();if(ray.ray.intersectPlane(plane,p))colony.disturb(p.toArray());down=null;});
 renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();dead=true;stop();status.hidden=false;status.textContent='Graphics context lost. Reload to restart.';});
 new ResizeObserver(resize).observe(stage);new IntersectionObserver(([e])=>{visible=e.isIntersecting;if(visible)schedule();else stop();}).observe(stage);resize();renderer.render(scene,camera);status.hidden=true;setPause(paused);
}
$('pause').onclick=()=>setPause(!paused);$('activity').oninput=e=>activity=Number(e.target.value);$('rebuild').onclick=()=>{if(!colony)return;colony.reset();for(const g of groups)g.list=colony.agents.filter(a=>a.style===g.list[0].style);updateInstances();if(paused)renderer.render(scene,camera);};$('full').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{}};$('about').onclick=()=>{$('infoPanel').hidden=!$('infoPanel').hidden;};$('close').onclick=()=>$('infoPanel').hidden=true;document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else schedule();});
window.chairStatus=()=>({fps,quality,frame,paused,dead,...colony?.snapshot()});
try{init();}catch(e){dead=true;console.error(e);status.hidden=false;status.textContent='Could not initialise the 3D artwork: '+e.message;}
