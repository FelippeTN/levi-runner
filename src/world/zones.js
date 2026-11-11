// Montagem de um trecho (20 m) de cada bairro do Rio. A ordem das chamadas ao gerador é a mesma do
// original: a mesma semente monta o mesmo cenário.

import { Vector3 } from "three";
import { LANES, TILE_LEN } from "../config.js";
import { qx, qy, qz, tf } from "../util.js";

const HALF_PI = Math.PI / 2;

/** Chão plano: recebe sombra, mas não projeta (não teria o que sombrear). */
function ground(b, art, mat, x0, x1, y) {
  b.add(art.plane, mat, tf((x0 + x1) / 2, y, 0, undefined, [x1 - x0, 1, TILE_LEN]), false);
}

function rails(b, art) {
  for (const lane of LANES) {
    for (const s of [-0.72, 0.72]) b.add(art.cube, art.metal, tf(lane + s, 0.03, 0, undefined, [0.1, 0.06, TILE_LEN]));
  }
}

function lamp(b, art, x, z) {
  const s = -Math.sign(x);
  b.add(art.cylinder, art.dark, tf(x, 2.5, z, undefined, [0.08, 5, 0.08]));
  b.add(art.cylinder, art.dark, tf(x + s * 0.5, 5, z, qz(HALF_PI), [0.06, 1.1, 0.06]));
  b.add(art.sphere, art.dark, tf(x + s, 4.98, z, undefined, [0.3, 0.12, 0.22]));
  b.add(art.sphere, art.lampGlow, tf(x + s, 4.9, z, undefined, [0.24, 0.08, 0.17]));
}

function palm(b, art, x, z, g) {
  const h = 5.5 + (g.rand() % 20) * 0.1;
  const lean = ((g.rand() % 100) / 100 - 0.5) * 0.25;
  b.add(art.cylinder, art.trunk, tf(x - (lean * h) / 2, h / 2, z, qz(lean), [0.17, h, 0.17]));
  const top = new Vector3(x - lean * h, h, z);
  for (let i = 0; i < 7; i++) {
    const r = qy((i * Math.PI * 2) / 7 + lean).multiply(qx(0.45));
    const p = new Vector3(0, 0, 1.3).applyQuaternion(r).add(top);
    b.add(art.sphere, art.leaf, tf(p.x, p.y, p.z, r, [0.35, 0.06, 1.5]));
  }
  b.add(art.sphere, art.trunk, tf(top.x, top.y, top.z, undefined, 0.3));
}

function tree(b, art, x, y, z, s) {
  b.add(art.cylinder, art.trunk, tf(x, y + 1.5 * s, z, undefined, [0.22 * s, 3 * s, 0.22 * s]));
  for (const [dx, dy, r] of [[0, 3.8, 1.8], [0.9, 3.2, 1.3], [-0.8, 3.4, 1.4]]) {
    b.add(art.sphere, art.canopy, tf(x + dx * s, y + dy * s, z, undefined, r * s));
  }
  // copa de cima mais clara: árvore em dois tons
  b.add(art.sphere, art.leaf, tf(x + 0.2 * s, y + 4.9 * s, z, undefined, 1.1 * s));
}

/** Prédio sobre o chão em `baseY`, frente voltada para a pista. */
function building(b, [geometry, size], mat, x, baseY, z) {
  b.add(geometry, mat, tf(x + (Math.sign(x) * size[0]) / 2, baseY + size[1] / 2, z, qy(HALF_PI)));
}

function copacabana(b, art, serial, g) {
  ground(b, art, art.calcadao, -4.5, 4.5, 0);
  ground(b, art, art.sand, -26, -4.5, -0.03);
  ground(b, art, art.foam, -27, -25.5, -0.05);
  ground(b, art, art.sea, -400, -26, -0.12);
  ground(b, art, art.cobbleLight, 4.5, 6.5, 0);
  ground(b, art, art.asphalt, 6.5, 16.5, -0.02);
  ground(b, art, art.calcadaoSide, 16.5, 20, 0);
  palm(b, art, -5.6, -5, g);
  if (serial % 3 === 0) {
    // quiosque de praia
    b.add(art.rKiosk, art.white, tf(-8, 1.3, 5));
    b.add(art.rWindshield, art.glass, tf(-6.5, 1.7, 5, qy(HALF_PI), [1.2, 1, 1]));
    b.add(art.cone, art.umbrellas[Math.floor(serial / 3) % 5], tf(-8, 3.2, 5, undefined, [2.4, 1, 2.4]));
    b.add(art.sphere, art.white, tf(-8, 3.75, 5, undefined, 0.18));
  } else {
    palm(b, art, -5.6, 5, g);
  }
  if (serial % 7 === 3) {
    // posto de salva-vidas
    for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) {
      b.add(art.cylinder, art.white, tf(-19 + dx, 1.5, dz, undefined, [0.1, 3, 0.1]));
    }
    b.add(art.rHut, art.barrier, tf(-19, 4, 0));
    b.add(art.rWindshield, art.glass, tf(-17.7, 4.2, 0, qy(HALF_PI)));
  }
  for (let i = 0; i < 3; i++) {
    const x = -10 - (g.rand() % 140) * 0.1;
    const z = (g.rand() % 180) * 0.1 - 9;
    const m = art.umbrellas[g.pick(5)];
    b.add(art.cylinder, art.white, tf(x, 1.1, z, undefined, [0.04, 2.2, 0.04]));
    b.add(art.cone, m, tf(x, 2.2, z, undefined, [1.4, 0.45, 1.4]));
    b.add(art.cube, m, tf(x + 0.8, 0.2, z + 0.4, qx(-0.5), [0.6, 0.06, 1.4]));
  }
  lamp(b, art, 5.4, 0);
  lamp(b, art, 16, 10);
  for (let i = 0; i < 2; i++) {
    const size = art.modern[g.pick(art.modern.length)];
    building(b, size, art.mModern[g.pick(art.mModern.length)], 20.5, 0, -5 + i * 10);
  }
}

/** Arcos da Lapa atravessando a pista: dois andares de arcos brancos e o bondinho no alto. */
function arcos(b, art) {
  b.add(art.archBig, art.white, tf(0, 0, 0));
  for (let i = 1; i <= 5; i++) {
    for (const s of [-1, 1]) b.add(art.arch, art.white, tf(s * (6 + 6 * i - 3), 0, 0));
  }
  for (let i = -6; i < 6; i++) b.add(art.archTop, art.white, tf(3 + 6 * i, 10, 0));
  b.add(art.cube, art.white, tf(0, 15.2, 0, undefined, [72, 0.4, 3.4]));
  b.add(art.rTram, art.vehicles[2][0], tf(-9, 16.6, 0));
}

function lapa(b, art, serial, gate, g) {
  ground(b, art, art.track, -4.5, 4.5, 0);
  rails(b, art);
  for (const s of [-1, 1]) {
    ground(b, art, art.cobbleLight, s < 0 ? -8 : 4.5, s < 0 ? -4.5 : 8, 0.02);
    ground(b, art, art.asphalt, s < 0 ? -60 : 8, s < 0 ? -8 : 60, -0.02);
    lamp(b, art, s * 5.4, 5);
    for (let i = 0; i < 3; i++) {
      const size = art.colonial[g.pick(art.colonial.length)];
      const mat = art.mColonial[g.pick(art.mColonial.length)];
      const z = -6.7 + i * 6.7;
      building(b, size, mat, s * 8, 0, z);
      // cornija
      const [w, h] = size[1];
      b.add(art.cube, art.white, tf(s * (8 + w / 2) - s * 0.15, h + 0.2, z, undefined, [w + 0.4, 0.4, 6.8]));
    }
    if (serial % 2 === 0) building(b, art.towers[g.pick(art.towers.length)], art.mGlass, s * 28, 0, 0);
  }
  if (gate || serial % 4 === 0) arcos(b, art);
}

function santaTeresa(b, art, serial, g) {
  ground(b, art, art.track, -4.5, 4.5, 0);
  rails(b, art);
  const slope = 0.38;
  const hy = (x) => (Math.abs(x) - 5.4) * Math.tan(slope);
  for (const s of [-1, 1]) {
    // muro de pedra e encosta subindo
    b.add(art.cube, art.cobbleLight, tf(s * 5, 0.6, 0, undefined, [0.8, 1.2, TILE_LEN]));
    const w = 40;
    b.add(art.plane, art.grass, tf(s * (5.4 + (w / 2) * Math.cos(slope)), (w / 2) * Math.sin(slope), 0, qz(s * slope), [w, 1, TILE_LEN]));
    lamp(b, art, s * 5, s < 0 ? -4 : 6);
    // casarão com telhado de telha
    const x = s * (11 + (g.rand() % 30) * 0.1);
    const z = -4 + (g.rand() % 80) * 0.1;
    const [roofGeo, roofSize] = art.roofs[g.pick(art.roofs.length)];
    const body = art.colonial[(serial + (s > 0 ? 1 : 0)) % art.colonial.length];
    const mat = art.mColonial[g.pick(art.mColonial.length)];
    const base = hy(x) - 0.5;
    building(b, body, mat, x, base, z);
    const [bw, bh] = body[1];
    b.add(roofGeo, art.tileRoof, tf(x + (s * bw) / 2, base + bh, z, undefined, [bw / roofSize[0], 1, 1]));
    for (let i = 0; i < 3; i++) {
      const tx = s * (7 + (g.rand() % 220) * 0.1);
      const tz = (g.rand() % 200) * 0.1 - 10;
      tree(b, art, tx, hy(tx) - 0.3, tz, 0.9 + (g.rand() % 6) * 0.1);
    }
  }
}

/** Entrada de Copacabana: boca de túnel sob o morro. */
function tunnel(b, art) {
  b.add(art.archBig, art.rock, tf(0, 0, 0, undefined, [1, 1, 2]));
  for (const s of [-1, 1]) b.add(art.cube, art.rock, tf(s * 12, 5, 0, undefined, [12, 10, 6]));
  b.add(art.sphere, art.grass, tf(0, 12, -6, undefined, [40, 14, 14]));
}

/**
 * Monta o trecho `serial` do bairro `zone` em `b`.
 * @param {boolean} gate primeiro trecho do bairro (túnel em Copacabana, Arcos na Lapa)
 */
export function buildTile(b, art, zone, serial, gate, g) {
  if (zone === "Copacabana") {
    copacabana(b, art, serial, g);
    if (gate) tunnel(b, art);
  } else if (zone === "Lapa") lapa(b, art, serial, gate, g);
  else santaTeresa(b, art, serial, g);
}
