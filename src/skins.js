// Skins do Levi: pintura (troca a cor dos materiais do glb) e acessório (peça presa a um osso).

import { Color, ConeGeometry, CylinderGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, SphereGeometry } from "three";
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
