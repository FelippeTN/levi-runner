// Contas do Banco do Levi para exibir (projeção e "faltam N corridas"). Quem guarda o dinheiro de
// verdade é o server.py, com as mesmas taxas do catálogo.

import catalog from "./catalog.json" with { type: "json" };

export const RATES = { conta: 0, cofrinho: catalog.banco.cofrinho, investimento: catalog.banco.investimento };
export const LOCK_MONTHS = catalog.banco.carencia;

/** Saldo mês a mês (índice 0 = hoje) com juros compostos. */
export function project(balance, rate, months) {
  const out = [balance];
  for (let m = 1; m <= months; m++) out.push(out[m - 1] * (1 + rate));
  return out;
}

/** "~1 corrida", "~7 corridas", "muitas corridas" */
export const runsText = (n) => (n === Infinity ? "muitas corridas" : `~${n} corrida${n === 1 ? "" : "s"}`);

/**
 * Corridas até juntar `goal`, guardando `perRun` a cada corrida num lugar que rende `rate` por mês.
 * @returns {number} Infinity se não chega em 999 corridas
 */
export function runsUntil(goal, balance, perRun, rate) {
  let saved = balance;
  for (let n = 0; n < 999; n++) {
    if (saved >= goal) return n;
    saved = saved * (1 + rate) + perRun;
  }
  return Infinity;
}
