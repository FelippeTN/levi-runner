// Malhas e materiais reaproveitados por todo o cenário (porte do `Art` original).

import {
  BoxGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
} from "three";
import { CAR_LEN, CAR_TOP, RAMP_LEN } from "../config.js";
import { srgb } from "../util.js";
import * as geo from "./geometry.js";
import * as tex from "./textures.js";

/** Material com textura repetida `repeat` vezes por unidade de UV e cor multiplicando a textura. */
function texMat(map, tint, [ru, rv], extra = {}) {
  const m = map.clone();
  m.repeat.set(ru, rv);
  return new MeshStandardMaterial({ map: m, color: tint, roughness: 0.85, ...extra });
}

const solid = (color, roughness) => new MeshStandardMaterial({ color, roughness });
/** Brilho próprio em HDR (> 1 acende o bloom), sem cor de base. */
const glow = (r, g, b) => new MeshStandardMaterial({ color: 0x000000, emissive: new Color(r, g, b) });

export class Art {
  constructor() {
    const facade = { modern: tex.facade("modern"), colonial: tex.facade("colonial"), glass: tex.facade("glass") };
    const [tCalc, tCob, tAsph, tSand, tSea] = [tex.calcadao(), tex.cobble(), tex.asphalt(), tex.sand(), tex.sea()];

    // ---------- geometria ----------
    /**
     * LOD: malha de longe de cada malha de perto (`null` = some de longe). O `Batch` troca na montagem, então
     * cenário e veículos de longe são as mesmas peças nos mesmos lugares, só com menos polígonos.
     * @type {Map<import("three").BufferGeometry, import("three").BufferGeometry | null>}
     */
    this.low = new Map();
    this.cube = new BoxGeometry(1, 1, 1);
    this.sphere = new SphereGeometry(1, 16, 10);
    this.cylinder = new CylinderGeometry(1, 1, 1, 16);
    this.cone = new ConeGeometry(1, 1, 16);
    this.low.set(this.sphere, new SphereGeometry(1, 8, 6));
    this.low.set(this.cylinder, new CylinderGeometry(1, 1, 1, 7));
    this.low.set(this.cone, new ConeGeometry(1, 1, 8));
    this.plane = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.ramp = geo.ramp(2.2, CAR_TOP, RAMP_LEN);
    this.archBig = geo.arch(12, 10, 3, 5, 4.5);
    this.arch = geo.arch(6, 10, 3, 2.3, 5.5);
    this.archTop = geo.arch(6, 5, 3, 1.9, 1.6);
    /**
     * Moeda de pé (face para +z): [malha, a partir de quantos metros, projeta sombra]. Cheia de perto, disco
     * simples a 40 m e mais simples ainda a 110 m, já fora da área de sombra.
     */
    this.coinLevels = [
      [geo.coin(), 0, true],
      [new CylinderGeometry(0.42, 0.42, 0.14, 12), 40, true],
      [new CylinderGeometry(0.42, 0.42, 0.14, 6), 110, false],
    ].map(([g, distance, cast]) => [g.rotateX(Math.PI / 2), distance, cast]);

    // prédios: [geometria, tamanho] com UV em metros para a fachada repetir sem esticar
    const sizes = (list, cell) => list.map((s) => [geo.tiledBox(s, cell), s]);
    this.modern = sizes([[9, 21, 9], [8, 27, 9], [10, 33, 9], [9, 39, 9], [8, 15, 9]], [3, 3]);
    this.colonial = sizes([[6.5, 7.5, 8], [6, 10.5, 8], [7, 9, 8]], [3, 3.6]);
    this.towers = sizes([[14, 45, 14], [12, 62, 12], [16, 35, 16]], [3, 3.5]);
    this.roofs = [[6.5, 8], [8, 8], [9, 9]].map(([w, d]) => [geo.gable(w, 2.2, d), [w, 2.2, d]]);

    // peças arredondadas (cada proporção tem sua malha para o raio não esticar)
    const rb = (x, y, z, r) => {
      const g = geo.roundedBox([x, y, z], r);
      this.low.set(g, geo.roundedBox([x, y, z], r, 1));
      return g;
    };
    this.rBody = rb(2.2, 2, CAR_LEN, 0.25);
    this.rWindshield = rb(1.7, 0.8, 0.14, 0.14);
    this.rLed = rb(1.3, 0.18, 0.08, 0.04);
    this.rFrame = rb(1.95, 1, 0.1, 0.2);
    this.rBumper = rb(2.25, 0.32, 0.36, 0.14);
    this.rMirror = rb(0.1, 0.4, 0.2, 0.05);
    this.rBoard = rb(2, 0.3, 0.1, 0.05);
    this.rLeg = rb(0.09, 1, 0.09, 0.04);
    this.rPanel = rb(2.2, 1, 0.16, 0.12);
    this.rKiosk = rb(3, 2.6, 3, 0.35);
    this.rHut = rb(2.6, 2, 2.6, 0.3);
    this.rTram = rb(7, 2.4, 2.2, 0.45);
    // teto gordo de desenho animado: cápsula deitada, achatada na montagem
    this.rRoof = new CapsuleGeometry(0.5, CAR_LEN - 1.2, 6, 16);
    this.low.set(this.rRoof, new CapsuleGeometry(0.5, CAR_LEN - 1.2, 2, 8));
    // retrovisor de longe é menos que um pixel
    this.low.set(this.rMirror, null);

    // ---------- materiais ----------
    const pastel = [[0.98, 0.97, 0.94], [0.97, 0.9, 0.78], [0.82, 0.9, 0.96], [0.98, 0.86, 0.84], [0.93, 0.93, 0.86]];
    const vivid = [[0.98, 0.78, 0.25], [0.35, 0.62, 0.85], [0.95, 0.55, 0.6], [0.45, 0.75, 0.5], [0.98, 0.6, 0.3], [0.75, 0.55, 0.85]];
    this.mModern = pastel.map((c) => texMat(facade.modern, srgb(...c), [1, 1]));
    this.mColonial = vivid.map((c) => texMat(facade.colonial, srgb(...c), [1, 1]));
    this.mGlass = texMat(facade.glass, srgb(1, 1, 1), [1, 1], { metalness: 0.6, roughness: 0.2 });

    const white = srgb(1, 1, 1);
    // 2 repetições em v = 6 ondas por trecho (3,3 m cada); inteiro para emendar entre trechos
    this.calcadao = texMat(tCalc, white, [1, 2]);
    // faixa de 3,5 m com a mesma escala da pista de 9 m, para a onda não espremer
    this.calcadaoSide = texMat(tCalc, white, [3.5 / 9, 2]);
    this.cobbleLight = texMat(tCob, srgb(1.5, 1.45, 1.35), [1, 6]);
    this.asphalt = texMat(tAsph, white, [1, 1]);
    this.sand = texMat(tSand, white, [5, 5]);
    this.sea = texMat(tSea, white, [40, 2], { roughness: 0.15, metalness: 0.1 });
    this.foam = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
    this.grass = texMat(tSand, srgb(0.42, 0.78, 0.25), [6, 4]);
    this.rock = texMat(tSand, srgb(0.5, 0.5, 0.48), [3, 3]);
    this.white = solid(srgb(0.96, 0.95, 0.92), 0.8);
    this.metal = new MeshStandardMaterial({ color: srgb(0.7, 0.72, 0.75), metalness: 0.9, roughness: 0.35 });
    this.dark = solid(srgb(0.12, 0.12, 0.13), 0.6);
    this.trunk = solid(srgb(0.5, 0.37, 0.24), 0.95);
    this.leaf = solid(srgb(0.38, 0.75, 0.18), 0.85);
    this.canopy = solid(srgb(0.2, 0.55, 0.16), 0.9);
    this.tileRoof = texMat(tex.roofTiles(), white, [1, 1]);
    this.lampGlow = glow(6, 4.5, 2);
    this.umbrellas = [[0.95, 0.2, 0.2], [0.1, 0.5, 0.9], [1, 0.8, 0.1], [0.1, 0.7, 0.4], [0.98, 0.5, 0.1]].map((c) => solid(srgb(...c), 0.7));
    this.barrier = texMat(tex.stripes([0.9, 0.1, 0.1], [0.97, 0.97, 0.97]), white, [1, 1]);
    this.sign = texMat(tex.stripes([0.98, 0.78, 0.05], [0.08, 0.08, 0.08]), white, [1, 1]);
    // tinta de desenho: pouco brilho, nada de verniz
    const paint = (map, color) => texMat(map, color, [1 / tex.LIVERY_SIZE[0], 1 / tex.LIVERY_SIZE[1]], { roughness: 0.6 });
    /** [lataria, teto] do ônibus, VLT e bonde, na ordem dos bairros (laranja/vermelho, branco/azul, amarelo/verde) */
    this.vehicles = [
      [[1, 0.6, 0.08], [0.88, 0.2, 0.1], [0.98, 0.95, 0.85], [0.97, 0.96, 0.92]],
      [[0.95, 0.97, 1], [0.08, 0.42, 0.85], [1, 0.75, 0.08], [0.22, 0.28, 0.4]],
      [[1, 0.8, 0.08], [0.18, 0.5, 0.25], [0.85, 0.15, 0.1], [0.2, 0.32, 0.48]],
    ].map(([body, lower, stripe, roof]) => [paint(tex.livery(body, lower, stripe), white), new MeshStandardMaterial({ color: srgb(...roof), roughness: 0.6 })]);
    // repetição de 2,5 m alinhada às faixas (centro do dormente em x = -2,5; 0; 2,5)
    this.track = texMat(tex.track(), white, [3.6, 20 / 0.8], { roughness: 0.95 });
    this.track.map.offset.set(-0.3, 0);
    this.headlight = glow(12, 11, 8);
    this.rubber = solid(srgb(0.05, 0.05, 0.05), 0.9);
    this.rampMat = texMat(tex.stripes([0.55, 0.57, 0.6], [0.35, 0.36, 0.4]), white, [1, 3]);
    // brasão em relevo pintado na textura; o emissivo usa a mesma textura para o brilho não lavar o desenho
    const face = tex.coinFace();
    this.coinMat = new MeshStandardMaterial({ map: face, emissiveMap: face, emissive: new Color(1.3, 1.3, 1.3), metalness: 0.7, roughness: 0.3 });
    this.glass = new MeshStandardMaterial({ color: srgb(0.5, 0.7, 0.86), roughness: 0.12 });
    this.led = glow(5, 2.2, 0.2);
    /** LOD de longe: todas as peças de cor lisa num material só, cor por vértice (ver `Batch`) */
    this.palette = new MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    this.blink = glow(8, 3, 0.3);
  }

  /** Ondas do mar deslizando. */
  animateSea(t) {
    this.sea.map.offset.set(t * 0.02, Math.sin(t * 0.6) * 0.05);
  }
}
