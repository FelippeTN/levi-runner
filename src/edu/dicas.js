// "Dica do Levi" no fim da corrida. Arquivo de conteúdo: a equipe do PGE Educa pode revisar e
// reescrever os textos sem mexer em mais nada. Números do mundo real só com fonte oficial.

import { brl } from "./economy.js";

/** Em ordem de prioridade: vale a primeira cujo `quando` combina com a corrida. */
export const DICAS = [
  {
    quando: (l) => l.apostas > 0,
    texto: (l) =>
      `A aposta levou ${brl(l.apostas)} seu hoje. Em aposta, as regras são feitas para a casa lucrar no longo prazo: quem joga sempre, perde sempre.`,
  },
  {
    quando: (l) => l.jurosCartao >= 1,
    texto: (l) =>
      `Você comprou no cartão sem ter o dinheiro e pagou ${brl(l.jurosCartao)} só de juros. Juro de dívida corre mais rápido que o de qualquer investimento: primeiro junte, depois compre.`,
  },
  {
    quando: (l) => l.batidaSemReserva && !l.poupou,
    texto: () => "Você bateu sem reserva. Guardar um pouco de tudo que entra é o que impede um imprevisto de virar dívida.",
  },
  {
    quando: (l) => l.reservaUsada > 0,
    texto: (l) =>
      `Sua reserva te salvou ${l.reservaUsada}× hoje. Na vida real, reserva de emergência é o dinheiro guardado para o celular que quebra ou a conta que aparece do nada.`,
  },
  {
    quando: (l) => l.investiu,
    texto: (l) =>
      `Você ganhou ${brl(l.juros)} só de deixar o dinheiro investido. São juros sobre juros: quanto mais cedo começa, mais rende.`,
  },
  {
    quando: (l) => l.compras > 0,
    texto: () => "Comprar é bom quando cabe no bolso e foi planejado. Antes de gastar, pergunte: eu preciso ou só quero agora?",
  },
  {
    quando: (l) => l.poupou,
    texto: () =>
      "O que sobra da corrida vai para a sua conta, onde fica parado. No cofrinho do Banco do Levi ele rende a Selic, a taxa básica de juros do Brasil.",
  },
  {
    quando: () => true,
    texto: () => "Dinheiro parado na conta não rende. Entre uma corrida e outra, guarde no cofrinho do Banco do Levi.",
  },
];

/** @param {import("./economy.js").Wallet["ledger"]} ledger */
export function pickTip(ledger) {
  return DICAS.find((d) => d.quando(ledger)).texto(ledger);
}

// ---------- Textos do Banco do Levi ----------

export const SELIC_EXPLICA =
  "A Selic é a taxa básica de juros do Brasil. Quem decide é o Copom, um comitê do Banco Central que se reúne a cada 45 dias, mais ou menos. " +
  "Quando a Selic sobe, guardar dinheiro rende mais e pegar emprestado fica mais caro; quando cai, acontece o contrário. " +
  "Por isso o cofrinho daqui rende o que a Selic estiver pagando hoje.";

/** 13.75 → "13,75" */
export const aoAno = (taxa) => taxa.toLocaleString("pt-BR", { minimumFractionDigits: 2 });

/** @param {number} de @param {number} para Selic em % ao ano @param {string} rende rendimento do cofrinho por corrida, já formatado */
export const selicMudou = (de, para, rende) =>
  `A Selic ${para > de ? "subiu" : "caiu"} de ${aoAno(de)}% para ${aoAno(para)}% ao ano. Seu cofrinho agora rende ${rende} por corrida.`;

/** @param {number} valor centavos @param {number} ipca % em 12 meses @param {number} meses */
export const inflacao = (valor, ipca, meses) =>
  `Em ${meses} corridas os preços sobem cerca de ${ipca.toLocaleString("pt-BR")}% (IPCA, a inflação oficial). ` +
  `${brl(valor)} parados na conta passam a comprar só o que ${brl(valor / (1 + ipca / 100))} compram hoje.`;
