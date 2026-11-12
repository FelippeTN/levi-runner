// Investimentos do Banco do Levi: as contas que o painel mostra precisam bater com as do server.py.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CLUBE, clube, exigido, marcacao, monthly, pathTo, prefixadoAA, project, projectRates, RATES, runsToYield, selicPath, TIPOS, yearly,
} from "../src/edu/bank.js";
import catalog from "../src/edu/catalog.json" with { type: "json" };
import { GUIA_RENDA_FIXA, pickTip, resgateTexto } from "../src/edu/dicas.js";
import { Wallet } from "../src/edu/economy.js";

const B = catalog.banco;
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("taxa anual e mensal são inversas e o pré embute a Selic esperada", () => {
  close(yearly(monthly(13.75)), 13.75);
  close(prefixadoAA(9), yearly(monthly(9) * B.pctSelicInvestimento) + B.premioPrefixado);
  close(RATES.prefixado, monthly(prefixadoAA(B.selicEsperadaReserva)));
});

test("projeção com taxa por mês é a projeção comum quando a taxa não muda", () => {
  assert.deepEqual(projectRates(1000, Array(12).fill(0.01)), project(1000, 0.01, 12));
  assert.deepEqual(projectRates(1000, [0.1, 0]), [1000, 1100, 1100]);
});

test("cenário da Selic anda até o destino aos poucos", () => {
  const p = selicPath(10, 3, 12);
  assert.equal(p.length, 12);
  close(p[0], 10.25);
  close(p.at(-1), 13);
  assert.deepEqual(selicPath(10, 0, 3), [10, 10, 10]);
  assert.ok(selicPath(1, -5, 4).every((s) => s >= 0));
});

test("pós acompanha a Selic, pré e IPCA+ não", () => {
  assert.ok(TIPOS.pos.rate(15) > TIPOS.pos.rate(10));
  assert.equal(TIPOS.pre.rate(15), TIPOS.pre.rate(10));
  assert.equal(TIPOS.ipca.rate(15), TIPOS.ipca.rate(10));
  assert.deepEqual([TIPOS.pos.liquido, TIPOS.pre.liquido, TIPOS.ipca.liquido], [false, true, true]);
});

test("marcação a mercado: juros sobem, título vale menos; caem, vale mais", () => {
  assert.equal(marcacao(100_000, 0.01, 0.01, 6), 100_000);
  assert.ok(marcacao(100_000, 0.01, 0.015, 6) < 100_000);
  assert.ok(marcacao(100_000, 0.01, 0.005, 6) > 100_000);
  assert.equal(marcacao(100_000, 0.01, 0.02, 0), 100_000); // no vencimento, sai pela curva
  assert.equal(marcacao(100_000, 0.02, 0.03, 11), Math.round(100_000 * (1.02 / 1.03) ** 11)); // igual ao server.py
});

test("dicas do banco entram depois das da corrida e antes das genéricas", () => {
  const l = new Wallet().ledger;
  const acc = (kw) => ({ conta: 0, cofrinho: 0, aplicacoes: [], mes: 0, ...kw });
  const ap = (tipo, kw) => ({ id: 1, tipo, valor: 1000, aplicado: 1000, libera_em: 6, ...kw });

  assert.equal(pickTip(l, null), pickTip(l));
  assert.match(pickTip(l, { acc: acc({}), resumo: { vencidos: [ap("pre", { taxa_aa: 12.5 })] } }), /prefixado venceu.*12,5%/);
  assert.match(pickTip(l, { acc: acc({ aplicacoes: [ap("pos")] }), resumo: null }), /reserva de emergência/);
  const tudoNoPos = acc({ cofrinho: 1, aplicacoes: [ap("pos"), ap("pos", { id: 2 })] });
  assert.match(pickTip(l, { acc: tudoNoPos, resumo: null }), /tipo só/);
  const preBarato = acc({ cofrinho: 1, aplicacoes: [ap("pre", { taxa: RATES.prefixado / 2 })] });
  assert.match(pickTip(l, { acc: preBarato, resumo: null }), /juros subiram/);
  // evento da corrida tem prioridade sobre o banco
  const apostou = { ...l, apostas: 100 };
  assert.match(pickTip(apostou, { acc: acc({ aplicacoes: [ap("pos")] }), resumo: null }), /aposta/i);
});

test("mensagem do resgate explica ganho ou perda da marcação", () => {
  assert.match(resgateTexto({ resgate: 100_000, na_curva: 100_000 }), /bateu com o valor na curva/);
  assert.match(resgateTexto({ resgate: 90_000, na_curva: 100_000 }), /abaixo da curva: os juros subiram/);
  assert.match(resgateTexto({ resgate: 110_000, na_curva: 100_000 }), /acima da curva/);
});

test("guia cobre pós, pré, IPCA+ e marcação", () => {
  const titulos = GUIA_RENDA_FIXA.map((g) => g.titulo).join(" ");
  for (const t of ["Pós-fixado", "Prefixado", "IPCA+", "Marcação a mercado", "Como escolher"]) assert.ok(titulos.includes(t), t);
});

test("caminho até a skin: investir chega antes e os juros pagam parte", () => {
  const parado = pathTo(100_000, 10_000, 10_000, 0);
  assert.deepEqual(parado, { runs: 9, juros: 0 });
  const investindo = pathTo(100_000, 10_000, 10_000, 0.05);
  assert.ok(investindo.runs < parado.runs);
  assert.ok(investindo.juros > 0);
  assert.equal(pathTo(100_000, 0, 0, 0).runs, Infinity);
  assert.equal(pathTo(100, 500, 0, 0.01).runs, 0);
});

test("Clube do Investidor: nível, progresso e skins exclusivas batem com o server.py", () => {
  assert.equal(clube(0).atual.id, CLUBE[0].id);
  assert.equal(clube(0).proximo.id, CLUBE[1].id);
  const meio = (CLUBE[1].rendimentos + CLUBE[2].rendimentos) / 2;
  assert.equal(clube(meio).atual.id, CLUBE[1].id);
  close(clube(meio).progresso, 0.5);
  assert.equal(clube(meio).falta, CLUBE[2].rendimentos - meio);
  const topo = clube(10 ** 12);
  assert.deepEqual([topo.atual.id, topo.proximo, topo.progresso], [CLUBE.at(-1).id, null, 1]);
  // toda skin exclusiva aponta para um nível que existe, e só ele (ou acima) libera
  for (const s of catalog.skins.filter((s) => s.nivel)) {
    const n = CLUBE.find((c) => c.id === s.nivel);
    assert.ok(n, s.id);
    assert.equal(exigido(s, n.rendimentos - 1).liberada, false);
    assert.equal(exigido(s, n.rendimentos).liberada, true);
  }
  assert.equal(exigido({ id: "x" }, 0).liberada, true);
});

test("corridas até os juros somarem o nível: parado nunca, investindo mais chega antes", () => {
  assert.equal(runsToYield(1000, 100_000, 0, 0), Infinity);
  assert.equal(runsToYield(0, 0, 0, 0), 0);
  assert.equal(runsToYield(1000, 100_000, 0, 0.01), 1);
  assert.ok(runsToYield(50_000, 100_000, 50_000, 0.01) < runsToYield(50_000, 100_000, 0, 0.01));
});
