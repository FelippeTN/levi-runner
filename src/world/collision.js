// Colisão por caixas alinhadas e pisos (teto de veículo e rampa). Funções puras, sem renderização.

/** AABB por centro/meia-extensão (Vector3). */
export function hit(a, ha, b, hb) {
  return Math.abs(a.x - b.x) < ha.x + hb.x && Math.abs(a.y - b.y) < ha.y + hb.y && Math.abs(a.z - b.z) < ha.z + hb.z;
}

/**
 * Altura do piso de `platform` sob o jogador (z = 0) em `x`, ou null se não estiver em cima.
 * Rampa sobe de 0 em +z até `top` em -z.
 * @param {{half: {x: number, y: number}, top: number, ramp: boolean}} platform
 * @param {import("three").Vector3} pos centro da plataforma
 */
export function heightAt(platform, pos, x) {
  if (Math.abs(x - pos.x) > platform.half.x || Math.abs(pos.z) > platform.half.y) return null;
  if (!platform.ramp) return platform.top;
  return platform.top * Math.min(Math.max((pos.z + platform.half.y) / (2 * platform.half.y), 0), 1);
}

/**
 * Altura do piso sob o jogador; teto acima de `feet + passo` é parede, não piso. Rampa não tem parede:
 * é sempre piso, mesmo entrando pelo lado no meio dela.
 * @param {Iterable<{obj: import("three").Object3D, platform: object}>} platforms
 */
export function groundAt(x, feet, platforms) {
  let floor = 0;
  for (const { obj, platform } of platforms) {
    const h = heightAt(platform, obj.position, x);
    if (h !== null && (platform.ramp || feet >= h - 0.6)) floor = Math.max(floor, h);
  }
  return floor;
}
