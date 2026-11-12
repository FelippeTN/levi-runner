import { Float32BufferAttribute, Group, Mesh } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * Junta peças estáticas por material numa malha só: um trecho de cenário com ~50 peças vira
 * ~10 draw calls. As peças são cópias transformadas, então a geometria de origem pode ser compartilhada.
 */
export class Batch {
  /** @type {Map<string, {material: import("three").Material, cast: boolean, parts: import("three").BufferGeometry[]}>} */
  #groups = new Map();
  #low;
  #shadows;
  #palette;

  /**
   * @param {object} [options]
   * @param {Map<import("three").BufferGeometry, import("three").BufferGeometry | null>} [options.low] LOD de longe:
   *   troca cada malha pela versão simples (`Art.low`); `null` deixa a peça de fora
   * @param {boolean} [options.shadows] false = nem projeta nem recebe sombra (longe da área de sombra)
   * @param {import("three").Material} [options.palette] material com cor por vértice (`Art.palette`): as peças de
   *   cor lisa entram todas nele, num draw call só, em vez de um por material (de longe o brilho de cada um não se vê)
   */
  constructor({ low = null, shadows = true, palette = null } = {}) {
    this.#low = low;
    this.#shadows = shadows;
    this.#palette = palette;
  }

  /**
   * @param {import("three").BufferGeometry} geometry
   * @param {import("three").Material} material
   * @param {import("three").Matrix4} matrix
   * @param {boolean} cast projeta sombra (chão plano não tem o que sombrear)
   */
  add(geometry, material, matrix, cast = true) {
    if (this.#low?.has(geometry)) {
      geometry = this.#low.get(geometry);
      if (!geometry) return;
    }
    cast &&= this.#shadows;
    const part = geometry.clone().applyMatrix4(matrix);
    if (this.#palette && plain(material)) {
      const { r, g, b } = material.color;
      const colors = new Float32Array(part.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3) colors.set([r, g, b], i);
      part.setAttribute("color", new Float32BufferAttribute(colors, 3));
      material = this.#palette;
    }
    const key = `${material.uuid}:${cast}`;
    let group = this.#groups.get(key);
    if (!group) this.#groups.set(key, (group = { material, cast, parts: [] }));
    group.parts.push(part);
  }

  /** Malhas mescladas dentro de `group` (novo se omitido). */
  build(group = new Group()) {
    for (const { material, cast, parts } of this.#groups.values()) {
      const mesh = new Mesh(mergeGeometries(parts), material);
      mesh.castShadow = cast;
      mesh.receiveShadow = this.#shadows;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      for (const p of parts) p.dispose();
    }
    this.#groups.clear();
    return group;
  }
}

/** Só cor: sem textura, sem brilho próprio e opaco (o resto mantém o material dele). */
function plain(m) {
  return m.isMeshStandardMaterial && !m.map && !m.transparent && m.emissive.getHex() === 0 && m.fog;
}

/** Remove os filhos de `group` liberando a geometria mesclada (que só eles usam). */
export function clearBatched(group) {
  for (const child of [...group.children]) {
    child.geometry?.dispose();
    group.remove(child);
  }
}
