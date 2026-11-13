import * as THREE from 'three';
import { Batch, Builder, makeMaterials, mat4, tubeGeo, canvasTex, normalTex, bake } from './builder.js';
import * as P from './props.js';
import { groundHeight, terrainHeight, pathDist, corruption, SQUARE, CHURCH, BOUNDS } from './terrain.js';
import { clamp, lerp, sstep, fbm, noise2, rng, TAU, angDiff } from '../core/util.js';

const PI = Math.PI;
const C = (h) => new THREE.Color(h);
const G1 = C(0x30351f), G2 = C(0x1b1f15), MUD = C(0x2b2119), CORR = C(0x130b10), VEIN = C(0x5a0e08), COBBLE = C(0x3c3a37), ASH = C(0x1c1818), SOIL = C(0x1e1610);
const FOG_A = C(0x0b1118), FOG_B = C(0x1a0a0a);

export class World {
  constructor(scene) {
    this.scene = scene;
    this.circles = []; this.boxes = []; this.rings = [];
    this.lights = []; this.dyn = []; this.emitters = []; this.interact = []; this.spawns = []; this.shrines = []; this.listen = [];
    this.mats = makeMaterials(); this.batch = new Batch(); this.hs = 1; this.pulse = 0; this.fogColor = new THREE.Color();
    this.r = rng(1337);
    this._sky(); this._ground();
    this._road(); this._outskirts(); this._street(); this._camp(); this._square(); this._graveyard(); this._churchyard();
    this._wilds(); this._forest(); this._grass();
    this.batch.build(scene, this.mats);
    this._lightPool(); this._barriers();
  }

  // ---------- registration helpers ----------
  addBox(x, z, hx, hz, rot = 0, h = 4) { const b = { x, z, hx, hz, c: Math.cos(rot), s: Math.sin(rot), top: groundHeight(x, z) + h, off: false }; this.boxes.push(b); return b; }
  addCircle(x, z, r) { this.circles.push({ x, z, r }); }
  addClue(id, x, z, y = 1, label = 'Read', r = 2.3) {
    const gy = groundHeight(x, z) + y;
    this.interact.push({ kind: 'clue', id, x, z, y: gy, r, label });
    this.emitters.push({ x, y: gy + 0.15, z, type: 'glint', rate: 2.4, clue: id });
  }
  addShrine(x, z, rot = 0) {
    const B = new Builder(), y = groundHeight(x, z);
    B.cyl('wood', 0.13, 0.16, 2.1, 0, 1.05, 0, 0x4a3c30);
    B.box('plank', 0.7, 0.75, 0.42, 0, 2.2, 0, 0x54463a); B.box('plain', 0.5, 0.52, 0.1, 0, 2.2, 0.2, 0x0c0a09);
    B.box('plank', 0.75, 0.08, 0.7, -0.24, 2.76, 0.05, 0x3a2e25, 0, 0, 0.65); B.box('plank', 0.75, 0.08, 0.7, 0.24, 2.76, 0.05, 0x3a2e25, 0, 0, -0.65);
    B.box('gild', 0.18, 0.3, 0.03, 0, 2.25, 0.24, 0xb89a4a);                                       // a tiny icon
    B.cyl('plain', 0.03, 0.035, 0.16, 0, 1.92, 0.3, 0xc8bc9a); B.box('plank', 0.5, 0.05, 0.25, 0, 1.82, 0.3, 0x3a2e25);
    B.cyl('stone', 0.6, 0.7, 0.3, 0, 0.1, 0, 0x66625c, 0, 0, 0, 8);
    B.flush(this.batch, mat4(x, y, z, 0, rot, 0), null);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 5), this.mats.fire);
    flame.position.set(x + Math.sin(rot) * 0.3, y + 2.1, z + Math.cos(rot) * 0.3); flame.visible = false; this.scene.add(flame);
    const light = { x, y: y + 2.2, z, color: 0xffb060, i: 0, r: 16, flicker: true, prio: 2 };
    this.lights.push(light);
    const s = { x, z, y, rot, lit: false, flame, light, idx: this.shrines.length };
    this.shrines.push(s); this.addCircle(x, z, 0.35);
    this.interact.push({ kind: 'shrine', shrine: s, x, z, y: y + 1.6, r: 2.4 });
    return s;
  }
  lightShrine(s) { s.lit = true; s.flame.visible = true; s.light.i = 34; this.emitters.push({ x: s.flame.position.x, y: s.flame.position.y, z: s.flame.position.z, type: 'flame', rate: 6, size: 0.35 }); }
  spawn(type, x, z, o = {}) { this.spawns.push({ type, x, z, ...o }); }
  house(o) {
    const corr = corruption(o.x, o.z);
    const h = P.house(this, { corr, seed: this.hs++, ...o });
    const n = Math.floor(corr * 4.2 + (this.r() - 0.4));
    if (n > 0) P.rootsOver(this, h, n, this.hs * 3);
    return h;
  }

  // ---------- sky, ground ----------
  _sky() {
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { horizon: { value: new THREE.Color(0x0b1118) }, zenith: { value: new THREE.Color(0x020409) }, time: { value: 0 }, rift: { value: 1 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: `
        varying vec3 vDir; uniform vec3 horizon, zenith; uniform float time, rift;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float hash3(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=noise(p)*a; p=p*2.1+7.; a*=.5; } return s; }
        void main(){
          vec3 d = normalize(vDir); float h = clamp(d.y, 0., 1.);
          vec3 c = mix(horizon, zenith, pow(h, .45));
          vec3 rd = normalize(vec3(0.,.5,-1.)); float r = max(dot(d, rd), 0.);
          // stars, thinning toward the rift and the horizon
          vec3 sd = d * 170., cell = floor(sd); float sh = hash3(cell);
          float star = step(.9955, sh) * smoothstep(.45, 0., length(fract(sd) - .5)) * (.55 + .45 * sin(time * (1.5 + sh * 40.) + sh * 90.));
          vec3 sky = c + mix(vec3(.75,.85,1.), vec3(1.,.85,.7), fract(sh * 77.)) * star * 1.6 * smoothstep(.04, .4, d.y) * (1. - pow(r, 3.));
          // the moon: a lit disc with maria, a tight corona and a wide veil
          vec3 md = normalize(vec3(-.45,.55,.7)); float m = dot(d, md);
          vec3 mu = normalize(cross(md, vec3(0.,1.,0.))), mv = cross(mu, md);
          vec2 mp = vec2(dot(d, mu), dot(d, mv)) / .052;
          float disc = smoothstep(1., .93, length(mp)), limb = sqrt(max(1. - dot(mp, mp) * .7, 0.));
          float maria = smoothstep(.35, .7, fbm(mp * 2.2 + 3.)) * .55 + fbm(mp * 9.) * .2;
          vec3 moon = vec3(.86,.9,1.) * disc * limb * (1.15 - maria) * 2.6;
          vec3 halo = vec3(.2,.26,.42) * (pow(max(m,0.), 40.) * .6 + pow(max(m,0.), 700.) * 1.1);
          // two cloud decks, silvered by the moon and lit from beneath by the wound in the sky
          vec2 uv = d.xz/(abs(d.y)+.22);
          float c1 = fbm(uv*1.3 + vec2(time*.012, time*.004)), c2 = fbm(uv*3.1 - vec2(time*.02, time*.007) + 4.);
          float cm = smoothstep(.40,.74, c1*.78 + c2*.3) * smoothstep(0.,.3,d.y);
          float thick = smoothstep(.45,.85, c1);
          vec3 cloud = vec3(.012,.016,.024) + c*.3
            + vec3(.2,.25,.36) * pow(max(m,0.), 5.) * (1.15 - thick) * (.5 + c2)
            + rift * vec3(.4,.05,.015) * pow(r, 8.) * (1.25 - thick) * (.4 + c2 * 1.2);
          c = mix(sky + moon + halo, cloud + (moon + halo) * .1 * (1. - thick), cm);
          float ang = atan(d.x, d.y - .45);
          float sw = fbm(vec2(ang*2.5 + time*.2 + r*6., r*10. - time*.25));
          c += rift * vec3(1.,.12,.03) * (pow(r, 60.) * (.35 + sw*1.6) + pow(r, 9.) * .1);
          c += rift * vec3(1.,.45,.16) * smoothstep(.992,.9997,r) * 1.1;
          gl_FragColor = vec4(c, 1.);
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(430, 48, 32), this.skyMat);
    this.sky.frustumCulled = false; this.sky.renderOrder = -10; this.scene.add(this.sky);
    // pillar of light from the church dome into the rift
    const bm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { time: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: `varying vec2 vUv; uniform float time;
        void main(){ float a = pow(1. - vUv.y, 1.6) * (.55 + .45*sin(vUv.x*40. + time*1.3 + vUv.y*9.)) * (.75 + .25*sin(time*2.2));
        gl_FragColor = vec4(vec3(1.,.13,.04) * a * .5, 1.); }`,
    });
    this.beamMat = bm;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(16, 2.6, 150, 20, 1, true), bm);
    beam.position.set(CHURCH.x, CHURCH.y + 36 + 75, CHURCH.z); beam.renderOrder = -5; this.scene.add(beam);
  }

  /** Bake the sky into an environment map so metal, wet mud and gilt have something to reflect. */
  bakeEnv(renderer) {
    const pm = new THREE.PMREMGenerator(renderer), sc = new THREE.Scene();
    sc.add(new THREE.Mesh(this.sky.geometry, this.skyMat));
    const rt = pm.fromScene(sc, 0.02, 1, 1000);
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt; this.scene.environment = rt.texture; pm.dispose();
    this.ground.material.envMap = rt.texture; this.ground.material.envMapIntensity = 0.4;   // puddles should glint, not glow
  }

  groundColor(x, z, c) {
    const n = fbm(x * 0.11, z * 0.11), n2 = noise2(x * 0.9, z * 0.9), cor = corruption(x, z);
    c.copy(G1).lerp(G2, n);
    c.lerp(CORR, cor * (0.3 + 0.7 * sstep(0.35, 0.62, fbm(x * 0.07 + 40, z * 0.07))));
    if (cor > 0.2) { const v = Math.abs(fbm(x * 0.3 + 9, z * 0.3 + 2, 2) - 0.5); if (v < 0.02 * cor) c.lerp(VEIN, 0.85); }
    if (x > -41 && x < -8 && z > 35 && z < 63) c.lerp(SOIL, 0.6 + 0.4 * Math.sin(x * 2.6));
    c.lerp(MUD, sstep(3.6, 1.5, pathDist(x, z)) * 0.92);
    c.lerp(COBBLE, sstep(22.8, 20.8, Math.hypot(x - SQUARE.x, z - SQUARE.z)));
    c.lerp(ASH, sstep(-95, -101, z) * 0.85);
    c.multiplyScalar(0.8 + n2 * 0.4);
  }

  _ground() {
    const g = new THREE.PlaneGeometry(230, 370, 156, 250); g.rotateX(-PI / 2); g.translate(0, 0, -30);
    const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setY(i, terrainHeight(x, z)); this.groundColor(x, z, c);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const wet = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); wet[i] = sstep(3.6, 1.6, pathDist(x, z)) * sstep(0.5, 0.64, fbm(x * 0.23 + 3, z * 0.23 + 8)) * sstep(-96, -90, z); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('wet', new THREE.BufferAttribute(wet, 1)); g.computeVertexNormals();
    const tex = canvasTex(256, (cx, s) => {
      cx.fillStyle = '#b4b4b4'; cx.fillRect(0, 0, s, s);
      for (let i = 0; i < 5000; i++) { const v = 90 + Math.random() * 165; cx.fillStyle = `rgba(${v},${v},${v},${0.25 + Math.random() * 0.4})`; cx.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 1 + Math.random() * 3); }
      for (let i = 0; i < 60; i++) { cx.fillStyle = `rgba(40,40,40,${Math.random() * 0.25})`; cx.beginPath(); cx.arc(Math.random() * s, Math.random() * s, 4 + Math.random() * 14, 0, TAU); cx.fill(); }
      for (let i = 0; i < 26; i++) { const x = Math.random() * s, y = Math.random() * s, r = 3 + Math.random() * 6; const gr = cx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r); gr.addColorStop(0, 'rgba(235,235,230,.9)'); gr.addColorStop(1, 'rgba(70,70,70,.9)'); cx.fillStyle = gr; cx.beginPath(); cx.ellipse(x, y, r, r * (0.6 + Math.random() * 0.4), Math.random() * 3, 0, TAU); cx.fill(); }   // pebbles
    }, 70, 110);
    const gm = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, normalMap: normalTex(tex, 3), normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.96 });
    gm.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float wet; varying float vWet; varying vec2 vWp;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWet = wet; vWp = position.xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWet; varying vec2 vWp;')
        // break up the tiling with two larger octaves of the same texture, and pool standing water in the ruts
        .replace('#include <map_fragment>', `#include <map_fragment>
          float macro = texture2D(map, vWp * .0213).g, macro2 = texture2D(map, vWp.yx * .0057 + .3).g;
          diffuseColor.rgb *= (.6 + macro * .55) * (.72 + macro2 * .42);
          float pud = smoothstep(.6, .9, vWet * (.35 + macro));
          diffuseColor.rgb *= mix(1., .3, pud);`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor - vWet * .2, .14, pud);')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, nonPerturbedNormal, pud * .97));');
    };
    const m = new THREE.Mesh(g, gm);
    m.receiveShadow = true; this.scene.add(m); this.ground = m;
  }

  // ---------- layout ----------
  _road() {
    const r = this.r;
    P.cart(this, 5.2, 91, 0.5, true); P.crate(this, 6.6, 88.6, 0.8, 0.4); P.crate(this, 4.6, 87.6, 0.6, 1.1); P.barrel(this, 7.4, 90.4, true);
    this.addShrine(-3.6, 86, 1.2);
    P.torch(this, 3.2, 79, true); P.torch(this, -3.2, 73.5, false);
    // the palisade — built to keep something in
    const B = new Builder();
    for (let x = -47; x <= 47; x += 0.56) {
      if (Math.abs(x) < 3.4) continue;
      const z = 68 + Math.sin(x * 0.21) * 0.8, y = groundHeight(x, z), h = 3.6 + r() * 0.9;
      B.cyl('wood', 0.02, 0.27, h, x, y + h / 2 - 0.3, z, [0x4a3d32, 0x54463a, 0x3f342b][(r() * 3) | 0], (r() - 0.5) * 0.08, 0, (r() - 0.5) * 0.08, 6);
    }
    for (const s of [-1, 1]) { B.box('wood', 0.5, 5.2, 0.5, s * 3.3, 2.5, 68, 0x3a2e25); B.box('wood', 0.3, 0.3, 4.4, s * 3.3, 1.6, 70.6, 0x3a2e25, -0.75, 0, 0); }
    B.box('wood', 7.6, 0.45, 0.5, 0, 5, 68, 0x3a2e25);
    B.box('plank', 3.1, 3.8, 0.2, -2.5, 1.9, 66.6, 0x4a3c30, 0, 1.25, 0.05);                       // one gate leaf hangs open
    B.box('plank', 3.1, 3.8, 0.2, 3.3, 0.5, 65.3, 0x4a3c30, 1.35, 0.4, 0);                         // the other is on the ground
    B.box('wood', 4.6, 0.3, 0.3, 1.2, 0.3, 71.2, 0x3a2e25, 0, 0.5, 0.06);                          // the bar that held it shut, from outside
    B.box('plank', 1.5, 1.1, 0.08, 5.3, 1.9, 70.3, 0x6a5c4a, 0, -0.25, 0.04); B.cyl('plain', 0.07, 0.08, 2.6, 5.3, 1.2, 70.2, 0x3a2e25);
    P.sunEmblem(B, 5.32, 2.2, 70.36, 0.32, -0.25);
    // sharpened stakes, all pointing inward
    for (let x = -30; x <= 30; x += 2.1) { if (Math.abs(x) < 4.5) continue; const z = 65.2 + Math.sin(x) * 0.5, y = groundHeight(x, z); B.cyl('wood', 0.02, 0.11, 2.6, x, y + 0.75, z - 0.4, 0x54463a, -1.0, 0, (r() - 0.5) * 0.3, 5); B.box('wood', 0.12, 0.9, 0.12, x, y + 0.3, z + 0.5, 0x3a2e25, 0.3, 0, 0); }
    B.flush(this.batch, mat4(0, 0, 0), null, 0.14, 68);
    this.addBox(-25.2, 68, 21.9, 0.5, 0, 4); this.addBox(25.2, 68, 21.9, 0.5, 0, 4);
    this.addClue('gate', 5.2, 71, 1.6);
    P.deadTree(this, -8, 80, 1.1, 3); P.deadTree(this, 9, 76, 0.9, 4); P.deadTree(this, -12, 92, 1.2, 5);
  }

  _outskirts() {
    const r = this.r;
    const farm = this.house({ x: 16.5, z: 52, rot: -PI / 2, W: 8, D: 7, H: 3.1 });
    const b = farm.at(1.6, farm.D / 2 + 0.9); const B = new Builder();
    B.box('plank', 1.6, 0.1, 0.5, 0, 0.5, 0, 0x5a4a3c); B.box('plank', 0.1, 0.5, 0.4, -0.7, 0.25, 0, 0x4a3c30); B.box('plank', 0.1, 0.5, 0.4, 0.7, 0.25, 0, 0x4a3c30);
    B.flush(this.batch, mat4(b.x, b.y, b.z, 0, farm.rot, 0)); P.page(this, b.x, b.y + 0.58, b.z, 0.4);
    this.addClue('diary', b.x, b.z, 0.6);
    this.house({ x: 23, z: 37, rot: -PI / 2 + 0.12, W: 9, D: 7.5, H: 3.8, roofH: 4, chimney: false });
    P.hay(this, 16, 41, 0.3); P.hay(this, 17.2, 39.4, 1.2); P.hay(this, 14.6, 44.5, 2); P.cart(this, 10.5, 40, -0.7); P.barrel(this, 11.6, 55.6); P.barrel(this, 12, 48.6, true);
    P.fence(this, 9.5, 62, 9.5, 57, true); P.fence(this, 9.5, 46, 9.5, 33, true, 0.3); P.fence(this, 9.5, 62, 24, 63.5, true);
    // the black fields
    P.fence(this, -8, 63, -8, 50, true, 0.2); P.fence(this, -8, 44, -8, 35, true, 0.4); P.fence(this, -8, 63, -40, 63.5, true, 0.2); P.fence(this, -8, 35, -24, 34.5, true, 0.5);
    P.scarecrow(this, -17, 56, 0.4); P.scarecrow(this, -29, 46, -0.3); P.scarecrow(this, -34, 58, 1);
    P.growth(this, -24, 49, 1.3, 11); P.growth(this, -13, 40, 0.8, 12, false); P.growth(this, 5.5, 58.5, 0.7, 13, false); P.growth(this, -4.5, 41, 0.9, 14);
    P.torch(this, 4, 52, false); P.torch(this, -2.6, 33, true);
    P.corpse(this, -1.5, 49, 0.7); P.corpse(this, 12.5, 45.5, 2.1);
    P.deadTree(this, -5.5, 55, 1.2, 21, true); P.deadTree(this, 6, 33.5, 1, 22); P.deadTree(this, 27, 55, 1.3, 23); P.deadTree(this, 31, 44, 1, 24, true);
    // Dedko's hut, off in the birches
    const hut = this.house({ x: -36, z: 27, rot: PI / 2 - 0.35, W: 5, D: 4.6, H: 2.5, roofH: 3, corr: 0.12 });
    const d = hut.at(hut.doorX, hut.D / 2 + 1.1); this.addClue('dedko', d.x, d.z, 1.4, 'Read the carving');
    this.listen.push({ id: 'echo_dedko', x: d.x, z: d.z, r: 9 });
    P.fence(this, -31, 21, -27, 26, false, 0.6); P.fence(this, -27, 26, -27.5, 32, false, 0.6); P.barrel(this, -32.5, 23.5); P.crate(this, -39.5, 31.5, 0.7, 0.3);
    { const B2 = new Builder(); for (let i = 0; i < 7; i++) { const a = r() * TAU, dd = 1 + r() * 2.2; B2.box('plain', 0.5 + r() * 0.4, 0.08, 0.1, -29.5 + Math.sin(a) * dd, groundHeight(-29.5, 27.5) + 0.06, 27.5 + Math.cos(a) * dd, 0xb8b09c, 0, r() * 3, 0); } B2.sph('plain', 0.16, -29.2, groundHeight(-29.2, 28) + 0.14, 28, 0xb8b09c, 1.5, 1, 1); B2.flush(this.batch, mat4(0, 0, 0), null, 0.1, 27); } // sheep bones
    this.spawn('husk', -2, 59, { dormant: 'lying' }); this.spawn('husk', 7, 50.5); this.spawn('husk', 11.5, 57.5); this.spawn('husk', -22, 53);
    this.spawn('husk', -16, 44.5, { dormant: 'lying' }); this.spawn('husk', 3, 38.5); this.spawn('husk', 18.5, 44.5);
    this.spawn('strzyga', -30.5, 32);
  }

  _street() {
    const tav = this.house({ x: -14.5, z: 19, rot: PI / 2, W: 10, D: 8, H: 3.4, roofH: 3.8, open: true });
    { const t = tav.at(0, -tav.D / 2 + 0.45, 1.9); const B = new Builder(); B.box('plank', 1.5, 1.1, 0.07, 0, 0, 0, 0x6a5c4a); B.flush(this.batch, mat4(t.x, t.y, t.z, 0, tav.rot, 0));
      const tb = tav.at(2.4, -0.6); const B2 = new Builder(); B2.box('plank', 2.2, 0.1, 1, 0, 0.85, 0, 0x5a4a3c); for (const sx of [-1, 1]) B2.box('wood', 0.12, 0.85, 0.8, sx * 0.9, 0.42, 0, 0x3a2e25); B2.cyl('plain', 0.09, 0.07, 0.2, 0.3, 1, 0.1, 0x6a6258); B2.cyl('plain', 0.09, 0.07, 0.2, -0.5, 0.95, -0.2, 0x6a6258, 1.5, 0, 0);
      B2.box('plank', 1.9, 0.08, 0.4, -0.2, 0.25, 1.1, 0x4a3c30, 0, 0.2, 0.7); B2.flush(this.batch, mat4(tb.x, tb.y + 0.3, tb.z, 0, tav.rot, 0));
      const c = tav.at(0, -tav.D / 2 + 1.5); this.addClue('moot', c.x, c.z, 1.9, 'Read the tally-board', 2.6); }
    this.house({ x: 13.5, z: 26, rot: -PI / 2, W: 7, D: 6 });
    this.house({ x: -14.5, z: 4.5, rot: PI / 2 + 0.06, W: 7.5, D: 6.2 });
    // smithy: open shed with forge
    const sm = this.house({ x: 16, z: 9.5, rot: -PI / 2, W: 8, D: 6.5, H: 3.2, open: true, chimney: true });
    { const f = sm.at(-2.2, -1.6); const B = new Builder(); B.box('stone', 1.8, 1.1, 1.4, 0, 0.85, 0, 0x5a5650); B.box('fire', 1.1, 0.12, 0.8, 0, 1.44, 0); B.box('metal', 0.9, 0.3, 0.4, 2.6, 1.0, 1.4, 0x2e2c2a); B.cyl('wood', 0.3, 0.36, 0.75, 2.6, 0.6, 1.4, 0x3a2e25);
      B.flush(this.batch, mat4(f.x, f.y, f.z, 0, sm.rot, 0)); this.lights.push({ x: f.x, y: f.y + 2, z: f.z, color: 0xff6a20, i: 30, r: 13, flicker: true }); this.emitters.push({ x: f.x, y: f.y + 1.5, z: f.z, type: 'flame', rate: 10 }); this.addCircle(f.x, f.z, 0.9); }
    const heal = this.house({ x: -14.5, z: -10, rot: PI / 2, W: 6.5, D: 6, lit: true });
    { const d = heal.at(heal.doorX + 1.5, heal.D / 2 + 0.7); P.crate(this, d.x, d.z, 0.75, 0.3); P.page(this, d.x, groundHeight(d.x, d.z) + 0.8, d.z, 1); this.addClue('healer', d.x, d.z, 0.85);
      const B = new Builder(); for (let i = 0; i < 6; i++) B.cone('thatch', 0.1, 0.5, -1.6 + i * 0.6, 2.75, 0.2, [0x5a6a3c, 0x6a5a3a, 0x4a5a44][i % 3], PI, 0, 0, 5); B.box('plain', 3.6, 0.04, 0.04, 0, 3.02, 0.2, 0x3a2e25);
      const p = heal.at(0, heal.D / 2 + 0.25); B.flush(this.batch, mat4(p.x, p.y, p.z, 0, heal.rot, 0)); }
    this.house({ x: 13.5, z: -7, rot: -PI / 2 - 0.08, W: 7, D: 6 });
    this.house({ x: -30, z: 7, rot: PI / 2 + 0.2, W: 7, D: 6 });
    this.house({ x: 30, z: 20, rot: -PI / 2, W: 6.5, D: 6 });
    const dr = this.house({ x: 29.5, z: 1, rot: -PI / 2 + 0.15, W: 7, D: 6 });
    { const d = dr.at(dr.doorX - 1.1, dr.D / 2 + 0.08, 1.0); P.page(this, d.x, d.y, d.z, dr.rot, true); const c = dr.at(dr.doorX - 1.1, dr.D / 2 + 1); this.addClue('drawing', c.x, c.z, 1.0, 'Look at the drawing'); }
    this.house({ x: -29, z: -9, rot: PI / 2 - 0.1, W: 7, D: 6.4 });
    P.well(this, 1.6, 2); this.addClue('well', 3.2, 3.4, 0.9, 'Read the scratches');
    P.fence(this, -9, 12, -9, 9, true, 0.5); P.fence(this, 9.4, 21, 9.4, 15, true, 0.5); P.fence(this, 9.4, -1, 9.4, -3, true, 0.6);
    P.fence(this, -22, 13, -34, 14, true, 0.5); P.fence(this, 21, 14, 34, 13, true, 0.5); P.fence(this, 21, -5.5, 34, -6.5, true, 0.6); P.fence(this, -21, -17, -34, -16, true, 0.7);
    P.cart(this, 6, 14, 2.4, true); P.barrel(this, -8.6, 1.5); P.barrel(this, -8.2, 2.6, true); P.crate(this, 8.6, 27.5, 0.9, 0.2); P.hay(this, -22, -2, 0.6); P.stall(this, 7.6, -11, -1.3);
    P.torch(this, -3.4, 13, true); P.torch(this, 3.6, -9, true); P.torch(this, 4.2, 24, false); P.torch(this, 22, 8, false);
    P.growth(this, -5, 9, 1.2, 31); P.growth(this, 7, 4, 1.0, 32, false); P.growth(this, -22, 0, 1.5, 33); P.growth(this, 22.5, 10, 1.2, 34); P.growth(this, 5.5, -16, 1.4, 35); P.growth(this, -6.5, -13.5, 0.9, 36, false); P.growth(this, 21, 26, 1.1, 37, false); P.growth(this, -23, 20, 1.2, 38);
    P.deadTree(this, 6, 20, 1.1, 41, true); P.deadTree(this, -7, -3.5, 1.2, 42); P.deadTree(this, 22, -1, 1.1, 43, true); P.deadTree(this, -22, 13.5, 1.3, 44); P.deadTree(this, 36, 9, 1.3, 45); P.deadTree(this, -37, -2, 1.2, 46, true);
    P.corpse(this, 2.5, 9.5, 1.2); P.corpse(this, -4.5, -6, 2.6); P.corpse(this, 24, 4.5, 0.4);
    this.spawn('husk', -4, 27); this.spawn('husk', 4.5, 19); this.spawn('husk', -7.5, 13.5); this.spawn('husk', -15.5, 17.5, { dormant: 'lying' });
    this.spawn('brute', 11.5, 10.5, { yaw: -PI / 2 });
    this.spawn('strzyga', 8, -1.5); this.spawn('strzyga', -24, 3);
    this.spawn('wailer', -3.5, -8); this.spawn('husk', 4, -13); this.spawn('husk', -6.5, -17.5); this.spawn('husk', 25, 10); this.spawn('husk', -24.5, -13, { dormant: 'lying' }); this.spawn('husk', 24.5, -2);
  }

  _camp() {
    P.tent(this, 16, -13.5, -PI / 2 + 0.25); P.tent(this, 20, -20, -2.3); P.banner(this, 10.4, -12.6, 0.4); P.banner(this, 22.5, -15, -1.2, false);
    P.crate(this, 13.6, -19.4, 0.85, 0.2, 0x54483c); P.crate(this, 14.6, -20.4, 0.6, 0.9, 0x54483c); P.barrel(this, 12.4, -21); P.page(this, 13.6, groundHeight(13.6, -19.4) + 0.9, -19.4, 0.5);
    this.addClue('journal', 13.4, -18.6, 0.95);
    const B = new Builder(); for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; B.sph('stone', 0.2, 12 + Math.sin(a) * 0.7, groundHeight(12, -16) + 0.08, -16 + Math.cos(a) * 0.7, 0x55524e); }
    B.box('wood', 0.9, 0.12, 0.12, 12, groundHeight(12, -16) + 0.1, -16, 0x0c0a09, 0, 0.6, 0); B.box('wood', 0.9, 0.12, 0.12, 12, groundHeight(12, -16) + 0.14, -16, 0x0c0a09, 0, -0.8, 0);
    for (const [x, z, rz] of [[17.5, -17, 0.2], [18.3, -16.6, -0.15], [11, -19.6, 0.1]]) { B.box('metal', 0.09, 1.5, 0.03, x, groundHeight(x, z) + 0.6, z, 0x8a8d90, 0, 0.4, rz); B.box('metal', 0.36, 0.05, 0.05, x - rz * 1.1, groundHeight(x, z) + 1.12, z, 0x4a4238, 0, 0.4, rz); }
    B.flush(this.batch, mat4(0, 0, 0), null, 0.14, -16);
    P.corpse(this, 17, -16.2, 0.5, true); P.corpse(this, 10.6, -19, 2.4, true); P.corpse(this, 21.5, -17.2, -1.1, true);
    this.addShrine(6.6, -20.5, -0.6);
    P.growth(this, 19, -24, 1.2, 51); P.growth(this, 24.5, -11, 0.9, 52, false);
  }

  _square() {
    const S = SQUARE, r = this.r, B = new Builder(), gy = groundHeight(S.x, S.z);
    const half = 0.17;
    this.squareRing = { x: S.x, z: S.z, r: S.r, gaps: [{ a: 0, half, closed: false }, { a: PI, half, closed: true }] };
    this.rings.push(this.squareRing);
    for (let i = 0; i < 84; i++) {
      const a = (i / 84) * TAU; if (Math.abs(angDiff(a, 0)) < half + 0.02 || Math.abs(angDiff(a, PI)) < half + 0.02) continue;
      const x = Math.sin(a) * S.r, z = Math.cos(a) * S.r, h = 1.0 + r() * 0.5, broken = r() < 0.1;
      B.box('stone', 1.7, broken ? 0.4 : h, 0.7, x, (broken ? 0.2 : h / 2) - 0.05, z, [0x66625c, 0x5a5650, 0x6e6a62][(r() * 3) | 0], 0, a + PI / 2, (r() - 0.5) * 0.06);
      if (i % 6 === 0) B.cyl('wood', 0.02, 0.14, 3, x * 1.02, 1.6, z * 1.02, 0x3a2e25, (r() - 0.5) * 0.2, 0, (r() - 0.5) * 0.2, 5);
    }
    for (const a of [half + 0.05, -half - 0.05, PI + half + 0.05, PI - half - 0.05]) B.box('stone', 1, 2.6, 1, Math.sin(a) * S.r, 1.3, Math.cos(a) * S.r, 0x5a5650, 0, a, 0);
    // the Pale Sun, painted on the cobbles in salt and ash; Aldric kneels at its heart
    for (let i = 0; i < 40; i++) { const a = (i / 40) * TAU; B.box('plain', 0.95, 0.03, 0.22, Math.sin(a) * 5.6, 0.02, -2 + Math.cos(a) * 5.6, 0xa8a090, 0, a + PI / 2, 0); }
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; B.box('plain', 0.2, 0.03, 2.6, Math.sin(a) * 7.8, 0.02, -2 + Math.cos(a) * 7.8, 0xa8a090, 0, a, 0); }
    // fallen idol of the old god, four-faced
    B.cyl('wood', 0.55, 0.65, 5, 12.5, 0.55, -9, 0x4a3f36, PI / 2 - 0.05, 0.9, 0, 8); B.box('plain', 0.5, 0.12, 0.4, 14.1, 0.95, -7.7, 0x1a1512, 0, 0.9, 0); B.box('plain', 0.14, 0.14, 0.14, 14.4, 1.0, -7.9, 0x1a1512);
    B.geo('root', tubeGeo([[10, -0.3, -11], [11.5, 1.4, -9.8], [13, 1.3, -8.5], [15, -0.3, -6]], 0.22, 0.06, 12, 5), null, 0x1d1216);
    for (const [x, z, rz] of [[-9, 6, 0.3], [-11, -8, -0.2], [7, 10, 0.15], [-3, -14, -0.3], [14, 3, 0.25]]) { B.box('metal', 0.1, 1.6, 0.03, x, 0.65, z, 0x8a8d90, 0, x, rz); B.box('metal', 0.4, 0.05, 0.05, x - rz * 1.2, 1.2, z, 0x4a4238, 0, x, rz); }
    B.flush(this.batch, mat4(S.x, gy, S.z), null);
    this.addCircle(S.x + 12.5, S.z - 9, 1.3);
    P.gallows(this, S.x + 15.5, S.z + 6, -1.2); P.stall(this, S.x - 15.5, S.z + 8.5, 1.1); P.stall(this, S.x - 17, S.z - 3, 1.5);
    for (const [x, z, a] of [[-8.5, 6.5, 1], [-11.5, -7.5, 2], [6.5, 10.5, 0.2], [-3.5, -13.5, 4], [13.5, 3.5, 5]]) P.corpse(this, S.x + x, S.z + z, a, true);
    P.banner(this, S.x - 4.4, S.z + S.r + 0.2, 0); P.banner(this, S.x + 4.4, S.z + S.r + 0.2, 0);
    P.torch(this, S.x - 4.3, S.z - S.r - 0.4, true); P.torch(this, S.x + 4.3, S.z - S.r - 0.4, true);
    P.growth(this, S.x - 17.5, S.z - 9, 1.5, 61); P.growth(this, S.x + 17, S.z - 6.5, 1.3, 62); P.growth(this, S.x + 9, S.z + 16.5, 1.1, 63, false); P.growth(this, S.x - 10, S.z + 16, 1.2, 64);
    for (const a of [1.15, 1.75, 2.4, -0.72, -1.2, -1.8, -2.42]) {
      const x = S.x + Math.sin(a) * 30.5, z = S.z + Math.cos(a) * 30.5;
      this.house({ x, z, rot: a + PI, W: 7 + r() * 2, D: 6 + r(), H: 3 + r() * 0.8, lit: r() < 0.4 });
    }
    P.deadTree(this, S.x + 24.5, S.z + 15.5, 1.5, 65, true); P.deadTree(this, S.x - 25, S.z - 17, 1.4, 66, true); P.deadTree(this, S.x + 25, S.z - 18.5, 1.3, 67);
  }

  _graveyard() {
    const r = this.r;
    P.fence(this, -4, -68.5, -33, -70, true, 0.6); P.fence(this, 5, -68.5, 33, -70, true, 0.6); P.fence(this, -33, -70, -34, -98, true, 0.7); P.fence(this, 33, -70, 34, -98, true, 0.7);
    for (let gx = -30; gx <= 30; gx += 3.3) for (let gz = -73.5; gz >= -96; gz -= 3.7) {
      const x = gx + (r() - 0.5) * 1.2, z = gz + (r() - 0.5) * 1.2;
      if (pathDist(x, z) < 3.6 || (x > -27.5 && x < -10.5 && z < -76.5 && z > -90.5) || r() < 0.18) continue;
      P.grave(this, x, z, r() < 0.65 ? 0 : 1, PI + (r() - 0.5) * 0.4, (gx * 7 + gz * 3) | 0);
    }
    for (let i = 0; i < 8; i++) for (let j = 0; j < 5; j++) P.grave(this, -25.2 + i * 1.75, -78 - j * 2.45, 2, PI, i * 9 + j);
    P.fence(this, -27, -76.8, -10.8, -76.8, false, 0.2); P.fence(this, -27, -90.6, -10.8, -90.6, false, 0.2);
    this.addClue('graves', -18.5, -76.4, 0.9, 'Examine the small graves', 2.8);
    this.listen.push({ id: 'echo_children', x: -18.5, z: -83, r: 10 });
    this.addShrine(6.4, -70.5, -0.8);
    P.deadTree(this, 12, -78, 1.5, 71, true); P.deadTree(this, -8, -92, 1.4, 72, true); P.deadTree(this, 26, -90, 1.6, 73, true); P.deadTree(this, -30, -74, 1.3, 74);
    P.growth(this, 9, -86, 1.4, 75); P.growth(this, -6, -80, 1.1, 76, false); P.growth(this, 22, -78, 1.5, 77); P.growth(this, -29, -93, 1.6, 78); P.growth(this, 17, -96, 1.3, 79, false);
    P.torch(this, -2.4, -74, false); P.torch(this, 4.6, -90, true);
    this.spawn('husk', -8, -75.5, { dormant: 'lying' }); this.spawn('husk', 10, -80.5, { dormant: 'lying' }); this.spawn('husk', 18, -90, { dormant: 'lying' }); this.spawn('husk', -5, -88);
    this.spawn('wailer', 14, -85); this.spawn('strzyga', -29, -82); this.spawn('husk', -13.5, -93.5);
  }

  _churchyard() {
    P.church(this);
    P.torch(this, -5.6, -101.6, true, 2.6); P.torch(this, 5.6, -101.6, true, 2.6);
    P.growth(this, -16, -106, 2, 81); P.growth(this, 16.5, -104, 2.2, 82); P.growth(this, -22, -118, 2.4, 83); P.growth(this, 22, -122, 2, 84); P.growth(this, -9, -101, 1.2, 85, false); P.growth(this, 26, -138, 2.2, 86); P.growth(this, -27, -140, 2.4, 87);
    P.deadTree(this, -14, -100, 1.5, 88, true); P.deadTree(this, 13.5, -99, 1.4, 89, true); P.deadTree(this, 30, -112, 1.7, 90); P.deadTree(this, -32, -108, 1.6, 91, true);
    // lectern in the porch with the confession
    const B = new Builder(); B.box('wood', 0.16, 1.2, 0.16, 0, 0.6, 0, 0x3a2e25); B.box('plank', 0.7, 0.06, 0.55, 0, 1.25, 0, 0x4a3c30, 0.45, 0, 0); B.box('plain', 0.45, 0.02, 0.4, 0, 1.3, 0, 0xcbbd98, 0.45, 0, 0);
    B.flush(this.batch, mat4(-2.3, CHURCH.y, -106.2, 0, 0.5, 0));
    this.addCircle(-2.3, -106.2, 0.35); this.addClue('confession', -2.0, -105.6, 1.35, "Read the priest's hand");
    this.spawn('brute', 0.5, -97, { yaw: 0, sexton: true });
  }

  _wilds() {
    const r = this.r;
    for (let i = 0; i < 60; i++) {
      const x = lerp(BOUNDS.minX + 2, BOUNDS.maxX - 2, r()), z = lerp(BOUNDS.minZ + 2, BOUNDS.maxZ - 4, r());
      if (!this.free(x, z, 3.2) || pathDist(x, z) < 5 || (z < -100 && Math.abs(x) < 16)) continue;
      const c = corruption(x, z);
      if (r() < 0.3 + c * 0.4) P.growth(this, x, z, 0.6 + r() * 1.1 + c * 0.6, 200 + i, r() < 0.35);
      else P.deadTree(this, x, z, 0.9 + r() * 0.8, 300 + i, r() < c * 0.6);
    }
  }
  /** True if (x,z) is clear of colliders by margin m. */
  free(x, z, m = 0.5) {
    if (Math.hypot(x - SQUARE.x, z - SQUARE.z) < SQUARE.r + m) return false;
    for (const c of this.circles) if (Math.hypot(x - c.x, z - c.z) < c.r + m) return false;
    for (const b of this.boxes) { const dx = x - b.x, dz = z - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c; if (Math.abs(lx) < b.hx + m && Math.abs(lz) < b.hz + m) return false; }
    return true;
  }

  _forest() {
    const r = this.r, B = new Builder();
    B.cyl('plain', 0.1, 0.22, 3.2, 0, 1.6, 0, 0x231a14, 0, 0, 0, 5);
    for (let i = 0; i < 4; i++) B.cone('plain', 1.5 - i * 0.3, 2.1, 0, 2.6 + i * 1.15, 0, i % 2 ? 0x16201a : 0x121a15, 0, i * 0.7, 0, 7);
    const pine = bake(B, 0.25);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    const N = 760, im = new THREE.InstancedMesh(pine, mat, N), m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    let n = 0;
    for (let i = 0; i < 6000 && n < N; i++) {
      const x = lerp(-105, 105, r()), z = lerp(-205, 140, r());
      const inside = Math.abs(x) < BOUNDS.maxX + 1.5 && z > BOUNDS.minZ - 1.5 && z < BOUNDS.maxZ + 1.5;
      if (inside || (Math.abs(x) < 3.6 && z > 100)) continue;
      const edge = Math.max(Math.abs(x) - BOUNDS.maxX, BOUNDS.minZ - z, z - BOUNDS.maxZ);
      if (edge > 14 && r() < 0.55) continue;
      const s = 1.3 + r() * 1.6, c = corruption(x, z);
      q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.12, r() * TAU, (r() - 0.5) * 0.12));
      m.compose(new THREE.Vector3(x, terrainHeight(x, z) - 0.2, z), q, new THREE.Vector3(s, s * (0.9 + r() * 0.5), s));
      im.setMatrixAt(n, m); col.setRGB(1 + c * 0.5, 1 - c * 0.45, 1 - c * 0.4).multiplyScalar(0.7 + r() * 0.6); im.setColorAt(n, col); n++;
    }
    im.count = n; im.castShadow = false; im.receiveShadow = false; im.instanceMatrix.needsUpdate = true; this.scene.add(im);
    // birches around Dedko's hut — the only gold left in the valley
    const BB = new Builder();
    BB.cyl('plain', 0.07, 0.13, 6.5, 0, 3.25, 0, 0xb9b6a8, 0, 0, 0, 6);
    for (let i = 0; i < 7; i++) BB.box('plain', 0.2, 0.06, 0.2, 0, 0.5 + i * 0.8 + (i % 3) * 0.2, 0, 0x151312, 0, i * 1.3, 0);
    for (let i = 0; i < 5; i++) { const a = i * 1.9, h = 3.6 + i * 0.6; BB.between('plain', [0, h, 0], [Math.sin(a) * 1.4, h + 1, Math.cos(a) * 1.4], 0.04, 0.015, 0xb9b6a8, 4); BB.sph('plain', 0.6, Math.sin(a) * 1.3, h + 1.1, Math.cos(a) * 1.3, [0x8a6e1e, 0x7a5e1a, 0x9a7a22][i % 3], 1.2, 0.55, 1.2, 5); }
    const birch = bake(BB, 0.25), bm = new THREE.InstancedMesh(birch, mat, 34);
    let k = 0;
    for (let i = 0; i < 400 && k < 34; i++) {
      const x = lerp(-45, -22, r()), z = lerp(14, 42, r());
      if (!this.free(x, z, 1.4)) continue;
      const s = 0.8 + r() * 0.5; q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.1, r() * TAU, (r() - 0.5) * 0.1));
      m.compose(new THREE.Vector3(x, terrainHeight(x, z) - 0.1, z), q, new THREE.Vector3(s, s, s)); bm.setMatrixAt(k, m); col.setScalar(0.8 + r() * 0.4); bm.setColorAt(k, col); k++;
      this.addCircle(x, z, 0.22);
    }
    bm.count = k; bm.castShadow = true; this.scene.add(bm);
  }

  _grass() {
    const r = this.r, pos = [], col = [];
    // a tuft: nine thin two-segment blades that bend outward
    const blade = (a, h, w, lean, ox, oz) => {
      const dx = Math.cos(a) * w, dz = Math.sin(a) * w, lx = Math.cos(a + 1.57) * lean, lz = Math.sin(a + 1.57) * lean;
      const mx = ox + lx * 0.35, mz = oz + lz * 0.35, mh = h * 0.55, tx = ox + lx, tz = oz + lz;
      pos.push(ox - dx, 0, oz - dz, ox + dx, 0, oz + dz, mx + dx * 0.7, mh, mz + dz * 0.7,
        ox - dx, 0, oz - dz, mx + dx * 0.7, mh, mz + dz * 0.7, mx - dx * 0.7, mh, mz - dz * 0.7,
        mx - dx * 0.7, mh, mz - dz * 0.7, mx + dx * 0.7, mh, mz + dz * 0.7, tx, h, tz);
      col.push(0.45, 0.45, 0.45, 0.45, 0.45, 0.45, 0.75, 0.75, 0.75, 0.45, 0.45, 0.45, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 1, 1, 1);
    };
    { const R = rng(4242); for (let i = 0; i < 9; i++) { const a = R() * TAU, d = R() * 0.2; blade(R() * TAU, 0.28 + R() * 0.34, 0.016 + R() * 0.01, (R() - 0.3) * 0.3, Math.cos(a) * d, Math.sin(a) * d); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    const na = g.attributes.normal; for (let i = 0; i < na.count; i++) na.setXYZ(i, 0, 1, 0);
    const gmat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 });
    this.wind = { value: 0 };
    gmat.onBeforeCompile = (sh) => {
      sh.uniforms.wind = this.wind;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float wind;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec2 ip = instanceMatrix[3].xz; float tipW = clamp((color.r - .45) / .55, 0., 1.);
          float gust = sin(wind * 1.6 + ip.x * .31 + ip.y * .23) + .5 * sin(wind * 3.7 + ip.x * 1.3 - ip.y * .9) + .6 * sin(wind * .5 + ip.y * .07);
          transformed.xz += tipW * tipW * vec2(.16, .09) * gust;`);
    };
    const N = 64000, im = new THREE.InstancedMesh(g, gmat, N);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), dead = C(0x5a5a34), dry = C(0x7a6e3c), sick = C(0x2a1c22), wheat = C(0x857238);
    let n = 0;
    for (let i = 0; i < 260000 && n < N; i++) {
      const x = lerp(BOUNDS.minX - 6, BOUNDS.maxX + 6, r()), z = lerp(BOUNDS.minZ - 4, BOUNDS.maxZ + 10, r());
      const field = x > -41 && x < -8 && z > 35 && z < 63;
      if (pathDist(x, z) < 2.6 || Math.hypot(x - SQUARE.x, z - SQUARE.z) < SQUARE.r + 0.6 || (z < -99 && Math.abs(x) < 14 && z > -152)) continue;
      if (!field && fbm(x * 0.12 + 5, z * 0.12) < 0.4 && r() < 0.7) continue;
      if (!this.free(x, z, 0.1)) continue;
      const cor = corruption(x, z), s = (field ? 1.7 : 0.8) + r() * 0.8;
      q.setFromEuler(new THREE.Euler(0, r() * TAU, 0));
      m.compose(new THREE.Vector3(x, terrainHeight(x, z) - 0.03, z), q, new THREE.Vector3(s, s * (1 - cor * 0.35), s)); im.setMatrixAt(n, m);
      c.copy(field ? wheat : dead).lerp(dry, r() * 0.6).lerp(sick, clamp(cor * 1.1 - 0.15 + (r() - 0.5) * 0.3, 0, 0.92)).multiplyScalar(0.55 + r() * 0.5); im.setColorAt(n, c); n++;
    }
    im.count = n; im.receiveShadow = true; im.instanceMatrix.needsUpdate = true; this.scene.add(im);
  }

  // ---------- lights ----------
  _lightPool() {
    this.pool = [];
    for (let i = 0; i < 7; i++) { const l = new THREE.PointLight(0xffffff, 0, 14, 1.8); this.scene.add(l); this.pool.push(l); }
    this._cand = [];
  }
  updateLights(t, px, py, pz) {
    const cand = this._cand; cand.length = 0;
    const consider = (s) => { if (s.i <= 0) return; const d = Math.hypot(s.x - px, s.z - pz); if (d > 46 + s.r) return; s._d = d; s._score = d / (s.prio || 1); cand.push(s); };
    for (const s of this.lights) consider(s);
    for (const s of this.dyn) consider(s);
    cand.sort((a, b) => a._score - b._score);
    const beat = this.pulse;
    for (let k = 0; k < this.pool.length; k++) {
      const L = this.pool[k], s = cand[k];
      if (!s) { L.intensity = 0; continue; }
      let f = sstep(46 + s.r, 30 + s.r, s._d);
      if (s.flicker) f *= 0.86 + 0.12 * Math.sin(t * 13 + s.x * 3) + 0.08 * Math.sin(t * 29.3 + s.z);
      if (s.pulse) f *= 0.5 + beat * 0.9;
      L.position.set(s.x, s.y, s.z); L.color.set(s.color); L.intensity = s.i * f; L.distance = s.r;
    }
    this.dyn.length = 0;
  }

  // ---------- barriers ----------
  _barriers() {
    const mk = (x, y, z, w, h) => {
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, uniforms: { time: { value: 0 }, alpha: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
        fragmentShader: `varying vec2 vUv; uniform float time, alpha;
          float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
          float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
          void main(){ float n = noise(vUv*vec2(5.,7.) + vec2(time*.3, -time*.7)) * .6 + noise(vUv*vec2(11.,15.) - vec2(time*.2, time*1.1)) * .4;
            float edge = smoothstep(0.,.12,vUv.x)*smoothstep(1.,.88,vUv.x)*smoothstep(1.,.6,vUv.y);
            vec3 c = mix(vec3(.03,.0,.0), vec3(1.4,.2,.06), smoothstep(.45,.85,n));
            gl_FragColor = vec4(c, (.55 + n*.45) * edge * alpha); }`,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); mesh.position.set(x, y + h / 2, z); mesh.visible = false; mesh.renderOrder = 9; this.scene.add(mesh);
      return { mesh, mat, on: false, a: 0 };
    };
    const S = SQUARE, gy = groundHeight(S.x, S.z);
    this.barriers = { sqS: mk(S.x, gy, S.z + S.r, 7.4, 5.5), sqN: mk(S.x, gy, S.z - S.r, 7.4, 5.5), door: mk(CHURCH.x, CHURCH.y, CHURCH.doorZ, 5.2, 5.6) };
    this.doorBox = this.addBox(CHURCH.x, CHURCH.doorZ, 2.6, 0.5, 0, 6);
    // the seal of the Pale Sun on the church door, bound to a heartbeat
    const B = new Builder(), bt = new Batch();
    B.box('metal', 6.6, 0.16, 0.12, 0, 2.9, 0, 0x2e2c2a, 0, 0, 0.62); B.box('metal', 6.6, 0.16, 0.12, 0, 2.9, 0.04, 0x2e2c2a, 0, 0, -0.62);
    P.sunEmblem(B, 0, 2.9, 0.14, 1.5);
    B.flush(bt, mat4(CHURCH.x, CHURCH.y, CHURCH.doorZ + 0.75));
    const sealMat = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xfff0b0, emissiveIntensity: 0.6, metalness: 0.5, roughness: 0.5 });
    this.sealMat = sealMat;
    this.seal = bt.build(this.scene, { metal: sealMat, plain: sealMat });
    this.sealLight = { x: CHURCH.x, y: CHURCH.y + 3, z: CHURCH.doorZ + 1.5, color: 0xfff0c0, i: 22, r: 12, pulse: true, prio: 2 };
    this.lights.push(this.sealLight);
    this.setBarrier('sqN', true); this.setBarrier('door', true);
  }
  setBarrier(name, on) {
    const b = this.barriers[name]; b.on = on;
    if (name === 'sqS') this.squareRing.gaps[0].closed = on;
    if (name === 'sqN') this.squareRing.gaps[1].closed = on;
    if (name === 'door') this.doorBox.off = !on;
  }
  breakSeal() { for (const m of this.seal) m.visible = false; this.sealLight.i = 0; }

  // ---------- collision ----------
  resolve(p, r) {
    for (let it = 0; it < 2; it++) {
      for (const c of this.circles) {
        const dx = p.x - c.x, dz = p.z - c.z, rr = r + c.r, d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-8) { const d = Math.sqrt(d2); p.x = c.x + (dx / d) * rr; p.z = c.z + (dz / d) * rr; }
      }
      for (const b of this.boxes) {
        if (b.off) continue;
        const dx = p.x - b.x, dz = p.z - b.z;
        if (Math.abs(dx) + Math.abs(dz) > (b.hx + b.hz + r) * 1.5) continue;
        const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
        const qx = clamp(lx, -b.hx, b.hx), qz = clamp(lz, -b.hz, b.hz), ex = lx - qx, ez = lz - qz, d2 = ex * ex + ez * ez;
        if (d2 >= r * r) continue;
        let nx, nz, pen;
        if (d2 > 1e-8) { const d = Math.sqrt(d2); nx = ex / d; nz = ez / d; pen = r - d; }
        else { const px = b.hx - Math.abs(lx), pz = b.hz - Math.abs(lz); if (px < pz) { nx = Math.sign(lx) || 1; nz = 0; pen = px + r; } else { nx = 0; nz = Math.sign(lz) || 1; pen = pz + r; } }
        const ax = lx + nx * pen, az = lz + nz * pen;
        p.x = b.x + ax * b.c + az * b.s; p.z = b.z - ax * b.s + az * b.c;
      }
    }
    for (const g of this.rings) {
      const dx = p.x - g.x, dz = p.z - g.z, d = Math.hypot(dx, dz);
      if (Math.abs(d - g.r) < r + 0.45 && d > 0.01) {
        const ang = Math.atan2(dx, dz); let open = false;
        for (const gap of g.gaps) if (!gap.closed && Math.abs(angDiff(ang, gap.a)) < gap.half - r / g.r) open = true;
        if (!open) { const tgt = d < g.r ? g.r - r - 0.45 : g.r + r + 0.45; p.x = g.x + (dx / d) * tgt; p.z = g.z + (dz / d) * tgt; }
      }
    }
    p.x = clamp(p.x, BOUNDS.minX, BOUNDS.maxX); p.z = clamp(p.z, BOUNDS.minZ, BOUNDS.maxZ);
  }
  /** Is this point inside something solid (for the camera)? */
  occluded(x, y, z) {
    for (const b of this.boxes) {
      if (b.off || y > b.top) continue;
      const dx = x - b.x, dz = z - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
      if (Math.abs(lx) < b.hx + 0.25 && Math.abs(lz) < b.hz + 0.25) return true;
    }
    return false;
  }

  update(dt, t, px, py, pz, fx, found) {
    const beatPhase = (t * 1.15) % 1;
    this.pulse = Math.exp(-beatPhase * 9) + 0.7 * Math.exp(-Math.abs(beatPhase - 0.28) * 14) * (beatPhase > 0.28 ? 1 : 0.2);
    this.mats.glow.emissiveIntensity = 1.3 + this.pulse * 2.6;
    this.mats.fire.emissiveIntensity = 2.8 + Math.sin(t * 17) * 0.5;
    this.mats.window.emissiveIntensity = 1.0 + this.pulse * 0.9;
    this.sealMat.emissiveIntensity = 0.4 + this.pulse * 1.6;
    this.skyMat.uniforms.time.value = t; this.beamMat.uniforms.time.value = t; this.wind.value = t;
    const c = sstep(60, -105, pz);
    this.fogColor.copy(FOG_A).lerp(FOG_B, c * 0.85);
    this.skyMat.uniforms.horizon.value.copy(this.fogColor);
    this.sky.position.set(px, 0, pz);
    for (const k in this.barriers) {
      const b = this.barriers[k]; b.a += ((b.on ? 1 : 0) - b.a) * Math.min(1, dt * 3);
      b.mesh.visible = b.a > 0.01; b.mat.uniforms.alpha.value = b.a; b.mat.uniforms.time.value = t;
    }
    for (const e of this.emitters) {
      if (e.clue && found.has(e.clue)) continue;
      if (Math.abs(e.x - px) > 36 || Math.abs(e.z - pz) > 36) continue;
      e.acc = (e.acc || 0) + e.rate * dt;
      while (e.acc > 1) {
        e.acc -= 1;
        if (e.type === 'flame') fx.flame(e.x, e.y, e.z, e.size || 1); else if (e.type === 'curse') fx.curseMote(e.x, e.y, e.z); else if (e.type === 'glint') fx.glint(e.x, e.y, e.z);
      }
    }
    for (const l of this.listen) {
      if (found.has(l.id) || Math.hypot(l.x - px, l.z - pz) > 30) continue;
      l.acc = (l.acc || 0) + 5 * dt; while (l.acc > 1) { l.acc -= 1; fx.echo(l.x, groundHeight(l.x, l.z) + 0.3, l.z); }
    }
    this.updateLights(t, px, py, pz);
  }
}
