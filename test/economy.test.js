// Dinheiro da corrida e projeções do banco.

import assert from "node:assert/strict";
import { test } from "node:test";
import { monthly, poupanca, project, RATES, runsUntil, setRates } from "../src/edu/bank.js";
import catalog from "../src/edu/catalog.json" with { type: "json" };
import { pickTip } from "../src/edu/dicas.js";
import { COIN, SHOCK, Wallet } from "../src/edu/economy.js";
import { Game } from "../src/game.js";

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

test("dívida cresce e as moedas pagam ela primeiro", () => {
  const w = new Wallet();
  const MAGNET_PRICE = 10000;
  w.debt = MAGNET_PRICE;
  assert.equal(w.total, -MAGNET_PRICE);
  w.tick(200);
  const owed = MAGNET_PRICE * (1 + catalog.corrida.jurosCartaoPor100m) ** 2;
  assert.ok(Math.abs(w.debt - owed) < 1e-6);
  assert.ok(Math.abs(w.ledger.jurosCartao - (owed - MAGNET_PRICE)) < 1e-6);
  assert.ok(catalog.corrida.jurosCartaoPor100m > catalog.corrida.jurosPor100m, "dívida custa mais do que o investimento rende");
  w.collect();
  assert.equal(w.cash, 0);
  assert.ok(Math.abs(w.debt - (owed - COIN)) < 1e-6);
  while (w.debt > 0) w.collect();
  assert.ok(w.cash > 0 && w.cash < COIN, "a moeda que quita devolve o troco para a carteira");
  // pontuação nunca fica negativa
  const g = new Game(1);
  g.wallet.debt = MAGNET_PRICE;
  assert.equal(g.score, 0);
});

test("taxas do banco seguem a Selic", () => {
  assert.ok(Math.abs((1 + monthly(13.75)) ** 12 - 1.1375) < 1e-12);
  // poupança: 0,5% ao mês com a Selic acima de 8,5%; senão 70% da Selic
  assert.equal(poupanca(13.75), 0.005);
  assert.equal(poupanca(8.5), monthly(8.5 * 0.7));
  assert.ok(poupanca(13.75) < RATES.cofrinho && RATES.cofrinho < RATES.investimento);
  const before = { ...RATES };
  setRates({ selic: 2, cofrinho: monthly(2) });
  assert.equal(RATES.cofrinho, monthly(2));
  assert.equal(RATES.conta, 0);
  setRates(undefined);
  assert.equal(RATES.selic, 2);
  setRates(before);
});

test("reserva absorve uma batida por imprevisto pago", () => {
  const w = new Wallet();
  w.reserve = SHOCK * 2 - 1;
  assert.ok(w.absorbCrash());
  assert.ok(!w.absorbCrash(), "sobrou menos que um imprevisto");
  assert.equal(w.ledger.reservaUsada, 1);
  assert.ok(w.ledger.batidaSemReserva);
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
  assert.match(pickTip(w.ledger), /cofrinho/);
  w.ledger.apostas = 5000;
  assert.match(pickTip(w.ledger), /aposta/i);
});
