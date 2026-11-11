import { Group, Mesh } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * Junta peças estáticas por material numa malha só: um trecho de cenário com ~50 peças vira
 * ~10 draw calls. As peças são cópias transformadas, então a geometria de origem pode ser compartilhada.
 */
export class Batch {
  /** @type {Map<string, {material: import("three").Material, cast: boolean, parts: import("three").BufferGeometry[]}>} */
  #groups = new Map();

  /**
   * @param {import("three").BufferGeometry} geometry
   * @param {import("three").Material} material
   * @param {import("three").Matrix4} matrix
   * @param {boolean} cast projeta sombra (chão plano não tem o que sombrear)
   */
  add(geometry, material, matrix, cast = true) {
    const key = `${material.uuid}:${cast}`;
    let g = this.#groups.get(key);
    if (!g) this.#groups.set(key, (g = { material, cast, parts: [] }));
    g.parts.push(geometry.clone().applyMatrix4(matrix));
  }

  /** Malhas mescladas dentro de `group` (novo se omitido). */
  build(group = new Group()) {
    for (const { material, cast, parts } of this.#groups.values()) {
      const mesh = new Mesh(mergeGeometries(parts), material);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      for (const p of parts) p.dispose();
    }
    this.#groups.clear();
    return group;
  }
}

/** Remove os filhos de `group` liberando a geometria mesclada (que só eles usam). */
export function clearBatched(group) {
  for (const child of [...group.children]) {
    child.geometry?.dispose();
    group.remove(child);
  }
}
