import * as THREE from 'three';
export function gallery(scene){
 const wall=new THREE.MeshStandardMaterial({color:0xf3f1ee,roughness:.96}),floor=new THREE.MeshStandardMaterial({color:0xe7e5e0,roughness:.68});
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d');c.fillStyle='#b9b9b9';c.fillRect(0,0,256,256);for(let i=0;i<9000;i++){let v=145+Math.random()*58;c.fillStyle='rgb('+v+','+v+','+v+')';c.fillRect(Math.random()*256,Math.random()*256,1.5,1.5);}
 const bump=new THREE.CanvasTexture(canvas);bump.wrapS=bump.wrapT=THREE.RepeatWrapping;bump.repeat.set(24,24);floor.bumpMap=bump;floor.bumpScale=.009;
 function box(w,h,d,x,y,z,m){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);mesh.receiveShadow=true;scene.add(mesh);}
 box(100,.22,100,0,-.11,0,floor);box(100,24,.35,0,12,-15,wall);box(.35,24,55,-18,12,11,wall);box(.35,24,55,18,12,11,wall);
 const trim=new THREE.MeshStandardMaterial({color:0xe4e1dc,roughness:.95});box(36,.08,.09,0,.04,-14.78,trim);box(36,.22,10,0,20,-10,wall);
 const panel=new THREE.MeshBasicMaterial({color:0xfffdf7});for(let i=0;i<3;i++)box(7.5,.035,3.3,(i-1)*10,19.86,-8,panel);
}
export async function loadWood(models){
 const root='https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/wood_table_001/';
 const loader=new THREE.TextureLoader(),get=n=>loader.loadAsync(root+n);
 const maps=await Promise.allSettled([get('wood_table_001_diff_1k.jpg'),get('wood_table_001_nor_gl_1k.jpg'),get('wood_table_001_rough_1k.jpg')]);
 if(maps[0].status!=='fulfilled')return false;
 const diffuse=maps[0].value;diffuse.colorSpace=THREE.SRGBColorSpace;
 const normal=maps[1].status==='fulfilled'?maps[1].value:null,rough=maps[2].status==='fulfilled'?maps[2].value:null;
 for(const t of [diffuse,normal,rough].filter(Boolean)){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;t.repeat.set(.85,.85);}
 for(const m of new Set(models.map(m=>m.mat))){m.map=diffuse;if(normal){m.normalMap=normal;m.normalScale.set(.35,.35);m.bumpMap=null;}if(rough)m.roughnessMap=rough;m.roughness=.75;m.clearcoat=.26;m.clearcoatRoughness=.36;m.needsUpdate=true;}return true;
}