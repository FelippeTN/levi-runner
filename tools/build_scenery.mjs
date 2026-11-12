// Junta os modelos CC0 baixados por tools/fetch_assets.sh num só assets/scenery.glb, no formato que o Art lê:
// um nó por modelo (e um "<nome>_low" para o LOD de longe), com a base em y = 0 e o centro em x = z = 0.
//
//  - peças da KayKit ficam com o atlas de cores dela (material "atlas"; a imagem sai à parte em
//    assets/scenery.png, para o glb abrir sem DOM nos testes);
//  - peças de cor lisa (Quaternius) viram cor por vértice num material só ("vc"): 1 draw call por trecho;
//  - vértices de materiais pintáveis (a parede "Main" dos sobrados) levam _TINT = 1, e o jogo troca a cor deles.
//
// Uso: ./tools/fetch_assets.sh && node tools/build_scenery.mjs

import { Document, NodeIO, VertexLayout } from "@gltf-transform/core";
import { MeshoptSimplifier } from "meshoptimizer";
import { FloatType } from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SRC = ".cache/assets";
const K = (f) => join(SRC, "kaykit", `${f}.gltf`);
const Q = (dir, f) => join(SRC, "quaternius", dir, `${f}.glb`);

/**
 * [nome no jogo, arquivo, opções]; `tint`: materiais pintáveis; `center`: centra também em y (nuvens);
 * `foot`: x = z = 0 no pé (tronco, poste) em vez do meio da caixa; `near`: fração de triângulos também de perto
 * (os sobrados têm detalhe que não aparece no jogo: tijolinho por tijolinho).
 */
const MODELS = [
  ...["A", "B", "C", "D", "E", "F", "G", "H"].map((l) => [`predio_${l}`, K(`building_${l}`)]),
  ...["hatchback", "police", "sedan", "stationwagon", "taxi"].map((c) => [`carro_${c}`, K(`car_${c}`)]),
  ["poste", K("streetlight"), { foot: true }],
  ["semaforo", K("trafficlight_A")],
  ["banco", K("bench")],
  ["hidrante", K("firehydrant")],
  ["lixeira", K("trash_A")],
  ["cacamba", K("dumpster")],
  ...[1, 2, 3, 4].map((i) => [`palmeira_${i}`, Q("nature", `PalmTree_${i}`), { foot: true }]),
  ...[1, 2, 3].map((i) => [`arvore_${i}`, Q("nature", `CommonTree_${i}`), { foot: true }]),
  ...[1, 2].map((i) => [`arbusto_${i}`, Q("nature", `Bush_${i}`)]),
  ...[1, 2].map((i) => [`pedra_${i}`, Q("nature", `Rock_${i}`)]),
  ["planta", Q("nature", "Plant_1")],
  ...[
    ["sobrado_varanda", "2Story_Balcony_Mat"],
    ["sobrado_colunas", "2Story_Columns_Mat"],
    ["sobrado", "2Story_Mat"],
    ["sobrado_estreito", "2Story_Slim_Mat"],
    ["sobrado_largo", "2Story_Wide_Mat"],
    ["sobrado_telhado", "2Story_GableRoof_Mat"],
    ["casarao_varanda", "3Story_Balcony_Mat"],
    ["casarao_estreito", "3Story_Slim_Mat"],
    ["casa_telhado", "1Story_GableRoof_Mat"],
  ].map(([name, f]) => [name, Q("buildings", f), { tint: ["Main"], near: 0.5 }]),
  ...[1, 2, 3, 4, 5].map((i) => [`nuvem_${i}`, Q("clouds", `Cloud${i}`), { center: true }]),
];

/** Fração de triângulos do LOD de longe (alvo) e a maior aceita (acima disso a peça some de longe). */
const LOW_RATIO = 0.3;
const LOW_MAX = 0.6;

const io = new NodeIO();
const out = new Document();
const buffer = out.createBuffer();
const scene = out.createScene("scenery");
const atlas = out.createMaterial("atlas").setRoughnessFactor(0.75).setMetallicFactor(0);
const vc = out.createMaterial("vc").setRoughnessFactor(0.85).setMetallicFactor(0);

await MeshoptSimplifier.ready;

/** Peças de um modelo, já no espaço do modelo: {material: "atlas"|"vc", pos, nor, uv, col, tint, idx}. */
async function readModel(file, tintNames) {
  const doc = await io.read(file);
  const parts = { atlas: newPart(), vc: newPart() };
  for (const node of doc.getRoot().getDefaultScene().listChildren()) {
    node.traverse((n) => {
      const mesh = n.getMesh();
      if (!mesh) return;
      const m = n.getWorldMatrix();
      for (const prim of mesh.listPrimitives()) {
        const mat = prim.getMaterial();
        const textured = !!mat?.getBaseColorTexture();
        const part = parts[textured ? "atlas" : "vc"];
        const base = part.pos.length / 3;
        const pos = prim.getAttribute("POSITION");
        const nor = prim.getAttribute("NORMAL");
        const uv = prim.getAttribute("TEXCOORD_0");
        const color = mat?.getBaseColorFactor() ?? [1, 1, 1, 1];
        const tint = tintNames?.includes(mat?.getName()) ? 1 : 0;
        const p = [], q = [], t = [];
        for (let i = 0; i < pos.getCount(); i++) {
          const [x, y, z] = pos.getElement(i, p);
          part.pos.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
          const [a, b, c] = nor.getElement(i, q);
          const nx = m[0] * a + m[4] * b + m[8] * c, ny = m[1] * a + m[5] * b + m[9] * c, nz = m[2] * a + m[6] * b + m[10] * c;
          const len = Math.hypot(nx, ny, nz) || 1;
          part.nor.push(nx / len, ny / len, nz / len);
          if (uv) part.uv.push(...uv.getElement(i, t));
          else part.uv.push(0, 0);
          part.col.push(color[0], color[1], color[2]);
          part.tint.push(tint);
        }
        const idx = prim.getIndices();
        const count = idx ? idx.getCount() : pos.getCount();
        for (let i = 0; i < count; i++) part.idx.push(base + (idx ? idx.getScalar(i) : i));
      }
    });
  }
  return Object.entries(parts)
    .filter(([, p]) => p.idx.length > 0)
    .map(([k, p]) => [k, weld(p)]);
}

function newPart() {
  return { pos: [], nor: [], uv: [], col: [], tint: [], idx: [] };
}

/** Base em y = 0 e centro em x = z = 0 (com `center`, também o centro em y; com `foot`, o centro do pé). */
function normalize(parts, { center, foot }) {
  const box = (keep) => {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const [, p] of parts) {
      for (let v = 0; v < p.pos.length; v += 3) {
        if (!keep(p.pos[v + 1])) continue;
        for (let i = 0; i < 3; i++) {
          min[i] = Math.min(min[i], p.pos[v + i]);
          max[i] = Math.max(max[i], p.pos[v + i]);
        }
      }
    }
    return [min, max];
  };
  const [min, max] = box(() => true);
  const [fmin, fmax] = foot ? box((y) => y < min[1] + (max[1] - min[1]) * 0.03) : [min, max];
  const shift = [(fmin[0] + fmax[0]) / 2, center ? (min[1] + max[1]) / 2 : min[1], (fmin[2] + fmax[2]) / 2];
  for (const [, p] of parts) for (let i = 0; i < p.pos.length; i++) p.pos[i] -= shift[i % 3];
  return max.map((v, i) => +(v - min[i]).toFixed(4));
}

/** Funde vértices iguais (posição, normal, uv, cor e pintura): os modelos chegam com cada triângulo solto. */
function weld(p) {
  const keys = new Map();
  const q = newPart();
  const r = (v) => Math.round(v * 1e4);
  for (const i of p.idx) {
    const key = [...p.pos.slice(i * 3, i * 3 + 3), ...p.nor.slice(i * 3, i * 3 + 3), ...p.uv.slice(i * 2, i * 2 + 2), ...p.col.slice(i * 3, i * 3 + 3), p.tint[i]].map(r).join();
    if (!keys.has(key)) {
      keys.set(key, keys.size);
      q.pos.push(...p.pos.slice(i * 3, i * 3 + 3));
      q.nor.push(...p.nor.slice(i * 3, i * 3 + 3));
      q.uv.push(...p.uv.slice(i * 2, i * 2 + 2));
      q.col.push(...p.col.slice(i * 3, i * 3 + 3));
      q.tint.push(p.tint[i]);
    }
    q.idx.push(keys.get(key));
  }
  return q;
}

/**
 * Menos triângulos, só com os vértices que sobraram. De longe (`error` grande) chega ao alvo de qualquer jeito;
 * de perto para antes de a forma mudar.
 */
function simplify(p, ratio = LOW_RATIO, error = 0.02) {
  const positions = new Float32Array(p.pos);
  const indices = new Uint32Array(p.idx);
  const target = Math.floor((indices.length * ratio) / 3) * 3;
  let [low] = MeshoptSimplifier.simplify(indices, positions, 3, target, error, ["Permissive"]);
  // de longe, se não chegou perto do alvo sem estragar a forma, o modo grosseiro chega (a diferença não aparece)
  if (ratio === LOW_RATIO && low.length > target * 1.5) [low] = MeshoptSimplifier.simplifySloppy(indices, positions, 3, null, target, 1);
  const remap = new Map();
  const q = newPart();
  for (const i of low) {
    if (!remap.has(i)) {
      remap.set(i, remap.size);
      q.pos.push(...p.pos.slice(i * 3, i * 3 + 3));
      q.nor.push(...p.nor.slice(i * 3, i * 3 + 3));
      q.uv.push(...p.uv.slice(i * 2, i * 2 + 2));
      q.col.push(...p.col.slice(i * 3, i * 3 + 3));
      q.tint.push(p.tint[i]);
    }
    q.idx.push(remap.get(i));
  }
  return q;
}

function accessor(type, array) {
  return out.createAccessor().setType(type).setArray(array).setBuffer(buffer);
}

function primitive(kind, p) {
  const prim = out
    .createPrimitive()
    .setMaterial(kind === "atlas" ? atlas : vc)
    .setAttribute("POSITION", accessor("VEC3", new Float32Array(p.pos)))
    .setAttribute("NORMAL", accessor("VEC3", new Float32Array(p.nor)))
    .setIndices(accessor("SCALAR", p.pos.length / 3 > 65535 ? new Uint32Array(p.idx) : new Uint16Array(p.idx)));
  // cor lisa não usa uv (o Art cria um zerado, para mesclar com as outras peças): só o atlas leva
  if (kind === "atlas") prim.setAttribute("TEXCOORD_0", accessor("VEC2", new Float32Array(p.uv)));
  else prim.setAttribute("COLOR_0", accessor("VEC3", new Uint8Array(p.col.map((c) => Math.round(c * 255)))).setNormalized(true));
  if (p.tint.some((t) => t)) prim.setAttribute("_TINT", accessor("SCALAR", new Float32Array(p.tint)));
  return prim;
}

let total = 0;
for (const [name, file, opts = {}] of MODELS) {
  let parts = await readModel(file, opts.tint);
  const size = normalize(parts, opts);
  if (opts.near) parts = parts.map(([k, p]) => [k, simplify(p, opts.near, 0.01)]);
  // de longe: versão simplificada; peça pequena que não simplifica (banco, lixeira) some, como o retrovisor
  const low = parts.map(([k, p]) => [k, simplify(p)]).filter(([, q], i) => q.idx.length < parts[i][1].idx.length * LOW_MAX);
  for (const [suffix, list] of [["", parts], ["_low", low]]) {
    if (!list.length) continue;
    const mesh = out.createMesh(name + suffix);
    for (const [kind, p] of list) {
      mesh.addPrimitive(primitive(kind, p));
      if (!suffix) total += p.idx.length / 3;
    }
    scene.addChild(out.createNode(name + suffix).setMesh(mesh).setExtras({ size }));
  }
}

// atributos separados (não intercalados): o mergeGeometries do three só junta atributos simples
await io.setVertexLayout(VertexLayout.SEPARATE).write("assets/scenery.glb", out);
copyFileSync(join(SRC, "kaykit", "citybits_texture.png"), "assets/scenery.png");
console.log(`${MODELS.length} modelos, ${total} triângulos de perto -> assets/scenery.glb`);

// Céu da Poly Haven reduzido a 64×32: para luz ambiente não precisa de mais (e cai de 1,4 MB para ~8 KB)
const SKY_W = 64, SKY_H = 32, SUN_CLAMP = 3;
const hdr = readFileSync(join(SRC, "polyhaven", "sky_1k.hdr"));
const sky = new HDRLoader().setDataType(FloatType).parse(hdr.buffer.slice(hdr.byteOffset, hdr.byteOffset + hdr.byteLength));
const fx = sky.width / SKY_W, fy = sky.height / SKY_H;
const rgbe = Buffer.alloc(SKY_W * SKY_H * 4);
for (let y = 0; y < SKY_H; y++) {
  for (let x = 0; x < SKY_W; x++) {
    const c = [0, 0, 0];
    for (let j = 0; j < fy; j++) {
      for (let i = 0; i < fx; i++) {
        const k = ((y * fy + j) * sky.width + x * fx + i) * 4;
        // o sol fica de fora (o jogo já tem o dele, com sombra): só a luz do céu
        for (let n = 0; n < 3; n++) c[n] += Math.min(sky.data[k + n], SUN_CLAMP) / (fx * fy);
      }
    }
    const m = Math.max(...c);
    const o = (y * SKY_W + x) * 4;
    if (m < 1e-32) continue;
    const e = Math.ceil(Math.log2(m) + 1e-9);
    const f = 256 / 2 ** e;
    rgbe.set([...c.map((v) => Math.min(255, Math.floor(v * f))), e + 128], o);
  }
}
// linhas sem RLE: o leitor do three (HDRLoader) aceita
writeFileSync("assets/sky.hdr", Buffer.concat([Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${SKY_H} +X ${SKY_W}\n`), rgbe]));
console.log(`céu ${sky.width}×${sky.height} -> assets/sky.hdr ${SKY_W}×${SKY_H}`);
