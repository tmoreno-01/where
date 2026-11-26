#version 300 es
precision highp float;
precision highp int;
out vec4 fragColor;
uniform vec2 uRes;
uniform float uTime,uYaw,uPitch,uMix,uPulse,uMaterial;
uniform vec4 uA,uB;
uniform vec3 uTouch;
uniform int uFamilyA,uFamilyB,uSteps;
uniform sampler2D uChem;
const float PI=3.14159265;
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
float smax(float a,float b,float k){return -smin(-a,-b,k);}
float ell(vec3 p,vec3 r){return (length(p/r)-1.)*min(r.x,min(r.y,r.z));}
float torus(vec3 p,float R,float r){return length(vec2(length(p.xz)-R,p.y))-r;}
vec3 chem(vec3 p){
 vec3 v=clamp((p+2.)*.25*48.-.5,0.,47.);
 float z0=floor(v.z),z1=min(z0+1.,47.);
 vec2 tile0=vec2(mod(z0,8.),floor(z0/8.))*48.;
 vec2 tile1=vec2(mod(z1,8.),floor(z1/8.))*48.;
 return mix(texture(uChem,(tile0+v.xy+.5)/vec2(384.,288.)).rgb,texture(uChem,(tile1+v.xy+.5)/vec2(384.,288.)).rgb,fract(v.z));
}
float gyro(vec3 p){return dot(sin(p),cos(p.yzx));}
vec3 warp(vec3 p,vec4 g){
 float t=uTime;
 p.xz=rot(.56*sin(p.y*1.38+t*.18+g.x)+.34*p.y)*p.xz;
 p.xy=rot(.27*sin(p.z*1.9-t*.14+g.y))*p.xy;
 p+=.13*sin(p.yzx*2.9+g.zwx+vec3(t*.13,-t*.17,t*.12));
 p+=.043*sin(p.zxy*7.1+g.wxy-t*.19);
 return p;
}
// Continuous parameter genome, no interpolation between separate preset silhouettes.
vec4 genome(){return mix(uA,uB,uMix);}
uniform vec4 uBodies[16],uMeta[16],uAxes[16],uLinkA[12],uLinkB[12],uDrops[28];
uniform int uLinks,uDropCount;
vec3 frame(vec3 p,vec3 axis){vec3 ref=abs(axis.y)<.9?vec3(0,1,0):vec3(1,0,0);vec3 x=normalize(cross(axis,ref));return vec3(dot(p,x),dot(p,axis),dot(p,cross(x,axis)));}
float objectField(vec3 p,int i){
 vec4 b=uBodies[i],m=uMeta[i];float r=b.w;vec3 q=frame((p-b.xyz)/r,uAxes[i].xyz);
 float broad=(length(q)-2.05)*r;
 if(broad>.10)return broad;
 q.xz=rot(.48*sin(q.y*2.+m.y)+.48*q.y)*q.xz;q+=.10*sin(q.yzx*3.7+m.y);
 float heat=m.z,d;
 if(m.x<.5){d=ell(q,vec3(1.18,.83,.86));d=smin(d,ell(q-vec3(.52,.36,.13),vec3(.78,.55,.56)),.23);d=smin(d,ell(q+vec3(.43,.47,.18),vec3(.65,.72,.52)),.18);d=smax(d,-(length(q.xz+vec2(.16,-.1))-(.22+.08*sin(m.y))),.12);}
 else if(m.x<1.5){float a=atan(q.z,q.x);vec3 v=q;v.y+=.41*sin(a*3.+m.y);d=torus(v,.78,.19+.065*sin(a*4.+m.y));v=q;v.xy=rot(1.2)*v.xy;v.y+=.24*sin(atan(v.z,v.x)*2.-m.y);d=smin(d,torus(v,.65,.135),.10);v=q;v.yz=rot(1.)*v.yz;d=smin(d,torus(v,.53,.115),.10);}
 else if(m.x<2.5){float env=ell(q,vec3(1.02,1.28,.87));vec3 w=q*5.4+.48*sin(q.zxy*3.1+m.y);float f=gyro(w),fine=gyro(w*1.65+1.);d=smax(env,(abs(f)-(.25+.28*heat))/10.,.045);d=smin(d,smax(env,(abs(fine)-.11)/17.,.025),.035);d=smax(d,-(length(q.xz+vec2(.13,.1))-.26),.06);}
 else{float shell=abs(ell(q,vec3(.94,1.2,1.0)))-(.065+.05*heat);float gate=sin(q.y*8.+m.y+q.x*2.)+.65*sin(q.z*5.-m.y);d=smax(shell,gate*.095-.015,.035);vec3 v=q;v.xy=rot(.75)*v.xy;d=smin(d,torus(v,.65,.16),.10);}
 return d*r*.67;
}
float scene(vec3 p){
 float d=10.;for(int i=0;i<16;i++){float broad=length(p-uBodies[i].xyz)-uBodies[i].w*2.05;if(broad<d+.10)d=smin(d,objectField(p,i),.035);}
 for(int i=0;i<12;i++){if(i>=uLinks)break;vec4 a=uLinkA[i],b=uLinkB[i];vec3 delta=b.xyz-a.xyz;float ll=max(dot(delta,delta),.0001);float t=clamp(dot(p-a.xyz,delta)/ll,0.,1.);vec3 centre=mix(a.xyz,b.xyz,t);float bd=length(p-centre)-a.w*2.7;if(bd<d+.05){vec3 axis=normalize(delta+vec3(.00001));vec3 n=normalize(cross(axis,abs(axis.y)<.9?vec3(0,1,0):vec3(1,0,0)));vec3 k=cross(axis,n);float phase=t*16.+b.w+uTime*.9;float rad=a.w*(.62+.30*sin(t*PI)+.16*sin(phase));float f=length(p-centre)-rad;vec3 coil=centre+(n*cos(phase)+k*sin(phase))*a.w*1.3;f=smin(f,length(p-coil)-a.w*.34,.012);d=smin(d,f,.026);}}
 for(int i=0;i<28;i++){if(i>=uDropCount)break;vec4 a=uDrops[i];d=smin(d,length(p-a.xyz)-a.w,.009);}
 return d;
}
vec3 normalAt(vec3 p){
 float e=.0020;vec2 k=vec2(1.,-1.);
 vec3 n=k.xyy*scene(p+k.xyy*e)+k.yyx*scene(p+k.yyx*e)+k.yxy*scene(p+k.yxy*e)+k.xxx*scene(p+k.xxx*e);
 return n/max(length(n),.00001);
}
float panel(vec3 r,vec3 d,float sharp){return pow(max(dot(r,normalize(d)),0.),sharp);}
vec3 environment(vec3 r,float rough){
 vec3 env=mix(vec3(.07,.08,.10),vec3(.48,.51,.57),smoothstep(-.45,.65,r.y));
 float sharp=mix(56.,9.,rough);
 env+=vec3(7.5,7.2,6.9)*panel(r,vec3(-.72,.64,.46),sharp*.42);
 env+=vec3(3.4,4.8,6.1)*panel(r,vec3(.87,.28,-.29),sharp*.80);
 env+=vec3(3.2,2.4,1.5)*panel(r,vec3(.24,.85,-.67),sharp*.55);
 float strip=exp(-pow((r.x+.14)*mix(28.,6.,rough),2.))*smoothstep(-.28,.25,r.y)*smoothstep(.1,.45,r.z);
 env+=vec3(6.2)*strip;
 float strip2=exp(-pow((r.z+.36)*mix(20.,5.,rough),2.))*smoothstep(.05,.55,-r.x);
 env+=vec3(2.9,3.6,4.4)*strip2;
 env*=1.-.83*panel(r,vec3(.14,.06,1.),mix(15.,4.,rough));
 return env;
}
float occlusion(vec3 p,vec3 n){
 float a=0.;
 for(int i=1;i<=4;i++){float h=.035*float(i);a+=max(0.,h-scene(p+n*h))*.9/float(i);}
 return clamp(1.-a*5.1,.17,1.);
}
vec3 surface(vec3 p,vec3 n,vec3 rd){
 vec3 c=chem(p);vec3 q=p;float nearest=10.,kind=0.,localHeat=0.;for(int i=0;i<16;i++){float d=length(p-uBodies[i].xyz)-uBodies[i].w;if(d<nearest){nearest=d;kind=uMeta[i].x;localHeat=uMeta[i].z;}}
 float ribbons=.5+.5*sin(q.x*18.+q.y*13.+sin(q.z*9.+uTime*.16)*2.2);
 float heat=clamp(c.z*.34+c.y*.23+localHeat*.60+.12*ribbons,0.,1.);
 float phase=smoothstep(.23,.60,heat);
 float fine=sin(q.x*94.+sin(q.y*46.+q.z*38.)*2.4)*sin(q.z*80.-q.y*51.);
 float rough=.085+.10*phase+.022*fine;
 vec3 tint=vec3(.89,.94,1.);float metal=.98;
 float m=uMaterial;
 if(m>.5&&m<1.5){tint=vec3(.96,.46,.20);rough+=.055;}
 else if(m>1.5&&m<2.5){tint=vec3(.32,.40,.48);rough+=.02;}
 else if(m>2.5&&m<3.5){tint=vec3(.88,.84,.75);metal=.05;rough=.29+.12*phase;}
 else if(m>3.5){
  tint=mix(vec3(.83,.90,1.),vec3(.84,.28,.055),phase);
  rough=mix(.07,.26,phase)+.023*fine;
  metal=mix(.99,.70,phase);if(kind>2.5){tint=mix(vec3(.82,.83,.78),vec3(.35,.09,.035),phase);metal=mix(.08,.65,phase);rough+=.10;}else if(kind>1.5){tint=mix(vec3(.30,.43,.50),vec3(.85,.44,.16),phase);rough+=.07;}else if(kind>.5){tint=mix(vec3(.93,.96,1.),vec3(.42,.50,.64),phase);}
 }
 vec3 r=reflect(rd,n);
 float fres=pow(1.-max(dot(n,-rd),0.),5.);
 vec3 F=mix(mix(vec3(.04),tint,metal),vec3(1.),fres);
 float ao=occlusion(p,n);
 float shadow=1.;
 // Approximate one secondary reflection occlusion ray. This gives the
 // interlocking chrome surfaces internal dark reflections instead of flat chrome.
 float rt=.022;
 for(int i=0;i<10;i++){float d=scene(p+n*.009+r*rt);if(d<.0018){shadow=.31;break;}rt+=clamp(d*.85,.012,.13);if(rt>.52)break;}
 vec3 reflected=environment(r,clamp(rough,.045,.6))*F*(.52+.48*shadow);
 float diffuse=.17+.83*max(dot(n,normalize(vec3(-.72,.85,.4))),0.);
 vec3 emission=vec3(1.7,.19,.014)*pow(heat,6.)*step(3.5,m)*(.55+.45*ribbons);
 return (reflected+tint*(1.-metal)*diffuse)*(.28+.72*ao)+emission;
}
vec2 bound(vec3 ro,vec3 rd){
 float b=dot(ro,rd),c=dot(ro,ro)-3.8*3.8,h=b*b-c;if(h<0.)return vec2(1.,-1.);h=sqrt(h);return vec2(-b-h,-b+h);
}
void main(){
 vec2 uv=(2.*gl_FragCoord.xy-uRes)/min(uRes.x,uRes.y);
 vec3 ro=vec3(7.6*cos(uPitch)*sin(uYaw),7.6*sin(uPitch),7.6*cos(uPitch)*cos(uYaw));
 vec3 f=normalize(-ro),right=normalize(cross(f,vec3(0,1,0))),up=cross(right,f);
 vec3 rd=normalize(f*2.65+right*uv.x+up*uv.y);
 vec3 col=mix(vec3(.042,.047,.053),vec3(.145,.151,.156),exp(-dot(uv,uv)*.72));
 float floorT=rd.y<-.0001?(-2.9-ro.y)/rd.y:1e4;
 if(floorT>0.&&floorT<20.){
  vec3 fp=ro+rd*floorT;float pool=exp(-dot(fp.xz,fp.xz)*.68);
  vec3 floorCol=vec3(.086,.090,.096)*(1.-.64*pool);
  floorCol+=vec3(.045,.034,.023)*exp(-dot(fp.xz-vec2(.5,.1),fp.xz-vec2(.5,.1))*.85);
  col=mix(col,floorCol,1.-smoothstep(6.,19.,floorT));
 }
 vec2 limits=bound(ro,rd);
 float t=max(limits.x,0.),end=min(limits.y,floorT);
 bool hit=false;
 if(t<end){
  for(int i=0;i<200;i++){
   if(i>=uSteps||t>end)break;
   float d=scene(ro+rd*t);
   if(d<.0015+t*.00013){hit=true;break;}
   t+=max(.0020,d*.76);
  }
 }
 if(hit){vec3 p=ro+rd*t;vec3 n=normalAt(p);col=surface(p,n,rd);}
 col=max(col,0.);col=(col*(2.51*col+.03))/(col*(2.43*col+.59)+.14);
 fragColor=vec4(pow(clamp(col,0.,1.),vec3(.454545)),1.);
}