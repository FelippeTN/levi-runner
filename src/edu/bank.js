// Contas do Banco do Levi para exibir (projeção e "faltam N corridas"). Quem guarda o dinheiro de
// verdade é o server.py, que busca a Selic no Banco Central e manda as taxas em vigor.

import catalog from "./catalog.json" with { type: "json" };

const B = catalog.banco;
export const LOCK_MONTHS = B.carencia;

/** Taxa % ao ano → fração ao mês equivalente (a mesma conta do `mensal` do server.py). */
export const monthly = (perYear) => (1 + perYear / 100) ** (1 / 12) - 1;

/**
 * Taxas em vigor. `selic` e `ipca` em % ao ano; `cofrinho` e `investimento` em fração por corrida (1 corrida = 1 mês).
 * Começa na reserva do catálogo (jogo sem servidor) e é trocada por `setRates` quando o servidor responde.
 */
export const RATES = {
  conta: 0,
  selic: B.selicReserva,
  ipca: B.ipcaReserva,
  cofrinho: monthly(B.selicReserva) * B.pctSelicCofrinho,
  investimento: monthly(B.selicReserva) * B.pctSelicInvestimento,
  consultado: B.reservaData,
  ao_vivo: false,
};

/** @param {Partial<typeof RATES> | undefined} taxas resposta de /api/taxas */
export const setRates = (taxas) => Object.assign(RATES, taxas);

/** Poupança por mês, regra real sem a TR: 0,5% com a Selic acima de 8,5% ao ano; senão 70% da Selic. */
export const poupanca = (selic) => (selic > 8.5 ? 0.005 : monthly(selic * 0.7));

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
