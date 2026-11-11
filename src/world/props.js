// Modelos dos obstáculos, montados uma vez e clonados (geometria e material compartilhados).

import { LOD, Mesh } from "three";
import { CAR_LEN } from "../config.js";
import { qx, qz, tf } from "../util.js";
import { Batch } from "./batch.js";

const HALF_PI = Math.PI / 2;

/** Veículo do bairro (ônibus, VLT ou bonde), centrado na caixa de colisão. */
function vehicle(art, [body, roof]) {
  const b = new Batch();
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
function barrier(art) {
  const b = new Batch();
  for (const y of [0.28, -0.12]) b.add(art.rBoard, art.barrier, tf(0, y, 0));
  for (const s of [-0.8, 0.8]) {
    for (const tilt of [-0.28, 0.28]) b.add(art.rLeg, art.white, tf(s, -0.03, 0, qx(tilt)));
    b.add(art.sphere, art.blink, tf(s, 0.52, 0, undefined, 0.1));
  }
  return b.build();
}

/** Placa de obra suspensa (passa-se rolando por baixo). */
function sign(art) {
  const b = new Batch();
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
    this.vehicles = art.vehicles.map((paint) => vehicle(art, paint));
    this.barrierModel = barrier(art);
    this.signModel = sign(art);
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
  coin() {
    const lod = new LOD();
    for (const [geometry, distance] of this.art.coinLevels) {
      const m = new Mesh(geometry, this.art.coinMat);
      m.rotation.x = HALF_PI;
      m.castShadow = true;
      lod.addLevel(m, distance);
    }
    return lod;
  }
  ramp() {
    const m = new Mesh(this.art.ramp, this.art.rampMat);
    m.castShadow = m.receiveShadow = true;
    return m;
  }
}
