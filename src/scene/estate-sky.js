import { BackSide, Color, ShaderMaterial } from "three";

// Density lives on the existing fixed world-space sky shell, never camera-facing
// cards. No extra render pass or image request; the baseline branch is retained.
export function createEstateSkyMaterial(config) {
  return new ShaderMaterial({
    side: BackSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      topColor: { value: new Color(config.skyTopColor) },
      bottomColor: { value: new Color(config.skyBottomColor) },
      glowColor: { value: new Color(config.skyGlowColor) },
      sunDirection: { value: config.sunDirection },
      sunColor: { value: new Color(config.sunColor) },
      uTime: { value: 0 },
      uFilm: { value: 0 },
      uClouds: { value: 1 },
    },
    vertexShader: `
varying vec3 vWorldPosition;
void main() {
vec4 p = modelMatrix * vec4(position, 1.0);
vWorldPosition = p.xyz;
gl_Position = projectionMatrix * viewMatrix * p;
}`,
    fragmentShader: `
uniform vec3 topColor, bottomColor, glowColor, sunDirection, sunColor;
uniform float uTime, uFilm, uClouds;
varying vec3 vWorldPosition;
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) {
vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
float cloud(vec2 p) { return noise(p)*.57+noise(p*2.07+11.3)*.28+noise(p*4.19-3.7)*.15; }
void main() {
vec3 direction=normalize(vWorldPosition);
float h=normalize(vWorldPosition+vec3(0,40,0)).y;
vec3 col=mix(bottomColor,topColor,smoothstep(-.2,.7,h));
float glow=smoothstep(.02,.7,1.0-distance(direction.xz,vec2(0)));
col+=glowColor*glow*.031;
float sunDot=max(0.0,dot(direction,sunDirection));
col+=sunColor*(pow(sunDot,8.0)*.225+pow(sunDot,32.0)*.152);
if (uFilm>.5) {
float altitude=direction.y;
col=mix(vec3(.19,.205,.278),vec3(.023,.03,.071),smoothstep(-.10,.72,altitude));
vec2 p=direction.xz*3.8+vec2(direction.y*2.2, direction.y*.8);
float density=cloud(p+vec2(uTime*.00035,0));
float lace=cloud(p*2.6+vec2(17.2,-9.1));
float veil=smoothstep(.43,.79,density)*smoothstep(-.09,.13,altitude);
veil*=uClouds*(1.0-smoothstep(.72,.98,altitude));
float silver=smoothstep(.47,.73,lace)*.045;
col=mix(col,vec3(.24,.258,.327)+silver,veil*.38);
col+=vec3(.012,.014,.022)*exp(-pow((altitude-.04)*7.0,2.0));
}
gl_FragColor=uFilm>.5?vec4(col*${config.shellOpacity},1.):vec4(col,${config.shellOpacity});
}`,
  });
}
