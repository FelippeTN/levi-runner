// Fundo fixo: céu, morros (Pão de Açúcar, Corcovado), bondinho, Cristo Redentor e nuvens.

import { CylinderGeometry, DoubleSide, Mesh, MeshBasicMaterial, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3 } from "three";
import { srgb, qz, tf } from "../util.js";
import { Batch } from "./batch.js";
import { skyDome } from "./geometry.js";

/** Cor do horizonte: base do céu, neblina e perspectiva aérea do fundo. */
export const HORIZON = srgb(0.78, 0.89, 0.97);

/** Fora da neblina, sem sombra. */
const far = (color, unlit = false) =>
  unlit ? new MeshBasicMaterial({ color, fog: false }) : new MeshStandardMaterial({ color, roughness: 1, fog: false });

/** Perspectiva aérea: quanto mais longe, mais perto da cor do horizonte. */
const haze = (c, k) => c.clone().lerp(HORIZON, k);

export function backdrop(art) {
  const b = new Batch();
  // malhas maiores que as do cenário: morros e nuvens são enormes na tela
  const sphere = new SphereGeometry(1, 32, 16);
  const box = art.cube;

  const sky = new Mesh(
    skyDome(900, HORIZON, srgb(0.55, 0.76, 0.96), srgb(0.2, 0.45, 0.88)),
    new MeshBasicMaterial({ vertexColors: true, fog: false, side: DoubleSide }),
  );

  const rock = srgb(0.38, 0.42, 0.36);
  const forest = srgb(0.18, 0.4, 0.2);
  const hill = (c, k, [x, y, z], s, tilt) => b.add(sphere, far(haze(c, k)), tf(x, y, z, qz(tilt), s), false);
  // Pão de Açúcar e Morro da Urca
  hill(rock, 0.35, [-150, 0, -520], [42, 120, 46], -0.12);
  hill(forest, 0.35, [-75, -5, -470], [75, 45, 50], 0.05);
  // Corcovado e serra ao fundo
  hill(forest, 0.45, [210, -30, -640], [110, 185, 90], 0.08);
  for (const [x, h, w] of [[-420, 90, 160], [-260, 70, 140], [40, 80, 170], [380, 110, 180], [560, 70, 150]]) {
    hill(forest, 0.62, [x, -10, -780], [w, h, 60], 0);
  }
  // ilhas no mar
  hill(forest, 0.5, [-420, -6, -300], [60, 22, 40], 0);
  hill(forest, 0.55, [-520, -6, -120], [45, 18, 30], 0);

  // bondinho do Pão de Açúcar
  const a = new Vector3(-75, 40, -470), c = new Vector3(-150, 118, -520);
  const mid = a.clone().add(c).multiplyScalar(0.5);
  const dir = c.clone().sub(a);
  const along = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().normalize());
  b.add(art.cylinder, far(srgb(0.2, 0.2, 0.2), true), tf(mid.x, mid.y, mid.z, along, [0.25, dir.length(), 0.25]), false);
  b.add(box, far(srgb(0.85, 0.2, 0.15)), tf(mid.x, mid.y - 2.5, mid.z, undefined, [4, 3, 3]), false);

  // Cristo Redentor no alto do Corcovado (estilizado, em escala maior para ser legível de longe)
  const statue = far(haze(srgb(0.95, 0.95, 0.92), 0.25));
  const [tx, ty, tz] = [222, 150, -640];
  const s = 2.2;
  b.add(box, statue, tf(tx, ty + 3 * s, tz, undefined, [5 * s, 6 * s, 5 * s]), false);
  b.add(new CylinderGeometry(1.6, 2.6, 18, 16), statue, tf(tx, ty + 15 * s, tz, undefined, s), false);
  b.add(box, statue, tf(tx, ty + 21 * s, tz, undefined, [24 * s, 2.2 * s, 2.2 * s]), false);
  b.add(sphere, statue, tf(tx, ty + 24.5 * s, tz, undefined, 1.8 * s), false);

  // nuvens
  const cloud = far(srgb(1, 0.98, 0.96), true);
  // nuvem é borrão sem luz: só o contorno conta, e com menos da metade dos triângulos do morro
  const puff = new SphereGeometry(1, 20, 10);
  for (let i = 0; i < 9; i++) {
    const [x, y, z] = [-600 + i * 150, 170 + (i % 3) * 40, -700 + (i % 2) * 120];
    for (const [dx, dy, r] of [[0, 0, 34], [30, -6, 24], [-32, -8, 26], [12, 10, 22]]) {
      b.add(puff, cloud, tf(x + dx, y + dy, z, undefined, [r * 1.6, r * 0.6, r]), false);
    }
  }

  const group = b.build();
  group.traverse((o) => (o.receiveShadow = false));
  group.add(sky);
  return group;
}

