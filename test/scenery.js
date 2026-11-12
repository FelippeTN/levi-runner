// Cenário de verdade (assets/scenery.glb) para os testes, sem navegador: o glb não tem imagem dentro, e o atlas
// vira uma textura vazia (o que importa aqui é a malha e o material, não a cor).

import { readFileSync } from "node:fs";
import { Texture } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export async function loadScenery() {
  const buf = readFileSync(new URL("../assets/scenery.glb", import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
  return { gltf, atlas: new Texture() };
}
