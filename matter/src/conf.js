import * as THREE from 'three/webgpu';
const q = new URLSearchParams(location.search);
const mobile = matchMedia('(pointer:coarse)').matches || innerWidth < 700;
const quality = q.get('quality') || (mobile ? 'low' : 'standard');
const initialAspect = Math.max(.45,Math.min(2.4,innerWidth/Math.max(1,innerHeight)));
const gridX = Math.round(Math.max(32,Math.min(120,initialAspect*60+4))/4)*4;
export const conf = {
  maxParticles: quality==='high'?65536:quality==='low'?12288:32768,
  particles: quality==='high'?65536:quality==='low'?12288:32768,
  gridX, gridY:64, gridZ:48,
  bloom:false, run:true, noise:0.75, speed:0.95, stiffness:3, restDensity:1,
  density:1.15, dynamicViscosity:0.13, gravity:0,
  gravitySensorReading:new THREE.Vector3(),accelerometerReading:new THREE.Vector3(),
  actualSize:1, size:0.94, points:false,
  updateParams(){const level=Math.max(this.particles/8192,1);this.actualSize=1.6/Math.pow(level,1/3)*this.size;this.restDensity=0.25*level*this.density*(64*64*64)/(this.gridX*this.gridY*this.gridZ);}
};
conf.updateParams();
