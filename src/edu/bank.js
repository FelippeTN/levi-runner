// Contas do Banco do Levi para exibir (projeção e "faltam N corridas"). Quem guarda o dinheiro de
// verdade é o server.py, que busca a Selic no Banco Central e manda as taxas em vigor.

import catalog from "./catalog.json" with { type: "json" };

const B = catalog.banco;
export const LOCK_MONTHS = B.carencia;

/** Taxa % ao ano → fração ao mês equivalente (a mesma conta do `mensal` do server.py). */
export const monthly = (perYear) => (1 + perYear / 100) ** (1 / 12) - 1;

/** Fração ao mês → taxa % ao ano (o `anual` do server.py). */
export const yearly = (perMonth) => ((1 + perMonth) ** 12 - 1) * 100;

/** Prefixado em % ao ano: a fatia da Selic que o pós paga, sobre a Selic que o mercado espera, mais o prêmio. */
export const prefixadoAA = (selicEsperada) => yearly(monthly(selicEsperada) * B.pctSelicInvestimento) + B.premioPrefixado;

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
  selic_esperada: B.selicEsperadaReserva,
  focus_consultado: B.reservaData,
  prefixado_aa: prefixadoAA(B.selicEsperadaReserva),
  prefixado: monthly(prefixadoAA(B.selicEsperadaReserva)),
  ipca_mensal: monthly(B.ipcaReserva),
  ipca_real_aa: B.jurosRealIpca,
  ipca_real: monthly(B.jurosRealIpca),
  consultado: B.reservaData,
  ao_vivo: false,
};

/** @param {Partial<typeof RATES> | undefined} taxas resposta de /api/taxas */
export const setRates = (taxas) => Object.assign(RATES, taxas);

/** Cofrinho por mês com a Selic (% ao ano) daquele mês. */
export const cofrinhoRate = (selic) => monthly(selic) * B.pctSelicCofrinho;

/** Poupança por mês, regra real sem a TR: 0,5% com a Selic acima de 8,5% ao ano; senão 70% da Selic. */
export const poupanca = (selic) => (selic > 8.5 ? 0.005 : monthly(selic * 0.7));

/** Saldo mês a mês (índice 0 = hoje) com a taxa de cada mês: `rates[0]` rende do mês 0 para o 1. */
export function projectRates(balance, rates) {
  const out = [balance];
  rates.forEach((r, m) => out.push(out[m] * (1 + r)));
  return out;
}

/** Saldo mês a mês (índice 0 = hoje) com juros compostos a uma taxa fixa. */
export const project = (balance, rate, months) => projectRates(balance, Array(months).fill(rate));

/**
 * Os tipos de investimento. `rate(selic)` é a taxa de um mês com a Selic (% ao ano) daquele mês: assim o simulador
 * mostra o que acontece se a Selic mudar. `liquido`: dá para vender antes do vencimento, a preço de mercado.
 */
export const TIPOS = {
  pos: {
    nome: "Pós-fixado",
    selo: "PÓS",
    prazo: B.carencia,
    liquido: false,
    regra: () => `${Math.round(B.pctSelicInvestimento * 100)}% da Selic (${aa(yearly(RATES.investimento))} ao ano hoje)`,
    rate: (selic) => monthly(selic) * B.pctSelicInvestimento,
  },
  pre: {
    nome: "Prefixado",
    selo: "PRÉ",
    prazo: B.prazoPrefixado,
    liquido: true,
    regra: () => `${aa(RATES.prefixado_aa)} ao ano, travado hoje`,
    rate: () => RATES.prefixado,
  },
  ipca: {
    nome: "IPCA+",
    selo: "IPCA+",
    prazo: B.prazoIpca,
    liquido: true,
    regra: () => `inflação + ${aa(RATES.ipca_real_aa)} ao ano`,
    rate: () => (1 + RATES.ipca_mensal) * (1 + RATES.ipca_real) - 1,
  },
};

/** 18.196 → "18,2%" */
export const aa = (pct) => `${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/**
 * Preço de venda antes do vencimento (o `marcacao` do server.py): o que o título paga no fim, descontado pela taxa
 * que o mercado pede hoje. No IPCA+ passe as taxas reais: a inflação se cancela.
 */
export const marcacao = (valor, contratada, hoje, meses) => Math.round(valor * ((1 + contratada) / (1 + hoje)) ** Math.max(0, meses));

/** Taxa de hoje para o tipo da aplicação, a que `marcacao` usa como desconto. */
export const taxaHoje = (tipo) => (tipo === "pre" ? RATES.prefixado : RATES.ipca_real);

/** Selic de cada mês num cenário: anda em linha reta de `selic` até `selic + delta`, como o Copom faz aos poucos. */
export const selicPath = (selic, delta, months) =>
  Array.from({ length: months }, (_, m) => Math.max(0, selic + (delta * (m + 1)) / months));

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
