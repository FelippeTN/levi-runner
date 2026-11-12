// Câmera (seguimento, FOV, tremida), luz do sol com sombra estável e partículas.

import {
  BoxGeometry,
  DataTexture,
  DirectionalLight,
  EquirectangularReflectionMapping,
  FloatType,
  Fog,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  RGBAFormat,
  Vector3,
} from "three";
import { FOG_END, MAX_SPEED, START_SPEED } from "./config.js";
import { Phase } from "./game.js";
import { srgb } from "./util.js";
import { HORIZON } from "./world/backdrop.js";

/** Lado da textura de sombras. */
export const SHADOW_MAP = 2048;
/** Trecho do mundo que recebe sombra (cantos opostos). Cobre o que a câmera vê até o fim das sombras (90 m). */
const SHADOW_BOX = [new Vector3(-40, 0, -85), new Vector3(40, 30, 12)];
/** Sol de fim de tarde, alto e à esquerda: sombras longas e legíveis. */
const SUN_FROM = new Vector3(-14, 18, 6);
/** Folga na direção do sol para prédios altos fora da caixa ainda projetarem sombra. */
const SHADOW_REACH = 60;

/** Base do sol (câmera de sombra olhando para a origem); a transposta leva do mundo para o sol. */
export const SUN_BASIS = new Matrix4().lookAt(SUN_FROM, new Vector3(), new Vector3(0, 1, 0));
const LIGHT_FROM_WORLD = SUN_BASIS.clone().transpose();

/**
 * Enquadramento da sombra no espaço do sol. O three ajustaria a sombra à câmera, que muda de FOV com a
 * velocidade, e o mundo rola sobre a grade de texels parada: cada borda cai num texel diferente a cada
 * quadro e a sombra treme. Aqui a área é fixa e a grade anda junto com o mundo, então cada objeto cai
 * sempre nos mesmos texels.
 * @param {number} scrolled quanto o mundo já rolou
 */
export function shadowFrame(scrolled) {
  const min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
  const [a, b] = SHADOW_BOX;
  for (let i = 0; i < 8; i++) {
    const corner = new Vector3(i & 1 ? b.x : a.x, i & 2 ? b.y : a.y, i & 4 ? b.z : a.z).applyMatrix4(LIGHT_FROM_WORLD);
    min.min(corner);
    max.max(corner);
  }
  // +1 m: o centro abaixo anda até 1 texel para o lado, e a caixa precisa continuar coberta
  const diameter = Math.ceil(Math.max(max.x - min.x, max.y - min.y)) + 1;
  const texel = diameter / SHADOW_MAP;
  // centro em múltiplos de texel contados a partir de um ponto que rola com o mundo
  const anchor = new Vector3(0, 0, scrolled).applyMatrix4(LIGHT_FROM_WORLD);
  const snap = (mid, o) => o + Math.floor((mid - o) / texel) * texel;
  const center = new Vector3(snap((min.x + max.x) / 2, anchor.x), snap((min.y + max.y) / 2, anchor.y), max.z);
  return { center, diameter, depth: max.z - min.z, texel };
}

/** Força da luz do céu da Poly Haven (o céu uniforme de reserva usa 1,3). */
const SKY_INTENSITY = 1.6;

// reaproveitados pela câmera a cada quadro (sem lixo para o coletor)
const _eye = new Vector3(), _look = new Vector3(), _to = new Vector3();

export class Fx {
  trauma = 0;
  x = 0;
  /** 0 = close do menu, 1 = câmera de corrida */
  zoom = 0;
  t = 0;
  /** @type {{mesh: Mesh, vel: Vector3, life: number, max: number, size: number}[]} */
  particles = [];

  /** @param {import("three").Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.camera = new PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 2000);
    this.camera.position.set(0, 2.4, 5.5);
    this.camera.lookAt(0, 1.1, 0);

    scene.background = HORIZON;
    scene.fog = new Fog(HORIZON, 80, FOG_END);
    // céu uniforme como luz ambiente (difusa e especular, para os metais não ficarem pretos)
    const sky = srgb(0.75, 0.85, 1);
    const env = new DataTexture(new Float32Array([sky.r, sky.g, sky.b, 1]), 1, 1, RGBAFormat, FloatType);
    env.mapping = EquirectangularReflectionMapping;
    env.needsUpdate = true;
    scene.environment = env;
    scene.environmentIntensity = 1.3;

    const sun = (this.sun = new DirectionalLight(srgb(1, 0.9, 0.75), 11));
    sun.castShadow = true;
    sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);
    this.#placeSun(0);

    this.cube = new BoxGeometry(1, 1, 1);
    const unlit = (r, g, b) => new MeshBasicMaterial({ color: srgb(r, g, b) });
    this.mats = { dust: unlit(0.85, 0.8, 0.7), gold: unlit(1, 0.9, 0.3), debris: [unlit(0.98, 0.78, 0.1), unlit(0.95, 0.45, 0.1), unlit(0.9, 0.9, 0.9)] };
  }

  /**
   * Troca o céu uniforme pelo céu de verdade (assets/sky.hdr, da Poly Haven): luz ambiente mais clara em cima
   * que no horizonte, e reflexos com nuvens.
   * @param {import("three").DataTexture} sky
   */
  setSky(sky) {
    sky.mapping = EquirectangularReflectionMapping;
    this.scene.environment = sky;
    this.scene.environmentIntensity = SKY_INTENSITY;
  }

  #placeSun(scrolled) {
    const f = shadowFrame(scrolled);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -f.diameter / 2;
    cam.right = cam.top = f.diameter / 2;
    cam.near = 0;
    cam.far = f.depth + SHADOW_REACH;
    cam.updateProjectionMatrix();
    this.sun.position.copy(f.center).setZ(f.center.z + SHADOW_REACH).applyMatrix4(SUN_BASIS);
    this.sun.target.position.copy(f.center).applyMatrix4(SUN_BASIS);
  }

  /**
   * @param {import("./game.js").Game} game
   * @param {import("./player.js").Player} player
   * @param {import("./game.js").Events} events
   * @param {number} dz quanto o mundo rolou neste quadro
   */
  update(dt, game, player, events, dz) {
    this.#camera(dt, game, player, events);
    this.#placeSun(game.distance);
    this.#particles(dt, game, events, dz);
  }

  #camera(dt, game, player, events) {
    for (const s of events.shake) this.trauma = Math.min(this.trauma + s, 1);
    this.t += dt;
    this.trauma = Math.max(this.trauma - 1.4 * dt, 0);
    const p = player.root.position;
    const dx = p.x * 0.7 - this.x;
    this.x += dx * Math.min(5 * dt, 1);
    const zoom = game.phase === Phase.Ready ? 0 : 1;
    this.zoom += (zoom - this.zoom) * Math.min(2.5 * dt, 1);

    const k = this.trauma * this.trauma * 0.4;
    const lift = p.y;
    // no teto dos veículos a câmera sobe junto
    const eye = _eye.set(this.x, 2.4, 5.5).lerp(_to.set(this.x, 5.5 + lift * 0.6, 9), this.zoom);
    eye.x += Math.sin(this.t * 37) * k;
    eye.y += Math.sin(this.t * 53) * k;
    const look = _look.set(this.x, 1.1, 0).lerp(_to.set(this.x, 1.5 + lift * 0.5, -6), this.zoom);
    const cam = this.camera;
    cam.position.copy(eye);
    cam.lookAt(look);
    cam.rotateZ(-dx * 0.04);

    const rush = Math.min(Math.max((game.speed - START_SPEED) / (MAX_SPEED - START_SPEED), 0), 1);
    const fov = 52 + 14 * rush * this.zoom;
    if (Math.abs(cam.fov - fov) > 1e-3) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }

  #particles(dt, game, events, dz) {
    for (const { pos, kind } of events.burst) {
      const [n, speed, up, size] = { dust: [10, 2, 1.5, 0.14], sparkle: [8, 2.5, 2.5, 0.1], debris: [24, 5, 5, 0.2] }[kind];
      for (let i = 0; i < n; i++) {
        const r = () => (game.rand() % 1000) / 500 - 1;
        const vel = new Vector3(r() * speed, (Math.abs(r()) + 0.5) * up, r() * speed);
        const mat = kind === "dust" ? this.mats.dust : kind === "sparkle" ? this.mats.gold : this.mats.debris[i % 3];
        const life = 0.4 + 0.3 * Math.abs(r());
        const mesh = new Mesh(this.cube, mat);
        mesh.position.copy(pos);
        mesh.scale.setScalar(size);
        this.scene.add(mesh);
        this.particles.push({ mesh, vel, life, max: life, size });
      }
    }
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.removeFromParent();
        continue;
      }
      p.vel.y -= 12 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.position.z += dz; // rola com o mundo
      if (p.mesh.position.y < 0.05) {
        p.mesh.position.y = 0.05;
        p.vel.multiplyScalar(0.5);
      }
      p.mesh.scale.setScalar((p.size * p.life) / p.max);
      p.mesh.rotateX(6 * dt);
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  /** Corrida nova: partículas também rolam com o mundo e somem junto. */
  clear() {
    for (const p of this.particles) p.mesh.removeFromParent();
    this.particles = [];
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
