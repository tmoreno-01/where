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
float scene(vec3 p){
 vec4 g=genome();float t=uTime;
 vec3 d0=p-uTouch;p-=d0/max(length(d0),.1)*exp(-dot(d0,d0)*3.2)*uPulse*.15;
 vec3 q=warp(p,g);
 // An asymmetric, elongated armature, with an arcing spine and a swollen lower root.
 vec3 c=q;c.xy=rot(.32+.22*sin(g.x+t*.09))*c.xy;
 float e=ell(c-vec3(-.18,.07,.02),vec3(1.18,.83,.78));
 vec3 r=q-vec3(.31,.11,-.02);r.xy=rot(.84+.36*sin(g.y))*r.xy;r.yz=rot(.45+.22*sin(t*.13))*r.yz;
 float ph=atan(r.z,r.x);
 r.y+=.32*sin(ph*2.+g.x+t*.17)+.10*sin(ph*5.-t*.23+g.w);
 float arc=torus(r,.81,.32+.09*sin(ph*3.+g.z));
 e=smin(e,arc,.27);
 vec3 tip=q-vec3(.51,-.54,.19);tip.xy=rot(-.65+sin(g.w)*.32)*tip.xy;
 e=smin(e,ell(tip,vec3(.91,.31,.38)),.22);
 vec3 upper=q-vec3(-.37,.66,-.18);upper.xy=rot(.75+sin(g.z)*.25)*upper.xy;
 e=smin(e,ell(upper,vec3(.76,.34,.30)),.19);
 // Large voids in the cast; their orientations change independently.
 vec3 h=q-vec3(.04,.04,.06);h.xz=rot(.8+g.x*.17)*h.xz;h.xy=rot(.44+t*.075)*h.xy;
 e=smax(e,-ell(h,vec3(.30+.095*sin(t*.14+g.y),.88,.39)),.11);
 vec3 h2=q-vec3(-.63,.25,.12);h2.yz=rot(g.z*.24+t*.1)*h2.yz;
 e=smax(e,-ell(h2,vec3(.32,.30,.81)),.10);
 if(e>.095)return e;
 vec3 ch=chem(p);
 float concentration=ch.y,heat=ch.z;
 // Nested, warped sheets. Phase modulation makes the openings uneven,
 // so there is no single repeated unit-cell or uniform lattice.
 vec3 w=q*vec3(5.7,6.7,5.1);
 w+=.70*sin(q.zxy*3.6+g.xyz+vec3(t*.22,t*.14,-t*.19));
 float v1=gyro(w+vec3(g.x*.7,g.y*.65,t*.17));
 float v2=gyro(w*1.73+1.1*sin(w.yzx*.49+g.zwx)+vec3(-t*.14,g.w,t*.11));
 float v3=gyro(w*.54+vec3(g.z,t*.12,g.y));
 float molten=smoothstep(-.45,.75,v3+concentration*.85);
 float thickness=mix(.13,.54,molten)+heat*.11;
 float sheet=(abs(v1+.22*sin(w.x*.67+w.z*.28)) - thickness)/10.8;
 float filaments=(abs(v2)-(.095+.15*heat))/19.6;
 // Intersection of secondary sheets with the main sheets forms branching
 // narrow conduits; larger fluid seams remain connected through the cast.
 float lace=smax(filaments,abs(v1+.12)/10.8-.085,.012);
 float seams=(abs(v1)-.79)/10.8;
 seams=smax(seams,(-v3-.13)/7.0,.025);
 float structure=smin(sheet,lace,.023);
 structure=smin(structure,seams,.031);
 // Small windows cut through thicker junctions without erasing the armature.
 float cut=(abs(v2+v3*.32)-.22)/19.6;
 structure=smax(structure,-cut,.012*(1.-molten));
 float body=smax(e,structure,.035);
 // Fluid exterior ridges welded to a local subset of the porous surface.
 float skin=abs(e+.022)-(.025+.052*molten);
 skin=smax(skin,(.16-v3)/7.0,.028);
 body=smin(body,skin,.029);
 return body*.73;
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
 vec3 c=chem(p);vec4 g=genome();vec3 q=warp(p,g);
 float ribbons=.5+.5*sin(q.x*18.+q.y*13.+sin(q.z*9.+uTime*.16)*2.2);
 float heat=clamp(c.z*.88+c.y*.41+.18*ribbons,0.,1.);
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
  metal=mix(.99,.70,phase);
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
 float b=dot(ro,rd),c=dot(ro,ro)-2.15*2.15,h=b*b-c;if(h<0.)return vec2(1.,-1.);h=sqrt(h);return vec2(-b-h,-b+h);
}
void main(){
 vec2 uv=(2.*gl_FragCoord.xy-uRes)/min(uRes.x,uRes.y);
 vec3 ro=vec3(4.9*cos(uPitch)*sin(uYaw),4.9*sin(uPitch),4.9*cos(uPitch)*cos(uYaw));
 vec3 f=normalize(-ro),right=normalize(cross(f,vec3(0,1,0))),up=cross(right,f);
 vec3 rd=normalize(f*3.05+right*uv.x+up*uv.y);
 vec3 col=mix(vec3(.042,.047,.053),vec3(.145,.151,.156),exp(-dot(uv,uv)*.72));
 float floorT=rd.y<-.0001?(-1.72-ro.y)/rd.y:1e4;
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
   t+=max(.0022,d*.84);
  }
 }
 if(hit){vec3 p=ro+rd*t;vec3 n=normalAt(p);col=surface(p,n,rd);}
 col=max(col,0.);col=(col*(2.51*col+.03))/(col*(2.43*col+.59)+.14);
 fragColor=vec4(pow(clamp(col,0.,1.),vec3(.454545)),1.);
}