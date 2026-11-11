// Texturas geradas em código (nada de imagem no download): calçadão, asfalto, fachadas, lataria, moeda…

import { DataTexture, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace } from "three";

const TAU = Math.PI * 2;

// ---------- ruído ----------

function hash(x, y) {
  let h = Math.imul(x, 374_761_393) ^ Math.imul(y, 668_265_263);
  h = Math.imul(h ^ (h >>> 13), 1_274_126_177);
  return ((h ^ (h >>> 16)) >>> 0) / 4_294_967_295;
}

const mod = (a, p) => ((a % p) + p) % p;
const fract = (x) => x - Math.floor(x);
const smooth = (t) => t * t * (3 - 2 * t);

/** Ruído de valor suave em [0,1], periódico em `p` células. */
export function noise(x, y, p) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const h = (a, b) => hash(mod(a, p), mod(b, p));
  const top = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * smooth(fx);
  const bot = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * smooth(fx);
  return top + (bot - top) * smooth(fy);
}

function fbm(u, v, base) {
  return noise(u * base, v * base, base) * 0.6 + noise(u * base * 2, v * base * 2, base * 2) * 0.3 + noise(u * base * 4, v * base * 4, base * 4) * 0.1;
}

const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const scale = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const rgb = (c) => [...c.map((x) => Math.min(Math.max(x, 0), 1) * 255), 255];

/** Textura repetida com mipmaps; `f(u, v)` com u,v em [0,1) devolve [r, g, b, a] em 0..255. */
export function image(w, h, f) {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      data.set(f(x / w, y / h), (y * w + x) * 4);
    }
  }
  const tex = new DataTexture(data, w, h);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

// ---------- texturas ----------

/** Sombra de contato: mancha escura redonda que se apaga suave até a borda. */
export function blob() {
  return image(64, 64, (u, v) => {
    const d = Math.min(Math.hypot(u * 2 - 1, v * 2 - 1), 1);
    const a = (1 - d * d) * (1 - d); // miolo cheio, borda bem esfumada
    return [10, 14, 35, a * 150];
  });
}

/** Calçadão de Copacabana: ondas largas e espaçadas, mais branco que preto (pedra portuguesa). */
export function calcadao() {
  const BLACK = 0.38; // fração preta de cada onda
  return image(512, 512, (u, v) => {
    const wave = mod(v * 3 + Math.sin(u * TAU * 2) * 0.35, 1);
    const black = Math.min(Math.max((BLACK / 2 - Math.abs(wave - 0.5)) / 0.024 + 0.5, 0), 1); // borda suave
    const grain = fbm(u, v, 32) * 0.12;
    const c = (0.92 - grain) * (1 - black) + (0.2 + grain) * black;
    return rgb([c, c * 0.98, c * 0.95]);
  });
}

/** Asfalto com faixas tracejadas entre as 3 pistas (pensado para UV 0..1 na largura da pista). */
export function asphalt() {
  return image(256, 256, (u, v) => {
    const n = fbm(u, v, 16);
    let c = [0.16 + n * 0.08, 0.16 + n * 0.08, 0.17 + n * 0.08];
    const dash = fract(v * 4) < 0.55;
    for (const lx of [1 / 3, 2 / 3]) {
      if (Math.abs(u - lx) < 0.008 && dash) c = [0.92, 0.92, 0.88];
    }
    if (u < 0.012 || u > 0.988) c = [0.95, 0.8, 0.2];
    return rgb(c);
  });
}

/** Paralelepípedos em fiadas desencontradas. */
export function cobble() {
  return image(256, 256, (u, v) => {
    const rows = 8;
    const row = Math.floor(v * rows);
    const x = u * rows + (row % 2 === 0 ? 0 : 0.5);
    const cx = fract(x) - 0.5, cy = fract(v * rows) - 0.5;
    const edge = (Math.max(Math.abs(cx), Math.abs(cy)) * 2) ** 6;
    const tone = hash(Math.floor(x), row);
    const base = mix([0.45, 0.42, 0.38], [0.6, 0.55, 0.48], tone);
    return rgb(mix(scale(base, 0.9 + fbm(u, v, 32) * 0.2), [0.18, 0.17, 0.15], Math.min(edge, 1)));
  });
}

export function sand() {
  return image(128, 128, (u, v) => {
    const n = fbm(u, v, 8) * 0.5 + fbm(u, v, 32) * 0.5;
    return rgb(mix([0.86, 0.76, 0.55], [0.98, 0.9, 0.7], n));
  });
}

/** Mar: azul com cristas; o material desliza o UV para animar. */
export function sea() {
  return image(256, 256, (u, v) => {
    const n = fbm(u, v, 8);
    const crest = Math.abs(fract(v * 12 + n * 3 + Math.sin(u * Math.PI * 4) * 0.3) - 0.5) < 0.04;
    const c = mix([0.04, 0.32, 0.55], [0.1, 0.55, 0.72], n);
    return rgb(crest ? mix(c, [0.9, 0.95, 1], 0.55) : c);
  });
}

/**
 * Uma célula de fachada (um andar × um módulo); repete pela caixa via UV em metros.
 * A cor da parede vem do `color` do material (textura é clara).
 * @param {"modern" | "colonial" | "glass"} kind prédio de orla | sobrado com venezianas | torre de vidro
 */
export function facade(kind) {
  return image(128, 128, (u, v) => {
    const wall = [0.95, 0.94, 0.92];
    const n = fbm(u, v, 8) * 0.06;
    let c;
    if (kind === "modern") {
      if (v > 0.82) c = [0.8, 0.8, 0.82]; // laje/varanda
      else if (v > 0.2 && v < 0.75 && u > 0.08 && u < 0.92) {
        c = Math.abs(u - 0.5) < 0.015 ? [0.9, 0.9, 0.9] : mix([0.25, 0.4, 0.55], [0.55, 0.7, 0.85], 1 - v);
      } else c = wall;
    } else if (kind === "colonial") {
      const win = u > 0.3 && u < 0.7 && v > 0.15 && v < 0.85;
      const arch = ((u - 0.5) / 0.2) ** 2 + ((v - 0.25) / 0.1) ** 2 < 1 || v > 0.25;
      if (win && arch) {
        // veneziana verde
        c = Math.abs(u - 0.5) < 0.012 || (fract(v * 10) < 0.12 && v > 0.3) ? [0.12, 0.35, 0.3] : [0.18, 0.45, 0.4];
      } else if ((u > 0.26 && u < 0.74 && v > 0.11 && v < 0.89) || v > 0.93) {
        c = [0.98, 0.98, 0.95]; // moldura e cornija brancas
      } else c = wall;
    } else {
      const frame = u < 0.04 || v < 0.06;
      c = frame ? [0.55, 0.58, 0.62] : mix([0.3, 0.42, 0.55], [0.65, 0.78, 0.9], (u + (1 - v)) * 0.5);
    }
    return rgb([c[0] - n, c[1] - n, c[2] - n]);
  });
}

/** Telhas cerâmicas (casarões de Santa Teresa). */
export function roofTiles() {
  return image(128, 128, (u, v) => {
    const ripple = Math.abs(fract(u * 12) - 0.5) * 2;
    const row = fract(v * 10) < 0.1 ? 1 : 0;
    const base = mix([0.72, 0.32, 0.18], [0.85, 0.45, 0.25], hash(Math.floor(u * 12), Math.floor(v * 10)));
    return rgb(scale(base, 1 - ripple * 0.25 - row * 0.3));
  });
}

/** Listras diagonais (cavaletes e placas de obra). */
export function stripes(a, b) {
  return image(64, 64, (u, v) => rgb(fract((u + v) * 4) < 0.5 ? a : b));
}

/** Distância com sinal até um retângulo de cantos redondos (centro c, meia-extensão h, raio r). */
function rrect(px, py, cx, cy, hx, hy, r) {
  const qx = Math.abs(px - cx) - hx + r, qy = Math.abs(py - cy) - hy + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Tamanho em metros de uma repetição da lataria (o material usa repeat = 1/tamanho). */
export const LIVERY_SIZE = [4.5, 2.0];

/** Lataria de desenho animado: dois tons com friso, janela | porta | janela com moldura grossa e vidro com reflexo. */
export function livery(body, lower, stripe) {
  return image(512, 256, (u, v) => {
    const px = u * LIVERY_SIZE[0], py = v * LIVERY_SIZE[1];
    const cx = Math.floor(px / 1.5) * 1.5 + 0.75;
    const door = Math.floor(px / 1.5) === 1;
    let opening, pane;
    if (door) {
      opening = rrect(px, py, cx, 0.98, 0.42, 0.82, 0.16);
      pane = rrect(px, py, cx, 0.55, 0.27, 0.33, 0.12);
    } else {
      opening = pane = rrect(px, py, cx, 0.6, 0.55, 0.38, 0.16);
    }
    let c;
    if (py < 0.06) c = scale(body, 0.8);
    else if (py > 1.18 && py < 1.28) c = stripe;
    else if (py > 1.28) c = py > 1.9 ? scale(lower, 0.6) : lower;
    else c = body;
    if (pane < 0) {
      const shine = mod((px - cx) * 2 - py * 1.5, 1.6) < 0.22 ? 1 : 0;
      c = mix(mix([0.62, 0.8, 0.92], [0.42, 0.6, 0.78], v * 1.5), [0.95, 0.98, 1], shine * 0.6);
    } else if (opening < 0) {
      c = scale(body, 0.9); // folha da porta
    }
    if (Math.abs(pane) < 0.035 || Math.abs(opening) < 0.04) {
      c = scale(py > 1.28 ? lower : body, 0.5); // moldura
    }
    return rgb(scale(c, 1 - fbm(u, v, 16) * 0.05));
  });
}

/** Leito de trilho para uma faixa (2,5 m): cascalho e dormente de madeira atravessado. */
export function track() {
  return image(128, 64, (u, v) => {
    const gravel = mix([0.38, 0.33, 0.29], [0.55, 0.5, 0.44], fbm(u, v, 16));
    const sleeper = u > 0.1 && u < 0.9 && v > 0.25 && v < 0.75;
    const edge = Math.max(0.04 - Math.min(Math.abs(u - 0.1), Math.abs(u - 0.9), Math.abs(v - 0.25), Math.abs(v - 0.75)), 0) * 12;
    return rgb(sleeper ? scale(mix([0.42, 0.27, 0.15], [0.55, 0.37, 0.2], noise(u * 3, v * 40, 40)), 1 - edge) : gravel);
  });
}

/**
 * Face da moeda: balança da justiça em relevo sobre ouro fosco, com contas em volta. O relevo é pintado:
 * sombra tirada do gradiente da altura, luz do alto à esquerda. Fora do disco fica dourado liso (aro).
 */
export function coinFace() {
  const N = 128;
  const FIELD = [0.82, 0.58, 0.12];
  const GOLD = [1, 0.82, 0.32];
  // distância de q ao segmento a-b
  const seg = (qx, qy, ax, ay, bx, by) => {
    const abx = bx - ax, aby = by - ay;
    const t = Math.min(Math.max(((qx - ax) * abx + (qy - ay) * aby) / (abx * abx + aby * aby), 0), 1);
    return Math.hypot(qx - ax - abx * t, qy - ay - aby * t);
  };
  // [altura, cor] com q ∈ [-1,1]², y para cima
  const layer = (qx, qy) => {
    if (Math.hypot(qx, qy) > 1) return [0, GOLD];
    const relief =
      seg(qx, qy, 0, -0.55, 0, 0.42) < 0.035 || // coluna
      Math.hypot(qx, qy - 0.5) < 0.065 || // remate
      seg(qx, qy, -0.55, 0.32, 0, 0.36) < 0.028 || // travessão
      seg(qx, qy, 0.55, 0.32, 0, 0.36) < 0.028 ||
      (qy < -0.53 && qy > -0.66 && Math.abs(qx) < 0.3 - Math.abs(qy + 0.53) * 0.8) || // pedestal
      [-1, 1].some((s) => {
        const bx = qx - 0.55 * s, by = qy + 0.12;
        return Math.hypot(0.55 * s - qx, 0.32 - qy) < 0.04 || (by < 0 && (bx / 0.21) ** 2 + (by / 0.1) ** 2 < 1); // argola, prato
      });
    if (relief) return [1, GOLD];
    // correntes, mais baixas que o resto
    if ([-1, 1].some((s) => [-0.19, 0.19].some((o) => seg(qx, qy, 0.55 * s, 0.32, 0.55 * s + o, -0.12) < 0.012))) return [0.6, GOLD];
    // contas em volta
    const step = TAU / 28;
    const a = Math.round(Math.atan2(qy, qx) / step) * step;
    if (Math.hypot(qx - Math.cos(a) * 0.87, qy - Math.sin(a) * 0.87) < 0.035) return [0.8, GOLD];
    return [0, FIELD];
  };
  const h = (x, y) => layer(x, y)[0];
  const [lx, ly] = [-0.6, 0.8];
  return image(N, N, (u, v) => {
    const acc = [0, 0, 0];
    for (const [dx, dy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
      const qx = (u + dx / N) * 2 - 1, qy = 1 - (v + dy / N) * 2;
      const e = 0.015;
      const gx = h(qx + e, qy) - h(qx - e, qy), gy = h(qx, qy + e) - h(qx, qy - e);
      const shade = Math.min(Math.max(1 + 0.8 * (gx * lx + gy * ly), 0.35), 1.7) * (1.12 - 0.25 * Math.min(qx * qx + qy * qy, 1));
      const c = scale(layer(qx, qy)[1], shade);
      for (let i = 0; i < 3; i++) acc[i] += c[i] / 4;
    }
    return rgb(acc);
  });
}
