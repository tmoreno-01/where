import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
function texture(draw,size=256){const c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d');draw(ctx,size);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;return t;}
function wood(){return texture((c,n)=>{c.fillStyle='#b7a18a';c.fillRect(0,0,n,n);for(let i=0;i<1700;i++){const x=Math.random()*n;const w=.25+Math.random()*1.2;c.strokeStyle='rgba('+ (Math.random()<.5?'60,32,15':'247,222,183')+','+(.04+Math.random()*.19)+')';c.lineWidth=w;c.beginPath();c.moveTo(x,0);for(let y=0;y<=n;y+=16)c.lineTo(x+Math.sin(y*.018+i)*2+Math.sin(y*.067+i)*.6,y);c.stroke();}for(let i=0;i<240;i++){c.fillStyle='rgba(35,23,15,.08)';c.fillRect(Math.random()*n,Math.random()*n,Math.random()*2,Math.random()*24);}});}
function stone(){return texture((c,n)=>{c.fillStyle='#cfc5b4';c.fillRect(0,0,n,n);for(let i=0;i<12000;i++){const a=Math.random();c.fillStyle=a<.5?'rgba(96,78,58,.055)':'rgba(255,255,247,.15)';c.fillRect(Math.random()*n,Math.random()*n,Math.random()*3+1,Math.random()*3+1);}for(let i=0;i<35;i++){let x=Math.random()*n,y=Math.random()*n;c.strokeStyle='rgba(93,77,57,.08)';c.beginPath();c.moveTo(x,y);c.bezierCurveTo(x+9,y-4,x+10,y+14,x+23,y+19);c.stroke();}},512);}
function glass(){return texture((c,n)=>{const g=c.createLinearGradient(0,0,n,n);g.addColorStop(0,'#9baeb5');g.addColorStop(.32,'#44555c');g.addColorStop(.65,'#263438');g.addColorStop(1,'#777c72');c.fillStyle=g;c.fillRect(0,0,n,n);c.fillStyle='rgba(205,226,232,.14)';for(let i=0;i<7;i++){c.beginPath();c.moveTo(i*50-60,0);c.lineTo(i*50-20,0);c.lineTo(i*50-100,n);c.lineTo(i*50-130,n);c.fill();}c.fillStyle='rgba(236,196,131,.08)';c.fillRect(n*.12,n*.35,n*.32,n*.55);});}
function boxGeo(w,h,d,x,y,z){const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);g.userData.colliders=[{p:[x,y,z],q:[0,0,0,1],h:[w/2,h/2,d/2]}];return g;}
function chairBox(w,h,d,x,y,z){const g=new RoundedBoxGeometry(w,h,d,1,Math.min(.009,w*.18,h*.18,d*.18));g.translate(x,y,z);g.userData.colliders=[{p:[x,y,z],q:[0,0,0,1],h:[w/2,h/2,d/2]}];return g;}
function beam(a,b,r1,r2=r1,round=false){a=V(...a);b=V(...b);const d=b.clone().sub(a);const g=round?new THREE.CylinderGeometry(r2,r1,d.length(),12,1):new RoundedBoxGeometry(r1*2,d.length(),r1*2,1,Math.min(.004,r1*.22));const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*.46,uv.getY(i)*Math.max(.55,d.length()*2.4));const q=new THREE.Quaternion().setFromUnitVectors(V(0,1,0),d.clone().normalize()),p=a.add(b).multiplyScalar(.5);g.applyQuaternion(q);g.translate(...p.toArray());g.userData.colliders=[{p:p.toArray(),q:q.toArray(),h:[Math.max(r1,r2),d.length()/2,Math.max(r1,r2)]}];return g;}
function tube(points,r){const path=new THREE.CatmullRomCurve3(points.map(p=>V(...p)));const g=new THREE.TubeGeometry(path,Math.max(8,points.length*3),r,8,false);g.userData.colliders=[];const n=Math.max(3,points.length);for(let i=0;i<n;i++){const a=path.getPoint(i/n),b=path.getPoint((i+1)/n),d=b.clone().sub(a),q=new THREE.Quaternion().setFromUnitVectors(V(0,1,0),d.clone().normalize());g.userData.colliders.push({p:a.add(b).multiplyScalar(.5).toArray(),q:q.toArray(),h:[r,d.length()/2+r*.25,r]});}return g;}
function join(gs){const expanded=gs.map(x=>x.index?x.toNonIndexed():x);const g=mergeGeometries(expanded,false);g.userData.colliders=gs.flatMap(x=>x.userData.colliders||[]);expanded.forEach((x,i)=>{if(x!==gs[i])x.dispose();});gs.forEach(x=>x.dispose());return g;}
export function chairModels(){
 const woodMap=wood();const bump=woodMap.clone();bump.colorSpace=THREE.NoColorSpace;bump.needsUpdate=true;const mat=new THREE.MeshPhysicalMaterial({map:woodMap,bumpMap:bump,bumpScale:.006,roughness:.54,metalness:0,clearcoat:.30,clearcoatRoughness:.28});
 const cloth=new THREE.MeshStandardMaterial({roughness:.94,map:texture((c,n)=>{c.fillStyle='#c7bfb4';c.fillRect(0,0,n,n);for(let i=0;i<n;i+=3){c.fillStyle='rgba(40,30,20,.10)';c.fillRect(i,0,1,n);c.fillRect(0,i,n,1);}})});
 const models=[];
 for(let style=0;style<24;style++){
  const w=.36+(style%7)*.025,d=.36+((style*3)%8)*.018,h=.37+((style*5)%9)*.031,seatY=-.035,backZ=-d*.46,th=.020+(style%5)*.004,round=style%3===1||style%4===2;
  const upholstered=[3,6,9,11,14,17,21,23].includes(style),arms=[5,9,13,19,23].includes(style);
  const parts=[];const seat=[chairBox(w,.065,d,0,seatY,0)];
  if([4,8,12,20].includes(style)){seat.length=0;for(let k=0;k<6;k++)seat.push(chairBox(w/6-.003,.045,d,-w/2+w/12+k*w/6,seatY,0));seat.push(chairBox(w,.045,.035,0,seatY-.012,-d*.43),chairBox(w,.045,.035,0,seatY-.012,d*.43));}
  const back=[],top=h+.04;for(const x of [-w*.43,w*.43])back.push(beam([x,seatY,backZ],[x*1.04,top,backZ-.06],th,th*.85,round));
  if(style%4===1){back.push(tube([[-w*.45,.11,backZ],[-w*.49,top-.035,backZ-.04],[0,top+.07,backZ-.06],[w*.49,top-.035,backZ-.04],[w*.45,.11,backZ]],th));for(let j=-2;j<=2;j++)back.push(beam([j*w*.14,.11,backZ],[j*w*.16,top+.015,backZ-.06],.012,.009,true));}
  else if(style%4===2){back.push(chairBox(w*.90,.058,.044,0,top-.025,backZ-.05));for(let j=0;j<5;j++)back.push(beam([(j-2)*w*.145,.065,backZ],[(j-2)*w*.15,top-.045,backZ-.05],.012,.01,true));back.push(chairBox(w*.83,.043,.036,0,.095,backZ));}
  else{for(let j=0;j<(style%3)+2;j++){const yy=.13+j*(top-.12)/((style%3)+1);back.push(chairBox(w*.90,.044+(style%2)*.019,.042,0,yy,backZ-.05*(yy/top)));}}
  if(arms)for(const x of [-w*.54,w*.54]){back.push(beam([x,.18,d*.32],[x,.23,backZ],.023,.025,true),beam([x,seatY,d*.28],[x,.18,d*.32],.019,.019,true));}
  parts.push({geo:join(seat),anchor:V(0,seatY,0),cloth:false});parts.push({geo:join(back),anchor:V(0,top*.5,backZ),cloth:false});
  for(let j=0;j<4;j++){const x=(j%2?1:-1)*w*.40,z=(j<2?1:-1)*d*.40,xx=x*(style%2?1.17:1.06),zz=z*1.13;const gs=[beam([x,seatY-.02,z],[xx,-.49,zz],th,th*.66,round)];if(style%3===1&&j<2)gs.push(beam([x,-.23,z],[x,-.23,-z],.013,.013,true));else if(style%3!==1&&j===0)gs.push(beam([x,-.24,z],[-x,-.24,z],.013,.013,round));parts.push({geo:join(gs),anchor:V(x,-.25,z),cloth:false});}
  const pad=upholstered?chairBox(w*.92,.055+(style%3)*.013,d*.90,0,seatY+.055,0):null;
  const finish=mat.clone();finish.roughness=.39+(style%5)*.075;finish.clearcoat=.16+(style%4)*.095;models.push({parts,pad,mat:finish,cloth,upholstered});
 }
 return models;
}
export function facade(scene){
 const tex=stone(),bump=tex.clone();bump.colorSpace=THREE.NoColorSpace;bump.needsUpdate=true;const stoneMat=new THREE.MeshStandardMaterial({map:tex,bumpMap:bump,bumpScale:.025,color:0xf4eee2,roughness:.88}),trim=new THREE.MeshStandardMaterial({map:tex,bumpMap:bump,bumpScale:.014,color:0xfff8e8,roughness:.82}),dark=new THREE.MeshStandardMaterial({color:0x353b3c,roughness:.75}),iron=new THREE.MeshStandardMaterial({color:0x24282a,metalness:.55,roughness:.5}),glassMat=new THREE.MeshStandardMaterial({map:glass(),roughness:.26,metalness:.15}),roof=new THREE.MeshStandardMaterial({color:0x414c55,roughness:.91});
 const batches=new Map();function add(g,m){if(!batches.has(m))batches.set(m,[]);batches.get(m).push(g);}function B(w,h,d,x,y,z,m=stoneMat){add(boxGeo(w,h,d,x,y,z),m);}function rod(a,b,r,m=iron){add(beam(a,b,r,r,true),m);}
 B(34,18,.7,0,9,-.52);B(34,.45,.55,0,.27,.05,trim);B(34,.35,.65,0,17.78,.02,trim);
 // Alternating horizontal stone courses and vertical joints.
 for(let floor=0;floor<4;floor++){const fy=1.2+floor*4.1;for(let row=0;row<9;row++){const y=fy+row*.43;for(let j=-13;j<=13;j++){const x=j*1.28+(row%2)*.64;B(1.264,.419,.07,x,y,-.125,row%4===0?trim:stoneMat);}}}
 for(let f=0;f<4;f++){const y=2.75+f*4.1;B(34,.18,.38,0,y-1.65,.02,trim);B(34,.10,.44,0,y+1.85,.06,trim);
  for(let col=-4;col<=4;col++){const x=col*3.65,w=1.67,hh=2.72;
   B(w+.32,hh+.32,.14,x,y,.015,trim);B(w,hh,.12,x,y,.13,dark);B(w-.13,hh-.13,.035,x,y,.205,glassMat);
   for(const xx of [-w*.46,0,w*.46])B(.055,hh,.08,x+xx,y,.24,dark);
   for(const yy of [-hh*.46,-.20,.59,hh*.46])B(w,.052,.09,x,y+yy,.245,dark);
   B(w+.48,.16,.47,x,y-hh*.5-.12,.12,trim);B(w+.53,.18,.46,x,y+hh*.5+.13,.11,trim);
   for(const side of [-1,1]){B(.14,hh+.15,.26,x+side*(w*.5+.10),y,.10,trim);B(.27,.21,.39,x+side*(w*.5+.10),y+hh*.5+.22,.14,trim);}
   if(f>0){const wy=y-1.50;B(2.68,.16,.85,x,wy,.46,trim);for(const side of [-1,1]){B(.15,.55,.27,x+side*.96,wy-.34,.2,trim);rod([x+side*1.27,wy+.06,.87],[x+side*1.27,wy+.99,.87],.026);rod([x+side*1.27,wy+.99,.87],[x+side*1.27,wy+.99,.15],.02);}
    for(const yy of [.12,.94])rod([x-1.28,wy+yy,.87],[x+1.28,wy+yy,.87],.023);
    for(let k=-6;k<=6;k++){const xx=x+k*.19;rod([xx,wy+.13,.87],[xx,wy+.94,.87],.013);add(tube([[xx,wy+.24,.89],[xx+.055,wy+.40,.89],[xx,wy+.54,.89],[xx-.055,wy+.69,.89],[xx,wy+.83,.89]],.009),iron);}
   }
  }
 }
 for(let i=-4;i<=4;i++){const x=i*3.65+1.825;B(.30,16,.16,x,8.5,-.015,trim);for(let j=0;j<4;j++){B(.46,.18,.32,x,4.15*j+1.0,.025,trim);B(.40,.30,.24,x,4.15*j+3.75,.025,trim);}}
 // Mansard roof, slate shingle courses, dormers and cornice.
 const roofGeo=new THREE.BoxGeometry(34,4.5,.25);roofGeo.rotateX(-.29);roofGeo.translate(0,19.8,-.70);add(roofGeo,roof);
 for(let y=0;y<13;y++)for(let i=-34;i<=34;i++){const yy=17.8+y*.31,x=i*.50+(y%2)*.25;B(.49,.27,.12,x,yy,-.10-(yy-17.8)*.29,roof);}
 for(let i=-4;i<=4;i++){const x=i*3.65;B(1.75,2.15,.48,x,19.4,-.18,trim);B(1.30,1.62,.14,x,19.35,.12,dark);B(1.20,1.50,.045,x,19.35,.21,glassMat);B(.06,1.5,.06,x,19.35,.26,dark);B(1.22,.055,.06,x,19.50,.26,dark);B(1.95,.16,.65,x,20.49,-.05,trim);}
 B(35,.27,.9,0,17.65,.04,trim);
 for(const [m,gs] of batches){const mesh=new THREE.Mesh(join(gs),m);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);}
 const pavement=new THREE.Mesh(new THREE.PlaneGeometry(80,32),new THREE.MeshStandardMaterial({color:0x89857e,roughness:.97}));pavement.rotation.x=-Math.PI/2;pavement.position.set(0,-.03,8);pavement.receiveShadow=true;scene.add(pavement);
 const curb=new THREE.Mesh(new THREE.BoxGeometry(45,.15,.4),trim);curb.position.set(0,.045,6.5);curb.receiveShadow=true;scene.add(curb);
}