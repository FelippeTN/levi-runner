// Dinheiro da corrida e projeções do banco.

import assert from "node:assert/strict";
import { test } from "node:test";
import { project, runsUntil } from "../src/edu/bank.js";
import catalog from "../src/edu/catalog.json" with { type: "json" };
import { pickTip } from "../src/edu/dicas.js";
import { COIN, MAGNET_PRICE, portalKinds, SHOCK, Wallet } from "../src/edu/economy.js";
import { Game } from "../src/game.js";

const rng = (seed = 1) => {
  const g = new Game(seed);
  return () => g.rand();
};

test("juros da corrida são compostos e não dependem do tamanho do passo", () => {
  const a = new Wallet(), b = new Wallet();
  a.invested = b.invested = 100000;
  a.tick(500);
  for (let i = 0; i < 5000; i++) b.tick(0.1);
  const expected = 100000 * (1 + catalog.corrida.jurosPor100m) ** 5;
  assert.ok(Math.abs(a.invested - expected) < 1e-6);
  assert.ok(Math.abs(b.invested - expected) < 1e-3);
  assert.ok(Math.abs(a.ledger.juros - (expected - 100000)) < 1e-6);
});

test("portais só mudam o dinheiro de lugar (menos compra e aposta)", () => {
  const w = new Wallet();
  for (let i = 0; i < 100; i++) w.collect();
  const before = w.total;
  w.choose("poupar", rng());
  assert.equal(w.total, before);
  assert.equal(w.reserve, Math.floor(before / 2));
  w.choose("investir", rng());
  assert.equal(w.total, before);
  w.choose("comprar", rng());
  assert.equal(w.total, before - MAGNET_PRICE);
  // sem dinheiro não compra
  const broke = new Wallet();
  assert.equal(broke.choose("comprar", rng()).magnet, undefined);
  assert.equal(broke.total, 0);
});

test("reserva absorve uma batida por imprevisto pago", () => {
  const w = new Wallet();
  w.reserve = SHOCK * 2 - 1;
  assert.ok(w.absorbCrash());
  assert.ok(!w.absorbCrash(), "sobrou menos que um imprevisto");
  assert.equal(w.ledger.reservaUsada, 1);
  assert.ok(w.ledger.batidaSemReserva);
});

test("aposta perde dinheiro no longo prazo", () => {
  const rand = rng(42);
  let net = 0;
  for (let i = 0; i < 10000; i++) {
    const w = new Wallet();
    w.cash = COIN * 10;
    w.choose("apostar", rand);
    net += w.cash - COIN * 10;
  }
  // esperado: (1/6 − 5/6) da aposta ≈ −67%
  const mean = net / 10000 / (COIN * 10);
  assert.ok(mean < -0.55 && mean > -0.78, `média ${mean}`);
});

test("portal sempre oferece três escolhas diferentes", () => {
  const rand = rng(3);
  for (const zone of ["Copacabana", "Lapa", "Santa Teresa"]) {
    for (let i = 0; i < 200; i++) {
      const kinds = portalKinds(zone, rand);
      assert.equal(new Set(kinds).size, 3);
    }
  }
});

test("projeção e corridas até a meta", () => {
  const p = project(10000, 0.03, 12);
  assert.equal(p.length, 13);
  assert.ok(Math.abs(p[12] - 10000 * 1.03 ** 12) < 1e-6);
  // guardar com rendimento chega antes que sem
  const withYield = runsUntil(1500000, 0, 50000, 0.03), without = runsUntil(1500000, 0, 50000, 0);
  assert.equal(without, 30);
  assert.ok(withYield < without);
  assert.equal(runsUntil(100, 100, 0, 0), 0);
  assert.equal(runsUntil(100, 0, 0, 0), Infinity);
});

test("dica combina com o que aconteceu", () => {
  const w = new Wallet();
  assert.match(pickTip(w.ledger), /POUPAR/);
  w.ledger.apostas = 5000;
  assert.match(pickTip(w.ledger), /aposta/i);
});
