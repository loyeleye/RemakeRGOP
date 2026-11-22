// Demo only: an "ink" look for the 3D board. It draws the scene into its own target, then
// flattens the lighting into a few bands (toon shading) and inks outlines where depth or
// colour breaks. Lights and wisps above a brightness cut-off are left alone so bloom still
// works. Switched on with ?ink in the URL or window.lanternfall.ink(true).

import * as THREE from "three";
import { Pass, FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";

const FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 texel;
uniform float near;
uniform float far;
uniform float bands;
uniform float line;
varying vec2 vUv;

float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
// A strong curve, so dusk and night scenes still split into several bands.
float perceived(float l) { return pow(clamp(l, 0.0, 1.0), 0.3); }
float depthAt(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, near, far); }
float lumAt(vec2 uv) { return perceived(lum(texture2D(tColor, uv).rgb)); }

void main() {
  vec2 o = texel * line;
  vec3 raw = texture2D(tColor, vUv).rgb;
  // A small blur flattens texture grain before the lighting is cut into bands.
  vec3 c = (raw * 2.0
    + texture2D(tColor, vUv + vec2(o.x, 0.0)).rgb + texture2D(tColor, vUv - vec2(o.x, 0.0)).rgb
    + texture2D(tColor, vUv + vec2(0.0, o.y)).rgb + texture2D(tColor, vUv - vec2(0.0, o.y)).rgb) / 6.0;
  float l = lum(c);
  // Cut the lighting into flat bands (in perceived brightness), each drawn at its centre.
  float lp = perceived(l);
  float nb = max(bands, 1.0);
  float q = (floor(min(lp, 0.999) * nb) + 0.5) / nb;
  float lq = pow(q, 3.333);
  vec3 hue = l > 1e-4 ? c / l : vec3(0.0);
  // A little extra saturation so the flat colours read as colour, not grey.
  hue = mix(vec3(1.0), hue, 1.25);
  vec3 toon = max(hue, 0.0) * lq;
  // The darkest band goes to near-black ink.
  toon = mix(vec3(0.004, 0.005, 0.01), toon, step(1.0 / nb, lp));
  // Keep fire, wisps and lamps as they are, so they still glow and bloom.
  float bright = smoothstep(0.8, 1.4, lum(raw));
  // With bands at 0 the materials do the toon shading themselves and this pass only inks lines.
  vec3 col = bands > 0.5 ? mix(toon, raw, bright) : raw;

  // Outlines: a break in depth (second difference, so a tilted floor stays clean).
  float d = depthAt(vUv);
  float dl = depthAt(vUv - vec2(o.x, 0.0)), dr = depthAt(vUv + vec2(o.x, 0.0));
  float du = depthAt(vUv + vec2(0.0, o.y)), dd = depthAt(vUv - vec2(0.0, o.y));
  float dEdge = (abs(dl + dr - 2.0 * d) + abs(du + dd - 2.0 * d)) / max(d, 0.001);
  float edge = smoothstep(0.012, 0.03, dEdge);
  // And a strong break in colour, for seams between tiles and the faces of props.
  float gx = lumAt(vUv + vec2(o.x, 0.0)) - lumAt(vUv - vec2(o.x, 0.0));
  float gy = lumAt(vUv + vec2(0.0, o.y)) - lumAt(vUv - vec2(0.0, o.y));
  float cEdge = smoothstep(0.10, 0.22, length(vec2(gx, gy))) * (1.0 - bright);
  // Far things (sky, distant islands) get thinner lines.
  float fade = 1.0 - smoothstep(60.0, 140.0, d);
  edge = max(edge, cEdge * 0.85) * fade;

  gl_FragColor = vec4(mix(col, vec3(0.004, 0.005, 0.01), edge), 1.0);
}`;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class InkPass extends Pass {
  private target: THREE.WebGLRenderTarget;
  private quad: FullScreenQuad;
  private material: THREE.ShaderMaterial;

  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera) {
    super();
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(1, 1) });
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        texel: { value: new THREE.Vector2(1, 1) },
        near: { value: 0.1 },
        far: { value: 1000 },
        bands: { value: 0 },
        line: { value: 1.5 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  override setSize(w: number, h: number) {
    this.target.setSize(w, h);
    this.material.uniforms.texel!.value.set(1 / w, 1 / h);
    // Keep the line about the same weight on any screen.
    this.material.uniforms.line!.value = Math.max(1, h / 620);
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    this.material.uniforms.near!.value = this.camera.near;
    this.material.uniforms.far!.value = this.camera.far;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}
