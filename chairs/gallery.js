import * as THREE from 'three';
export function gallery(scene){
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(2000,2000),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.89,metalness:0}));
 floor.rotation.x=-Math.PI/2;floor.position.y=-.006;floor.receiveShadow=true;scene.add(floor);
}
export function softboxes(renderer){
 const rig=new THREE.Scene();rig.background=new THREE.Color(.46,.46,.46);
 const emit=(w,h,p,value,tint)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color(...tint).multiplyScalar(value),side:THREE.DoubleSide,toneMapped:false}));m.position.set(...p);m.lookAt(0,0,0);rig.add(m);};
 emit(9,7,[-7,10,6],3.4,[1,.96,.90]);emit(6,10,[7,5,-5],2.3,[.91,.96,1]);emit(10,4,[0,12,-3],2.6,[1,1,1]);emit(4,7,[1,3,10],.85,[1,1,1]);
 const pmrem=new THREE.PMREMGenerator(renderer);const result=pmrem.fromScene(rig,.035);pmrem.dispose();rig.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});return result;
}
export async function loadWood(models){
 const root='https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/wood_table_001/';
 const loader=new THREE.TextureLoader(),get=n=>loader.loadAsync(root+n);
 const maps=await Promise.allSettled([get('wood_table_001_diff_1k.jpg'),get('wood_table_001_nor_gl_1k.jpg'),get('wood_table_001_rough_1k.jpg')]);
 if(maps[0].status!=='fulfilled')return false;
 const diffuse=maps[0].value;diffuse.colorSpace=THREE.SRGBColorSpace;
 const normal=maps[1].status==='fulfilled'?maps[1].value:null,rough=maps[2].status==='fulfilled'?maps[2].value:null;
 for(const t of [diffuse,normal,rough].filter(Boolean)){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;t.repeat.set(1,1);}
 for(const m of new Set(models.map(m=>m.mat))){m.map=diffuse;if(normal){m.normalMap=normal;m.normalScale.set(.23,.23);m.bumpMap=null;}if(rough)m.roughnessMap=rough;m.roughness=.68;m.clearcoatRoughness=.29;m.needsUpdate=true;}return true;
}