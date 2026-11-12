// Skins do Levi: pintura (troca a cor dos materiais do glb) e acessório (peça presa a um osso).

import { Color, ConeGeometry, CylinderGeometry, DoubleSide, Group, Matrix4, Mesh, MeshStandardMaterial, SphereGeometry } from "three";
import catalog from "./edu/catalog.json" with { type: "json" };
import { srgb } from "./util.js";
import { roundedBox } from "./world/geometry.js";

export const SKINS = Object.fromEntries(catalog.skins.map((s) => [s.id, s]));

const mat = (color, extra = {}) => new MeshStandardMaterial({ color, roughness: 0.5, ...extra });

/**
 * Acessórios no espaço do modelo em repouso (unidades do glb: a cabeça vai de y≈1,6 a 2,8, a tela do rosto
 * fica em z≈0,6, as costas em z≈−0,3) e o osso que os carrega.
 */
const ACCESSORIES = {
  oculos: {
    bone: "head",
    build() {
      const g = new Group();
      const lens = mat(srgb(0.04, 0.05, 0.08), { metalness: 0.4, roughness: 0.12 });
      const frame = mat(srgb(0.95, 0.75, 0.15), { metalness: 0.8, roughness: 0.3 });
      for (const s of [-1, 1]) {
        const m = new Mesh(roundedBox([0.46, 0.3, 0.06], 0.12), lens);
        m.position.set(s * 0.27, 2.14, 0.68);
        g.add(m);
      }
      const bridge = new Mesh(roundedBox([0.16, 0.05, 0.05], 0.02), frame);
      bridge.position.set(0, 2.2, 0.69);
      g.add(bridge);
      return g;
    },
  },
  panama: {
    bone: "head",
    build() {
      const g = new Group();
      const straw = mat(srgb(0.93, 0.85, 0.62), { roughness: 0.9 });
      const brim = new Mesh(new CylinderGeometry(1.05, 1.05, 0.06, 40), straw);
      const crown = new Mesh(new CylinderGeometry(0.58, 0.66, 0.45, 32), straw);
      crown.position.y = 0.25;
      const band = new Mesh(new CylinderGeometry(0.67, 0.67, 0.12, 32), mat(srgb(0.55, 0.1, 0.12)));
      band.position.y = 0.09;
      const hat = new Group();
      hat.add(brim, crown, band);
      hat.position.y = 2.95;
      hat.rotation.z = -0.12; // de lado, malandro
      g.add(hat);
      return g;
    },
  },
  prancha: {
    bone: "chest",
    build() {
      const g = new Group();
      const board = new Mesh(new SphereGeometry(1, 24, 16), mat(srgb(0.97, 0.95, 0.9)));
      board.scale.set(0.42, 1.45, 0.07);
      const stripe = new Mesh(new SphereGeometry(1, 24, 16), mat(srgb(1, 0.42, 0.17)));
      stripe.scale.set(0.1, 1.38, 0.075);
      const fin = new Mesh(new ConeGeometry(0.12, 0.3, 12), mat(srgb(0.1, 0.45, 0.85)));
      fin.position.set(0, -1.1, -0.1);
      fin.rotation.x = -Math.PI / 2;
      const surf = new Group();
      surf.add(board, stripe, fin);
      surf.position.set(0, 1.25, -0.42);
      surf.rotation.z = 0.3;
      g.add(surf);
      return g;
    },
  },
  cofrinho: {
    bone: "chest",
    build() {
      const pink = mat(srgb(1, 0.55, 0.68), { roughness: 0.35 });
      const dark = mat(srgb(0.35, 0.08, 0.15));
      const pig = new Group();
      // corpo deitado de lado, focinho para a direita do Levi
      const belly = new Mesh(new SphereGeometry(0.5, 24, 16), pink);
      belly.scale.set(1.2, 0.95, 0.9);
      const snout = new Mesh(new CylinderGeometry(0.17, 0.19, 0.16, 20), pink);
      snout.rotation.z = Math.PI / 2;
      snout.position.set(0.62, 0.02, 0);
      pig.add(belly, snout);
      for (const s of [-1, 1]) {
        const nostril = new Mesh(new SphereGeometry(0.04, 8, 6), dark);
        nostril.position.set(0.71, 0.02, s * 0.06);
        const ear = new Mesh(new ConeGeometry(0.11, 0.2, 12), pink);
        ear.position.set(0.3, 0.46, s * 0.2);
        ear.rotation.x = s * 0.35;
        const eye = new Mesh(new SphereGeometry(0.045, 8, 6), dark);
        eye.position.set(0.5, 0.2, s * 0.24);
        pig.add(nostril, ear, eye);
        for (const x of [-0.3, 0.3]) {
          const leg = new Mesh(new CylinderGeometry(0.08, 0.08, 0.2, 10), pink);
          leg.position.set(x, -0.46, s * 0.22);
          pig.add(leg);
        }
      }
      // fenda com uma moeda entrando
      const slot = new Mesh(roundedBox([0.32, 0.04, 0.08], 0.02), dark);
      slot.position.y = 0.475;
      const coin = new Mesh(new CylinderGeometry(0.14, 0.14, 0.035, 20), mat(srgb(1, 0.78, 0.15), { metalness: 0.8, roughness: 0.3 }));
      coin.rotation.x = Math.PI / 2;
      coin.position.y = 0.56;
      pig.add(slot, coin);
      pig.position.set(0, 1.35, -0.72);
      pig.rotation.y = 0.15;
      const g = new Group();
      g.add(pig);
      return g;
    },
  },
  coroa: {
    bone: "head",
    build() {
      const gold = mat(srgb(1, 0.78, 0.2), { metalness: 0.9, roughness: 0.25 });
      const crown = new Group();
      // aro aberto: visto de cima, o lado de dentro também aparece
      const ring = new Mesh(new CylinderGeometry(0.62, 0.56, 0.32, 32, 1, true), mat(srgb(1, 0.78, 0.2), { metalness: 0.9, roughness: 0.25, side: DoubleSide }));
      crown.add(ring);
      const gems = [srgb(0.9, 0.1, 0.2), srgb(0.1, 0.75, 0.4), srgb(0.15, 0.4, 1)];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spike = new Mesh(new ConeGeometry(0.12, 0.32, 10), gold);
        spike.position.set(Math.sin(a) * 0.58, 0.31, Math.cos(a) * 0.58);
        const ball = new Mesh(new SphereGeometry(0.06, 10, 8), gold);
        ball.position.set(spike.position.x, 0.5, spike.position.z);
        const c = gems[i % gems.length];
        const gem = new Mesh(new SphereGeometry(0.075, 12, 8), mat(c, { emissive: c, emissiveIntensity: 0.6, roughness: 0.1 }));
        gem.position.set(Math.sin(a) * 0.6, 0, Math.cos(a) * 0.6);
        crown.add(spike, ball, gem);
      }
      crown.position.y = 2.92;
      crown.rotation.z = 0.08;
      const g = new Group();
      g.add(crown);
      return g;
    },
  },
};

/**
 * Prepara o modelo carregado para trocar de skin.
 * @param {import("three").Object3D} model cena do glb, ainda na pose de repouso
 * @returns {(pintura: string, acessorio: string | null) => void}
 */
export function skinner(model) {
  // materiais por nome sem o sufixo do Blender: "azul" e "azul.001" pintam juntos; "Levi" é o corpo texturizado
  const mats = {};
  const original = new Map();
  model.traverse((o) => {
    if (!o.isMesh || original.has(o.material)) return;
    const m = o.material;
    original.set(m, { color: m.color.clone(), emissive: m.emissive.clone(), emissiveIntensity: m.emissiveIntensity, metalness: m.metalness, roughness: m.roughness });
    const key = m.name === "Levi" ? "corpo" : m.name.split(".")[0];
    (mats[key] ??= []).push(m);
  });

  // osso em repouso relativo ao modelo: uma peça desenhada no modelo vira filha do osso sem sair do lugar
  model.updateMatrixWorld(true);
  const toModel = model.matrixWorld.clone().invert();
  const bones = {};
  model.traverse((o) => {
    if (o.isBone) bones[o.name] = { bone: o, fromModel: toModel.clone().multiply(o.matrixWorld).invert() };
  });

  let worn = null;
  return (pintura, acessorio) => {
    for (const [m, o] of original) {
      m.color.copy(o.color);
      m.emissive.copy(o.emissive);
      Object.assign(m, { emissiveIntensity: o.emissiveIntensity, metalness: o.metalness, roughness: o.roughness });
    }
    const skin = SKINS[pintura];
    for (const [key, hex] of Object.entries(skin?.cores ?? {})) {
      for (const m of mats[key] ?? []) {
        m.color.set(hex);
        if (skin.metal) Object.assign(m, { metalness: 0.85, roughness: 0.28 });
        if (skin.brilho === key) {
          m.emissive = new Color(hex);
          m.emissiveIntensity = 2.5;
        }
      }
    }

    worn?.removeFromParent();
    worn = null;
    const acc = ACCESSORIES[SKINS[acessorio]?.modelo];
    const target = acc && bones[acc.bone];
    if (!target) return;
    const piece = acc.build();
    piece.updateMatrix();
    new Matrix4().multiplyMatrices(target.fromModel, piece.matrix).decompose(piece.position, piece.quaternion, piece.scale);
    piece.traverse((o) => (o.receiveShadow = true));
    target.bone.add(piece);
    worn = piece;
  };
}
