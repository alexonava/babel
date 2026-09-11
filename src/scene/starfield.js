import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Points,
  ShaderMaterial,
  Vector3,
} from "three";
import { celestialTier, createCelestialClock, seededRandom } from "./solar-body.js";
export const STAR_COUNTS = Object.freeze({ high: 4200, balanced: 2600, low: 1200 });
export function makeStarGeometry(seed = 92717) {
  const random = seededRandom(seed),
    positions = [],
    colors = [],
    sizes = [],
    phases = [];
  for (let i = 0; i < STAR_COUNTS.high; i++) {
    const y = -0.08 + random() * 1.08,
      azimuth = random() * Math.PI * 2,
      r = Math.sqrt(1 - y * y);
    positions.push(r * Math.cos(azimuth) * 180, y * 180, r * Math.sin(azimuth) * 180);
    const magnitude = Math.pow(random(), 6),
      temperature = random();
    const color =
      temperature < 0.16 ? [1, 0.78, 0.59] : temperature > 0.78 ? [0.72, 0.84, 1] : [1, 0.96, 0.89];
    const intensity = 0.13 + magnitude * 0.65;
    colors.push(...color.map((c) => c * intensity));
    sizes.push(1.25 + magnitude * 2.0);
    phases.push(random() * Math.PI * 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new Float32BufferAttribute(phases, 1));
  geometry.computeBoundingSphere();
  return geometry;
}
export function createStarfield({ parent, camera, profile = {} }) {
  const clock = createCelestialClock(),
    center = new Vector3();
  const material = new ShaderMaterial({
    name: "CelestialStars",
    vertexColors: true,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    fog: false,
    blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 }, uVisibility: { value: 1 } },
    vertexShader: `
      attribute float aSize;attribute float aPhase;
      uniform float uTime;uniform float uPixelRatio;uniform float uVisibility;
      varying vec3 vColor;
      void main(){
        float altitude=position.y/180.0;
        float extinction=smoothstep(.015,.36,altitude);
        float twinkle=1.0+.075*sin(uTime*(.65+.24*sin(aPhase))+aPhase)
                          +.035*sin(uTime*1.17+aPhase*7.0);
        vColor=color*extinction*twinkle*uVisibility;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
        gl_PointSize=aSize*uPixelRatio;
      }`,
    fragmentShader: `
      varying vec3 vColor;
      void main(){
        float r=length(gl_PointCoord-.5)*2.0;
        float light=exp(-r*r*2.8)*(1.0-smoothstep(.6,1.0,r));
        gl_FragColor=vec4(vColor,light);
        #include <colorspace_fragment>
      }`,
  });
  const root = new Points(makeStarGeometry(), material);
  root.name = "celestial-starfield";
  root.renderOrder = 0;
  root.frustumCulled = false;
  parent.add(root);
  let disposed = false,
    tier = celestialTier(profile);
  const controller = {
    lifecycleOrder: 31,
    root,
    get tier() {
      return tier;
    },
    applyQuality(next = {}, { pixelRatio = material.uniforms.uPixelRatio.value } = {}) {
      if (disposed) return false;
      material.uniforms.uPixelRatio.value = pixelRatio;
      tier = celestialTier(next);
      root.geometry.setDrawRange(0, STAR_COUNTS[tier]);
      return true;
    },
    resize({ pixelRatio = material.uniforms.uPixelRatio.value } = {}) {
      if (disposed) return false;
      material.uniforms.uPixelRatio.value = Math.max(0.5, pixelRatio);
      return true;
    },
    update({ elapsedSeconds = 0, reducedMotion = false, visibilityScale = 1 } = {}) {
      if (disposed) return false;
      material.uniforms.uTime.value = clock.tick(elapsedSeconds, reducedMotion);
      material.uniforms.uVisibility.value = visibilityScale;
      if (camera) {
        camera.getWorldPosition(center);
        parent.worldToLocal(center);
        root.position.copy(center);
      }
      return true;
    },
    dispose() {
      if (disposed) return false;
      disposed = true;
      root.removeFromParent();
      root.geometry.dispose();
      material.dispose();
      return true;
    },
  };
  controller.applyQuality(profile);
  return controller;
}
