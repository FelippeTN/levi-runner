// Modelos CC0 do assets/scenery.glb (KayKit, Quaternius), montado por tools/build_scenery.mjs: um nó por
// modelo, base em y = 0, centro em x = z = 0, e um "<nome>_low" para o LOD de longe.

import { Float32BufferAttribute } from "three";

/**
 * @typedef {{geometry: import("three").BufferGeometry, material: import("three").Material}} Part
 * @typedef {{parts: Part[], size: number[]}} Model
 */

/**
 * Lê os modelos do glb já carregado.
 * @param {{scene: import("three").Object3D}} gltf
 * @param {{atlas: import("three").Material, vc: import("three").Material}} materials no lugar dos do glb:
 *   `atlas` com a textura da KayKit, `vc` com cor por vértice (o mesmo do LOD de longe, `Art.palette`)
 * @param {Map<import("three").BufferGeometry, import("three").BufferGeometry | null>} low LOD de longe de cada malha
 * @returns {Map<string, Model>}
 */
export function readModels(gltf, materials, low) {
  const all = new Map();
  for (const node of gltf.scene.children) {
    const meshes = node.isMesh ? [node] : node.children.filter((c) => c.isMesh);
    const parts = meshes.map((m) => ({ geometry: prepare(m.geometry), material: materials[m.material.name] ?? materials.vc }));
    all.set(node.name, { parts, size: node.userData.size });
  }
  const models = new Map();
  for (const [name, model] of all) {
    if (name.endsWith("_low")) continue;
    const far = all.get(`${name}_low`);
    for (const part of model.parts) low.set(part.geometry, far?.parts.find((p) => p.material === part.material)?.geometry ?? null);
    models.set(name, model);
  }
  return models;
}

/** Vértices pintáveis de cada malha (o atributo `_tint` sai da malha: as outras peças não o têm). */
const tintOf = new WeakMap();

/** Atributos iguais aos das peças geradas em código, para mesclar com elas no `Batch`. */
function prepare(g) {
  const n = g.attributes.position.count;
  if (g.attributes._tint) {
    tintOf.set(g, g.attributes._tint.array);
    g.deleteAttribute("_tint");
  }
  if (!g.attributes.uv) g.setAttribute("uv", new Float32BufferAttribute(new Float32Array(n * 2), 2));
  const c = g.attributes.color;
  if (c && !(c.array instanceof Float32Array)) {
    const f = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) f.set([c.getX(i), c.getY(i), c.getZ(i)], i * 3);
    g.setAttribute("color", new Float32BufferAttribute(f, 3));
  }
  return g;
}

/**
 * Cópia do modelo com a parede pintada de `color` (vértices com `_tint`), de perto e de longe.
 * @param {Model} model
 * @param {import("three").Color} color
 */
export function tinted(model, color, low) {
  const paint = (g) => {
    const tint = g && tintOf.get(g);
    if (!tint) return g;
    const out = g.clone();
    const col = out.attributes.color;
    for (let i = 0; i < tint.length; i++) if (tint[i] > 0.5) col.setXYZ(i, color.r, color.g, color.b);
    return out;
  };
  const parts = model.parts.map(({ geometry, material }) => {
    const out = paint(geometry);
    low.set(out, paint(low.get(geometry)));
    return { geometry: out, material };
  });
  return { parts, size: model.size };
}

/** Escala uniforme para o modelo ficar com `height` de altura. */
export const fitHeight = (model, height) => height / model.size[1];

/**
 * Põe as peças do modelo no lote.
 * @param {import("./batch.js").Batch} b
 * @param {Model} model
 * @param {import("three").Matrix4} matrix
 */
export function addModel(b, model, matrix, cast = true) {
  for (const { geometry, material } of model.parts) b.add(geometry, material, matrix, cast);
}
