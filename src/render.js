// Renderizador e pós-processamento: HDR com MSAA → bloom nos brilhos → tone mapping + saturação extra,
// com a resolução se ajustando ao que a máquina aguenta.

import { NeutralToneMapping, HalfFloatType, PCFShadowMap, Vector2, WebGLRenderer, WebGLRenderTarget } from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

/** Cara de desenho animado: cores bem saturadas depois do tone mapping. */
const SATURATION = 1.35;

/**
 * Tone mapping, sRGB e saturação num passe só, direto na tela. Como passe separado a saturação custava mais
 * uma leitura e uma escrita da tela inteira num alvo HDR com MSAA.
 */
function outputPass() {
  const pass = new OutputPass();
  // `material.uniforms` é o mesmo objeto que `pass.uniforms`
  pass.uniforms.saturation = { value: SATURATION };
  const shader = pass.material.fragmentShader;
  const end = shader.lastIndexOf("}");
  pass.material.fragmentShader =
    shader.slice(0, end).replace("uniform sampler2D tDiffuse;", "uniform sampler2D tDiffuse;\nuniform float saturation;") +
    /* glsl */ `
      float luma = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      gl_FragColor.rgb = clamp(mix(vec3(luma), gl_FragColor.rgb, saturation), 0.0, 1.0);
    }`;
  return pass;
}

/** Faixa da resolução adaptativa (pixels de tela por pixel CSS). */
const MAX_RATIO = Math.min(globalThis.devicePixelRatio ?? 1, 2);
const MIN_RATIO = Math.min(0.75, MAX_RATIO);
const RATIO_STEP = 0.25;
/** Média do quadro (ms) acima da qual a resolução cai, e abaixo da qual pode voltar a subir. */
const SLOW_MS = 1000 / 50;
const FAST_MS = 1000 / 58;
/** Janela de medida (s) e quantas janelas rápidas seguidas antes de subir. */
const WINDOW = 1;
const FAST_WINDOWS = 4;

/**
 * Resolução que acompanha o desempenho: cai um degrau quando a média de um segundo passa de `SLOW_MS` e
 * volta a subir depois de alguns segundos folgados. Se subir e logo ter de cair, aquele degrau vira o teto
 * (para não ficar oscilando).
 */
export class Adaptive {
  ratio = MAX_RATIO;
  ceiling = MAX_RATIO;
  #sum = 0;
  #frames = 0;
  #fast = 0;
  #justRaised = false;

  /** @param {(ratio: number) => void} apply */
  constructor(apply) {
    this.apply = apply;
  }

  /** @param {number} ms duração real do quadro */
  frame(ms) {
    // aba em segundo plano ou carregamento: não diz nada sobre a GPU
    if (ms > 100) return;
    this.#sum += ms;
    if (++this.#frames < 10 || this.#sum < WINDOW * 1000) return;
    const avg = this.#sum / this.#frames;
    this.#sum = this.#frames = 0;
    if (avg > SLOW_MS && this.ratio > MIN_RATIO) {
      if (this.#justRaised) this.ceiling = this.ratio - RATIO_STEP;
      this.#set(this.ratio - RATIO_STEP);
      this.#justRaised = false;
      this.#fast = 0;
    } else if (avg < FAST_MS && this.ratio < this.ceiling && ++this.#fast >= FAST_WINDOWS) {
      this.#set(this.ratio + RATIO_STEP);
      this.#justRaised = true;
      this.#fast = 0;
    } else if (avg >= FAST_MS) {
      this.#fast = 0;
      this.#justRaised = false;
    }
  }

  #set(ratio) {
    this.ratio = Math.min(Math.max(ratio, MIN_RATIO), MAX_RATIO);
    this.apply(this.ratio);
  }
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {import("three").Scene} scene
 * @param {import("three").Camera} camera
 */
export function createRenderer(canvas, scene, camera) {
  const renderer = new WebGLRenderer({ canvas, powerPreference: "high-performance" });
  renderer.setPixelRatio(MAX_RATIO);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 2 ** 0.15;
  // o composer chama render() várias vezes por quadro: o laço zera as contas uma vez só (painel ?stats)
  renderer.info.autoReset = false;

  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  // só o que passa bem do branco brilha: lâmpadas, faróis, LEDs, moedas
  const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.35, 0.4, 5);
  composer.addPass(bloom);
  composer.addPass(outputPass());

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    return w / h;
  };
  const adaptive = new Adaptive((ratio) => {
    renderer.setPixelRatio(ratio);
    composer.setPixelRatio(ratio);
    resize();
  });
  return { renderer, composer, resize, adaptive };
}
