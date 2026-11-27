// A spatially coupled velocity field. No position or orientation is overwritten.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),TAU=Math.PI*2;
const mag=(x,y,z)=>Math.hypot(x,y,z);
const hash=(x,y,z)=>x+','+y+','+z;
export class Collective {
 constructor(){this.time=0;this.phase=0;this.next=0;this.epoch=0;this.density=0;this.mode='fold';this.axis=[0,1,0];this.rng=Math.random;this.pulse=0;}
 step(points,dt,activity=1,focus=null){
  this.time+=dt;const t=this.time;this.phase+=dt*(.22+.16*activity);
  if(t>=this.next){this.epoch++;this.next=t+12+this.rng()*18;const modes=['fold','braid','divide','gather'];const choices=modes.filter(x=>x!==this.mode);this.mode=choices[Math.floor(this.rng()*choices.length)];this.axis=[Math.cos(this.phase*.67),.35*Math.sin(this.phase*.9),Math.sin(this.phase*.67)];}
  const out=new Map();if(!points.length)return out;
  const centre=[0,0,0],mean=[0,0,0];for(const s of points){for(let k=0;k<3;k++){centre[k]+=s.p[k];mean[k]+=s.v[k];}}for(let k=0;k<3;k++){centre[k]/=points.length;mean[k]/=points.length;}
  const grid=new Map(),size=1.35;for(const s of points){const cell=s.p.map(x=>Math.floor(x/size));s.cell=cell;const k=hash(...cell);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(s);}
  const phase=this.phase,ax=Math.cos(phase*.33),az=Math.sin(phase*.33),wave=.5+.5*Math.sin(phase*.7);
  let density=0;
  for(const s of points){
   const [x,y,z]=s.p,[vx,vy,vz]=s.v,[ix,iy,iz]=s.cell;let n=0,w=0,cx=0,cy=0,cz=0,mx=0,my=0,mz=0,rx=0,ry=0,rz=0,signal=0;
   for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(let k=-1;k<=1;k++){const cell=grid.get(hash(ix+i,iy+j,iz+k));if(!cell)continue;for(const b of cell){if(b===s)continue;const dx=b.p[0]-x,dy=b.p[1]-y,dz=b.p[2]-z,r=mag(dx,dy,dz);if(r>1.65||r<1e-5)continue;const q=1-r/1.65;n++;w+=q;cx+=dx*q;cy+=dy*q;cz+=dz*q;mx+=(b.v[0]-vx)*q;my+=(b.v[1]-vy)*q;mz+=(b.v[2]-vz)*q;signal+=(b.signal||0)*q;if(r<.43){const f=(.43-r)/r;rx-=dx*f;ry-=dy*f;rz-=dz*f;}}}
   density+=n;const den=Math.max(.25,w),px=x-centre[0],py=y-centre[1],pz=z-centre[2],rad=mag(px,py,pz),projection=px*ax+pz*az;
   // Dense regions rotate, thin regions seek the nearest material. A travelling
   // wave reverses circulation through the pile, coupling distant neighbourhoods.
   const localPhase=phase+projection*.65+py*.32,drive=Math.sin(localPhase),side=Math.tanh(projection*1.15);
   const densityDrive=clamp((n-3)/9,0,1),social=clamp(signal/den,0,1),trait=s.trait||.5;
   let fx=cx/den*(.85+.36*(1-densityDrive))+mx/den*.52+rx*.8,
       fy=cy/den*(.85+.36*(1-densityDrive))+my/den*.52+ry*.8,
       fz=cz/den*(.85+.36*(1-densityDrive))+mz/den*.52+rz*.8;
   // Continuous field, not keyframed positions. The different flows compete
   // with contact forces and with the local alignment response.
   const circulation=(.24+.34*drive+.16*social)*(this.mode==='braid'?1.45:1);
   fx+=(-pz*.48+py*az*.40)*circulation;fz+=(px*.48-py*ax*.40)*circulation;fy+=(pz*ax-px*az)*.38*circulation;
   const branch=(this.mode==='divide'?1.25:this.mode==='gather'?-.42:.38)*(.45+.55*wave);
   fx+=ax*side*branch;fz+=az*side*branch;fy+=Math.sin(localPhase*1.2+trait*.7)*(.36+.28*densityDrive);
   if(this.mode==='fold'){fx+=az*Math.sin(py*.8+phase)*.54;fz-=ax*Math.sin(py*.8+phase)*.54;}
   if(this.mode==='braid'){fy+=side*.46*Math.cos(phase*.8);fx+=az*side*.23;fz-=ax*side*.23;}
   // Keep one cohesive, suspended installation; centre restoring force is soft.
   const targetY=3.05+.24*Math.sin(phase*.45),radius=points.length>150?2.45:1.85;
   const outside=Math.max(0,rad-radius);const restore=.12+outside*.48;
   fx-=px*restore;fy-=py*restore;fz-=pz*restore;
   fx-=centre[0]*.46+mean[0]*.26;fy+=(targetY-centre[1])*.72-mean[1]*.27;fz-=centre[2]*.46+mean[2]*.26;
   if(y<.72)fy+=(.72-y)*2.8;
   if(focus){const dx=x-focus[0],dy=y-focus[1],dz=z-focus[2],r=mag(dx,dy,dz),f=.72*Math.exp(-r*r*.65);fx+=dx*f;fy+=dy*f;fz+=dz*f;}
   // Bound desired acceleration and let Rapier resolve all contacts.
   fx-=vx*.15;fy-=vy*.15;fz-=vz*.15;const gain=.55+.48*activity,limit=1.65+.3*activity,L=Math.max(1,mag(fx,fy,fz)*gain/limit);
   const energy=clamp(.26*Math.abs(drive)+.29*social+.25*densityDrive+.20*clamp(mag(vx,vy,vz),0,1),0,1);
   out.set(s.id,{f:[fx*gain/L,fy*gain/L,fz*gain/L],torque:[Math.sin(localPhase+trait)*.06,Math.cos(localPhase*.7+trait*TAU)*.09,Math.sin(phase+py*.5)*.055],energy,signal:clamp(.68*(s.signal||0)+.23*social+.09*energy,0,1),neighbours:n});
  }
  this.density=density/points.length;return out;
 }
}