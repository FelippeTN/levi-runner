// Física e colisão com os sistemas reais do jogo, na mesma ordem do laço principal.

import assert from "node:assert/strict";
import { test } from "node:test";
import { Object3D, Vector2, Vector3 } from "three";
import { CAR_GAP, CAR_LEN, CAR_TOP, LANES, MAX_DT, RAMP_LEN } from "../src/config.js";
import { COIN, SHOCK } from "../src/edu/economy.js";
import { Events, Game, Phase } from "../src/game.js";
import { JUMP_V, Player } from "../src/player.js";
import { groundAt, heightAt, hit } from "../src/world/collision.js";
import { World } from "../src/world/world.js";

const at = (x, y, z) => {
  const o = new Object3D();
  o.position.set(x, y, z);
  return o;
};

test("aabb", () => {
  const h = new Vector3(0.5, 0.5, 0.5);
  assert.ok(hit(new Vector3(), h, new Vector3(0.9, 0, 0), h));
  assert.ok(!hit(new Vector3(), h, new Vector3(1.1, 0, 0), h));
  // pulando por cima do cavalete (topo em y=1.0)
  assert.ok(!hit(new Vector3(0, 1.9, 0), new Vector3(0.35, 0.85, 0.3), new Vector3(0, 0.5, 0), new Vector3(1, 0.5, 0.2)));
  // rolando embaixo da placa (base em y=1.4)
  assert.ok(!hit(new Vector3(0, 0.4, 0), new Vector3(0.35, 0.4, 0.3), new Vector3(0, 1.9, 0), new Vector3(1.1, 0.5, 0.15)));
});

test("rampa e teto", () => {
  const ramp = { half: new Vector2(1.1, 3.5), top: CAR_TOP, ramp: true };
  // ponta baixa no jogador (centro em -3.5) → altura 0; ponta alta no jogador → teto
  assert.equal(heightAt(ramp, new Vector3(0, 0, -3.5), 0), 0);
  assert.equal(heightAt(ramp, new Vector3(0, 0, 3.5), 0), CAR_TOP);
  assert.equal(heightAt(ramp, new Vector3(2.5, 0, 0), 0), null);
  const roof = { obj: at(0, 0, 0), platform: { half: new Vector2(1.1, 4.5), top: CAR_TOP, ramp: false } };
  // no chão, o teto é parede; já em cima, é piso
  assert.equal(groundAt(0, 0, [roof]), 0);
  assert.equal(groundAt(0, CAR_TOP, [roof]), CAR_TOP);
});

/** Rampa + 2 carros na faixa do meio, com a ponta baixa da rampa em `lowEnd`. */
function trainWorld(speed, lowEnd) {
  const game = new Game(1);
  game.phase = Phase.Playing;
  game.speed = speed;
  const world = new World(new Object3D(), game);
  const ramp = world.add({ obj: at(0, 0, lowEnd - RAMP_LEN / 2), platform: { half: new Vector2(1.1, RAMP_LEN / 2), top: CAR_TOP, ramp: true } });
  for (let k = 0; k < 2; k++) {
    const z = lowEnd - RAMP_LEN - CAR_LEN / 2 - k * (CAR_LEN + CAR_GAP);
    world.add({
      obj: at(0, CAR_TOP / 2, z),
      obstacle: new Vector3(1.1, CAR_TOP / 2, CAR_LEN / 2),
      platform: { half: new Vector2(1.1, (CAR_LEN + CAR_GAP) / 2), top: CAR_TOP, ramp: false },
    });
  }
  return { game, world, ramp };
}

function step(game, world, player, dt) {
  const events = new Events();
  world.scroll(dt);
  player.physics(game, world, dt, events);
  world.collide(player, events);
}

/** Corre até passar o 1º carro. `enter`: vem da faixa ao lado e entra na rampa com a ponta baixa `enter` metros atrás. */
function survives(speed, dt, lowEnd, enter = null) {
  const { game, world, ramp } = trainWorld(speed, lowEnd);
  const p = new Player();
  const lane = enter === null ? 1 : 0;
  p.lane = p.prevLane = lane;
  p.root.position.x = LANES[lane];
  for (;;) {
    const low = ramp.obj.position.z + RAMP_LEN / 2;
    if (enter !== null && low >= enter) {
      enter = null;
      [p.lane, p.prevLane] = [1, 0];
    }
    step(game, world, p, dt);
    if (game.phase !== Phase.Playing) return false;
    if (low > RAMP_LEN + CAR_LEN) return true;
  }
}

test("rampa não mata em nenhum FPS", () => {
  const bad = [];
  for (const s of [14, 20, 27, 34]) {
    for (const d of [1 / 120, 1 / 60, 1 / 30, MAX_DT]) {
      // a posição da rampa em relação ao quadro muda o resultado: varre as fases
      if (![...Array(40).keys()].every((i) => survives(s, d, -2 - i * 0.05))) bad.push([s, Math.round(1 / d)]);
    }
  }
  assert.deepEqual(bad, [], "morreu subindo reto (vel, fps)");
});

test("entrar na rampa pelo lado não mata", () => {
  const bad = [];
  for (let i = 0; i < 14; i++) {
    for (const s of [14, 34]) if (!survives(s, 1 / 60, -2, i * 0.5)) bad.push([s, i * 0.5]);
  }
  assert.deepEqual(bad, [], "morreu entrando de lado (vel, metros de rampa)");
});

test("cair no vão entre carros não mata", () => {
  // já dentro do vão (1º carro passou, 2º a 1,1 m), descendo de um pulo na altura do teto; rampa longe
  const { game, world, ramp } = trainWorld(14, -2);
  ramp.obj.position.z = 100;
  for (const it of world.items) if (it.obstacle) it.obj.position.z += 2 + RAMP_LEN + CAR_LEN + 0.1;
  const p = new Player();
  [p.y, p.vy, p.floor] = [CAR_TOP + 0.01, -JUMP_V, CAR_TOP];
  for (let i = 0; i < 30; i++) step(game, world, p, 1 / 60);
  assert.equal(game.phase, Phase.Playing, "morreu no vão entre os carros");
});

test("batida de lado tropeça e volta de faixa; de frente derruba", () => {
  const game = new Game(1);
  game.phase = Phase.Playing;
  const world = new World(new Object3D(), game);
  world.add({ obj: at(LANES[2], 0.5, 0), obstacle: new Vector3(1, 0.5, 0.2) });
  const p = new Player();
  // a meio caminho da faixa 1 para a 2
  [p.lane, p.prevLane] = [2, 1];
  p.root.position.x = 1.5;
  const events = new Events();
  world.collide(p, events);
  assert.equal(game.phase, Phase.Playing);
  assert.deepEqual([p.lane, p.prevLane, p.stumbleClip], [1, 2, "StumbleR"]);
  // segundo tropeço logo depois = queda
  game.sinceStumble = 1;
  [p.lane, p.prevLane] = [2, 1];
  world.collide(p, events);
  assert.equal(game.phase, Phase.Dying);
});


test("reserva paga a batida e o Levi atravessa; sem reserva, cai", () => {
  const crash = (reserve) => {
    const game = new Game(1);
    game.phase = Phase.Playing;
    game.wallet.reserve = reserve;
    const world = new World(new Object3D(), game);
    // trem de 3 carros parado de frente na faixa do meio: leva mais que a invulnerabilidade para atravessar
    for (let k = 0; k < 3; k++) {
      world.add({ obj: at(0, CAR_TOP / 2, -CAR_LEN / 2 - 0.1 - k * (CAR_LEN + CAR_GAP)), obstacle: new Vector3(1.1, CAR_TOP / 2, CAR_LEN / 2) });
    }
    const p = new Player();
    for (let i = 0; i < 300; i++) {
      step(game, world, p, 1 / 60);
      if (game.phase !== Phase.Playing) break;
    }
    return { game, p };
  };
  const saved = crash(SHOCK);
  assert.equal(saved.game.phase, Phase.Playing, "a reserva devia ter pago o imprevisto");
  assert.equal(saved.game.wallet.reserve, 0);
  assert.equal(saved.game.wallet.ledger.reservaUsada, 1, "atravessar o trem inteiro custa um imprevisto só");
  assert.equal(crash(SHOCK - 1).game.phase, Phase.Dying);
});

test("fileira de portal ocupa as 3 faixas, longe de obstáculos e trens", () => {
  const game = new Game(5);
  game.phase = Phase.Playing;
  const world = new World(new Object3D(), game);
  const stub = () => new Object3D();
  world.props = { portal: stub, coin: stub, barrier: stub, sign: stub, ramp: stub, vehicle: stub };
  const rows = new Set();
  for (let i = 0; i < 60 * 300; i++) {
    world.scroll(1 / 60);
    game.distance += game.speed / 60;
    world.spawnRows();
    for (const it of world.items) {
      if (!it.portal || rows.has(it.row)) continue;
      rows.add(it.row);
      const row = world.items.filter((o) => o.row === it.row);
      assert.deepEqual(row.map((o) => o.obj.position.x).sort(), [...LANES].sort());
      assert.equal(new Set(row.map((o) => o.portal)).size, 3);
      for (const o of world.items) {
        if (o.obstacle) assert.ok(Math.abs(o.obj.position.z - it.obj.position.z) > o.obstacle.z + 1, "obstáculo colado no portal");
      }
    }
  }
  assert.ok(rows.size >= 10, `só ${rows.size} portais em 5 min`);
});

test("portal vale uma escolha por fileira", () => {
  const game = new Game(1);
  game.phase = Phase.Playing;
  for (let i = 0; i < 40; i++) game.wallet.collect();
  const world = new World(new Object3D(), game);
  const row = { used: false };
  // meio da troca de faixa: encosta em dois portais ao mesmo tempo
  world.add({ obj: at(0, 0, 0), portal: "poupar", row });
  world.add({ obj: at(2.5, 0, 0), portal: "investir", row });
  const p = new Player();
  p.root.position.x = 1.25;
  const events = new Events();
  world.collide(p, events);
  world.collide(p, events);
  assert.equal(events.money.length, 1);
  assert.equal(game.wallet.total, 40 * COIN);
});
