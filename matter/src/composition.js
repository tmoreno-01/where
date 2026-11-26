// Low-frequency projected density pressure. CPU work is bounded at 64*64 operations.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function compositionField(distribution){
 const result=Array.from({length:64},()=>[0,0]);
 if(!Array.isArray(distribution)||distribution.length!==64||distribution.some(x=>!Number.isFinite(x)||x<0))return result;
 const potential=new Array(64).fill(0);
 for(let y=0;y<8;y++)for(let x=0;x<8;x++){
  let sum=0,w=0;
  for(let j=0;j<8;j++)for(let i=0;i<8;i++){
   const g=Math.exp(-((i-x)**2+(j-y)**2)/3.2);
   sum+=distribution[j*8+i]*g;w+=g;
  }
  potential[y*8+x]=sum/Math.max(w,.001)*64;
 }
 const at=(x,y)=>potential[clamp(y,0,7)*8+clamp(x,0,7)];
 for(let y=0;y<8;y++)for(let x=0;x<8;x++){
  const fx=clamp((at(x-1,y)-at(x+1,y))*.42,-.72,.72);
  const fy=clamp((at(x,y-1)-at(x,y+1))*.42,-.72,.72);
  // A crowded outer band returns to the interior; empty edges remain accessible.
  const excess=clamp((at(x,y)-1.05)*.24,0,.36);
  result[y*8+x]=[clamp(fx+(x===0?excess:x===7?-excess:0),-.85,.85),clamp(fy+(y===0?excess:y===7?-excess:0),-.85,.85)];
 }
 return result;
}
export function compositionMetrics(d){
 if(!d||d.length!==64)return {interior:0,edgeMass:0,occupied:0};
 let interior=0,edgeMass=0,occupied=0;
 for(let y=0;y<8;y++)for(let x=0;x<8;x++){
  const p=d[y*8+x];if(x===0||x===7||y===0||y===7)edgeMass+=p;else interior+=p;
  if(p>=.006)occupied++;
 }
 return {interior,edgeMass,occupied:occupied/64};
}