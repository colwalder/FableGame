// The frame: scene (MSAA, HDR, with depth) -> half-res ambient occlusion + light
// shafts -> composite -> bloom -> grade -> tone map.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';

const DEPTH_FN = `
  uniform sampler2D tDepth; uniform float near, far; uniform vec2 projK;
  float viewZ(vec2 uv){ float z = texture2D(tDepth, uv).x * 2. - 1.; return 2. * near * far / (far + near - z * (far - near)); }
  vec3 viewPos(vec2 uv){ float z = viewZ(uv); return vec3((uv * 2. - 1.) * z / projK, -z); }
  float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715)))); }
`;

// rgb = light shafts, a = ambient occlusion
const AUX_FS = `
  varying vec2 vUv; uniform sampler2D tScene; uniform vec3 lightA, lightB; uniform float aspect, aoRadius;
  ${DEPTH_FN}
  vec3 shafts(vec3 L, float j){
    if (L.z <= .001) return vec3(0.);
    vec2 delta = (L.xy - vUv) * (.92 / 22.); vec2 p = vUv + delta * j; vec3 acc = vec3(0.); float decay = 1.;
    for (int i = 0; i < 22; i++){
      p += delta;
      if (p.x > 0. && p.x < 1. && p.y > 0. && p.y < 1.) {
        float sky = step(380., viewZ(p));
        acc += min(max(texture2D(tScene, p).rgb - .4, 0.), vec3(1.6)) * sky * decay;
      }
      decay *= .955;
    }
    float reach = max(1. - length((L.xy - vUv) * vec2(aspect, 1.)) * 1.15, 0.);     // shafts die out away from their source
    return acc * (L.z / 22.) * reach * reach;
  }
  void main(){
    float j = ign(gl_FragCoord.xy);
    vec3 p = viewPos(vUv); float ao = 1.;
    if (-p.z < 90.) {
      vec3 n = normalize(cross(dFdx(p), dFdy(p)));
      float rad = aoRadius * projK.y / -p.z * .5, occ = 0.;
      for (int i = 0; i < 10; i++){
        float a = (float(i) + j) * 2.39996, r = sqrt((float(i) + .5) / 10.) * rad;
        vec2 o = vec2(cos(a) / aspect, sin(a)) * r;
        vec3 v = viewPos(vUv + o) - p; float l = length(v);
        occ += max(dot(n, v) / (l + 1e-3) - .12, 0.) / (1. + l * l / (aoRadius * aoRadius) * 2.);
      }
      ao = clamp(1. - occ / 10. * 2.3, 0., 1.);
      ao = mix(ao, 1., smoothstep(35., 90., -p.z));
    }
    gl_FragColor = vec4(shafts(lightA, j) + shafts(lightB, j), ao);
  }`;

const COMP_FS = `
  varying vec2 vUv; uniform sampler2D tScene, tAux; uniform vec2 auxTexel; uniform float aoStrength, shaftStrength;
  void main(){
    vec3 c = texture2D(tScene, vUv).rgb;
    float occ = (texture2D(tAux, vUv + auxTexel * vec2(1., 1.)).a + texture2D(tAux, vUv + auxTexel * vec2(-1., 1.)).a
               + texture2D(tAux, vUv + auxTexel * vec2(1., -1.)).a + texture2D(tAux, vUv + auxTexel * vec2(-1., -1.)).a) * .25;
    // the shafts are soft light in the air: blur them wide so thin occluders don't draw hard lines
    vec3 rays = vec3(0.);
    for (int i = 0; i < 12; i++) { float a = float(i) * 2.39996, r = 2.5 + float(i) * 1.5; rays += texture2D(tAux, vUv + auxTexel * vec2(cos(a), sin(a)) * r).rgb; }
    rays /= 12.;
    float ao = mix(1., occ, aoStrength);
    c *= mix(vec3(ao), vec3(1.), .12) * vec3(1., .97 + .03 * ao, .94 + .06 * ao);   // occluded creases lean cold
    c += rays * shaftStrength;
    gl_FragColor = vec4(c, 1.);
  }`;

class ScenePass extends Pass {
  constructor(scene, camera, samples = 4) {
    super();
    this.scene = scene; this.camera = camera;
    this.rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples, depthTexture: new THREE.DepthTexture(2, 2) });
    this.aux = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false });
    this.auxMat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: AUX_FS, depthTest: false, depthWrite: false,
      uniforms: { tScene: { value: this.rt.texture }, tDepth: { value: this.rt.depthTexture }, near: { value: 0.2 }, far: { value: 900 }, projK: { value: new THREE.Vector2() },
        lightA: { value: new THREE.Vector3() }, lightB: { value: new THREE.Vector3() }, aspect: { value: 1 }, aoRadius: { value: 0.85 } },
    });
    this.compMat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: COMP_FS, depthTest: false, depthWrite: false,
      uniforms: { tScene: { value: this.rt.texture }, tAux: { value: this.aux.texture }, auxTexel: { value: new THREE.Vector2() }, aoStrength: { value: 0.9 }, shaftStrength: { value: 0.7 } },
    });
    this.fsq = new FullScreenQuad(this.auxMat);
    this.sources = [];               // [{ dir: Vector3 (world, unit), strength }]
    this._v = new THREE.Vector4(); this._m = new THREE.Matrix4();
  }
  setSize(w, h) {
    this.rt.setSize(w, h); const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
    this.aux.setSize(hw, hh); this.compMat.uniforms.auxTexel.value.set(0.5 / hw, 0.5 / hh); this.auxMat.uniforms.aspect.value = w / h;
  }
  _project(src, out) {
    out.set(0, 0, 0); if (!src || src.strength <= 0) return;
    const v = this._v.set(src.dir.x, src.dir.y, src.dir.z, 0).applyMatrix4(this._m);
    if (v.w <= 0.02) return;
    const x = v.x / v.w, y = v.y / v.w, off = Math.max(Math.abs(x), Math.abs(y));
    out.set(x * 0.5 + 0.5, y * 0.5 + 0.5, src.strength * THREE.MathUtils.smoothstep(2.1 - off, 0, 0.9));
  }
  render(renderer, writeBuffer) {
    const cam = this.camera, u = this.auxMat.uniforms;
    renderer.setRenderTarget(this.rt); renderer.clear(); renderer.render(this.scene, cam);
    u.near.value = cam.near; u.far.value = cam.far; u.projK.value.set(cam.projectionMatrix.elements[0], cam.projectionMatrix.elements[5]);
    this._m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this._project(this.sources[0], u.lightA.value); this._project(this.sources[1], u.lightB.value);
    this.fsq.material = this.auxMat; renderer.setRenderTarget(this.aux); this.fsq.render(renderer);
    this.fsq.material = this.compMat; renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.fsq.render(renderer);
  }
}

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, hurt: { value: 0 }, low: { value: 0 }, desat: { value: 0 }, warm: { value: 0 }, texel: { value: new THREE.Vector2() } },
  vertexShader: VS,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, hurt, low, desat, warm; uniform vec2 texel; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time) * 43758.5453); }
    void main(){
      vec2 d = vUv - .5; float r = length(d);
      // lens: a little barrel distortion and colour fringing toward the corners
      vec2 uv = .5 + d * (1. - .018 * r * r);
      vec2 off = d * r * .0075;
      vec3 c = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      // gentle unsharp mask
      vec3 blur = (texture2D(tDiffuse, uv + vec2(texel.x, 0.)).rgb + texture2D(tDiffuse, uv - vec2(texel.x, 0.)).rgb
                 + texture2D(tDiffuse, uv + vec2(0., texel.y)).rgb + texture2D(tDiffuse, uv - vec2(0., texel.y)).rgb) * .25;
      c = max(c + (c - blur) * .35 * (1. - smoothstep(.2, .7, r)), 0.);
      float v = smoothstep(.98, .22, r * 1.06);
      c *= mix(.34, 1., v);
      float edge = 1. - smoothstep(.2, .75, r);
      c = mix(c, vec3(.55, .0, .0), (1. - edge) * clamp(hurt * .9 + low * (.3 + .12 * sin(time * 5.)), 0., .85));
      float l = dot(c, vec3(.3, .59, .11));
      // split tone: cold shadows, ember highlights
      c *= mix(vec3(.9, .98, 1.1), vec3(1.07, 1., .92), smoothstep(.02, .55, l));
      c = mix(vec3(l), c, 1.1);
      c = mix(c, vec3(l) * vec3(1.05, .98, .95), clamp(.1 + desat, 0., 1.));
      c *= mix(vec3(1.), vec3(1.12, .96, .86), warm);
      c += (hash(vUv * 700.) - .5) * .02 * (.35 + .65 * (1. - smoothstep(0., .6, l)));
      gl_FragColor = vec4(max(c, 0.), 1.);
    }`,
};

export class Pipeline {
  constructor(renderer, scene, camera, samples = 4) {
    this.composer = new EffectComposer(renderer);
    this.scenePass = new ScenePass(scene, camera, samples); this.composer.addPass(this.scenePass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.75, 0.95); this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader); this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.sources = this.scenePass.sources;
  }
  setSize(w, h) { this.composer.setSize(w, h); const pr = this.composer.renderer.getPixelRatio(); this.grade.uniforms.texel.value.set(1 / (w * pr), 1 / (h * pr)); }
  render() { this.composer.render(); }
}
