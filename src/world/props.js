// Modelos dos obstáculos, montados uma vez e clonados (geometria e material compartilhados).

import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  LOD,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from "three";
import { CAR_LEN } from "../config.js";
import { MAGNET_PRICE, brl } from "../edu/economy.js";
import { qx, qz, tf } from "../util.js";
import { Batch } from "./batch.js";
import { roundedBox } from "./geometry.js";

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

/** Portais de decisão: cor, título e chamada da placa. */
const PORTAL_LOOK = {
  poupar: { color: "#22c55e", title: "POUPAR", sub: "reserva = vida extra" },
  investir: { color: "#3b82f6", title: "INVESTIR", sub: "rende enquanto você corre" },
  comprar: { color: "#f97316", title: "COMPRAR", sub: `ímã de moedas · ${brl(MAGNET_PRICE)}` },
  apostar: { color: "#a855f7", title: "APOSTAR", sub: "DOBRE AGORA!!!" },
};

/** Placa do portal desenhada em canvas (redesenha quando a fonte do jogo termina de carregar). */
function signTexture({ color, title, sub }) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  const draw = () => {
    const c = canvas.getContext("2d");
    c.fillStyle = color;
    c.beginPath();
    c.roundRect(4, 4, 504, 152, 36);
    c.fill();
    c.lineWidth = 8;
    c.strokeStyle = "#fff";
    c.stroke();
    c.textAlign = "center";
    c.fillStyle = "#08193f";
    c.font = '700 74px "Fira Sans Game", system-ui, sans-serif';
    c.fillText(title, 256, 86);
    c.fillStyle = "#fff";
    c.fillText(title, 256, 80);
    c.font = '700 30px "Fira Sans Game", system-ui, sans-serif';
    c.fillText(sub, 256, 128);
    tex.needsUpdate = true;
  };
  draw();
  document.fonts?.load('700 74px "Fira Sans Game"').then(draw, () => {});
  return tex;
}

/** Arco de decisão do tamanho de uma faixa, com membrana translúcida para atravessar. */
function portal(look, flicker) {
  const color = new Color(look.color);
  const post = new MeshStandardMaterial({ color, roughness: 0.4, emissive: color, emissiveIntensity: 0.4 });
  const veil = new MeshBasicMaterial({ color, transparent: true, opacity: 0.22, blending: AdditiveBlending, side: DoubleSide, depthWrite: false });
  const sign = new MeshBasicMaterial({ map: signTexture(look), transparent: true });
  if (flicker) flicker.push(post, veil);
  const g = new Group();
  const postGeo = roundedBox([0.22, 3.4, 0.22], 0.1);
  for (const s of [-1, 1]) {
    const m = new Mesh(postGeo, post);
    m.position.set(s * 1.15, 1.7, 0);
    m.castShadow = true;
    g.add(m);
  }
  const membrane = new Mesh(new PlaneGeometry(2.1, 3.2), veil);
  membrane.position.y = 1.6;
  const board = new Mesh(new PlaneGeometry(2.56, 0.8), sign);
  board.position.set(0, 3.75, 0.05);
  g.add(membrane, board);
  return g;
}

export class Props {
  constructor(art) {
    this.art = art;
    /** um por bairro, na ordem de ZONES */
    this.vehicles = art.vehicles.map((paint) => vehicle(art, paint));
    this.barrierModel = barrier(art);
    this.signModel = sign(art);
    /** materiais do portal APOSTAR, que piscam como caça-níquel */
    this.flicker = [];
    this.portals = Object.fromEntries(
      Object.entries(PORTAL_LOOK).map(([kind, look]) => [kind, portal(look, kind === "apostar" ? this.flicker : null)]),
    );
  }

  portal(kind) {
    return this.portals[kind].clone();
  }

  /** Pisca-pisca do portal de aposta. */
  animate(t) {
    const on = Math.sin(t * 14) > 0;
    for (const m of this.flicker) {
      if (m.isMeshBasicMaterial) m.opacity = on ? 0.45 : 0.12;
      else m.emissiveIntensity = on ? 3 : 0.3;
    }
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
