#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uRes;
uniform float uTime,uYaw,uPitch,uMix,uPulse,uMaterial;
uniform vec4 uA,uB;
uniform vec3 uTouch;
uniform int uFamilyA,uFamilyB,uSteps;
const float PI=3.14159265;
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
float smax(float a,float b,float k){return -smin(-a,-b,k);}
float sphere(vec3 p,float r){return length(p)-r;}
float torus(vec3 p,float R,float r){return length(vec2(length(p.xz)-R,p.y))-r;}
float capsule(vec3 p,vec3 a,vec3 b,float r){vec3 d=b-a;float t=clamp(dot(p-a,d)/dot(d,d),0.,1.);return length(p-a-d*t)-r;}
vec3 warp(vec3 p,vec4 a){
 float t=uTime;
 p.xz=rot(.48*sin(p.y*1.7+t*.31+a.x)+.18*p.y)*p.xz;
 p.xy=rot(.21*sin(p.z*2.1+t*.24+a.y))*p.xy;
 p+=.075*sin(p.yzx*3.1+vec3(a.z,a.w,a.x)+t*.24);
 return p;
}
float field(vec3 p,int family,vec4 a){
 vec3 q=warp(p,a);float t=uTime;
 float k=.16+.075*sin(a.w+t*.19);
 float d=10.;
 if(family==0){
  // A molten body with mobile lobes, necks and satellite droplets.
  for(int i=0;i<6;i++){
   float f=float(i),ph=f*2.39996+a.x;
   vec3 c=vec3(cos(ph+t*.19+sin(t*.21+f)*.5)*(.72+.19*sin(f+t*.32+a.y)),sin(ph*1.43+t*.25+a.z)*.76,sin(ph+t*.17)*.62);
   float r=.38+.20*(.5+.5*sin(f*3.7+t*.42+a.w));
   d=smin(d,sphere(q-c,r),k);
  }
  vec3 r=q;r.xy=rot(.65+a.y*.19+t*.1)*r.xy;
  d=smin(d,torus(r,.73,.13+.09*sin(t*.35+a.z)),.21);
  float hole=length((q-vec3(.05,.04,0.))*vec3(1.,1.,.63))-(.34+.12*sin(t*.27+a.y));
  d=smax(d,-hole,.12);
 }else if(family==1){
  // Interleaved twisted ribbons, open rings and welded junctions.
  vec3 r=q;r.xy=rot(.72+a.x*.13)*r.xy;
  float theta=atan(r.z,r.x);
  r.y+=.34*sin(theta*3.+t*.49+a.z);
  d=torus(r,.83+.08*sin(t*.21+a.w),.18+.09*sin(theta*2.+t*.39+a.x));
  vec3 v=q;v.yz=rot(1.1+a.y*.15+t*.12)*v.yz;v.xz=rot(.6)*v.xz;
  float th=atan(v.z,v.x);v.y+=.24*cos(th*2.-t*.36+a.w);
  d=smin(d,torus(v,.67,.15+.07*cos(th*3.+t*.33)),.16);
  vec3 w=q-vec3(0.,.12,0.);w.xy=rot(1.2)*w.xy;w.yz=rot(.8+t*.09)*w.yz;
  d=smin(d,torus(w,.51,.12+.07*sin(t*.29+a.y)),.13);
  d=smin(d,sphere(q-vec3(.48*sin(t*.4+a.x),.61,.24),.29),.16);
 }else{
  // A perforated cast with continuously opening windows and branching bridges.
  vec3 g=q;g.y*=.89;
  d=(length(g*vec3(.91,1.,1.1))-1.05)*.89;
  for(int i=0;i<6;i++){
   float f=float(i),ph=f*2.39996+a.x+t*.11;
   vec3 c=vec3(cos(ph)*.81,sin(ph*1.34+a.y)*.71,sin(ph)*.75);
   float r=.38+.12*sin(f*2.1+t*.34+a.z);
   d=smax(d,-sphere(q-c,r),.105);
  }
  vec3 c1=vec3(-.92,.12,.08),c2=vec3(.75,.72,.28);
  d=smin(d,capsule(q,c1,vec3(.1,-.75,.42),.12),.12);
  d=smin(d,capsule(q,c2,vec3(.1,.15,-.88),.13),.12);
  vec3 v=q;v.xy=rot(.65+a.w*.1)*v.xy;v.yz=rot(.9)*v.yz;
  d=smax(d,-(length(v.xz)-.30),.08);
 }
 return d;
}
float scene(vec3 p){
 float dist=length(p-uTouch);
 vec3 delta=p-uTouch;
 p-=delta/max(dist,.08)*exp(-dist*dist*2.6)*uPulse*.23;
 float a=field(p,uFamilyA,uA);
 if(uMix<.001)return a;
 float b=field(p,uFamilyB,uB);
 return mix(a,b,uMix);
}
vec3 normalAt(vec3 p){
 const float e=.0022;vec2 k=vec2(1.,-1.);
 return normalize(k.xyy*scene(p+k.xyy*e)+k.yyx*scene(p+k.yyx*e)+k.yxy*scene(p+k.yxy*e)+k.xxx*scene(p+k.xxx*e));
}
float panel(vec3 r,vec3 d,float sharp){return pow(max(dot(r,normalize(d)),0.),sharp);}
vec3 environment(vec3 r,float rough){
 vec3 env=mix(vec3(.19,.18,.17),vec3(.91,.94,1.0),smoothstep(-.35,.75,r.y));
 env*=.48+.52*smoothstep(-.13,.1,r.y);
 float s=mix(45.,7.,rough);
 env+=vec3(4.8,4.65,4.3)*panel(r,vec3(-.75,.72,-.42),s*.55);
 env+=vec3(3.4,3.8,4.3)*panel(r,vec3(.78,.37,.52),s);
 env+=vec3(1.8,1.55,1.18)*panel(r,vec3(.2,.95,.18),s*.65);
 // Thin white studio strip and contrasting dark card.
 float strip=exp(-pow((r.x+.18)*mix(22.,6.,rough),2.))*smoothstep(.12,.4,r.y)*smoothstep(.2,.6,-r.z);
 env+=vec3(3.8)*strip;
 env*=1.-.77*panel(r,vec3(.13,.1,-1.),mix(13.,4.,rough));
 return env;
}
float occlusion(vec3 p,vec3 n){
 float ao=0.;
 for(int i=1;i<=3;i++){float h=.055*float(i);ao+=max(0.,h-scene(p+n*h))*.86/float(i);}
 return clamp(1.-ao*3.0,.24,1.);
}
float shadow(vec3 p,vec3 l){
 float res=1.,t=.07;
 for(int i=0;i<18;i++){
  float h=scene(p+l*t);
  res=min(res,9.*max(h,0.)/t);
  t+=clamp(h*.65,.035,.28);
  if(res<.025||t>3.4)break;
 }
 return clamp(res,.08,1.);
}
vec3 surface(vec3 p,vec3 n,vec3 rd){
 float heat=.5+.5*sin(p.x*4.3+p.y*3.1+sin(p.z*4.8+uTime*.3)*1.4+uTime*.35);
 float m=uMaterial;
 vec3 tint=vec3(.86,.92,1.);float metal=.99,rough=.10;
 if(m>.5&&m<1.5){tint=vec3(1.,.48,.22);rough=.14;}
 else if(m>1.5&&m<2.5){tint=vec3(.30,.36,.42);rough=.09;}
 else if(m>2.5&&m<3.5){tint=vec3(.92,.87,.78);metal=.05;rough=.29;}
 else if(m>3.5){float phase=smoothstep(.30,.66,heat);tint=mix(vec3(.88,.91,.95),vec3(.91,.39,.13),phase);rough=mix(.08,.25,phase);metal=mix(.99,.72,phase);}
 vec3 r=reflect(rd,n);
 float fres=pow(1.-max(dot(n,-rd),0.),5.);
 vec3 F=mix(mix(vec3(.04),tint,metal),vec3(1.),fres);
 vec3 reflected=environment(r,rough)*F;
 float ao=occlusion(p,n);
 float light=.24+.76*max(dot(n,normalize(vec3(-.7,1.,-.5))),0.);
 vec3 diffuse=tint*(1.-metal)*light;
 return (reflected+diffuse)*(.40+.60*ao)+vec3(.09,.018,0.)*pow(heat,14.)*step(3.5,m);
}
vec2 bound(vec3 ro,vec3 rd){
 float b=dot(ro,rd),c=dot(ro,ro)-2.05*2.05,h=b*b-c;
 if(h<0.)return vec2(1.,-1.);
 h=sqrt(h);return vec2(-b-h,-b+h);
}
void main(){
 vec2 uv=(2.*gl_FragCoord.xy-uRes)/min(uRes.x,uRes.y);
 vec3 ro=vec3(4.45*cos(uPitch)*sin(uYaw),4.45*sin(uPitch),4.45*cos(uPitch)*cos(uYaw));
 vec3 f=normalize(-ro),right=normalize(cross(f,vec3(0,1,0))),up=cross(right,f);
 vec3 rd=normalize(f*2.75+right*uv.x+up*uv.y);
 // Neutral cyclorama with a subtle light falloff.
 vec3 col=vec3(.82,.805,.775)*(1.-.10*min(dot(uv,uv),2.));
 float floorT=rd.y<-.0001?(-1.48-ro.y)/rd.y:1e4;
 vec3 floorP=ro+rd*floorT;
 if(floorT>0.&&floorT<18.){
  float dist=length(floorP.xz);
  float sh=1.-.36*exp(-dist*dist*.84);
  if(dist<2.0)sh*=.60+.40*shadow(floorP+vec3(0,.025,0),normalize(vec3(-.7,1.,-.5)));
  col=mix(col,vec3(.81,.795,.766)*sh,1.-smoothstep(7.,17.,floorT));
 }
 vec2 limits=bound(ro,rd);
 float t=max(limits.x,0.),end=min(limits.y,floorT);
 bool hit=false;
 if(t<end){
  for(int i=0;i<112;i++){
   if(i>=uSteps||t>end)break;
   float d=scene(ro+rd*t);
   if(d<.0018+t*.00016){hit=true;break;}
   t+=max(.001,d*.48);
  }
 }
 if(hit){vec3 p=ro+rd*t;vec3 n=normalAt(p);col=surface(p,n,rd);}
 // Filmic compression and display encoding.
 col=max(col,0.);col=col*(1.+col/5.0)/(1.+col);
 col=pow(clamp(col,0.,1.),vec3(.454545));
 fragColor=vec4(col,1.);
}