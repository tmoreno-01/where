import * as THREE from 'three/webgpu';
const q = new URLSearchParams(location.search);
const mobile = matchMedia('(pointer:coarse)').matches || innerWidth < 700;
const quality = q.get('quality') || (mobile ? 'mobile' : 'standard');
const initialAspect = Math.max(.45,Math.min(2.4,innerWidth/Math.max(1,innerHeight)));
const gridX = Math.round(Math.max(32,Math.min(120,initialAspect*60+4))/4)*4;
const count=quality==='mobile'?12000:quality==='low'?24000:quality==='medium'?100000:quality==='high'?200000:300000;
const shape=q.get('shape')==='spheres'?'spheres':q.get('shape')==='rods'?'rods':'capsules';
export const conf = {
  maxParticles:mobile?Math.max(60000,count):300000, particles:count, quality, mobile, shape, spheres:shape==='spheres', capsules:shape==='capsules', densityOnly:q.get('color')==='density', paletteMode:q.get('palette')==='acid'?1:q.get('palette')==='ember'?2:0, memory:q.get('memory')!=='off', nerves:q.get('nerves')!=='off', learn:q.get('learn')!=='off',
  gridX, gridY:64, gridZ:48,
  bloom:false, run:true, noise:0.80, speed:0.68, stiffness:3, restDensity:1,
  density:1.05, dynamicViscosity:0.12, gravity:0,
  gravitySensorReading:new THREE.Vector3(),accelerometerReading:new THREE.Vector3(),
  actualSize:1, size:1.27, points:false,
  updateParams(){const level=Math.max(this.particles/8192,1);this.actualSize=1.6/Math.pow(level,1/3)*this.size;this.restDensity=0.25*level*this.density*(64*64*64)/(this.gridX*this.gridY*this.gridZ);}
};
conf.updateParams();
