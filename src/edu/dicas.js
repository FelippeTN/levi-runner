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
    quando: () => true,
    texto: () => "Passe pelo portal POUPAR antes de arriscar: a reserva vira sua vida extra.",
  },
];

/** @param {import("./economy.js").Wallet["ledger"]} ledger */
export function pickTip(ledger) {
  return DICAS.find((d) => d.quando(ledger)).texto(ledger);
}
