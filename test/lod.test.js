// LOD do cenário, dos obstáculos e das moedas; resolução adaptativa.

import assert from "node:assert/strict";
import { test } from "node:test";
import { Box3, Object3D, Vector3 } from "three";
import { Game } from "../src/game.js";
import { Adaptive } from "../src/render.js";
import { Art } from "../src/world/art.js";
import { Coins, Props } from "../src/world/props.js";
import { World } from "../src/world/world.js";
import { loadScenery } from "./scenery.js";

const art = new Art(await loadScenery());

const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

/** Por material: caixa envolvente, triângulos e sombra de cada malha mesclada do trecho. */
function summary(group) {
  const out = new Map();
  for (const m of group.children) {
    m.geometry.computeBoundingBox();
    out.set(m.material.uuid, { box: m.geometry.boundingBox.clone(), tris: tris(m.geometry), cast: m.castShadow, receive: m.receiveShadow });
  }
  return out;
}

test("trecho de longe é o mesmo trecho, mais leve, com menos draw calls e sem sombra; o gerador da corrida não muda", () => {
  for (const seed of [7, 99, 12345]) {
    const game = new Game(seed);
    const world = new World(new Object3D(), game, art);
    world.decorate();
    assert.ok(world.tiles.some((t) => t.detailed) && world.tiles.some((t) => !t.detailed));
    const tile = world.tiles.find((t) => !t.detailed);
    const far = summary(tile.obj);
    tile.obj.position.z = -50; // só este trecho chega perto
    const rng = game.rng;
    world.decorate();
    assert.equal(game.rng, rng);
    assert.ok(tile.detailed);
    const near = summary(tile.obj);
    // mesmas peças nos mesmos lugares: as texturizadas batem uma a uma, e o todo também
    let farTris = 0, nearTris = 0;
    for (const [k, f] of far) {
      assert.ok(!f.cast && !f.receive);
      farTris += f.tris;
      if (k === art.palette.uuid) continue;
      const n = near.get(k);
      assert.ok(n, "material de textura some de longe");
      for (const c of ["min", "max"]) assert.ok(f.box[c].distanceTo(n.box[c]) < 0.3, `${k} ${c}`);
    }
    for (const n of near.values()) nearTris += n.tris;
    const [farBox, nearBox] = [far, near].map((s) => [...s.values()].reduce((b, m) => b.union(m.box), new Box3()));
    for (const c of ["min", "max"]) assert.ok(farBox[c].distanceTo(nearBox[c]) < 0.3, c);
    assert.ok(farTris < nearTris * 0.6, `${farTris} de ${nearTris}`);
    assert.ok(far.size < near.size, `${far.size} draws de longe, ${near.size} de perto`);
  }
});

test("obstáculos têm versão de longe bem mais leve", () => {
  const p = new Props(art);
  for (const model of [p.vehicle(0), p.barrier(), p.sign()]) {
    assert.equal(model.levels.length, 2);
    const count = (o) => {
      let n = 0;
      o.traverse((m) => m.isMesh && (n += tris(m.geometry)));
      return n;
    };
    const [near, far] = model.levels.map((l) => count(l.object));
    assert.ok(far < near * 0.4, `${far} de ${near}`);
    const box = (o) => new Box3().setFromObject(o);
    assert.ok(box(model.levels[0].object).min.distanceTo(box(model.levels[1].object).min) < 0.1);
  }
});

test("moedas vão para o nível da distância, em 3 draw calls", () => {
  const coins = new Coins(art);
  const at = (z) => {
    const o = new Object3D();
    o.position.set(0, 1, z);
    return o;
  };
  coins.update([at(-5), at(-20), at(-60), at(-200), at(-300)], new Vector3(0, 2, 9));
  assert.deepEqual(coins.meshes.map((m) => m.count), [2, 1, 2]);
  assert.deepEqual(coins.meshes.map((m) => m.castShadow), [true, true, false]);
  coins.update([], new Vector3());
  assert.deepEqual(coins.meshes.map((m) => m.count), [0, 0, 0]);
});

test("resolução cai quando o quadro pesa, volta quando folga e não fica oscilando", () => {
  const applied = [];
  const a = new Adaptive((r) => applied.push(r));
  const run = (ms, seconds) => {
    for (let t = 0; t < seconds * 1000; t += ms) a.frame(ms);
  };
  run(16.7, 3);
  assert.equal(applied.length, 0);
  run(30, 1.1);
  assert.equal(a.ratio, 0.75);
  run(16.7, 5);
  assert.equal(a.ratio, 1);
  run(30, 1.1); // subiu e não aguentou: esse degrau vira o teto
  assert.equal(a.ratio, 0.75);
  run(16.7, 20);
  assert.equal(a.ratio, 0.75);
  run(500, 2); // aba em segundo plano não conta
  assert.equal(a.ratio, 0.75);
});

test("modelos CC0 do scenery.glb: versão de longe mais leve (ou some, se é miúdo); a pintura do sobrado só muda a parede", () => {
  for (const [name, { parts }] of art.models) {
    for (const { geometry } of parts) {
      assert.ok(art.low.has(geometry), `${name} fora do LOD`);
      const far = art.low.get(geometry);
      // sem versão de longe só peça pequena, que some de longe
      if (!far) assert.ok(tris(geometry) < 300, `${name} (${tris(geometry)} triângulos) sumiria de longe`);
      else assert.ok(tris(far) < tris(geometry) * 0.6, `${name}: ${tris(far)} de ${tris(geometry)}`);
    }
  }
  // mesmo sobrado em duas cores: mesma malha, só parte das cores muda
  const [a, b] = art.sobrados[0].slice(0, 2).map((m) => m.parts[0].geometry.attributes.color.array);
  let changed = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) changed++;
  assert.ok(changed > 0 && changed < a.length * 0.8, `${changed} de ${a.length}`);
});
