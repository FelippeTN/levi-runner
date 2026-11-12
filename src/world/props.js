// Modelos dos obstáculos, montados uma vez e clonados (geometria e material compartilhados), cada um com
// LOD de perto e de longe; moedas desenhadas todas juntas, instanciadas.

import { DynamicDrawUsage, InstancedMesh, LOD, Matrix4, Mesh, Vector3 } from "three";
import { CAR_LEN } from "../config.js";
import { qx, qz, tf } from "../util.js";
import { Batch } from "./batch.js";

const HALF_PI = Math.PI / 2;

/** Distância (m) a partir da qual cada obstáculo usa a versão de longe. */
const LOD_FAR = { vehicle: 55, barrier: 35, sign: 35 };
/** Folga em torno do limite para o nível não ficar trocando (fração da distância). */
const LOD_HYSTERESIS = 0.1;

/** Mesmo modelo montado de perto e de longe (`Art.low`) num LOD; o clone do LOD clona os dois níveis. */
function lodModel(art, far, build) {
  const lod = new LOD();
  lod.addLevel(build(new Batch()), 0);
  lod.addLevel(build(new Batch({ low: art.low, palette: art.palette })), far, LOD_HYSTERESIS);
  return lod;
}

/** Veículo do bairro (ônibus, VLT ou bonde), centrado na caixa de colisão. */
function vehicle(b, art, [body, roof]) {
  const front = CAR_LEN / 2;
  b.add(art.rBody, body, tf(0, -0.1, 0));
  b.add(art.rRoof, roof, tf(0, 0.9, 0, qx(HALF_PI), [2.26, 1, 0.95]));
  b.add(art.rFrame, roof, tf(0, 0.3, front - 0.03));
  b.add(art.rWindshield, art.glass, tf(0, 0.3, front + 0.01));
  b.add(art.rLed, art.led, tf(0, 0.8, front - 0.06));
  for (const s of [-1, 1]) {
    b.add(art.sphere, art.headlight, tf(s * 0.7, -0.62, front - 0.02, undefined, [0.2, 0.15, 0.08]));
    b.add(art.rMirror, art.dark, tf(s * 1.2, 0.4, front - 0.5));
  }
  for (const z of [-front, front]) b.add(art.rBumper, art.dark, tf(0, -1, z));
  for (const [wx, wz] of [[-1, -3], [1, -3], [-1, 3], [1, 3]]) {
    b.add(art.cylinder, art.rubber, tf(wx, -1, wz, qz(HALF_PI), [0.44, 0.3, 0.44]));
    b.add(art.cylinder, art.metal, tf(wx * 1.03, -1, wz, qz(HALF_PI), [0.22, 0.3, 0.22]));
  }
  return b.build();
}

/** Cavalete listrado com pisca-piscas (pula-se por cima). */
function barrier(b, art) {
  for (const y of [0.28, -0.12]) b.add(art.rBoard, art.barrier, tf(0, y, 0));
  for (const s of [-0.8, 0.8]) {
    for (const tilt of [-0.28, 0.28]) b.add(art.rLeg, art.white, tf(s, -0.03, 0, qx(tilt)));
    b.add(art.sphere, art.blink, tf(s, 0.52, 0, undefined, 0.1));
  }
  return b.build();
}

/** Placa de obra suspensa (passa-se rolando por baixo). */
function sign(b, art) {
  b.add(art.rPanel, art.sign, tf(0, 0, 0));
  for (const s of [-1.15, 1.15]) {
    b.add(art.cylinder, art.metal, tf(s, -0.7, 0, undefined, [0.07, 2.4, 0.07]));
    b.add(art.sphere, art.metal, tf(s, 0.52, 0, undefined, 0.1));
    b.add(art.sphere, art.dark, tf(s, -1.9, 0, undefined, [0.25, 0.08, 0.25]));
  }
  return b.build();
}

export class Props {
  constructor(art) {
    this.art = art;
    /** um por bairro, na ordem de ZONES */
    this.vehicles = art.vehicles.map((paint) => lodModel(art, LOD_FAR.vehicle, (b) => vehicle(b, art, paint)));
    this.barrierModel = lodModel(art, LOD_FAR.barrier, (b) => barrier(b, art));
    this.signModel = lodModel(art, LOD_FAR.sign, (b) => sign(b, art));
  }

  vehicle(zoneIndex) {
    return this.vehicles[zoneIndex].clone();
  }
  barrier() {
    return this.barrierModel.clone();
  }
  sign() {
    return this.signModel.clone();
  }
  ramp() {
    const m = new Mesh(this.art.ramp, this.art.rampMat);
    m.castShadow = m.receiveShadow = true;
    return m;
  }
}

/** Mais moedas vivas do que isso por nível não aparecem (a pista inteira costuma ter bem menos de 200). */
const COIN_CAPACITY = 1024;
const ONE = new Vector3(1, 1, 1);
const _matrix = new Matrix4();

/**
 * Todas as moedas em 3 draw calls (uma por nível de LOD) em vez de uma por moeda: a cada quadro cada moeda
 * vai para o nível da sua distância até a câmera.
 */
export class Coins {
  /** @param {import("./art.js").Art} art */
  constructor(art) {
    this.levels = art.coinLevels.map(([geometry, from, cast]) => {
      const mesh = new InstancedMesh(geometry, art.coinMat, COIN_CAPACITY);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.count = 0;
      // as instâncias se espalham pela pista toda e mudam a cada quadro: a esfera de recorte não valeria
      mesh.frustumCulled = false;
      mesh.castShadow = cast;
      return { mesh, from };
    });
    this.meshes = this.levels.map((l) => l.mesh);
  }

  /**
   * @param {Iterable<import("three").Object3D>} coins posição e giro de cada moeda (no espaço do mundo)
   * @param {Vector3} eye posição da câmera
   */
  update(coins, eye) {
    const levels = this.levels;
    for (const { mesh } of levels) mesh.count = 0;
    for (const o of coins) {
      const d = o.position.distanceTo(eye);
      let i = levels.length - 1;
      while (i > 0 && d < levels[i].from) i--;
      const mesh = levels[i].mesh;
      if (mesh.count < COIN_CAPACITY) mesh.setMatrixAt(mesh.count++, _matrix.compose(o.position, o.quaternion, ONE));
    }
    for (const { mesh } of levels) {
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
