// Malhas que as primitivas do three não têm: caixa com UV em metros, caixa arredondada, moeda,
// arco, rampa, telhado de duas águas e cúpula do céu em degradê.

import { BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, SphereGeometry } from "three";

const TAU = Math.PI * 2;

/** Malha indexada a partir de listas planas (posição, normal opcional, uv). */
function mesh(pos, uv, idx, nor = null) {
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  if (nor) g.setAttribute("normal", new Float32BufferAttribute(nor, 3));
  else g.computeVertexNormals();
  return g;
}

/** Caixa com UV em metros (`cell` = tamanho de uma repetição da textura) para fachadas não esticarem. */
export function tiledBox([w, h, d], [cellX, cellY]) {
  const g = new BoxGeometry(w, h, d);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const top = h / 2 - p.getY(i);
    if (Math.abs(n.getY(i)) > 0.5) uv.setXY(i, p.getX(i) / cellX, p.getZ(i) / cellX);
    else if (Math.abs(n.getX(i)) > 0.5) uv.setXY(i, p.getZ(i) / cellX, top / cellY);
    else uv.setXY(i, p.getX(i) / cellX, top / cellY);
  }
  return g;
}

/**
 * Caixa com cantos arredondados de raio `r` e normais suaves (visual de brinquedo, nada de quina viva).
 * UV em metros a partir do canto; nas laterais u corre ao longo da face e v vai de cima para baixo.
 * @param {number} K segmentos por quarto de curva (1 = chanfro, para o LOD de longe: mesmo UV, 1/5 dos triângulos)
 */
export function roundedBox([sx, sy, sz], r, K = 3) {
  const h = [sx / 2, sy / 2, sz / 2];
  r = Math.min(Math.max(r, 1e-3), Math.min(...h));
  // pontos ao longo de um eixo: curva de K passos em cada borda (ângulos iguais) e miolo plano
  const along = (half) => {
    const e = (k) => r * (1 - Math.tan((Math.PI / 4) * (1 - k / K)));
    const out = [];
    for (let k = 0; k <= K; k++) out.push(-half + e(k));
    for (let k = K; k >= 0; k--) out.push(half - e(k));
    return out;
  };
  const pos = [], nor = [], uv = [], idx = [];
  // [normal, eixo u, eixo v] com u × v = -normal para o triângulo sair anti-horário
  const faces = [
    [[0, 0, 1], [1, 0, 0], [0, -1, 0]],
    [[0, 0, -1], [-1, 0, 0], [0, -1, 0]],
    [[1, 0, 0], [0, 0, -1], [0, -1, 0]],
    [[-1, 0, 0], [0, 0, 1], [0, -1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, -1, 0], [1, 0, 0], [0, 0, -1]],
  ];
  const axisHalf = (a) => Math.abs(a[0] * h[0] + a[1] * h[1] + a[2] * h[2]);
  for (const [n, u, v] of faces) {
    const hn = axisHalf(n), hu = axisHalf(u), hv = axisHalf(v);
    const au = along(hu), av = along(hv);
    const base = pos.length / 3;
    for (const a of au) {
      for (const b of av) {
        const p = [0, 1, 2].map((i) => n[i] * hn + u[i] * a + v[i] * b);
        const inner = p.map((x, i) => Math.min(Math.max(x, -(h[i] - r)), h[i] - r));
        let d = p.map((x, i) => x - inner[i]);
        const len = Math.hypot(...d);
        d = len > 1e-6 ? d.map((x) => x / len) : n;
        pos.push(...inner.map((x, i) => x + d[i] * r));
        nor.push(...d);
        uv.push(a + hu, b + hv);
      }
    }
    const rows = av.length;
    for (let i = 0; i < au.length - 1; i++) {
      for (let j = 0; j < rows - 1; j++) {
        const a = base + i * rows + j, b = a + 1, c = base + (i + 1) * rows + j + 1, dd = base + (i + 1) * rows + j;
        idx.push(a, b, c, a, c, dd);
      }
    }
  }
  return mesh(pos, uv, idx, nor);
}

/**
 * Moeda em y: face rebaixada com UV planar (verso espelhado para o brasão ler certo dos dois lados),
 * aro arredondado e borda serrilhada. Aro e borda usam o canto liso dourado de `coinFace`.
 */
export function coin() {
  const N = 48;
  const [cx, cy, rxIn, rxOut, ry, fy] = [0.37, 0.02, 0.055, 0.05, 0.05, 0.04];
  const t0 = Math.PI - Math.asin((fy - cy) / ry);
  // perfil do aro [x, y, nx, ny] da face até a borda: meia elipse
  const arc = [];
  for (let i = 0; i <= 8; i++) {
    const t = t0 * (1 - i / 8);
    const rx = t > Math.PI / 2 ? rxIn : rxOut;
    const nx = Math.cos(t) / rx, ny = Math.sin(t) / ry, l = Math.hypot(nx, ny);
    arc.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t), nx / l, ny / l]);
  }
  const fr = arc[0][0];
  const edge = cx + rxOut;
  const strips = [
    arc,
    [[edge, cy, 1, 0], [edge, -cy, 1, 0]],
    [...arc].reverse().map(([x, y, nx, ny]) => [x, -y, nx, -ny]),
  ];
  const pos = [], nor = [], uv = [], idx = [];
  strips.forEach((strip, s) => {
    const base = pos.length / 3;
    for (let i = 0; i <= N; i++) {
      const a = (TAU * i) / N;
      const [ca, sa] = [Math.cos(a), Math.sin(a)];
      for (const [px, py, nx, ny] of strip) {
        let n = [ca * nx, ny, sa * nx];
        if (s === 1) {
          const k = i % 2 === 0 ? 0.45 : -0.45; // serrilha
          n = [n[0] - sa * k, n[1], n[2] + ca * k];
          const l = Math.hypot(...n);
          n = n.map((x) => x / l);
        }
        pos.push(ca * px, py, sa * px);
        nor.push(...n);
        uv.push(0.01, 0.01);
      }
    }
    const k = strip.length;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < k - 1; j++) {
        const a = base + i * k + j, b = base + (i + 1) * k + j;
        idx.push(a, b, b + 1, a, b + 1, a + 1);
      }
    }
  });
  for (const [y, sy] of [[fy, 1], [-fy, -1]]) {
    const center = pos.length / 3;
    pos.push(0, y, 0);
    nor.push(0, sy, 0);
    uv.push(0.5, 0.5);
    for (let i = 0; i <= N; i++) {
      const a = (TAU * i) / N;
      const x = fr * Math.cos(a), z = fr * Math.sin(a);
      pos.push(x, y, z);
      nor.push(0, sy, 0);
      uv.push(0.5 + (sy * x) / (2 * fr), 0.5 + z / (2 * fr));
    }
    for (let i = 0; i < N; i++) {
      const p = center + 1 + i, q = center + 2 + i;
      idx.push(...(sy > 0 ? [center, q, p] : [center, p, q]));
    }
  }
  return mesh(pos, uv, idx, nor);
}

class Builder {
  pos = [];
  uv = [];
  idx = [];
  vert(x, y, z, u, v) {
    this.pos.push(x, y, z);
    this.uv.push(u, v);
    return this.pos.length / 3 - 1;
  }
  quad(a, b, c, d) {
    this.idx.push(a, b, c, a, c, d);
  }
  build() {
    return mesh(this.pos, this.uv, this.idx);
  }
}

/**
 * Painel de arco: parede `w`×`h`×`depth` com vão de raio `r` (pés retos até `spring`, meia-lua acima).
 * Encadeados lado a lado formam os Arcos da Lapa.
 */
export function arch(w, h, depth, r, spring) {
  const N = 16;
  // contorno do vão (P) e ponto correspondente na borda externa (Q): [px, py, qx, qy]
  const ring = [[-r, 0, -w / 2, 0]];
  for (let i = 0; i <= N; i++) {
    const a = Math.PI - (Math.PI * i) / N;
    const dx = Math.cos(a), dy = Math.sin(a);
    const tx = Math.abs(dx) > 1e-4 ? w / 2 / Math.abs(dx) : Infinity;
    const ty = dy > 1e-4 ? (h - spring) / dy : Infinity;
    const t = Math.min(tx, ty);
    ring.push([dx * r, spring + dy * r, dx * t, spring + dy * t]);
  }
  ring.push([r, 0, w / 2, 0]);

  const b = new Builder();
  for (const [z, flip] of [[depth / 2, false], [-depth / 2, true]]) {
    const ids = ring.map(([px, py, qx, qy]) => [b.vert(px, py, z, px / 2, py / 2), b.vert(qx, qy, z, qx / 2, qy / 2)]);
    for (let i = 0; i < ids.length - 1; i++) {
      const [p0, q0] = ids[i], [p1, q1] = ids[i + 1];
      if (flip) b.quad(p0, p1, q1, q0);
      else b.quad(p0, q0, q1, p1);
    }
  }
  // intradorso (superfície de dentro do vão)
  let prev = null, len = 0;
  ring.forEach(([px, py], i) => {
    if (i > 0) len += Math.hypot(px - ring[i - 1][0], py - ring[i - 1][1]);
    const f = b.vert(px, py, depth / 2, len / 2, 0);
    const k = b.vert(px, py, -depth / 2, len / 2, depth / 2);
    if (prev) b.quad(prev[0], f, k, prev[1]);
    prev = [f, k];
  });
  // topo
  const hw = w / 2, hd = depth / 2;
  b.quad(b.vert(-hw, h, hd, 0, 0), b.vert(hw, h, hd, 1, 0), b.vert(hw, h, -hd, 1, 1), b.vert(-hw, h, -hd, 0, 1));
  return b.build();
}

/** Rampa (cunha): base `w`×`len`, sobe de 0 em +z até `h` em -z. */
export function ramp(w, h, len) {
  const hw = w / 2, hl = len / 2;
  const b = new Builder();
  // face inclinada
  b.quad(b.vert(-hw, 0, hl, 0, len), b.vert(hw, 0, hl, w, len), b.vert(hw, h, -hl, w, 0), b.vert(-hw, h, -hl, 0, 0));
  // traseira
  b.quad(b.vert(-hw, 0, -hl, 0, 0), b.vert(-hw, h, -hl, 0, h), b.vert(hw, h, -hl, w, h), b.vert(hw, 0, -hl, w, 0));
  // laterais
  for (const [x, flip] of [[-hw, true], [hw, false]]) {
    const p = [b.vert(x, 0, hl, 0, 0), b.vert(x, 0, -hl, len, 0), b.vert(x, h, -hl, len, h)];
    b.idx.push(...(flip ? [p[0], p[2], p[1]] : p));
  }
  return b.build();
}

/** Cúpula do céu com degradê por vértice (horizonte quente → zênite azul); cores em `Color` (linear). */
export function skyDome(radius, horizon, mid, zenith) {
  const g = new SphereGeometry(radius, 48, 24);
  const p = g.attributes.position;
  const colors = [];
  const c = new Color();
  for (let i = 0; i < p.count; i++) {
    const t = Math.max(p.getY(i) / radius, 0);
    if (t < 0.25) c.lerpColors(horizon, mid, t / 0.25);
    else c.lerpColors(mid, zenith, ((t - 0.25) / 0.75) ** 0.7);
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return g;
}
