// Renderizador e pós-processamento: HDR com MSAA → bloom nos brilhos → tone mapping → saturação extra.

import { NeutralToneMapping, HalfFloatType, PCFShadowMap, Vector2, WebGLRenderer, WebGLRenderTarget } from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

/** Cara de desenho animado: cores bem saturadas depois do tone mapping. */
const Saturation = {
  uniforms: { tDiffuse: { value: null }, amount: { value: 1.35 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float amount;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      gl_FragColor = vec4(clamp(mix(vec3(l), c.rgb, amount), 0.0, 1.0), c.a);
    }`,
};

/**
 * @param {HTMLCanvasElement} canvas
 * @param {import("three").Scene} scene
 * @param {import("three").Camera} camera
 */
export function createRenderer(canvas, scene, camera) {
  const renderer = new WebGLRenderer({ canvas, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 2 ** 0.15;

  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  // só o que passa bem do branco brilha: lâmpadas, faróis, LEDs, moedas
  const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.35, 0.4, 5);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass(Saturation));

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    return w / h;
  };
  return { renderer, composer, resize };
}
