// Malhas e texturas procedurais.

import assert from "node:assert/strict";
import { test } from "node:test";
import { Vector3 } from "three";
import { shadowFrame, SHADOW_MAP, SUN_BASIS } from "../src/fx.js";
import { coin, roundedBox } from "../src/world/geometry.js";
import { calcadao } from "../src/world/textures.js";

function triangles(g) {
  const p = g.attributes.position, n = g.attributes.normal, idx = g.index.array;
  const v = (a, i) => new Vector3(a.getX(i), a.getY(i), a.getZ(i));
  const out = [];
  for (let i = 0; i < idx.length; i += 3) {
    const t = [idx[i], idx[i + 1], idx[i + 2]];
    out.push({ pos: t.map((k) => v(p, k)), nor: t.map((k) => v(n, k)) });
  }
  return out;
}

test("calçadão emenda sem degrau", () => {
  // a textura repete no chão: a última linha tem de continuar a primeira
  const d = calcadao().image.data;
  const n = Math.sqrt(d.length / 4);
  const px = (x, y) => d[(y * n + x) * 4];
  for (let x = 0; x < n; x++) assert.ok(Math.abs(px(x, 0) - px(x, n - 1)) < 130);
});

test("moeda: triângulos concordam com as normais", () => {
  for (const { pos: [a, b, c], nor } of triangles(coin())) {
    const n = nor[0].clone().add(nor[1]).add(nor[2]);
    assert.ok(b.clone().sub(a).cross(c.clone().sub(a)).dot(n) > 0);
  }
});

test("caixa arredondada fecha e aponta para fora", () => {
  const size = new Vector3(2.2, 2.5, 9);
  const g = roundedBox(size.toArray(), 0.45);
  const half = size.clone().multiplyScalar(0.5).addScalar(1e-4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    assert.ok(Math.abs(p.getX(i)) <= half.x && Math.abs(p.getY(i)) <= half.y && Math.abs(p.getZ(i)) <= half.z);
  }
  for (const { pos: [a, b, c] } of triangles(g)) {
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    // triângulo degenerado (miolo de eixo todo arredondado) não conta
    assert.ok(n.length() < 1e-6 || n.dot(a.clone().add(b).add(c)) > 0);
  }
});

test("grade da sombra rola com o mundo", () => {
  const toLight = SUN_BASIS.clone().transpose();
  // posição de um ponto em texels, contada da borda da textura de sombra
  const texels = (f, p) => {
    const q = p.clone().applyMatrix4(toLight);
    return [(q.x - f.center.x + f.diameter / 2) / f.texel, (q.y - f.center.y + f.diameter / 2) / f.texel];
  };
  const start = 1000, spot = new Vector3(3, 1, -30);
  const before = shadowFrame(start);
  assert.equal(before.diameter / before.texel, SHADOW_MAP);
  for (let frame = 1; frame < 2000; frame++) {
    const d = frame * 0.37;
    const now = shadowFrame(start + d);
    // o mesmo ponto do cenário, já rolado: mesma fração de texel (a grade só pula de 1 em 1)
    const [x0, y0] = texels(before, spot);
    const [x1, y1] = texels(now, spot.clone().setZ(spot.z + d));
    for (const shift of [x1 - x0, y1 - y0]) assert.ok(Math.abs(shift - Math.round(shift)) < 0.1, `quadro ${frame}: ${shift}`);
    // e a área de sombra continua dentro da textura
    for (const corner of [new Vector3(-40, 0, -85), new Vector3(40, 30, 12), new Vector3(-40, 30, 12), new Vector3(40, 0, -85)]) {
      for (const t of texels(now, corner)) assert.ok(t >= 0 && t <= SHADOW_MAP, `${t}`);
    }
  }
});
