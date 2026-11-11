// Dinheiro dentro da corrida: carteira, reserva (escudo), investimento (juros compostos), dívida no cartão.
// Tudo em centavos. Sem three nem DOM: roda nos testes.

import catalog from "./catalog.json" with { type: "json" };

const C = catalog.corrida;
export const COIN = catalog.moeda;
export const SHOCK = catalog.imprevisto;
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
/** centavos → "R$ 1.234" */
export const brl = (cents) => money.format(Math.round(cents) / 100);

export class Wallet {
  cash = 0;
  reserve = 0;
  /** com fração de centavo: os juros entram aos pouquinhos */
  invested = 0;
  /** comprou sem ter o dinheiro: cresce com juros altos até as moedas pagarem */
  debt = 0;
  ledger = { moedas: 0, juros: 0, jurosCartao: 0, compras: 0, apostas: 0, reservaUsada: 0, batidaSemReserva: false, investiu: false, poupou: false };
  #pendingInterest = 0;

  /** Pegou uma moeda: com dívida, ela paga a fatura antes de entrar na carteira. */
  collect() {
    const pay = Math.min(this.debt, COIN);
    this.debt -= pay;
    this.cash += COIN - pay;
    this.ledger.moedas += COIN;
  }

  /** Juros compostos por `meters` corridos: a dívida do cartão cresce, o investido rende; devolve o ganho do investido. */
  tick(meters) {
    if (meters <= 0) return 0;
    const fee = this.debt * ((1 + C.jurosCartaoPor100m) ** (meters / 100) - 1);
    this.debt += fee;
    this.ledger.jurosCartao += fee;
    if (this.invested <= 0) return 0;
    const gain = this.invested * ((1 + C.jurosPor100m) ** (meters / 100) - 1);
    this.invested += gain;
    this.ledger.juros += gain;
    this.#pendingInterest += gain;
    return gain;
  }

  /** Juros acumulados desde o último aviso, se já passaram de `min` centavos (para o "+R$ X" não piscar a cada quadro). */
  takeInterest(min = 100) {
    if (this.#pendingInterest < min) return 0;
    const v = this.#pendingInterest;
    this.#pendingInterest = 0;
    return v;
  }

  /** Bateu: a reserva paga o imprevisto e o Levi segue. */
  absorbCrash() {
    if (this.reserve >= SHOCK) {
      this.reserve -= SHOCK;
      this.ledger.reservaUsada++;
      return true;
    }
    this.ledger.batidaSemReserva = true;
    return false;
  }

  get total() {
    return Math.round(this.cash + this.reserve + this.invested - this.debt);
  }
}
