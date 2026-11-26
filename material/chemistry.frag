#version 300 es
precision highp float;
precision highp int;
out vec4 fragColor;
uniform sampler2D uState;
uniform int uInit;
uniform float uClock,uPulse,uFeed;
uniform vec3 uTouch;
const int N=48;
ivec2 atlas(ivec3 p){p=clamp(p,ivec3(0),ivec3(N-1));return ivec2((p.z%8)*N+p.x,(p.z/8)*N+p.y);}
vec4 at(ivec3 p){return texelFetch(uState,atlas(p),0);}
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
void main(){
 ivec2 v=ivec2(gl_FragCoord.xy);ivec3 i=ivec3(v.x%N,v.y%N,v.x/N+8*(v.y/N));
 vec3 p=(vec3(i)+.5)/float(N)*4.0-2.0;
 if(uInit==1){
  float wave=sin(p.x*7.4)*cos(p.y*6.1)+sin(p.y*7.1)*cos(p.z*6.2)+sin(p.z*7.2)*cos(p.x*6.3);
  float seed=smoothstep(.36,.78,wave)*(.48+.15*hash(vec3(i)));
  fragColor=vec4(1.-seed*.55,seed,.12+.6*seed,1.);return;
 }
 vec4 c=at(i);
 vec4 lap=at(i+ivec3(1,0,0))+at(i-ivec3(1,0,0))+at(i+ivec3(0,1,0))+at(i-ivec3(0,1,0))+at(i+ivec3(0,0,1))+at(i-ivec3(0,0,1))-6.*c;
 float flow=.5+.5*sin(p.y*1.7+p.z*1.1+uClock*.11);
 float feed=.029+.010*flow+.004*uFeed;
 float kill=.058+.005*sin(p.x*1.9-p.z*.7+uClock*.065);
 float react=c.x*c.y*c.y;
 float pulse=uPulse*exp(-dot(p-uTouch,p-uTouch)*12.);
 float A=c.x+.80*(.16*lap.x-react+feed*(1.-c.x)-pulse*.018);
 float B=c.y+.80*(.081*lap.y+react-(kill+feed)*c.y+pulse*.035);
 float heat=c.z+.80*(.055*lap.z+(clamp(B*2.5+react*1.8+pulse*.6,0.,1.)-c.z)*.035);
 fragColor=vec4(clamp(A,0.,1.),clamp(B,0.,1.),clamp(heat,0.,1.),1.);
}